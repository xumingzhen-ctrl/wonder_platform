// =============================================================
// Wonder Platform — PM2 生态系统配置
// 阿里云香港轻量应用服务器（4 个进程统一管理）
// 使用方式：pm2 start ecosystem.config.js
// =============================================================

const PROJECT_ROOT = '/www/wonder_platform'

module.exports = {
  apps: [
    // ── 1. Python 后端 (FastAPI + uvicorn) ──────────────────────
    {
      name: 'wonder-backend',
      script: `${PROJECT_ROOT}/backend/venv/bin/uvicorn`,
      args: 'main:app --host 127.0.0.1 --port 8000 --workers 2',
      cwd: `${PROJECT_ROOT}/backend`,
      interpreter: 'none',   // 直接调用 venv 中的 uvicorn 可执行文件
      env: {
        PYTHONPATH: `${PROJECT_ROOT}/backend`,
      },
      // 日志配置
      out_file: `${PROJECT_ROOT}/logs/backend_out.log`,
      error_file: `${PROJECT_ROOT}/logs/backend_err.log`,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      // 稳定性配置
      restart_delay: 3000,
      max_restarts: 10,
      max_memory_restart: '512M',
      watch: false,
    },

    // ── 2. Wonder Hub (Next.js C端 — standalone 模式) ─────────────
    //    output: "standalone" 构建后，必须用 node server.js 启动
    //    而非 npx next start，否则 _next/static/* 全部 404
    {
      name: 'wonder-hub',
      script: `${PROJECT_ROOT}/apps/wonder-hub/.next/standalone/apps/wonder-hub/server.js`,
      cwd: `${PROJECT_ROOT}/apps/wonder-hub`,
      interpreter: 'node',
      env: {
        NODE_ENV: 'production',
        PORT: '3000',
        HOSTNAME: '0.0.0.0',
      },
      out_file: `${PROJECT_ROOT}/logs/wonder_hub_out.log`,
      error_file: `${PROJECT_ROOT}/logs/wonder_hub_err.log`,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      restart_delay: 3000,
      max_restarts: 10,
      max_memory_restart: '512M',
      watch: false,
    },

    // ── 3. Company Admin (Vite B端 SaaS) ────────────────────────
    {
      name: 'company-admin',
      script: 'npx',
      args: 'vite preview --host 0.0.0.0 --port 5174',
      cwd: `${PROJECT_ROOT}/apps/company-admin`,
      env: {
        NODE_ENV: 'production',
      },
      out_file: `${PROJECT_ROOT}/logs/company_admin_out.log`,
      error_file: `${PROJECT_ROOT}/logs/company_admin_err.log`,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      restart_delay: 3000,
      max_restarts: 10,
      max_memory_restart: '256M',
      watch: false,
    },

    // ── 4. FIS Hub (Vite 金融沙盘) ───────────────────────────────
    {
      name: 'fis-hub',
      script: 'npx',
      args: 'vite preview --host 0.0.0.0 --port 5175',
      cwd: `${PROJECT_ROOT}/apps/fis-hub`,
      env: {
        NODE_ENV: 'production',
      },
      out_file: `${PROJECT_ROOT}/logs/fis_hub_out.log`,
      error_file: `${PROJECT_ROOT}/logs/fis_hub_err.log`,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      restart_delay: 3000,
      max_restarts: 10,
      max_memory_restart: '256M',
      watch: false,
    },
  ],
}
