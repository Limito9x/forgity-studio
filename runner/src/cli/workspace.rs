use anyhow::{bail, Context, Result};
use clap::Subcommand;
use forgity_core::contracts::{
    get_pipeline_contract_spec, validate_pipeline_yaml, PaletteNodeSummary, ValidationSeverity,
};
use serde_json::Value;
use std::collections::HashMap;
use std::path::{Path, PathBuf};

#[derive(Subcommand, Debug)]
pub enum WorkspaceAction {
    /// Print the canonical Pipeline Contract Specification (Master vs Component rules)
    Contract {
        /// Output raw JSON
        #[arg(long)]
        json: bool,
    },

    /// List all .pipeline.yaml / .component.yaml files in a local workspace
    List {
        /// Path to the local workspace root (defaults to current directory)
        #[arg(short, long)]
        workspace: Option<PathBuf>,

        /// Output raw JSON
        #[arg(long)]
        json: bool,
    },

    /// Validate a .pipeline.yaml file against the canonical Pipeline Contract
    Validate {
        /// Path to the .pipeline.yaml / .component.yaml file
        file: PathBuf,

        /// Path to the local workspace root (used to load node contracts from workspace.db)
        #[arg(short, long)]
        workspace: Option<PathBuf>,

        /// Output raw JSON
        #[arg(long)]
        json: bool,
    },

    /// Build an ExecutionBundle v2 JSON from a .pipeline.yaml and local workspace
    Bundle {
        /// Path to the .pipeline.yaml / .component.yaml file
        file: PathBuf,

        /// Path to the local workspace root (defaults to current directory or auto-detected ancestor)
        #[arg(short, long)]
        workspace: Option<PathBuf>,

        /// Runtime inputs as a JSON object string (e.g. '{"character":"July"}')
        #[arg(short, long)]
        inputs: Option<String>,

        /// Optional file path to write the bundle JSON (prints to stdout if omitted)
        #[arg(short, long)]
        out: Option<PathBuf>,
    },

    /// Validate, build ExecutionBundle, and execute a local .pipeline.yaml directly (no UI needed)
    Run {
        /// Path to the .pipeline.yaml / .component.yaml file
        file: PathBuf,

        /// Path to the local workspace root (defaults to current directory or auto-detected ancestor)
        #[arg(short, long)]
        workspace: Option<PathBuf>,

        /// Runtime inputs as a JSON object string (e.g. '{"character":"July"}')
        #[arg(short, long)]
        inputs: Option<String>,

        /// Emit newline-delimited JSON RunnerExecutionEvent objects to stdout (logs go to stderr)
        #[arg(long)]
        json_events: bool,

        /// Optional explicit run ID override
        #[arg(long)]
        run_id: Option<String>,
    },
}

fn resolve_workspace_root(explicit: Option<&Path>, file_hint: Option<&Path>) -> Result<PathBuf> {
    if let Some(ws) = explicit {
        return Ok(ws.to_path_buf());
    }
    if let Some(file) = file_hint {
        let abs = if file.is_absolute() {
            file.to_path_buf()
        } else {
            std::env::current_dir()?.join(file)
        };
        for ancestor in abs.ancestors() {
            if ancestor.join(".forgity").join("workspace.db").is_file()
                || ancestor.join("forgity.workspace.json").is_file()
            {
                return Ok(ancestor.to_path_buf());
            }
        }
    }
    Ok(std::env::current_dir()?)
}

fn load_palette_lookup(workspace_root: &Path) -> Option<HashMap<String, PaletteNodeSummary>> {
    if !workspace_root.join(".forgity").join("workspace.db").is_file() {
        return None;
    }
    let items = forgity_core::node_contracts::load_workspace_node_contracts(
        workspace_root.to_string_lossy().to_string(),
    )
    .ok()?;

    let mut map = HashMap::new();
    for item in items {
        let key = item
            .get("key")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim()
            .to_ascii_lowercase();
        if key.is_empty() {
            continue;
        }
        let source = item
            .get("source")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let executor = item
            .get("executor")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let category = item
            .get("category")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let has_exec_pins = item
            .get("inputs")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter().any(|p| {
                    p.get("kind")
                        .and_then(|k| k.as_str())
                        .map(|k| k.eq_ignore_ascii_case("Exec"))
                        .unwrap_or(false)
                })
            })
            .unwrap_or(false);
        map.insert(
            key.clone(),
            PaletteNodeSummary {
                key,
                source,
                executor,
                category,
                has_exec_pins,
            },
        );
    }
    Some(map)
}

