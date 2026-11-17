import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const apiProxy = {
  '/api': 'http://127.0.0.1:4000',
  '/socket.io': { target: 'http://127.0.0.1:4000', ws: true },
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: true,
    // Same-origin API in dev, as in production behind nginx (ADR-008).
    proxy: apiProxy,
  },
  // `vite preview` (Playwright) talks to the same local API.
  preview: { proxy: apiProxy },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
