import json
import logging
import pika

from core.config import RABBITMQ_HOST, RABBITMQ_PORT, RABBITMQ_USER, RABBITMQ_PASSWORD, RABBITMQ_VHOST, AGENT_ID
from worker.contracts import StageTaskMessage, StageResultMessage, StepResult, StepProgressMessage
from worker.executors import get_executor


logger = logging.getLogger(__name__)

QUEUE_RESULTS = "stage_results"
QUEUE_PROGRESS = "step_progress"

class PipelineConsumer:
    """
    RabbitMQ consumer listening on 'stage_tasks.{agent_id}' queue for pipeline executions.
    Dispatches to the appropriate executor and sends results to 'stage_results'.
    Also publishes real-time progress to 'step_progress'.
    """

    def __init__(self, host: str = None, port: int = None, agent_id: str = None):
        self.host = host or RABBITMQ_HOST
        self.port = port or RABBITMQ_PORT
        self.agent_id = str(agent_id or AGENT_ID or "")
        self.queue_tasks = f"stage_tasks.{self.agent_id}" if self.agent_id else "stage_tasks"

        credentials = pika.PlainCredentials(RABBITMQ_USER, RABBITMQ_PASSWORD)
        self._connection = pika.BlockingConnection(
            pika.ConnectionParameters(
                host=self.host,
                port=self.port,
                virtual_host=RABBITMQ_VHOST,
                credentials=credentials,
                heartbeat=0,
                blocked_connection_timeout=300
            )
        )
        self._channel = self._connection.channel()
        queue_args = {"x-dead-letter-exchange": "wolverine-dead-letter-queue"}
        
        for q in [self.queue_tasks, QUEUE_RESULTS, QUEUE_PROGRESS]:
            try:
                self._channel.queue_declare(queue=q, durable=True, arguments=queue_args)
            except Exception:
                self._channel = self._connection.channel()
                try:
                    self._channel.queue_declare(queue=q, passive=True)
                except Exception:
                    self._channel = self._connection.channel()
                    self._channel.queue_declare(queue=q, durable=True)

        self._channel.basic_qos(prefetch_count=1)


    def start(self):
        """Start consuming. Blocking call."""
        print(f"\n[RabbitMQ] ===================================================", flush=True)
        print(f"[RabbitMQ] [*] Pipeline Consumer started successfully!", flush=True)
        print(f"[RabbitMQ] [*] Broker: {self.host}:{self.port} (vhost: '{RABBITMQ_VHOST}')", flush=True)
        print(f"[RabbitMQ] [*] Listening on queue: '{self.queue_tasks}'", flush=True)
        print(f"[RabbitMQ] [*] Results queue: '{QUEUE_RESULTS}', Progress queue: '{QUEUE_PROGRESS}'", flush=True)
        print(f"[RabbitMQ] ===================================================\n", flush=True)
        logger.info(f"[*] Listening on queue '{self.queue_tasks}' for agent '{self.agent_id}'. Press Ctrl+C to stop.")

        self._channel.basic_consume(
            queue=self.queue_tasks,
            on_message_callback=self._on_message,
        )
        self._channel.start_consuming()

    def _on_message(self, ch, method, properties, body):
        """Callback when receiving a message from RabbitMQ."""
        task = None
        print(f"\n[RabbitMQ] >>> [MESSAGE RECEIVED] StageTaskMessage arrived (tag={method.delivery_tag}, {len(body)} bytes)!", flush=True)
        try:
            task = StageTaskMessage.model_validate_json(body)
            print(f"[RabbitMQ]     Stage Execution ID: {task.stage_execution_id}", flush=True)
            print(f"[RabbitMQ]     Pipeline Execution ID: {task.pipeline_execution_id}", flush=True)
            print(f"[RabbitMQ]     Executor: {task.executor} | Steps: {len(task.steps)}", flush=True)
            logger.info(
                f"--- Received task: {task.stage_execution_id} | "
                f"executor={task.executor} | steps={len(task.steps)} ---"
            )

            executor = get_executor(task.executor)

            def _on_step_progress(step_id: str, status: str):
                msg = StepProgressMessage(
                    stage_execution_id=task.stage_execution_id,
                    step_execution_id=step_id,
                    status=status
                )
                print(f"[RabbitMQ]     [Progress] Step {step_id} -> {status}", flush=True)
                self._send_progress(msg)

            print(f"[RabbitMQ]     Dispatching to executor '{task.executor}'...", flush=True)
            result = executor.execute(task=task, progress_callback=_on_step_progress)

            # Build per-step result DTOs
            step_results = [
                StepResult(
                    step_execution_id=sr.step_execution_id,
                    succeeded=sr.succeeded,
                    log=sr.log,
                    error_message=sr.error_message,
                    outputs=getattr(sr, "outputs", {}),
                )
                for sr in result.step_results
            ] if result.step_results else []

            print(f"[RabbitMQ]     Stage execution finished (succeeded={result.succeeded}). Sending result to '{QUEUE_RESULTS}'...", flush=True)
            self._send_result(StageResultMessage(
                stage_execution_id=task.stage_execution_id,
                succeeded=result.succeeded,
                log=result.log,
                error_message=result.error_message,
                step_results=step_results,
            ))

            ch.basic_ack(delivery_tag=method.delivery_tag)
            print(f"[RabbitMQ] <<< [ACKED] Delivery tag {method.delivery_tag} acknowledged successfully.\n", flush=True)
            logger.info(f"--- Completed: {task.stage_execution_id} | succeeded={result.succeeded} ---")

        except Exception as e:
            stage_id = task.stage_execution_id if task else "unknown"
            print(f"[RabbitMQ] [ERROR] Failed to process task {stage_id}: {e}", flush=True)
            logger.exception(f"Failed to process task {stage_id}: {e}")

            if task:
                try:
                    self._send_result(StageResultMessage(
                        stage_execution_id=task.stage_execution_id,
                        succeeded=False,
                        log=None,
                        error_message=str(e),
                        step_results=[]
                    ))
                    print(f"[RabbitMQ] [ERROR] Reported failure result back to '{QUEUE_RESULTS}' for stage {stage_id}.", flush=True)
                except Exception as send_err:
                    print(f"[RabbitMQ] [CRITICAL] Could not send error result: {send_err}", flush=True)

            try:
                ch.basic_ack(delivery_tag=method.delivery_tag)
            except Exception:
                pass

    def _send_progress(self, msg: StepProgressMessage):
        """Send StepProgressMessage to 'step_progress' queue."""
        payload = msg.model_dump_json(by_alias=True)
        self._channel.basic_publish(
            exchange="",
            routing_key=QUEUE_PROGRESS,
            body=payload,
            properties=pika.BasicProperties(delivery_mode=2),
        )
        logger.debug(f"Sent progress for step {msg.step_execution_id}: {msg.status}")

    def _send_result(self, result: StageResultMessage):
        """Send StageResultMessage to 'stage_results' queue."""
        payload = result.model_dump_json(by_alias=True)
        self._channel.basic_publish(
            exchange="",
            routing_key=QUEUE_RESULTS,
            body=payload,
            properties=pika.BasicProperties(delivery_mode=2),
        )
        logger.debug(f"Sent result for {result.stage_execution_id}")

# Alias for backwards compatibility
StageTaskConsumer = PipelineConsumer
