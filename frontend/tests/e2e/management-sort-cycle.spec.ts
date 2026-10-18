import { expect, test, type Locator, type Page } from '@playwright/test';
import type { ManagementResource } from '../fixtures/management';

type ManagementReads = { urls: URL[]; ids: Map<string, string[]> };

/** Compare rendered rows with actual selected API pages rather than sorting browser subsets. */
async function openManagement(page: Page, resource: ManagementResource) {
  const requests: ManagementReads = { urls: [], ids: new Map() };
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname === `/api/management/${resource}`) requests.urls.push(url);
  });
  page.on('response', async (response) => {
    const url = new URL(response.url());
    if (url.pathname !== `/api/management/${resource}` || !response.ok()) return;
    const result = (await response.json()) as { items: { id: number }[] };
    requests.ids.set(
      url.href,
      result.items.map((row) => String(row.id)),
    );
  });
  await page.route('**/api/authority/session', (route) =>
    route.fulfill({
      json: {
        id: 91,
        user: 'operator',
        email: 'operator@example.com',
        role: 'administrator',
        is_create: true,
        is_read: true,
        is_update: true,
        is_delete: true,
        is_monitor: true,
        is_manage_sites: true,
        is_manage_users: true,
        is_manage_roles: true,
      },
    }),
  );
  await page.goto(`/en/management/${resource}`);
  const management = page.locator(`[data-management-resource="${resource}"]`);
  await expect(management.locator('tbody > tr')).toHaveCount(6);
  await expect(management.getByRole('button', { name: 'Clear sorting', exact: true })).toHaveCount(
    0,
  );
  const direct = management.getByRole('button', { name: 'Sort ID ascending', exact: true });
  if (await direct.isVisible()) {
    await expect(direct).toHaveAttribute('aria-pressed', 'false');
    await expect(
      management.getByRole('button', { name: 'Sort ID descending', exact: true }),
    ).toHaveAttribute('aria-pressed', 'false');
  } else {
    await expect(
      management.getByRole('button', { name: 'Sort and filter ID', exact: true }),
    ).toBeVisible();
    await expect(management.locator('th[aria-sort]').first()).toHaveAttribute('aria-sort', 'none');
  }
  await expect(
    management.getByRole('checkbox', { name: 'Multi-column sorting', exact: true }),
  ).toHaveCount(0);
  return { management, requests, errors };
}

async function expectSort(
  page: Page,
  management: Locator,
  requests: ManagementReads,
  sort: string,
) {
  await expect.poll(() => new URL(page.url()).searchParams.get('sort')).toBe(sort);
  await expect.poll(() => requests.urls.at(-1)?.searchParams.get('sort')).toBe(sort || null);
  await expect(management.getByRole('table')).toHaveAttribute('aria-busy', 'false');
  const url = requests.urls.at(-1)!;
  await expect.poll(() => requests.ids.has(url.href)).toBe(true);
  await expect
    .poll(() =>
      management
        .locator('tbody > tr')
        .evaluateAll((rows) => rows.map((row) => row.getAttribute('data-row-key'))),
    )
    .toEqual(requests.ids.get(url.href)!);
  if (!sort) {
    await expect(
      management.getByRole('button', { name: 'Clear sorting', exact: true }),
    ).toHaveCount(0);
    await expect(management.locator('thead button[aria-pressed="true"]')).toHaveCount(0);
    await expect(
      management.locator(
        'thead th[aria-sort="ascending"], thead th[aria-sort="descending"], thead th[aria-sort="other"]',
      ),
    ).toHaveCount(0);
  }
}

for (const resource of ['sites', 'users', 'roles'] as const) {
  test(`${resource} direction arrows repeat and cancel only their own column`, async ({ page }) => {
    const { management, requests, errors } = await openManagement(page, resource);
    for (const [direction, sort] of [
      ['ascending', 'id:asc'],
      ['ascending', ''],
      ['descending', 'id:desc'],
      ['descending', ''],
      ['ascending', 'id:asc'],
      ['descending', 'id:desc'],
      ['descending', ''],
    ]) {
      await management.getByRole('button', { name: `Sort ID ${direction}`, exact: true }).click();
      await expectSort(page, management, requests, sort!);
    }
    const field = resource === 'roles' ? 'role' : resource === 'users' ? 'email' : 'owner_email';
    const label = resource === 'roles' ? 'Role' : 'Email';
    const text = management.getByRole('button', { name: `Sort ${label} descending`, exact: true });
    await text.click();
    await expectSort(page, management, requests, `${field}:desc`);
    await management.getByRole('button', { name: 'Sort ID ascending', exact: true }).click();
    await expectSort(page, management, requests, `${field}:desc,id:asc`);
    await expect(text).toHaveAttribute('aria-pressed', 'true');
    await text.click();
    await expectSort(page, management, requests, 'id:asc');
    await expect(text).toHaveAttribute('aria-pressed', 'false');
    await management.getByRole('button', { name: 'Sort ID ascending', exact: true }).click();
    await expectSort(page, management, requests, '');
    expect(errors).toEqual([]);
  });
}

test('keyboard arrows retain focus, click priority and empty sort through navigation', async ({
  page,
}) => {
  const { management, requests, errors } = await openManagement(page, 'users');
  const account = management.getByRole('button', { name: 'Sort Email ascending', exact: true });
  const down = management.getByRole('button', { name: 'Sort ID descending', exact: true });
  const up = management.getByRole('button', { name: 'Sort ID ascending', exact: true });
  await account.focus();
  await page.keyboard.press('Enter');
  await expectSort(page, management, requests, 'email:asc');
  await expect(account).toBeFocused();
  await down.focus();
  await page.keyboard.press('Enter');
  await expectSort(page, management, requests, 'email:asc,id:desc');
  await expect(down).toBeFocused();
  await up.focus();
  await page.keyboard.press('Enter');
  await expectSort(page, management, requests, 'email:asc,id:asc');
  await page.keyboard.press('Enter');
  await expectSort(page, management, requests, 'email:asc');
  await expect(up).toBeFocused();
  await account.focus();
  await page.keyboard.press('Enter');
  await expectSort(page, management, requests, '');
  await page.goBack();
  await expectSort(page, management, requests, 'email:asc');
  await page.goForward();
  await expectSort(page, management, requests, '');
  await management.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get('page')).toBe('2');
  await expectSort(page, management, requests, '');
  await management.getByRole('button', { name: 'Sort and filter Email', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Email: Value', exact: true }).fill('sam');
  await expect(management.locator('tbody > tr')).toHaveCount(1);
  await expectSort(page, management, requests, '');
  await page.reload();
  await expectSort(page, management, requests, '');
  expect(errors).toEqual([]);
});

test.describe('mobile arrows', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });
  test('each touch direction has a full target and sorting requires no mode selector', async ({
    page,
  }) => {
    const { management, requests, errors } = await openManagement(page, 'roles');
    const trigger = management.getByRole('button', { name: 'Sort and filter ID', exact: true });
    const box = (await trigger.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    for (const [label, sort] of [
      ['Sort ID descending', 'id:desc'],
      ['Remove sorting for ID', ''],
      ['Sort ID ascending', 'id:asc'],
      ['Remove sorting for ID', ''],
    ]) {
      await trigger.tap();
      const menu = page.locator('.dropdown-menu.show');
      const action = menu.getByRole('button', { name: label, exact: true });
      expect((await action.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await action.tap();
      await expectSort(page, management, requests, sort);
    }
    expect(errors).toEqual([]);
  });
});
