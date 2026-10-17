import { test, expect } from '@playwright/test';
for (const [width, height, theme] of [
  [390, 844, 'mint'],
  [844, 390, 'mist'],
  [820, 1180, 'blue'],
  [1180, 820, 'amber'],
] as const) {
  for (const resource of ['sites', 'users', 'roles'])
    test(`${resource} touch controls and dialogs fit ${width}x${height} ${theme}`, async ({
      page,
      context,
    }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await context.addCookies([
        {
          name: 'portfolio-appearance',
          value: encodeURIComponent(JSON.stringify({ theme })),
          url: 'http://127.0.0.1:4173',
        },
      ]);
      await page.setViewportSize({ width, height });
      await page.route('**/api/authority/session', (route) =>
        route.fulfill({
          json: {
            id: 91,
            user: 'operator',
            email: 'operator@example.com',
            role: 'custom',
            is_create: false,
            is_read: false,
            is_update: false,
            is_delete: false,
            is_manage_sites: true,
            is_manage_users: true,
            is_manage_roles: true,
          },
        }),
      );
      await page.goto(`/en/management/${resource}`);
      const owner = page.locator(`[data-management-resource="${resource}"]`);
      await expect(owner.locator('tbody tr')).toHaveCount(6);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        width,
      );
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const action = owner.locator('tbody tr').first().locator('button[value=edit]');
      await action.scrollIntoViewIfNeeded();
      const target = await action.boundingBox();
      expect(target!.width).toBeGreaterThanOrEqual(44);
      expect(target!.height).toBeGreaterThanOrEqual(44);
      await action.click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      const bounds = await dialog.locator('.modal-content').boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width + 1);
      expect(bounds!.y).toBeGreaterThanOrEqual(0);
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(height + 1);
      await expect(dialog.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      await expect(action).toBeFocused();
      await owner.getByRole('button', { name: 'Sort and filter Updated', exact: true }).click();
      const menu = page.locator('.dropdown-menu.show');
      await expect(menu.locator('input[type=date]')).toBeVisible();
      const box = await menu.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.y + box!.height).toBeLessThanOrEqual(height + 1);
      await page.keyboard.press('Escape');
      expect(errors).toEqual([]);
      await page.screenshot({ path: test.info().outputPath('touch-management.png') });
    });
}
