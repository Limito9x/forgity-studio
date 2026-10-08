"""Worker-owned runtime storage. One root per registered worker, never a repository root."""
import logging
import os
import threading
import time
from contextlib import contextmanager
from pathlib import Path

from core.config import WORKERS_ROOT, load_config

logger = logging.getLogger(__name__)
_mutex = threading.Lock()


def settings():
    cfg = (load_config() or {}).get("storage", {})
    root = Path(os.getenv("WORKER_DATA_DIR") or cfg.get("root") or WORKERS_ROOT / "worker" / "runtime")
    if not root.is_absolute():
        root = WORKERS_ROOT / root
    root = root.resolve()
    if root == WORKERS_ROOT or root in WORKERS_ROOT.parents:
        raise ValueError("Storage root must be a dedicated worker runtime directory.")
    values = {key: int(cfg.get(key, default)) for key, default in {
        "cleanup_interval_seconds": 1800, "temp_ttl_hours": 24,
        "cache_ttl_hours": 168, "logs_ttl_hours": 168, "cache_max_bytes": 2 * 1024**3,
    }.items()}
    if any(value <= 0 for value in values.values()):
        raise ValueError("Storage limits and cleanup interval must be positive.")
    return root, values


@contextmanager
def storage_lock(blocking=True):
    """Serializes stage execution and cleanup across threads and host processes."""
    acquired = _mutex.acquire(blocking=blocking)
    handle = None
    locked = False
    try:
        if acquired:
            root, _ = settings()
            root.mkdir(parents=True, exist_ok=True)
            handle = open(root / ".storage.lock", "a+b")
            if handle.seek(0, 2) == 0:
                handle.write(b"0")
                handle.flush()
            while True:
                try:
                    handle.seek(0)
                    if os.name == "nt":
                        import msvcrt
                        msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
                    else:
                        import fcntl
                        fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
                    locked = True
                    break
                except OSError:
                    if not blocking:
                        break
                    time.sleep(0.1)
        yield locked
    finally:
        if handle:
            if locked:
                handle.seek(0)
                if os.name == "nt":
                    import msvcrt
                    msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
                else:
                    import fcntl
                    fcntl.flock(handle, fcntl.LOCK_UN)
            handle.close()
        if acquired:
            _mutex.release()


def _linked(path):
    return path.is_symlink() or (hasattr(path, "is_junction") and path.is_junction())


def _files(folder):
    if not folder.exists() or _linked(folder):
        return
    for base, dirs, names in os.walk(folder, followlinks=False):
        dirs[:] = [d for d in dirs if not _linked(Path(base) / d)]
        for name in names:
            path = Path(base) / name
            if not _linked(path) and path.is_file() and path.resolve().is_relative_to(folder.resolve()):
                yield path


def cleanup(dry_run=True):
    """TTL and LRU quota eviction only while no stage holds the storage lock."""
    with storage_lock(blocking=False) as locked:
        if not locked:
            return {"skipped": "stage or cleanup active", "files": 0, "bytes": 0}
        root, cfg = settings()
        now = time.time()
        candidates = {}
        cache = []
        for kind in ("temp", "cache", "logs"):
            for path in _files(root / kind):
                stat = path.stat()
                if now - stat.st_mtime > cfg[f"{kind}_ttl_hours"] * 3600:
                    candidates[path] = stat.st_size
                if kind == "cache":
                    cache.append((stat.st_mtime, path, stat.st_size))
        remaining = sum(size for _, path, size in cache if path not in candidates)
        for _, path, size in sorted(cache):
            if remaining <= cfg["cache_max_bytes"]:
                break
            if path not in candidates:
                candidates[path] = size
                remaining -= size
        count = size_total = 0
        for path, size in candidates.items():
            try:
                if not dry_run:
                    path.unlink()
                count += 1
                size_total += size
            except OSError:
                logger.warning("Cannot remove runtime file: %s", path)
        if not dry_run:
            for kind in ("temp", "cache", "logs"):
                folder = root / kind
                if _linked(folder):
                    continue
                for base, dirs, _ in os.walk(folder, topdown=False, followlinks=False):
                    for name in dirs:
                        path = Path(base) / name
                        if not _linked(path) and path.resolve().is_relative_to(folder.resolve()):
                            try:
                                path.rmdir()
                            except OSError:
                                pass
        return {"dry_run": dry_run, "files": count, "bytes": size_total}


def run_cleanup(stop):
    while not stop.is_set():
        try:
            logger.info("Runtime cleanup: %s", cleanup(dry_run=False))
        except Exception:
            logger.exception("Runtime cleanup failed")
        _, cfg = settings()
        stop.wait(cfg["cleanup_interval_seconds"])
