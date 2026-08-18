import { appVersionPlugin } from '@songara/pwa-base/config/vite-app-version'
import react from '@vitejs/plugin-react'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

/** Pitch-side chrome — keep the web app manifest aligned with the home screen. */
const THEME = '#123524'
const BACKGROUND = '#0a1a12'

const rootDir = dirname(fileURLToPath(import.meta.url))

/** Same-origin proxy for official FPL JSON. Not a product backend — Vite only. */
const fplApiProxy = {
  '/fpl-api': {
    target: 'https://fantasy.premierleague.com',
    changeOrigin: true,
    secure: true,
    rewrite: (path: string) => path.replace(/^\/fpl-api/, ''),
    configure: (proxy: {
      on: (event: 'proxyReq', listener: (proxyReq: { setHeader: (name: string, value: string) => void }) => void) => void
    }) => {
      proxy.on('proxyReq', (proxyReq) => {
        proxyReq.setHeader('Accept', 'application/json')
        proxyReq.setHeader(
          'User-Agent',
          'FPL-PWA/0.0 (GW0 prototype; https://github.com/RSHomeServer/FPL-PWA)',
        )
      })
    },
  },
}

export default defineConfig({
  plugins: [
    {
      name: 'favicon-ico',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url?.split('?')[0] === '/favicon.ico') {
            res.statusCode = 302
            res.setHeader('Location', '/favicon.svg')
            res.end()
            return
          }
          next()
        })
      },
    },
    appVersionPlugin(),
    react(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'FPL Decision Support',
        short_name: 'FPL',
        description:
          'Weekly Fantasy Premier League decision support — who to consider, keep vs sell, and why.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        theme_color: THEME,
        background_color: BACKGROUND,
        icons: [
          {
            src: '/favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/fpl-api\//],
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,json,webmanifest,wasm}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              url.hostname === 'cdn.jsdelivr.net' || url.hostname === 'api.github.com',
            handler: 'NetworkOnly',
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/fpl-api/'),
            handler: 'NetworkOnly',
          },
        ],
      },
      // Keep Vite HMR clean on fpl.dev.songara.uk — SW only in build/preview.
      devOptions: {
        enabled: false,
      },
    }),
  ],

  // file:../PWA-Base can nest its own React; force a single copy for production builds.
  resolve: {
    dedupe: ['react', 'react-dom', 'react-router-dom'],
    alias: {
      react: resolve(rootDir, 'node_modules/react'),
      'react-dom': resolve(rootDir, 'node_modules/react-dom'),
      'react-router-dom': resolve(rootDir, 'node_modules/react-router-dom'),
    },
  },

  server: {
    host: true,
    port: 5303,
    strictPort: true,
    allowedHosts: ['.dev.songara.uk'],
    proxy: fplApiProxy,
  },

  preview: {
    host: '127.0.0.1',
    port: 5304,
    strictPort: true,
    proxy: fplApiProxy,
  },

  build: {
    outDir: 'dist',
    sourcemap: true,
    commonjsOptions: {
      include: [/node_modules/, /highs/],
    },
  },

  optimizeDeps: {
    exclude: ['highs'],
  },

  assetsInclude: ['**/*.wasm'],
})
