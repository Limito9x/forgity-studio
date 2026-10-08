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
WORKERS_ROOT = Path(__file__).resolve().parents[1]
CONFIG_FILE = str(Path(os.getenv("WORKER_CONFIG_FILE") or WORKERS_ROOT / "agent_config.json").resolve())
DEFAULT_API_URL = os.getenv("API_URL") or "http://localhost:5189/api"

def load_config():
    if not os.path.exists(CONFIG_FILE):
        return None
    try:
        with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
            config = json.load(f)
        if not isinstance(config, dict):
            raise ValueError("Worker configuration must be a JSON object.")
        return config
    except (OSError, ValueError) as exc:
        raise ValueError(f"Cannot read worker configuration: {CONFIG_FILE}") from exc

def get_config():
    config = load_config()
    if not config:
        print(f"Error: {CONFIG_FILE} not found. Please run 'runner.bat register' first.")
        import sys
        sys.exit(1)
    return config

def save_config(config_data: dict, filepath: str = CONFIG_FILE) -> bool:
    """Save configuration dictionary to JSON file."""
    import tempfile
    temp_path = None
    try:
        target = Path(filepath).resolve()
        target.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(mode="w", dir=target.parent, suffix=".tmp", delete=False, encoding="utf-8") as f:
            temp_path = f.name
            json.dump(config_data, f, indent=4)
            f.flush()
            os.fsync(f.fileno())
        os.replace(temp_path, target)
        return True
    except Exception as e:
        print(f"[ERROR] Failed to save configuration to '{filepath}': {e}")
        return False
    finally:
        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)

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
AGENT_ID = os.getenv("AGENT_ID") or (_cfg.get("agentId") or _cfg.get("runnerId") or _cfg.get("agent_id") or _cfg.get("id") if isinstance(_cfg, dict) else None)

def get_rabbitmq_parameters(host=None, port=None, heartbeat=0):
    """Use the same TLS and timeout settings for consumers and diagnostics."""
    import pika
    import ssl
    environment = str(os.getenv("WORKER_ENVIRONMENT", _cfg.get("environment", "development"))).lower()
    if environment not in ("development", "trial", "production"):
        raise ValueError("Worker environment must be development, trial or production.")
    trial = environment in ("trial", "production")
    tls = str(os.getenv("RABBITMQ_TLS", _rmq_cfg.get("tls", False))).lower() in ("true", "1")
    if trial and (RABBITMQ_USER == "guest" or RABBITMQ_PASSWORD == "guest" or not RABBITMQ_PASSWORD or not tls):
        raise ValueError("Trial requires RabbitMQ TLS and dedicated credentials; set RABBITMQ_PASSWORD externally.")
    ssl_options = None
    if tls:
        ca = os.getenv("RABBITMQ_CA_FILE") or _rmq_cfg.get("ca_file")
        context = ssl.create_default_context(cafile=ca or None)
        ssl_options = pika.SSLOptions(context, host or RABBITMQ_HOST)
    return pika.ConnectionParameters(
        host=host or RABBITMQ_HOST, port=port or RABBITMQ_PORT,
        virtual_host=RABBITMQ_VHOST, credentials=get_rabbitmq_credentials(),
        ssl_options=ssl_options, heartbeat=heartbeat,
        connection_attempts=1, socket_timeout=10, stack_timeout=15,
        blocked_connection_timeout=30,
    )

def get_rabbitmq_credentials():
    import pika
    return pika.PlainCredentials(RABBITMQ_USER, RABBITMQ_PASSWORD)
