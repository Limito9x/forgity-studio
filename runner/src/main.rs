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

    // If running in MCP mode or --json-events mode, avoid polluting stdout
    if !matches!(
        cli.command,
        Commands::Mcp { .. }
            | Commands::RunLocal { json_events: true, .. }
            | Commands::RunBundle { json_events: true, .. }
    ) {
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
        Commands::Register { token, api_url, local } => {
            cli::register::run_register(api_url, token, config_override, local).await?;
        }
        Commands::Start { log_level: _, local } => {
            cli::start::run_start(config_override, local).await?;
        }
        Commands::Daemon { action } => {
            cli::daemon::run_daemon(action, config_override).await?;
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
        Commands::RunLocal {
            workspace,
            pipeline,
            inputs_json,
            json_events,
            run_id,
        } => {
            cli::run_local::run_local_pipeline(
                workspace,
                pipeline,
                inputs_json,
                json_events,
                run_id,
                config_override,
            )
            .await?;
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
    }

    Ok(())
}
