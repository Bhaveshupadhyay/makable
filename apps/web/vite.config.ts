import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    // makable-backend (FastAPI, `uv run uvicorn main:create_app --factory --port 8787`) serves `/api/v1`,
    // including AI edits.
    proxy: { '/api': 'http://localhost:8787' },
  },
})
