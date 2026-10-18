import { expect, test as base, type Locator, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { waitForFixtureHydration } from '../fixtures/browser';
import {
  managementEndpointFixture,
  managementRoleFixtures,
  type ManagementResource,
} from '../fixtures/management';

const test = base.extend<{ managementRuntime: void }>({
  managementRuntime: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await use();
      expect(errors).toEqual([]);
    },
    { auto: true },
  ],
});

const headings: Record<ManagementResource, string> = {
  sites: 'Platform management',
  users: 'User management',
  roles: 'Role management',
};

for (const resource of ['sites', 'users', 'roles'] as const) {
  for (const width of [320, 820, 1440]) {
    test(`${resource} settings reuse the background without duplicate appearance or language controls at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      const requests = managementRequests(page);
      const owner = await openManagement(page, resource);
      const field = owner.locator('[data-background-field]');
      await expect(owner.locator('header')).toHaveCount(0);
      await expect(field.locator('[data-field-edge]')).toHaveCount(4);
      await expect(field).toHaveCSS('pointer-events', 'none');
      await expect.poll(() => field.locator('svg path').count()).toBeGreaterThan(1);
      await expect(owner).not.toHaveAttribute('data-entering');
      const fieldBounds = (await field.boundingBox())!;
      const contentLeft = await owner
        .locator('#management-content')
        .evaluate((element) => element.parentElement!.getBoundingClientRect().left);
      expect(Math.abs(fieldBounds.x - contentLeft)).toBeLessThanOrEqual(1);
      expect(fieldBounds.y).toBe(0);
      const breadcrumb = owner.getByRole('navigation', { name: 'Breadcrumb', exact: true });
      await expect(breadcrumb.locator('li').first()).toHaveText('Settings');
      await expect(breadcrumb.locator('[aria-current="page"]')).toHaveText(headings[resource]);
      await expect(
        owner.locator('aside [data-sidebar-links]').first().getByRole('link'),
      ).toHaveText(['Overview', 'Requests', 'Workers', 'Platform', 'Roles', 'Users']);
      await expect(owner.locator('[data-management-controls]')).toBeVisible();
      await owner.locator('tbody [data-selection] input').first().check();
      await expect(
        owner.getByRole('button', { name: 'Background settings', exact: true }),
      ).toHaveCount(0);
      await expect(owner.getByRole('button', { name: 'Change language', exact: true })).toHaveCount(
        0,
      );
      await expect(
        owner.getByRole('button', { name: 'Account settings', exact: true }),
      ).toBeVisible();
      await expect(owner.locator('tbody [data-selection] input:checked')).toHaveCount(1);
      await expect(owner.locator('tbody > tr')).toHaveCount(6);
      expect(requests).toHaveLength(1);
      await page.screenshot({ path: test.info().outputPath(`settings-${width}.png`) });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await expect(field.locator('svg')).toBeVisible();
      await expect(owner.locator('[data-pointer-glow]')).toHaveCSS('display', 'none');
      await expect(owner.getByRole('table')).toHaveAttribute('aria-busy', 'false');
    });
  }
}

/** Restore a synthetic administrator; list endpoints remain independent of menu visibility. */
async function restoreAdministrator(page: Page) {
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
}

/** Capture every management read; dropdown option discovery must not trigger extra requests. */
function managementRequests(page: Page) {
  const requests: URL[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/api/management/')) requests.push(url);
  });
  return requests;
}

/** Open one resource and wait for its first validated server page. */
async function openManagement(page: Page, resource: ManagementResource) {
  await restoreAdministrator(page);
  await page.goto(`/en/management/${resource}`);
  const management = page.locator(`[data-management-resource="${resource}"]`);
  await expect(
    management.getByRole('heading', { name: headings[resource], exact: true }),
  ).toBeVisible();
  await expect(management.locator('tbody > tr')).toHaveCount(6);
  await expect(management.getByRole('table')).toHaveAttribute('aria-busy', 'false');
  await expect(management.locator('tbody > tr').first().locator('time').last()).toHaveText(
    '2026.09.15 12:30:00',
  );
  await expect(management.locator('thead th[aria-sort]').nth(0)).toHaveAttribute(
    'aria-sort',
    'none',
  );
  await expect(management.locator('thead th[aria-sort]').nth(1)).toHaveAttribute(
    'aria-sort',
    'none',
  );
  await expect(
    management
      .locator('thead th:not([data-selection])')
      .filter({ hasText: /^(?:Website ID|Role ID)/ }),
  ).toHaveCount(0);
  await expect(management.getByRole('columnheader').last()).toHaveText('Actions');
  await expect(
    management.locator('thead [data-column-title]').filter({ hasText: /^Updated$/ }),
  ).toBeVisible();
  expect(
    await management
      .locator('thead th, tbody td')
      .evaluateAll((cells) => cells.every((cell) => getComputedStyle(cell).textAlign === 'center')),
  ).toBe(true);
  expect(
    await management.locator('thead [data-column-title]').evaluateAll((titles) =>
      titles.every((title) => {
        const cell = title.closest('th')!.getBoundingClientRect();
        const text = title.getBoundingClientRect();
        const controls = title.nextElementSibling!.getBoundingClientRect();
        return (
          Math.abs(text.left + text.width / 2 - (cell.left + cell.width / 2)) <= 1 &&
          controls.left - text.right <= 3
        );
      }),
    ),
  ).toBe(true);
  const sortIcon = management.locator('thead button[aria-pressed] .icon').first();
  const filterIcon = management.locator('thead .dropdown-toggle .icon').first();
  if (await sortIcon.isVisible())
    expect(await sortIcon.evaluate((node) => node.getBoundingClientRect().width)).toBe(8);
  expect(await filterIcon.evaluate((node) => node.getBoundingClientRect().width)).toBe(10);
  const switches = await management
    .locator('tbody > tr')
    .first()
    .locator('td:not([data-selection])')
    .evaluateAll((cells) => cells.map((cell) => Boolean(cell.querySelector('[role="switch"]'))));
  const firstSwitch = switches.indexOf(true);
  expect(firstSwitch).toBeGreaterThan(1);
  if (resource === 'sites') {
    expect(switches).toEqual([false, false, false, false, true, true, false, false]);
    await expect(management.locator('thead th:not([data-selection])').nth(2)).toHaveText('Profile');
    await expect(
      management
        .locator('tbody > tr')
        .first()
        .locator('td:not([data-selection])')
        .getByRole('checkbox'),
    ).toHaveCount(2);
    expect(
      await management
        .locator('thead th:not([data-selection])')
        .evaluateAll((headers) =>
          headers.map((header) =>
            (
              header.querySelector(':scope > div > span')?.textContent ?? header.textContent
            )?.trim(),
          ),
        ),
    ).toEqual(['ID', 'Email', 'Profile', 'Publish', 'Default', 'Active', 'Updated', 'Actions']);
  } else if (resource === 'users') {
    await expect(management.locator('thead [data-column-title]')).toHaveText([
      'ID',
      'Email',
      'Role',
      'Login',
      'LastLogin',
      'Updated',
      'Active',
      'Actions',
    ]);
    expect(switches).toEqual([false, false, false, false, false, false, true, false]);
  } else {
    await expect(management.locator('thead [data-column-title]')).toHaveText([
      'ID',
      'Role',
      'Create',
      'Read',
      'Update',
      'Delete',
      'Site',
      'Users',
      'Roles',
      'Default',
      'Active',
      'Updated',
      'Actions',
    ]);
    expect(switches).toEqual([
      false,
      false,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      false,
      false,
    ]);
  }
  expect(
    await management.getByRole('switch').evaluateAll((inputs) =>
      inputs.every((input) => {
        const cell = input.closest('td')!.getBoundingClientRect();
        const control = input.getBoundingClientRect();
        return Math.abs(control.left + control.width / 2 - (cell.left + cell.width / 2)) <= 1;
      }),
    ),
  ).toBe(true);
  await expect(management.locator('[data-table-search] .dropdown-toggle')).toHaveCount(1);
  await expect(management.getByRole('button', { name: 'Clear sorting', exact: true })).toHaveCount(
    0,
  );
  if (resource === 'users')
    await expect(management.getByRole('spinbutton', { name: 'Role ID', exact: true })).toHaveCount(
      0,
    );
  await expect(management).not.toHaveAttribute('data-entering');
  return management;
}

for (const resource of ['sites', 'users', 'roles'] as const) {
  for (const width of [320, 1440]) {
    test(`${resource} selected and individual delete confirmations stay scoped at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      const requests = managementRequests(page);
      const writes: unknown[] = [];
      await page.route(`**/api/management/${resource}/*`, (route) => {
        writes.push(route.request().postDataJSON());
        return route.fulfill({
          status: 409,
          json: {
            detail:
              resource === 'sites'
                ? 'SITE_DELETE_CONFLICT'
                : resource === 'roles'
                  ? 'ROLE_DELETE_CONFLICT'
                  : 'USER_DELETE_CONFLICT',
          },
        });
      });
      const owner = await openManagement(page, resource);
      const copy = JSON.parse(
        await readFile(new URL('../../src/i18n/messages/en.json', import.meta.url), 'utf8'),
      ).management;
      const wording =
        copy[
          resource === 'sites' ? 'deletion' : resource === 'roles' ? 'roleDeletion' : 'userDeletion'
        ];
      const bulk = owner.getByRole('button', { name: 'Delete', exact: true });
      const eligible = owner
        .locator('tbody > tr')
        .filter({ has: page.locator('button[value="delete"]:enabled') });
      const single = eligible.first().locator('button[value="delete"]');
      const name = (await single.getAttribute('aria-label'))!.slice('Delete '.length);
      const dialog = page.getByRole('dialog', {
        name: 'Are you sure you want to delete?',
        exact: true,
      });
      await expect(bulk).toBeDisabled();
      await single.click();
      await expect(dialog).toHaveAccessibleDescription(wording.target.replace('{{name}}', name));
      await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      await expect(single).toBeFocused();
      for (const index of [0, 1])
        await eligible.nth(index).locator('[data-selection] input').check();
      await bulk.click();
      await expect(dialog).toHaveAccessibleDescription(wording.targets.replace('{{count}}', '2'));
      const bounds = (await dialog.locator('.modal-content').boundingBox())!;
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(900);
      await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
      await expect(bulk).toBeFocused();
      await expect(owner.locator('[data-selection] input:checked')).toHaveCount(2);
      const all = owner.getByRole('checkbox', { name: 'Select all rows on this page' });
      await all.check();
      if (resource !== 'users') await expect(bulk).toBeDisabled();
      else {
        await bulk.click();
        await expect(dialog).toHaveAccessibleDescription(wording.targets.replace('{{count}}', '6'));
        await page.keyboard.press('Escape');
      }
      await all.uncheck();
      expect(writes).toHaveLength(0);
      await single.click();
      await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
      await expect(dialog).toHaveCount(0);
      await expect(owner.locator('tbody > tr')).toHaveCount(6);
      await expect(owner.locator('[data-selection] input:checked')).toHaveCount(0);
      await expect(page.getByRole('status')).toContainText('Nothing was deleted');
      expect(writes).toHaveLength(1);
      expect(requests.filter((url) => url.pathname === `/api/management/${resource}`)).toHaveLength(
        2,
      );
    });
  }
}

