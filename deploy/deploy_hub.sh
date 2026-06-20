#!/bin/bash
# =============================================================
# Wonder Hub 部署脚本 v2
# 用法:
#   bash deploy/deploy_hub.sh          # 完整部署（构建 + 上传 + 重启）
#   bash deploy/deploy_hub.sh --quick  # 快速部署（跳过构建，仅上传已有产物）
#
# 修复记录:
#   v2 - 正确处理 Next.js standalone 模式：
#        必须手动将 .next/static/ 和 public/ 复制进 standalone 子目录，
#        否则所有 JS/CSS 返回 404 导致白屏。
# =============================================================

set -euo pipefail

# ── 配置 ──────────────────────────────────────────────────────
SERVER="root@47.239.63.70"
REMOTE_DIR="/www/wonder_platform/apps/wonder-hub"
LOCAL_HUB="/Users/derek/Projects/Wonder_Platform/apps/wonder-hub"
PACK="/tmp/wonder-hub-build.tar.gz"
# standalone 内的嵌套路径（monorepo 结构导致）
STANDALONE_APP="${LOCAL_HUB}/.next/standalone/apps/wonder-hub"
SSH_OPTS="-o ServerAliveInterval=30 -o ConnectTimeout=15"

# ── 颜色输出 ─────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

info()    { echo -e "${CYAN}▶${NC} $*"; }
success() { echo -e "${GREEN}✓${NC} $*"; }
warn()    { echo -e "${YELLOW}⚠${NC} $*"; }
error()   { echo -e "${RED}✗ ERROR:${NC} $*" >&2; exit 1; }
step()    { echo -e "\n${BOLD}[$1]${NC} $2"; }

# ── 参数解析 ─────────────────────────────────────────────────
QUICK=false
for arg in "$@"; do
  case $arg in
    --quick|-q) QUICK=true ;;
    --help|-h)
      echo "用法: bash deploy/deploy_hub.sh [--quick]"
      echo "  --quick  跳过构建，直接上传 .next/standalone（需已构建）"
      exit 0 ;;
  esac
done

# ── 开始 ─────────────────────────────────────────────────────
echo -e "\n${BOLD}================================================${NC}"
echo -e "${BOLD}   Wonder Hub 部署脚本 v2${NC}"
echo -e "${BOLD}   目标: wonderwisdom.online${NC}"
echo -e "${BOLD}================================================${NC}"
[[ "$QUICK" == true ]] && warn "快速模式：跳过本地构建"

# ── Step 1: 本地构建 ─────────────────────────────────────────
if [[ "$QUICK" == false ]]; then
  step "1/4" "本地构建 (Next.js standalone)..."
  cd "$LOCAL_HUB"

  # ⚠️  关键：.env.local 优先级高于 .env.production
  # NEXT_PUBLIC_* 变量在 build 时被硬编译进 bundle
  # 必须临时隐藏 .env.local，否则生产构建会把 localhost:8000 写入 JS
  if [[ -f ".env.local" ]]; then
    warn ".env.local 已临时移除（防止覆盖 .env.production）"
    mv .env.local .env.local.bak
  fi

  # 确保构建失败时也能恢复 .env.local
  trap '[[ -f .env.local.bak ]] && mv .env.local.bak .env.local && warn ".env.local 已恢复"' EXIT

  npx next build

  # 恢复 .env.local（供本地开发使用）
  [[ -f ".env.local.bak" ]] && mv .env.local.bak .env.local && success ".env.local 已恢复"
  trap - EXIT  # 清除 trap

  success "Next.js 构建完成"
else
  step "1/4" "跳过构建（快速模式）"
  cd "$LOCAL_HUB"
fi

# ── 验证 standalone 目录存在 ─────────────────────────────────
[[ -f "${STANDALONE_APP}/server.js" ]] \
  || error "standalone/server.js 不存在，请先运行完整构建（不加 --quick）"

# ── Step 2: 注入静态资源（standalone 模式的必要步骤）─────────
# Next.js 不会自动复制这两个目录进 standalone，必须手动处理
step "2/4" "注入静态资源到 standalone..."

