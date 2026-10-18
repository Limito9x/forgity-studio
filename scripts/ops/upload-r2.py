#!/usr/bin/env bash
# Auto-fallback wrapper if executed directly
""":"
command -v python3 >/dev/null 2>&1 && exec python3 "$0" "$@"
exec python "$0" "$@"
"""

import os
import sys
import glob
from datetime import datetime, timezone, timedelta
from pathlib import Path

def load_dotenv(env_path: Path):
    if not env_path.is_file():
        return
    with open(env_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            k = k.strip()
            v = v.strip().strip('"').strip("'")
            if k not in os.environ:
                os.environ[k] = v

def main():
    if len(sys.argv) < 2:
        print("[ERROR] Usage: upload-r2.py <backup_file_path>")
        sys.exit(1)

    backup_file = Path(sys.argv[1]).resolve()
    if not backup_file.is_file():
        print(f"[ERROR] File does not exist: {backup_file}")
        sys.exit(1)

    # 1. Look for .env in current, parent, or home directory
    candidates = [
        Path.cwd() / ".env",
        Path(__file__).resolve().parent / ".env",
        Path(__file__).resolve().parent.parent.parent / ".env",
        Path.home() / ".env",
    ]
    for c in candidates:
        if c.is_file():
            load_dotenv(c)
            break

    access_key = os.getenv("CLOUDFLARE_R2_ACCESS_KEY", "").strip()
    secret_key = os.getenv("CLOUDFLARE_R2_SECRET_KEY", "").strip()
    service_url = os.getenv("CLOUDFLARE_R2_SERVICE_URL", "").strip()
    bucket_name = (
        os.getenv("BACKUP_R2_BUCKET_NAME", "").strip()
        or os.getenv("CLOUDFLARE_R2_BUCKET_NAME", "").strip()
    )

    if not (access_key and secret_key and service_url and bucket_name):
        print("[WARNING] Cloudflare R2 credentials (CLOUDFLARE_R2_*) not fully set in .env.")
        print("[INFO] Backup file is safely preserved locally. Skipping remote R2 upload.")
        return

    # 2. Check and ensure boto3 is available
    try:
        import boto3
        from botocore.config import Config
    except ImportError:
        print("[INFO] Installing 'boto3' for S3/R2 upload...")
        import subprocess
        subprocess.check_call([sys.executable, "-m", "pip", "install", "--quiet", "boto3"])
        import boto3
        from botocore.config import Config

    # 3. Connect to Cloudflare R2 S3-compatible client
    s3 = boto3.client(
        "s3",
        endpoint_url=service_url,
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        config=Config(signature_version="s3v4")
    )

    remote_key = f"db-backups/{backup_file.name}"
    file_size_mb = round(backup_file.stat().st_size / (1024 * 1024), 2)
    print(f"[R2] Uploading {backup_file.name} ({file_size_mb} MB) -> r2://{bucket_name}/{remote_key}...")

    s3.upload_file(str(backup_file), bucket_name, remote_key)
    print(f"[R2] [SUCCESS] Upload completed successfully!")

    # 4. Retention Policy: Auto-delete remote backups older than 14 days
    retention_days = int(os.getenv("BACKUP_RETENTION_DAYS", "14"))
    cutoff = datetime.now(timezone.utc) - timedelta(days=retention_days)

    try:
        response = s3.list_objects_v2(Bucket=bucket_name, Prefix="db-backups/")
        if "Contents" in response:
            for obj in response["Contents"]:
                if obj["LastModified"] < cutoff:
                    old_key = obj["Key"]
                    print(f"[R2] Deleting stale backup (> {retention_days} days): {old_key}")
                    s3.delete_object(Bucket=bucket_name, Key=old_key)
    except Exception as e:
        print(f"[WARNING] Could not prune old backups on R2: {e}")

if __name__ == "__main__":
    main()
