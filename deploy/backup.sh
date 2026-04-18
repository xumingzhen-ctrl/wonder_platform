#!/bin/bash
# =============================================================
# Wonder Platform — 数据库本地备份脚本
# 建议配置 crontab 每天执行，例如每天凌晨 3 点：
# 0 3 * * * /www/wonder_platform/deploy/backup.sh
# =============================================================

PROJECT_DIR="/www/wonder_platform"
DB_FILE="$PROJECT_DIR/backend/hk_admin.db"
BACKUP_DIR="$PROJECT_DIR/data/backups"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/hk_admin_$DATE.db.gz"

echo "[$(date)] 开始备份数据库..."

# 确保备份目录存在
mkdir -p "$BACKUP_DIR"

# 检查数据库是否存在
if [ ! -f "$DB_FILE" ]; then
    echo "❌ 错误: 数据库文件不存在 $DB_FILE"
    exit 1
fi

# 为了防止拷贝时文件正在写入导致损坏，使用 sqlite3 自带的 .backup 功能。
# 如果系统没有安装 sqlite3，则退化为直接 gzip 复制。
if command -v sqlite3 >/dev/null 2>&1; then
    echo "🔄 使用 sqlite3 建立安全热备份..."
    sqlite3 "$DB_FILE" ".backup '$BACKUP_DIR/temp.db'"
    gzip -c "$BACKUP_DIR/temp.db" > "$BACKUP_FILE"
    rm -f "$BACKUP_DIR/temp.db"
else
    echo "⚠️ 未检测到 sqlite3 命令行工具，直接进行 gzip 复制备份..."
    gzip -c "$DB_FILE" > "$BACKUP_FILE"
fi

echo "✅ 备份成功: $BACKUP_FILE"

# 清理 30 天前的旧备份
find "$BACKUP_DIR" -name "hk_admin_*.db.gz" -type f -mtime +30 -delete
echo "✅ 清理了 30 天前的历史备份"

echo "--------------------------------------------------------"
