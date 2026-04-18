import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      // 收据归档文件静态服务：代理到后端
      '/receipts': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
