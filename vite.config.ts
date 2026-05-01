import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// API server runs separately on port 8787 (override via API_PORT env var).
// Replit only forwards one external port, so we proxy /api/* from the
// vite dev server (5000 → public 80) to the API server in-process.
const apiPort = Number(process.env.API_PORT ?? 8787);

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5000,
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: `http://localhost:${apiPort}`,
        changeOrigin: false
      }
    },
    // Replit's public URL is *.repl.co / *.replit.app — allow it through
    // the dev-server allowedHosts gate so the iframe preview works.
    allowedHosts: true
  }
});
