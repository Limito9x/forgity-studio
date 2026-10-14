import os
import sys
import subprocess
from pathlib import Path
from typing import Dict, Any

from core.daemon.base import BaseServiceManager
from core.daemon.constants import SYSTEMD_SERVICE_NAME, APP_NAME
from core.daemon.pid_lock import get_running_pid, terminate_pid
from core.config import WORKERS_ROOT


class SystemdManager(BaseServiceManager):
    """Linux systemd --user service manager for headless runner daemon."""

    def __init__(self, service_name: str = SYSTEMD_SERVICE_NAME):
        self.service_name = service_name
        self.unit_dir = Path.home() / ".config" / "systemd" / "user"
        self.unit_file = self.unit_dir / self.service_name
        self.cli_path = Path(WORKERS_ROOT) / "cli.py"

    def _get_python_path(self) -> Path:
        venv_py = Path(WORKERS_ROOT) / "worker" / "venv" / "bin" / "python"
        if venv_py.exists():
            return venv_py
        dot_venv = Path(WORKERS_ROOT) / ".venv" / "bin" / "python"
        if dot_venv.exists():
            return dot_venv
        return Path(sys.executable)

    def install(self, autostart: bool = True) -> bool:
        self.unit_dir.mkdir(parents=True, exist_ok=True)
        py_exe = self._get_python_path()

        unit_content = f"""[Unit]
Description={APP_NAME} Background Runner Daemon
After=network.target

[Service]
Type=simple
WorkingDirectory={WORKERS_ROOT}
ExecStart={py_exe} {self.cli_path} start
Restart=always
RestartSec=5s
Environment=PYTHONUNBUFFERED=1

[Install]
WantedBy=default.target
"""
        self.unit_file.write_text(unit_content, encoding="utf-8")
        subprocess.run(["systemctl", "--user", "daemon-reload"], check=False)
        # Enable linger so user service survives logout
        user = os.environ.get("USER", "")
        if user:
            subprocess.run(["loginctl", "enable-linger", user], check=False)

        if autostart:
            subprocess.run(["systemctl", "--user", "enable", "--now", self.service_name], check=False)
        else:
            subprocess.run(["systemctl", "--user", "enable", self.service_name], check=False)

        print(f"[OK] systemd user unit '{self.service_name}' installed and configured.")
        return True

    def uninstall(self) -> bool:
        self.stop()
        subprocess.run(["systemctl", "--user", "disable", self.service_name], check=False)
        self.unit_file.unlink(missing_ok=True)
        subprocess.run(["systemctl", "--user", "daemon-reload"], check=False)
        print(f"[OK] systemd unit '{self.service_name}' uninstalled.")
        return True

    def start(self) -> bool:
        res = subprocess.run(["systemctl", "--user", "start", self.service_name])
        return res.returncode == 0

    def stop(self) -> bool:
        res = subprocess.run(["systemctl", "--user", "stop", self.service_name])
        # Also ensure PID is cleaned
        pid = get_running_pid()
        if pid:
            terminate_pid(pid)
        return res.returncode == 0

    def restart(self) -> bool:
        res = subprocess.run(["systemctl", "--user", "restart", self.service_name])
        return res.returncode == 0

    def status(self) -> Dict[str, Any]:
        pid = get_running_pid()
        is_active = subprocess.run(["systemctl", "--user", "is-active", "--quiet", self.service_name]).returncode == 0
        state = {
            "service_type": "systemd --user",
            "service_name": self.service_name,
            "installed": self.unit_file.exists(),
            "running": is_active or pid is not None,
            "pid": pid,
            "status_text": "RUNNING" if (is_active or pid) else "STOPPED"
        }
        print(f"[{APP_NAME} RUNNER - systemd] Status: {state['status_text']} | PID: {pid}")
        return state
