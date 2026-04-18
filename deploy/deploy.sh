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

# ── 1. 确保日志目录存在 ─────────────────────────
mkdir -p "$LOG_DIR"

# ── 2. 拉取最新代码 ─────────────────────────────
echo ""
echo "[1/5] 拉取最新代码 (git pull)..."
cd "$PROJECT_DIR"
git pull origin main
echo "  ✅ 代码已更新"

# ── 3. 更新 Python 依赖 ──────────────────────────
echo ""
echo "[2/5] 更新 Python 依赖..."
cd "$BACKEND_DIR"
source venv/bin/activate
pip install -r requirements.txt --quiet
deactivate
echo "  ✅ Python 依赖已更新"

# ── 4. 安装前端依赖并构建 ────────────────────────
echo ""
echo "[3/5] 安装前端依赖..."
cd "$PROJECT_DIR"
pnpm install --frozen-lockfile
echo "  ✅ 前端依赖已安装"

echo ""
echo "[4/5] 构建前端应用..."
# 单独构建各应用（避免 wonder-hub 的大内存消耗影响其他服务）
cd "$PROJECT_DIR/apps/wonder-hub"
NODE_OPTIONS="--max-old-space-size=1024" npx next build
echo "  ✅ Wonder Hub 构建完成"

cd "$PROJECT_DIR/apps/company-admin"
npx vite build
echo "  ✅ Company Admin 构建完成"

cd "$PROJECT_DIR/apps/fis-hub"
npx vite build
echo "  ✅ FIS Hub 构建完成"

# ── 5. 零停机重载所有进程 ────────────────────────
echo ""
echo "[5/5] 零停机重载所有服务 (pm2 reload)..."
cd "$PROJECT_DIR"

# 检查 PM2 是否已在运行
if pm2 list | grep -q "wonder-backend"; then
    pm2 reload deploy/ecosystem.config.js --update-env
    echo "  ✅ 所有进程已零停机重载"
else
    # 首次启动
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
echo "📋 常用运维命令："
echo "  查看实时日志：pm2 logs"
echo "  查看单个服务：pm2 logs wonder-backend"
echo "  重启单个服务：pm2 restart wonder-hub"
echo "  停止所有服务：pm2 stop all"
echo "============================================="
