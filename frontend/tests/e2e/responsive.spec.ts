import { expect, test } from '@playwright/test';

for (const locale of ['en', 'zh-Hans', 'zh-Hant']) {
  test(`${locale} stays within the viewport across mobile, tablet and 4K widths`, async ({
    page,
  }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    for (const width of [320, 360, 390, 760, 761, 1024, 1150, 1440, 1700, 3840]) {
      await page.setViewportSize({ width, height: width > 2000 ? 2160 : 900 });
      await page.goto(`/${locale}`);
      await expect(page.locator('h1')).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
      ).toBeLessThanOrEqual(1);
      await expect(page.locator('[data-project-id]')).toHaveCount(6);
      if (locale === 'zh-Hant' && [390, 1440, 3840].includes(width))
        await page.screenshot({
          path: testInfo.outputPath(`profile-${width}.png`),
          fullPage: true,
        });
    }
    expect(errors).toEqual([]);
  });
}

test('static content remains readable without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  for (const path of ['/', '/en', '/zh-Hans', '/zh-Hant']) {
    await page.goto(`http://127.0.0.1:4173${path}`);
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('[data-project-id]')).toHaveCount(6);
    await expect(page.locator('[data-experience-id]')).toHaveCount(6);
    await expect(page.locator('[data-category-id]')).toHaveCount(7);
  }
  await context.close();
});
