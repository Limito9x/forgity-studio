import platform
from core.daemon.base import BaseServiceManager


def get_service_manager() -> BaseServiceManager:
    """Return the appropriate service manager based on the host operating system."""
    system = platform.system().lower()
    if system == "windows":
        from core.daemon.windows_scheduler import WindowsSchedulerManager
        return WindowsSchedulerManager()
    elif system == "darwin":
        from core.daemon.launchd_manager import LaunchdManager
        return LaunchdManager()
    else:
        # Default to Linux systemd --user
        from core.daemon.systemd_manager import SystemdManager
        return SystemdManager()
