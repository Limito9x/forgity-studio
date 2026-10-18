use anyhow::{Context, Result};
use lapin::{
    options::*, types::FieldTable, BasicProperties, Channel, Connection, ConnectionProperties, Consumer,
};
use tracing::{debug, info};

use crate::config::RabbitMqConfig;
use crate::core::contracts::{StageResultMessage, StepProgressMessage};

pub const QUEUE_RESULTS: &str = "stage_results";
pub const QUEUE_PROGRESS: &str = "step_progress";

#[derive(Clone)]
pub struct RabbitMqClient {
    channel: Channel,
}

impl RabbitMqClient {
    /// Connects to RabbitMQ broker using runner config parameters.
    pub async fn connect(config: &RabbitMqConfig) -> Result<Self> {
        let vhost = if config.virtual_host.is_empty() || config.virtual_host == "/" {
            "%2f".to_string()
        } else {
            config.virtual_host.clone()
        };

        let uri = format!(
            "amqp://{}:{}@{}:{}/{}",
            config.username, config.password, config.host, config.port, vhost
        );

        info!(
            "Connecting to RabbitMQ broker at {}:{} (vhost: '{}')...",
            config.host, config.port, config.virtual_host
        );

        let connection = Connection::connect(&uri, ConnectionProperties::default())
            .await
            .with_context(|| format!("Failed to connect to RabbitMQ broker at {}:{}", config.host, config.port))?;

        let channel = connection
            .create_channel()
            .await
            .context("Failed to create RabbitMQ channel")?;

        // Set prefetch to 1 (one job per runner at a time)
        channel
            .basic_qos(1, BasicQosOptions::default())
            .await
            .context("Failed to set basic_qos(1)")?;

        info!("RabbitMQ channel created successfully with prefetch=1");

        Ok(Self { channel })
    }

    /// Declares the dedicated stage tasks queue for this runner and starts consuming.
    pub async fn create_task_consumer(&self, runner_id: &str) -> Result<(String, Consumer)> {
        let queue_name = format!("stage_tasks.{}", runner_id);

        let mut queue_args = FieldTable::default();
        queue_args.insert(
            "x-dead-letter-exchange".into(),
            lapin::types::AMQPValue::LongString("wolverine-dead-letter-queue".into()),
        );

        // Try declaring with dead-letter-exchange, fallback to normal if needed
        let declare_res = self
            .channel
            .queue_declare(
                &queue_name,
                QueueDeclareOptions {
                    durable: true,
                    ..Default::default()
                },
                queue_args,
            )
            .await;

        if let Err(e) = declare_res {
            debug!("Declaring queue with DLX failed: {}. Retrying standard declare...", e);
            self.channel
                .queue_declare(
                    &queue_name,
                    QueueDeclareOptions {
                        durable: true,
                        ..Default::default()
                    },
                    FieldTable::default(),
                )
                .await
                .with_context(|| format!("Failed to declare task queue '{}'", queue_name))?;
        }

        info!("Subscribing to tasks queue: '{}'", queue_name);

        let consumer = self
            .channel
            .basic_consume(
                &queue_name,
                "forgity-runner-native",
                BasicConsumeOptions::default(),
                FieldTable::default(),
            )
            .await
            .with_context(|| format!("Failed to start consumer on queue '{}'", queue_name))?;

        Ok((queue_name, consumer))
    }

    /// Publishes a StepProgressMessage to the `step_progress` queue.
    pub async fn send_progress(&self, progress: &StepProgressMessage) -> Result<()> {
        let payload = serde_json::to_vec(progress)?;
        self.channel
            .basic_publish(
                "",
                QUEUE_PROGRESS,
                BasicPublishOptions::default(),
                &payload,
                BasicProperties::default().with_delivery_mode(2), // Persistent
            )
            .await?
            .await?; // Await publish confirmation

        debug!(
            "Published progress for step {}: {}",
            progress.step_execution_id, progress.status
        );
        Ok(())
    }

    /// Publishes a StageResultMessage to the `stage_results` queue.
    pub async fn send_result(&self, result: &StageResultMessage) -> Result<()> {
        let payload = serde_json::to_vec(result)?;
        self.channel
            .basic_publish(
                "",
                QUEUE_RESULTS,
                BasicPublishOptions::default(),
                &payload,
                BasicProperties::default().with_delivery_mode(2), // Persistent
            )
            .await?
            .await?;

        info!(
            "Published stage result for {} (succeeded={})",
            result.stage_execution_id, result.succeeded
        );
        Ok(())
    }

    /// Acknowledges message receipt.
    pub async fn ack(&self, delivery_tag: u64) -> Result<()> {
        self.channel
            .basic_ack(delivery_tag, BasicAckOptions::default())
            .await
            .context("Failed to basic_ack message")
    }

    /// Rejects or nacks message.
    pub async fn nack(&self, delivery_tag: u64, requeue: bool) -> Result<()> {
        self.channel
            .basic_nack(
                delivery_tag,
                BasicNackOptions {
                    requeue,
                    ..Default::default()
                },
            )
            .await
            .context("Failed to basic_nack message")
    }
}
