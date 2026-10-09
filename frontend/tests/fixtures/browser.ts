import { expect, test as base, type Page } from '@playwright/test';

/** Wait for hydration through the client-only heartbeat supplied by the default fixture.
 * Use only when the test leaves heartbeat at its synthetic value of three; SSR shows a dash.
 */
export async function waitForFixtureHydration(page: Page) {
  await expect(page.locator('[data-online-count]')).toHaveText('3');
}

/** Share runtime failure detection across development and visual parity checks. */
export const runtimeTest = base.extend<{ checkRuntime: void }>({
  checkRuntime: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      await use();
      await expect(page.locator('vite-error-overlay')).toHaveCount(0);
      expect(errors).toEqual([]);
    },
    { auto: true },
  ],
});

/** Exercise the production SPA fallback with an empty browser query cache.
 * Static snapshots are tested separately; this helper covers first-read failure states.
 */
export async function openClientShell(page: Page) {
  const shell = await page.request.get('/__spa-fallback.html');
  const body = await shell.body();
  await page.route('**/en', (route) => route.fulfill({ contentType: 'text/html', body }));
  await page.goto('/en');
}
