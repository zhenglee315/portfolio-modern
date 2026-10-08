import { defineConfig } from 'vite';

/** Serve the standalone asset studio without the portfolio router or API loaders. */
export default defineConfig({
  resolve: { tsconfigPaths: true },
  optimizeDeps: { entries: ['cow-workspace-preview.html'] },
  build: { rollupOptions: { input: 'cow-workspace-preview.html' } },
  server: { host: '127.0.0.1', port: 5175, strictPort: true, fs: { allow: ['..'] } },
});
