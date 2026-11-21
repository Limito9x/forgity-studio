use anyhow::{Context, Result};
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader, WriteHalf};
use tokio::net::windows::named_pipe::{NamedPipeServer, ServerOptions};
use tokio::sync::{mpsc, Mutex};
use tracing::{debug, info, warn};

use super::protocol::{HostToResidentMessage, ResidentToHostMessage};

pub struct DccControlPipe {
    pipe_name: String,
    writer: Arc<Mutex<Option<WriteHalf<NamedPipeServer>>>>,
}

impl DccControlPipe {
    pub fn new(key: &str) -> Self {
        let suffix = &uuid::Uuid::new_v4().simple().to_string()[..8];
        let pipe_name = format!(r"\\.\pipe\forgity_dcc_{}_{}", key, suffix);
        Self {
            pipe_name,
            writer: Arc::new(Mutex::new(None)),
        }
    }

    pub fn pipe_path(&self) -> &str {
        &self.pipe_name
    }

    /// Listens for a connection from the resident DCC process and pushes incoming messages to event_sender.
    pub async fn listen_and_serve(
        &self,
        event_sender: mpsc::Sender<ResidentToHostMessage>,
    ) -> Result<()> {
        info!("[DccControlPipe] Creating Control Named Pipe at: {}", self.pipe_name);

        let server = ServerOptions::new()
            .first_pipe_instance(true)
            .create(&self.pipe_name)
            .with_context(|| format!("Failed to create Named Pipe {}", self.pipe_name))?;

        debug!("[DccControlPipe] Waiting for resident DCC to connect...");
        server
            .connect()
            .await
            .context("Error waiting for resident DCC pipe connection")?;

        info!("[DccControlPipe] Resident DCC process connected to Control Pipe!");

        let (read_half, write_half) = tokio::io::split(server);
        {
            let mut guard = self.writer.lock().await;
            *guard = Some(write_half);
        }

        let mut lines = BufReader::new(read_half).lines();

        while let Some(line) = lines.next_line().await? {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }

            match serde_json::from_str::<ResidentToHostMessage>(trimmed) {
                Ok(msg) => {
                    debug!("[DccControlPipe] Received message from resident DCC: {:?}", msg);
                    if let Err(e) = event_sender.send(msg).await {
                        warn!("[DccControlPipe] Event receiver channel closed: {}", e);
                        break;
                    }
                }
                Err(e) => {
                    warn!("[DccControlPipe] Invalid JSON on Control Pipe: '{}' (error: {})", trimmed, e);
                }
            }
        }

        info!("[DccControlPipe] Resident DCC disconnected from Control Pipe");
        let mut guard = self.writer.lock().await;
        *guard = None;

        Ok(())
    }

    /// Sends a control message to the resident DCC process.
    pub async fn send(&self, msg: &HostToResidentMessage) -> Result<()> {
        let mut guard = self.writer.lock().await;
        if let Some(writer) = guard.as_mut() {
            let mut data = serde_json::to_vec(msg)?;
            data.push(b'\n');
            writer.write_all(&data).await?;
            writer.flush().await?;
            Ok(())
        } else {
            Err(anyhow::anyhow!("Resident DCC is not connected to control pipe"))
        }
    }
}

