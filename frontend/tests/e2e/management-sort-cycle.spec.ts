import { expect, test, type Locator, type Page } from '@playwright/test';
import type { ManagementResource } from '../fixtures/management';

type ManagementReads = { urls: URL[]; ids: Map<string, string[]> };

/** Keep a request record so sorting assertions cover server order, not only header decoration. */
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
        is_manage_roles: true,
        is_manage_users: true,
        is_manage_sites: true,
      },
    }),
  );
  await page.goto(`/en/management/${resource}?sort=id:desc`);
  const management = page.locator(`[data-management-resource="${resource}"]`);
  await expect(management.locator('tbody > tr')).toHaveCount(6);
  await expect(management.locator('thead th').first()).toContainText('ID');
  return { management, requests, errors };
}

/** Compare all rendered IDs with the selected API page, including unselected default ordering. */
async function expectServerOrder(management: Locator, requests: ManagementReads, sort: string) {
  await expect.poll(() => requests.urls.at(-1)?.searchParams.get('sort')).toBe(sort || 'id:desc');
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
}

async function expectSort(
  page: Page,
  management: Locator,
  requests: ManagementReads,
  sort: string,
) {
  await expect.poll(() => new URL(page.url()).searchParams.get('sort')).toBe(sort);
  await expectServerOrder(management, requests, sort);
  if (!sort) {
    await expect(
      management.getByRole('button', { name: 'Clear sorting', exact: true }),
    ).toHaveCount(0);
    await expect(management.locator('thead th[aria-sort="ascending"]')).toHaveCount(0);
    await expect(management.locator('thead th[aria-sort="descending"]')).toHaveCount(0);
    await expect(management.locator('thead th[aria-sort="other"]')).toHaveCount(0);
  }
}

for (const resource of ['sites', 'users', 'roles'] as const) {
  test(`${resource} repeats complete ID and text sort cycles after clearing default order`, async ({
    page,
  }) => {
    const { management, requests, errors } = await openManagement(page, resource);
    const id = management.locator('thead th').filter({
      has: page.getByRole('button', {
        name: /^(?:Sort ID (?:ascending|descending)|Remove sorting for ID)$/,
      }),
    });
    await expect(id).toHaveAttribute('aria-sort', 'descending');
    await expectServerOrder(management, requests, 'id:desc');
    // The first removal keeps database default order but must clear the controlled UI criterion.
    for (const sort of ['', 'id:asc', 'id:desc', '', 'id:asc']) {
      await id.getByRole('button').click();
      await expectSort(page, management, requests, sort);
      await expect(id).toHaveAttribute(
        'aria-sort',
        sort === 'id:asc' ? 'ascending' : sort === 'id:desc' ? 'descending' : 'none',
      );
      await expect(id.getByRole('button')).toHaveAccessibleName(
        sort === 'id:asc'
          ? 'Sort ID descending'
          : sort === 'id:desc'
            ? 'Remove sorting for ID'
            : 'Sort ID ascending',
      );
    }
    const field = resource === 'roles' ? 'role' : 'user';
    const label = resource === 'roles' ? 'Role name' : 'Account';
    const text = management.locator('thead th').filter({
      has: page.getByRole('button', {
        name: new RegExp(
          `^(?:Sort ${label} (?:ascending|descending)|Remove sorting for ${label})$`,
        ),
      }),
    });
    for (const sort of [`${field}:asc`, `${field}:desc`, '', `${field}:asc`, `${field}:desc`, '']) {
      await text.getByRole('button').click();
      await expectSort(page, management, requests, sort);
      await expect(text.getByRole('button')).toHaveAccessibleName(
        sort === `${field}:asc`
          ? `Sort ${label} descending`
          : sort === `${field}:desc`
            ? `Remove sorting for ${label}`
            : `Sort ${label} ascending`,
      );
    }
    await management.getByRole('button', { name: 'Sort ID ascending', exact: true }).click();
    await expectSort(page, management, requests, 'id:asc');
    if (resource === 'sites') {
      await page.screenshot({
        path: test.info().outputPath('management-sort-cycle-sites.png'),
        fullPage: true,
      });
    }
    expect(requests.urls.some((url) => url.searchParams.get('sort') === `${field}:asc`)).toBe(true);
    expect(requests.urls.some((url) => url.searchParams.get('sort') === `${field}:desc`)).toBe(
      true,
    );
    expect(errors).toEqual([]);
  });
}

