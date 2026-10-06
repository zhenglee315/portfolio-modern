import { expect, test } from '@playwright/test';

const locales = [
  { path: '/', language: 'en', title: 'Personal profile' },
  { path: '/en', language: 'en', title: 'Personal profile' },
  { path: '/zh-Hans', language: 'zh-Hans', title: '个人档案' },
  { path: '/zh-Hant', language: 'zh-Hant', title: '個人檔案' },
];

for (const { path, language, title } of locales) {
  test(`${path} delivers localized HTML and hydrates with styles and an icon`, async ({
    page,
    request,
  }) => {
    const response = await request.get(path);
    expect(response.ok()).toBe(true);
    const html = await response.text();
    expect(html).toContain(`<html lang="${language}"`);
    expect(html).toContain(`<title>${title}</title>`);
    expect(html).toContain(title);

    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', language);
    await expect(page.getByRole('main')).toHaveCSS('padding-top', '48px');
    await expect(page.locator('main img')).toHaveJSProperty('complete', true);
    await expect(page.locator('main img')).toHaveJSProperty('naturalWidth', 16);
    await expect(page).toHaveTitle(title);
    expect(errors).toEqual([]);
  });
}

test('unsupported language shows the route error after browser hydration', async ({ page }) => {
  await page.goto('/fr');
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Personal profile' })).toHaveCount(0);
});
