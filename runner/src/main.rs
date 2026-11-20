pub mod cli;
pub mod config;
pub mod core;
pub mod grpc;
pub mod ipc;
pub mod process;
pub mod queue;
pub mod storage;
pub mod system;

use clap::Parser;
use cli::{Cli, Commands};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let cli = Cli::parse();
    let config_override = cli.config.as_deref();

    // If running in MCP mode or JSON-stdout modes, avoid polluting stdout
    let suppress_stdout_logs = matches!(
        cli.command,
        Commands::Mcp { .. }
            | Commands::Worker
            | Commands::RunBundle { json_events: true, .. }
            | Commands::Workspace {
                action: cli::workspace::WorkspaceAction::Run { json_events: true, .. }
                    | cli::workspace::WorkspaceAction::Validate { json: true, .. }
                    | cli::workspace::WorkspaceAction::Contract { json: true }
                    | cli::workspace::WorkspaceAction::List { json: true, .. }
                    | cli::workspace::WorkspaceAction::Bundle { out: None, .. }
            }
    );
    if !suppress_stdout_logs {
        tracing_subscriber::fmt()
            .with_env_filter(
                tracing_subscriber::EnvFilter::try_from_default_env()
                    .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
            )
            .with_target(false)
            .init();
    } else {
        tracing_subscriber::fmt()
            .with_writer(std::io::stderr)
            .with_env_filter(
                tracing_subscriber::EnvFilter::try_from_default_env()
                    .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("error")),
            )
            .with_target(false)
            .init();
    }

    match cli.command {
        Commands::Doctor => {
            cli::doctor::run_doctor();
        }
        Commands::Register { .. } | Commands::Start { .. } | Commands::Daemon { .. } => {
            anyhow::bail!("Remote RabbitMQ/gRPC daemon mode has been closed (ADR-011). Use `run-bundle` for local-first execution.");
        }
        Commands::Dcc { action } => {
            cli::dcc::run_dcc(action)?;
        }
        Commands::Clean { all, days } => {
            cli::clean::run_clean(all, days).await?;
        }
        Commands::Env { action } => {
            cli::env::run_env(action, config_override).await?;
        }
        Commands::Setup => {
            cli::setup::run_setup().await?;
        }
        Commands::Update { check, force } => {
            cli::update::run_update(check, force).await?;
        }
        Commands::Run { file, project, report } => {
            cli::run::run_pipeline_file(&file, project.as_deref(), report.as_deref()).await?;
        }
        Commands::Mcp { workspace } => {
            cli::mcp::run_mcp_server(workspace).await?;
        }
        Commands::RunBundle {
            bundle,
            stdin,
            json_events,
            run_id,
        } => {
            cli::run_local::run_bundle(bundle, stdin, json_events, run_id, config_override)
                .await?;
        }
        Commands::Workspace { action } => {
            cli::workspace::run_workspace(action, config_override).await?;
        }
        Commands::Worker => {
            cli::run_local::run_worker(config_override).await?;
        }
    }

    Ok(())
}
