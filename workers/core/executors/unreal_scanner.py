import os
import sys
import glob
import json
import re
import shutil
import logging
from .base_scanner import normalize_executable_path

logger = logging.getLogger(__name__)


def get_unreal_version_from_path(exe_path: str) -> str:
    """
    Extract Unreal Engine version from the official Engine/Build/Build.version file
    or from directory name pattern (e.g. UE_5.4 or Unreal Engine 5.5).
    """
    try:
        # The executable is located at: Engine/Binaries/Win64/UnrealEditor-Cmd.exe
        # Three levels up is the Engine directory
        binaries_dir = os.path.dirname(exe_path)
        engine_dir = os.path.dirname(os.path.dirname(binaries_dir))
        build_version_file = os.path.join(engine_dir, "Build", "Build.version")
        if os.path.isfile(build_version_file):
            with open(build_version_file, "r", encoding="utf-8") as f:
                data = json.load(f)
                major = data.get("MajorVersion")
                minor = data.get("MinorVersion")
                patch = data.get("PatchVersion", 0)
                if major is not None and minor is not None:
                    return f"{major}.{minor}.{patch}"

        # Fallback to directory name pattern matching
        match = re.search(r"UE_([\d\.]+)", exe_path, re.IGNORECASE) or re.search(r"Unreal\s*Engine[\\/]+([\d\.]+)", exe_path, re.IGNORECASE)
        if match:
            return match.group(1).strip()
    except Exception as e:
        logger.debug(f"Failed to read Unreal Engine version for '{exe_path}': {e}")

    return "5.0.0"


def scan_unreal_executables() -> list[dict]:
    """
    Discover all installed Unreal Engine command-line executables (UnrealEditor-Cmd).
    Returns:
        list of [{"executor_key": "unreal", "executable_path": str, "version": str}]
    """
    found_paths = set()

    # 1. Environment variables
    for env_var in ["UNREAL_CMD_PATH", "UE_CMD_PATH", "UNREAL_ENGINE_PATH"]:
        val = os.environ.get(env_var, "").strip()
        if val and os.path.isfile(val):
            found_paths.add(os.path.abspath(val))

    # 2. System PATH lookup
    for cmd_name in ["UnrealEditor-Cmd", "UnrealEditor-Cmd.exe"]:
        p = shutil.which(cmd_name)
        if p and os.path.isfile(p):
            found_paths.add(os.path.abspath(p))

    # 3. Windows-specific discovery
    if os.name == "nt":
        # 3a. Registry scanning for launcher-installed engines
        try:
            import winreg
            for root_key in (winreg.HKEY_LOCAL_MACHINE, winreg.HKEY_CURRENT_USER):
                try:
                    with winreg.OpenKey(root_key, r"SOFTWARE\EpicGames\Unreal Engine") as key:
                        num_subkeys = winreg.QueryInfoKey(key)[0]
                        for i in range(num_subkeys):
                            ver_name = winreg.EnumKey(key, i)
                            try:
                                with winreg.OpenKey(key, ver_name) as ver_key:
                                    install_dir, _ = winreg.QueryValueEx(ver_key, "InstalledDirectory")
                                    exe = os.path.join(install_dir, "Engine", "Binaries", "Win64", "UnrealEditor-Cmd.exe")
                                    if os.path.isfile(exe):
                                        found_paths.add(os.path.abspath(exe))
                            except Exception:
                                pass
                except Exception:
                    pass

                # 3b. Registry scanning for custom source builds
                try:
                    with winreg.OpenKey(root_key, r"SOFTWARE\Epic Games\Unreal Engine\Builds") as key:
                        num_values = winreg.QueryInfoKey(key)[1]
                        for i in range(num_values):
                            _, install_dir, _ = winreg.EnumValue(key, i)
                            if install_dir:
                                exe = os.path.join(install_dir, "Engine", "Binaries", "Win64", "UnrealEditor-Cmd.exe")
                                if os.path.isfile(exe):
                                    found_paths.add(os.path.abspath(exe))
                except Exception:
                    pass
        except Exception:
            pass

        # 3c. Common installation directories across all system drives
        patterns = [
            r"C:\Program Files\Epic Games\UE_*\Engine\Binaries\Win64\UnrealEditor-Cmd.exe",
            r"D:\Program Files\Epic Games\UE_*\Engine\Binaries\Win64\UnrealEditor-Cmd.exe",
            r"E:\Program Files\Epic Games\UE_*\Engine\Binaries\Win64\UnrealEditor-Cmd.exe",
            r"C:\Epic Games\UE_*\Engine\Binaries\Win64\UnrealEditor-Cmd.exe",
            r"D:\Epic Games\UE_*\Engine\Binaries\Win64\UnrealEditor-Cmd.exe",
            r"E:\Epic Games\UE_*\Engine\Binaries\Win64\UnrealEditor-Cmd.exe",
            r"D:\Games\UnrealEngine\UE_*\Engine\Binaries\Win64\UnrealEditor-Cmd.exe",
            r"C:\Games\UnrealEngine\UE_*\Engine\Binaries\Win64\UnrealEditor-Cmd.exe",
            r"D:\Games\UE_*\Engine\Binaries\Win64\UnrealEditor-Cmd.exe",
            r"C:\Games\UE_*\Engine\Binaries\Win64\UnrealEditor-Cmd.exe",
            r"D:\UnrealEngine\UE_*\Engine\Binaries\Win64\UnrealEditor-Cmd.exe",
            r"C:\UnrealEngine\UE_*\Engine\Binaries\Win64\UnrealEditor-Cmd.exe",
        ]
        for pattern in patterns:
            for match in glob.glob(pattern):
                if os.path.isfile(match):
                    found_paths.add(os.path.abspath(match))

    # 4. macOS discovery
    elif sys.platform == "darwin":
        mac_patterns = [
            "/Users/Shared/Epic Games/UE_*/Engine/Binaries/Mac/UnrealEditor-Cmd",
            "/Applications/Epic Games/UE_*/Engine/Binaries/Mac/UnrealEditor-Cmd",
        ]
        for pattern in mac_patterns:
            for match in glob.glob(pattern):
                if os.path.isfile(match):
                    found_paths.add(os.path.abspath(match))

    # 5. Linux discovery
    else:
        linux_patterns = [
            "/opt/EpicGames/UE_*/Engine/Binaries/Linux/UnrealEditor-Cmd",
            "/opt/unreal-engine/Engine/Binaries/Linux/UnrealEditor-Cmd",
            os.path.expanduser("~/EpicGames/UE_*/Engine/Binaries/Linux/UnrealEditor-Cmd"),
        ]
        for pattern in linux_patterns:
            for match in glob.glob(pattern):
                if os.path.isfile(match):
                    found_paths.add(os.path.abspath(match))

    # Deduplicate and extract versions
    seen_paths = set()
    results = []
    for exe in sorted(found_paths, reverse=True):
        norm_path = normalize_executable_path(exe)
        norm_lower = norm_path.lower()
        if norm_lower in seen_paths:
            continue

        version = get_unreal_version_from_path(exe)
        seen_paths.add(norm_lower)
        results.append({
            "executor_key": "unreal",
            "executable_path": norm_path,
            "version": version,
        })

    return results
