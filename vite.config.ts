import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'FloraOS',
        short_name: 'FloraOS',
        description: '我的个人操作系统',
        theme_color: '#f3f4f9',
        background_color: '#f3f4f9',
        display: 'standalone',
        start_url: '/',
        lang: 'zh-CN',
        icons: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png' }, { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }],
      },
    }),
  ],
  server: { port: 5173, host: true },
})
