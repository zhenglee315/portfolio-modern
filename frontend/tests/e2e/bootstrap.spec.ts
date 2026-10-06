import { expect, test } from '@playwright/test';

for (const [path, language] of [
  ['/', 'en'],
  ['/en', 'en'],
  ['/zh-Hans', 'zh-Hans'],
  ['/zh-Hant', 'zh-Hant'],
]) {
  test(`${path} delivers localized fixture content and hydrates its query snapshot`, async ({
    page,
    request,
  }) => {
    const response = await request.get(path!);
    expect(response.ok()).toBe(true);
    const html = await response.text();
    expect(html).toContain(`<html lang="${language}"`);
    expect(html).toMatch(/<h1[^>]*>.+<\/h1>/);
    expect(html).toContain('data-project-id');
    expect(html).toContain('data-experience-id');
    expect(html).toContain('data-category-id');
    expect(html).not.toContain('<title>Personal profile</title>');
    expect(html).toContain('rel="canonical"');
    expect(html).toContain('hrefLang="zh-Hant"');
    const errors: string[] = [];
    const siteRequests: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => {
      if (request.url().includes('/api/portfolio/site')) siteRequests.push(request.url());
    });
    await page.goto(path!);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', language!);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'mist');
    await expect(page.locator('.icon svg').first()).toBeVisible();
    expect(siteRequests).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test('unsupported language shows a safe route error after hydration', async ({ page }) => {
  await page.goto('/fr');
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
});
