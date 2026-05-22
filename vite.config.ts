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
      '/magicflu/service': {
        target: 'http://appdev.com.magicflu.com:16199',
        changeOrigin: true,
        secure: false,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq, req) => {
            const authHeader = req.headers['authorization']
            if (authHeader) {
              proxyReq.setHeader('Authorization', authHeader)
            }
          })
        },
      },
      '/magicflu/jwt': {
        target: 'http://appdev.com.magicflu.com:16199',
        changeOrigin: true,
        secure: false,
      },
    },
  },
}))
