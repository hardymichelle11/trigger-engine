import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  base: '/',
  plugins: [react(), tailwindcss()],
  server: {
    hmr: {
      overlay: false,
    },
    proxy: {
      "/api/knowledgebot": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
})
