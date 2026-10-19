import { defineConfig } from '@playwright/test';
import base from './playwright.config';

/** Reuse the isolated app/API servers for reproducible documentation captures. */
export default defineConfig({
  ...base,
  projects: [{ name: 'docs', testMatch: '**/*-docs.capture.ts' }],
  workers: 1,
  reporter: [['list']],
});
