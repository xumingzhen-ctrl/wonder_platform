#!/bin/bash
# =============================================================
# Wonder Platform — 日常代码更新部署脚本
# 在阿里云轻量服务器上执行，用于每次代码迭代推送后更新生产环境
# 使用方式：chmod +x deploy.sh && ./deploy/deploy.sh
# =============================================================

set -e

PROJECT_DIR="/www/wonder_platform"
BACKEND_DIR="$PROJECT_DIR/backend"
LOG_DIR="$PROJECT_DIR/logs"

echo ""
echo "🚀 Wonder Platform 开始部署更新..."
echo "============================================="

# ── 0. 检查 Swap（低内存服务器必须有 Swap） ─────
if [ "$(swapon --show | wc -l)" -lt 2 ]; then
    echo ""
    echo "⚠️  未检测到 Swap，正在创建 1GB Swap 文件..."
    sudo fallocate -l 1G /swapfile 2>/dev/null || sudo dd if=/dev/zero of=/swapfile bs=1M count=1024
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile
    sudo swapon /swapfile
    # 持久化
    grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
    echo "  ✅ Swap 已创建并启用"
else
    echo "  ✅ Swap 已存在：$(free -h | awk '/Swap/{print $2}')"
fi

# ── 1. 确保日志目录存在 ─────────────────────────
mkdir -p "$LOG_DIR"

# ── 2. 备份数据库 ────────────────────────────────
echo ""
echo "[1/7] 备份数据库..."
if [ -f "$PROJECT_DIR/deploy/backup.sh" ]; then
    bash "$PROJECT_DIR/deploy/backup.sh"
else
    echo "  ⚠️ 备份脚本不存在，跳过"
fi

# ── 3. 停止所有服务（释放内存给构建过程） ────────
echo ""
echo "[2/7] 停止所有服务以释放内存..."
pm2 stop all 2>/dev/null || true
echo "  ✅ 服务已停止，内存已释放"

# ── 4. 拉取最新代码 ─────────────────────────────
echo ""
echo "[3/7] 拉取最新代码 (git pull)..."
cd "$PROJECT_DIR"
git pull origin main
echo "  ✅ 代码已更新"

# ── 5. 更新 Python 依赖 + 数据库迁移 ────────────
echo ""
echo "[4/7] 更新 Python 依赖 + 数据库迁移..."
cd "$BACKEND_DIR"
source venv/bin/activate
pip install -r requirements.txt --quiet
python scripts/migrate_auth.py
deactivate
echo "  ✅ Python 依赖已更新，数据库已迁移"

# ── 6. 安装前端依赖并构建 ────────────────────────
echo ""
echo "[5/7] 安装前端依赖..."
cd "$PROJECT_DIR"
pnpm install --no-frozen-lockfile
echo "  ✅ 前端依赖已安装"

echo ""
echo "[6/7] 构建前端应用（逐个构建，防止内存溢出）..."

# Wonder Hub（Next.js，内存消耗最大）
cd "$PROJECT_DIR/apps/wonder-hub"
echo "  📦 构建 Wonder Hub..."
NODE_OPTIONS="--max-old-space-size=768" npx next build
# standalone 模式需要手动同步 static 和 public（先删后复制，防止旧 BUILD_ID 残留）
STANDALONE_DIR="$PROJECT_DIR/apps/wonder-hub/.next/standalone/apps/wonder-hub"
rm -rf "$STANDALONE_DIR/.next/static"
cp -r "$PROJECT_DIR/apps/wonder-hub/.next/static" "$STANDALONE_DIR/.next/static"
rm -rf "$STANDALONE_DIR/public"
cp -r "$PROJECT_DIR/apps/wonder-hub/public" "$STANDALONE_DIR/public"
echo "  ✅ Wonder Hub 构建完成（standalone + static 已同步）"

# Company Admin（Vite，内存消耗小）
cd "$PROJECT_DIR/apps/company-admin"
echo "  📦 构建 Company Admin..."
npx vite build
echo "  ✅ Company Admin 构建完成"

# FIS Hub（Vite，内存消耗小）
cd "$PROJECT_DIR/apps/fis-hub"
echo "  📦 构建 FIS Hub..."
npx vite build
echo "  ✅ FIS Hub 构建完成"

# ── 7. 启动所有服务 ──────────────────────────────
echo ""
echo "[7/7] 启动所有服务..."
cd "$PROJECT_DIR"

if pm2 list 2>/dev/null | grep -q "wonder-backend"; then
    pm2 start deploy/ecosystem.config.js --update-env
    echo "  ✅ 所有进程已启动"
else
    pm2 start deploy/ecosystem.config.js
    pm2 save
    echo "  ✅ 所有进程已首次启动"
fi

# ── 完成 ─────────────────────────────────────────
echo ""
echo "============================================="
echo "✅ 部署完成！当前服务状态："
pm2 status
echo ""
echo "💾 内存使用情况："
free -h
echo ""
echo "📋 常用运维命令："
echo "  查看实时日志：pm2 logs"
echo "  查看单个服务：pm2 logs wonder-backend"
echo "  重启单个服务：pm2 restart wonder-hub"
echo "  停止所有服务：pm2 stop all"
echo "============================================="
