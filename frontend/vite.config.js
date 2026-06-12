import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const assetVersion = process.env.KARAZHAN_ASSET_VERSION || new Date().toISOString().replace(/\D/g, '').slice(0, 14)

function assetVersionPlugin() {
  return {
    name: 'karazhan-asset-version',
    apply: 'build',
    enforce: 'post',
    transformIndexHtml(html) {
      return html.replace(/(\/assets\/index\.(?:js|css))(?=["'])/g, `$1?v=${assetVersion}`)
    },
  }
}

export default defineConfig({
  plugins: [react(), assetVersionPlugin()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:8080',
      '/theme': 'http://127.0.0.1:8080',
      '/img': 'http://127.0.0.1:8080',
      '/uploads': 'http://127.0.0.1:8080',
      '/sounds': 'http://127.0.0.1:8080',
      '/legacy-admin': 'http://127.0.0.1:8080',
      '/login': 'http://127.0.0.1:8080',
      '/register': 'http://127.0.0.1:8080',
      '/shop': 'http://127.0.0.1:8080',
      '/carddraw': 'http://127.0.0.1:8080',
      '/update': 'http://127.0.0.1:8080',
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/index.js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: (assetInfo) => {
          if (assetInfo.name && assetInfo.name.endsWith('.css')) {
            return 'assets/index.css'
          }
          return 'assets/[name][extname]'
        },
      },
    },
  },
})
