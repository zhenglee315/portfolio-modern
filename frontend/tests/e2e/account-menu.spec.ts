import { expect, type Page } from '@playwright/test';
import type { AuthUser } from '../../src/features/auth/schemas/auth';
import { runtimeTest as test, waitForFixtureHydration } from '../fixtures/browser';

const guestRows = ['Theme', 'Language', 'Sign in'];
const memberRows = ['Profile', 'Theme', 'Language', 'Sign out'];
const administratorRows = [
  'Profile',
  'Platform management',
  'Platform monitoring',
  'Role management',
  'User management',
  'Theme',
  'Language',
  'Sign out',
];

/** Restore a synthetic browser account without submitting credentials or recording a login.
 * @param page Managed browser using the public synthetic API.
 * @param permissions Server-issued role flags to exercise independently of the public owner.
 * @returns The complete account accepted by the same schema as a real session response.
 */
async function restoreAccount(page: Page, permissions: Partial<AuthUser> = {}) {
  const account: AuthUser = {
    id: 91,
    user: 'operator',
    email: 'operator@example.com',
    role: 'editor',
    is_create: true,
    is_read: true,
    is_update: true,
    is_delete: false,
    is_manage_roles: false,
    is_manage_users: false,
    is_manage_sites: false,
    ...permissions,
  };
  await page.route('**/api/authority/session', (route) => route.fulfill({ json: account }));
  return account;
}

/** Open the Gear after hydration and assert its semantic, right-aligned menu.
 * @param page Portfolio page with no account form or project dialog open.
 * @returns The real disclosure trigger and its currently visible menu.
 */
async function openAccountMenu(page: Page) {
  await waitForFixtureHydration(page);
  const trigger = page.getByRole('button', { name: 'Account settings', exact: true });
  await trigger.click();
  const menu = page.getByRole('menu', { name: 'Account settings', exact: true });
  await expect(menu).toBeVisible();
  await expect(trigger.locator('svg.bi-gear-fill')).toBeVisible();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  return { trigger, menu };
}

