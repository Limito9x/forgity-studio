import os
import sys
import glob
import shutil
import logging
from .base_scanner import get_executable_version, normalize_executable_path

logger = logging.getLogger(__name__)


def scan_blender_executables() -> list[dict]:
    """
    Discover all installed Blender executables across Windows, macOS, and Linux.
    Returns:
        list of [{"executor_key": "blender", "executable_path": str, "version": str}]
    """
    found_paths = set()

    # 1. System PATH lookup
    path_blender = shutil.which("blender")
    if path_blender and os.path.exists(path_blender):
        found_paths.add(os.path.abspath(path_blender))

    # 2. Windows-specific discovery
    if os.name == "nt":
        # 2a. Windows Registry scanning
        try:
            import winreg
            for root_key in (winreg.HKEY_LOCAL_MACHINE, winreg.HKEY_CURRENT_USER):
                try:
                    with winreg.OpenKey(root_key, r"SOFTWARE\Blender Foundation\Blender") as key:
                        num_subkeys = winreg.QueryInfoKey(key)[0]
                        for i in range(num_subkeys):
                            subkey_name = winreg.EnumKey(key, i)
                            try:
                                with winreg.OpenKey(key, rf"{subkey_name}\InstallDir") as install_key:
                                    install_dir, _ = winreg.QueryValueEx(install_key, "")
                                    exe = os.path.join(install_dir, "blender.exe")
                                    if os.path.exists(exe):
                                        found_paths.add(os.path.abspath(exe))
                            except Exception:
                                pass
                except Exception:
                    pass
        except Exception:
            pass

        # 2b. Standard installation directories across all system drives
        patterns = [
            r"C:\Program Files\Blender Foundation\Blender *\blender.exe",
            r"C:\Program Files (x86)\Blender Foundation\Blender *\blender.exe",
            r"D:\Program Files\Blender Foundation\Blender *\blender.exe",
            r"E:\Program Files\Blender Foundation\Blender *\blender.exe",
            r"C:\Blender*\blender.exe",
            r"D:\Blender*\blender.exe",
            r"E:\Blender*\blender.exe",
            r"D:\Games\Blender*\blender.exe",
            r"C:\Games\Blender*\blender.exe",
            os.path.expandvars(r"%LOCALAPPDATA%\Programs\Blender Foundation\Blender *\blender.exe"),
            os.path.expandvars(r"%APPDATA%\Blender Foundation\Blender *\blender.exe"),
            # Common Steam installation locations
            r"C:\Program Files (x86)\Steam\steamapps\common\Blender\blender.exe",
            r"D:\SteamLibrary\steamapps\common\Blender\blender.exe",
            r"E:\SteamLibrary\steamapps\common\Blender\blender.exe",
        ]
        for pattern in patterns:
            for match in glob.glob(pattern):
                if os.path.isfile(match):
                    found_paths.add(os.path.abspath(match))

    # 3. macOS discovery
    elif sys.platform == "darwin":
        mac_apps = [
            "/Applications/Blender.app/Contents/MacOS/Blender",
            os.path.expanduser("~/Applications/Blender.app/Contents/MacOS/Blender"),
        ]
        for p in mac_apps:
            if os.path.isfile(p):
                found_paths.add(os.path.abspath(p))

    # 4. Linux discovery
    else:
        linux_paths = [
            "/usr/bin/blender",
            "/usr/local/bin/blender",
            "/opt/blender/blender",
            "/snap/bin/blender",
            os.path.expanduser("~/.local/bin/blender"),
        ]
        for p in linux_paths:
            if os.path.isfile(p):
                found_paths.add(os.path.abspath(p))

    # Verify executables and extract verified versions
    seen_paths = set()
    results = []
    for exe in sorted(found_paths):
        norm_path = normalize_executable_path(exe)
        norm_lower = norm_path.lower()
        if norm_lower in seen_paths:
            continue

        version = get_executable_version(exe, "--version", r"Blender\s+([\d\.]+)")
        if version:
            seen_paths.add(norm_lower)
            results.append({
                "executor_key": "blender",
                "executable_path": norm_path,
                "version": version,
            })

    return results
