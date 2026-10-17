import { expect, test } from '@playwright/test';

test('keyboard skip enters overview without traversing the navigation rail', async ({ page }) => {
  await page.goto('/en');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#overview')).toBeFocused();
});

test('desktop rail, legacy hashes and query strings share one navigation model', async ({
  page,
}) => {
  await page.goto('/en?source=example#stack');
  await expect(page.locator('aside nav a[aria-current="location"]')).toHaveAttribute(
    'href',
    '#skills',
  );
  await expect(page).toHaveURL(/source=example#skills$/);
  await page.getByRole('button', { name: 'Collapse sidebar' }).click();
  const overview = page.locator('aside nav a[href="#overview"]');
  await overview.focus();
  const tooltip = page.getByRole('tooltip', { name: 'Overview' });
  await expect(tooltip).toBeVisible();
  await expect(overview).toHaveAttribute('aria-describedby', (await tooltip.getAttribute('id'))!);
  await overview.click();
  await expect(page).toHaveURL(/source=example#overview$/);
  await page.goBack();
  await expect(page).toHaveURL(/#skills$/);
});

test('mobile drawer traps focus and restores its trigger after Escape', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/en');
  const trigger = page.getByRole('button', { name: 'Open navigation' });
  await trigger.click();
  const drawer = page.getByRole('dialog', { name: 'Main navigation' });
  await expect(drawer).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(drawer).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await drawer.getByRole('link', { name: 'Experience', exact: true }).click();
  await expect(drawer).not.toBeVisible();
  await expect(page).toHaveURL(/#experience$/);
});
