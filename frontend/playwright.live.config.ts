import { defineConfig, devices } from '@playwright/test';
import { readFileSync } from 'node:fs';

// This destructive opt-in suite only accepts the explicitly provisioned QA cohort.
const path = process.env.PORTFOLIO_LIVE_ACCOUNTS_MANIFEST;
if (!path) throw new Error('Supply the private manifest for the authorized 20-account QA cohort.');
const manifest = JSON.parse(readFileSync(path, 'utf8')) as { frontend: string; run: string };
const phase = process.env.PORTFOLIO_LIVE_PHASE || 'browser';
if (!/^[a-z-]{1,32}$/.test(phase)) throw new Error('Invalid live test phase.');
if (!/^qa261019[a-f0-9]{4}$/.test(manifest.run)) throw new Error('Unrecognized disposable cohort.');

export default defineConfig({
  testDir: './tests/live',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  reporter: [
    ['list'],
    ['json', { outputFile: `../agent/full-verification-2026-10-19/live-${phase}-results.json` }],
  ],
  outputDir: `../agent/full-verification-2026-10-19/live-${phase}-artifacts`,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: manifest.frontend,
    viewport: { width: 1600, height: 1100 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 15_000,
  },
});
