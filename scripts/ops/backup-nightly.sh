#!/usr/bin/env bash
# ==============================================================================
# Forgity Studio - Automated Nightly PostgreSQL Backup & Cloudflare R2 Sync
# ==============================================================================
# Features:
# 1. Takes compressed custom dump (.dump) from active PostgreSQL Docker container.
# 2. Uploads dump to Cloudflare R2 off-site bucket with 14-day retention.
# 3. Maintains local 7-day backup copies in ~/backups.
# ==============================================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 1. Locate and export environment variables from .env
ENV_FILE=""
for candidate in "$SCRIPT_DIR/.env" "$SCRIPT_DIR/../../.env" "$HOME/.env" "$(pwd)/.env"; do
    if [ -f "$candidate" ]; then
        ENV_FILE="$candidate"
        break
    fi
done

if [ -n "$ENV_FILE" ]; then
    while IFS='=' read -r key value || [ -n "$key" ]; do
        # Strip carriage return and whitespace
        clean_key=$(echo "$key" | tr -d '\r' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
        clean_val=$(echo "$value" | tr -d '\r' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
        
        case "$clean_key" in
            \#*|"") continue ;;
        esac
        
        if [[ "$clean_key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
            clean_val="${clean_val#\"}"
            clean_val="${clean_val%\"}"
            clean_val="${clean_val#\'}"
            clean_val="${clean_val%\'}"
            export "$clean_key=$clean_val"
        fi
    done < "$ENV_FILE"
fi

PROJECT_NAME="${PROJECT_NAME:-forgity}"
CONTAINER_NAME="${CONTAINER_NAME:-forgity-postgres}"
DB_NAME="${POSTGRES_DATABASE:-Forgity}"
DB_USER="${POSTGRES_USER:-postgres}"

# Check if target container is running, fallback to any matching postgres container
if ! docker ps -q --filter "name=^/${CONTAINER_NAME}$" > /dev/null 2>&1; then
    # Try finding container matching *postgres* or *db*
    ALT_CONTAINER=$(docker ps --filter "ancestor=postgres:18-alpine" --format "{{.Names}}" | head -n 1)
    if [ -z "$ALT_CONTAINER" ]; then
        ALT_CONTAINER=$(docker ps --filter "name=postgres" --format "{{.Names}}" | head -n 1)
    fi
    if [ -n "$ALT_CONTAINER" ]; then
        CONTAINER_NAME="$ALT_CONTAINER"
    fi
fi

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_DIR="${BACKUP_DIR:-$HOME/backups}"
mkdir -p "$BACKUP_DIR"

BACKUP_FILE="$BACKUP_DIR/forgity_${DB_NAME}_${TIMESTAMP}.dump"
TMP_CONTAINER_DUMP="/tmp/backup_${TIMESTAMP}.dump"

echo "======================================================================="
echo "[$(date '+%Y-%m-%d %H:%M:%S')] STARTING NIGHTLY POSTGRESQL BACKUP"
echo " - Container : $CONTAINER_NAME"
echo " - Database  : $DB_NAME"
echo " - Target    : $BACKUP_FILE"
echo "======================================================================="

# 2. Execute pg_dump inside Docker
docker exec "$CONTAINER_NAME" pg_dump -U "$DB_USER" -d "$DB_NAME" -F c -b -f "$TMP_CONTAINER_DUMP"
docker cp "${CONTAINER_NAME}:${TMP_CONTAINER_DUMP}" "$BACKUP_FILE"
docker exec "$CONTAINER_NAME" rm -f "$TMP_CONTAINER_DUMP"

if [ ! -f "$BACKUP_FILE" ]; then
    echo "[ERROR] Backup failed: output file not found at $BACKUP_FILE"
    exit 1
fi

FILE_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo "[OK] Local backup generated successfully: $BACKUP_FILE ($FILE_SIZE)"

# 3. Off-site sync: Upload to Cloudflare R2
if [ -f "$SCRIPT_DIR/upload-r2.py" ]; then
    python3 "$SCRIPT_DIR/upload-r2.py" "$BACKUP_FILE" || echo "[WARNING] R2 sync encountered error, local backup preserved."
fi

# 4. Local Retention: Delete local backups older than 7 days
echo "[INFO] Cleaning up local backups older than 7 days in $BACKUP_DIR..."
find "$BACKUP_DIR" -type f -name "*.dump" -mtime +7 -delete

echo "[$(date '+%Y-%m-%d %H:%M:%S')] NIGHTLY BACKUP FINISHED SUCCESSFULLY!"
echo "======================================================================="
