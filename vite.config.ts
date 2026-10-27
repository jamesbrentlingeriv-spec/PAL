import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  server: {
    host: true
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'pal-scope-icon.svg'],
      manifest: {
        name: 'PAL-Scope — Bench Optical PAL Identifier',
        short_name: 'PAL-Scope',
        description: 'Offline-capable Progressive Addition Lens (PAL) Identifier & Darkfield Vision Scope for optical dispensary and lab benches.',
        theme_color: '#090A0F',
        background_color: '#090A0F',
        display: 'standalone',
        orientation: 'any',
        icons: [
          {
            src: 'pal-scope-icon.svg',
            sizes: '192x192 512x512',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,json,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'tesseract-models-cache',
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 60 * 60 * 24 * 365
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          }
        ]
      }
    })
  ]
});
