import { expect } from '@playwright/test';
import { openAuthControls, runtimeTest as test } from '../fixtures/browser';

test('retained standalone controls keep focus, geometry, cyclic locale keys and theme behavior', async ({
  page,
}) => {
  await openAuthControls(page);
  const theme = page.getByRole('button', { name: 'Background settings', exact: true });
  await theme.click();
  const panel = page.locator('.dropdown-menu.show').filter({ has: page.getByRole('slider') });
  await expect(panel.getByRole('slider').first()).toBeFocused();
  await expect(panel).toHaveCSS('padding', '18px');
  await panel.locator('[data-theme-option="mint"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'mint');
  await expect(panel).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(theme).toBeFocused();
  const language = page.getByRole('button', { name: 'Change language', exact: true });
  await language.click();
  const languages = page.locator('.dropdown-menu.show');
  await expect(languages).toHaveCSS('padding', '6px');
  await expect(languages).toHaveCSS('min-width', '170px');
  await expect(languages.locator('[data-locale="en"]')).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(languages.locator('[data-locale="zh-Hant"]')).toBeFocused();
  await expect(languages.locator('[data-locale="en"] .icon')).toHaveCSS('visibility', 'visible');
  await languages.locator('[data-locale="zh-Hant"]').click();
  await expect(page).toHaveURL(/\/zh-Hant\?view=login$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-Hant');
  await expect(page.locator('[data-auth-panel]')).toBeVisible();
});

test('short landscape gear controls scroll and keep reset accessible', async ({ page }) => {
  await page.setViewportSize({ width: 760, height: 390 });
  await page.goto('/en');
  await page.locator('[data-account-menu-trigger]').click();
  await page.locator('[data-account-menu-item="theme"]').click();
  const panel = page.locator('[data-account-menu]');
  await expect(panel).toHaveCSS('max-height', '210px');
  await expect(panel).toHaveCSS('overflow-y', 'auto');
  const bounds = await panel.boundingBox();
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(390);
  await panel.locator('[data-theme-option="amber"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'amber');
  await panel.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'mist');
  await expect(panel).toBeVisible();
});
