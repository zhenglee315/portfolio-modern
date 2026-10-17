import { expect, test, type Page } from '@playwright/test';
const admin = {
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
};
async function setup(page: Page, theme = 'mint') {
  await page.context().addCookies([
    {
      name: 'portfolio-appearance',
      value: encodeURIComponent(JSON.stringify({ theme, paused: true })),
      url: 'http://127.0.0.1:4173',
    },
  ]);
  await page.route('**/api/authority/session', (r) => r.fulfill({ json: admin }));
}
for (const { width, locale, theme } of [
  { width: 390, locale: 'en', theme: 'mint' },
  { width: 820, locale: 'en', theme: 'blue' },
  { width: 1440, locale: 'en', theme: 'mint' },
  { width: 2560, locale: 'en', theme: 'mint' },
  { width: 390, locale: 'zh-Hant', theme: 'mist' },
]) {
  test(`embedded portfolio previews preserve management at ${width}px ${locale} ${theme}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await setup(page, theme);
    const errors: string[] = [];
    const requests: { url: string; method: string }[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('request', (r) => {
      if (new URL(r.url()).pathname.startsWith('/api/'))
        requests.push({ url: r.url(), method: r.method() });
    });
    await page.goto(`/${locale}/management/sites`);
    const owner = page.locator('[data-management-resource=sites]');
    await expect(owner.locator('tbody tr')).toHaveCount(6);
    const row = owner.locator('tbody tr').first();
    await expect(row.locator('button[value]')).toHaveCount(3);
    expect(
      await row
        .locator('button[value]')
        .evaluateAll((ns) => ns.map((n) => n.getAttribute('value'))),
    ).toEqual(['preview', 'edit', 'delete']);
    const before = page.url();
    const rows = await owner.locator('tbody').innerText();
    const eye = row.locator('button[value=preview]');
    await eye.click();
    const modal = page.getByRole('dialog');
    await expect(modal.locator('iframe')).toHaveAttribute(
      'src',
      `/${locale}/management/preview/114`,
    );
    const frame = page.frameLocator('iframe');
    await expect(frame.locator('[data-portfolio-site="114"]')).toBeVisible();
    await expect(frame.locator('h1')).toContainText('Operator');
    await expect(
      frame.locator('aside,nav,[data-account-menu-trigger],#mobile-navigation'),
    ).toHaveCount(0);
    await expect(frame.locator('[data-background-field]')).toHaveCount(1);
    await expect(modal.locator('.modal-dialog')).toHaveCSS('transform', 'none');
    const bounds = (await modal.locator('.modal-content').boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width + 1);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(901);
    if (width <= 760) {
      expect(bounds.width).toBeGreaterThan(width - 45);
    } else {
      expect(bounds.width).toBeLessThanOrEqual(1440);
      expect(bounds.x).toBeGreaterThanOrEqual(width * 0.04);
      expect(bounds.height).toBeLessThanOrEqual(800);
      expect(bounds.y).toBeGreaterThan(40);
    }
    await modal.screenshot({ path: test.info().outputPath(`preview-${width}-${locale}.png`) });
    const sections = ['journey', 'experience', 'projects', 'skills'];
    for (const id of sections) {
      await frame.locator(`#${id}`).scrollIntoViewIfNeeded();
      await expect(frame.locator(`#${id}`)).toBeVisible();
    }
    await expect(frame.locator('[data-skill-categories]')).toBeVisible();
    await frame.locator('#projects').scrollIntoViewIfNeeded();
    const detail = frame.locator('#projects button[aria-label]').first();
    await expect(detail).toBeVisible();
    {
      await detail.click();
      await expect(frame.getByRole('dialog')).toBeVisible();
      await frame.getByRole('dialog').press('Escape');
      await expect(frame.getByRole('dialog')).toHaveCount(0);
      await expect(modal).toBeVisible();
    }
    await frame.locator('#projects').scrollIntoViewIfNeeded();
    const more = frame.getByRole('button', { name: 'Show more projects', exact: true });
    if (locale === 'en' && (await more.count())) {
      await more.click();
      await expect
        .poll(() =>
          requests.some(
            (r) =>
              r.url.includes('/management/preview/projects') &&
              new URL(r.url).searchParams.get('page') === '2',
          ),
        )
        .toBe(true);
    }
    expect(page.url()).toBe(before);
    expect(
      requests.filter(
        (r) => r.url.includes('/portfolio/') && !r.url.includes('/management/preview/'),
      ),
    ).toEqual([]);
    const previews = requests.filter((r) => r.url.includes('/management/preview/'));
    expect(previews.length).toBeGreaterThanOrEqual(5);
    expect(previews.every((r) => new URL(r.url).searchParams.get('site_id') === '114')).toBe(true);
    expect(requests.some((r) => r.url.includes('/system/heartbeat'))).toBe(false);
    expect(requests.every((r) => r.method === 'GET')).toBe(true);
    await frame.locator('body').press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(eye).toBeFocused();
    expect(page.url()).toBe(before);
    expect(await owner.locator('tbody').innerText()).toBe(rows);
    await owner.locator('tbody tr').nth(1).locator('button[value=preview]').click();
    await expect(page.frameLocator('iframe').locator('h1')).toContainText('Avery');
    await page.getByRole('dialog').locator('.modal-header button').click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}
test('users/roles have no portfolio preview and missing sites cannot fall back', async ({
  page,
}) => {
  await setup(page);
  for (const resource of ['users', 'roles']) {
    await page.goto(`/en/management/${resource}`);
    await expect(page.locator('tbody tr')).toHaveCount(6);
    await expect(page.locator('button[value=preview]')).toHaveCount(0);
  }
  await page.goto('/en/management/sites?page=2');
  await expect(page.locator('tbody tr')).toHaveCount(6);
  const rows = page.locator('tbody tr').filter({ hasText: 'no_site' });
  await expect(rows.locator('button[value=preview]')).toBeDisabled();
});
test('embedded route denies permissions before reading preview data', async ({ page }) => {
  await setup(page);
  await page.route('**/api/authority/session', (r) =>
    r.fulfill({ json: { ...admin, is_manage_sites: false } }),
  );
  const reads: string[] = [];
  page.on('request', (r) => {
    if (new URL(r.url()).pathname.startsWith('/api/management/preview/')) reads.push(r.url());
  });
  await page.goto('/en/management/preview/114');
  await expect(
    page.getByText('Portfolio preview requires platform management permission.'),
  ).toBeVisible();
  expect(reads).toEqual([]);
});
