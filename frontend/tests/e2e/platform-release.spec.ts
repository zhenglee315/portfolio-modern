import { expect } from '@playwright/test';
import { runtimeTest as test } from '../fixtures/browser';
import { readFileSync } from 'node:fs';
const [en, hant, hans] = ['en', 'zh-Hant', 'zh-Hans'].map((locale) =>
  JSON.parse(
    readFileSync(new URL(`../../src/i18n/messages/${locale}.json`, import.meta.url), 'utf8'),
  ),
);

for (const [locale, messages, scope] of [
  ['en', en, 'Current page'],
  ['zh-Hant', hant, '目前頁面'],
  ['zh-Hans', hans, '当前页面'],
] as const) {
  for (const width of [320, 390, 1440]) {
    test(`Platform export has compact ${locale} scope and fits ${width}px`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.route('**/api/authority/session', (route) =>
        route.fulfill({
          json: {
            id: 91,
            user: 'operator',
            email: 'operator@example.com',
            role: 'manager',
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
      await page.goto(`/${locale}/management/sites`);
      await expect(page.locator('tbody tr')).toHaveCount(6);
      const table = page.locator('[data-management-resource="sites"]');
      await table
        .getByRole('button', { name: messages.management.export.label, exact: true })
        .click();
      const menu = page.locator('.dropdown-menu.show');
      await expect(menu.getByText(scope, { exact: true })).toBeVisible();
      const bounds = (await menu.boundingBox())!;
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
      for (const action of ['copy', 'excel', 'csv', 'print'] as const)
        await expect(
          menu.getByText(messages.management.export[action], { exact: true }),
        ).toBeVisible();
      if (locale === 'en' && width === 320)
        await page.screenshot({ path: info.outputPath('platform-export-320.png') });
    });
  }
}
