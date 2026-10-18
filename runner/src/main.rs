pub mod cli;
pub mod grpc;

use clap::Parser;
use cli::{Cli, Commands};
use colored::Colorize;

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

    match cli.command {
        Commands::Doctor => {
            cli::doctor::run_doctor();
        }
        Commands::Register { token, api_url } => {
            println!("{}", "════════════════════════════════════════════════════════".cyan().bold());
            println!("   {} Registering Runner with Forgity Studio Backend...", "➤".green().bold());
            println!("   API URL: {}", api_url.white().bold());
            if let Some(t) = token {
                println!("   Token  : {}", format!("{}...", &t[..t.len().min(8)]).dimmed());
            } else {
                println!("   Token  : {}", "None provided (use --token <TOKEN>)".yellow());
            }
            println!("{}", "════════════════════════════════════════════════════════".cyan().bold());
            println!("{}", "\n[Phase 2 Ready] Runner handshake logic will connect to AgentService gRPC.".dimmed());
        }
        Commands::Start { log_level } => {
            println!("{}", "════════════════════════════════════════════════════════".cyan().bold());
            println!("   {} Starting Forgity Studio Runner Daemon (Level: {})...", "➤".green().bold(), log_level);
            println!("{}", "════════════════════════════════════════════════════════".cyan().bold());
            println!("{}", "\n[Phase 3 Ready] Daemon loop will connect to RabbitMQ and listen for stage jobs.".dimmed());
        }
        Commands::Clean => {
            println!("{}", "Cleaning cache and temp directories... [Phase 4 Ready]".yellow());
        }
    }

    Ok(())
}