test('query navigation cancels a delete confirmation and never revives its previous targets', async ({
  page,
}) => {
  const owner = await openManagement(page, 'users');
  await owner.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(owner.locator('tbody > tr').first()).toHaveAttribute('data-row-key', '8');
  await owner.locator('tbody [data-selection] input').first().check();
  await owner.getByRole('button', { name: 'Delete', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await page.goBack();
  await expect(owner.locator('tbody > tr').first()).toHaveAttribute('data-row-key', '14');
  await expect(dialog).not.toBeVisible();
  await page.goForward();
  await expect(owner.locator('tbody > tr').first()).toHaveAttribute('data-row-key', '8');
  await expect(dialog).not.toBeVisible();
  await expect(owner.locator('tbody [data-selection] input:checked')).toHaveCount(0);
  await expect(owner.getByRole('button', { name: 'Delete', exact: true })).toBeDisabled();
});

/** Row checks remain local; URL navigation must not revive a previous page's selection. */
test('row selection stays local and query navigation clears it without restoring old selections', async ({
  page,
}) => {
  const requests = managementRequests(page);
  const management = await openManagement(page, 'sites');
  const all = management.getByRole('checkbox', { name: 'Select all rows on this page' });
  const rowSelections = management.locator('tbody [data-selection] input');
  await expect(
    management.getByText('Showing 1 to 6 of 14 rows, Total: 14', { exact: true }),
  ).toBeVisible();
  await rowSelections.first().check();
  await expect(
    management.getByText('Showing 1 to 6 of 14 rows, Total: 14, 1 row selected'),
  ).toBeVisible();
  await expect(all).toBeChecked({ indeterminate: true });
  expect(requests).toHaveLength(1);
  await all.check();
  for (const checkbox of await rowSelections.all()) await expect(checkbox).toBeChecked();
  await expect(all).toBeChecked();
  await expect(
    management.getByText('Showing 1 to 6 of 14 rows, Total: 14, 6 rows selected'),
  ).toBeVisible();
  await rowSelections.last().uncheck();
  await expect(
    management.getByText('Showing 1 to 6 of 14 rows, Total: 14, 5 rows selected'),
  ).toBeVisible();
  await expect(all).toBeChecked({ indeterminate: true });
  await all.check();
  await management.getByRole('button', { name: 'Columns', exact: true }).click();
  await management.getByRole('checkbox', { name: 'All', exact: true }).check();
  await expect(all).toBeChecked();
  await management.getByRole('button', { name: 'Columns', exact: true }).click();
  await management.locator('.table-responsive').evaluate((node) => {
    node.scrollLeft = 0;
  });
  expect(
    await management.locator('[data-selection] input').evaluateAll((inputs) =>
      inputs.every((input) => {
        const cell = input.closest('th, td')!.getBoundingClientRect();
        const control = input.getBoundingClientRect();
        return Math.abs(control.top + control.height / 2 - (cell.top + cell.height / 2)) <= 1;
      }),
    ),
  ).toBe(true);
  await management.locator('.table-responsive').screenshot({
    path: test.info().outputPath('management-row-selection.png'),
  });
  expect(requests).toHaveLength(1);
  await management.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(management.locator('tbody > tr').first()).toHaveAttribute('data-row-key', '8');
  await expect(all).not.toBeChecked();
  await expect(
    management.getByText('Showing 7 to 12 of 14 rows, Total: 14', { exact: true }),
  ).toBeVisible();
  await expect(management.locator('tbody [data-selection] input:checked')).toHaveCount(0);
  await all.check();
  await page.goBack();
  await expect(management.locator('tbody > tr').first()).toHaveAttribute('data-row-key', '14');
  await expect(all).not.toBeChecked();
  await rowSelections.first().check();
  await management.getByRole('button', { name: 'Sort ID ascending', exact: true }).click();
  await expect(management.locator('tbody > tr').first()).toHaveAttribute('data-row-key', '1');
  await expect(management.locator('tbody [data-selection] input:checked')).toHaveCount(0);
  await all.check();
  await (await columnSearch(page, management, 'Email')).fill('alex');
  await expect(management.locator('tbody > tr')).toHaveCount(1);
  await expect(all).not.toBeChecked();
});

/** Choose a header filter through its portalled menu; controls update only the server query. */
async function chooseFilter(
  page: Page,
  management: Locator,
  label: string,
  choice: 'All' | 'Yes' | 'No',
) {
  const trigger = management.getByRole('button', {
    name: `Sort and filter ${label}`,
    exact: true,
  });
  await trigger.scrollIntoViewIfNeeded();
  await trigger.click();
  const menu = page
    .locator('.dropdown-menu.show')
    .filter({ has: page.getByRole('combobox', { name: `${label}: Value`, exact: true }) });
  await menu
    .getByRole('combobox', { name: `${label}: Value`, exact: true })
    .selectOption(choice === 'All' ? '' : choice === 'Yes' ? 'true' : 'false');
  await expect(management.getByRole('table')).toHaveAttribute('aria-busy', 'false');
  await page.keyboard.press('Escape');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(trigger).toBeFocused();
}

/** Open a text editor through the same configured column menu as every other type. */
async function columnSearch(page: Page, management: Locator, label: string) {
  const trigger = management.getByRole('button', { name: `Sort and filter ${label}`, exact: true });
  await trigger.scrollIntoViewIfNeeded();
  await trigger.click();
  return page.getByRole('searchbox', { name: `${label}: Value`, exact: true });
}
function predicates(url?: URL): { field: string; operator: string; value?: unknown }[] {
  return JSON.parse(url?.searchParams.get('filters') ?? '[]');
}
for (const width of [390, 1440]) {
  test(`users Role dropdown reuses loaded choices and server filtering at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const requests = managementRequests(page);
    const management = await openManagement(page, 'users');
    await expect(management.getByRole('table')).toHaveAttribute('aria-busy', 'false');
    const loaded = [
      ...new Set(
        (await management.locator('tbody tr td:nth-child(4) span[title]').allTextContents()).map(
          (role) => role.trim(),
        ),
      ),
    ];
    const trigger = management.getByRole('button', { name: 'Sort and filter Role', exact: true });
    await trigger.scrollIntoViewIfNeeded();
    await trigger.click();
    const menu = page.locator('.dropdown-menu.show');
    await expect(menu.getByRole('checkbox')).toHaveCount(loaded.length);
    expect(
      await menu
        .getByRole('checkbox')
        .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('aria-label')).sort()),
    ).toEqual([...loaded].sort());
    await expect(menu.locator('span[data-color]')).toHaveCount(loaded.length);
    await expect(menu.getByRole('combobox')).toHaveCount(0);
    const bounds = (await menu.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(7);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width - 7);
    const selectedRole = loaded[0]!;
    await menu.getByRole('checkbox', { name: selectedRole, exact: true }).check();
    await expect
      .poll(() => predicates(requests.at(-1)))
      .toEqual([{ field: 'role', operator: 'in', value: [selectedRole] }]);
    await expect(management.getByRole('table')).toHaveAttribute('aria-busy', 'false');
    expect(
      (await management.locator('tbody tr td:nth-child(4) span[title]').allTextContents()).every(
        (role) => role.trim() === selectedRole,
      ),
    ).toBe(true);
    await expect(menu.getByRole('checkbox')).toHaveCount(loaded.length);
    const reads = requests.length;
    await menu.getByRole('searchbox').fill(selectedRole);
    await expect(menu.getByRole('checkbox')).toHaveCount(1);
    expect(requests).toHaveLength(reads);
    await menu.getByRole('searchbox').fill('');
    await expect(menu.getByRole('checkbox')).toHaveCount(loaded.length);
    await menu.locator('button[title]').filter({ hasText: 'Deselect' }).click();
    await expect.poll(() => predicates(requests.at(-1))).toEqual([]);
    await expect(management.locator('tbody > tr')).toHaveCount(6);
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
  });
}
for (const resource of ['sites', 'users', 'roles'] as const) {
  test(`${resource} requests only its selected page and keeps paging on the server`, async ({
    page,
  }) => {
    const requests = managementRequests(page);
    const management = await openManagement(page, resource);
    expect(requests).toHaveLength(1);
    expect(requests[0]!.pathname).toBe(`/api/management/${resource}`);
    expect(requests[0]!.searchParams.get('page')).toBe('1');
    expect(requests[0]!.searchParams.get('size')).toBe('6');
    if (resource === 'sites') expect(requests[0]!.searchParams.get('locale')).toBe('en');
    await expect(management.locator('tbody > tr').first()).toHaveAttribute('data-row-key', '14');
    await expect(
      management.getByRole('button', { name: 'Previous page', exact: true }),
    ).toBeDisabled();
    await management.getByRole('button', { name: 'Next page', exact: true }).click();
    await expect(management.locator('tbody > tr').first()).toHaveAttribute('data-row-key', '8');
    expect(requests).toHaveLength(2);
    expect(requests[1]!.searchParams.get('page')).toBe('2');
    expect(requests.every((url) => url.pathname === `/api/management/${resource}`)).toBe(true);
    await management
      .getByRole('combobox', { name: 'Rows per page', exact: true })
      .selectOption('10');
    await expect(management.locator('tbody > tr')).toHaveCount(10);
    expect(requests).toHaveLength(3);
    expect(requests[2]!.searchParams.get('page')).toBe('1');
    expect(requests[2]!.searchParams.get('size')).toBe('10');
    const last = management.getByRole('button', { name: 'Last page', exact: true });
    const first = management.getByRole('button', { name: 'First page', exact: true });
    await last.click();
    await expect(management.locator('tbody > tr')).toHaveCount(4);
    await expect(last).toBeDisabled();
    expect(requests.at(-1)?.searchParams.get('page')).toBe('2');
    await first.click();
    await expect(management.locator('tbody > tr')).toHaveCount(10);
    await expect(first).toBeDisabled();
    expect(requests.at(-1)?.searchParams.get('page')).toBe('1');
    expect(requests).toHaveLength(5);
    for (const [label, asset] of [
      ['First page', 'chevron-double-left'],
      ['Previous page', 'chevron-left'],
      ['Next page', 'chevron-right'],
      ['Last page', 'chevron-double-right'],
    ]) {
      expect(
        await management
          .getByRole('button', { name: label!, exact: true })
          .evaluate((node) => getComputedStyle(node, '::before').maskImage),
      ).toContain(asset!);
    }
  });
}

test('public pages keep management idle until the administrator selects a resource', async ({
  page,
}) => {
  const requests = managementRequests(page);
  await restoreAdministrator(page);
  await page.goto('/en');
  await waitForFixtureHydration(page);
  expect(requests).toHaveLength(0);
  await page.getByRole('button', { name: 'Account settings', exact: true }).click();
  await page
    .getByRole('menu', { name: 'Account settings', exact: true })
    .getByRole('menuitem', { name: 'Platform', exact: true })
    .click();
  await expect(page).toHaveURL(/\/en\/management\/sites$/);
  await expect(page.locator('[data-management-resource="sites"] tbody > tr')).toHaveCount(6);
  expect(requests).toHaveLength(1);
  expect(requests[0]!.pathname).toBe('/api/management/sites');
});

test('dropdown search stays local while selection resets paging and false remains a server predicate', async ({
  page,
}) => {
  const requests = managementRequests(page);
  const management = await openManagement(page, 'roles');
  await management.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(management.locator('tbody > tr').first()).toHaveAttribute('data-row-key', '8');
  await management.getByRole('button', { name: 'Sort and filter Role', exact: true }).click();
  const menu = page.locator('.dropdown-menu.show');
  const search = menu.getByRole('searchbox');
  await search.fill('rate');
  await search.fill('rate%reviewer');
  await expect(menu.getByRole('checkbox')).toHaveCount(1);
  await expect(management.locator('tbody > tr')).toHaveCount(6);
  expect(requests).toHaveLength(2);
  await menu.getByRole('checkbox', { name: 'rate%reviewer', exact: true }).check();
  await expect(management.locator('tbody > tr')).toHaveCount(1);
  await expect(management.locator('tbody')).toContainText('rate%reviewer');
  expect(requests).toHaveLength(3);
  expect(predicates(requests.at(-1))).toContainEqual({
    field: 'role',
    operator: 'in',
    value: ['rate%reviewer'],
  });
  expect(requests.at(-1)?.searchParams.get('page')).toBe('1');
  await menu.getByRole('button', { name: 'Deselect(1)', exact: true }).click();
  await expect(management.locator('tbody > tr')).toHaveCount(6);
  await page.keyboard.press('Escape');
  await chooseFilter(page, management, 'Active', 'No');
  await expect(management.locator('tbody > tr')).toHaveCount(1);
  await expect(management.locator('tbody')).toContainText('archived');
  expect(predicates(requests.at(-1))).toContainEqual({
    field: 'is_active',
    operator: 'equals',
    value: false,
  });
  expect(requests.at(-1)?.searchParams.has('search')).toBe(false);
});

test('ordered arrow sorting is passed to the API and never applied only to visible rows', async ({
  page,
}) => {
  const requests = managementRequests(page);
  const management = await openManagement(page, 'roles');
  await management.getByRole('button', { name: 'Sort Active ascending', exact: true }).click();
  await expect(management.locator('tbody > tr').first()).toHaveAttribute('data-row-key', '11');
  expect(requests.at(-1)?.searchParams.get('sort')).toBe('is_active:asc');
  await management.getByRole('button', { name: 'Sort Role ascending', exact: true }).click();
  await expect(management.getByRole('table')).toHaveAttribute('aria-busy', 'false');
  await expect.poll(() => requests.at(-1)?.searchParams.get('sort')).toBe('is_active:asc,role:asc');
  await expect(management.locator('tbody > tr').nth(1)).toContainText('administrator');
  await management.getByRole('button', { name: 'Sort Role descending', exact: true }).click();
  await expect
    .poll(() => requests.at(-1)?.searchParams.get('sort'))
    .toBe('is_active:asc,role:desc');
  await expect(management.locator('tbody > tr').nth(1)).toContainText('translator');
  await management.getByRole('button', { name: 'Clear sorting', exact: true }).click();
  await expect(management.locator('tbody > tr').first()).toHaveAttribute('data-row-key', '14');
  await expect.poll(() => requests.at(-1)?.searchParams.get('sort')).toBeNull();
});

test('typed number and date menus compose server predicates and clear together', async ({
  page,
}) => {
  const requests = managementRequests(page);
  const management = await openManagement(page, 'sites');
  const open = async (label: string) => {
    const trigger = management.getByRole('button', {
      name: `Sort and filter ${label}`,
      exact: true,
    });
    await trigger.scrollIntoViewIfNeeded();
    await trigger.click();
  };
  await open('ID');
  await page.getByRole('combobox', { name: 'ID: Condition', exact: true }).selectOption('between');
  await page.getByRole('spinbutton', { name: 'ID: From', exact: true }).fill('10');
  await page.getByRole('spinbutton', { name: 'ID: To', exact: true }).fill('14');
  await expect(management.locator('tbody > tr')).toHaveCount(5);
  await expect
    .poll(() => predicates(requests.at(-1)))
    .toEqual([{ field: 'id', operator: 'between', value: [10, 14] }]);
  await page.keyboard.press('Escape');
  await open('Updated');
  await page.locator('input[aria-label="Updated: Value"]').fill('2026-09-15');
  await expect
    .poll(() => predicates(requests.at(-1)))
    .toContainEqual({
      field: 'updatetime',
      operator: 'equals',
      value: '2026-09-15',
    });
  await expect(management.getByRole('table')).toHaveAttribute('aria-busy', 'false');
  await page.keyboard.press('Escape');
  const savedQuery = new URL(page.url()).search;
  await open('Updated');
  await page.waitForTimeout(350);
  expect(new URL(page.url()).search).toBe(savedQuery);
  await page.keyboard.press('Escape');
  await management.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await expect(management.locator('tbody > tr')).toHaveCount(6);
  expect(predicates(requests.at(-1))).toEqual([]);
});

for (const { resource, locale, width } of [
  { resource: 'roles', locale: 'en', width: 1440 },
  { resource: 'users', locale: 'zh-Hant', width: 390 },
  { resource: 'sites', locale: 'zh-Hans', width: 1440 },
] as const) {
  test(`${locale} ${resource} date filters use a calendar and whole UTC days`, async ({
    page,
    baseURL,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    if (locale === 'en')
      await page.context().addCookies([
        {
          name: 'portfolio-appearance',
          value: encodeURIComponent(JSON.stringify({ theme: 'mint' })),
          url: baseURL!,
        },
      ]);
    const seed = managementEndpointFixture(
      new URL(`/api/management/${resource}?size=100&locale=${locale}`, baseURL!),
    )!.items;
    for (const [index, value] of [
      [0, '2026-09-15T00:00:00Z'],
      [1, '2026-09-15T23:59:59.999999Z'],
      [2, '2026-09-16T00:00:00Z'],
      [3, '2026-09-14T23:59:59.999999Z'],
    ] as const)
      seed[index]!.updatetime = value;
    await page.route(`**/api/management/${resource}?**`, (route) =>
      route.fulfill({ json: managementEndpointFixture(new URL(route.request().url()), seed) }),
    );
    await restoreAdministrator(page);
    await page.goto(`/${locale}/management/${resource}`);
    const management = page.locator(`[data-management-resource="${resource}"]`);
    await expect(management.locator('tbody > tr')).toHaveCount(6);
    const trigger = management
      .locator('thead th')
      .filter({ has: page.locator('[data-column-title]').filter({ hasText: /^Updated$/ }) })
      .locator('.dropdown-toggle');
    await trigger.scrollIntoViewIfNeeded();
    await trigger.click();
    const menu = page.locator('.dropdown-menu.show');
    const input = menu.locator('input[type="date"]');
    await expect(input).toBeVisible();
    if (locale === 'en') await expect(input).toHaveCSS('color-scheme', 'dark');
    await expect(menu.locator('input[type="datetime-local"]')).toHaveCount(0);
    const condition = menu.getByRole('combobox');
    expect(
      await condition
        .locator('option')
        .evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value)),
    ).toEqual(['equals', 'not_equals', 'gt', 'lt', 'empty', 'not_empty']);
    await input.click();
    if (locale === 'en')
      await page.screenshot({ path: test.info().outputPath('calendar-picker.png') });
    await page.keyboard.press('Escape');
    if ((await trigger.getAttribute('aria-expanded')) === 'false') await trigger.click();
    const read = (operator: string) =>
      page.waitForResponse((response) => {
        const url = new URL(response.url());
        return (
          url.pathname === `/api/management/${resource}` &&
          predicates(url).some(
            (filter) => filter.field === 'updatetime' && filter.operator === operator,
          )
        );
      });
    let pending = read('equals');
    await input.fill('2026-09-15');
    expect((await (await pending).json()).total).toBe(12);
    await expect(management.locator('tbody > tr').first()).toHaveAttribute('data-row-key', '13');
    for (const [operator, total, first] of [
      ['not_equals', 2, 12],
      ['gt', 1, 12],
      ['lt', 1, 11],
      ['empty', 0, null],
      ['not_empty', 14, 12],
    ] as const) {
      pending = read(operator);
      await condition.selectOption(operator);
      expect((await (await pending).json()).total).toBe(total);
      await expect(management.locator('tbody > tr')).toHaveCount(Math.min(total, 6));
      if (first)
        await expect(management.locator('tbody > tr').first()).toHaveAttribute(
          'data-row-key',
          String(first),
        );
    }
    await condition.focus();
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
  });
}

test('header menus combine filtering with server sorting and remove only their own criterion', async ({
  page,
}) => {
  const requests = managementRequests(page);
  const management = await openManagement(page, 'roles');
  await management.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(management.locator('tbody > tr').first()).toHaveAttribute('data-row-key', '8');
  const trigger = management.getByRole('button', { name: 'Sort and filter Active', exact: true });
  await trigger.scrollIntoViewIfNeeded();
  await trigger.click();
  const menu = page.locator('.dropdown-menu.show').filter({
    has: page.getByRole('combobox', { name: 'Active: Value', exact: true }),
  });
  await menu.getByRole('button', { name: 'Sort Active ascending', exact: true }).click();
  await expect(management.locator('tbody > tr').first()).toHaveAttribute('data-row-key', '11');
  await expect(trigger).toBeFocused();
  expect(requests.at(-1)?.searchParams.get('page')).toBe('1');
  expect(requests.at(-1)?.searchParams.get('sort')).toBe('is_active:asc');
  await management.getByRole('button', { name: 'Sort Role ascending', exact: true }).click();
  await expect.poll(() => requests.at(-1)?.searchParams.get('sort')).toBe('is_active:asc,role:asc');
  await expect(management.getByRole('table')).toHaveAttribute('aria-busy', 'false');
  await chooseFilter(page, management, 'Active', 'No');
  await expect(management.locator('tbody > tr')).toHaveCount(1);
  expect(predicates(requests.at(-1))).toContainEqual({
    field: 'is_active',
    operator: 'equals',
    value: false,
  });
  expect(requests.at(-1)?.searchParams.get('sort')).toBe('is_active:asc,role:asc');
  await chooseFilter(page, management, 'Active', 'All');
  await expect(management.locator('tbody > tr')).toHaveCount(6);
  expect(predicates(requests.at(-1)).some((item) => item.field === 'is_active')).toBe(false);
  await trigger.click();
  await menu.getByRole('button', { name: 'Remove sorting for Active', exact: true }).click();
  await expect.poll(() => requests.at(-1)?.searchParams.get('sort')).toBe('role:asc');
  await expect(management.locator('tbody > tr').first()).toHaveAttribute('data-row-key', '1');
  await expect(trigger).toBeFocused();
  expect(requests).toHaveLength(7);
});

test('browser Back and Forward restore dropdown selections and their server page', async ({
  page,
}) => {
  const management = await openManagement(page, 'roles');
  await management.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(management.locator('tbody > tr').first()).toHaveAttribute('data-row-key', '8');
  const trigger = management.getByRole('button', { name: 'Sort and filter Role', exact: true });
  await trigger.click();
  const menu = page.locator('.dropdown-menu.show');
  await menu.getByRole('checkbox', { name: 'rate%reviewer', exact: true }).check();
  await expect(management.locator('tbody > tr')).toHaveCount(1);
  await page.goBack();
  await expect(
    menu.getByRole('checkbox', { name: 'rate%reviewer', exact: true }),
  ).not.toBeChecked();
  await expect(management.locator('tbody > tr')).toHaveCount(6);
  await expect(management.locator('tbody > tr').first()).toHaveAttribute('data-row-key', '8');
  await page.goForward();
  await expect(menu.getByRole('checkbox', { name: 'rate%reviewer', exact: true })).toBeChecked();
  await expect(management.locator('tbody > tr')).toHaveCount(1);
  await expect(management.locator('tbody')).toContainText('rate%reviewer');
});

for (const locale of ['en', 'zh-Hans', 'zh-Hant']) {
  test(`${locale} dropdown list filter uses loaded roles, colored selections and server predicates`, async ({
    page,
    baseURL,
  }) => {
    await page.context().addCookies([
      {
        name: 'portfolio-appearance',
        value: encodeURIComponent(
          JSON.stringify({
            theme: locale === 'en' ? 'mint' : locale === 'zh-Hans' ? 'blue' : 'mist',
            speed: 1,
            brightness: 80,
            paused: false,
          }),
        ),
        url: baseURL!,
      },
    ]);
    await page.setViewportSize({ width: locale === 'en' ? 320 : 1440, height: 900 });
    const reads: URL[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.pathname === '/api/management/roles') reads.push(url);
    });
    await restoreAdministrator(page);
    await page.goto(`/${locale}/management/roles`);
    const management = page.locator('[data-management-resource="roles"]');
    await expect(management.locator('tbody > tr')).toHaveCount(6);
    expect(reads).toHaveLength(1);
    const trigger = management.locator('thead .dropdown-toggle').nth(1);
    await trigger.click();
    const menu = page.locator('.dropdown-menu.show');
    await expect(menu.getByRole('checkbox')).toHaveCount(6);
    const bounds = (await menu.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(7);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(locale === 'en' ? 313 : 1433);
    await expect(menu.getByRole('checkbox', { name: 'administrator', exact: true })).toHaveCount(0);
    await expect(menu.getByRole('checkbox', { name: 'support', exact: true })).not.toBeChecked();
    await expect(menu.getByRole('button', { name: 'Condition', exact: true })).toHaveCount(0);
    await expect(menu.getByRole('combobox')).toHaveCount(0);
    expect(reads).toHaveLength(1);
    const target = (await menu
      .getByRole('checkbox', { name: 'support', exact: true })
      .boundingBox())!;
    expect(target.width).toBeGreaterThanOrEqual(44);
    expect(target.height).toBeGreaterThanOrEqual(44);
    expect(await menu.locator('span[data-color]').count()).toBe(6);
    expect(
      await menu
        .locator('span[data-color]')
        .evaluateAll((chips) => new Set(chips.map((chip) => chip.getAttribute('data-color'))).size),
    ).toBeGreaterThanOrEqual(2);
    const supportColor = await menu
      .getByText('support', { exact: true })
      .getAttribute('data-color');
    expect(
      await menu.locator('span[data-color]').evaluateAll((chips) =>
        chips.every((chip) => {
          const color = getComputedStyle(chip);
          const luminance = (rgb: string) => {
            const components = rgb
              .match(/\d+/g)!
              .slice(0, 3)
              .map((value) => {
                const c = Number(value) / 255;
                return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
              });
            return components[0]! * 0.2126 + components[1]! * 0.7152 + components[2]! * 0.0722;
          };
          return (luminance(color.backgroundColor) + 0.05) / (luminance(color.color) + 0.05) >= 4.5;
        }),
      ),
    ).toBe(true);
    const select = menu
      .locator('button[title]')
      .filter({ hasText: locale === 'en' ? /^Select/ : locale === 'zh-Hant' ? /^選取/ : /^选择/ });
    const deselect = menu
      .locator('button[title]')
      .filter({ hasText: locale === 'en' ? 'Deselect' : '取消' });
    await expect(select).toContainText('(6)');
    await expect(deselect).toContainText('(0)');
    await expect(deselect).toBeDisabled();
    await menu.getByRole('checkbox', { name: 'support', exact: true }).check();
    await menu.getByRole('checkbox', { name: 'maintainer', exact: true }).check();
    await expect(management.locator('tbody > tr')).toHaveCount(2);
    expect(predicates(reads.at(-1))).toContainEqual({
      field: 'role',
      operator: 'in',
      value: ['maintainer', 'support'],
    });
    await expect(menu.getByRole('checkbox')).toHaveCount(6);
    await expect(select).toContainText('(6)');
    await expect(deselect).toContainText('(2)');
    const search = menu.getByRole('searchbox');
    const beforeSearch = reads.length;
    await search.fill('moder');
    await expect(menu.getByRole('checkbox')).toHaveCount(1);
    await expect(management.locator('tbody > tr')).toHaveCount(2);
    expect(reads).toHaveLength(beforeSearch);
    await expect(select).toContainText('(1)');
    await select.click();
    await expect(management.locator('tbody > tr')).toHaveCount(3);
    expect(predicates(reads.at(-1))).toContainEqual({
      field: 'role',
      operator: 'in',
      value: ['maintainer', 'moderator', 'support'],
    });
    await deselect.click();
    await expect(management.locator('tbody > tr')).toHaveCount(2);
    await search.fill('');
    await expect(menu.getByRole('checkbox')).toHaveCount(6);
    await expect(menu.getByText('support', { exact: true })).toHaveAttribute(
      'data-color',
      supportColor!,
    );
    if (locale === 'en')
      await menu.screenshot({ path: test.info().outputPath('role-dropdown-list-filter.png') });
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
    await page.goBack();
    await expect(management.locator('tbody > tr')).toHaveCount(3);
    await trigger.click();
    await expect(menu.getByRole('checkbox', { name: 'moderator', exact: true })).toBeChecked();
    await deselect.click();
    await expect(management.locator('tbody > tr')).toHaveCount(6);
    expect(predicates(reads.at(-1)).some((filter) => filter.field === 'role')).toBe(false);
    await page.keyboard.press('Escape');
    await expect(menu).not.toBeVisible();
    await expect(trigger).toBeFocused();
    await management.locator('button[value="next"]').click();
    await expect(management.locator('tbody > tr').first()).toHaveAttribute('data-row-key', '8');
    await trigger.click();
    await expect(menu.getByRole('checkbox')).toHaveCount(12);
    await expect(menu.getByRole('checkbox', { name: 'administrator', exact: true })).toHaveCount(0);
    await expect(menu.getByRole('checkbox', { name: 'editor_ops', exact: true })).toHaveCount(0);
    await expect(menu.getByText('support', { exact: true })).toHaveAttribute(
      'data-color',
      supportColor!,
    );
    const requestCount = reads.length;
    await search.fill('never-loaded-role');
    await expect(menu.getByRole('checkbox')).toHaveCount(0);
    expect(reads).toHaveLength(requestCount);
  });

  test(`${locale} role permissions and complete details keep independent Users meanings`, async ({
    page,
  }) => {
    const requests = managementRequests(page);
    await page.setViewportSize({ width: 1920, height: 1000 });
    await restoreAdministrator(page);
    await page.goto(`/${locale}/management/roles`);
    const management = page.locator('[data-management-resource="roles"]');
    await expect(management.locator('tbody > tr')).toHaveCount(6);
    await expect(management.locator('thead [data-column-title]')).toHaveText([
      'ID',
      'Role',
      'Create',
      'Read',
      'Update',
      'Delete',
      'Site',
      'Users',
      'Roles',
      'Default',
      'Active',
      'Updated',
      'Actions',
    ]);
    const flags = [
      ['Create', 'is_create'],
      ['Read', 'is_read'],
      ['Update', 'is_update'],
      ['Delete', 'is_delete'],
      ['Site', 'is_manage_sites'],
      ['Users', 'is_manage_users'],
      ['Roles', 'is_manage_roles'],
      ['Default', 'is_default'],
      ['Active', 'is_active'],
    ] as const;
    for (const id of [14, 13]) {
      const row = management.locator(`tbody > tr[data-row-key="${id}"]`);
      const expected = managementRoleFixtures.find((fixture) => fixture.id === id)!;
      await expect(row.getByRole('switch')).toHaveCount(9);
      for (const [label, field] of flags) {
        const toggle = row.getByRole('switch', { name: new RegExp(`^${label}:`) });
        await expect(toggle).toHaveJSProperty('checked', expected[field]);
        await expect(toggle).toBeDisabled();
      }
    }
    if (locale === 'en')
      await management.screenshot({ path: test.info().outputPath('role-table.png') });
    const row = management.locator('tbody > tr[data-row-key="14"]');
    await expect(row.getByRole('switch', { name: /^Users:/ })).not.toBeChecked();
    await row.locator('button[value="edit"]').click();
    const detail = page.getByRole('dialog');
    await expect(detail).toHaveCSS('opacity', '1');
    await expect(detail.locator('dt')).toHaveText([
      'ID',
      'Role',
      'Users',
      'Default',
      'Create',
      'Read',
      'Update',
      'Delete',
      'Manage Site',
      'Manage Users',
      'Manage Roles',
      'Active',
      'Description',
      'Created',
      'Updated',
    ]);
    await expect(detail.locator('dl > div').nth(2).locator('dd')).toHaveText('2');
    await expect(detail.getByRole('switch')).toHaveCount(9);
    await expect(detail.getByRole('switch', { name: /^Manage Users:/ })).not.toBeChecked();
    await expect(detail.getByRole('switch', { name: /^Read:/ })).toBeChecked();
    await expect(detail.locator('time')).toHaveText(['2026.01.01 08:00:00', '2026.09.15 12:30:00']);
    if (locale === 'en')
      await detail.screenshot({ path: test.info().outputPath('role-details.png') });
    await page.keyboard.press('Escape');
    await expect(detail).not.toBeVisible();
    await expect(row.locator('button[value="edit"]')).toBeFocused();
    expect(requests).toHaveLength(1);
  });
}

for (const locale of ['en', 'zh-Hans', 'zh-Hant']) {
  test(`${locale} platform status renderers keep short headings and explain Default eligibility`, async ({
    page,
  }) => {
    const writes: string[] = [];
    page.on('request', (request) => {
      if (!['GET', 'HEAD'].includes(request.method())) writes.push(request.url());
    });
    await restoreAdministrator(page);
    await page.route('**/api/management/sites?**', (route) => {
      const result = managementEndpointFixture(new URL(route.request().url()))!;
      // A published portfolio with a disabled owner must still be ineligible.
      Object.assign(result.items[0]!, { owner_is_active: false, is_published: true });
      Object.assign(result.items[1]!, { owner_is_active: true, is_published: true });
      Object.assign(result.items[2]!, { owner_is_active: true, is_published: false });
      return route.fulfill({ json: result });
    });
    await page.goto(`/${locale}/management/sites`);
    const management = page.locator('[data-management-resource="sites"]');
    await expect(management.locator('tbody > tr')).toHaveCount(6);
    expect(
      await management
        .locator('thead th:not([data-selection])')
        .evaluateAll((headers) =>
          headers.map((header) =>
            (
              header.querySelector(':scope > div > span')?.textContent ?? header.textContent
            )?.trim(),
          ),
        ),
    ).toEqual(['ID', 'Account', 'Profile', 'Publish', 'Default', 'Active', 'Updated', 'Actions']);
    const row = (id: number) => management.locator(`tbody > tr[data-row-key="${id}"]`);
    await expect(row(14).locator('time')).toHaveText('2026.09.15 12:30:00');
    await expect(row(14).getByRole('checkbox', { name: /^Profile:/ })).toBeChecked();
    await expect(row(14).getByRole('checkbox', { name: /^Publish:/ })).toBeChecked();
    await expect(row(14).getByRole('switch', { name: /^Active:/ })).not.toBeChecked();
    const disabledOwner = row(14).getByRole('switch', { name: /^Default:/ });
    await expect(disabledOwner).toBeDisabled();
    await expect(disabledOwner.locator('..')).toHaveAttribute('data-unavailable', '');
    await expect(disabledOwner.locator('..')).toHaveAttribute('title', /Active.*Profile.*Publish/);
    const eligible = row(13).getByRole('switch', { name: /^Default:/ });
    await expect(eligible).toBeDisabled(); // Updates remain a separate, future integration.
    await expect(eligible.locator('..')).not.toHaveAttribute('data-unavailable');
    await expect(
      row(12)
        .getByRole('switch', { name: /^Default:/ })
        .locator('..'),
    ).toHaveAttribute('data-unavailable', '');
    await expect(row(11).getByRole('checkbox', { name: /^Profile:/ })).not.toBeChecked();
    await expect(row(11).getByRole('checkbox', { name: /^Publish:/ })).toHaveCount(0);
    await expect(row(11).getByRole('switch', { name: /^Default:/ })).toHaveCount(0);
    await row(14).locator('button[value="edit"]').click();
    const detail = page.getByRole('dialog');
    await expect(detail.locator('dt')).toHaveText([
      'ID',
      'Account',
      'First name',
      'Family name',
      'Nickname',
      'Education',
      'Profile name',
      'Profile data',
      'Brand',
      'Brand Subtitle',
      'Publish',
      'Translation',
      'Default',
      'Active',
      'Program',
      'Language',
      'Copyright',
      'Introduction',
      'Footer',
      'Email',
      'LinkedIn',
      'GitHub',
      'Medium',
      'Chat icon',
      'Chat title',
      'Chat subtitle',
      'Chat content',
      'Profile introduction',
      'Website ID',
      'Created',
      'Updated',
    ]);
    await expect(detail.locator('time')).toHaveText(['2026.01.01 08:00:00', '2026.09.15 12:30:00']);
    await expect(detail.getByRole('checkbox', { name: /^Profile data:/ })).toBeChecked();
    await expect(detail.getByRole('checkbox', { name: /^Translation:/ })).toBeChecked();
    await expect(detail.getByRole('checkbox', { name: /^Publish:/ })).toBeChecked();
    await expect(detail.getByRole('switch', { name: /^Default:/ }).locator('..')).toHaveAttribute(
      'data-unavailable',
      '',
    );
    await page.keyboard.press('Escape');
    expect(writes).toEqual([]);
  });
}

test('Profile identifies careers independently of website presence and preview availability', async ({
  page,
}) => {
  const requests = managementRequests(page);
  const management = await openManagement(page, 'sites');
  const row = (id: number) => management.locator(`tbody > tr[data-row-key="${id}"]`);
  await expect(row(14).getByRole('checkbox', { name: /^Profile:/ })).toBeChecked();
  await expect(row(9).getByRole('checkbox', { name: /^Profile:/ })).not.toBeChecked();
  await expect(row(9).locator('button[value="preview"]')).toBeEnabled();
  await row(9).locator('button[value="edit"]').click();
  let detail = page.getByRole('dialog');
  await expect(detail.getByRole('checkbox', { name: /^Website exists:/ })).toBeChecked();
  await expect(detail.getByRole('checkbox', { name: /^Profile:/ })).not.toBeChecked();
  await expect(detail.getByRole('checkbox', { name: /^Profile:/ })).toBeDisabled();
  await expect(detail.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
  await detail.locator('.modal-footer').getByRole('button', { name: 'Close', exact: true }).click();
  await chooseFilter(page, management, 'Profile', 'No');
  await expect(management.locator('tbody > tr')).toHaveCount(3);
  expect(predicates(requests.at(-1))).toContainEqual({
    field: 'has_profile',
    operator: 'equals',
    value: false,
  });
  await expect(row(9).getByRole('checkbox', { name: /^Publish:/ })).toBeChecked();
  const owner = row(4);
  await expect(owner.getByRole('checkbox', { name: /^Profile:/ })).not.toBeChecked();
  await expect(owner.getByRole('checkbox', { name: /^Publish:/ })).toHaveCount(0);
  await expect(owner.getByRole('switch', { name: /^Default:/ })).toHaveCount(0);
  await expect(owner.locator('button[value="preview"]')).toBeDisabled();
  await owner.locator('button[value="edit"]').click();
  detail = page.getByRole('dialog');
  await expect(detail.getByRole('checkbox', { name: /^Website exists:/ })).not.toBeChecked();
  await expect(detail.getByRole('checkbox', { name: /^Profile:/ })).not.toBeChecked();
  await detail.locator('.modal-footer').getByRole('button', { name: 'Close', exact: true }).click();
});

test('profile names distinguish absent language content, missing names and nickname fallbacks', async ({
  page,
}) => {
  const requests = managementRequests(page);
  await page.route('**/api/management/sites?**', (route) => {
    const result = managementEndpointFixture(new URL(route.request().url()))!;
    Object.assign(result.items[0]!, {
      has_translation: false,
      first_name: null,
      family_name: null,
      nick_name: null,
      brand_title: null,
    });
    Object.assign(result.items[1]!, {
      first_name: '   ',
      family_name: '',
      nick_name: ' ',
    });
    Object.assign(result.items[2]!, {
      first_name: null,
      family_name: null,
      nick_name: ' River nickname ',
    });
    Object.assign(result.items[4]!, {
      first_name: '小明',
      family_name: '陳',
      nick_name: 'Unused nickname',
    });
    return route.fulfill({ json: result });
  });
  const management = await openManagement(page, 'sites');
  for (const [id, name] of [
    [14, 'No content in this language'],
    [13, 'Name not set'],
    [12, 'River nickname'],
    [10, '陳小明'],
  ] as const) {
    await management
      .locator(`tbody > tr[data-row-key="${id}"]`)
      .locator('button[value="edit"]')
      .click();
    const detail = page.getByRole('dialog');
    await expect(
      detail
        .locator('dl > div')
        .filter({ has: page.locator('dt', { hasText: /^Profile name$/ }) })
        .locator('dd'),
    ).toHaveText(name);
    await page.keyboard.press('Escape');
    await expect(detail).not.toBeVisible();
  }
  expect(requests).toHaveLength(1);
  expect(requests[0]!.searchParams.get('locale')).toBe('en');
});

test('column visibility changes presentation without issuing a new list read', async ({ page }) => {
  const requests = managementRequests(page);
  const management = await openManagement(page, 'users');
  await management.getByRole('button', { name: 'Columns', exact: true }).click();
  const email = management.getByRole('checkbox', { name: 'Email', exact: true });
  await email.uncheck();
  await expect(
    management.getByRole('button', { name: 'Sort Email ascending', exact: true }),
  ).toHaveCount(0);
  await email.check();
  await expect(
    management.getByRole('button', { name: 'Sort Email ascending', exact: true }),
  ).toBeVisible();
  await expect(management.getByRole('checkbox', { name: 'ID', exact: true })).toBeChecked();
  await expect(management.getByRole('checkbox', { name: 'ID', exact: true })).toBeDisabled();
  await expect(
    management.getByRole('button', { name: 'Sort ID ascending', exact: true }),
  ).toHaveAttribute('aria-pressed', 'false');
  for (const name of ['Created', 'Website ID', 'Role ID', 'Role active', 'Has portfolio']) {
    await expect(management.getByRole('checkbox', { name, exact: true })).toHaveCount(0);
  }
  await expect(
    management.getByRole('button', { name: 'Sort ID ascending', exact: true }),
  ).toHaveAttribute('aria-pressed', 'false');
  expect(requests).toHaveLength(1);
});

test('user Active reflects the account row independently of role and portfolio states', async ({
  page,
}) => {
  await page.route('**/api/management/users?**', (route) => {
    const result = managementEndpointFixture(new URL(route.request().url()))!;
    Object.assign(result.items[0]!, {
      is_active: true,
      role_is_active: false,
      has_site: false,
      site_id: null,
    });
    Object.assign(result.items[1]!, { is_active: false, role_is_active: true, has_site: true });
    return route.fulfill({ json: result });
  });
  const management = await openManagement(page, 'users');
  const first = management.locator('tbody > tr').first();
  const second = management.locator('tbody > tr').nth(1);
  await expect(first.getByRole('switch')).toHaveCount(1);
  await expect(first.getByRole('switch', { name: /^Active:/ })).toBeChecked();
  await expect(second.getByRole('switch', { name: /^Active:/ })).not.toBeChecked();
  await first.locator('button[value="edit"]').click();
  const detail = page.getByRole('dialog');
  await expect(detail.locator('dt')).toHaveCount(12);
  await expect(detail.getByRole('switch', { name: 'Edit Active', exact: true })).toBeChecked();
  await expect(detail.getByRole('switch', { name: /^Role active:/ })).not.toBeChecked();
  await expect(detail.getByRole('switch', { name: /^Has portfolio:/ })).not.toBeChecked();
});

test('pending list reads show the shared SVG loading indicator before rendering rows', async ({
  page,
}) => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/management/users?**', async (route) => {
    await pending;
    await route.fulfill({ json: managementEndpointFixture(new URL(route.request().url())) });
  });
  await restoreAdministrator(page);
  await page.goto('/en/management/users');
  const management = page.locator('[data-management-resource="users"]');
  try {
    await expect(management.getByRole('table')).toHaveAttribute('aria-busy', 'true');
    const loading = management
      .getByRole('status')
      .filter({ has: page.locator('svg[data-decoration]') });
    await expect(loading).toBeVisible();
    await expect(loading.locator('svg rect')).toHaveCount(24);
    await expect(loading.locator('svg circle')).toHaveCount(3);
    await expect(management.locator('.spinner-border')).toHaveCount(0);
    await expect(management.locator('tbody > tr')).toHaveCount(0);
  } finally {
    release();
  }
  await expect(management.locator('tbody > tr')).toHaveCount(6);
  await expect(management.getByRole('table')).toHaveAttribute('aria-busy', 'false');
});

for (const failure of ['unavailable', 'invalid'] as const) {
  test(`${failure} list response reports a local error and retries the same selected page`, async ({
    page,
  }) => {
    let fail = true;
    const requests = managementRequests(page);
    await page.route('**/api/management/users?**', (route) => {
      if (fail)
        return failure === 'unavailable'
          ? route.fulfill({ status: 503, json: { detail: 'PRIVATE_DATABASE_SENTINEL' } })
          : route.fulfill({ json: { items: null, total: 14, pages: 3, page: 1, size: 6 } });
      return route.fulfill({ json: managementEndpointFixture(new URL(route.request().url())) });
    });
    await restoreAdministrator(page);
    await page.goto('/en/management/users');
    const management = page.locator('[data-management-resource="users"]');
    await expect(management.getByRole('alert')).toBeVisible();
    await expect(management.locator('tbody > tr')).toHaveCount(0);
    expect(await page.locator('body').innerText()).not.toContain('PRIVATE_DATABASE_SENTINEL');
    fail = false;
    await management.getByRole('button', { name: 'Try again', exact: true }).click();
    await expect(management.locator('tbody > tr')).toHaveCount(6);
    expect(requests).toHaveLength(failure === 'unavailable' ? 3 : 2);
    expect(requests.every((url) => url.searchParams.get('page') === '1')).toBe(true);
  });
}

test('each theme supplies a distinct visible row hover and Bootstrap table styling', async ({
  page,
  context,
}) => {
  await restoreAdministrator(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  const hoverColors = new Set<string>();
  const selectedSortColors = new Set<string>();
  for (const theme of ['mist', 'mint', 'blue', 'amber']) {
    await context.addCookies([
      {
        name: 'portfolio-appearance',
        value: encodeURIComponent(JSON.stringify({ theme })),
        url: 'http://127.0.0.1:4173',
      },
    ]);
    await page.goto('/en/management/sites');
    const management = page.locator('[data-management-resource="sites"]');
    await expect(management.locator('tbody > tr')).toHaveCount(6);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await expect(management).toHaveAttribute('data-bs-theme', theme === 'mist' ? 'light' : 'dark');
    const table = management.getByRole('table');
    await expect(table).toHaveClass(/table-hover/);
    const cell = management
      .locator('tbody > tr')
      .first()
      .locator('td:not([data-selection])')
      .first();
    await page.mouse.move(0, 0);
    const before = await cell.evaluate((node) => getComputedStyle(node).boxShadow);
    await cell.hover();
    await expect
      .poll(() => cell.evaluate((node) => getComputedStyle(node).boxShadow))
      .not.toBe(before);
    hoverColors.add(
      await table.evaluate((node) =>
        getComputedStyle(node).getPropertyValue('--bs-table-hover-bg').trim(),
      ),
    );
    if (theme === 'blue') {
      await page.screenshot({
        path: test.info().outputPath('management-blue.png'),
        fullPage: true,
      });
      await management.locator('tbody > tr').first().locator('button[value="edit"]').click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await expect(page.getByRole('dialog')).toHaveCSS('opacity', '1');
      await expect(page.getByRole('dialog').locator('.modal-dialog')).toHaveCSS(
        'transform',
        'none',
      );
      await page.screenshot({ path: test.info().outputPath('management-blue-details.png') });
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).not.toBeVisible();
    }
    const id = management.locator('thead th:not([data-selection])').first();
    const up = id.locator('svg.bi-caret-up-fill');
    const down = id.locator('svg.bi-caret-down-fill');
    await expect(up).toHaveCount(1);
    await expect(down).toHaveCount(1);
    // Read both carets in one layout snapshot so a disappearing sorting row cannot split the measurements.
    const caretY = await id.evaluate((node) => ({
      up: node.querySelector('svg.bi-caret-up-fill')!.getBoundingClientRect().y,
      down: node.querySelector('svg.bi-caret-down-fill')!.getBoundingClientRect().y,
    }));
    expect(caretY.up).toBeLessThan(caretY.down);
    await expect(up.locator('..')).not.toHaveClass(/sortSelected/);
    await expect(down.locator('..')).not.toHaveClass(/sortSelected/);
    await id.getByRole('button', { name: 'Sort ID ascending', exact: true }).click();
    await expect(management.getByRole('table')).toHaveAttribute('aria-busy', 'false');
    await expect(up.locator('..')).toHaveClass(/sortSelected/);
    await expect(down.locator('..')).not.toHaveClass(/sortSelected/);
    const ascending = await up.evaluate((node) => getComputedStyle(node).color);
    selectedSortColors.add(ascending);
    expect(ascending).not.toBe(await down.evaluate((node) => getComputedStyle(node).color));
    await id.getByRole('button', { name: 'Sort ID descending', exact: true }).click();
    await expect(management.getByRole('table')).toHaveAttribute('aria-busy', 'false');
    await expect(down.locator('..')).toHaveClass(/sortSelected/);
    await expect(up.locator('..')).not.toHaveClass(/sortSelected/);
    expect(await down.evaluate((node) => getComputedStyle(node).color)).toBe(ascending);
  }
  expect(hoverColors.size).toBe(4);
  expect(selectedSortColors.size).toBe(4);
});

for (const width of [320, 375, 640, 820, 1440]) {
  test.describe(`table viewport ${width}`, () => {
    test.use({ hasTouch: width === 375 });
    test(`management table owns its horizontal scrolling at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.context().addCookies([
        {
          name: 'portfolio-appearance',
          value: encodeURIComponent(JSON.stringify({ theme: 'mint', paused: true })),
          url: 'http://127.0.0.1:4173',
        },
      ]);
      const management = await openManagement(page, 'sites');
      const scroll = management.locator('.table-responsive');
      await expect(scroll).toHaveCSS('overflow-x', 'auto');
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        width,
      );
      if (width <= 640) {
        const header = management.locator('thead th[aria-sort]').first();
        const box = (await header.boundingBox())!;
        expect(box.height).toBeLessThanOrEqual(64);
        expect(box.width).toBeLessThanOrEqual(96);
        const trigger = management.getByRole('button', { name: 'Sort and filter ID', exact: true });
        const target = (await trigger.boundingBox())!;
        expect(target.width).toBeGreaterThanOrEqual(44);
        expect(target.height).toBeGreaterThanOrEqual(44);
        const pagination = management.getByRole('navigation', {
          name: 'Table pagination',
          exact: true,
        });
        const positions = await pagination
          .locator('button:visible')
          .evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().top));
        expect(new Set(positions).size).toBe(1);
        expect(positions).toHaveLength(5);
        await trigger.click();
        await page.getByRole('button', { name: 'Sort ID ascending', exact: true }).click();
        await expect(management.locator('tbody > tr').first()).toHaveAttribute('data-row-key', '1');
        await expect(header).toHaveAttribute('aria-sort', 'ascending');
        await management.getByRole('button', { name: 'Clear sorting', exact: true }).click();
        await expect(management.locator('tbody > tr').first()).toHaveAttribute(
          'data-row-key',
          '14',
        );
        await trigger.click();
        await page
          .getByRole('combobox', { name: 'ID: Condition', exact: true })
          .selectOption('equals');
        await page.getByRole('spinbutton', { name: 'ID: Value', exact: true }).fill('2');
        await expect(management.locator('tbody > tr')).toHaveCount(1);
        await expect(management.locator('tbody > tr').first()).toHaveAttribute('data-row-key', '2');
        await page.keyboard.press('Escape');
        await management.getByRole('button', { name: 'Clear filters', exact: true }).click();
        await expect(management.locator('tbody > tr')).toHaveCount(6);
        expect(await scroll.evaluate((node) => node.scrollWidth)).toBeGreaterThan(
          await scroll.evaluate((node) => node.clientWidth),
        );
        await management
          .getByRole('button', { name: 'Next page', exact: true })
          .scrollIntoViewIfNeeded();
        await expect(
          management.getByRole('button', { name: 'Next page', exact: true }),
        ).toBeInViewport();
      }
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
      await expect(
        page.getByRole('link', { name: 'Skip to content', exact: true }),
      ).not.toBeInViewport();
      await page.screenshot({
        path: test.info().outputPath(`management-${width}.png`),
        fullPage: true,
      });
    });
  });
}