test('keyboard Shift removal, clear sorting and history preserve an explicitly empty sort', async ({
  page,
}) => {
  const { management, requests, errors } = await openManagement(page, 'users');
  const id = management
    .locator('thead th')
    .filter({
      has: page.getByRole('button', {
        name: /^(?:Sort ID (?:ascending|descending)|Remove sorting for ID)$/,
      }),
    })
    .getByRole('button');
  await id.focus();
  await page.keyboard.press('Enter');
  await expectSort(page, management, requests, '');
  await management.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get('page')).toBe('2');
  await expectSort(page, management, requests, '');
  await management.getByRole('searchbox', { name: 'Search', exact: true }).fill('sam');
  await expect(management.locator('tbody > tr')).toHaveCount(1);
  await expectSort(page, management, requests, '');
  await management.getByRole('searchbox', { name: 'Search', exact: true }).fill('');
  await expect(management.locator('tbody > tr')).toHaveCount(6);
  const filter = management.getByRole('button', { name: 'Sort and filter Active', exact: true });
  await filter.scrollIntoViewIfNeeded();
  await filter.click();
  await page.getByRole('radio', { name: 'Yes', exact: true }).click();
  await expect(filter).toBeFocused();
  await expect.poll(() => requests.urls.at(-1)?.searchParams.get('is_active')).toBe('true');
  await expectSort(page, management, requests, '');
  await management.getByRole('combobox', { name: 'Rows per page', exact: true }).selectOption('10');
  await expect(management.locator('tbody > tr')).toHaveCount(10);
  await expectSort(page, management, requests, '');
  await management.getByRole('button', { name: 'Sort Account ascending', exact: true }).click();
  await expectSort(page, management, requests, 'user:asc');
  await id.focus();
  await page.keyboard.press('Shift+Enter');
  await expectSort(page, management, requests, 'user:asc,id:asc');
  await expect(id).toBeFocused();
  await page.keyboard.press('Shift+Enter');
  await expectSort(page, management, requests, 'user:asc,id:desc');
  await expect(id).toBeFocused();
  await page.keyboard.press('Shift+Enter');
  await expectSort(page, management, requests, 'user:asc');
  await expect(id).toBeFocused();
  const user = management
    .locator('thead th')
    .filter({
      has: page.getByRole('button', {
        name: /^(?:Sort Account (?:ascending|descending)|Remove sorting for Account)$/,
      }),
    })
    .getByRole('button');
  await user.focus();
  await page.keyboard.press('Shift+Enter');
  await expectSort(page, management, requests, 'user:desc');
  await expect(user).toBeFocused();
  await page.keyboard.press('Shift+Enter');
  await expectSort(page, management, requests, '');
  await expect(user).toBeFocused();
  await page.goBack();
  await expectSort(page, management, requests, 'user:desc');
  await page.goForward();
  await expectSort(page, management, requests, '');
  for (const sort of ['id:asc', 'user:asc']) {
    const label = sort === 'id:asc' ? 'ID' : 'Account';
    await management.getByRole('button', { name: `Sort ${label} ascending`, exact: true }).click();
    await expectSort(page, management, requests, sort);
    await management.getByRole('button', { name: 'Clear sorting', exact: true }).click();
    await expectSort(page, management, requests, '');
  }
  await page.reload();
  await expectSort(page, management, requests, '');
  expect(errors).toEqual([]);
});

test.describe('mobile sort cycles', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });
  test('touch cycles and removing the final multi-column criterion keep working', async ({
    page,
  }) => {
    const { management, requests, errors } = await openManagement(page, 'roles');
    const id = management
      .locator('thead th')
      .filter({
        has: page.getByRole('button', {
          name: /^(?:Sort ID (?:ascending|descending)|Remove sorting for ID)$/,
        }),
      })
      .getByRole('button');
    for (const sort of ['', 'id:asc', 'id:desc', '', 'id:asc']) {
      await id.tap();
      await expectSort(page, management, requests, sort);
    }
    await management.getByRole('button', { name: 'Clear sorting', exact: true }).tap();
    await expectSort(page, management, requests, '');
    await management.getByRole('checkbox', { name: 'Multi-column sorting', exact: true }).check();
    for (const sort of ['role:asc', 'role:desc', '', 'role:asc']) {
      await management
        .locator('thead th')
        .filter({
          has: page.getByRole('button', {
            name: /^(?:Sort Role name (?:ascending|descending)|Remove sorting for Role name)$/,
          }),
        })
        .getByRole('button')
        .tap();
      await expectSort(page, management, requests, sort);
    }
    await id.tap();
    await expectSort(page, management, requests, 'role:asc,id:asc');
    await management.getByRole('button', { name: 'Clear sorting', exact: true }).tap();
    await expectSort(page, management, requests, '');
    await id.tap();
    await expectSort(page, management, requests, 'id:asc');
    expect(errors).toEqual([]);
  });
});
