import atexit
import signal
import sys
import threading
import time
import logging
from logging.handlers import RotatingFileHandler
from pathlib import Path

from core.config import load_config, save_config, get_rabbitmq_parameters, WORKERS_ROOT
from core.runtime_storage import settings
from core.system.hardware import get_hardware_snapshot
from core.daemon.pid_lock import acquire_pid, release_pid, get_running_pid
from commands import connect
from commands.rescan_hardware import sync_hardware_to_backend

# Configure rotating file logger
log_dir = Path(WORKERS_ROOT) / "worker" / "logs"
log_dir.mkdir(parents=True, exist_ok=True)
log_file = log_dir / "runner.log"

root_logger = logging.getLogger()
root_logger.setLevel(logging.INFO)

formatter = logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s", datefmt="%H:%M:%S")

# Console handler
console_handler = logging.StreamHandler(sys.stdout)
console_handler.setFormatter(formatter)
root_logger.addHandler(console_handler)

# Rotating file handler (20MB x 5 backups)
file_handler = RotatingFileHandler(str(log_file), maxBytes=20 * 1024 * 1024, backupCount=5, encoding="utf-8")
file_handler.setFormatter(formatter)
root_logger.addHandler(file_handler)

logger = logging.getLogger(__name__)

_pipeline_import_error = None
try:
    from worker.pipeline_consumer import PipelineConsumer
except Exception as e:
    PipelineConsumer = None
    _pipeline_import_error = e
    logger.exception(f"Failed to import PipelineConsumer: {e}")


def check_and_sync_hardware_diff():
    """
    Check if workstation hardware has changed since last startup.
    If a change is detected, update the local configuration and sync to backend.
    """
    try:
        config = load_config() or {}
        cached_hw = config.get("hardwareProfile")
        current_hw = get_hardware_snapshot()

        has_diff = False
        if not cached_hw:
            has_diff = True
        else:
            # Check key hardware indicators
            if (
                cached_hw.get("cpuModel") != current_hw["cpu_model"]
                or cached_hw.get("primaryGpuName") != current_hw["primary_gpu_name"]
                or abs(cached_hw.get("totalRamBytes", 0) - current_hw["total_ram_bytes"]) > 1024 * 1024 * 1024 # > 1GB delta
            ):
                has_diff = True

        if has_diff:
            print("[INFO] Hardware configuration change detected. Updating local profile snapshot...")
            from datetime import datetime, timezone
            config["hardwareProfile"] = {
                "osPlatform": current_hw["os_platform"],
                "cpuModel": current_hw["cpu_model"],
                "totalRamBytes": current_hw["total_ram_bytes"],
                "primaryGpuName": current_hw["primary_gpu_name"],
                "primaryGpuVramBytes": current_hw["primary_gpu_vram_bytes"],
                "hardwareDetails": current_hw.get("hardware_details"),
                "lastScannedAt": datetime.now(timezone.utc).isoformat(),
            }
            save_config(config)

            runner_id = config.get("agentId") or config.get("runnerId")
            api_url = config.get("apiUrl")
            if runner_id and api_url:
                sync_hardware_to_backend(api_url, runner_id, current_hw)
    except Exception as e:
        logger.warning(f"Error checking hardware profile on boot: {e}")


def run_pipeline_worker():
    if PipelineConsumer is None:
        return
    while True:
        try:
            consumer = PipelineConsumer()
            consumer.start()
        except KeyboardInterrupt:
            break
        except Exception as e:
            print(f"[WARNING] [RabbitMQ] Pipeline Worker disconnected: {e}. Reconnecting in 3s...")
            time.sleep(3)


def run():
    print("[INFO] Starting Automation Runner Daemon...")

    # Single-instance enforcement
    if not acquire_pid():
        running_pid = get_running_pid()
        print(f"[ERROR] Another runner instance is already running (PID: {running_pid}).")
        print("        Use 'runner service status' or 'runner service stop' to manage it.")
        sys.exit(1)

    atexit.register(release_pid)

    def handle_signal(sig, frame):
        print(f"\n[INFO] Received signal {sig}, terminating gracefully...")
        release_pid()
        sys.exit(0)

    try:
        signal.signal(signal.SIGINT, handle_signal)
        signal.signal(signal.SIGTERM, handle_signal)
    except Exception:
        pass

    try:
        # Fail invalid deployment settings before entering the reconnect loop.
        settings()
        get_rabbitmq_parameters()

        # 1. Hardware auto-diff check
        check_and_sync_hardware_diff()

        # 2. Start unified RabbitMQ Pipeline Worker in background thread
        if PipelineConsumer is not None:
            t1 = threading.Thread(target=run_pipeline_worker, daemon=True)
            t1.start()
            print("[OK] Background Pipeline Task Worker thread initialized.")
        else:
            print(f"[ERROR] Background Pipeline Task Worker could not start due to import failure: {_pipeline_import_error}")

        # 3. Start gRPC Connect stream to maintain heartbeat & listen for commands from Backend
        print("[OK] Starting gRPC Stream & Command Listener...")
        connect.run()
    except KeyboardInterrupt:
        print("\n[STOP] Runner daemon stopped.")
    finally:
        release_pid()


