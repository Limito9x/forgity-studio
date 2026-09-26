import threading
import time
import logging
from core.config import load_config, save_config
from core.system.hardware import get_hardware_snapshot
from commands import connect
from commands.rescan_hardware import sync_hardware_to_backend

logger = logging.getLogger(__name__)

try:
    from worker.pipeline_consumer import PipelineConsumer
except Exception as e:
    PipelineConsumer = None


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
            config["hardwareProfile"] = {
                "osPlatform": current_hw["os_platform"],
                "cpuModel": current_hw["cpu_model"],
                "totalRamBytes": current_hw["total_ram_bytes"],
                "primaryGpuName": current_hw["primary_gpu_name"],
                "primaryGpuVramBytes": current_hw["primary_gpu_vram_bytes"],
                "lastScannedAt": current_hw["scanned_at"],
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

    # 1. Hardware auto-diff check
    check_and_sync_hardware_diff()

    # 2. Start unified RabbitMQ Pipeline Worker in background thread
    if PipelineConsumer is not None:
        t1 = threading.Thread(target=run_pipeline_worker, daemon=True)
        t1.start()
        print("[OK] Background Pipeline Task Worker thread initialized.")

    # 3. Start gRPC Connect stream to maintain heartbeat & listen for commands from Backend
    print("[OK] Starting gRPC Stream & Command Listener...")
    try:
        connect.run()
    except KeyboardInterrupt:
        print("\n[STOP] Runner daemon stopped.")


