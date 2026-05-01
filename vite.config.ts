import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
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
