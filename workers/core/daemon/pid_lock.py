import os
import sys
import time
import signal
import subprocess
from pathlib import Path
from typing import Optional

from core.daemon.constants import PID_FILE_NAME
from core.config import WORKERS_ROOT


def get_pid_file_path() -> Path:
    """Return path to runner.pid file located inside worker runtime directory."""
    runtime_dir = Path(WORKERS_ROOT) / "worker" / "runtime"
    runtime_dir.mkdir(parents=True, exist_ok=True)
    return runtime_dir / PID_FILE_NAME


def is_process_running(pid: int) -> bool:
    """Check if process with given PID exists and is actively running."""
    if pid <= 0:
        return False
    if os.name == "nt":
        try:
            # Query tasklist for exact PID on Windows
            cmd = f'tasklist /FI "PID eq {pid}" /NH'
            out = subprocess.check_output(cmd, shell=True, text=True, stderr=subprocess.DEVNULL)
            return str(pid) in out
        except Exception:
            return False
    else:
        try:
            os.kill(pid, 0)
            return True
        except OSError:
            return False


def get_running_pid() -> Optional[int]:
    """Read PID file and return PID if process is actively running, else None."""
    pid_path = get_pid_file_path()
    if not pid_path.exists():
        return None
    try:
        content = pid_path.read_text(encoding="utf-8").strip()
        if not content:
            return None
        pid = int(content)
        if is_process_running(pid):
            return pid
        # Process is dead but PID file remains -> stale file
        pid_path.unlink(missing_ok=True)
        return None
    except Exception:
        return None


def acquire_pid() -> bool:
    """
    Acquire PID lock for the current process.
    Returns True if successfully locked, False if another instance is already running.
    """
    running_pid = get_running_pid()
    if running_pid and running_pid != os.getpid():
        return False

    pid_path = get_pid_file_path()
    try:
        pid_path.write_text(str(os.getpid()), encoding="utf-8")
        return True
    except Exception as e:
        print(f"[ERROR] Failed to write PID file {pid_path}: {e}")
        return False


def release_pid():
    """Remove PID file on graceful shutdown."""
    pid_path = get_pid_file_path()
    try:
        if pid_path.exists():
            content = pid_path.read_text(encoding="utf-8").strip()
            if content and int(content) == os.getpid():
                pid_path.unlink(missing_ok=True)
    except Exception:
        pass


def terminate_pid(pid: int, timeout_sec: int = 8) -> bool:
    """
    Terminate process by PID. First attempts graceful SIGTERM / WM_CLOSE,
    then forces kill if process does not exit within timeout.
    """
    if not is_process_running(pid):
        return True

    print(f"[INFO] Stopping runner process (PID: {pid})...")
    if os.name == "nt":
        # On Windows, try taskkill without /F first, then fallback to /F
        try:
            subprocess.run(f"taskkill /T /PID {pid}", shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except Exception:
            pass

        start_time = time.time()
        while time.time() - start_time < timeout_sec:
            if not is_process_running(pid):
                return True
            time.sleep(0.5)

        # Force kill if still alive
        try:
            subprocess.run(f"taskkill /F /T /PID {pid}", shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except Exception:
            pass
    else:
        try:
            os.kill(pid, signal.SIGTERM)
        except OSError:
            return True

        start_time = time.time()
        while time.time() - start_time < timeout_sec:
            if not is_process_running(pid):
                return True
            time.sleep(0.5)

        try:
            os.kill(pid, signal.SIGKILL)
        except OSError:
            pass

    return not is_process_running(pid)