test('guests receive exactly the three ordered gear rows and the shared login heartbeat', async ({
  page,
}) => {
  const writes: string[] = [];
  page.on('request', (request) => {
    if (!['GET', 'HEAD'].includes(request.method())) writes.push(request.url());
  });
  await page.goto('/en#overview');
  const originalUrl = page.url();
  const { trigger, menu } = await openAccountMenu(page);
  await expect(menu.getByRole('menuitem')).toHaveText(guestRows);
  await expect(menu.getByRole('menuitem').first()).toBeFocused();
  const login = menu.getByRole('menuitem', { name: 'Sign in', exact: true });
  const heartbeat = login.locator('[data-icon-pulse="chat"] > svg');
  await expect(heartbeat).toBeVisible();
  expect(await heartbeat.evaluate((node) => getComputedStyle(node).animationName)).toContain(
    'icon-breathe',
  );
  const toolbar = page.locator('[data-profile-controls]');
  await expect(toolbar.getByRole('button', { name: 'Background settings' })).toHaveCount(0);
  await expect(toolbar.getByRole('button', { name: 'Change language' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(menu).not.toBeVisible();
  await expect(trigger).toBeFocused();
  for (const name of guestRows.filter((name) => name !== 'Sign in')) {
    await trigger.click();
    await menu.getByRole('menuitem', { name, exact: true }).click();
    await expect(menu).not.toBeVisible();
    await expect(trigger).toBeFocused();
    await expect(page).toHaveURL(originalUrl);
    await expect(page.locator('[data-auth-panel]')).toHaveCount(0);
    await expect(page.locator('aside [data-auth-action="sign-in"]')).toHaveCount(0);
  }
  expect(writes).toEqual([]);
});

for (const permissions of [
  { name: 'ordinary member', flags: {}, rows: memberRows },
  {
    name: 'user flag alone',
    flags: { is_manage_users: true },
    rows: memberRows,
  },
  {
    name: 'site manager without user flag',
    flags: { is_manage_sites: true, is_manage_users: false },
    rows: [
      'Profile',
      'Platform management',
      'Platform monitoring',
      'User management',
      'Theme',
      'Language',
      'Sign out',
    ],
  },
  {
    name: 'role manager without site access',
    flags: { is_manage_roles: true },
    rows: ['Profile', 'Role management', 'Theme', 'Language', 'Sign out'],
  },
  {
    name: 'administrator',
    flags: { is_manage_roles: true, is_manage_users: true, is_manage_sites: true },
    rows: administratorRows,
  },
]) {
  test(`${permissions.name} menu follows SESSION permissions rather than the viewed Site 2`, async ({
    page,
  }) => {
    await restoreAccount(page, permissions.flags);
    await page.goto('/en?site_id=2#overview');
    await expect(page.locator('[data-portfolio-user="sam"]')).toBeVisible();
    await expect(page.locator('aside [data-auth-action="sign-out"]')).toHaveCount(0);
    const { menu } = await openAccountMenu(page);
    await expect(menu.locator('strong')).toHaveText('operator');
    await expect(menu.getByRole('menuitem')).toHaveText(permissions.rows);
    await expect(menu.getByRole('menuitem', { name: 'Sign in', exact: true })).toHaveCount(0);
  });
}

test('keyboard navigation, outside dismissal and scaffold selection preserve identity and URL', async ({
  page,
}) => {
  await restoreAccount(page, { is_manage_roles: true, is_manage_sites: true });
  const writes: string[] = [];
  page.on('request', (request) => {
    if (!['GET', 'HEAD'].includes(request.method())) writes.push(request.url());
  });
  await page.goto('/en?site_id=2#overview');
  await expect(page.locator('aside [data-auth-action="sign-out"]')).toHaveCount(0);
  const originalUrl = page.url();
  let { trigger, menu } = await openAccountMenu(page);
  const rows = menu.getByRole('menuitem');
  await expect(rows.first()).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(rows.nth(1)).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(rows.first()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.locator('h1[data-profile-content]').click();
  await expect(menu).not.toBeVisible();
  await trigger.click();
  await rows.last().focus();
  await page.keyboard.press('Tab');
  await expect(menu).not.toBeVisible();

  for (const name of ['Profile', 'Platform monitoring', 'Theme', 'Language']) {
    ({ trigger, menu } = await openAccountMenu(page));
    await menu.getByRole('menuitem', { name, exact: true }).click();
    await expect(menu).not.toBeVisible();
    await expect(trigger).toBeFocused();
    await expect(page).toHaveURL(originalUrl);
    await expect(page.locator('aside [data-auth-action="sign-out"]')).toHaveCount(0);
    await expect(page.locator('[data-auth-panel]')).toHaveCount(0);
  }
  expect(writes).toEqual([]);
});

for (const viewport of [
  { width: 320, height: 844 },
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
  { width: 760, height: 390 },
]) {
  test(`administrator menu remains reachable at ${viewport.width}×${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await restoreAccount(page, { is_manage_roles: true, is_manage_sites: true });
    await page.goto('/en?site_id=2#overview');
    await expect(page.locator('aside [data-auth-action="sign-out"]')).toHaveCount(0);
    // The gear is the single responsive account entry; the rail and drawer have none.
    await expect(page.locator('[data-profile-controls]')).toBeVisible();
    const { trigger, menu } = await openAccountMenu(page);
    await expect(menu.getByRole('menuitem')).toHaveText(administratorRows);
    const bounds = (await menu.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      viewport.width,
    );
    if (viewport.height < 450) {
      await expect(menu).toHaveCSS('overflow-y', 'auto');
      expect(await menu.evaluate((node) => node.scrollHeight)).toBeGreaterThan(
        await menu.evaluate((node) => node.clientHeight),
      );
      await menu.getByRole('menuitem', { name: 'Sign out', exact: true }).scrollIntoViewIfNeeded();
      await expect(menu.getByRole('menuitem', { name: 'Sign out', exact: true })).toBeInViewport();
    }
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
  });
}

for (const width of [390, 1440]) {
  test(`gear sign-in preserves the portfolio URL and restores focus at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/en/sam?source=gear#overview');
    const originalUrl = page.url();
    const { trigger, menu } = await openAccountMenu(page);
    await expect(page.locator('aside [data-auth-action]')).toHaveCount(0);
    await menu.getByRole('menuitem', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(/source=gear&view=login#overview$/);
    await expect(page.locator('[data-auth-panel]')).toBeVisible();
    await page.getByRole('button', { name: 'Back to portfolio', exact: true }).click();
    await expect(page).toHaveURL(originalUrl);
    await expect(page.locator('[data-auth-panel]')).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  test(`gear sign-out uses the session API and updates its row at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const account = await restoreAccount(page);
    let authenticated = true;
    await page.route('**/api/authority/session', (route) =>
      route.fulfill({ json: authenticated ? account : null }),
    );
    let signOutRequests = 0;
    await page.route('**/api/authority/sign-out', async (route) => {
      expect(route.request().method()).toBe('POST');
      expect(route.request().postData()).toBeNull();
      signOutRequests++;
      authenticated = false;
      await route.fulfill({ json: { signed_out: true } });
    });
    await page.goto('/en?site_id=2#overview');
    const originalUrl = page.url();
    const { trigger, menu } = await openAccountMenu(page);
    await expect(menu.getByRole('menuitem', { name: 'Sign out', exact: true })).toBeVisible();
    await menu.getByRole('menuitem', { name: 'Sign out', exact: true }).click();
    await expect(menu).not.toBeVisible();
    await expect(trigger).toBeFocused();
    await trigger.click();
    await expect(menu.getByRole('menuitem')).toHaveText(guestRows);
    expect(signOutRequests).toBe(1);
    await expect(page).toHaveURL(originalUrl);
    await expect(page.locator('aside [data-auth-action]')).toHaveCount(0);
    await page.reload();
    const refreshed = await openAccountMenu(page);
    await expect(refreshed.menu.getByRole('menuitem')).toHaveText(guestRows);
  });
}
