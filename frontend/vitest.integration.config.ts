import { defineConfig } from 'vitest/config';
import base from './vitest.config.ts';

// These tests require an explicitly supplied, disposable backend and test account.
const required = [
  'PORTFOLIO_API_SMOKE_TARGET',
  'PORTFOLIO_SMOKE_EMAIL',
  'PORTFOLIO_SMOKE_PASSWORD',
];
if (required.some((name) => !process.env[name])) {
  throw new Error(`Integration tests require an isolated backend/account: ${required.join(', ')}`);
}

// Replace array policies explicitly: mergeConfig concatenates include/exclude arrays.
export default defineConfig({
  ...base,
  test: { ...base.test, include: ['tests/unit/*live-api.test.ts'], exclude: [] },
});
