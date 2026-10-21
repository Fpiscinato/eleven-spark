import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'favicon.svg',
        'favicon.ico',
        'favicon-32.png',
        'icon.svg',
        'icon-192.png',
        'icon-512.png',
        'maskable-192.png',
        'maskable-512.png',
        'apple-touch-icon.png',
      ],
      manifest: {
        name: 'ElevenSpark – Gloucestershire 11+ Prep',
        short_name: 'ElevenSpark',
        description:
          'Friendly practice and realistic mock exams for the Gloucestershire Grammar Schools entrance test.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#ffffff',
        theme_color: '#4f46e5',
        categories: ['education'],
        icons: [
          { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          { name: 'Practise now', short_name: 'Practise', url: '/#/practice' },
          { name: 'Mock exam', short_name: 'Mock', url: '/#/mock' },
        ],
      },
      workbox: {
        navigateFallback: 'index.html',
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
      },
    }),
  ],
})
