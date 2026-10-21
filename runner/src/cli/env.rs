use std::path::Path;
use anyhow::{bail, Context, Result};
use clap::Subcommand;
use colored::Colorize;

use crate::config::{load_config, save_config};

#[derive(Subcommand, Debug)]
pub enum EnvAction {
    /// List all configured environment variables
    List {
        /// Output as raw JSON dictionary for automation and remote dashboards
        #[arg(long)]
        json: bool,
    },

    /// Get the value of a specific environment variable
    Get {
        /// Name of the environment variable (e.g. GEMINI_API_KEY)
        key: String,
    },

    /// Set an environment variable (stored in runner.toml [env])
    Set {
        /// Name of the environment variable
        key: String,
        /// Value to assign
        value: String,
    },

    /// Remove an environment variable
    Remove {
        /// Name of the environment variable to delete
        key: String,
    },
}

pub async fn run_env(action: EnvAction, config_override: Option<&Path>) -> Result<()> {
    let (mut config, source) = match load_config(config_override, false)? {
        (Some(cfg), src) => (cfg, src),
        (None, src) => {
            println!(
                "{} No runner configuration found at: {}",
                "ERROR:".red().bold(),
                src.path().display().to_string().yellow()
            );
            println!(
                "{} Run '{}' first to register this workstation.",
                "Tip:".yellow().bold(),
                "forgity-runner register --token <REGISTRATION_TOKEN>".cyan()
            );
            bail!("Unregistered runner");
        }
    };

    match action {
        EnvAction::List { json } => {
            if json {
                let map = config.env.clone().unwrap_or_default();
                let json_str = serde_json::to_string_pretty(&map)?;
                println!("{}", json_str);
                return Ok(());
            }

            println!("{}", "\n════════════════════════════════════════════════════════".cyan().bold());
            println!("{}", "   FORGITY STUDIO — RUNNER ENVIRONMENT VARIABLES".white().bold());
            println!("   Target Config: {} [{}]", source.path().display().to_string().cyan(), source.label().yellow());
            println!("{}", "════════════════════════════════════════════════════════\n".cyan().bold());

            let env_list = config.list_env();
            if env_list.is_empty() {
                println!("   No environment variables configured in [env].");
                println!(
                    "   {} Use '{}' to add one.\n",
                    "Tip:".yellow().bold(),
                    "forgity env set <KEY> <VALUE>".cyan()
                );
                return Ok(());
            }

            println!("   {} variable(s) found:\n", env_list.len().to_string().green().bold());
            for (k, v) in env_list {
                let masked_val = if k.contains("KEY") || k.contains("TOKEN") || k.contains("SECRET") || k.contains("PASSWORD") {
                    if v.len() > 8 {
                        format!("{}...{}", &v[..4], &v[v.len() - 4..])
                    } else {
                        "********".to_string()
                    }
                } else {
                    v.to_string()
                };
                println!("   • {:<24} = {}", k.cyan().bold(), masked_val.yellow());
            }
            println!();
        }

        EnvAction::Get { key } => {
            match config.get_env(&key) {
                Some(val) => {
                    println!("{}", val);
                }
                None => {
                    eprintln!(
                        "{} Environment variable '{}' not found in configuration.",
                        "ERROR:".red().bold(),
                        key.yellow()
                    );
                    bail!("Variable not found");
                }
            }
        }

        EnvAction::Set { key, value } => {
            let key_trimmed = key.trim().to_string();
            let value_trimmed = value.trim().to_string();

            if key_trimmed.is_empty() {
                bail!("Environment variable key cannot be empty");
            }

            config.set_env(key_trimmed.clone(), value_trimmed);

            let is_local = matches!(source, crate::config::ConfigSource::Local(_));
            save_config(&config, config_override, is_local)
                .context("Failed to save updated runner configuration")?;

            println!(
                "{} Environment variable '{}' successfully set and saved to {}",
                "✓".green().bold(),
                key_trimmed.cyan().bold(),
                source.path().display().to_string().yellow()
            );
        }

        EnvAction::Remove { key } => {
            let key_trimmed = key.trim();
            match config.remove_env(key_trimmed) {
                Some(_) => {
                    let is_local = matches!(source, crate::config::ConfigSource::Local(_));
                    save_config(&config, config_override, is_local)
                        .context("Failed to save updated runner configuration")?;

                    println!(
                        "{} Environment variable '{}' successfully removed.",
                        "✓".green().bold(),
                        key_trimmed.cyan().bold()
                    );
                }
                None => {
                    println!(
                        "{} Environment variable '{}' did not exist in configuration.",
                        "Notice:".yellow().bold(),
                        key_trimmed.cyan()
                    );
                }
            }
        }
    }

    Ok(())
}
