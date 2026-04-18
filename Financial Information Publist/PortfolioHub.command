#!/bin/bash

# PortfolioHub One-Click Launcher (macOS)
# This script starts the backend and frontend, opens the browser,
# and ensures all processes are cleaned up upon exit.

# Get the directory where this script is located
PROJECT_ROOT="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
BACKEND_DIR="$PROJECT_ROOT/backend"
FRONTEND_DIR="$PROJECT_ROOT/frontend"

echo "🚀 Starting PortfolioHub..."

# 1. Cleanup Function
cleanup() {
    echo ""
    echo "🛑 Shutting down PortfolioHub..."
    [ ! -z "$BACKEND_PID" ] && kill $BACKEND_PID 2>/dev/null
    [ ! -z "$FRONTEND_PID" ] && kill $FRONTEND_PID 2>/dev/null
    # Backup: Ensure ports are cleared
    lsof -ti:8000 | xargs kill -9 2>/dev/null
    lsof -ti:5173 | xargs kill -9 2>/dev/null
    echo "✅ All processes terminated. Goodbye!"
    exit
}

# 2. Trap signals (Ctrl+C, closing window, etc.)
trap cleanup INT TERM EXIT

# 3. Port check/Pre-cleanup
echo "Checking for existing processes on ports 8000 and 5173..."
lsof -ti:8000 | xargs kill -9 2>/dev/null
lsof -ti:5173 | xargs kill -9 2>/dev/null

# 4. Start Backend (FastAPI)
echo "Starting Backend (Uvicorn)..."
cd "$BACKEND_DIR"
source venv/bin/activate

# ── Critical: Fix protobuf/futu version conflict ──
# futu SDK's generated pb2 files are incompatible with protobuf >= 4.x.
# Forcing pure-Python implementation avoids the C-extension crash.
export PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION=python

python -m uvicorn api_server:app --host 0.0.0.0 --port 8000 > "$BACKEND_DIR/api.log" 2>&1 &
BACKEND_PID=$!
echo "Backend started (PID: $BACKEND_PID)"

# 5. Start Frontend (Vite)
echo "Starting Frontend (Vite)..."
cd "$FRONTEND_DIR"
# Use npm run dev and capture its PID
npm run dev -- --port 5173 > /dev/null 2>&1 &
FRONTEND_PID=$!

# 6. Wait for systems to be ready
echo "Waiting for services to initialize..."
sleep 3

# 7. Open Browser
echo "Opening PortfolioHub UI in Browser..."
open "http://localhost:5173"

echo "--------------------------------------------------------"
echo "✅ PortfolioHub is RUNNING!"
echo "Keep this window open while using the app."
echo "Press Ctrl+C here or close this window to stop all services."
echo "--------------------------------------------------------"

# Keep the script running to maintain the trap
wait
