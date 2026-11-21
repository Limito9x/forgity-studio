use anyhow::{Context, Result};
use serde::Deserialize;
use serde_json::Value;
use tokio::io::{AsyncBufReadExt, BufReader as TokioBufReader};
use tokio::sync::Mutex as TokioMutex;
use std::collections::HashMap;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Instant;
use tokio_util::sync::CancellationToken;

use crate::config::load_config;
use crate::core::bundle::{BundleResourceResolver, CloudTemplateResourceResolver, ExecutionBundle};
use crate::core::component_orchestrator::ComponentOrchestrator;
use crate::core::dag::DagPipelineDocument;
use crate::core::dispatcher::StageDispatcher;
use crate::core::master_orchestrator::MasterOrchestrator;
use crate::core::traits::{
    EventSink, ResourceResolver, RunnerExecutionEvent, StdoutJsonEventSink, UnlimitedQuotaGate,
};
use crate::process::active_stage::ActiveStageManager;
use crate::process::dcc_pool::DccPool;

pub(crate) fn parse_and_validate_bundle(raw_json: &str) -> Result<ExecutionBundle> {
    let bundle: ExecutionBundle = serde_json::from_str(raw_json)
        .context("Failed to deserialize ExecutionBundle JSON")?;
    if bundle.bundle_version < 2 {
        anyhow::bail!(
            "Unsupported ExecutionBundle version {}: Runner requires bundleVersion >= 2",
            bundle.bundle_version
        );
    }
    Ok(bundle)
}

/// Chạy pipeline trực tiếp từ ExecutionBundle DTO (nhận từ Tauri Client qua stdin hoặc file JSON).
/// Runner hoàn toàn không động vào workspace.db ở chế độ này.
pub async fn run_bundle(
    bundle_path: Option<PathBuf>,
    from_stdin: bool,
    json_events: bool,
    run_id_override: Option<String>,
    config_override: Option<&Path>,
) -> Result<()> {
    let raw_json = if from_stdin || bundle_path.is_none() {
        let mut buf = String::new();
        std::io::stdin()
            .read_to_string(&mut buf)
            .context("Failed to read ExecutionBundle JSON from stdin")?;
        buf
    } else {
        let path = bundle_path.unwrap();
        std::fs::read_to_string(&path)
            .with_context(|| format!("Failed to read ExecutionBundle JSON at {:?}", path))?
    };

    let bundle = parse_and_validate_bundle(&raw_json)?;
    run_parsed_bundle(bundle, json_events, run_id_override, config_override).await
}

fn build_resolver_for_bundle(
    bundle: &ExecutionBundle,
    config_override: Option<&Path>,
) -> Arc<dyn ResourceResolver> {
    let runner_cfg = load_config(config_override, false).ok().and_then(|(c, _)| c);
    let default_api_url = std::env::var("FORGITY_API_URL")
        .ok()
        .filter(|u| !u.trim().is_empty())
        .or_else(|| {
            runner_cfg
                .as_ref()
                .map(|c| c.api_url.clone())
                .filter(|u| !u.trim().is_empty())
        })
        .unwrap_or_else(|| "http://localhost:5189".to_string());
    let default_machine_key = runner_cfg
        .as_ref()
        .map(|c| c.machine_key.clone())
        .filter(|k| !k.trim().is_empty())
        .unwrap_or_else(crate::system::hardware::get_permanent_machine_key);

    let has_valid_cloud_lease = bundle
        .cloud_lease
        .as_ref()
        .is_some_and(|l| !l.template_view_id.trim().is_empty());

    if has_valid_cloud_lease {
        let mut lease = bundle.cloud_lease.clone().unwrap_or_else(|| crate::core::bundle::CloudLeaseConfig {
            api_url: None,
            template_view_id: String::new(),
            pipeline_version_id: String::new(),
            machine_key: default_machine_key.clone(),
            lease_token: None,
        });
        if lease.machine_key.trim().is_empty() {
            lease.machine_key = default_machine_key;
        }
        let env_api_url = std::env::var("FORGITY_API_URL").ok().filter(|u| !u.trim().is_empty());
        let api_url = env_api_url
            .or_else(|| lease.api_url.clone())
            .unwrap_or(default_api_url);
        Arc::new(CloudTemplateResourceResolver::from_bundle(bundle, api_url, lease))
    } else {
        Arc::new(BundleResourceResolver::from_bundle(bundle))
    }
}

