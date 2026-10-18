import { expect } from '@playwright/test';
import { runtimeTest as test } from '../fixtures/browser';
for (const resource of ['sites', 'users', 'roles'])
  for (const locale of ['en', 'zh-Hant'])
    for (const width of [320, 375, 390, 480, 640, 768, 820, 1024, 1280, 1440, 1920, 2560]) {
      test(`${resource} ${locale} table and edit dialog fit ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
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
              is_monitor: true,
              is_manage_sites: true,
              is_manage_users: true,
              is_manage_roles: true,
            },
          }),
        );
        await page.goto(`/${locale}/management/${resource}`);
        const owner = page.locator(`[data-management-resource="${resource}"]`);
        await expect(owner.locator('tbody tr')).toHaveCount(6);
        expect(
          await page.evaluate(() =>
            Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
          ),
        ).toBeLessThanOrEqual(width);
        const scroll = owner.locator('.table-responsive');
        await expect(scroll).toHaveCSS('overflow-x', 'auto');
        const action = owner.locator('tbody tr').first().locator('button[value="edit"]');
        await action.scrollIntoViewIfNeeded();
        await expect(action).toBeInViewport();
        const button = (await action.boundingBox())!;
        expect(button.width).toBeGreaterThanOrEqual(width <= 760 ? 44 : 28);
        expect(button.height).toBeGreaterThanOrEqual(width <= 760 ? 44 : 36);
        await action.click();
        const dialog = page.getByRole('dialog');
        await expect(dialog).toBeVisible();
        const bounds = (await dialog.locator('.modal-content').boundingBox())!;
        expect(bounds.x).toBeGreaterThanOrEqual(0);
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(width + 1);
        await expect(dialog.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
        await page.keyboard.press('Escape');
        await expect(dialog).toHaveCount(0);
        await expect(action).toBeFocused();
      });
    }
