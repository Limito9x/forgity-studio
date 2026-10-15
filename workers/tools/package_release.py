import os
import sys
import shutil
import zipfile
import hashlib
import argparse
from pathlib import Path

# Add workers directory and core directory to sys.path
WORKERS_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(WORKERS_ROOT))
sys.path.insert(0, str(WORKERS_ROOT / "core"))

from tools import compile_protos
from core.version import get_worker_version

# Directories and files to explicitly exclude from the clean package
EXCLUDED_NAMES = {
    "__pycache__",
    ".pytest_cache",
    ".venv",
    "venv",
    ".git",
    "config.json",
    "agent_config.json",
    ".env",
    ".storage.lock",
    "storage.lock",
    "cache",
    "temp",
    "logs",
    "dist",
    "pipelines",
    "tests",
    "tools",
    "test_worker_runtime.py",
    ".gitignore",
    ".runner.lock",
}

EXCLUDED_EXTENSIONS = {
    ".pyc",
    ".pyo",
    ".pyd",
    ".log",
    ".tmp",
}


def is_excluded(path: Path, root: Path) -> bool:
    rel = path.relative_to(root)
    parts = rel.parts
    if any(p in EXCLUDED_NAMES for p in parts):
        return True
    if path.suffix.lower() in EXCLUDED_EXTENSIONS:
        return True
    return False


def build_package(version_override: str = None, output_dir: str = None) -> tuple[Path, str]:
    print("[1/4] Compiling latest protobuf contracts into workers/core...")
    compile_protos.run()

    version = version_override or get_worker_version()
    print(f"[2/4] Packaging Runner distribution for version: {version}...")

    dist_dir = Path(output_dir) if output_dir else (WORKERS_ROOT / "dist")
    dist_dir.mkdir(parents=True, exist_ok=True)

    zip_filename = f"forgity-runner-v{version}.zip"
    zip_path = dist_dir / zip_filename
    if zip_path.exists():
        zip_path.unlink()

    included_count = 0
    print(f"[3/4] Creating clean archive: {zip_path}...")
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        for file_path in WORKERS_ROOT.rglob("*"):
            if not file_path.is_file():
                continue
            if is_excluded(file_path, WORKERS_ROOT):
                continue

            rel_path = file_path.relative_to(WORKERS_ROOT)
            zf.write(file_path, arcname=str(rel_path).replace("\\", "/"))
            included_count += 1

    print(f"      Included {included_count} files in package.")

    print("[4/4] Calculating SHA-256 checksum...")
    hasher = hashlib.sha256()
    with open(zip_path, "rb") as f:
        while chunk := f.read(64 * 1024):
            hasher.update(chunk)
    sha256 = hasher.hexdigest().lower()

    sha_file = dist_dir / f"{zip_filename}.sha256"
    with open(sha_file, "w", encoding="utf-8") as f:
        f.write(f"{sha256}  {zip_filename}\n")

    # Also create unversioned alias for direct bootstrap download
    alias_path = dist_dir / "forgity-runner.zip"
    shutil.copy2(zip_path, alias_path)
    alias_sha = dist_dir / "forgity-runner.zip.sha256"
    with open(alias_sha, "w", encoding="utf-8") as f:
        f.write(f"{sha256}  forgity-runner.zip\n")

    print(f"\n[SUCCESS] Package built successfully!")
    print(f"  Archive:  {zip_path} ({zip_path.stat().st_size:,} bytes)")
    print(f"  Alias:    {alias_path}")
    print(f"  SHA-256:  {sha256}")
    print(f"  Checksum: {sha_file}")

    return zip_path, sha256


def main():
    parser = argparse.ArgumentParser(description="Package Automation Studio Runner for clean release")
    parser.add_argument("--version", type=str, default=None, help="Override version string (defaults to VERSION file)")
    parser.add_argument("--output-dir", type=str, default=None, help="Directory to output release artifacts")
    args = parser.parse_args()

    build_package(version_override=args.version, output_dir=args.output_dir)


if __name__ == "__main__":
    main()
