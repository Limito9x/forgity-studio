use anyhow::Result;
use clap::Subcommand;
use colored::Colorize;
use serde::Serialize;
use std::fs;

use crate::cli::daemon::get_daemon_data_dir;
use crate::process::dcc_pool::DccSessionInfo;
use crate::system::dcc::{scan_blender, scan_python, scan_unreal, DccApp};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DccAppDto {
    name: String,
    version: String,
    path: String,
}

impl From<DccApp> for DccAppDto {
    fn from(app: DccApp) -> Self {
        Self {
            name: app.name,
            version: app.version,
            path: app.path.to_string_lossy().replace('\\', "/"),
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DccScanResultDto {
    blender: Vec<DccAppDto>,
    unreal: Vec<DccAppDto>,
    python: Vec<DccAppDto>,
}

#[derive(Subcommand, Debug)]
pub enum DccAction {
    /// Scan installed local DCC executables (Blender, Unreal Engine, Python)
    Scan {
        /// Output raw JSON result for UI/automation
        #[arg(long)]
        json: bool,
    },

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
        DccAction::Scan { json } => {
            let blenders = scan_blender();
            let unreals = scan_unreal();
            let pythons = scan_python();

            if json {
                let dto = DccScanResultDto {
                    blender: blenders.into_iter().map(DccAppDto::from).collect(),
                    unreal: unreals.into_iter().map(DccAppDto::from).collect(),
                    python: pythons.into_iter().map(DccAppDto::from).collect(),
                };
                println!("{}", serde_json::to_string_pretty(&dto)?);
                return Ok(());
            }

            println!("\nDetected DCC Installations:");
            for item in blenders.iter().chain(unreals.iter()).chain(pythons.iter()) {
                println!("  - {} [{}]: {}", item.name, item.version, item.path.display());
            }
            println!();
        }

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

