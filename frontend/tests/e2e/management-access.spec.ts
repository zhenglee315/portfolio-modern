import { expect, test as base, type Page, type Route } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type { AuthUser } from '../../src/features/auth/schemas/auth';
import { waitForFixtureHydration } from '../fixtures/browser';

type Locale = 'en' | 'zh-Hant' | 'zh-Hans';
type Copy = { accessDenied: Record<string, string>; ui: Record<string, string> };
const messages = Object.fromEntries(
  ['en', 'zh-Hant', 'zh-Hans'].map((locale) => [
    locale,
    JSON.parse(
      readFileSync(new URL(`../../src/i18n/messages/${locale}.json`, import.meta.url), 'utf8'),
    ),
  ]),
) as Record<Locale, Copy>;
const administrator: AuthUser = {
  id: 91,
  user: 'operator',
  email: 'operator@example.com',
  role: 'custom-administrator',
  is_create: true,
  is_read: true,
  is_update: true,
  is_delete: true,
  is_manage_sites: true,
  is_manage_users: true,
  is_manage_roles: true,
};
const resources = ['sites', 'users', 'roles'] as const;

const test = base.extend<{ managementRuntime: void }>({
  managementRuntime: [
    async ({ page }, use) => {
      const errors: string[] = [];
      const writes: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('request', (request) => {
        if (!['GET', 'HEAD'].includes(request.method())) writes.push(request.url());
      });
      await use();
      expect(errors).toEqual([]);
      expect(writes).toEqual([]);
    },
    { auto: true },
  ],
});

/** Observe actual list reads; checking hidden DOM alone would miss eager private requests. */
function managementReads(page: Page) {
  const reads: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/api/management/')) reads.push(url.pathname);
  });
  return reads;
}

function latch() {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { pending, release };
}

async function expectDenied(page: Page, locale: Locale = 'en') {
  await expect(page).toHaveURL(new RegExp(`/${locale}/access-denied$`));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    messages[locale].accessDenied.title!,
  );
  await expect(page.locator('[data-access-denied-cow]')).toHaveCount(1);
  await expect(
    page.locator('[data-management-resource], [data-management-resource] table'),
  ).toHaveCount(0);
  const warning = page.locator('[data-notification-kind="warning"]');
  await expect(warning).toContainText(messages[locale].accessDenied.description!);
}

async function enterViaGear(page: Page, label: string) {
  await waitForFixtureHydration(page);
  await page.getByRole('button', { name: 'Account settings', exact: true }).click();
  await page.getByRole('menuitem', { name: label, exact: true }).click();
}

for (const resource of resources) {
  test(`${resource} renders no protected markup or list requests while its fresh SESSION is pending`, async ({
    page,
  }) => {
    const read = latch();
    const reads = managementReads(page);
    let sessionRequests = 0;
    await page.route('**/api/authority/session', async (route) => {
      sessionRequests++;
      await read.pending;
      await route.fulfill({ json: administrator });
    });
    await page.goto(`/en/management/${resource}`);
    try {
      await expect.poll(() => sessionRequests).toBe(1);
      await expect(page.locator('[data-management-check]')).toBeVisible();
      await expect(page.locator('[data-management-resource], table')).toHaveCount(0);
      expect(reads).toEqual([]);
    } finally {
      read.release();
    }
    await expect(page.locator(`[data-management-resource="${resource}"] tbody > tr`)).toHaveCount(
      6,
    );
    expect(sessionRequests).toBe(1);
    expect(reads).toEqual([`/api/management/${resource}`]);
  });
}

test('management SSR contains only the neutral gate and excludes private rows', async ({
  request,
}) => {
  for (const resource of resources) {
    const response = await request.get(`/en/management/${resource}`);
    expect(response.status()).toBe(200);
    expect(response.headers()['cache-control']).toContain('no-store');
    const markup = await response.text();
    expect(markup).toContain('data-management-check');
    expect(markup).not.toContain('data-management-resource');
    expect(markup).not.toContain('operator@example.com');
    expect(markup).not.toContain('<table');
  }
});

for (const locale of ['en', 'zh-Hant', 'zh-Hans'] as const) {
  for (const resource of resources) {
    test(`${locale} direct ${resource} without its policy flag warns and replaces the URL without reading records`, async ({
      page,
    }) => {
      const reads = managementReads(page);
      const account = {
        ...administrator,
        ...(resource === 'roles' ? { is_manage_roles: false } : { is_manage_sites: false }),
      };
      await page.route('**/api/authority/session', (route) => route.fulfill({ json: account }));
      await page.goto(`/${locale}/management/${resource}`);
      await expectDenied(page, locale);
      expect(reads).toEqual([]);
    });
  }
}

