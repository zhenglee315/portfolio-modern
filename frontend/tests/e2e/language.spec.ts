import { expect, test } from '@playwright/test';
import { endpointFixture } from '../fixtures/portfolio';

test('later locale selection cancels a slow preparation and commits only the latest choice', async ({
  page,
}) => {
  await page.route('**/api/portfolio/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('locale') === 'zh-Hans')
      await new Promise((resolve) => setTimeout(resolve, 800));
    try {
      await route.fulfill({ json: endpointFixture(url) });
    } catch {
      /* A superseded read is canceled. */
    }
  });
  await page.goto('/en?source=latest#overview');
  const trigger = page.getByRole('button', { name: 'Change language' });
  await trigger.click();
  await page.getByRole('button', { name: '简体中文', exact: true }).click();
  await expect(trigger).toHaveAttribute('aria-busy', 'true');
  await trigger.click();
  await page.getByRole('button', { name: '繁體中文', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-Hant');
  await expect(page).toHaveURL(/\/zh-Hant\?source=latest#overview$/);
  await expect(page.locator('#projects')).toContainText('zh-Hant Project 1');
});

test('language changes preserve project pages and an open detail ID', async ({ page }) => {
  await page.route('**/api/portfolio/**', (route) =>
    route.fulfill({ json: endpointFixture(new URL(route.request().url())) }),
  );
  await page.goto('/en?source=language#projects');
  const section = page.locator('#projects');
  await expect(section.locator('[data-project-id]')).toHaveCount(6);
  await section.getByRole('button', { name: /Show more projects/ }).click();
  await expect(section.locator('[data-project-id]')).toHaveCount(12);
  await section.getByRole('button', { name: 'Read about en Project 8' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Change language' }).click();
  await page.getByRole('button', { name: '繁體中文', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-Hant');
  await expect(page).toHaveURL(/\/zh-Hant\?source=language#projects$/);
  await expect(dialog.getByRole('heading', { name: 'zh-Hant Project 8' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(section.locator('[data-project-id]')).toHaveCount(12);
});

test('failed language preparation retains the visible language and URL', async ({ page }) => {
  await page.route('**/api/portfolio/**', (route) => {
    const url = new URL(route.request().url());
    return url.searchParams.get('locale') === 'zh-Hant'
      ? route.fulfill({ status: 503, json: { detail: 'UNAVAILABLE' } })
      : route.fulfill({ json: endpointFixture(url) });
  });
  await page.goto('/en');
  await page.getByRole('button', { name: 'Change language' }).click();
  await page.getByRole('button', { name: '繁體中文', exact: true }).click();
  await expect(
    page.getByText('Could not change language. Your current content is preserved.'),
  ).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page).toHaveURL(/\/en(?:#.*)?$/);
});
