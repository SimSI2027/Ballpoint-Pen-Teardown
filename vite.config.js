import { defineConfig } from 'vite';

// Local-only dev/build. No remote assets are loaded at runtime.
export default defineConfig({
  base: './',
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
  build: { outDir: 'dist', chunkSizeWarningLimit: 900 },
});
