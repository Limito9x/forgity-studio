use anyhow::Context;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

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

pub fn get_global_config_path() -> PathBuf {
    if let Some(data_dir) = dirs::data_local_dir() {
        let forgity_dir = data_dir.join("Forgity");
        let _ = std::fs::create_dir_all(&forgity_dir);
        return forgity_dir.join(CONFIG_FILE_NAME);
    }
    PathBuf::from(CONFIG_FILE_NAME)
}

pub fn get_local_config_path() -> PathBuf {
    PathBuf::from(CONFIG_FILE_NAME)
}

#[derive(Debug, Clone)]
pub enum ConfigSource {
    Explicit(PathBuf),
    Local(PathBuf),
    Global(PathBuf),
}

impl ConfigSource {
    pub fn path(&self) -> &Path {
        match self {
            ConfigSource::Explicit(p) => p.as_path(),
            ConfigSource::Local(p) => p.as_path(),
            ConfigSource::Global(p) => p.as_path(),
        }
    }

    pub fn label(&self) -> &'static str {
        match self {
            ConfigSource::Explicit(_) => "Explicit Path",
            ConfigSource::Local(_) => "Local Directory (./runner.toml)",
            ConfigSource::Global(_) => "System Global (%LOCALAPPDATA%)",
        }
    }
}

pub fn resolve_config_source(custom_path: Option<&Path>, force_local: bool) -> ConfigSource {
    // 1. Explicit path parameter or FORGITY_CONFIG environment variable
    if let Some(p) = custom_path {
        return ConfigSource::Explicit(p.to_path_buf());
    }
    if let Ok(env_path) = std::env::var("FORGITY_CONFIG") {
        let trimmed = env_path.trim();
        if !trimmed.is_empty() {
            return ConfigSource::Explicit(PathBuf::from(trimmed));
        }
    }

    // 2. Local directory precedence: if force_local is requested OR ./runner.toml exists right in CWD
    let local_path = get_local_config_path();
    if force_local || local_path.exists() {
        return ConfigSource::Local(local_path);
    }

    // 3. Fallback to System Global AppData (Default for background daemon & server connection)
    ConfigSource::Global(get_global_config_path())
}

pub fn get_default_config_path() -> PathBuf {
    resolve_config_source(None, false).path().to_path_buf()
}

pub fn load_config(
    custom_path: Option<&Path>,
    force_local: bool,
) -> anyhow::Result<(Option<RunnerConfig>, ConfigSource)> {
    let source = resolve_config_source(custom_path, force_local);
    let path = source.path();

    if !path.exists() {
        return Ok((None, source));
    }

    let content = std::fs::read_to_string(path)
        .with_context(|| format!("Failed to read config from {}", path.display()))?;

    let config: RunnerConfig = toml::from_str(&content)
        .with_context(|| format!("Failed to parse TOML configuration from {}", path.display()))?;

    Ok((Some(config), source))
}

pub fn save_config(
    config: &RunnerConfig,
    custom_path: Option<&Path>,
    save_local: bool,
) -> anyhow::Result<PathBuf> {
    let path = if let Some(p) = custom_path {
        p.to_path_buf()
    } else if save_local {
        get_local_config_path()
    } else {
        get_global_config_path()
    };

    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() && !parent.exists() {
            std::fs::create_dir_all(parent)?;
        }
    }

    let toml_string = toml::to_string_pretty(config)
        .context("Failed to serialize runner configuration to TOML")?;

    std::fs::write(&path, toml_string)
        .with_context(|| format!("Failed to write config to {}", path.display()))?;

    Ok(path)
}
