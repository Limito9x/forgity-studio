use anyhow::{Context, Result};
use std::time::Duration;
use tokio::sync::mpsc;
use tokio::time::sleep;
use tokio_stream::wrappers::ReceiverStream;
use tonic::transport::Channel;
use tracing::{debug, error, info, warn};

use super::agent::agent_service_client::AgentServiceClient;
use super::agent::{
    agent_message, command_response, server_message, AgentMessage, CommandResponse,
    ExecutorCandidateMessage, ScanCommandResult, ScanExecutorsCommandResult,
    ScanHardwareCommandResult, UploadFileItemResult, UploadFilesCommandResult,
};

pub struct GrpcRunnerClient;

impl GrpcRunnerClient {
    /// Maintains a persistent bidirectional gRPC streaming connection with the Backend.
    /// Sends the initial handshake message to mark this runner as ONLINE in the Backend ConnectionRegistry,
    /// and listens for remote server commands (Browse, Scan, ScanHardware, ScanExecutors, UploadFiles).
    pub async fn run_loop(grpc_url: String, runner_id: String) {
        let app_version = env!("CARGO_PKG_VERSION").to_string();

        loop {
            info!("Attempting gRPC connection to Backend at {}...", grpc_url);

            match Self::connect_and_stream(&grpc_url, &runner_id, &app_version).await {
                Ok(_) => {
                    warn!("gRPC stream closed by server. Reconnecting in 5s...");
                }
                Err(e) => {
                    warn!("gRPC connection to {} failed: {}. Retrying in 5s...", grpc_url, e);
                }
            }

            sleep(Duration::from_secs(5)).await;
        }
    }

