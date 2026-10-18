use anyhow::{Context, Result};
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::windows::named_pipe::{NamedPipeServer, ServerOptions};
use tokio::sync::{mpsc, Mutex};
use tracing::{debug, info, warn};

use super::protocol::{GuestToHostMessage, HostToGuestMessage};

pub struct PipeServer {
    pipe_name: String,
    sender_to_guest: Arc<Mutex<Option<tokio::io::WriteHalf<NamedPipeServer>>>>,
}

impl PipeServer {
    /// Constructs a new PipeServer with a unique pipe name for the given stage execution.
    pub fn new(stage_execution_id: &str) -> Self {
        let sanitized_id = stage_execution_id.replace('-', "");
        let pipe_name = format!(r"\\.\pipe\forgity-ipc-{}", sanitized_id);
        Self {
            pipe_name,
            sender_to_guest: Arc::new(Mutex::new(None)),
        }
    }

    /// Returns the full OS pipe path (e.g. `\\.\pipe\forgity-ipc-...`)
    pub fn pipe_path(&self) -> &str {
        &self.pipe_name
    }

    /// Listens for a connection from the guest subprocess and yields messages via the provided channel.
    pub async fn listen_and_serve(
        &self,
        event_sender: mpsc::Sender<GuestToHostMessage>,
    ) -> Result<()> {
        info!("Creating Local Named Pipe at: {}", self.pipe_name);

        let server = ServerOptions::new()
            .first_pipe_instance(true)
            .create(&self.pipe_name)
            .with_context(|| format!("Failed to create Named Pipe {}", self.pipe_name))?;

        debug!("Waiting for guest subprocess to connect to pipe...");
        server
            .connect()
            .await
            .context("Error while waiting for pipe client connection")?;

        info!("Guest subprocess connected to IPC Named Pipe!");

        let (read_half, write_half) = tokio::io::split(server);
        {
            let mut guard = self.sender_to_guest.lock().await;
            *guard = Some(write_half);
        }

        let mut lines = BufReader::new(read_half).lines();

        while let Some(line) = lines.next_line().await? {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }

            match serde_json::from_str::<GuestToHostMessage>(trimmed) {
                Ok(msg) => {
                    debug!("Received IPC message from guest: {:?}", msg);
                    if let Err(e) = event_sender.send(msg).await {
                        warn!("Event receiver channel closed: {}", e);
                        break;
                    }
                }
                Err(e) => {
                    warn!("Invalid JSON on IPC pipe: '{}' (error: {})", trimmed, e);
                }
            }
        }

        info!("Guest subprocess disconnected from IPC pipe");
        let mut guard = self.sender_to_guest.lock().await;
        *guard = None;

        Ok(())
    }

    /// Sends a message back to the connected guest subprocess.
    pub async fn send_to_guest(&self, msg: HostToGuestMessage) -> Result<()> {
        let mut guard = self.sender_to_guest.lock().await;
        if let Some(writer) = guard.as_mut() {
            let mut data = serde_json::to_vec(&msg)?;
            data.push(b'\n');
            writer.write_all(&data).await?;
            writer.flush().await?;
            Ok(())
        } else {
            Err(anyhow::anyhow!("No guest process currently connected to pipe"))
        }
    }
}
