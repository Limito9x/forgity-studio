import os
import sys
import json
import socket
import urllib.request
import urllib.error
import uuid
from core.config import save_config, load_config, DEFAULT_API_URL, CONFIG_FILE
from core.system.hardware import get_hardware_snapshot


def post_json(url: str, payload: dict):
    data = json.dumps(payload).encode('utf-8')
    headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    }

    req = urllib.request.Request(url, data=data, headers=headers, method='POST')
    try:
        with urllib.request.urlopen(req) as response:
            res_data = response.read().decode('utf-8')
            if res_data:
                return json.loads(res_data)
            return None
    except urllib.error.HTTPError as e:
        error_msg = e.read().decode('utf-8', errors='ignore')
        print(f"\n[HTTP ERROR {e.code}]: {error_msg}")
        return None
    except Exception as e:
        print(f"\n[CONNECTION ERROR]: {str(e)}")
        return None


def get_machine_key() -> str:
    # Machine identifier: Hostname + MAC Address node
    node = uuid.getnode()
    return f"{socket.gethostname()}-{node}"


def run(api_url: str = None, setup_token: str = None, runner_name: str = None, non_interactive: bool = False):
    print("==================================================")
    print("    AUTOMATION RUNNER REGISTRATION CLI (TOKEN)    ")
    print("==================================================")

    if not api_url:
        if non_interactive:
            api_url = DEFAULT_API_URL
        else:
            prompt_url = input(f"Enter API Base URL [{DEFAULT_API_URL}]: ").strip()
            api_url = prompt_url if prompt_url else DEFAULT_API_URL

    # Ensure api_url doesn't end with trailing slash
    api_url = api_url.rstrip("/")

    if not setup_token:
        if non_interactive:
            print("[ERROR] Setup Token cannot be empty in non-interactive mode! Provide --token <token>.")
            sys.exit(1)
        print("\n--- Register Runner via Setup Token ---")
        setup_token = input("Enter Setup Token (obtained from Web Dashboard): ").strip()

    if not setup_token:
        print("[ERROR] Setup Token cannot be empty!")
        sys.exit(1)

    hostname = runner_name.strip() if runner_name else socket.gethostname()
    machine_key = get_machine_key()

    print("\n[HOST INFORMATION]")
    print(f" - Hostname    : {hostname}")
    print(f" - Machine Key : {machine_key}")
    print(f" - Setup Token : {setup_token}")

    print("\nSending runner registration request...")

    register_payload = {
        "setupToken": setup_token,
        "name": hostname,
        "machineKey": machine_key
    }

    result = post_json(f"{api_url}/runners/register-token", register_payload)

    # Fallback to legacy endpoint if /runners/register-token 404s
    if not result:
        result = post_json(f"{api_url}/agents/register-token", register_payload)

    if not result or 'registrationToken' not in result:
        print("\n[ERROR] Runner registration failed! Token is invalid or expired.")
        sys.exit(1)

    print("\n==================================================")
    print(" [OK] RUNNER REGISTERED AND ACTIVATED SUCCESSFULLY!")
    print("==================================================")
    runner_id = result.get('id')
    runner_name = result.get('name')
    print(f" - Runner ID     : {runner_id}")
    print(f" - Runner Name   : {runner_name}")

    # Gather initial hardware profile snapshot
    print("\nScanning local hardware profile...")
    hw_snapshot = get_hardware_snapshot()
    from datetime import datetime, timezone
    from commands.rescan_hardware import sync_hardware_to_backend

    now_iso = datetime.now(timezone.utc).isoformat()

    # Save to local configuration
    rabbitmq_payload = result.get("rabbitMq")
    rabbitmq_config = None
    if isinstance(rabbitmq_payload, dict):
        rabbitmq_config = {
            "host": rabbitmq_payload.get("host") or "localhost",
            "port": rabbitmq_payload.get("port") or 5672,
            "username": rabbitmq_payload.get("username") or "guest",
            "password": rabbitmq_payload.get("password") or "guest",
            "virtual_host": rabbitmq_payload.get("virtualHost") or "/",
        }

    config = {
        **(load_config() or {}),
        "apiUrl": api_url,
        "runnerId": runner_id,
        "agentId": runner_id,  # backward compatibility
        "name": runner_name,
        "machineKey": result.get("machineKey") or machine_key,
        "runnerSecret": result.get("registrationToken"),
        "agentSecret": result.get("registrationToken"),  # backward compatibility
        "hardwareProfile": {
            "osPlatform": hw_snapshot["os_platform"],
            "cpuModel": hw_snapshot["cpu_model"],
            "totalRamBytes": hw_snapshot["total_ram_bytes"],
            "primaryGpuName": hw_snapshot["primary_gpu_name"],
            "primaryGpuVramBytes": hw_snapshot["primary_gpu_vram_bytes"],
            "hardwareDetails": hw_snapshot.get("hardware_details"),
            "lastScannedAt": now_iso,
        }
    }

    if rabbitmq_config:
        config["rabbitmq"] = rabbitmq_config

    grpc_url = result.get("grpcUrl") or result.get("grpc_url")
    if grpc_url:
        config["grpcUrl"] = grpc_url
        print(f" - Dedicated gRPC URL : {grpc_url}")

    save_config(config)
    print(f"\n[OK] Configuration securely saved to: {os.path.abspath(CONFIG_FILE)}")

    # Sync hardware specs to Backend API
    print("[INFO] Uploading initial hardware profile to Automation Studio...")
    sync_hardware_to_backend(api_url, runner_id, hw_snapshot)

    print("\nRunner is ready! Run 'runner.bat start' to launch background workers and gRPC stream.")

