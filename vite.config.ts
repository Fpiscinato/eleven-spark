import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { APP_VERSION } from './src/config/version.js'

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'eleven-spark-version',
      transformIndexHtml(html) {
        return html.replaceAll('%APP_VERSION%', APP_VERSION)
      },
    },
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'favicon.svg',
        'favicon.ico',
        'favicon-32.png',
        'icon.svg',
        'app-icons/**/*.{png,svg,ico}',
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
          { src: `/icon.svg?v=${APP_VERSION}`, sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: `/app-icons/v${APP_VERSION}/icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: `/app-icons/v${APP_VERSION}/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: `/app-icons/v${APP_VERSION}/maskable-192.png`, sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: `/app-icons/v${APP_VERSION}/maskable-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
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
