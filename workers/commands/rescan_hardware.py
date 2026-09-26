import os
import sys
import json
import logging
import urllib.request
import urllib.error
from core.config import load_config, save_config, CONFIG_FILE
from core.system.hardware import get_hardware_snapshot, print_summary

logger = logging.getLogger(__name__)


def sync_hardware_to_backend(api_url: str, runner_id: str, hardware_snapshot: dict) -> bool:
    """
    Attempt to push the updated hardware snapshot to the backend server.
    Tolerates offline backend without breaking the local re-scan.
    """
    url = f"{api_url}/runners/{runner_id}/hardware-profile"
    payload = {
        "osPlatform": hardware_snapshot["os_platform"],
        "cpuModel": hardware_snapshot["cpu_model"],
        "totalRamBytes": hardware_snapshot["total_ram_bytes"],
        "primaryGpuName": hardware_snapshot["primary_gpu_name"],
        "primaryGpuVramBytes": hardware_snapshot["primary_gpu_vram_bytes"],
        "hardwareDetails": hardware_snapshot["hardware_details"],
    }

    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        method="POST"
    )

    try:
        with urllib.request.urlopen(req, timeout=5) as response:
            if response.status in (200, 204):
                print(f"[OK] Hardware profile synchronized with server: {url}")
                return True
    except urllib.error.HTTPError as e:
        logger.debug(f"Server returned HTTP {e.code} during hardware sync: {e.read().decode('utf-8', errors='ignore')}")
    except Exception as e:
        logger.debug(f"Could not reach backend to sync hardware: {e}")

    return False


def run():
    """Execute workstation hardware re-scan and update local config cache."""
    print("\nScanning workstation hardware configuration...")
    snapshot = get_hardware_snapshot()
    print_summary()

    # Update local config cache
    config = load_config()
    if config:
        config["hardwareProfile"] = {
            "osPlatform": snapshot["os_platform"],
            "cpuModel": snapshot["cpu_model"],
            "totalRamBytes": snapshot["total_ram_bytes"],
            "primaryGpuName": snapshot["primary_gpu_name"],
            "primaryGpuVramBytes": snapshot["primary_gpu_vram_bytes"],
            "hardwareDetails": snapshot["hardware_details"],
        }
        save_config(config)
        print(f"[OK] Local hardware profile updated in {CONFIG_FILE}")

        # Try to sync with backend if registered
        api_url = config.get("apiUrl")
        runner_id = config.get("agentId") or config.get("runnerId")
        if api_url and runner_id:
            print("[INFO] Syncing updated hardware profile with backend...")
            sync_hardware_to_backend(api_url, runner_id, snapshot)
    else:
        print(f"[NOTE] Runner is not registered yet ({CONFIG_FILE} not found). Hardware specs detected successfully.")

    return snapshot


if __name__ == "__main__":
    run()
