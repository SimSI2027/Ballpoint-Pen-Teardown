import { defineConfig } from 'vite';

// Local dev serves at "/" (http://127.0.0.1:5173/). Production builds and previews target the GitHub Pages
// project subpath. Override with VITE_BASE if the repository is renamed.
const PAGES_BASE = '/Ballpoint-Pen-Teardown/';

export default defineConfig(({ mode }) => ({
  base: process.env.VITE_BASE || (mode === 'production' ? PAGES_BASE : '/'),
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
  build: { outDir: 'dist', chunkSizeWarningLimit: 900 },
}));
