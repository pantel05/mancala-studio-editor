import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(join(__dirname, 'package.json'), 'utf-8')) as { version: string }

// https://vite.dev/config/
export default defineConfig({
  define: {
    __EDITOR_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [react()],
  // Base path for GitHub Pages: https://pantel05.github.io/mancala-studio-editor/
  // In local dev this is overridden to '/' automatically by Vite.
  base: process.env.NODE_ENV === 'production' ? '/mancala-studio-editor/' : '/',
  server: {
    port: 5173,
    // Fail immediately if 5173 is in use — prevents silent port drift
    // that would lose localStorage data (it is scoped per origin/port).
    strictPort: true,
  },
})
