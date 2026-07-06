import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Serve from a sub-path when deployed to GitHub Pages (set VITE_BASE=/TravisTest/)
  base: process.env.VITE_BASE || '/',
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Sync API (optional; app is fully functional without the server)
      '/api': 'http://localhost:8787',
    },
  },
  build: {
    sourcemap: true,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
} as never)