for (const expired of ['guest', '401', '403'] as const) {
  test(`${expired} SESSION stays closed and reaches the 403 cow without list reads`, async ({
    page,
  }) => {
    const reads = managementReads(page);
    await page.route('**/api/authority/session', (route) =>
      expired === 'guest'
        ? route.fulfill({ json: null })
        : route.fulfill({ status: Number(expired), json: { detail: 'PRIVATE_SESSION_DETAIL' } }),
    );
    await page.goto('/en/management/roles');
    await expectDenied(page);
    expect(await page.locator('body').innerText()).not.toContain('PRIVATE_SESSION_DETAIL');
    expect(reads).toEqual([]);
  });
}

for (const resource of resources) {
  test(`${resource} respects the established flag policy and arbitrary role names`, async ({
    page,
  }) => {
    const reads = managementReads(page);
    const account = {
      ...administrator,
      role: 'reviewer-with-no-role-name-authority',
      is_manage_users: false,
      is_manage_sites: resource !== 'roles',
      is_manage_roles: resource === 'roles',
    };
    await page.route('**/api/authority/session', (route) => route.fulfill({ json: account }));
    await page.goto(`/en/management/${resource}`);
    const shell = page.locator(`[data-management-resource="${resource}"]`);
    await expect(shell.locator('tbody > tr')).toHaveCount(6);
    const sidebar = shell.locator('aside').getByRole('navigation');
    await expect(sidebar.getByRole('link')).toHaveCount(resource === 'roles' ? 1 : 2);
    await expect(sidebar.getByRole('link', { name: 'Role management', exact: true })).toHaveCount(
      resource === 'roles' ? 1 : 0,
    );
    await expect(sidebar.getByRole('link', { name: 'User management', exact: true })).toHaveCount(
      resource === 'roles' ? 0 : 1,
    );
    expect(reads).toEqual([`/api/management/${resource}`]);
  });
}

for (const failure of ['network', 'server', 'invalid', 'parse'] as const) {
  test(`${failure} SESSION fails closed with a local retry rather than claiming denied permission`, async ({
    page,
  }) => {
    const reads = managementReads(page);
    let healthy = false;
    let sessionRequests = 0;
    await page.route('**/api/authority/session', (route) => {
      sessionRequests++;
      if (healthy) return route.fulfill({ json: administrator });
      if (failure === 'network') return route.abort('failed');
      if (failure === 'server')
        return route.fulfill({ status: 500, json: { detail: 'PRIVATE_SESSION_DETAIL' } });
      if (failure === 'parse')
        return route.fulfill({ contentType: 'application/json', body: 'PRIVATE_PARSE_DETAIL' });
      return route.fulfill({ json: { id: 91, is_manage_sites: true } });
    });
    await page.goto('/en/management/users');
    const gate = page.locator('[data-management-check]');
    await expect(gate.getByRole('alert')).toContainText(messages.en.ui.unavailable!);
    await expect(page).toHaveURL(/\/en\/management\/users$/);
    await expect(
      page.locator(
        '[data-management-resource], [data-access-denied-cow], [data-notification-kind="warning"]',
      ),
    ).toHaveCount(0);
    expect(reads).toEqual([]);
    expect(sessionRequests).toBe(1);
    expect(await page.locator('body').innerText()).not.toMatch(/PRIVATE_(?:SESSION|PARSE)_DETAIL/);
    healthy = true;
    await gate.getByRole('button', { name: messages.en.ui.retry!, exact: true }).click();
    await expect(page.locator('[data-management-resource="users"] tbody > tr')).toHaveCount(6);
    expect(sessionRequests).toBe(2);
    expect(reads).toEqual(['/api/management/users']);
  });
}

