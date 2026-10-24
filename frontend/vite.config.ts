import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// `npm run preview` sends the same security headers production does, read
// from security-headers.json, so a host the CSP would block fails here first.
const securityHeaders = JSON.parse(
  readFileSync(new URL('./security-headers.json', import.meta.url), 'utf8'),
) as Record<string, string>

// GET endpoints that are safe to keep offline. /ai/* and anything carrying a
// personal document are never cached — they are not in this list and the
// NetworkOnly rule below makes that explicit.
const CACHEABLE_GET = /\/(brief|weather|mandi\/prices|farmer\/me)(\?|$)/

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Arth — अर्थ',
        short_name: 'Arth',
        description: 'आजचं शेतीचं काम, बाजारभाव आणि सल्ला — तुमच्या भाषेत.',
        lang: 'mr',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#DCD7C9',
        theme_color: '#2E6B3F',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg}'],
        // fonts are cached the first time a screen asks for them (below)
        globIgnores: ['**/fonts/**', 'mockServiceWorker.js'],
        navigateFallbackDenylist: [/^\/__/, /^\/ai\//],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => /\/ai\//.test(url.pathname),
            handler: 'NetworkOnly',
          },
          {
            urlPattern: ({ url, request }) =>
              request.method === 'GET' && CACHEABLE_GET.test(url.pathname + url.search),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'arth-api',
              networkTimeoutSeconds: 6,
              expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 3 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            urlPattern: /\/fonts\/.*\.woff2$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'arth-fonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  server: { host: true, port: 5173 },
  preview: { headers: securityHeaders },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/recharts') || id.includes('node_modules/d3-')) return 'charts'
        },
      },
    },
  },
})
