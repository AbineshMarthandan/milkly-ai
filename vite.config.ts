import { copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

/**
 * Static hosts without rewrite rules (GitHub Pages) answer unknown paths such
 * as /billing/new with 404.html. Shipping the app shell as 404.html lets deep
 * links and page refreshes load the app, which then routes client-side.
 */
function spaFallback(): Plugin {
  let outDir = 'dist';
  return {
    name: 'spa-fallback-404',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    closeBundle() {
      copyFileSync(join(outDir, 'index.html'), join(outDir, '404.html'));
    },
  };
}

export default defineConfig({
  // Sub-path the app is served from, e.g. "/milkly-ai/" on GitHub Pages.
  base: process.env.BASE_PATH || '/',
  plugins: [react(), tailwindcss(), spaFallback()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5180,
  },
  build: {
    sourcemap: true,
    // Routes are lazy-loaded and jsPDF is imported on demand (Download PDF),
    // so automatic chunking keeps the first load small.
    chunkSizeWarningLimit: 600,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
