import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  // 开发模式下使用 /，生产模式使用 /magicflu/
  base: mode === 'production' ? '/magicflu/' : '/',
  server: {
    port: 3000,
    proxy: {
      // 只代理服务接口，不代理静态资源
      '/service': {
        target: 'http://demo.mf999.com/magicflu',
        changeOrigin: true,
        secure: false,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq, req) => {
            // 转发Authorization头
            const authHeader = req.headers['authorization']
            if (authHeader) {
              proxyReq.setHeader('Authorization', authHeader)
            }
            console.log(`[Proxy] ${req.method} ${req.url}`)
          })
        },
      },
      '/jwt': {
        target: 'http://demo.mf999.com/magicflu',
        changeOrigin: true,
        secure: false,
      },
      '/html/login.jsp': {
        target: 'http://demo.mf999.com/magicflu',
        changeOrigin: true,
        secure: false,
      },
    },
  },
}))
