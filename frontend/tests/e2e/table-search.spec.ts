import { expect, type Page } from '@playwright/test';
import { runtimeTest as test } from '../fixtures/browser';

async function open(page: Page, resource: string, locale = 'en') {
  await page.context().addCookies([
    {
      name: 'portfolio-appearance',
      value: encodeURIComponent(JSON.stringify({ theme: 'mint', paused: true })),
      url: 'http://127.0.0.1:4173',
    },
  ]);
  await page.route('**/api/authority/session', (route) =>
    route.fulfill({
      json: {
        id: 91,
        user: 'operator',
        email: 'operator@example.com',
        role: 'admin',
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
  await page.goto(`/${locale}/management/${resource}`);
  await expect(page.locator('tbody tr')).toHaveCount(6);
  await expect(page.getByRole('table')).toHaveAttribute('aria-busy', 'false');
  return page.locator('[data-table-search]');
}

for (const resource of ['sites', 'users', 'roles']) {
  test(`${resource} searches all server pages and combines scope with column filters`, async ({
    page,
  }) => {
    const search = await open(page, resource);
    const initialRows = await page.locator('tbody').innerText();
    await search.locator('.dropdown-toggle').click();
    const options = (await search.locator('[role=group] label').allTextContents()).map((text) =>
      text.trim(),
    );
    await page.keyboard.press('Escape');
    expect(options[0]).toBe('All');
    expect(options).not.toContain('Actions');
    const keyword = resource === 'roles' ? 'administrator' : 'alex';
    const field = resource === 'sites' ? 'owner_email' : resource === 'users' ? 'email' : 'role';
    await page.getByRole('button', { name: 'Page 2', exact: true }).click();
    await expect.poll(() => page.locator('tbody').innerText()).not.toBe(initialRows);
    await expect(page.getByRole('table')).toHaveAttribute('aria-busy', 'false');
    const secondRows = await page.locator('tbody').innerText();
    const input = search.getByRole('searchbox');
    await input.fill(keyword.toUpperCase());
    expect(await page.locator('tbody').innerText()).toBe(secondRows);
    expect(new URL(page.url()).searchParams.has('search')).toBe(false);
    await input.press('Enter');
    await expect(page.locator('tbody tr')).toHaveCount(1);
    await expect(page.locator('tbody tr')).toContainText(
      resource === 'roles' ? 'administrator' : 'alex@example.com',
    );
    expect(new URL(page.url()).searchParams.get('page')).toBe('1');
    const all = JSON.parse(new URL(page.url()).searchParams.get('search_fields')!);
    expect(all).toContain(field);
    expect(all.length).toBe(options.length - 1);
    await search.locator('.dropdown-toggle').click();
    await search.getByRole('checkbox', { name: 'All', exact: true }).uncheck();
    await search
      .getByRole('checkbox', { name: resource === 'roles' ? 'Role' : 'Email', exact: true })
      .check();
    await page.keyboard.press('Escape');
    await search.locator('button[type=submit]').click();
    await expect(page.getByRole('table')).toHaveAttribute('aria-busy', 'false');
    await expect(page).toHaveURL(
      (url) =>
        JSON.stringify(JSON.parse(url.searchParams.get('search_fields') ?? '[]')) ===
        JSON.stringify([field]),
    );
    await page.reload();
    await expect(search.getByRole('searchbox')).toHaveValue(keyword.toUpperCase());
    await expect(search.locator('.dropdown-toggle')).toHaveText('');
    const activeTitle = resource === 'roles' || resource === 'users' ? 'Active' : 'Active';
    await page.getByRole('button', { name: `Sort and filter ${activeTitle}`, exact: true }).click();
    await page.getByRole('combobox', { name: 'Active: Value', exact: true }).selectOption('false');
    await page.keyboard.press('Escape');
    await expect(page.locator('tbody tr')).toHaveCount(0);
    await expect(
      page.getByRole('status').filter({ hasText: 'No matching records.' }),
    ).toBeVisible();
    expect(new URL(page.url()).searchParams.get('search')).toBe(keyword.toUpperCase());
    await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
    await expect(page.locator('tbody tr')).toHaveCount(1);
    await input.fill('');
    await input.press('Enter');
    await expect(page.locator('tbody tr')).toHaveCount(6);
    expect(new URL(page.url()).searchParams.has('search')).toBe(false);
    expect(await page.locator('tbody').innerText()).toBe(initialRows);
  });
}

for (const width of [320, 820, 1440]) {
  test(`search fits at ${width}px with content, scope, then icon`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const search = await open(page, 'users');
    const bounds = await search.boundingBox();
    const input = await search.getByRole('searchbox').boundingBox();
    const select = await search.locator('.dropdown-toggle').boundingBox();
    const button = await search.locator('button[type=submit]').boundingBox();
    expect(bounds!.width).toBeLessThanOrEqual(360);
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    expect(input!.x).toBeLessThan(select!.x);
    expect(select!.x).toBeLessThan(button!.x);
    expect(input!.width).toBeGreaterThan(40);
    expect(select!.width).toBeLessThanOrEqual(64);
    expect(select!.width).toBeGreaterThanOrEqual(44);
    await expect(search.getByRole('searchbox')).toHaveAttribute('placeholder', 'Search...');
    expect(
      await page.locator('body').evaluate((body) => body.scrollWidth - body.clientWidth),
    ).toBeLessThanOrEqual(1);
    await search.screenshot({ path: info.outputPath(`search-${width}.png`) });
    await page.screenshot({ path: info.outputPath(`table-${width}.png`) });
  });
}

for (const locale of ['zh-Hant', 'zh-Hans']) {
  test(`${locale} search copy is localized and literal percent is not a wildcard`, async ({
    page,
  }) => {
    const search = await open(page, 'roles', locale);
    const placeholder = locale === 'zh-Hant' ? '搜尋...' : '搜索...';
    await expect(search.getByRole('searchbox')).toHaveAttribute('placeholder', placeholder);
    await search.locator('.dropdown-toggle').click();
    await search.getByRole('checkbox', { name: '全部', exact: true }).uncheck();
    await search.getByRole('checkbox', { name: 'Role', exact: true }).check();
    await page.keyboard.press('Escape');
    await search.getByRole('searchbox').fill('%');
    await search.locator('button[type=submit]').click();
    await expect(page.locator('tbody tr')).toHaveCount(1);
    await expect(page.locator('tbody tr')).toContainText('rate%reviewer');
  });
}
