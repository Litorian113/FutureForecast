import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Multi-page app: the start page plus one HTML entry per scenario. Every scenario keeps its own
// bundle and stylesheet, so the three designs never share a page. /api is proxied to the
// FastAPI server of the weather scenario (weather/server.py). base './' keeps the build relocatable.
export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    port: 5503,
    open: false,
    proxy: { '/api': { target: 'http://localhost:8000', changeOrigin: true } },
  },
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      input: {
        main: 'index.html',
        wetter: 'wetter.html',
        strom: 'strom.html',
        erdbeben: 'erdbeben.html',
      },
    },
  },
});
