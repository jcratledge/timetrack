import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [],
      manifest: {
        name: 'Timetrack',
        short_name: 'Timetrack',
        description: 'Shift punches, hours, and pay estimates.',
        theme_color: '#081010',
        background_color: '#081010',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          
          { src: '/icons/icon-512.png', sizes: '192x192 512x512', type: 'image/png' },
          
          { src: '/icons/maskable-512.png', sizes: '192x192 512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        // Never cache Supabase API calls: stale punch data is worse than none
        runtimeCaching: [],
      },
    }),
  ],
})
