import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' keeps the built site relocatable. /api is proxied to the FastAPI server (weather/server.py).
export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    port: 5503,
    open: false,
    proxy: { '/api': { target: 'http://localhost:8000', changeOrigin: true } },
  },
});
