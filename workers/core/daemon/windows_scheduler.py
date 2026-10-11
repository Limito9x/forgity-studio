import os
import sys
import subprocess
from pathlib import Path
from typing import Dict, Any, Optional

from core.daemon.base import BaseServiceManager
from core.daemon.constants import WINDOWS_TASK_NAME, APP_NAME
from core.daemon.pid_lock import get_running_pid, terminate_pid
from core.config import WORKERS_ROOT


def get_python_executables() -> tuple[Path, Path]:
    """
    Locate python.exe and pythonw.exe in worker virtualenv or current Python environment.
    Returns (python_exe, pythonw_exe).
    """
    # 1. Check local virtual environment
    candidates = [
        Path(WORKERS_ROOT) / "worker" / "venv" / "Scripts",
        Path(WORKERS_ROOT) / ".venv" / "Scripts",
        Path(WORKERS_ROOT) / "venv" / "Scripts",
        Path(sys.executable).parent
    ]
    for candidate in candidates:
        py_exe = candidate / "python.exe"
        pyw_exe = candidate / "pythonw.exe"
        if py_exe.exists():
            return py_exe, (pyw_exe if pyw_exe.exists() else py_exe)

    current_py = Path(sys.executable)
    pyw = current_py.parent / "pythonw.exe"
    return current_py, (pyw if pyw.exists() else current_py)


