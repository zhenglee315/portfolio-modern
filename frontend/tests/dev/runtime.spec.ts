import { expect } from '@playwright/test';
import { runtimeTest as test } from '../fixtures/browser';

for (const [path, language] of [
  ['/', 'en'],
  ['/en', 'en'],
  ['/zh-Hans', 'zh-Hans'],
  ['/zh-Hant', 'zh-Hant'],
]) {
  test(`${path} renders and hydrates through the development module runner`, async ({
    page,
    request,
  }) => {
    const response = await request.get(path!);
    expect(response.status()).toBe(200);
    const html = await response.text();
    expect(html).toContain(`<html lang="${language}"`);
    expect(html).toContain('data-profile-content');
    expect(html).not.toContain('exports is not defined');
    await page.goto(path!);
    await expect(page.locator('html')).toHaveAttribute('lang', language!);
    await expect(page.locator('h1[data-profile-content]')).toBeVisible();
    await expect(page.locator('.icon svg').first()).toBeVisible();
    await expect(page.locator('[data-project-id]')).toHaveCount(6);
    await page.waitForLoadState('networkidle');
  });
}

test('development Dropdowns update appearance and change language after hydration', async ({
  page,
}) => {
  await page.goto('/en');
  const appearance = page.getByRole('button', { name: 'Background settings' });
  await appearance.click();
  await page.getByRole('button', { name: 'Amber', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'amber');
  await expect(page.getByRole('slider', { name: 'Blink frequency' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(appearance).toBeFocused();
  await page.getByRole('button', { name: 'Change language' }).click();
  await page.getByRole('button', { name: '繁體中文', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-Hant');
  await expect(page).toHaveURL(/\/zh-Hant(?:#.*)?$/);
  await expect(page.locator('#projects')).toContainText('zh-Hant Project 1');
});

test('development Offcanvas opens and restores its trigger on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/en');
  const trigger = page.getByRole('button', { name: 'Open navigation' });
  await trigger.click();
  const drawer = page.getByRole('dialog', { name: 'Main navigation' });
  await expect(drawer).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(drawer).not.toBeVisible();
  await expect(trigger).toBeFocused();
});

test('development lazy Modal and API pagination reuse project list data', async ({ page }) => {
  await page.goto('/en#projects');
  const section = page.locator('#projects');
  await section.getByRole('button', { name: /Show more projects/ }).click();
  await expect(section.locator('[data-project-id]')).toHaveCount(12);
  const trigger = section.getByRole('button', { name: 'Read about en Project 8' });
  await trigger.click();
  const dialog = page.locator('[role="dialog"][aria-modal="true"]');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Typed boundaries.')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
});
