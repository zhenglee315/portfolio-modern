import { reactRouter } from '@react-router/dev/vite';
import { defineConfig, loadEnv } from 'vite';
import { fileURLToPath } from 'node:url';

// Keep browser and SSR optimizers aligned when adding interactive Bootstrap components.
const bootstrapComponents = [
  'react-bootstrap/Dropdown',
  'react-bootstrap/Offcanvas',
  'react-bootstrap/Modal',
];

export default defineConfig(({ mode, command }) => {
  const directory = fileURLToPath(new URL('.', import.meta.url));
  const environment = loadEnv(mode, directory, '');
  // Only server loaders read this value; .server modules are excluded from browser bundles.
  process.env.API_BUILD_TARGET = environment.API_BUILD_TARGET || process.env.API_BUILD_TARGET;
  process.env.PORTFOLIO_PRERENDER = command === 'build' ? '1' : '0';

  return {
    plugins: [reactRouter()],
    resolve: { tsconfigPaths: true },
    // Scan route entries before the first browser request, including lazy components.
    // Late dependency discovery can rebuild the graph and split React instances.
    optimizeDeps: {
      entries: ['src/root.tsx', 'src/routes/**/*.tsx'],
      include: bootstrapComponents,
    },
    // Transform extensionless component imports in both development and static rendering.
    ssr: {
      // @restart/ui selects CommonJS under Node export conditions. Pre-bundle the
      // component dependency trees into ESM; keep React native so those
      // components and React Router's external renderer share one Hook dispatcher.
      optimizeDeps: { include: bootstrapComponents, exclude: ['react', 'react-dom'] },
      noExternal: [
        'react-bootstrap',
        '@restart/hooks',
        '@restart/ui',
        'react-transition-group',
        'dom-helpers',
      ],
    },
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
      fs: { allow: [directory] },
      proxy: {
        '^/api(?:/|$)': {
          target: environment.API_PROXY_TARGET || 'http://127.0.0.1:8080',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api(?=\/|$)/, '') || '/',
        },
      },
    },
  };
});
