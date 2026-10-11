import os
import sys
import subprocess
from pathlib import Path
from typing import Dict, Any

from core.daemon.base import BaseServiceManager
from core.daemon.constants import LAUNCHD_PLIST_NAME, APP_NAME
from core.daemon.pid_lock import get_running_pid, terminate_pid
from core.config import WORKERS_ROOT


class LaunchdManager(BaseServiceManager):
    """macOS launchd LaunchAgent manager for runner daemon."""

    def __init__(self, plist_name: str = LAUNCHD_PLIST_NAME):
        self.plist_name = plist_name
        self.agent_dir = Path.home() / "Library" / "LaunchAgents"
        self.plist_file = self.agent_dir / self.plist_name
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
        self.agent_dir.mkdir(parents=True, exist_ok=True)
        py_exe = self._get_python_path()

        plist_content = f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>{self.plist_name.replace(".plist", "")}</string>
    <key>ProgramArguments</key>
    <array>
        <string>{py_exe}</string>
        <string>{self.cli_path}</string>
        <string>start</string>
    </array>
    <key>WorkingDirectory</key>
    <string>{WORKERS_ROOT}</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardErrorPath</key>
    <string>{WORKERS_ROOT}/worker/logs/runner.log</string>
    <key>StandardOutPath</key>
    <string>{WORKERS_ROOT}/worker/logs/runner.log</string>
</dict>
</plist>
"""
        self.plist_file.write_text(plist_content, encoding="utf-8")
        if autostart:
            subprocess.run(["launchctl", "load", "-w", str(self.plist_file)], check=False)
        print(f"[OK] launchd LaunchAgent '{self.plist_name}' installed.")
        return True

    def uninstall(self) -> bool:
        self.stop()
        subprocess.run(["launchctl", "unload", str(self.plist_file)], check=False)
        self.plist_file.unlink(missing_ok=True)
        print(f"[OK] launchd LaunchAgent '{self.plist_name}' uninstalled.")
        return True

    def start(self) -> bool:
        res = subprocess.run(["launchctl", "start", self.plist_name.replace(".plist", "")])
        return res.returncode == 0

    def stop(self) -> bool:
        subprocess.run(["launchctl", "stop", self.plist_name.replace(".plist", "")], check=False)
        pid = get_running_pid()
        if pid:
            terminate_pid(pid)
        return True

    def restart(self) -> bool:
        self.stop()
        return self.start()

    def status(self) -> Dict[str, Any]:
        pid = get_running_pid()
        state = {
            "service_type": "macOS launchd",
            "plist_name": self.plist_name,
            "installed": self.plist_file.exists(),
            "running": pid is not None,
            "pid": pid,
            "status_text": "RUNNING" if pid else "STOPPED"
        }
        print(f"[{APP_NAME} RUNNER - launchd] Status: {state['status_text']} | PID: {pid}")
        return state
