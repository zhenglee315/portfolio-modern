import { fileURLToPath } from 'node:url';
import { readdirSync } from 'node:fs';
import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import { importX, createNodeResolver } from 'eslint-plugin-import-x';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import { featureEntryFiles } from './scripts/feature-entries.mjs';
import tseslint from 'typescript-eslint';

const directory = fileURLToPath(new URL('.', import.meta.url));
// New features participate automatically, rather than silently bypassing an outdated allowlist.
const features = readdirSync(new URL('./src/features/', import.meta.url), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);
const upperLayers = [
  './src/app',
  './src/routes',
  './src/pages',
  './src/root.tsx',
  './src/routes.ts',
];
const zones = [
  {
    target: './src/shared',
    from: [...upperLayers, './src/features', './src/i18n'],
    message: 'Shared modules must remain independent of application and feature modules.',
  },
  {
    target: './src/i18n',
    from: [...upperLayers, './src/features'],
    message: 'Locale utilities must remain independent of application and feature modules.',
  },
  {
    target: './src/features',
    from: upperLayers,
    message: 'Feature modules cannot import application, route, or page modules.',
  },
  ...features.flatMap((feature) => [
    {
      target: `./src/features/${feature}`,
      from: './src/features',
      except:
        feature === 'account-menu'
          ? ['./account-menu', './auth/session.ts', './auth/permissions.ts']
          : [`./${feature}`],
      message: 'Compose different features in pages instead of importing between features.',
    },
    {
      target: upperLayers,
      from: `./src/features/${feature}`,
      except: featureEntryFiles(feature).map((file) => `./${file}`),
      message: 'Import a feature public entry instead of its internal implementation.',
    },
  ]),
];

export default defineConfig(
  {
    ignores: [
      'node_modules/**',
      '.react-router/**',
      'build/**',
      '.test-build*/**',
      '.build-staging/**',
      '.build-previous/**',
      'coverage/**',
      'test-results/**',
      'playwright-report/**',
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['**/*.{js,mjs,ts,tsx}'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    plugins: { 'import-x': importX },
    settings: {
      'import-x/resolver-next': [
        createNodeResolver({
          tsconfig: { configFile: `${directory}tsconfig.json` },
          extensions: ['.ts', '.tsx', '.js', '.jsx', '.json', '.css', '.svg'],
        }),
      ],
    },
    rules: {
      'import-x/no-restricted-paths': ['error', { basePath: directory, zones }],
      'import-x/no-cycle': ['error', { ignoreExternal: true }],
      'import-x/no-self-import': 'error',
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.flat.recommended.rules,
  },
  prettier,
);
