#!/bin/bash

echo "========================================="
echo "   Wonder Platform - 裸机后台启动脚本"
echo "========================================="

# 1. 杀死可能残留的旧进程（防止端口占用报错）
echo "-> 清理历史进程..."
pkill -f "uvicorn main:app" || true
pkill -f "next start" || true
pkill -f "vite preview" || true
sleep 2

# 2. 启动 Python 后端
echo "-> 启动 Backend (端口 8000)..."
cd backend
# 如果存在虚拟环境则激活它
if [ -f "venv/bin/activate" ]; then
    source venv/bin/activate
fi
nohup uvicorn main:app --host 0.0.0.0 --port 8000 > backend_prod.log 2>&1 &
cd ..

# 3. 启动 Wonder Hub (Next.js)
echo "-> 启动 Wonder Hub (端口 3000)..."
cd apps/wonder-hub
nohup npx next start -p 3000 > wonder_hub_prod.log 2>&1 &
cd ../..

# 4. 启动 Company Admin (Vite Preview)
echo "-> 启动 Company Admin (端口 5173)..."
cd apps/company-admin
# 使用 vite preview 可以完美继承 vite.config.js 里的 /api 反向代理配置！
nohup npx vite preview --host 0.0.0.0 --port 5173 > company_admin_prod.log 2>&1 &
cd ../..

echo "========================================="
echo "✅ 所有服务已成功在后台静默运行！"
echo ""
echo "你可以使用以下命令随时查看它们的实时运行日志："
echo "▶ 查看后端日志： tail -f backend/backend_prod.log"
echo "▶ 查看C端日志 ： tail -f apps/wonder-hub/wonder_hub_prod.log"
echo "▶ 查看B端日志 ： tail -f apps/company-admin/company_admin_prod.log"
echo ""
echo "如需彻底停止所有服务，可运行： ./stop_prod.sh (如果需要我可以为你生成)"
echo "========================================="
