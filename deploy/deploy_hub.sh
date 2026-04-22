#!/bin/bash
# Wonder Hub 部署脚本
# 使用方法: bash deploy/deploy_hub.sh
# 功能: 本地构建 wonder-hub 并上传到服务器

set -e

SERVER="root@47.239.63.70"
REMOTE_DIR="/www/wonder_platform/apps/wonder-hub"
LOCAL_DIR="/Users/derek/Projects/Wonder_Platform/apps/wonder-hub"
PACK="/tmp/next-build.tar.gz"

echo "============================="
echo "  Wonder Hub 部署脚本"
echo "============================="

# Step 1: 本地构建
echo ""
echo "[1/3] 本地构建中..."
cd "$LOCAL_DIR"
npx next build
echo "✅ 构建完成"

# Step 2: 打包（排除开发缓存，只打包必要文件）
echo ""
echo "[2/3] 打包中..."
tar czf "$PACK" --exclude='.next/dev' --exclude='.next/cache' .next/
SIZE=$(du -sh "$PACK" | cut -f1)
echo "✅ 打包完成 ($SIZE)"

# Step 3: 上传并重启
echo ""
echo "[3/3] 上传到服务器并重启..."
scp "$PACK" "$SERVER:/tmp/"
ssh "$SERVER" "cd $REMOTE_DIR && rm -rf .next && tar xzf /tmp/next-build.tar.gz && pm2 restart wonder-hub && echo '✅ 服务已重启'"

echo ""
echo "============================="
echo "  🚀 部署完成！"
echo "  https://wonderwisdom.online"
echo "============================="
