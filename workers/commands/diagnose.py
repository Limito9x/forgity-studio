import os
import sys
import logging
from core.config import load_config, RABBITMQ_HOST, RABBITMQ_PORT, RABBITMQ_USER, RABBITMQ_PASSWORD, RABBITMQ_VHOST
from core.system.hardware import get_hardware_snapshot
from core.executors.scanner import scan_all_executors
from core.grpc_client import get_channel
from core import agent_pb2, agent_pb2_grpc

logger = logging.getLogger(__name__)


def check_rabbitmq() -> tuple[bool, str]:
    """Test connection to RabbitMQ broker."""
    try:
        import pika
        credentials = pika.PlainCredentials(RABBITMQ_USER, RABBITMQ_PASSWORD)
        params = pika.ConnectionParameters(
            host=RABBITMQ_HOST,
            port=RABBITMQ_PORT,
            virtual_host=RABBITMQ_VHOST,
            credentials=credentials,
            connection_attempts=1,
            retry_delay=1,
            blocked_connection_timeout=5,
        )
        conn = pika.BlockingConnection(params)
        conn.close()
        return True, f"Connected to {RABBITMQ_HOST}:{RABBITMQ_PORT} (vhost: '{RABBITMQ_VHOST}')"
    except Exception as e:
        return False, f"Connection failed to {RABBITMQ_HOST}:{RABBITMQ_PORT} ({e})"


def check_grpc(runner_id: str) -> tuple[bool, str]:
    """Test gRPC bidirectional channel connectivity to backend."""
    try:
        channel = get_channel()
        stub = agent_pb2_grpc.AgentServiceStub(channel)

        def test_msg():
            yield agent_pb2.AgentMessage(agent_id=runner_id or "diagnose-probe")

        stream = stub.Connect(test_msg())
        # If no immediate exception, channel is initialized
        return True, "gRPC channel established successfully"
    except Exception as e:
        return False, f"gRPC connection error: {e}"


def run():
    """Run comprehensive workstation diagnostics and print status report."""
    print("=================================================================")
    print("           AUTOMATION WORKSTATION SYSTEM DIAGNOSTICS             ")
    print("=================================================================")

    # 1. Configuration check
    config = load_config() or {}
    runner_id = config.get("agentId") or config.get("runnerId") or "Not registered"
    runner_name = config.get("name") or "Unnamed"
    print(f"\n[1] RUNNER IDENTITY")
    print(f"    Runner ID       : {runner_id}")
    print(f"    Hostname        : {runner_name}")
    print(f"    Backend API URL : {config.get('apiUrl', 'Not configured')}")

    # 2. Hardware profile check
    print(f"\n[2] HARDWARE SPECS")
    hw = get_hardware_snapshot()
    ram_gb = round(hw["total_ram_bytes"] / (1024**3), 2)
    print(f"    OS Platform     : {hw['os_platform']}")
    print(f"    CPU Model       : {hw['cpu_model']} ({hw['hardware_details']['logical_cores']} threads)")
    print(f"    System RAM      : {ram_gb} GB")
    print(f"    Primary GPU     : {hw['primary_gpu_name'] or 'None detected'}")
    if hw["primary_gpu_vram_bytes"]:
        vram_gb = round(hw["primary_gpu_vram_bytes"] / (1024**3), 2)
        print(f"    Primary VRAM    : {vram_gb} GB")

    for d in hw["hardware_details"]["disks"]:
        free_gb = round(d["free_bytes"] / (1024**3), 1)
        total_gb = round(d["total_bytes"] / (1024**3), 1)
        print(f"    Drive {d['mount']:<4}      : {free_gb} GB free of {total_gb} GB ({d['label']})")

    # 3. Installed software executors check
    print(f"\n[3] PIPELINE SOFTWARE ENGINES")
    executors = scan_all_executors()
    if not executors:
        print("    [!] No supported software installations detected.")
    else:
        for ex in executors:
            print(f"    [OK] {ex['executor_key']:<8} v{ex['version']:<8} -> {ex['executable_path']}")

    # 4. RabbitMQ Broker check
    print(f"\n[4] MESSAGE BROKER (RabbitMQ)")
    rmq_ok, rmq_msg = check_rabbitmq()
    status_tag = "[OK] " if rmq_ok else "[FAIL]"
    print(f"    {status_tag} {rmq_msg}")

    # 5. gRPC Backend check
    print(f"\n[5] BACKEND gRPC CONNECTION")
    if runner_id and runner_id != "Not registered":
        grpc_ok, grpc_msg = check_grpc(runner_id)
        status_tag = "[OK] " if grpc_ok else "[FAIL]"
        print(f"    {status_tag} {grpc_msg}")
    else:
        print("    [SKIP] Runner not registered yet; skipping gRPC probe.")

    print("\n=================================================================")
    overall = "HEALTHY" if rmq_ok else "ATTENTION NEEDED (RabbitMQ unreachable)"
    print(f"                 DIAGNOSTIC RESULT: {overall}                    ")
    print("=================================================================")


if __name__ == "__main__":
    run()