info "复制 .next/static/ → standalone 内..."
rm -rf "${STANDALONE_APP}/.next/static"
cp -r "${LOCAL_HUB}/.next/static" "${STANDALONE_APP}/.next/static"

info "复制 public/ → standalone 内..."
rm -rf "${STANDALONE_APP}/public"
cp -r "${LOCAL_HUB}/public" "${STANDALONE_APP}/public"

success "静态资源注入完成"

# ── Step 3: 打包 ─────────────────────────────────────────────
step "3/4" "打包构建产物..."
cd "$LOCAL_HUB"

tar czf "$PACK" \
  --exclude='.next/standalone/apps/wonder-hub/node_modules/.cache' \
  --exclude='.next/cache' \
  .next/standalone/ \
  .next/static/ \
  public/

SIZE=$(du -sh "$PACK" | cut -f1)
success "打包完成 → ${PACK} (${SIZE})"

# ── Step 4: 上传 + 服务器部署 ────────────────────────────────
step "4/4" "上传并部署到服务器..."

info "上传中..."
rsync -azP -e "ssh ${SSH_OPTS}" "$PACK" "${SERVER}:/tmp/"
success "上传完成"

info "服务器端部署..."
ssh ${SSH_OPTS} "$SERVER" bash <<REMOTE
  set -euo pipefail
  REMOTE_DIR="${REMOTE_DIR}"

  echo "  → 进入目录: \$REMOTE_DIR"
  cd "\$REMOTE_DIR"

  # 备份当前版本（保留最近一次，方便回滚）
  if [[ -d ".next/standalone" ]]; then
    echo "  → 备份当前版本..."
    rm -rf ".next/standalone.bak" ".next/static.bak" "public.bak"
    cp -r ".next/standalone" ".next/standalone.bak" 2>/dev/null || true
    cp -r ".next/static"    ".next/static.bak"    2>/dev/null || true
    cp -r "public"          "public.bak"          2>/dev/null || true
  fi

  # 清理旧版本并解压新版本
  echo "  → 清理旧版本..."
  rm -rf .next/standalone .next/static public

  echo "  → 解压新版本..."
  tar xzf /tmp/wonder-hub-build.tar.gz

  # 确认 server.js 存在
  SERVER_JS=".next/standalone/apps/wonder-hub/server.js"
  [[ -f "\$SERVER_JS" ]] || { echo "ERROR: server.js 未找到，回滚..."; mv ".next/standalone.bak" ".next/standalone"; mv ".next/static.bak" ".next/static"; mv "public.bak" "public"; exit 1; }

  # 重启 PM2
  echo "  → 重启 wonder-hub..."
  pm2 restart wonder-hub

  # 等待服务就绪后健康检查
  echo "  → 等待服务就绪..."
  sleep 3
  HTTP_STATUS=\$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ --max-time 10 || echo "000")
  if [[ "\$HTTP_STATUS" == "200" ]]; then
    echo "  ✓ 健康检查通过 (HTTP \$HTTP_STATUS)"
    # 清理备份
    rm -rf ".next/standalone.bak" ".next/static.bak" "public.bak"
  else
    echo "  ✗ 健康检查失败 (HTTP \$HTTP_STATUS)，执行回滚..."
    pm2 stop wonder-hub || true
    rm -rf .next/standalone .next/static public
    mv ".next/standalone.bak" ".next/standalone" 2>/dev/null || true
    mv ".next/static.bak"    ".next/static"    2>/dev/null || true
    mv "public.bak"          "public"          2>/dev/null || true
    pm2 start wonder-hub
    echo "  ✗ 已回滚到上一版本"
    exit 1
  fi

  echo "  → 清理临时文件..."
  rm -f /tmp/wonder-hub-build.tar.gz

  pm2 logs wonder-hub --lines 5 --nostream
REMOTE

# ── 完成 ─────────────────────────────────────────────────────
echo -e "\n${BOLD}================================================${NC}"
echo -e "${GREEN}${BOLD}   🚀 部署成功！${NC}"
echo -e "   ${CYAN}https://wonderwisdom.online${NC}"
echo -e "${BOLD}================================================${NC}\n"