    async fn connect_and_stream(
        grpc_url: &str,
        runner_id: &str,
        app_version: &str,
    ) -> Result<()> {
        let endpoint = Channel::from_shared(grpc_url.to_string())
            .with_context(|| format!("Invalid gRPC URL: {}", grpc_url))?
            .connect_timeout(Duration::from_secs(10))
            .http2_keep_alive_interval(Duration::from_secs(15))
            .keep_alive_while_idle(true);

        let channel = endpoint
            .connect()
            .await
            .with_context(|| format!("Failed to connect to gRPC endpoint {}", grpc_url))?;

        let mut client = AgentServiceClient::new(channel);

        let (tx, rx) = mpsc::channel::<AgentMessage>(32);
        let request_stream = ReceiverStream::new(rx);

        // 1. Send Handshake Message to trigger _registry.Add(connection) on Backend
        let handshake = AgentMessage {
            agent_id: runner_id.to_string(),
            app_version: app_version.to_string(),
            payload: None,
        };

        tx.send(handshake)
            .await
            .context("Failed to send initial gRPC handshake message")?;

        info!(
            "════════════════════════════════════════════════════════════════\n\
             [gRPC] Connected to Backend gRPC at {}!\n\
             [gRPC] Runner ID: {} is now ONLINE on Web Dashboard.\n\
             ════════════════════════════════════════════════════════════════",
            grpc_url, runner_id
        );

        let response = client
            .connect(request_stream)
            .await
            .context("Error calling rpc Connect")?;

        let mut inbound = response.into_inner();

        // 2. Listen for ServerMessage from Backend and respond to remote commands
        while let Some(server_msg) = inbound.message().await? {
            debug!("Received ServerMessage from Backend: {:?}", server_msg);

            match server_msg.payload {
                Some(server_message::Payload::ScanHardwareCommand(cmd)) => {
                    info!("[gRPC] Handling remote ScanHardwareCommand (cmd_id: {})...", cmd.command_id);
                    let hw = crate::system::hardware::get_hardware_snapshot();

                    let resp = CommandResponse {
                        command_id: cmd.command_id,
                        success: true,
                        error_message: String::new(),
                        result: Some(command_response::Result::ScanHardwareResult(ScanHardwareCommandResult {
                            os_platform: hw.os_platform,
                            cpu_model: hw.cpu_model,
                            total_ram_bytes: hw.total_ram_bytes as i64,
                            primary_gpu_name: hw.primary_gpu_name,
                            primary_gpu_vram_bytes: hw.primary_gpu_vram_bytes as i64,
                            hardware_details_json: hw.hardware_details,
                        })),
                    };

                    let reply = AgentMessage {
                        agent_id: runner_id.to_string(),
                        app_version: app_version.to_string(),
                        payload: Some(agent_message::Payload::CommandResponse(resp)),
                    };

                    if let Err(e) = tx.send(reply).await {
                        error!("[gRPC] Failed to send ScanHardwareCommand response: {}", e);
                    } else {
                        info!("[gRPC] Hardware re-scan response sent successfully!");
                    }
                }

                Some(server_message::Payload::ScanExecutorsCommand(cmd)) => {
                    info!("[gRPC] Handling remote ScanExecutorsCommand (cmd_id: {})...", cmd.command_id);
                    let mut items = Vec::new();
                    for b in crate::system::dcc::scan_blender() {
                        items.push(ExecutorCandidateMessage {
                            executor_key: "blender".to_string(),
                            executable_path: b.path.to_string_lossy().to_string(),
                            version: b.version,
                        });
                    }
                    for u in crate::system::dcc::scan_unreal() {
                        items.push(ExecutorCandidateMessage {
                            executor_key: "unreal".to_string(),
                            executable_path: u.path.to_string_lossy().to_string(),
                            version: u.version,
                        });
                    }
                    for p in crate::system::dcc::scan_python() {
                        items.push(ExecutorCandidateMessage {
                            executor_key: "python".to_string(),
                            executable_path: p.path.to_string_lossy().to_string(),
                            version: p.version,
                        });
                    }

                    let resp = CommandResponse {
                        command_id: cmd.command_id,
                        success: true,
                        error_message: String::new(),
                        result: Some(command_response::Result::ScanExecutorsResult(ScanExecutorsCommandResult {
                            items,
                        })),
                    };

                    let reply = AgentMessage {
                        agent_id: runner_id.to_string(),
                        app_version: app_version.to_string(),
                        payload: Some(agent_message::Payload::CommandResponse(resp)),
                    };

                    if let Err(e) = tx.send(reply).await {
                        error!("[gRPC] Failed to send ScanExecutorsCommand response: {}", e);
                    } else {
                        info!("[gRPC] ScanExecutorsCommand response sent successfully!");
                    }
                }

                Some(server_message::Payload::BrowseCommand(cmd)) => {
                    info!("[gRPC] Handling remote BrowseCommand (cmd_id: {}, path: '{}')...", cmd.command_id, cmd.directory_path);
                    let resp = match crate::system::browser::browse_path(&cmd.directory_path) {
                        Ok(result) => CommandResponse {
                            command_id: cmd.command_id,
                            success: true,
                            error_message: String::new(),
                            result: Some(command_response::Result::BrowseResult(result)),
                        },
                        Err(e) => CommandResponse {
                            command_id: cmd.command_id,
                            success: false,
                            error_message: e.to_string(),
                            result: None,
                        },
                    };

                    let reply = AgentMessage {
                        agent_id: runner_id.to_string(),
                        app_version: app_version.to_string(),
                        payload: Some(agent_message::Payload::CommandResponse(resp)),
                    };

                    if let Err(e) = tx.send(reply).await {
                        error!("[gRPC] Failed to send BrowseCommand response: {}", e);
                    } else {
                        info!("[gRPC] BrowseCommand response sent successfully!");
                    }
                }

                Some(server_message::Payload::ScanCommand(cmd)) => {
                    info!("[gRPC] Handling remote ScanCommand (cmd_id: {}, path: '{}')...", cmd.command_id, cmd.directory_path);
                    let items = crate::system::browser::scan_resources(&cmd.directory_path, &cmd.extensions);
                    info!("[gRPC] Scanned {} resource items in '{}'", items.len(), cmd.directory_path);

                    let resp = CommandResponse {
                        command_id: cmd.command_id,
                        success: true,
                        error_message: String::new(),
                        result: Some(command_response::Result::ScanResult(ScanCommandResult {
                            items,
                        })),
                    };

                    let reply = AgentMessage {
                        agent_id: runner_id.to_string(),
                        app_version: app_version.to_string(),
                        payload: Some(agent_message::Payload::CommandResponse(resp)),
                    };

                    if let Err(e) = tx.send(reply).await {
                        error!("[gRPC] Failed to send ScanCommand response: {}", e);
                    } else {
                        info!("[gRPC] ScanCommand response sent successfully!");
                    }
                }

                Some(server_message::Payload::UploadFilesCommand(cmd)) => {
                    info!("[gRPC] Handling remote UploadFilesCommand (cmd_id: {}, {} files)...", cmd.command_id, cmd.items.len());
                    let mut item_results = Vec::new();
                    let mut total_bytes = 0i64;
                    let http_client = reqwest::Client::new();

                    for item in cmd.items {
                        let file_path = std::path::PathBuf::from(&item.file_path);
                        if !file_path.exists() {
                            item_results.push(UploadFileItemResult {
                                asset_id: item.asset_id,
                                resource_version_id: item.resource_version_id,
                                success: false,
                                bytes_uploaded: 0,
                                error_message: format!("File does not exist: {}", file_path.display()),
                            });
                            continue;
                        }

                        match tokio::fs::File::open(&file_path).await {
                            Ok(file) => {
                                let metadata = file.metadata().await;
                                let file_len = metadata.map(|m| m.len()).unwrap_or(0);
                                let content_type = if item.content_type.is_empty() {
                                    "application/octet-stream".to_string()
                                } else {
                                    item.content_type
                                };

                                let stream = tokio_util::io::ReaderStream::new(file);
                                let body = reqwest::Body::wrap_stream(stream);

                                let res = http_client
                                    .put(&item.presigned_url)
                                    .header(reqwest::header::CONTENT_TYPE, content_type)
                                    .header(reqwest::header::CONTENT_LENGTH, file_len)
                                    .body(body)
                                    .send()
                                    .await;

                                match res {
                                    Ok(resp) if resp.status().is_success() => {
                                        total_bytes += file_len as i64;
                                        item_results.push(UploadFileItemResult {
                                            asset_id: item.asset_id,
                                            resource_version_id: item.resource_version_id,
                                            success: true,
                                            bytes_uploaded: file_len as i64,
                                            error_message: String::new(),
                                        });
                                    }
                                    Ok(resp) => {
                                        let status = resp.status();
                                        let text = resp.text().await.unwrap_or_default();
                                        item_results.push(UploadFileItemResult {
                                            asset_id: item.asset_id,
                                            resource_version_id: item.resource_version_id,
                                            success: false,
                                            bytes_uploaded: 0,
                                            error_message: format!("HTTP {} - {}", status, text),
                                        });
                                    }
                                    Err(e) => {
                                        item_results.push(UploadFileItemResult {
                                            asset_id: item.asset_id,
                                            resource_version_id: item.resource_version_id,
                                            success: false,
                                            bytes_uploaded: 0,
                                            error_message: e.to_string(),
                                        });
                                    }
                                }
                            }
                            Err(e) => {
                                item_results.push(UploadFileItemResult {
                                    asset_id: item.asset_id,
                                    resource_version_id: item.resource_version_id,
                                    success: false,
                                    bytes_uploaded: 0,
                                    error_message: e.to_string(),
                                });
                            }
                        }
                    }

                    let resp = CommandResponse {
                        command_id: cmd.command_id,
                        success: true,
                        error_message: String::new(),
                        result: Some(command_response::Result::UploadFilesResult(UploadFilesCommandResult {
                            items: item_results,
                            total_bytes_uploaded: total_bytes,
                        })),
                    };

                    let reply = AgentMessage {
                        agent_id: runner_id.to_string(),
                        app_version: app_version.to_string(),
                        payload: Some(agent_message::Payload::CommandResponse(resp)),
                    };

                    if let Err(e) = tx.send(reply).await {
                        error!("[gRPC] Failed to send UploadFilesCommand response: {}", e);
                    } else {
                        info!("[gRPC] UploadFilesCommand response sent successfully!");
                    }
                }

                _ => {
                    debug!("[gRPC] Unhandled server message payload: {:?}", server_msg);
                }
            }
        }

        Ok(())
    }
}
