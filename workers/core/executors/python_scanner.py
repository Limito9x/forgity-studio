import os
import sys
import glob
import shutil
import subprocess
import re
import logging
from .base_scanner import get_executable_version, normalize_executable_path

logger = logging.getLogger(__name__)


def scan_python_executables() -> list[dict]:
    """
    Discover all installed Python environments on the host machine.
    Returns:
        list of [{"executor_key": "python", "executable_path": str, "version": str}]
    """
    found_paths = set()

    # 1. Currently executing Python interpreter
    if sys.executable and os.path.exists(sys.executable):
        found_paths.add(os.path.abspath(sys.executable))

    # 2. System PATH lookups
    for name in ["python", "python3", "python3.13", "python3.12", "python3.11", "python3.10", "python3.9"]:
        p = shutil.which(name)
        if p and os.path.exists(p):
            found_paths.add(os.path.abspath(p))

    # 3. Windows-specific discovery
    if os.name == "nt":
        # 3a. 'py -0p' Windows official launcher
        py_launcher = shutil.which("py")
        if py_launcher:
            try:
                out = subprocess.run(
                    ["py", "-0p"],
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True,
                    timeout=5,
                    creationflags=subprocess.CREATE_NO_WINDOW,
                ).stdout
                # Format: " -V:3.11 *        C:\Python311\python.exe"
                for line in out.splitlines():
                    match = re.search(r"(\w:[\\/][^*]+python\.exe)", line, re.IGNORECASE)
                    if match:
                        exe = match.group(1).strip()
                        if os.path.isfile(exe):
                            found_paths.add(os.path.abspath(exe))
            except Exception:
                pass

        # 3b. Registry scanning
        try:
            import winreg
            for root_key in (winreg.HKEY_LOCAL_MACHINE, winreg.HKEY_CURRENT_USER):
                try:
                    with winreg.OpenKey(root_key, r"SOFTWARE\Python\PythonCore") as key:
                        num_subkeys = winreg.QueryInfoKey(key)[0]
                        for i in range(num_subkeys):
                            ver_key_name = winreg.EnumKey(key, i)
                            try:
                                with winreg.OpenKey(key, rf"{ver_key_name}\InstallPath") as ip_key:
                                    install_dir, _ = winreg.QueryValueEx(ip_key, "")
                                    exe = os.path.join(install_dir, "python.exe")
                                    if os.path.isfile(exe):
                                        found_paths.add(os.path.abspath(exe))
                            except Exception:
                                pass
                except Exception:
                    pass
        except Exception:
            pass

        # 3c. Standard directories
        patterns = [
            r"C:\Python*\python.exe",
            r"D:\Python*\python.exe",
            r"C:\Program Files\Python*\python.exe",
            r"C:\Program Files (x86)\Python*\python.exe",
            os.path.expandvars(r"%LOCALAPPDATA%\Programs\Python\Python*\python.exe"),
            os.path.expandvars(r"%APPDATA%\Local\Programs\Python\Python*\python.exe"),
            r"C:\Users\*\AppData\Local\Programs\Python\Python*\python.exe",
        ]
        for pattern in patterns:
            for match in glob.glob(pattern):
                if os.path.isfile(match):
                    found_paths.add(os.path.abspath(match))

    # 4. Unix discovery
    else:
        unix_patterns = [
            "/usr/bin/python3*",
            "/usr/local/bin/python3*",
            os.path.expanduser("~/.pyenv/versions/*/bin/python"),
            os.path.expanduser("~/.local/bin/python3*"),
        ]
        for pattern in unix_patterns:
            for match in glob.glob(pattern):
                if os.path.isfile(match) and not match.endswith("-config"):
                    found_paths.add(os.path.abspath(match))

    # Verify and extract versions
    seen_paths = set()
    results = []
    for exe in sorted(found_paths):
        norm_path = normalize_executable_path(exe)
        norm_lower = norm_path.lower()
        if norm_lower in seen_paths:
            continue

        version = get_executable_version(exe, "--version", r"Python\s+([\d\.]+)")
        if version:
            seen_paths.add(norm_lower)
            results.append({
                "executor_key": "python",
                "executable_path": norm_path,
                "version": version,
            })

    return results