pub async fn run_parsed_bundle(
    bundle: ExecutionBundle,
    json_events: bool,
    run_id_override: Option<String>,
    config_override: Option<&Path>,
) -> Result<()> {
    let is_component = bundle.pipeline_kind.eq_ignore_ascii_case("component");
    let run_id = run_id_override
        .or_else(|| bundle.run_id.clone())
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());

    let resolver = build_resolver_for_bundle(&bundle, config_override);

    let active_stages = Arc::new(ActiveStageManager::new());
    let dcc_pool = Arc::new(DccPool::new(crate::cli::daemon::get_daemon_data_dir()));
    let cancel = CancellationToken::new();
    let cancel_ctrl_c = cancel.clone();
    tokio::spawn(async move {
        if tokio::signal::ctrl_c().await.is_ok() {
            cancel_ctrl_c.cancel();
        }
    });

    execute_with_resolver_and_pool(
        bundle.root_pipeline,
        is_component,
        run_id,
        bundle.runtime_inputs,
        resolver,
        json_events,
        config_override,
        active_stages,
        dcc_pool,
        cancel,
    )
    .await
}

async fn execute_with_resolver_and_pool(
    doc: DagPipelineDocument,
    is_component: bool,
    run_id: String,
    runtime_inputs: HashMap<String, Value>,
    resolver: Arc<dyn ResourceResolver>,
    json_events: bool,
    config_override: Option<&Path>,
    active_stages: Arc<ActiveStageManager>,
    dcc_pool: Arc<DccPool>,
    cancel: CancellationToken,
) -> Result<()> {
    let started_at = Instant::now();
    let pipeline_kind = if is_component { "component" } else { "master" }.to_string();

    let custom_env = load_config(config_override, false)
        .ok()
        .and_then(|(cfg, _)| cfg)
        .and_then(|cfg| cfg.env);
    let event_sink: Arc<dyn EventSink> = Arc::new(StdoutJsonEventSink::new(json_events));
    let dispatcher = Arc::new(StageDispatcher::new(
        event_sink.clone(),
        active_stages,
        dcc_pool,
        custom_env,
    ));
    let quota_gate = Arc::new(UnlimitedQuotaGate);

    let component_orch = Arc::new(ComponentOrchestrator::new(
        dispatcher,
        resolver.clone(),
        event_sink.clone(),
        quota_gate,
    ));

    let _ = event_sink
        .emit_pipeline_event(RunnerExecutionEvent::RunStarted {
            run_id: run_id.clone(),
            pipeline_id: doc.name.clone(),
            pipeline_kind: pipeline_kind.clone(),
        })
        .await;

    let exec_result = if is_component {
        component_orch
            .execute(Arc::new(doc.clone()), run_id.clone(), runtime_inputs, None, cancel)
            .await
    } else {
        let master_orch = MasterOrchestrator::new(component_orch, resolver, event_sink.clone());
        master_orch.execute(&doc, &run_id, runtime_inputs, cancel).await
    };

    let duration_ms = started_at.elapsed().as_millis() as u64;

    match exec_result {
        Ok(outputs) => {
            let _ = event_sink
                .emit_pipeline_event(RunnerExecutionEvent::RunCompleted {
                    run_id: run_id.clone(),
                    pipeline_id: doc.name.clone(),
                    succeeded: true,
                    outputs: Some(outputs.clone()),
                    error_message: None,
                    duration_ms,
                })
                .await;

            if !json_events {
                println!(
                    "Pipeline '{}' ({}) succeeded in {}ms. Outputs: {}",
                    doc.name,
                    pipeline_kind,
                    duration_ms,
                    serde_json::to_string_pretty(&outputs).unwrap_or_default()
                );
            }
            Ok(())
        }
            Err(err) => {
            let err_msg = err.to_string();
            let _ = event_sink
                .emit_pipeline_event(RunnerExecutionEvent::RunCompleted {
                    run_id: run_id.clone(),
                    pipeline_id: doc.name.clone(),
                    succeeded: false,
                    outputs: None,
                    error_message: Some(err_msg.clone()),
                    duration_ms,
                })
                .await;

            Err(err)
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(tag = "cmd", rename_all = "snake_case")]
enum WorkerCommand {
    RunBundle {
        run_id: Option<String>,
        bundle: Value,
        uproject_path: Option<String>,
    },
    CancelRun {
        run_id: String,
    },
    ListDccSessions,
    StopDccSession {
        key: Option<String>,
        all: Option<bool>,
    },
}

fn emit_dcc_sessions_snapshot(sessions: Vec<crate::process::dcc_pool::DccSessionInfo>) {
    let payload = serde_json::json!({
        "type": "dcc_sessions",
        "sessions": sessions,
    });
    if let Ok(line) = serde_json::to_string(&payload) {
        println!("{}", line);
    }
}

/// Persistent sidecar worker mode: keeps DccPool warm across multiple pipeline runs.
pub async fn run_worker(config_override: Option<&Path>) -> Result<()> {
    let data_dir = crate::cli::daemon::get_daemon_data_dir();
    let _ = std::fs::write(data_dir.join("dcc-sessions.json"), "[]");
    let dcc_pool = Arc::new(DccPool::new(data_dir));
    let active_stages = Arc::new(ActiveStageManager::new());
    let cancels: Arc<TokioMutex<HashMap<String, CancellationToken>>> =
        Arc::new(TokioMutex::new(HashMap::new()));
    let config_owned = config_override.map(|p| p.to_path_buf());

    let stdin = TokioBufReader::new(tokio::io::stdin());
    let mut lines = stdin.lines();

    while let Ok(Some(line)) = lines.next_line().await {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let cmd: WorkerCommand = match serde_json::from_str(trimmed) {
            Ok(c) => c,
            Err(e) => {
                tracing::error!("[Worker] Invalid command JSON: {}", e);
                continue;
            }
        };

        match cmd {
            WorkerCommand::RunBundle {
                run_id,
                bundle,
                uproject_path,
            } => {
                if let Some(up) = uproject_path.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
                    unsafe {
                        std::env::set_var("FORGITY_UPROJECT_PATH", up);
                    }
                } else {
                    unsafe {
                        std::env::remove_var("FORGITY_UPROJECT_PATH");
                    }
                }
                let parsed: ExecutionBundle = match serde_json::from_value(bundle) {
                    Ok(b) => b,
                    Err(e) => {
                        let rid = run_id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
                        let err_ev = serde_json::json!({
                            "type": "run_completed",
                            "run_id": rid,
                            "pipeline_id": "",
                            "succeeded": false,
                            "error_message": format!("Invalid ExecutionBundle JSON: {}", e),
                            "duration_ms": 0
                        });
                        println!("{}", err_ev);
                        continue;
                    }
                };
                let eff_run_id = run_id
                    .or_else(|| parsed.run_id.clone())
                    .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
                let is_component = parsed.pipeline_kind.eq_ignore_ascii_case("component");
                let resolver = build_resolver_for_bundle(&parsed, config_owned.as_deref());
                let cancel = CancellationToken::new();
                {
                    let mut guard = cancels.lock().await;
                    guard.insert(eff_run_id.clone(), cancel.clone());
                }

                let pool_ref = Arc::clone(&dcc_pool);
                let stages_ref = Arc::clone(&active_stages);
                let cancels_ref = Arc::clone(&cancels);
                let cfg_ref = config_owned.clone();
                let rid_clone = eff_run_id.clone();

                tokio::spawn(async move {
                    let _ = execute_with_resolver_and_pool(
                        parsed.root_pipeline,
                        is_component,
                        rid_clone.clone(),
                        parsed.runtime_inputs,
                        resolver,
                        true,
                        cfg_ref.as_deref(),
                        stages_ref,
                        pool_ref.clone(),
                        cancel,
                    )
                    .await;

                    {
                        let mut guard = cancels_ref.lock().await;
                        guard.remove(&rid_clone);
                    }
                    emit_dcc_sessions_snapshot(pool_ref.list().await);
                });
            }
            WorkerCommand::CancelRun { run_id } => {
                let token = {
                    let mut guard = cancels.lock().await;
                    guard.remove(&run_id)
                };
                if let Some(t) = token {
                    t.cancel();
                }
            }
            WorkerCommand::ListDccSessions => {
                emit_dcc_sessions_snapshot(dcc_pool.list().await);
            }
            WorkerCommand::StopDccSession { key, all } => {
                if all.unwrap_or(false) {
                    dcc_pool.stop_all().await;
                } else if let Some(k) = key {
                    dcc_pool.stop(&k).await;
                }
                emit_dcc_sessions_snapshot(dcc_pool.list().await);
            }
        }
    }

    // Stdin closed (parent Tauri app exited): clean up all resident DCC processes
    dcc_pool.stop_all().await;
    Ok(())
}
