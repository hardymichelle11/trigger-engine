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
      // Phase 4.5C+2: route browser → ThetaData local Terminal v3 through
      // the Vite dev server so the request is same-origin from the
      // browser's perspective. Terminal v3 does not ship CORS headers,
      // so a direct cross-origin fetch from the dashboard would be
      // blocked by the browser even though the Terminal serves 200 OK.
      // Strip the /theta prefix before forwarding.
      "/theta": {
        target: "http://127.0.0.1:25503",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/theta/, ""),
      },
    },
  },
})
