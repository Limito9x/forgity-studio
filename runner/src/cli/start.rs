use std::sync::Arc;
use anyhow::{Context, Result};
use colored::Colorize;
use futures_lite::StreamExt;
use tracing::{error, info, warn};

use crate::config::load_config;
use crate::core::contracts::{StageResultMessage, StageTaskMessage};
use crate::core::dispatcher::StageDispatcher;
use crate::queue::rabbitmq::RabbitMqClient;

pub async fn run_start() -> Result<()> {
    println!("{}", "\n════════════════════════════════════════════════════════".cyan().bold());
    println!("{}", "   FORGITY STUDIO — NATIVE RUNNER DAEMON".white().bold());
    println!("{}", "════════════════════════════════════════════════════════\n".cyan().bold());

    // 1. Load local configuration
    let config = match load_config() {
        Ok(Some(cfg)) => cfg,
        Ok(None) => {
            println!(
                "{} No runner configuration found (runner.toml is missing).",
                "ERROR:".red().bold()
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

    // 2. Connect to RabbitMQ
    let rabbitmq = RabbitMqClient::connect(&rabbitmq_config)
        .await
        .context("Failed to connect to RabbitMQ broker")?;

    let (queue_name, mut consumer) = rabbitmq
        .create_task_consumer(&runner_id)
        .await
        .context("Failed to subscribe to runner task queue")?;

    println!(
        "{} Listening on queue '{}'...",
        "[*]".green().bold(),
        queue_name.yellow().bold()
    );
    println!("{} Press Ctrl+C to stop.\n", "Tip:".dimmed());

    let active_stages = Arc::new(crate::process::active_stage::ActiveStageManager::new());

    // 3. Connect gRPC stream in background to report Online status to Backend
    if let Some(grpc_url) = config.grpc_url.clone() {
        if !grpc_url.is_empty() {
            let runner_id_clone = runner_id.clone();
            let stages_clone = active_stages.clone();
            tokio::spawn(async move {
                crate::grpc::client::GrpcRunnerClient::run_loop(grpc_url, runner_id_clone, stages_clone).await;
            });
        }
    }

    let dispatcher = StageDispatcher::new(rabbitmq.clone(), active_stages);

    // Record current PID for daemon tracking
    let _ = crate::cli::daemon::write_pid(std::process::id());

    // 4. Main consumption loop with graceful shutdown
    loop {
        tokio::select! {
            _ = tokio::signal::ctrl_c() => {
                println!("\n{}", "[!] Shutdown signal received. Exiting gracefully...".yellow().bold());
                crate::cli::daemon::remove_pid();
                break;
            }

            Some(delivery_res) = consumer.next() => {
                match delivery_res {
                    Ok(delivery) => {
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
                                        // Report error result back
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
                    Err(e) => {
                        warn!("[RabbitMQ] Consumer stream error: {}", e);
                    }
                }
            }
        }
    }

    crate::cli::daemon::remove_pid();
    Ok(())
}
