import os
import shutil
import hashlib
import re
import tempfile
import urllib.request
import logging
from core.runtime_storage import settings

logger = logging.getLogger(__name__)

CACHE_BASE_DIR = str(settings()[0] / "cache")


def resolve_script_path(
    script_path: str = "",
    script_url: str = None,
    script_hash: str = None,
    entry_point: str = None
) -> str:
    """
    Phân giải đường dẫn script thực thi:
    Remote Python scripts are downloaded atomically and SHA-256 verified in the cache.
    Local lookup is used only when neither remote URL nor hash was supplied.
    """
    # Remote custom scripts must be complete and hash-verified. Never fall back locally.
    if script_url or script_hash:
        if not script_url or not script_hash or not re.fullmatch(r"[0-9a-fA-F]{64}", script_hash):
            raise ValueError("Remote script requires a URL and a SHA-256 hash.")
        script_hash = script_hash.lower()
        entry = entry_point or os.path.basename(script_path) or "main.py"
        if ("/" in entry or "\\" in entry or ":" in entry or
                not entry.lower().endswith(".py")):
            raise ValueError("Script entry must be a Python filename without directories.")
        cached_folder = os.path.join(CACHE_BASE_DIR, "scripts", script_hash)
        entry_file_path = os.path.join(cached_folder, entry)

        def matches_hash(path):
            if not os.path.isfile(path):
                return False
            digest = hashlib.sha256()
            with open(path, "rb") as cached:
                for chunk in iter(lambda: cached.read(1024 * 1024), b""):
                    digest.update(chunk)
            return digest.hexdigest() == script_hash

        if matches_hash(entry_file_path):
            os.utime(entry_file_path, None)
            return os.path.abspath(entry_file_path)
        os.makedirs(cached_folder, exist_ok=True)
        temp_path = None
        try:
            with tempfile.NamedTemporaryFile(dir=cached_folder, suffix=".tmp", delete=False) as out_file:
                temp_path = out_file.name
                req = urllib.request.Request(script_url, headers={"User-Agent": "Automation Agent"})
                with urllib.request.urlopen(req, timeout=30) as response:
                    shutil.copyfileobj(response, out_file)
            if not matches_hash(temp_path):
                raise ValueError("Downloaded script SHA-256 does not match the execution snapshot.")
            os.replace(temp_path, entry_file_path)
            return os.path.abspath(entry_file_path)
        finally:
            if temp_path and os.path.exists(temp_path):
                os.remove(temp_path)

    # 2. Local built-in pipeline / inspector scripts
    if not script_path:
        return ""

    if os.path.isabs(script_path):
        candidates = [script_path, script_path + ".py"]
    else:
        scripts_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "worker", "scripts")
        clean_name = script_path if not script_path.endswith(".py") else script_path[:-3]
        
        candidates = [
            os.path.join(scripts_dir, script_path),
            os.path.join(scripts_dir, f"{clean_name}.py"),
            os.path.join(scripts_dir, "pipeline", script_path),
            os.path.join(scripts_dir, "pipeline", f"{clean_name}.py"),
            os.path.join(scripts_dir, "pipeline", "blender", script_path),
            os.path.join(scripts_dir, "pipeline", "blender", f"{clean_name}.py"),
            os.path.join(scripts_dir, "pipeline", "daz", script_path),
            os.path.join(scripts_dir, "pipeline", "daz", f"{clean_name}.py"),
            os.path.join(scripts_dir, "inspectors", script_path),
            os.path.join(scripts_dir, "inspectors", f"{clean_name}.py"),
            os.path.join(scripts_dir, "inspectors", "blender", script_path),
            os.path.join(scripts_dir, "inspectors", "blender", f"{clean_name}.py"),
            os.path.join(scripts_dir, "inspectors", "daz", script_path),
            os.path.join(scripts_dir, "inspectors", "daz", f"{clean_name}.py"),
        ]

    for cand in candidates:
        if os.path.exists(cand):
            return os.path.abspath(cand)

    # Recursive fallback search by filename inside worker/scripts/
    scripts_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "worker", "scripts")
    target_filename = os.path.basename(script_path)
    if not target_filename.endswith(".py"):
        target_filename += ".py"
    for root, _, files in os.walk(scripts_dir):
        if target_filename in files:
            return os.path.abspath(os.path.join(root, target_filename))

    return ""


def resolve_file_asset(url: str, file_hash: str = None, file_name: str = None) -> str:
    """
    Download and cache a file asset from a remote URL to worker/cache/assets/{hash}/{filename}.
    Returns the absolute local file path.
    """
    if not url:
        return ""

    if file_hash and not re.fullmatch(r"[0-9a-fA-F]{64}", file_hash):
        raise ValueError("File asset hash must be SHA-256.")
    folder_key = file_hash.lower() if file_hash else hashlib.sha256(url.encode()).hexdigest()
    cached_folder = os.path.join(CACHE_BASE_DIR, "assets", folder_key)
    os.makedirs(cached_folder, exist_ok=True)

    fname = file_name or os.path.basename(url.split("?")[0]) or "asset_file"
    if fname in (".", "..") or any(c in fname for c in ("/", "\\", ":")):
        raise ValueError("File asset name must not contain directories.")
    target_path = os.path.join(cached_folder, fname)

    def valid(path):
        if not os.path.isfile(path) or os.path.getsize(path) == 0:
            return False
        if not file_hash:
            return True
        digest = hashlib.sha256()
        with open(path, "rb") as source:
            for chunk in iter(lambda: source.read(1024 * 1024), b""):
                digest.update(chunk)
        return digest.hexdigest() == folder_key

    if valid(target_path):
        os.utime(target_path, None)
        logger.debug(f"Using cached asset file: {target_path}")
        return os.path.abspath(target_path)

    logger.info("Downloading file asset to %s", target_path)
    temp_path = None
    try:
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "Mozilla/5.0 (Automation Agent)"}
        )
        with tempfile.NamedTemporaryFile(dir=cached_folder, suffix=".tmp", delete=False) as out_file:
            temp_path = out_file.name
            with urllib.request.urlopen(req, timeout=60) as response:
                shutil.copyfileobj(response, out_file)
        if not valid(temp_path):
            raise ValueError("Downloaded file asset is empty or its SHA-256 does not match.")
        os.replace(temp_path, target_path)
        return os.path.abspath(target_path)
    except Exception as e:
        logger.error("Failed to download file asset (%s)", type(e).__name__)
        return ""
    finally:
        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)

