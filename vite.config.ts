import { copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

/**
 * Installable PWA. The service worker precaches only the app shell (HTML, JS,
 * CSS, icons) so the app opens instantly and offline. Google sign-in and
 * Sheets API calls are cross-origin and always go to the network — business
 * data is never served from a stale cache. `app-config.json` is left out so a
 * changed connection is picked up immediately.
 */
const pwa = VitePWA({
  registerType: 'prompt',
  injectRegister: false,
  includeAssets: ['favicon.svg', 'apple-touch-icon-180x180.png'],
  manifest: {
    name: 'Milkly AI — Billing & Distribution',
    short_name: 'Milkly',
    description: 'Multi-vendor billing and product management for route-based distribution.',
    theme_color: '#0f6961',
    background_color: '#f8fafc',
    display: 'standalone',
    orientation: 'any',
    start_url: '.',
    scope: '.',
    categories: ['business', 'finance', 'productivity'],
    icons: [
      { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
      { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
      { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Create bill', short_name: 'New bill', url: 'billing/new', icons: [{ src: 'pwa-192x192.png', sizes: '192x192' }] },
      { name: 'Past bills', url: 'billing/history', icons: [{ src: 'pwa-192x192.png', sizes: '192x192' }] },
    ],
  },
  workbox: {
    globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
    globIgnores: ['**/app-config*.json', '404.html'],
    navigateFallback: 'index.html',
    navigateFallbackDenylist: [/app-config\.json$/],
    cleanupOutdatedCaches: true,
    // jsPDF (report downloads) is lazy-loaded but still precached for offline use.
    maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
  },
});

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
  plugins: [react(), tailwindcss(), pwa, spaFallback()],
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
