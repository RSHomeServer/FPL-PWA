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

export default defineConfig({
  plugins: [
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
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,json,webmanifest,wasm}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              url.hostname === 'cdn.jsdelivr.net' || url.hostname === 'api.github.com',
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
  },

  preview: {
    host: '127.0.0.1',
    port: 5304,
    strictPort: true,
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
