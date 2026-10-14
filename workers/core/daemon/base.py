import os
import sys
import time
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Dict, Any

from core.daemon.constants import LOG_FILE_NAME
from core.config import WORKERS_ROOT


def get_log_file_path() -> Path:
    """Return path to runner centralized log file."""
    logs_dir = Path(WORKERS_ROOT) / "worker" / "logs"
    logs_dir.mkdir(parents=True, exist_ok=True)
    return logs_dir / LOG_FILE_NAME


class BaseServiceManager(ABC):
    """Abstract Base Class for OS native daemon/service managers."""

    @abstractmethod
    def install(self, autostart: bool = True) -> bool:
        """Register the runner daemon with the OS supervisor."""
        pass

    @abstractmethod
    def uninstall(self) -> bool:
        """Remove the runner daemon from the OS supervisor."""
        pass

    @abstractmethod
    def start(self) -> bool:
        """Start the daemon in background."""
        pass

    @abstractmethod
    def stop(self) -> bool:
        """Stop the running daemon."""
        pass

    @abstractmethod
    def restart(self) -> bool:
        """Restart the daemon."""
        pass

    @abstractmethod
    def status(self) -> Dict[str, Any]:
        """Return status dictionary: is_running, pid, description, etc."""
        pass

    def logs(self, lines: int = 50, follow: bool = False):
        """Display last N lines from log file, optionally following new output."""
        log_path = get_log_file_path()
        if not log_path.exists():
            print(f"[INFO] No log file found at {log_path}. Start the runner first.")
            return

        print(f"--- Displaying logs from {log_path} (Last {lines} lines) ---")
        try:
            with open(log_path, "r", encoding="utf-8", errors="replace") as f:
                all_lines = f.readlines()
                tail_lines = all_lines[-lines:] if len(all_lines) > lines else all_lines
                for line in tail_lines:
                    sys.stdout.write(line)
                sys.stdout.flush()

                if follow:
                    print("\n--- Streaming logs (Press Ctrl+C to exit) ---")
                    f.seek(0, os.SEEK_END)
                    while True:
                        new_line = f.readline()
                        if new_line:
                            sys.stdout.write(new_line)
                            sys.stdout.flush()
                        else:
                            time.sleep(0.3)
        except KeyboardInterrupt:
            print("\n[INFO] Stopped log streaming.")
        except Exception as e:
            print(f"[ERROR] Failed to read log file: {e}")
