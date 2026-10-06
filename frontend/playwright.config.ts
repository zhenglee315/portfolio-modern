import { defineConfig, devices } from '@playwright/test';

/** Configure browser checks against one synthetic API in either runtime.
 * @param runtime Development exercises Vite's module runner; preview verifies static delivery.
 * @returns A managed Chromium configuration that never starts or stops a personal backend.
 */
export function createBrowserConfig(runtime: 'development' | 'preview') {
  const development = runtime === 'development';
  const origin = `http://127.0.0.1:${development ? 5174 : 4173}`;

  return defineConfig({
    testDir: development ? './tests/dev' : './tests/e2e',
    fullyParallel: true,
    forbidOnly: Boolean(process.env.CI),
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 2 : undefined,
    reporter: 'list',
    use: { baseURL: origin, trace: 'retain-on-failure' },
    projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
    webServer: [
      {
        command: 'node tests/fixtures/api-server.mjs',
        url: 'http://127.0.0.1:4181/health',
        reuseExistingServer: false,
      },
      {
        // Force fresh dependency optimization so a warm cache cannot hide dev interop failures.
        command: development
          ? 'npm run dev -- --port 5174 --force'
          : 'npm run build && npm run preview',
        url: origin,
        reuseExistingServer: false,
        timeout: 120_000,
        env: {
          API_BUILD_TARGET: process.env.PORTFOLIO_API_SMOKE_TARGET ?? 'http://127.0.0.1:4181',
          API_PROXY_TARGET: process.env.PORTFOLIO_API_SMOKE_TARGET ?? 'http://127.0.0.1:4181',
          VITE_PUBLIC_SITE_URL: 'https://example.com',
        },
      },
    ],
  });
}

export default createBrowserConfig('preview');
