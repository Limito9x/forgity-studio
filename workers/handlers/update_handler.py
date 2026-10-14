import os
import sys
import time
import zipfile
import hashlib
import logging
import threading
import subprocess
import urllib.request
from pathlib import Path
from core import agent_pb2
from core.version import get_worker_version
from core.daemon.service_manager import get_service_manager

logger = logging.getLogger(__name__)

# Files and directory prefixes that MUST NOT be touched or overwritten during update
PROTECTED_PREFIXES = {
    "config.json",
    "agent_config.json",
    ".env",
    ".venv",
    "worker/venv",
    ".git",
    "cache",
    "temp",
    "logs",
    "storage.lock",
    ".storage.lock",
}


def _is_protected(rel_path: str) -> bool:
    normalized = rel_path.replace("\\", "/").strip("/")
    parts = normalized.split("/")
    first_part = parts[0]
    if first_part in PROTECTED_PREFIXES or normalized in PROTECTED_PREFIXES:
        return True
    if len(parts) >= 2 and f"{parts[0]}/{parts[1]}" in PROTECTED_PREFIXES:
        return True
    return False


def _schedule_restart():
    """Restarts the daemon process gracefully after a short delay."""
    time.sleep(2.0)
    try:
        mgr = get_service_manager()
        status = mgr.status()
        if status.get("installed", False):
            logger.info("Restarting daemon via OS Service Manager...")
            mgr.restart()
            return
    except Exception as e:
        logger.warning(f"Could not restart via ServiceManager: {e}")

    # Fallback: spawn new runner daemon and exit current process
    try:
        workers_root = Path(__file__).resolve().parent.parent
        cli_py = workers_root / "cli.py"
        python_bin = sys.executable

        logger.info(f"Spawning fresh daemon process: {python_bin} {cli_py} start")
        if sys.platform == "win32":
            subprocess.Popen(
                [python_bin, str(cli_py), "start"],
                creationflags=subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.DETACHED_PROCESS,
                close_fds=True,
                cwd=str(workers_root)
            )
        else:
            subprocess.Popen(
                [python_bin, str(cli_py), "start"],
                start_new_session=True,
                close_fds=True,
                cwd=str(workers_root)
            )
    except Exception as e:
        logger.error(f"Failed to spawn restart process: {e}")
    finally:
        logger.info("Exiting old worker daemon process...")
        os._exit(0)


def handle_update(command: agent_pb2.UpdateRunnerCommand) -> agent_pb2.CommandResponse:
    """
    Handles in-place auto-update of runner code from remote release package.
    """
    cmd_id = command.command_id
    download_url = (command.download_url or "").strip()
    target_version = (command.target_version or "").strip()
    expected_sha256 = (command.expected_sha256 or "").strip().lower()

    current_version = get_worker_version()

    if not download_url:
        return agent_pb2.CommandResponse(
            command_id=cmd_id,
            success=False,
            error_message="Missing download_url in UpdateRunnerCommand"
        )

    logger.info(f"Starting runner update from {current_version} -> {target_version} (URL: {download_url})")

    workers_root = Path(__file__).resolve().parent.parent
    temp_dir = workers_root / "temp"
    temp_dir.mkdir(parents=True, exist_ok=True)
    zip_dest = temp_dir / f"update_{target_version or 'latest'}.zip"

    try:
        # 1. Download archive
        logger.info(f"Downloading release archive to {zip_dest}...")
        req = urllib.request.Request(
            download_url,
            headers={"User-Agent": "AutomationStudio-RunnerAutoUpdate"}
        )
        with urllib.request.urlopen(req, timeout=120) as resp, open(zip_dest, "wb") as f_out:
            while True:
                chunk = resp.read(64 * 1024)
                if not chunk:
                    break
                f_out.write(chunk)

        # 2. Check SHA-256
        if expected_sha256:
            hasher = hashlib.sha256()
            with open(zip_dest, "rb") as f_in:
                while True:
                    chunk = f_in.read(64 * 1024)
                    if not chunk:
                        break
                    hasher.update(chunk)
            actual_sha256 = hasher.hexdigest().lower()
            if actual_sha256 != expected_sha256:
                return agent_pb2.CommandResponse(
                    command_id=cmd_id,
                    success=False,
                    error_message=f"SHA-256 mismatch! Expected {expected_sha256}, got {actual_sha256}"
                )
            logger.info("SHA-256 checksum verified successfully.")

        # 3. Unzip with protection
        logger.info(f"Extracting package to {workers_root}...")
        with zipfile.ZipFile(zip_dest, "r") as zf:
            members = zf.infolist()

            # Detect if there's a top-level enclosing folder (e.g. runner-1.0.0/core/...)
            prefix = ""
            sample_parts = [m.filename.split("/")[0] for m in members if "/" in m.filename]
            if sample_parts and all(m.filename.startswith(sample_parts[0] + "/") for m in members if not m.is_dir()):
                prefix = sample_parts[0] + "/"

            for member in members:
                if member.is_dir():
                    continue

                rel_name = member.filename
                if prefix and rel_name.startswith(prefix):
                    rel_name = rel_name[len(prefix):]

                if not rel_name:
                    continue

                if _is_protected(rel_name):
                    logger.debug(f"Skipping protected file during update: {rel_name}")
                    continue

                target_file = workers_root / rel_name
                target_file.parent.mkdir(parents=True, exist_ok=True)

                with zf.open(member) as src, open(target_file, "wb") as dst:
                    dst.write(src.read())

        # 4. Write new VERSION file if target_version specified
        if target_version:
            version_file = workers_root / "VERSION"
            with open(version_file, "w", encoding="utf-8") as vf:
                vf.write(target_version.strip() + "\n")

        logger.info(f"Runner successfully updated to version {target_version or 'latest'}!")

        # 5. Schedule daemon restart in background thread
        restart_thread = threading.Thread(target=_schedule_restart, daemon=True)
        restart_thread.start()

        return agent_pb2.CommandResponse(
            command_id=cmd_id,
            success=True,
            update_runner_result=agent_pb2.UpdateRunnerCommandResult(
                current_version=current_version,
                updated_version=target_version or current_version,
                restart_scheduled=True
            )
        )

    except Exception as e:
        logger.error(f"Failed to execute runner update: {e}", exc_info=True)
        return agent_pb2.CommandResponse(
            command_id=cmd_id,
            success=False,
            error_message=f"Update failed: {str(e)}"
        )
    finally:
        # Cleanup temp downloaded zip
        if zip_dest.exists():
            try:
                zip_dest.unlink()
            except Exception:
                pass
