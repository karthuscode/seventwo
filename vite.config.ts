import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { sites } from '@openai/sites-vite-plugin'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    sites(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['poker-chip.svg'],
      manifest: {
        name: 'SevenTwo',
        short_name: 'SevenTwo',
        description: 'A lightweight host companion for live Texas Hold’em home games.',
        theme_color: '#090a0c',
        background_color: '#090a0c',
        display: 'standalone',
        id: '/',
        start_url: '/',
        scope: '/',
        orientation: 'portrait-primary',
        icons: [
          {
            src: '/poker-chip.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        importScripts: ['/push-sw.js'],
      },
    }),
  ],
})
