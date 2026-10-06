import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// In development, /api goes to the local Express server, the same way
// Vercel rewrites /api to Render in production (see vercel.json).
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
})
