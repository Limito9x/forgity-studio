use std::sync::Arc;
use anyhow::Result;
use colored::Colorize;
use futures_lite::StreamExt;
use tracing::{error, info, warn};

use crate::config::load_config;
use crate::core::contracts::{StageResultMessage, StageTaskMessage};
use crate::core::dispatcher::StageDispatcher;
use crate::queue::rabbitmq::RabbitMqClient;

pub async fn run_start(config_override: Option<&std::path::Path>, force_local: bool) -> Result<()> {
    println!("{}", "\n════════════════════════════════════════════════════════".cyan().bold());
    println!("{}", "   FORGITY STUDIO — NATIVE RUNNER DAEMON".white().bold());
    println!("{}", "════════════════════════════════════════════════════════\n".cyan().bold());

    // 1. Load configuration (prioritizes ./runner.toml in CWD if present, else %LOCALAPPDATA%)
    let (config, source) = match load_config(config_override, force_local) {
        Ok((Some(cfg), src)) => (cfg, src),
        Ok((None, src)) => {
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
            return Err(anyhow::anyhow!("Unregistered runner"));
        }
        Err(e) => {
            println!(
                "{} Could not load runner configuration: {}",
                "ERROR:".red().bold(),
                e
            );
            return Err(e);
        }
    };

    let runner_id = config.runner_id.clone();
    let runner_name = config.name.clone();

    if runner_id.is_empty() {
        println!(
            "{} Runner is not registered. Missing 'runner_id' in runner.toml.",
            "ERROR:".red().bold()
        );
        return Err(anyhow::anyhow!("Unregistered runner"));
    }

    let rabbitmq_config = match &config.rabbitmq {
        Some(rmq) => rmq.clone(),
        None => {
            println!(
                "{} Missing RabbitMQ credentials in runner.toml. Please re-register.",
                "ERROR:".red().bold()
            );
            return Err(anyhow::anyhow!("Missing RabbitMQ configuration"));
        }
    };

    println!("   Runner ID   : {}", runner_id.green().bold());
    println!("   Runner Name : {}", runner_name.white().bold());
    println!("   Config File : {} [{}]", source.path().display().to_string().cyan(), source.label().yellow());
    println!("   API URL     : {}", config.api_url.cyan());
    println!(
        "   gRPC URL    : {}",
        config.grpc_url.as_deref().unwrap_or("N/A").cyan()
    );
    println!(
        "   RabbitMQ    : {}:{} (vhost: '{}')",
        rabbitmq_config.host.yellow(),
        rabbitmq_config.port,
        rabbitmq_config.virtual_host
    );
    println!();

    let active_stages = Arc::new(crate::process::active_stage::ActiveStageManager::new());

    // 2. Connect gRPC stream in background to report Online status to Backend
    if let Some(grpc_url) = config.grpc_url.clone() {
        if !grpc_url.is_empty() {
            let runner_id_clone = runner_id.clone();
            let stages_clone = active_stages.clone();
            tokio::spawn(async move {
                crate::grpc::client::GrpcRunnerClient::run_loop(grpc_url, runner_id_clone, stages_clone).await;
            });
        }
    }

    // Record current PID for daemon tracking
    let _ = crate::cli::daemon::write_pid(std::process::id());

    // 3. Resilient RabbitMQ Connection & Task Consumption Loop with Auto-Reconnect
    'outer: loop {
        info!("Connecting to RabbitMQ broker at {}:{} (vhost: '{}')...", rabbitmq_config.host, rabbitmq_config.port, rabbitmq_config.virtual_host);

        let (rabbitmq, _queue_name, mut consumer) = loop {
            match RabbitMqClient::connect(&rabbitmq_config).await {
                Ok(rmq) => match rmq.create_task_consumer(&runner_id).await {
                    Ok((q, c)) => {
                        println!(
                            "{} Subscribed & Listening on queue '{}'...",
                            "[*]".green().bold(),
                            q.yellow().bold()
                        );
                        println!("{} Press Ctrl+C to stop.\n", "Tip:".dimmed());
                        break (rmq, q, c);
                    }
                    Err(e) => {
                        error!("[RabbitMQ] Failed to subscribe to task queue: {}. Retrying in 3s...", e);
                    }
                },
                Err(e) => {
                    error!("[RabbitMQ] Connection failed: {}. Retrying in 3s...", e);
                }
            }

            tokio::select! {
                _ = tokio::signal::ctrl_c() => {
                    println!("\n{}", "[!] Shutdown signal received. Exiting gracefully...".yellow().bold());
                    crate::cli::daemon::remove_pid();
                    break 'outer;
                }
                _ = tokio::time::sleep(std::time::Duration::from_secs(3)) => {}
            }
        };

        let dispatcher = StageDispatcher::new(rabbitmq.clone(), active_stages.clone());

        let mut should_reconnect = false;
        while !should_reconnect {
            tokio::select! {
                _ = tokio::signal::ctrl_c() => {
                    println!("\n{}", "[!] Shutdown signal received. Exiting gracefully...".yellow().bold());
                    crate::cli::daemon::remove_pid();
                    break 'outer;
                }

                delivery_res = consumer.next() => {
                    match delivery_res {
                        Some(Ok(delivery)) => {
                            let delivery_tag = delivery.delivery_tag;
                            info!("[RabbitMQ] Received task delivery tag: {}", delivery_tag);

                            let task_res = serde_json::from_slice::<StageTaskMessage>(&delivery.data);
                            match task_res {
                                Ok(task) => {
                                    let stage_id = task.stage_execution_id.clone();
                                    let pipeline_id = task.pipeline_execution_id.clone();
                                    info!(
                                        "[Runner] Processing Stage {} for Pipeline {}",
                                        stage_id, pipeline_id
                                    );

                                    match dispatcher.dispatch_stage(task).await {
                                        Ok(_) => {
                                            info!("[Runner] Stage {} executed successfully. Acknowledging task...", stage_id);
                                            if let Err(e) = rabbitmq.ack(delivery_tag).await {
                                                error!("Failed to ACK delivery tag {}: {}", delivery_tag, e);
                                            }
                                        }
                                        Err(e) => {
                                            error!("[Runner] Execution error on Stage {}: {}", stage_id, e);
                                            let error_result = StageResultMessage {
                                                stage_execution_id: stage_id.clone(),
                                                pipeline_execution_id: pipeline_id,
                                                pipeline_id: String::new(),
                                                succeeded: false,
                                                log: None,
                                                error_message: Some(e.to_string()),
                                                step_results: vec![],
                                            };
                                            let _ = rabbitmq.send_result(&error_result).await;
                                            let _ = rabbitmq.ack(delivery_tag).await;
                                        }
                                    }
                                }
                                Err(e) => {
                                    error!("[RabbitMQ] Failed to deserialize StageTaskMessage: {}. Rejecting message...", e);
                                    let _ = rabbitmq.nack(delivery_tag, false).await;
                                }
                            }
                        }
                        Some(Err(e)) => {
                            warn!("[RabbitMQ] Consumer stream error: {}. Initiating reconnect...", e);
                            should_reconnect = true;
                        }
                        None => {
                            warn!("[RabbitMQ] Consumer stream closed by broker. Initiating reconnect...");
                            should_reconnect = true;
                        }
                    }
                }
            }
        }

        tokio::time::sleep(std::time::Duration::from_secs(2)).await;
    }

    crate::cli::daemon::remove_pid();
    Ok(())
}
