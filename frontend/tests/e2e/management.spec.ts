import { expect, test as base, type Locator, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { waitForFixtureHydration } from '../fixtures/browser';
import { managementEndpointFixture, type ManagementResource } from '../fixtures/management';

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

/** Capture only real browser reads, so background public queries cannot hide eager list fetching. */
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
  await expect(management.locator('thead th').first().getByRole('button')).toHaveAccessibleName(
    'Remove sorting for ID',
  );
  await expect(management.locator('thead th').nth(1).getByRole('button')).toHaveAccessibleName(
    resource === 'roles' ? 'Sort Role name ascending' : 'Sort Account ascending',
  );
  await expect(
    management.locator('thead th').filter({ hasText: /^(?:Website ID|Role ID)/ }),
  ).toHaveCount(0);
  await expect(management.getByRole('columnheader').last()).toHaveText('Actions');
  await expect(
    management.getByRole('button', {
      name: `Sort ${resource === 'sites' ? 'Account updated' : 'Updated'} ascending`,
      exact: true,
    }),
  ).toBeVisible();
  expect(
    await management
      .locator('thead th, tbody td')
      .evaluateAll((cells) => cells.every((cell) => getComputedStyle(cell).textAlign === 'center')),
  ).toBe(true);
  const switches = await management
    .locator('tbody > tr')
    .first()
    .locator('td')
    .evaluateAll((cells) => cells.map((cell) => Boolean(cell.querySelector('[role="switch"]'))));
  const firstSwitch = switches.indexOf(true);
  expect(firstSwitch).toBeGreaterThan(1);
  expect(switches.slice(firstSwitch, -1).every(Boolean)).toBe(true);
  expect(
    await management.getByRole('switch').evaluateAll((inputs) =>
      inputs.every((input) => {
        const cell = input.closest('td')!.getBoundingClientRect();
        const control = input.getBoundingClientRect();
        return Math.abs(control.left + control.width / 2 - (cell.left + cell.width / 2)) <= 1;
      }),
    ),
  ).toBe(true);
  await expect(management.locator('form').getByRole('combobox')).toHaveCount(0);
  await expect(
    management.getByRole('button', { name: 'Clear sorting', exact: true }),
  ).toBeVisible();
  if (resource === 'users')
    await expect(management.getByRole('spinbutton', { name: 'Role ID', exact: true })).toHaveCount(
      0,
    );
  return management;
}

/** Choose a header filter through its portalled menu; controls update only the server query. */
async function chooseFilter(
  page: Page,
  management: Locator,
  label: string,
  choice: 'All' | 'Yes' | 'No',
) {
  const trigger = management.getByRole('button', { name: `Sort and filter ${label}`, exact: true });
  await trigger.scrollIntoViewIfNeeded();
  await trigger.click();
  await page.getByRole('radio', { name: choice, exact: true }).click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(trigger).toBeFocused();
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
    .getByRole('menuitem', { name: 'Platform management', exact: true })
    .click();
  await expect(page).toHaveURL(/\/en\/management\/sites$/);
  await expect(page.locator('[data-management-resource="sites"] tbody > tr')).toHaveCount(6);
  expect(requests).toHaveLength(1);
  expect(requests[0]!.pathname).toBe('/api/management/sites');
});

test('debounced literal search resets the page and boolean false remains a real server filter', async ({
  page,
}) => {
  const requests = managementRequests(page);
  const management = await openManagement(page, 'roles');
  await management.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(management.locator('tbody > tr').first()).toHaveAttribute('data-row-key', '8');
  const search = management.getByRole('searchbox', { name: 'Search', exact: true });
  await search.fill('rate');
  await search.fill('rate%reviewer');
  await expect(management.locator('tbody > tr')).toHaveCount(1);
  await expect(management.locator('tbody')).toContainText('rate%reviewer');
  expect(requests).toHaveLength(3);
  expect(requests.at(-1)?.searchParams.get('search')).toBe('rate%reviewer');
  expect(requests.at(-1)?.searchParams.get('page')).toBe('1');
  await search.fill('');
  await expect(management.locator('tbody > tr')).toHaveCount(6);
  await chooseFilter(page, management, 'Active', 'No');
  await expect(management.locator('tbody > tr')).toHaveCount(1);
  await expect(management.locator('tbody')).toContainText('archived');
  expect(requests.at(-1)?.searchParams.get('is_active')).toBe('false');
  expect(requests.at(-1)?.searchParams.has('search')).toBe(false);
});

