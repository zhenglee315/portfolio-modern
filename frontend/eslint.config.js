import { fileURLToPath } from 'node:url';
import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import { importX, createNodeResolver } from 'eslint-plugin-import-x';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const directory = fileURLToPath(new URL('.', import.meta.url));
const features = [
  'site',
  'journey',
  'experiences',
  'projects',
  'skills',
  'appearance',
  'language',
  'online-visitors',
];
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
  { target: './src', from: './tests', message: 'Production modules cannot import test helpers.' },
  ...features.flatMap((feature) => [
    {
      target: `./src/features/${feature}`,
      from: './src/features',
      except: [`./${feature}`],
      message: 'Compose different features in pages instead of importing between features.',
    },
    {
      target: upperLayers,
      from: `./src/features/${feature}`,
      except: ['./index.ts'],
      message: 'Import the feature public index instead of its internal implementation.',
    },
  ]),
];

export default defineConfig(
  {
    ignores: [
      'node_modules/**',
      '.react-router/**',
      'build/**',
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
    files: ['src/**/*.{ts,tsx}', 'tests/**/*.{ts,tsx}'],
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
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.flat.recommended.rules,
  },
  prettier,
);