/** Read the uncompressed OOXML package using Node built-ins, without an archive dependency. */
function storedArchiveFile(archive: Buffer, filename: string) {
  let offset = 0;
  while (offset + 30 <= archive.length && archive.readUInt32LE(offset) === 0x04034b50) {
    expect(archive.readUInt16LE(offset + 8)).toBe(0);
    const size = archive.readUInt32LE(offset + 18);
    const nameLength = archive.readUInt16LE(offset + 26);
    const extraLength = archive.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const contentStart = nameStart + nameLength + extraLength;
    const name = archive.subarray(nameStart, nameStart + nameLength).toString('utf8');
    if (name === filename)
      return archive.subarray(contentStart, contentStart + size).toString('utf8');
    offset = contentStart + size;
  }
  throw new Error(`Generated workbook is missing ${filename}`);
}

async function chooseExport(management: Locator, option: 'Copy' | 'Excel' | 'CSV' | 'Print') {
  await management.getByRole('button', { name: 'Export', exact: true }).click();
  const menu = management.locator('.dropdown-menu.show').filter({ hasText: 'Current page' });
  await expect(menu).toContainText('Current page');
  await menu.screenshot({ path: test.info().outputPath('management-export-menu.png') });
  await menu.getByRole('button', { name: option, exact: true }).click();
}

