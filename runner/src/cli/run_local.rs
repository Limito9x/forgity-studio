use anyhow::{Context, Result};
use serde_json::Value;
use std::collections::HashMap;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Instant;
use tokio_util::sync::CancellationToken;

use crate::config::load_config;
use crate::core::bundle::{BundleResourceResolver, ExecutionBundle};
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

    let resolver: Arc<dyn ResourceResolver> = Arc::new(BundleResourceResolver::from_bundle(&bundle));

    execute_with_resolver(
        bundle.root_pipeline,
        is_component,
        run_id,
        bundle.runtime_inputs,
        resolver,
        json_events,
        config_override,
    )
    .await
}

async fn execute_with_resolver(
    doc: DagPipelineDocument,
    is_component: bool,
    run_id: String,
    runtime_inputs: HashMap<String, Value>,
    resolver: Arc<dyn ResourceResolver>,
    json_events: bool,
    config_override: Option<&Path>,
) -> Result<()> {
    let started_at = Instant::now();
    let pipeline_kind = if is_component { "component" } else { "master" }.to_string();

    let custom_env = load_config(config_override, false)
        .ok()
        .and_then(|(cfg, _)| cfg)
        .and_then(|cfg| cfg.env);
    let event_sink: Arc<dyn EventSink> = Arc::new(StdoutJsonEventSink::new(json_events));
    let active_stages = Arc::new(ActiveStageManager::new());
    let dcc_pool = Arc::new(DccPool::new(crate::cli::daemon::get_daemon_data_dir()));
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

    let cancel = CancellationToken::new();
    let cancel_ctrl_c = cancel.clone();
    tokio::spawn(async move {
        if tokio::signal::ctrl_c().await.is_ok() {
            cancel_ctrl_c.cancel();
        }
    });

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
