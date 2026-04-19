#!/bin/bash
# ==========================================
# Wonder Platform - Database Backup Script
# ==========================================

# Define paths
APP_DIR="/www/wonder_platform/backend"
BACKUP_DIR="$APP_DIR/backups"
DB_PATH="$APP_DIR/hk_admin.db"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

# Ensure backup directory exists
mkdir -p "$BACKUP_DIR"

# Check if sqlite3 is installed
if ! command -v sqlite3 &> /dev/null; then
    echo "Error: sqlite3 is not installed. Please install it first (apt-get install sqlite3 / yum install sqlite)."
    exit 1
fi

# Use sqlite3 .backup command to ensure a safe, lock-free copy
sqlite3 "$DB_PATH" ".backup '${BACKUP_DIR}/hk_admin_backup_${TIMESTAMP}.db'"

# Compress the backup file to save space
gzip "${BACKUP_DIR}/hk_admin_backup_${TIMESTAMP}.db"

# Cleanup old backups: Keep only files newer than 14 days
find "$BACKUP_DIR" -type f -name "hk_admin_backup_*.db.gz" -mtime +14 -exec rm {} \;

echo "[$(date)] Backup completed: hk_admin_backup_${TIMESTAMP}.db.gz"
