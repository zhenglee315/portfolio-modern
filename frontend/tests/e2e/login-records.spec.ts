import { readFileSync } from 'node:fs';
const messages = Object.fromEntries(
  ['en', 'zh-Hans', 'zh-Hant'].map((locale) => [
    locale,
    JSON.parse(
      readFileSync(new URL(`../../src/i18n/messages/${locale}.json`, import.meta.url), 'utf8'),
    ),
  ]),
);
import { expect, test, type Page } from '@playwright/test';

async function openHistory(page: Page, width: number, theme = 'mint', locale = 'en') {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.context().addCookies([
    {
      name: 'portfolio-appearance',
      value: encodeURIComponent(JSON.stringify({ theme, paused: true })),
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
        is_manage_sites: true,
        is_manage_users: true,
        is_manage_roles: true,
      },
    }),
  );
  const calls: URL[] = [];
  await page.route('**/api/management/login-records?**', async (route) => {
    const url = new URL(route.request().url());
    calls.push(url);
    const userId = Number(url.searchParams.get('user_id'));
    let rows = Array.from({ length: 9 }, (_, index) => ({
      id: 19 - index,
      user_id: userId,
      email: `audit-${userId}@example.com`,
      logintime: `2026-10-${String(19 - index).padStart(2, '0')}T12:00:00Z`,
      ip_address:
        index === 5 ? null : index % 2 ? '2001:218:ffff:ffff:ffff:ffff:ffff:ffff' : '81.2.69.142',
      country_code: index === 5 ? null : 'GB',
      region: index === 5 ? null : 'England',
      city: index === 5 ? null : index % 2 ? 'Manchester' : 'London',
      geo_status: index === 5 ? 'unknown' : 'resolved',
      is_online: index % 2 === 0,
    }));
    const term = url.searchParams.get('search');
    if (term) rows = rows.filter((row) => row.city?.toLowerCase().includes(term.toLowerCase()));
    if (url.searchParams.get('sort') === 'logintime:asc') rows.reverse();
    const pageNumber = Number(url.searchParams.get('page') ?? 1),
      size = Number(url.searchParams.get('size') ?? 6);
    await new Promise((resolve) => setTimeout(resolve, 100));
    await route.fulfill({
      json: {
        items: rows.slice((pageNumber - 1) * size, pageNumber * size),
        total: rows.length,
        pages: Math.ceil(rows.length / size),
        page: pageNumber,
        size,
      },
    });
  });
  await page.goto(`/${locale}/management/users`);
  await expect(page.locator('tbody tr')).toHaveCount(6);
  const original = page.url();
  const trigger = page
    .getByRole('button', {
      name: new RegExp(
        '^' +
          messages[locale as keyof typeof messages].management.loginHistory.open.split(
            '{{name}}',
          )[0],
      ),
    })
    .first();
  await trigger.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('tbody tr')).toHaveCount(6);
  await expect(dialog.getByRole('table')).toHaveAttribute('aria-busy', 'false');
  const copy = messages[locale as keyof typeof messages].management;
  await dialog.getByRole('button', { name: copy.columns, exact: true }).click();
  await dialog
    .getByRole('checkbox', { name: copy.loginHistory.fields.geo_status, exact: true })
    .check();
  await page.keyboard.press('Escape');
  return { dialog, trigger, original, calls, errors };
}

for (const width of [320, 390, 820, 1440, 2560]) {
  test(`private login history fits ${width}px and keeps background controls unchanged`, async ({
    page,
  }, info) => {
    const { dialog, trigger, original, calls, errors } = await openHistory(page, width);
    await expect(dialog.getByRole('heading', { name: 'Login history' })).toBeVisible();
    await expect(dialog.getByText('Unknown', { exact: true })).toBeVisible();
    const bounds = await dialog.locator('.modal-content').boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width + 1);
    expect(
      await page.locator('body').evaluate((el) => el.scrollWidth - el.clientWidth),
    ).toBeLessThanOrEqual(1);
    await dialog.getByRole('button', { name: 'Next page', exact: true }).click();
    await expect(dialog.locator('tbody tr')).toHaveCount(3);
    expect(calls.at(-1)!.searchParams.get('page')).toBe('2');
    expect(
      calls.every(
        (url) => url.searchParams.get('user_id') === calls[0]!.searchParams.get('user_id'),
      ),
    ).toBe(true);
    expect(page.url()).toBe(original);
    await page.screenshot({ path: info.outputPath(`history-${width}.png`) });
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect(page.locator('tbody tr')).toHaveCount(6);
    expect(errors).toEqual([]);
  });
}

for (const theme of ['blue', 'amber', 'mist']) {
  test(`history uses shared themed controls in ${theme}`, async ({ page }, info) => {
    const { dialog, errors } = await openHistory(page, 820, theme);
    const search = dialog.locator('[data-table-search]');
    await search.locator('.dropdown-toggle').click();
    const menu = dialog.locator('.dropdown-menu.show');
    await expect(menu.getByRole('checkbox', { name: 'All', exact: true })).toBeVisible();
    await expect(menu.getByRole('checkbox', { name: 'Country', exact: true })).toBeChecked();
    const bounds = await menu.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(820);
    await page.screenshot({ path: info.outputPath(`history-${theme}.png`) });
    expect(errors).toEqual([]);
  });
}

test('history search, sort and page size use server controls without changing the parent URL', async ({
  page,
}) => {
  const { dialog, original, calls } = await openHistory(page, 1440);
  const search = dialog.getByRole('searchbox');
  await search.fill('London');
  await search.press('Enter');
  await expect(dialog.locator('tbody tr')).toHaveCount(5);
  expect(calls.at(-1)!.searchParams.get('search')).toBe('London');
  await search.fill('');
  await search.press('Enter');
  await expect(dialog.locator('tbody tr')).toHaveCount(6);
  await dialog.getByRole('button', { name: 'Sort Time ascending', exact: true }).click();
  await expect.poll(() => calls.at(-1)!.searchParams.get('sort')).toBe('logintime:asc');
  await expect(dialog.locator('tbody tr').first().locator('time')).toHaveText(
    '2026.10.11 12:00:00',
  );
  await dialog.getByRole('combobox', { name: 'Rows per page', exact: true }).selectOption('10');
  await expect(dialog.locator('tbody tr')).toHaveCount(9);
  expect(page.url()).toBe(original);
});

for (const locale of ['zh-Hant', 'zh-Hans']) {
  test(`history copy is translated in ${locale}`, async ({ page }) => {
    const { dialog, errors } = await openHistory(page, 390, 'mint', locale);
    await expect(
      dialog.getByRole('heading', { name: locale === 'zh-Hant' ? '登入紀錄' : '登录记录' }),
    ).toBeVisible();
    await expect(dialog.getByText('未知', { exact: true })).toBeVisible();
    expect(await dialog.innerText()).not.toContain('management.loginHistory');
    expect(errors).toEqual([]);
  });
}
