use anyhow::Context;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

pub const CONFIG_FILE_NAME: &str = "runner.toml";

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RabbitMqConfig {
    pub host: String,
    pub port: u16,
    pub username: String,
    pub password: String,
    pub virtual_host: String,
    #[serde(default)]
    pub tls: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct HardwareProfileConfig {
    pub os_platform: String,
    pub cpu_model: String,
    pub cpu_cores: usize,
    pub total_ram_bytes: u64,
    pub primary_gpu_name: String,
    pub primary_gpu_vram_bytes: u64,
    pub last_scanned_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RunnerConfig {
    pub api_url: String,
    pub runner_id: String,
    pub name: String,
    pub machine_key: String,
    pub registration_token: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub grpc_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rabbitmq: Option<RabbitMqConfig>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hardware_profile: Option<HardwareProfileConfig>,
}

pub fn get_default_config_path() -> PathBuf {
    // 1. Current working directory runner.toml takes precedence if it exists
    let cwd_path = PathBuf::from(CONFIG_FILE_NAME);
    if cwd_path.exists() {
        return cwd_path;
    }

    // 2. Fall back to %LOCALAPPDATA%/Forgity/runner.toml
    if let Some(data_dir) = dirs::data_local_dir() {
        let forgity_dir = data_dir.join("Forgity");
        let _ = std::fs::create_dir_all(&forgity_dir);
        return forgity_dir.join(CONFIG_FILE_NAME);
    }

    cwd_path
}

pub fn load_config() -> anyhow::Result<Option<RunnerConfig>> {
    let path = get_default_config_path();
    if !path.exists() {
        return Ok(None);
    }

    let content = std::fs::read_to_string(&path)
        .with_context(|| format!("Failed to read config from {}", path.display()))?;

    let config: RunnerConfig = toml::from_str(&content)
        .with_context(|| format!("Failed to parse TOML configuration from {}", path.display()))?;

    Ok(Some(config))
}

pub fn save_config(config: &RunnerConfig) -> anyhow::Result<PathBuf> {
    let path = get_default_config_path();

    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }

    let toml_string = toml::to_string_pretty(config)
        .context("Failed to serialize runner configuration to TOML")?;

    std::fs::write(&path, toml_string)
        .with_context(|| format!("Failed to write config to {}", path.display()))?;

    Ok(path)
}