test('a cached administrator menu cannot authorize entry after the server revokes sites permission', async ({
  page,
}) => {
  const reads = managementReads(page);
  const check = latch();
  let sessionRequests = 0;
  await page.route('**/api/authority/session', async (route) => {
    sessionRequests++;
    if (sessionRequests === 1) return route.fulfill({ json: administrator });
    await check.pending;
    await route.fulfill({ json: { ...administrator, is_manage_sites: false } });
  });
  await page.goto('/en');
  await enterViaGear(page, 'User management');
  try {
    await expect.poll(() => sessionRequests).toBe(2);
    await expect(page.locator('[data-management-resource]')).toHaveCount(0);
    expect(reads).toEqual([]);
  } finally {
    check.release();
  }
  await expectDenied(page);
  expect(reads).toEqual([]);
  // Replacing the blocked entry means Back returns to the public portfolio, not the denied route.
  await page.goBack();
  await expect(page).toHaveURL(/\/en(?:#overview)?$/);
  await waitForFixtureHydration(page);
  await page.getByRole('button', { name: 'Account settings', exact: true }).click();
  await expect(
    page.getByRole('menuitem', { name: 'Platform management', exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole('menuitem', { name: 'User management', exact: true })).toHaveCount(0);
});

test('switching resources waits for a new SESSION decision before issuing the destination list read', async ({
  page,
}) => {
  const reads = managementReads(page);
  const check = latch();
  let sessionRequests = 0;
  await page.route('**/api/authority/session', async (route) => {
    sessionRequests++;
    if (sessionRequests === 1) return route.fulfill({ json: administrator });
    await check.pending;
    await route.fulfill({ json: { ...administrator, is_manage_roles: false } });
  });
  await page.goto('/en/management/sites');
  await expect(page.locator('[data-management-resource="sites"] tbody > tr')).toHaveCount(6);
  await page.locator('aside').getByRole('link', { name: 'Role management', exact: true }).click();
  try {
    await expect.poll(() => sessionRequests).toBe(2);
    await expect(page.locator('[data-management-resource="roles"]')).toHaveCount(0);
    expect(reads).toEqual(['/api/management/sites']);
  } finally {
    check.release();
  }
  await expectDenied(page);
  expect(reads).toEqual(['/api/management/sites']);
});

test('canceled entry ignores its late allow response and never mounts or reads the abandoned resource', async ({
  page,
}) => {
  const reads = managementReads(page);
  const check = latch();
  let sessionRequests = 0;
  let completed = false;
  await page.route('**/api/authority/session', async (route: Route) => {
    sessionRequests++;
    if (sessionRequests === 1) return route.fulfill({ json: administrator });
    await check.pending;
    await route.fulfill({ json: administrator }).catch(() => {});
    completed = true;
  });
  await page.goto('/en');
  await enterViaGear(page, 'Role management');
  await expect.poll(() => sessionRequests).toBe(2);
  await page.evaluate(() => {
    history.pushState(null, '', '/en/sam');
    dispatchEvent(new PopStateEvent('popstate'));
  });
  check.release();
  await expect(page).toHaveURL(/\/en\/sam(?:#overview)?$/);
  await expect(page.locator('[data-portfolio-user="sam"]')).toBeVisible();
  await expect.poll(() => completed).toBe(true);
  await expect(
    page.locator(
      '[data-management-resource], [data-access-denied-cow], [data-notification-kind="warning"]',
    ),
  ).toHaveCount(0);
  expect(reads).toEqual([]);
});

test('locale navigation and a return from public history both recheck the server session', async ({
  page,
}) => {
  const reads = managementReads(page);
  let sessionRequests = 0;
  let identity: AuthUser | null = administrator;
  await page.route('**/api/authority/session', (route) => {
    sessionRequests++;
    return route.fulfill({ json: identity });
  });
  await page.goto('/en/management/sites');
  await expect(page.locator('[data-management-resource="sites"] tbody > tr')).toHaveCount(6);
  expect(sessionRequests).toBe(1);
  await page.getByRole('button', { name: 'Change language', exact: true }).click();
  await page.getByRole('button', { name: '繁體中文', exact: true }).click();
  await expect(page).toHaveURL(/\/zh-Hant\/management\/sites$/);
  await expect(page.locator('[data-management-resource="sites"] tbody > tr')).toHaveCount(6);
  expect(sessionRequests).toBe(2);
  expect(reads).toEqual(['/api/management/sites', '/api/management/sites']);
  await page.locator('aside').getByRole('link').last().click();
  await expect(page).toHaveURL(/\/zh-Hant(?:#overview)?$/);
  await waitForFixtureHydration(page);
  identity = null;
  await page.goBack();
  await expectDenied(page, 'zh-Hant');
  expect(sessionRequests).toBe(3);
  expect(reads).toEqual(['/api/management/sites', '/api/management/sites']);
});
