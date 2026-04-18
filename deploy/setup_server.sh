#!/bin/bash
# =============================================================
# Wonder Platform — 阿里云香港轻量应用服务器 首次初始化脚本
# 系统要求：Ubuntu 22.04 LTS
# 使用方式：chmod +x setup_server.sh && sudo ./setup_server.sh
# =============================================================

set -e  # 任何命令失败则立即退出

echo ""
echo "🚀 Wonder Platform 服务器初始化开始..."
echo "============================================="

# ── 1. 更新系统包 ────────────────────────────────
echo ""
echo "[1/7] 更新系统包..."
apt-get update -y && apt-get upgrade -y

# ── 2. 安装基础工具 ──────────────────────────────
echo ""
echo "[2/7] 安装基础工具 (git, curl, unzip, nginx)..."
apt-get install -y git curl unzip build-essential nginx

# ── 3. 安装 Python 3 (Ubuntu 22.04 默认 3.10) ────────
echo ""
echo "[3/7] 安装 Python 3 和 venv..."
apt-get install -y python3 python3-venv python3-dev python3-pip sqlite3
echo "  ✅ Python 版本: $(python3 --version)"

# ── 4. 安装 Node.js 20 LTS ───────────────────────
echo ""
echo "[4/7] 安装 Node.js 20 LTS..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs
echo "  ✅ Node 版本: $(node --version)"
echo "  ✅ npm 版本: $(npm --version)"

# 安装 pnpm
npm install -g pnpm
echo "  ✅ pnpm 版本: $(pnpm --version)"

# 安装 PM2（进程管理）
npm install -g pm2
echo "  ✅ PM2 版本: $(pm2 --version)"

# ── 5. 创建项目目录 ──────────────────────────────
echo ""
echo "[5/7] 创建项目目录结构..."
PROJECT_DIR="/www/wonder_platform"
mkdir -p "$PROJECT_DIR"
mkdir -p "$PROJECT_DIR/data/db"
mkdir -p "$PROJECT_DIR/data/receipts_inbox"
mkdir -p "$PROJECT_DIR/data/receipts_archive"
mkdir -p "$PROJECT_DIR/data/receipts_error"
mkdir -p "$PROJECT_DIR/data/statements_inbox"
mkdir -p "$PROJECT_DIR/data/statements_archive"
mkdir -p "$PROJECT_DIR/data/statements_error"
echo "  ✅ 项目目录已创建：$PROJECT_DIR"
echo "  ✅ 数据目录已创建：$PROJECT_DIR/data/"

# ── 6. 配置 Nginx ────────────────────────────────
echo ""
echo "[6/7] 配置 Nginx..."
# 复制自定义 Nginx 配置（在此脚本同级目录中）
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cp "$SCRIPT_DIR/nginx.conf" /etc/nginx/sites-available/wonder_platform
ln -sf /etc/nginx/sites-available/wonder_platform /etc/nginx/sites-enabled/wonder_platform
# 移除默认配置
rm -f /etc/nginx/sites-enabled/default

# 测试 Nginx 配置
nginx -t
systemctl restart nginx
systemctl enable nginx
echo "  ✅ Nginx 配置完成并已启动"

# ── 7. 配置 PM2 开机自启 ─────────────────────────
echo ""
echo "[7/7] 配置 PM2 开机自启..."
pm2 startup systemd -u root --hp /root
echo "  ✅ PM2 开机自启已配置"

# ── 完成提示 ─────────────────────────────────────
echo ""
echo "============================================="
echo "✅ 服务器初始化完成！"
echo ""
echo "📋 后续步骤："
echo "  1. 将项目代码克隆到 $PROJECT_DIR："
echo "     cd $PROJECT_DIR && git clone https://github.com/xumingzhen-ctrl/wonder_platform.git ."
echo ""
echo "  2. 复制生产环境变量文件："
echo "     cp deploy/.env.production backend/.env"
echo "     ⚠️  编辑 backend/.env，填入你的阿里云服务器公网 IP"
echo ""
echo "  3. 安装依赖并构建："
echo "     cd backend && python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt"
echo "     cd .. && pnpm install && pnpm build"
echo ""
echo "  4. 启动所有服务："
echo "     pm2 start deploy/ecosystem.config.js"
echo "     pm2 save"
echo ""
echo "  5. 开放轻量服务器防火墙端口（在阿里云控制台操作）："
echo "     TCP 22   (SSH)"
echo "     TCP 80   (HTTP - Wonder Hub 主入口)"
echo "     TCP 5174 (Company Admin B端)"
echo "     TCP 5175 (FIS Hub 金融沙盘)"
echo "============================================="
