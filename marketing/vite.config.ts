import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// Vite config for the ThinkAiSolutions marketing (brochure) site.
// Standalone: no '@thinkai/shared' resolution, no '/api' proxy.
// - '@' is a convenience alias for ./src.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5174,
  },
  build: {
    outDir: 'dist',
  },
});
