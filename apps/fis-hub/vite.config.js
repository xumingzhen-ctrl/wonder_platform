import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const apiProxy = {
  '/api': {
    target: 'http://localhost:8000',
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/api/, ''),
  },
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5175,
    proxy: apiProxy,
  },
  // preview.proxy 确保 `vite preview`（生产模式）同样能正确转发 API 请求
  preview: {
    port: 5175,
    proxy: apiProxy,
    allowedHosts: true,
  },
})
