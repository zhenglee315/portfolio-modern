import { expect, test } from '@playwright/test';

test('bounded decoration pauses and startup contact yields to manual interaction', async ({
  page,
}) => {
  await page.goto('/en');
  const field = page.locator('[data-background-field]');
  await expect(field).toBeVisible();
  await expect.poll(() => field.locator('path').count()).toBeGreaterThan(1);
  await expect(page.locator('[data-entering]')).toHaveCount(0);
  expect(await field.locator('path').count()).toBeLessThanOrEqual(401);
  await page.mouse.move(900, 250);
  await expect(page.locator('[data-pointer-glow]')).toHaveAttribute('data-visible', 'true');
  await expect(page.locator('[data-contact-bubble]')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Background settings' }).click();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(page.locator('[data-pointer-glow]')).not.toHaveAttribute('data-visible', 'true');
  await expect
    .poll(() => field.evaluate((node) => node.getAnimations({ subtree: true }).length))
    .toBe(0);
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-contact-bubble]')).toHaveCount(0);
  await expect(page.locator('main')).toBeVisible();
});
