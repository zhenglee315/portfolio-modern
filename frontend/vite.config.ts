import { reactRouter } from '@react-router/dev/vite';
import { defineConfig, loadEnv } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig(({ mode }) => {
  const directory = fileURLToPath(new URL('.', import.meta.url));
  const environment = loadEnv(mode, directory, '');

  return {
    plugins: [reactRouter()],
    resolve: { tsconfigPaths: true },
    // Bundle component subpaths so Node can render React-Bootstrap during static builds.
    ssr: { noExternal: ['react-bootstrap'] },
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
      fs: { allow: [directory] },
      proxy: {
        '^/api(?:/|$)': {
          target: environment.API_PROXY_TARGET || 'http://127.0.0.1:8000',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api(?=\/|$)/, '') || '/',
        },
      },
    },
  };
});
