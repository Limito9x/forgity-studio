import json
import os
from pathlib import Path

# 1. Tìm và nạp file .env nếu có
try:
    from dotenv import load_dotenv
    current_path = Path(__file__).resolve()
    for parent in current_path.parents:
        dotenv_file = parent / ".env"
        if dotenv_file.exists():
            load_dotenv(dotenv_file)
            break
except ImportError:
    pass

# 2. File cấu hình Agent (JSON)
CONFIG_FILE = "agent_config.json"
DEFAULT_API_URL = os.getenv("API_URL") or "http://localhost:5189/api"

def load_config():
    if not os.path.exists(CONFIG_FILE):
        return None
    try:
        with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return None

def get_config():
    config = load_config()
    if not config:
        print(f"Error: {CONFIG_FILE} not found. Please run 'runner.bat register' first.")
        import sys
        sys.exit(1)
    return config

def save_config(config_data: dict, filepath: str = CONFIG_FILE) -> bool:
    """Save configuration dictionary to JSON file."""
    try:
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(config_data, f, indent=4)
        return True
    except Exception as e:
        print(f"[ERROR] Failed to save configuration to '{filepath}': {e}")
        return False

# 3. Thông số kết nối RabbitMQ dùng chung (Ưu tiên: .env -> agent_config.json -> Mặc định "guest")
_cfg = load_config() or {}
_rmq_cfg = _cfg.get("rabbitmq") if isinstance(_cfg, dict) else {}
if not isinstance(_rmq_cfg, dict):
    _rmq_cfg = {}

RABBITMQ_HOST = os.getenv("RABBITMQ_HOST") or _rmq_cfg.get("host") or "localhost"
RABBITMQ_PORT = int(os.getenv("RABBITMQ_PORT") or _rmq_cfg.get("port") or 5672)
RABBITMQ_USER = os.getenv("RABBITMQ_USER") or _rmq_cfg.get("username") or "guest"
RABBITMQ_PASSWORD = os.getenv("RABBITMQ_PASSWORD") or _rmq_cfg.get("password") or "guest"
RABBITMQ_VHOST = os.getenv("RABBITMQ_VHOST") or _rmq_cfg.get("virtual_host") or "/"
AGENT_ID = os.getenv("AGENT_ID") or (_cfg.get("agentId") or _cfg.get("agent_id") or _cfg.get("id") if isinstance(_cfg, dict) else None)

def get_rabbitmq_credentials():
    import pika
    return pika.PlainCredentials(RABBITMQ_USER, RABBITMQ_PASSWORD)