test('CSV and Excel download only the selected page and visible data columns', async ({ page }) => {
  const requests = managementRequests(page);
  const management = await openManagement(page, 'users');
  await management.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(management.locator('tbody > tr').first()).toHaveAttribute('data-row-key', '8');
  await management.getByRole('button', { name: 'Columns', exact: true }).click();
  await management.getByRole('checkbox', { name: 'Email', exact: true }).uncheck();
  await management.getByRole('button', { name: 'Columns', exact: true }).click();
  const ids = await management.locator('tbody > tr > td:nth-child(2)').allTextContents();
  const csvDownload = page.waitForEvent('download');
  await chooseExport(management, 'CSV');
  const csv = await csvDownload;
  expect(csv.suggestedFilename()).toMatch(/\.csv$/);
  const csvRows = (await readFile((await csv.path())!, 'utf8'))
    .replace(/^\uFEFF/u, '')
    .split('\r\n');
  expect(csvRows).toHaveLength(ids.length + 1);
  expect(csvRows[0]!.split(',')[0]).toBe('ID');
  expect(csvRows[0]!.split(',')).not.toContain('Email');
  expect(csvRows[0]!.split(',')).not.toContain('Actions');
  expect(csvRows.slice(1).map((row) => row.split(',')[0])).toEqual(ids);
  const excelDownload = page.waitForEvent('download');
  await chooseExport(management, 'Excel');
  const excel = await excelDownload;
  expect(excel.suggestedFilename()).toMatch(/\.xlsx$/);
  const xml = storedArchiveFile(await readFile((await excel.path())!), 'xl/worksheets/sheet1.xml');
  const workbookRows = await page.evaluate((sheet) => {
    const document = new DOMParser().parseFromString(sheet, 'application/xml');
    return [...document.querySelectorAll('row')].map((row) =>
      [...row.querySelectorAll('c')].map((cell) => cell.textContent),
    );
  }, xml);
  expect(workbookRows).toHaveLength(ids.length + 1);
  expect(workbookRows[0]![0]).toBe('ID');
  expect(workbookRows[0]).not.toContain('Email');
  expect(workbookRows[0]).not.toContain('Actions');
  expect(workbookRows.slice(1).map((row) => row[0])).toEqual(ids);
  expect(requests).toHaveLength(2);
});

