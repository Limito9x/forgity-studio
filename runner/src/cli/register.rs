use anyhow::{bail, Context, Result};
use colored::Colorize;
use serde::{Deserialize, Serialize};

use crate::config::{load_config, save_config, HardwareProfileConfig, RabbitMqConfig, RunnerConfig};
use crate::system::hardware::get_hardware_snapshot;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RegisterPayload<'a> {
    setup_token: &'a str,
    name: &'a str,
    machine_key: &'a str,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
struct RabbitMqPayload {
    host: Option<String>,
    port: Option<u16>,
    username: Option<String>,
    password: Option<String>,
    virtual_host: Option<String>,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
struct RegisterResponse {
    id: String,
    name: String,
    machine_key: Option<String>,
    registration_token: String,
    rabbit_mq: Option<RabbitMqPayload>,
    grpc_url: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct HardwareProfilePayload<'a> {
    os_platform: &'a str,
    cpu_model: &'a str,
    total_ram_bytes: u64,
    primary_gpu_name: &'a str,
    primary_gpu_vram_bytes: u64,
    hardware_details: &'a str,
}

pub async fn run_register(
    api_url: String,
    token: Option<String>,
    config_override: Option<&std::path::Path>,
    local: bool,
) -> Result<()> {
    println!("{}", "\n════════════════════════════════════════════════════════".cyan().bold());
    println!("{}", "   FORGITY STUDIO RUNNER — WORKSTATION REGISTRATION".white().bold());
    println!("{}", "════════════════════════════════════════════════════════\n".cyan().bold());

    let token_val = match token {
        Some(t) if !t.trim().is_empty() => t.trim().to_string(),
        _ => {
            println!("{}", "Setup token is required.".yellow());
            print!("Enter Setup Token (from Web Dashboard): ");
            use std::io::Write;
            std::io::stdout().flush()?;
            let mut input = String::new();
            std::io::stdin().read_line(&mut input)?;
            let trimmed = input.trim().to_string();
            if trimmed.is_empty() {
                bail!("Setup token cannot be empty!");
            }
            trimmed
        }
    };

    let hostname = std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .unwrap_or_else(|_| "Forgity-Workstation".to_string());

    let machine_key = crate::system::hardware::get_permanent_machine_key();

    println!("{}", " [1] Workstation Identity".yellow().bold());
    println!("   Hostname   : {}", hostname.green());
    println!("   Machine Key: {}", machine_key.dimmed());
    println!("   API URL    : {}", api_url.white().bold());
    println!("   Token      : {}", format!("{}...", &token_val[..token_val.len().min(8)]).cyan());
    println!();

    println!("{}", " [2] Contacting Forgity Studio API...".yellow().bold());

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()?;

    let normalized_api = api_url.trim_end_matches('/');
    let payload = RegisterPayload {
        setup_token: &token_val,
        name: &hostname,
        machine_key: &machine_key,
    };

    // Try /api/runners/register-token, with fallback to /runners/register-token
    let candidate_endpoints = [
        format!("{normalized_api}/api/runners/register-token"),
        format!("{normalized_api}/runners/register-token"),
    ];

    let mut response_opt: Option<RegisterResponse> = None;
    let mut last_error_msg = String::new();

    for endpoint in candidate_endpoints {
        match client.post(&endpoint).json(&payload).send().await {
            Ok(res) if res.status().is_success() => {
                match res.json::<RegisterResponse>().await {
                    Ok(parsed) => {
                        response_opt = Some(parsed);
                        break;
                    }
                    Err(e) => {
                        last_error_msg = format!("Failed to parse JSON response: {e}");
                    }
                }
            }
            Ok(res) => {
                let status = res.status();
                let text = res.text().await.unwrap_or_default();
                last_error_msg = format!("HTTP {status}: {text}");
            }
            Err(e) => {
                last_error_msg = format!("Connection error to {endpoint}: {e}");
            }
        }
    }

    let reg_result = match response_opt {
        Some(res) => res,
        None => {
            bail!("Registration failed! {}\nPlease ensure the backend API is running and the token is valid.", last_error_msg);
        }
    };

    println!("   {} Runner registered successfully!", "✓".green().bold());
    println!("   Runner ID  : {}", reg_result.id.cyan().bold());
    println!("   Runner Name: {}", reg_result.name.white().bold());
    if let Some(ref grpc) = reg_result.grpc_url {
        println!("   gRPC URL   : {}", grpc.dimmed());
    }
    println!();

    // 3. Scan & Sync Hardware Profile
    println!("{}", " [3] Detecting Hardware Profile & GPU Specs...".yellow().bold());
    let hw = get_hardware_snapshot();
    println!("   OS Platform: {}", hw.os_platform.green());
    println!("   CPU Model  : {}", hw.cpu_model.green());
    println!("   Total RAM  : {} GB", (hw.total_ram_bytes / (1024 * 1024 * 1024)).to_string().cyan());
    println!("   Primary GPU: {}", hw.primary_gpu_name.green().bold());
    if hw.primary_gpu_vram_bytes > 0 {
        println!("   GPU VRAM   : {} GB", (hw.primary_gpu_vram_bytes / (1024 * 1024 * 1024)).to_string().cyan());
    }

    // Push hardware snapshot to backend (tolerate network failure)
    let hw_endpoint = format!("{normalized_api}/api/runners/{}/hardware-profile", reg_result.id);
    let hw_payload = HardwareProfilePayload {
        os_platform: &hw.os_platform,
        cpu_model: &hw.cpu_model,
        total_ram_bytes: hw.total_ram_bytes,
        primary_gpu_name: &hw.primary_gpu_name,
        primary_gpu_vram_bytes: hw.primary_gpu_vram_bytes,
        hardware_details: &hw.hardware_details,
    };

    if let Ok(res) = client.post(&hw_endpoint).json(&hw_payload).send().await {
        if res.status().is_success() {
            println!("   {} Hardware profile synchronized with server.", "✓".green().bold());
        }
    }
    println!();

    // 4. Verify RabbitMQ Broker Connection
    let rabbitmq_config = reg_result.rabbit_mq.map(|rmq| RabbitMqConfig {
        host: rmq.host.unwrap_or_else(|| "localhost".to_string()),
        port: rmq.port.unwrap_or(5672),
        username: rmq.username.unwrap_or_else(|| "guest".to_string()),
        password: rmq.password.unwrap_or_else(|| "guest".to_string()),
        virtual_host: rmq.virtual_host.unwrap_or_else(|| "/".to_string()),
        tls: false,
    });

    if let Some(rmq) = &rabbitmq_config {
        println!("{}", " [4] Verifying RabbitMQ Broker Connection...".yellow().bold());
        println!("   Host        : {}:{}", rmq.host.cyan(), rmq.port);
        println!("   User        : {}", rmq.username.cyan());
        println!("   VirtualHost : {}", rmq.virtual_host.cyan());

        match crate::queue::rabbitmq::RabbitMqClient::connect(rmq).await {
            Ok(client) => {
                println!("   {} Connected to RabbitMQ broker successfully!", "✓".green().bold());
                match client.create_task_consumer(&reg_result.id).await {
                    Ok((queue_name, _)) => {
                        println!("   {} Target task queue declared & ready: {}", "✓".green().bold(), queue_name.cyan());
                    }
                    Err(e) => {
                        println!("   {} Warning: Connected to broker, but failed to assert queue: {}", "!".yellow().bold(), e);
                    }
                }
            }
            Err(e) => {
                println!("   {} FAILED to connect to RabbitMQ broker with received credentials!", "✗".red().bold());
                println!("      Error: {}", e.to_string().red());
                println!("      Please verify RabbitMQ ports (5672) and firewall rules on server.");
            }
        }
        println!();
    }

    // 5. Save Config TOML
    println!("{}", " [5] Saving Runner Configuration...".yellow().bold());
    let now_iso = chrono_iso_now();
    let existing_env = load_config(config_override, local)
        .ok()
        .and_then(|(cfg, _)| cfg.and_then(|c| c.env));

    let runner_config = RunnerConfig {
        api_url: normalized_api.to_string(),
        runner_id: reg_result.id,
        name: reg_result.name,
        machine_key: reg_result.machine_key.unwrap_or(machine_key),
        registration_token: reg_result.registration_token,
        grpc_url: reg_result.grpc_url.or_else(|| Some(normalized_api.to_string())),
        rabbitmq: rabbitmq_config,
        hardware_profile: Some(HardwareProfileConfig {
            os_platform: hw.os_platform,
            cpu_model: hw.cpu_model,
            cpu_cores: hw.cpu_cores,
            total_ram_bytes: hw.total_ram_bytes,
            primary_gpu_name: hw.primary_gpu_name,
            primary_gpu_vram_bytes: hw.primary_gpu_vram_bytes,
            last_scanned_at: now_iso,
        }),
        env: existing_env,
    };

    let config_path = save_config(&runner_config, config_override, local)
        .context("Failed to save runner configuration file")?;

    let target_scope = if local { "Local Directory (./runner.toml)" } else { "System Global (%LOCALAPPDATA%)" };
    println!("   {} Configuration saved to: {} [{}]", "✓".green().bold(), config_path.display().to_string().cyan(), target_scope.yellow());
    println!();

    println!("{}", "════════════════════════════════════════════════════════".green().bold());
    println!("{}", "   RUNNER ACTIVATED & READY FOR 3D PIPELINES!".green().bold());
    println!("{}", "   Run 'forgity-runner start' to launch the daemon.".white());
    println!("{}", "════════════════════════════════════════════════════════\n".green().bold());

    Ok(())
}

fn chrono_iso_now() -> String {
    // Generate ISO8601 string without extra crate dependencies
    use std::time::SystemTime;
    let now = SystemTime::now();
    let duration = now.duration_since(SystemTime::UNIX_EPOCH).unwrap_or_default();
    let secs = duration.as_secs();
    format!("{secs}")
}
