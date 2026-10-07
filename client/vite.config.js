import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'

// In development, /api goes to the local Express server, the same way
// Vercel rewrites /api to Render in production (see vercel.json).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // A fixed port of its own, so another Vite project on 5173 cannot take
    // it (sign-in sends the browser back to CLIENT_ORIGIN).
    port: 5180,
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
})
