#!/bin/bash

echo "========================================="
echo "   Wonder Platform - 停止所有后台服务"
echo "========================================="

echo "-> 正在关闭 Python 后端 (uvicorn)..."
pkill -f "uvicorn main:app" || echo "   后端未运行"

echo "-> 正在关闭 Wonder Hub (next start)..."
pkill -f "next start" || echo "   Wonder Hub 未运行"

echo "-> 正在关闭 Company Admin & FIS Hub (vite preview)..."
pkill -f "vite preview" || echo "   Vite 服务未运行"

echo "========================================="
echo "✅ 所有后台服务已停止！"
echo "========================================="