test('ordered Shift sorting is passed to the API and never applied only to visible rows', async ({
  page,
}) => {
  const requests = managementRequests(page);
  const management = await openManagement(page, 'roles');
  await management.getByRole('button', { name: 'Sort Active ascending', exact: true }).click();
  await expect(management.locator('tbody > tr').first()).toHaveAttribute('data-row-key', '11');
  expect(requests.at(-1)?.searchParams.get('sort')).toBe('is_active:asc');
  await management
    .getByRole('button', { name: 'Sort Role name ascending', exact: true })
    .click({ modifiers: ['Shift'] });
  await expect(management.getByRole('table')).toHaveAttribute('aria-busy', 'false');
  await expect.poll(() => requests.at(-1)?.searchParams.get('sort')).toBe('is_active:asc,role:asc');
  await expect(management.locator('tbody > tr').nth(1)).toContainText('administrator');
  await management
    .getByRole('button', { name: 'Sort Role name descending', exact: true })
    .click({ modifiers: ['Shift'] });
  await expect
    .poll(() => requests.at(-1)?.searchParams.get('sort'))
    .toBe('is_active:asc,role:desc');
  await expect(management.locator('tbody > tr').nth(1)).toContainText('translator');
  await management.getByRole('button', { name: 'Clear sorting', exact: true }).click();
  await expect(management.locator('tbody > tr').first()).toHaveAttribute('data-row-key', '14');
  await expect.poll(() => requests.at(-1)?.searchParams.get('sort')).toBe('id:desc');
});

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
    has: page.getByRole('radio', { name: 'No', exact: true }),
  });
  await menu.getByRole('button', { name: 'Sort Active ascending', exact: true }).click();
  await expect(management.locator('tbody > tr').first()).toHaveAttribute('data-row-key', '11');
  await expect(trigger).toBeFocused();
  expect(requests.at(-1)?.searchParams.get('page')).toBe('1');
  expect(requests.at(-1)?.searchParams.get('sort')).toBe('is_active:asc');
  await management.getByRole('checkbox', { name: 'Multi-column sorting', exact: true }).check();
  await management.getByRole('button', { name: 'Sort Role name ascending', exact: true }).click();
  await expect.poll(() => requests.at(-1)?.searchParams.get('sort')).toBe('is_active:asc,role:asc');
  await expect(management.getByRole('table')).toHaveAttribute('aria-busy', 'false');
  await chooseFilter(page, management, 'Active', 'No');
  await expect(management.locator('tbody > tr')).toHaveCount(1);
  expect(requests.at(-1)?.searchParams.get('is_active')).toBe('false');
  expect(requests.at(-1)?.searchParams.get('sort')).toBe('is_active:asc,role:asc');
  await chooseFilter(page, management, 'Active', 'All');
  await expect(management.locator('tbody > tr')).toHaveCount(6);
  expect(requests.at(-1)?.searchParams.has('is_active')).toBe(false);
  await trigger.click();
  await menu.getByRole('button', { name: 'Remove sorting for Active', exact: true }).click();
  await expect.poll(() => requests.at(-1)?.searchParams.get('sort')).toBe('role:asc');
  await expect(management.locator('tbody > tr').first()).toHaveAttribute('data-row-key', '1');
  await expect(trigger).toBeFocused();
  expect(requests).toHaveLength(7);
});

test('browser Back and Forward restore the committed search and its server page', async ({
  page,
}) => {
  const management = await openManagement(page, 'roles');
  await management.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(management.locator('tbody > tr').first()).toHaveAttribute('data-row-key', '8');
  const search = management.getByRole('searchbox', { name: 'Search', exact: true });
  await search.fill('rate%reviewer');
  await expect(management.locator('tbody > tr')).toHaveCount(1);
  await page.goBack();
  await expect(search).toHaveValue('');
  await expect(management.locator('tbody > tr')).toHaveCount(6);
  await expect(management.locator('tbody > tr').first()).toHaveAttribute('data-row-key', '14');
  await page.goForward();
  await expect(search).toHaveValue('rate%reviewer');
  await expect(management.locator('tbody > tr')).toHaveCount(1);
  await expect(management.locator('tbody')).toContainText('rate%reviewer');
});

