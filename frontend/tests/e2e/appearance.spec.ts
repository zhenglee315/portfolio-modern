import { expect, test } from '@playwright/test';

test('all four palettes survive reload and blocked storage retains usable defaults', async ({
  page,
  context,
}) => {
  for (const theme of ['mint', 'blue', 'amber', 'mist']) {
    await context.addCookies([
      {
        name: 'portfolio-appearance',
        value: encodeURIComponent(JSON.stringify({ theme })),
        url: 'http://127.0.0.1:4173',
      },
    ]);
    await page.goto('/zh-Hant');
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await expect(page.locator('h1')).toBeVisible();
  }
  await context.clearCookies();
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new DOMException('Blocked', 'SecurityError');
      },
    });
  });
  await page.reload();
  await expect(page.locator('h1')).toBeVisible();
  await page.getByRole('button', { name: '背景設定' }).click();
  await expect(page.getByRole('slider').first()).toBeVisible();
});

test('palette, ranges, pause and reset persist without losing keyboard controls', async ({
  page,
}) => {
  await page.goto('/en');
  const trigger = page.getByRole('button', { name: 'Background settings' });
  await trigger.click();
  await page.getByRole('button', { name: 'Amber', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'amber');
  const speed = page.getByRole('slider', { name: 'Blink frequency' });
  await speed.focus();
  await page.keyboard.press('ArrowRight');
  await expect(speed).toHaveValue('1.1');
  await expect(speed).toBeFocused();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-motion-paused', 'true');
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'amber');
  await trigger.click();
  await expect(speed).toHaveValue('1.1');
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'mist');
  await expect(speed).toHaveValue('1');
});