class WindowsSchedulerManager(BaseServiceManager):
    """
    Windows Process Supervisor using Task Scheduler (On Logon).
    Runs under the current user session to retain 100% GPU acceleration (CUDA, OptiX, D3D)
    and avoids Session 0 isolation crashes.
    """

    def __init__(self, task_name: str = WINDOWS_TASK_NAME):
        self.task_name = task_name
        self.cli_path = Path(WORKERS_ROOT) / "cli.py"

    def _run_schtasks(self, cmd_args: str) -> tuple[int, str]:
        cmd = f"schtasks {cmd_args}"
        res = subprocess.run(cmd, shell=True, capture_output=True, text=True)
        return res.returncode, (res.stdout + res.stderr).strip()

    REG_RUN_KEY_NAME = "AutomationRunnerDaemon"

    def _is_reg_installed(self) -> bool:
        try:
            import winreg
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\Run", 0, winreg.KEY_READ) as key:
                winreg.QueryValueEx(key, self.REG_RUN_KEY_NAME)
                return True
        except Exception:
            return False

    def _install_reg(self, target_cmd: str) -> bool:
        try:
            import winreg
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\Run", 0, winreg.KEY_SET_VALUE) as key:
                winreg.SetValueEx(key, self.REG_RUN_KEY_NAME, 0, winreg.REG_SZ, target_cmd)
            return True
        except Exception as e:
            print(f"[ERROR] Failed to set HKCU Run key: {e}")
            return False

    def _uninstall_reg(self) -> bool:
        try:
            import winreg
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\Run", 0, winreg.KEY_SET_VALUE) as key:
                winreg.DeleteValue(key, self.REG_RUN_KEY_NAME)
            return True
        except Exception:
            return False

    def is_task_registered(self) -> bool:
        code, _ = self._run_schtasks(f'/query /tn "{self.task_name}"')
        return code == 0 or self._is_reg_installed()

    def install(self, autostart: bool = True) -> bool:
        _, pyw_exe = get_python_executables()
        cli_py = str(self.cli_path.resolve())

        # Target command: pythonw.exe cli.py start
        target_cmd = f'"{pyw_exe}" "{cli_py}" start'
        schtasks_target = f'\\"{pyw_exe}\\" \\"{cli_py}\\" start'

        print(f"[INFO] Registering Windows Auto-Start Daemon for current user...")

        # 1. Try with Task Scheduler (/rl highest or standard)
        create_args = f'/create /tn "{self.task_name}" /tr "{schtasks_target}" /sc onlogon /f /rl highest'
        code, out = self._run_schtasks(create_args)

        if code != 0:
            create_args = f'/create /tn "{self.task_name}" /tr "{schtasks_target}" /sc onlogon /f'
            code, out = self._run_schtasks(create_args)

        installed_ok = False
        if code == 0:
            print(f"[OK] Task Scheduler task '{self.task_name}' successfully installed.")
            installed_ok = True
        else:
            # 2. Seamless fallback to HKCU Run Key (100% works without Administrator rights)
            print("[INFO] Task Scheduler requires elevated admin privileges.")
            print("[INFO] Fallback: Registering under Windows Current User Startup (HKCU Run Key)...")
            if self._install_reg(target_cmd):
                print(f"[OK] Registered under Windows User Startup (HKCU Run Key: {self.REG_RUN_KEY_NAME}).")
                installed_ok = True

        if installed_ok:
            print("     The runner daemon will start automatically whenever you log into Windows.")
            if autostart:
                return self.start()
            return True
        else:
            print(f"[ERROR] Could not install runner auto-start daemon.")
            return False

    def uninstall(self) -> bool:
        self.stop()
        print(f"[INFO] Removing Windows auto-start daemon...")
        self._run_schtasks(f'/delete /tn "{self.task_name}" /f')
        self._uninstall_reg()
        print(f"[OK] Windows auto-start registrations removed.")
        return True

    def start(self) -> bool:
        pid = get_running_pid()
        if pid:
            print(f"[INFO] Runner daemon is already running (PID: {pid}).")
            return True

        print(f"[INFO] Starting runner daemon via Task Scheduler...")
        if self.is_task_registered():
            code, out = self._run_schtasks(f'/run /tn "{self.task_name}"')
            if code == 0:
                print(f"[OK] Triggered Task Scheduler task '{self.task_name}'.")
                # Wait briefly to check if process starts
                import time
                for _ in range(6):
                    time.sleep(0.5)
                    pid = get_running_pid()
                    if pid:
                        print(f"[OK] Runner daemon started successfully (PID: {pid}).")
                        return True
            else:
                print(f"[WARNING] Task Scheduler run failed: {out}. Spawning background process directly...")

        # Direct background spawn fallback (pythonw.exe without console window)
        _, pyw_exe = get_python_executables()
        creation_flags = 0x08000000 | 0x00000008  # CREATE_NO_WINDOW | DETACHED_PROCESS
        try:
            proc = subprocess.Popen(
                [str(pyw_exe), str(self.cli_path), "start"],
                cwd=str(WORKERS_ROOT),
                creationflags=creation_flags,
                close_fds=True
            )
            print(f"[OK] Background runner process spawned directly (PID: {proc.pid}).")
            return True
        except Exception as e:
            print(f"[ERROR] Failed to start runner daemon: {e}")
            return False

    def stop(self) -> bool:
        pid = get_running_pid()
        if not pid:
            print("[INFO] Runner daemon is not currently running.")
            return True

        print(f"[INFO] Stopping runner daemon (PID: {pid})...")
        stopped = terminate_pid(pid)

        # Also end Task Scheduler task if still active
        if self.is_task_registered():
            self._run_schtasks(f'/end /tn "{self.task_name}"')

        if stopped:
            print("[OK] Runner daemon stopped.")
            return True
        else:
            print(f"[ERROR] Could not terminate process PID: {pid}.")
            return False

    def restart(self) -> bool:
        print("[INFO] Restarting runner daemon...")
        self.stop()
        import time
        time.sleep(1)
        return self.start()

    def status(self) -> Dict[str, Any]:
        pid = get_running_pid()
        task_installed = self.is_task_registered()

        state = {
            "service_type": "Windows Task Scheduler (On Logon)",
            "task_name": self.task_name,
            "installed": task_installed,
            "running": pid is not None,
            "pid": pid,
            "status_text": "RUNNING" if pid else "STOPPED"
        }

        print("==================================================")
        print(f"      {APP_NAME.upper()} RUNNER DAEMON STATUS     ")
        print("==================================================")
        print(f" - State          : {'[ACTIVE / RUNNING]' if pid else '[STOPPED]'}")
        print(f" - Process PID    : {pid if pid else 'None'}")
        print(f" - Auto-Start     : {'Installed (At Logon)' if task_installed else 'Not installed'}")
        print(f" - Task Scheduler : {self.task_name}")
        print("==================================================")

        return state
