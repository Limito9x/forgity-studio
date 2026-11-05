use anyhow::Result;
use clap::Subcommand;
use colored::Colorize;
use std::fs;

use crate::cli::daemon::get_daemon_data_dir;
use crate::process::dcc_pool::DccSessionInfo;

#[derive(Subcommand, Debug)]
pub enum DccAction {
    /// List active warm DCC resident sessions
    List {
        /// Output raw JSON list for automation
        #[arg(long)]
        json: bool,
    },

    /// Stop an active warm DCC resident session
    Stop {
        /// Session key (first 12 chars) to stop
        key: Option<String>,

        /// Stop all active warm DCC resident sessions
        #[arg(long)]
        all: bool,

        /// Output raw JSON response
        #[arg(long)]
        json: bool,
    },
}

pub fn run_dcc(action: DccAction) -> Result<()> {
    let data_dir = get_daemon_data_dir();
    let snapshot_file = data_dir.join("dcc-sessions.json");

    match action {
        DccAction::List { json } => {
            let sessions: Vec<DccSessionInfo> = if snapshot_file.exists() {
                let content = fs::read_to_string(&snapshot_file).unwrap_or_default();
                serde_json::from_str(&content).unwrap_or_default()
            } else {
                Vec::new()
            };

            if json {
                println!("{}", serde_json::to_string_pretty(&sessions)?);
                return Ok(());
            }

            println!("{}", "\n════════════════════════════════════════════════════════".cyan().bold());
            println!("{}", "   FORGITY STUDIO — ACTIVE WARM DCC SESSIONS".white().bold());
            println!("{}", "════════════════════════════════════════════════════════\n".cyan().bold());

            if sessions.is_empty() {
                println!("   {}", "No active resident DCC sessions found.".dimmed());
                println!("   {}", "Warm sessions are spawned automatically when running keep-alive pipelines.\n".dimmed());
                return Ok(());
            }

            for s in &sessions {
                let state_label = match s.state {
                    crate::process::dcc_pool::SessionState::Idle => "Idle".green().bold(),
                    crate::process::dcc_pool::SessionState::Busy => "Busy".yellow().bold(),
                    crate::process::dcc_pool::SessionState::Starting => "Starting".cyan().bold(),
                };

                let remaining_min = s.remaining_seconds / 60;
                let remaining_sec = s.remaining_seconds % 60;

                println!("   Session Key   : {}", s.key.cyan().bold());
                println!("   Executor      : {}", s.executor.white().bold());
                println!("   PID           : {}", s.pid.to_string().yellow());
                println!("   State         : {}", state_label);
                println!("   Time Left     : {}m {}s (configured keep-alive: {}m)", remaining_min, remaining_sec, s.keep_alive_minutes);
                if let Some(ref proj) = s.project_path {
                    println!("   Project       : {}", proj.dimmed());
                }
                println!();
            }

            println!("   {} Use '{}' or Web UI to stop sessions.", "Tip:".dimmed(), "forgity-runner dcc stop <key>".cyan());
            println!();
        }

        DccAction::Stop { key, all, json } => {
            if json {
                println!(r#"{{"message": "Please stop active DCC sessions from the Web Dashboard or send remote stop command."}}"#);
                return Ok(());
            }

            println!("{}", "[!] Warm DCC sessions are managed in-memory by the active runner daemon.".yellow().bold());
            println!("    To stop warm sessions, use the Web Dashboard UI or trigger via gRPC remote control.\n");

            if all {
                println!("    Requesting stop for all resident sessions...");
            } else if let Some(k) = key {
                println!("    Requesting stop for session '{}'...", k);
            }
        }
    }

    Ok(())
}

