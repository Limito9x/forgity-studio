pub mod doctor;

use clap::{Parser, Subcommand};

#[derive(Parser, Debug)]
#[command(
    name = "forgity-runner",
    version,
    about = "Forgity Studio Native Runner Daemon — High Performance 3D Automation Engine",
    long_about = "Forgity Studio Native Runner Daemon executes headless 3D pipelines directly on your workstation GPU with Blender and Unreal Engine."
)]
pub struct Cli {
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
    },

    /// Start the runner daemon in background worker mode
    Start {
        /// Override log level (trace, debug, info, warn, error)
        #[arg(long, default_value = "info", env = "FORGITY_LOG_LEVEL")]
        log_level: String,
    },

    /// Clean local asset cache and temporary pipeline artifacts
    Clean,
}
