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

/** Exercise a second owner's handle or ID URL with an empty owner-scoped browser cache.
 * Public SSR is covered separately; history navigation uses the browser route loader here.
 */
export async function openClientShell(page: Page, path = '/en/sam#projects') {
  await page.goto('/en');
  await waitForFixtureHydration(page);
  await page.evaluate((target) => {
    history.pushState(null, '', target);
    dispatchEvent(new PopStateEvent('popstate'));
  }, path);
  await expect(page).toHaveURL((url) => `${url.pathname}${url.search}${url.hash}` === path);
  await expect(
    page
      .locator('[data-portfolio-user="sam"]')
      .or(page.getByRole('heading', { name: 'Page not found' })),
  ).toBeVisible();
}

/** Open retained account-form controls without attaching actions to the account-menu scaffold.
 * @param page Managed page using the same public API fixture as the portfolio.
 * @param path Existing locale, owner, query and hash to preserve when opening the form.
 * @returns After the real account form and its original appearance/language controls are visible.
 */
export async function openAuthControls(page: Page, path = '/en') {
  const url = new URL(path, 'http://fixture.test');
  url.searchParams.set('view', 'login');
  await page.goto(`${url.pathname}${url.search}${url.hash}`);
  await expect(page.locator('[data-auth-phase]')).toHaveAttribute('data-auth-phase', 'auth');
  await expect(page.locator('[data-auth-panel]')).toBeVisible();
  await expect(page.locator('[data-auth-panel] .dropdown-toggle').first()).toBeVisible();
  await expect(page.locator('[data-auth-panel] .dropdown-toggle').first()).toBeEnabled();
}

/** Reuse the existing project-detail locale control while the header menu remains a UI scaffold.
 * @param page Hydrated portfolio page with at least one project carrying detail.
 * @param language Localized accessible name of the unchanged language disclosure trigger.
 * @returns A stable dialog, its language trigger and its locale-independent close button.
 */
export async function openProjectLanguage(page: Page, language = 'Change language') {
  const projects = page.locator('#projects');
  await projects.scrollIntoViewIfNeeded();
  await projects.locator('[data-project-id] button[aria-label]').first().click();
  const dialog = page.locator('[role="dialog"][aria-modal="true"]');
  await expect(dialog).toBeVisible();
  return {
    dialog,
    trigger: dialog.getByRole('button', { name: language, exact: true }),
    close: dialog.locator('.modal-header > button'),
  };
}

/** Give the explicit Gear disclosure priority over the optional startup contact offer.
 * @param page Hydrated English public page.
 * @returns The closed Gear trigger after its normal Escape focus restoration.
 */
export async function dismissStartupThroughAccountMenu(page: Page) {
  const trigger = page.getByRole('button', { name: 'Account settings', exact: true });
  await trigger.click();
  await expect(page.getByRole('menu', { name: 'Account settings', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  return trigger;
}

/** Change the real motion preference through retained account-form controls, then return.
 * @param page English guest portfolio with its gear trigger visible.
 * @param paused Requested global decoration preference; the existing account-form preference controls remain available.
 * @returns After the account form closes and the same public page resumes with the preference.
 */
export async function setPublicMotionPreference(page: Page, paused: boolean) {
  const desired = String(paused);
  if ((await page.locator('html').getAttribute('data-motion-paused')) === desired) return;
  await page.locator('[data-account-menu-trigger]').click();
  await page.getByRole('menuitem', { name: 'Sign in', exact: true }).click();
  await expect(page.locator('[data-auth-panel]')).toBeVisible();
  await expect(page.locator('[data-auth-phase]')).toHaveAttribute('data-auth-phase', 'auth');
  await page.getByRole('button', { name: 'Background settings', exact: true }).click();
  await page.getByRole('button', { name: paused ? 'Pause' : 'Play', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-motion-paused', desired);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Back to portfolio', exact: true }).click();
  await expect(page.locator('[data-auth-panel]')).toHaveCount(0);
  await expect(page.locator('main')).toBeVisible();
}
