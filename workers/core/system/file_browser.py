import os
import sys
import json
import string
import shutil
from pathlib import Path
import logging

logger = logging.getLogger(__name__)

# Blacklisted hidden/system directory names to ignore when browsing
IGNORED_NAMES = {
    ".git", "venv", ".venv", "__pycache__", "node_modules", ".idea", ".vscode",
    "$recycle.bin", "system volume information", "config.msi", "recovery",
    "msocache", "perflogs"
}


def _get_config_path() -> Path:
    """Find config file path, preferring agent_config.json or runner_config.json."""
    candidates = ["runner_config.json", "agent_config.json"]
    for c in candidates:
        if os.path.exists(c):
            return Path(c)
    return Path("agent_config.json")


def get_pinned_folders() -> list[str]:
    """Retrieve artist's pinned folders from local config file."""
    config_path = _get_config_path()
    if not config_path.exists():
        return []
    try:
        with open(config_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data.get("pinnedFolders") or data.get("pinned_folders") or []
    except Exception as e:
        logger.debug(f"Failed to load pinned folders: {e}")
        return []


def pin_folder(folder_path: str) -> list[str]:
    """Add a directory to the local pinned folders list."""
    norm_path = os.path.abspath(folder_path).replace("\\", "/")
    if not os.path.isdir(norm_path):
        raise ValueError(f"Path is not a valid directory: {folder_path}")

    config_path = _get_config_path()
    data = {}
    if config_path.exists():
        try:
            with open(config_path, "r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception:
            data = {}

    pinned = data.get("pinnedFolders") or data.get("pinned_folders") or []
    if norm_path not in pinned:
        pinned.append(norm_path)
        data["pinnedFolders"] = pinned
        try:
            with open(config_path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=4)
        except Exception as e:
            logger.error(f"Failed to save pinned folder: {e}")

    return pinned


def unpin_folder(folder_path: str) -> list[str]:
    """Remove a directory from the local pinned folders list."""
    norm_path = os.path.abspath(folder_path).replace("\\", "/")
    config_path = _get_config_path()
    if not config_path.exists():
        return []

    try:
        with open(config_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        pinned = data.get("pinnedFolders") or data.get("pinned_folders") or []
        if norm_path in pinned:
            pinned.remove(norm_path)
            data["pinnedFolders"] = pinned
            with open(config_path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=4)
        return pinned
    except Exception as e:
        logger.error(f"Failed to unpin folder: {e}")
        return []


def get_system_places() -> list[dict]:
    """
    Get quick system shortcuts (Home, Desktop, Downloads, Documents).
    Returns list of: [{"name": str, "path": str}]
    """
    home = Path.home()
    places = []

    candidates = [
        ("Home", home),
        ("Desktop", home / "Desktop"),
        ("Downloads", home / "Downloads"),
        ("Documents", home / "Documents"),
    ]

    for name, p in candidates:
        if p.exists() and p.is_dir():
            places.append({
                "name": name,
                "path": str(p).replace("\\", "/")
            })

    return places


def get_drives() -> list[dict]:
    """
    Get logical disk drives on system with labels and free space.
    Returns list of:
    [{"mount": str, "label": str, "total_bytes": int, "free_bytes": int}]
    """
    drives = []

    if os.name == "nt":
        try:
            import ctypes
            bitmask = ctypes.windll.kernel32.GetLogicalDrives()
            for letter in string.ascii_uppercase:
                if bitmask & 1:
                    mount = f"{letter}:/"
                    vol_name_buf = ctypes.create_unicode_buffer(1024)
                    res = ctypes.windll.kernel32.GetVolumeInformationW(
                        ctypes.c_wchar_p(mount),
                        vol_name_buf,
                        ctypes.sizeof(vol_name_buf),
                        None, None, None, None, 0
                    )
                    label = vol_name_buf.value if res and vol_name_buf.value else f"Local Disk ({letter}:)"

                    total = 0
                    free = 0
                    try:
                        t, _, f = shutil.disk_usage(mount)
                        total = t
                        free = f
                    except Exception:
                        pass

                    drives.append({
                        "mount": mount,
                        "label": label,
                        "total_bytes": total,
                        "free_bytes": free,
                    })
                bitmask >>= 1
        except Exception as e:
            logger.debug(f"Failed to enumerate Windows drives: {e}")
    else:
        try:
            t, _, f = shutil.disk_usage("/")
            drives.append({
                "mount": "/",
                "label": "Root",
                "total_bytes": t,
                "free_bytes": f,
            })
        except Exception:
            pass

    return drives


def is_hidden_or_system(entry: os.DirEntry) -> bool:
    """Check if filesystem entry is hidden, system, or blacklisted."""
    name_lower = entry.name.lower()
    if name_lower in IGNORED_NAMES or entry.name.startswith((".", "$")):
        return True

    if os.name == "nt":
        try:
            attrs = entry.stat(follow_symlinks=False).st_file_attributes
            # 0x02: FILE_ATTRIBUTE_HIDDEN, 0x04: FILE_ATTRIBUTE_SYSTEM
            if attrs & (0x02 | 0x04):
                return True
        except Exception:
            pass
    return False


def browse(
    target_dir: str = "",
    mode: str = "all",
    extensions: list[str] = None
) -> dict:
    """
    Browse a remote directory.
    - target_dir: Path to browse, or empty/ROOT to list root drives
    - mode: "folder" (directories only) or "all" (files + directories)
    - extensions: optional filter (e.g. [".blend", ".fbx", ".obj"])
    
    Returns:
    {
        "current_path": str,
        "parent_path": str,
        "can_navigate_up": bool,
        "items": list of dict,
        "drives": list of dict,
        "system_places": list of dict,
        "pinned_folders": list of str
    }
    """
    target_dir = (target_dir or "").strip()
    drives = get_drives()
    system_places = get_system_places()
    pinned_folders = get_pinned_folders()

    # 1. Root / empty target -> Return list of system drives
    if not target_dir or target_dir in ["/", "\\", "ROOT", "."]:
        root_items = []
        for d in drives:
            root_items.append({
                "name": f"Drive ({d['mount']})",
                "path": d["mount"],
                "is_directory": True,
                "size_bytes": 0,
            })
        return {
            "current_path": "",
            "parent_path": "",
            "can_navigate_up": False,
            "items": root_items,
            "drives": drives,
            "system_places": system_places,
            "pinned_folders": pinned_folders,
        }

    # 2. Normalize standalone drive paths (e.g. "D:" -> "D:/")
    if len(target_dir) == 2 and target_dir[1] == ":" and target_dir[0].isalpha():
        target_dir = f"{target_dir[0].upper()}:/"

    abs_dir = os.path.abspath(target_dir)
    normalized_path = abs_dir.replace("\\", "/")

    # Compute parent_path and can_navigate_up
    is_drive_root = False
    if os.name == "nt":
        if len(normalized_path) == 3 and normalized_path[1] == ":" and normalized_path[2] == "/":
            is_drive_root = True
        elif len(normalized_path) == 2 and normalized_path[1] == ":":
            is_drive_root = True
            normalized_path += "/"
    else:
        if normalized_path == "/":
            is_drive_root = True

    if is_drive_root:
        current_path = normalized_path
        parent_path = ""
        can_navigate_up = True
    else:
        current_path = normalized_path
        parent_path = os.path.dirname(normalized_path.rstrip("/")).replace("\\", "/")
        if os.name == "nt" and len(parent_path) == 2 and parent_path[1] == ":":
            parent_path += "/"
        can_navigate_up = True

    items = []
    normalized_exts = [e.lower() if e.startswith(".") else f".{e.lower()}" for e in (extensions or [])]

    if os.path.exists(current_path) and os.path.isdir(current_path):
        try:
            with os.scandir(current_path) as scanner:
                for entry in scanner:
                    if is_hidden_or_system(entry):
                        continue

                    try:
                        is_dir = entry.is_dir(follow_symlinks=False)
                    except Exception:
                        is_dir = False

                    # If mode is directory-only, skip regular files
                    if mode in ["folder", "directory_only"] and not is_dir:
                        continue

                    # If file and extension filters are specified
                    if not is_dir and normalized_exts:
                        _, ext = os.path.splitext(entry.name)
                        if ext.lower() not in normalized_exts:
                            continue

                    size_bytes = 0
                    if not is_dir:
                        try:
                            size_bytes = entry.stat().st_size
                        except Exception:
                            size_bytes = 0

                    items.append({
                        "name": entry.name,
                        "path": entry.path.replace("\\", "/"),
                        "is_directory": is_dir,
                        "size_bytes": size_bytes,
                    })
        except Exception as e:
            logger.warning(f"Error scanning directory '{current_path}': {e}")

    # Sorting: Directories first (alphabetical), then files (alphabetical)
    items.sort(key=lambda x: (not x["is_directory"], x["name"].lower()))

    return {
        "current_path": current_path,
        "parent_path": parent_path,
        "can_navigate_up": can_navigate_up,
        "items": items,
        "drives": drives,
        "system_places": system_places,
        "pinned_folders": pinned_folders,
    }


if __name__ == "__main__":
    print("=== System Places ===")
    for p in get_system_places():
        print(f"  {p['name']:<12} -> {p['path']}")

    print("\n=== System Drives ===")
    for d in get_drives():
        free_gb = round(d['free_bytes'] / (1024**3), 1)
        total_gb = round(d['total_bytes'] / (1024**3), 1)
        print(f"  {d['mount']} [{d['label']}] : {free_gb}GB / {total_gb}GB")

    print("\n=== Browse Root ===")
    res = browse("")
    print(f"Items in Root ({len(res['items'])}): {[i['name'] for i in res['items']]}")

    print("\n=== Browse Current Working Dir ===")
    res_cwd = browse(os.getcwd())
    print(f"Current Path : {res_cwd['current_path']}")
    print(f"Parent Path  : {res_cwd['parent_path']}")
    print(f"Items Count  : {len(res_cwd['items'])}")
    for item in res_cwd['items'][:6]:
        kind = "DIR " if item["is_directory"] else "FILE"
        print(f"  [{kind}] {item['name']}")
