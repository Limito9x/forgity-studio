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
    // Initialize tracing subscriber for clean console logs
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .with_target(false)
        .init();

    let cli = Cli::parse();
    let config_override = cli.config.as_deref();

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
        Commands::Clean { all, days } => {
            cli::clean::run_clean(all, days).await?;
        }
    }

    Ok(())
}
