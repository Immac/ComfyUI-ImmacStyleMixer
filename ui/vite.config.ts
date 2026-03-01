import path from 'path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

interface RewriteComfyImportsOptions {
  isDev: boolean
}

// In dev mode, resolve ComfyUI scripts from the local ComfyUI server
const rewriteComfyImports = ({ isDev }: RewriteComfyImportsOptions) => ({
  name: 'rewrite-comfy-imports',
  resolveId(source: string) {
    if (!isDev) return
    if (source === '/scripts/app.js') return 'http://127.0.0.1:8188/scripts/app.js'
    if (source === '/scripts/api.js') return 'http://127.0.0.1:8188/scripts/api.js'
    return null
  },
})

export default defineConfig(({ mode }) => ({
  plugins: [react(), rewriteComfyImports({ isDev: mode === 'development' })],
  build: {
    emptyOutDir: true,
    rollupOptions: {
      external: ['/scripts/app.js', '/scripts/api.js'],
      input: {
        main: path.resolve(__dirname, 'src/main.tsx'),
      },
      output: {
        dir: '../dist',
        entryFileNames: 'immac_style_mixer/[name].js',
        chunkFileNames: 'immac_style_mixer/[name]-[hash].js',
        assetFileNames: 'immac_style_mixer/[name][extname]',
        manualChunks: {
          vendor: ['react', 'react-dom'],
        },
      },
    },
  },
}))