pub async fn run_workspace(action: WorkspaceAction, config_override: Option<&Path>) -> Result<()> {
    match action {
        WorkspaceAction::Contract { json } => {
            let spec = get_pipeline_contract_spec();
            if json {
                println!("{}", serde_json::to_string_pretty(&spec)?);
            } else {
                println!("Forgity Pipeline Contract v{}", spec.version);
                println!("  Master:    requires_executor={}, pure={}, components={}, raw_scripts={}",
                    spec.master.requires_executor,
                    spec.master.allow_pure_nodes,
                    spec.master.allow_component_nodes,
                    spec.master.allow_raw_script_nodes
                );
                println!("  Component: requires_executor={}, pure={}, components={}, raw_scripts={}",
                    spec.component.requires_executor,
                    spec.component.allow_pure_nodes,
                    spec.component.allow_component_nodes,
                    spec.component.allow_raw_script_nodes
                );
            }
        }
        WorkspaceAction::List { workspace, json } => {
            let ws_root = resolve_workspace_root(workspace.as_deref(), None)?;
            let items = forgity_core::pipeline::scan_local_pipeline_drafts(
                ws_root.to_string_lossy().to_string(),
            );
            if json {
                println!("{}", serde_json::to_string_pretty(&items)?);
            } else {
                for item in &items {
                    println!(
                        "[{}] {} (executor: {})",
                        item.pipeline_kind,
                        item.relative_path,
                        item.executor.as_deref().unwrap_or("-")
                    );
                }
            }
        }
        WorkspaceAction::Validate {
            file,
            workspace,
            json,
        } => {
            let ws_root = resolve_workspace_root(workspace.as_deref(), Some(&file))?;
            let content = std::fs::read_to_string(&file)
                .with_context(|| format!("Failed to read pipeline file {:?}", file))?;
            let lookup = load_palette_lookup(&ws_root);
            let path_hint = file.to_string_lossy().to_string();
            let report = validate_pipeline_yaml(&content, Some(&path_hint), lookup.as_ref());

            if json {
                println!("{}", serde_json::to_string_pretty(&report)?);
            } else {
                println!(
                    "Pipeline: {:?} (kind={}, executor={})",
                    file,
                    report.pipeline_kind.as_str(),
                    report.executor.as_deref().unwrap_or("-")
                );
                for issue in &report.issues {
                    let sev = match issue.severity {
                        ValidationSeverity::Error => "ERROR",
                        ValidationSeverity::Warning => "WARN ",
                    };
                    println!("  [{}] {}: {}", sev, issue.code, issue.message);
                }
                if report.valid {
                    println!("Validation PASSED.");
                }
            }

            if !report.valid {
                bail!("Pipeline contract validation failed");
            }
        }
        WorkspaceAction::Bundle {
            file,
            workspace,
            inputs,
            out,
        } => {
            let ws_root = resolve_workspace_root(workspace.as_deref(), Some(&file))?;
            let content = std::fs::read_to_string(&file)
                .with_context(|| format!("Failed to read pipeline file {:?}", file))?;
            let lookup = load_palette_lookup(&ws_root);
            let path_hint = file.to_string_lossy().to_string();
            let report = validate_pipeline_yaml(&content, Some(&path_hint), lookup.as_ref());
            if !report.valid {
                let errs: Vec<String> = report
                    .issues
                    .iter()
                    .filter(|i| i.severity == ValidationSeverity::Error)
                    .map(|i| format!("{}: {}", i.code, i.message))
                    .collect();
                bail!("Pipeline contract validation failed:\n{}", errs.join("\n"));
            }

            let runtime_inputs: HashMap<String, Value> = match inputs {
                Some(raw) => serde_json::from_str(&raw)
                    .context("Failed to parse --inputs as JSON object")?,
                None => HashMap::new(),
            };

            let run_id = format!("cli_{}", uuid::Uuid::new_v4());
            let bundle_val = forgity_core::bundle::build_execution_bundle(
                &ws_root,
                &run_id,
                &content,
                report.pipeline_kind.as_str(),
                runtime_inputs,
            )
            .map_err(|e| anyhow::anyhow!(e))?;

            let pretty = serde_json::to_string_pretty(&bundle_val)?;
            if let Some(out_path) = out {
                std::fs::write(&out_path, &pretty)?;
            } else {
                println!("{}", pretty);
            }
        }
        WorkspaceAction::Run {
            file,
            workspace,
            inputs,
            json_events,
            run_id,
        } => {
            let ws_root = resolve_workspace_root(workspace.as_deref(), Some(&file))?;
            let content = std::fs::read_to_string(&file)
                .with_context(|| format!("Failed to read pipeline file {:?}", file))?;
            let lookup = load_palette_lookup(&ws_root);
            let path_hint = file.to_string_lossy().to_string();
            let report = validate_pipeline_yaml(&content, Some(&path_hint), lookup.as_ref());
            if !report.valid {
                let errs: Vec<String> = report
                    .issues
                    .iter()
                    .filter(|i| i.severity == ValidationSeverity::Error)
                    .map(|i| format!("{}: {}", i.code, i.message))
                    .collect();
                bail!("Pipeline contract validation failed:\n{}", errs.join("\n"));
            }

            let runtime_inputs: HashMap<String, Value> = match inputs {
                Some(raw) => serde_json::from_str(&raw)
                    .context("Failed to parse --inputs as JSON object")?,
                None => HashMap::new(),
            };

            let eff_run_id = run_id
                .clone()
                .unwrap_or_else(|| format!("cli_{}", uuid::Uuid::new_v4()));
            let bundle_val = forgity_core::bundle::build_execution_bundle(
                &ws_root,
                &eff_run_id,
                &content,
                report.pipeline_kind.as_str(),
                runtime_inputs,
            )
            .map_err(|e| anyhow::anyhow!(e))?;

            let parsed_bundle = crate::cli::run_local::parse_and_validate_bundle(
                &serde_json::to_string(&bundle_val)?,
            )?;

            crate::cli::run_local::run_parsed_bundle(
                parsed_bundle,
                json_events,
                run_id,
                config_override,
            )
            .await?;
        }
    }

    Ok(())
}
