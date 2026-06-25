import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// Vite config for the ThinkAiSolutions client.
// - '@thinkai/shared' resolves to the shared package source so we get live types in dev.
// - '@' is a convenience alias for ./src.
// - '/api' is proxied to the Express server in dev so the browser hits a same-origin path.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@thinkai/shared': path.resolve(__dirname, '../shared/src'),
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
});