test('Copy and Print use current rows without fetching or opening a real print dialog', async ({
  page,
  context,
}) => {
  const prints: { rows: string[][]; heading: string }[] = [];
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.exposeFunction(
    'managementPrintCapture',
    (snapshot: { rows: string[][]; heading: string }) => {
      prints.push(snapshot);
    },
  );
  await page.addInitScript(() => {
    if (window === window.top) return;
    window.print = () => {
      const snapshot = {
        heading: document.querySelector('h1')?.textContent ?? '',
        rows: [...document.querySelectorAll('tbody tr')].map((row) =>
          [...row.querySelectorAll('td')].map((cell) => cell.textContent ?? ''),
        ),
      };
      void (
        window as unknown as { managementPrintCapture: (value: typeof snapshot) => Promise<void> }
      )
        .managementPrintCapture(snapshot)
        .then(() => window.dispatchEvent(new Event('afterprint')));
    };
  });
  const requests = managementRequests(page);
  const management = await openManagement(page, 'roles');
  await management.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(management.locator('tbody > tr').first()).toHaveAttribute('data-row-key', '8');
  const ids = await management.locator('tbody > tr > td:nth-child(2)').allTextContents();
  await chooseExport(management, 'Copy');
  await expect
    .poll(async () => {
      const copied = await page.evaluate(() => navigator.clipboard.readText());
      return copied
        .split('\r\n')
        .slice(1)
        .map((row) => row.split('\t')[0]);
    })
    .toEqual(ids);
  await chooseExport(management, 'Print');
  await expect.poll(() => prints.length).toBe(1);
  expect(prints[0]!.heading).toBe('Role management');
  expect(prints[0]!.rows.map((row) => row[0])).toEqual(ids);
  await expect(page.locator('iframe[aria-hidden="true"]')).toHaveCount(0);
  expect(requests).toHaveLength(2);
});
