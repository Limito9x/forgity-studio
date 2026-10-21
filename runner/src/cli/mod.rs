pub mod clean;
pub mod daemon;
pub mod doctor;
pub mod env;
pub mod register;
pub mod setup;
pub mod start;
pub mod update;

use clap::{Parser, Subcommand};
use std::path::PathBuf;

#[derive(Parser, Debug)]
#[command(
    name = "forgity-runner",
    version = env!("FORGITY_RUNNER_VERSION"),
    about = "Forgity Studio Native Runner Daemon — High Performance 3D Automation Engine",
    long_about = "Forgity Studio Native Runner Daemon executes headless 3D pipelines directly on your workstation GPU with Blender and Unreal Engine."
)]
pub struct Cli {
    /// Custom path to runner configuration TOML file
    #[arg(short, long, global = true, env = "FORGITY_CONFIG")]
    pub config: Option<PathBuf>,

    #[command(subcommand)]
    pub command: Commands,
}

#[derive(Subcommand, Debug)]
pub enum Commands {
    /// Inspect local machine environment and scan for installed Blender & Unreal Engine versions
    Doctor,

    /// Register this workstation runner with the Forgity Studio API
    Register {
        /// Setup token generated from Forgity Studio Web Dashboard
        #[arg(short, long, env = "FORGITY_SETUP_TOKEN")]
        token: Option<String>,

        /// API endpoint URL
        #[arg(long, default_value = "http://localhost:5189", env = "FORGITY_API_URL")]
        api_url: String,

        /// Save runner configuration locally to ./runner.toml in current directory (for local dev/testing)
        #[arg(short, long)]
        local: bool,
    },

    /// Start the runner daemon in background worker mode
    Start {
        /// Override log level (trace, debug, info, warn, error)
        #[arg(long, default_value = "info", env = "FORGITY_LOG_LEVEL")]
        log_level: String,

        /// Force loading local ./runner.toml from current working directory
        #[arg(short, long)]
        local: bool,
    },

    /// Manage the background runner daemon (install, uninstall, start, stop, restart, status)
    Daemon {
        #[command(subcommand)]
        action: daemon::DaemonAction,
    },

    /// Clean local asset cache and temporary pipeline artifacts
    Clean {
        /// Purge all cached assets and scripts in addition to temp files
        #[arg(short, long)]
        all: bool,

        /// Delete log files older than this number of days
        #[arg(short, long, default_value = "7")]
        days: u64,
    },

    /// Manage custom environment variables for pipeline subprocesses
    Env {
        #[command(subcommand)]
        action: env::EnvAction,
    },

    /// Install runner binaries globally into %LOCALAPPDATA%\Forgity\bin and configure Windows PATH
    Setup,

    /// Self-update runner daemon and CLI to the latest GitHub release
    Update {
        /// Only check if an update is available without downloading or installing
        #[arg(short, long)]
        check: bool,

        /// Force reinstall even if already on the latest version
        #[arg(short, long)]
        force: bool,
    },
}
