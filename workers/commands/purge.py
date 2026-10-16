import logging
import os
import sys
import pika

from core.config import (
    RABBITMQ_HOST,
    RABBITMQ_PORT,
    RABBITMQ_USER,
    RABBITMQ_PASSWORD,
    RABBITMQ_VHOST,
    AGENT_ID,
    get_rabbitmq_parameters,
)

logger = logging.getLogger(__name__)


def run():
    print("[*] Connecting to RabbitMQ to purge pending queue messages...")
    try:
        connection = pika.BlockingConnection(
            get_rabbitmq_parameters(heartbeat=60)
        )

        queues_to_purge = [
            f"stage_tasks.{AGENT_ID}" if AGENT_ID else None,
            "stage_tasks",
            "stage_results",
            "step_progress",
        ]

        total_purged = 0
        for q in queues_to_purge:
            if not q:
                continue
            try:
                ch = connection.channel()
                res = ch.queue_purge(queue=q)
                count = getattr(res.method, "message_count", res)
                total_purged += int(count) if isinstance(count, (int, str)) and str(count).isdigit() else 0
                print(f"[OK] Purged {count} message(s) from queue '{q}'.")
                ch.close()
            except Exception as e:
                # 403 ACCESS_REFUSED is expected for queues outside runner scope due to queue isolation policy
                print(f"[SKIP] Queue '{q}': {e}")

        connection.close()
        print(f"[SUCCESS] Purge completed! ({total_purged} total message(s) cleared)")
    except Exception as err:
        print(f"[ERROR] Failed to connect to RabbitMQ: {err}")


if __name__ == "__main__":
    run()
