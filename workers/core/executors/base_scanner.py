import os
import re
import subprocess
import logging

logger = logging.getLogger(__name__)


def get_clean_version_from_output(output: str, pattern: str) -> str:
    """Extract clean version string from raw process output using regex pattern."""
    match = re.search(pattern, output, re.IGNORECASE)
    if match:
        return match.group(1).strip()
    return ""


def get_executable_version(exe_path: str, version_flag: str, pattern: str, timeout_sec: int = 5) -> str:
    """
    Execute binary with version flag and extract cleaned version string.
    Safely bypasses Windows Store 0-byte execution aliases and suppresses popups.
    """
    try:
        # Ignore 0-byte Windows Store alias stubs that can hang or open store dialog
        if "WindowsApps" in exe_path and os.path.getsize(exe_path) == 0:
            return ""

        creation_flags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
        result = subprocess.run(
            [exe_path, version_flag],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            timeout=timeout_sec,
            creationflags=creation_flags,
        )
        return get_clean_version_from_output(result.stdout, pattern)
    except Exception as e:
        logger.debug(f"Failed to query version for executable '{exe_path}': {e}")
        return ""


def normalize_executable_path(exe_path: str) -> str:
    """Normalize absolute executable path with forward slashes."""
    return os.path.abspath(exe_path).replace("\\", "/")