test('absent websites retain one owner row and nullable states are not fabricated switches', async ({
  page,
}) => {
  const requests = managementRequests(page);
  const management = await openManagement(page, 'sites');
  await chooseFilter(page, management, 'Has portfolio', 'No');
  await expect(management.locator('tbody > tr')).toHaveCount(2);
  const owner = management.locator('tbody > tr').filter({ hasText: 'no_site' });
  await expect(owner).toHaveCount(1);
  await expect(owner.locator('td').nth(1)).toHaveText('no_site');
  await expect(owner.locator('td').nth(2)).toHaveText('No portfolio');
  await expect(owner.getByRole('switch', { name: /^Published:/ })).toHaveCount(0);
  await expect(owner.getByRole('switch', { name: /^Default homepage:/ })).toHaveCount(0);
  await expect(owner.getByRole('switch', { name: /^Owner active:/ })).toBeChecked();
  await expect(owner.getByRole('switch', { name: /^Owner active:/ })).toBeDisabled();
  expect(
    await management
      .getByRole('switch')
      .evaluateAll((nodes) => nodes.every((node) => (node as HTMLInputElement).disabled)),
  ).toBe(true);
  expect(requests.at(-1)?.searchParams.get('has_site')).toBe('false');
  await owner.getByRole('button', { name: 'View details for no_site', exact: true }).click();
  const detail = page.getByRole('dialog');
  await expect(detail).toBeVisible();
  await expect(detail).toContainText('no_site');
  await page.keyboard.press('Escape');
  await expect(detail).not.toBeVisible();
  await expect(
    owner.getByRole('button', { name: 'View details for no_site', exact: true }),
  ).toBeFocused();
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
  await expect(
    management.getByRole('columnheader', { name: 'Profile name', exact: true }),
  ).toBeVisible();
  const profile = (id: number) =>
    management.locator(`tbody > tr[data-row-key="${id}"]`).locator('td').nth(2);
  await expect(profile(14)).toHaveText('No content in this language');
  await expect(profile(13)).toHaveText('Name not set');
  await expect(profile(12)).toHaveText('River nickname');
  await expect(profile(10)).toHaveText('陳小明');
  await expect(
    management.getByRole('button', { name: 'Sort Profile name ascending', exact: true }),
  ).toHaveCount(0);
  expect(requests).toHaveLength(1);
  expect(requests[0]!.searchParams.get('locale')).toBe('en');
});

test('column visibility changes presentation without issuing a new list read', async ({ page }) => {
  const requests = managementRequests(page);
  const management = await openManagement(page, 'users');
  await management.getByRole('button', { name: 'Columns', exact: true }).click();
  const created = management.getByRole('checkbox', { name: 'Created', exact: true });
  await created.check();
  await expect(
    management.getByRole('button', { name: 'Sort Created ascending', exact: true }),
  ).toBeVisible();
  await created.uncheck();
  await expect(
    management.getByRole('button', { name: 'Sort Created ascending', exact: true }),
  ).toHaveCount(0);
  await expect(management.getByRole('checkbox', { name: 'ID', exact: true })).toBeChecked();
  await expect(management.getByRole('checkbox', { name: 'ID', exact: true })).toBeDisabled();
  await expect(
    management.getByRole('button', { name: 'Remove sorting for ID', exact: true }),
  ).toBeVisible();
  await expect(
    management.getByRole('checkbox', { name: 'Website ID', exact: true }),
  ).not.toBeChecked();
  await expect(
    management.getByRole('checkbox', { name: 'Role ID', exact: true }),
  ).not.toBeChecked();
  await expect(management.locator('thead th').first().getByRole('button')).toHaveAccessibleName(
    'Remove sorting for ID',
  );
  expect(requests).toHaveLength(1);
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
    const cell = management.locator('tbody > tr').first().locator('td').first();
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
      await management
        .getByRole('button', { name: 'View details for operator', exact: true })
        .click();
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
    await management.getByRole('button', { name: 'Clear sorting', exact: true }).click();
    await expect.poll(() => new URL(page.url()).searchParams.get('sort')).toBe('');
    await expect(management.getByRole('table')).toHaveAttribute('aria-busy', 'false');
    const id = management.locator('thead th').first().getByRole('button');
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
    await id.click();
    await expect(management.getByRole('table')).toHaveAttribute('aria-busy', 'false');
    await expect(up.locator('..')).toHaveClass(/sortSelected/);
    await expect(down.locator('..')).not.toHaveClass(/sortSelected/);
    const ascending = await up.evaluate((node) => getComputedStyle(node).color);
    selectedSortColors.add(ascending);
    expect(ascending).not.toBe(await down.evaluate((node) => getComputedStyle(node).color));
    await id.click();
    await expect(management.getByRole('table')).toHaveAttribute('aria-busy', 'false');
    await expect(down.locator('..')).toHaveClass(/sortSelected/);
    await expect(up.locator('..')).not.toHaveClass(/sortSelected/);
    expect(await down.evaluate((node) => getComputedStyle(node).color)).toBe(ascending);
  }
  expect(hoverColors.size).toBe(4);
  expect(selectedSortColors.size).toBe(4);
});

for (const width of [375, 1440]) {
  test(`management table owns its horizontal scrolling at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const management = await openManagement(page, 'sites');
    const scroll = management.locator('.table-responsive');
    await expect(scroll).toHaveCSS('overflow-x', 'auto');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
    if (width === 375) {
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
  const ids = await management.locator('tbody > tr > td:first-child').allTextContents();
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
  const ids = await management.locator('tbody > tr > td:first-child').allTextContents();
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
