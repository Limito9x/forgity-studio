import logging
import os
import sys
import pika

# Ensure parent directory is in sys.path when run directly
current_dir = os.path.dirname(os.path.abspath(__file__))
workers_root = os.path.dirname(current_dir)
if workers_root not in sys.path:
    sys.path.insert(0, workers_root)
if os.path.join(workers_root, "core") not in sys.path:
    sys.path.insert(0, os.path.join(workers_root, "core"))

from core.config import (
    RABBITMQ_HOST,
    RABBITMQ_PORT,
    RABBITMQ_USER,
    RABBITMQ_PASSWORD,
    RABBITMQ_VHOST,
    AGENT_ID,
)

logger = logging.getLogger(__name__)

def run():
    print("[*] Connecting to RabbitMQ to purge pending queue messages...")
    credentials = pika.PlainCredentials(RABBITMQ_USER, RABBITMQ_PASSWORD)
    try:
        connection = pika.BlockingConnection(
            pika.ConnectionParameters(
                host=RABBITMQ_HOST,
                port=RABBITMQ_PORT,
                virtual_host=RABBITMQ_VHOST,
                credentials=credentials,
            )
        )
        channel = connection.channel()

        queues_to_purge = [
            f"stage_tasks.{AGENT_ID}" if AGENT_ID else None,
            "stage_tasks",
            "stage_results",
            "step_progress",
        ]

        for q in queues_to_purge:
            if not q:
                continue
            try:
                msg_count = channel.queue_purge(queue=q)
                print(f"[OK] Purged {msg_count} message(s) from queue '{q}'.")
            except Exception as e:
                print(f"[SKIP] Could not purge queue '{q}': {e}")

        connection.close()
        print("[SUCCESS] All pending messages in RabbitMQ queues have been cleared!")
    except Exception as err:
        print(f"[ERROR] Failed to connect to RabbitMQ: {err}")

if __name__ == "__main__":
    run()
