import { expect, test } from '@playwright/test';

test('lazy atlas markers, keyboard popup and destination selection remain usable', async ({
  page,
}) => {
  await page.goto('/en#journey');
  const map = page.locator('#journey svg[role="group"]');
  await expect(map).toBeVisible();
  await expect(map.locator('[data-stop]')).toHaveCount(3);
  const marker = map.locator('[data-stop="2"]');
  await marker.focus();
  await page.keyboard.press('Enter');
  await expect(marker).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('tooltip')).toContainText('Bengaluru');
  await page.getByRole('button', { name: 'Close city information' }).click();
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  await expect(marker).toBeFocused();
  await page.locator('#journey button[data-id="3"]').click();
  await expect(map.locator('[data-stop="3"]')).toHaveAttribute('aria-pressed', 'true');
});

test('visible playback advances, manual selection pauses and reduced motion stays still', async ({
  page,
}) => {
  await page.clock.install();
  await page.goto('/en#journey');
  const panel = page.locator('[data-playback-phase]');
  await expect(panel).toBeVisible();
  await page.getByRole('button', { name: 'Restart journey' }).click();
  await page.clock.runFor(7400);
  await expect(page.locator('#journey [data-stop="2"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#journey button[data-id="3"]').click();
  await expect(panel).toHaveAttribute('data-playback-phase', 'paused');
  await page.clock.runFor(5000);
  await expect(page.locator('#journey [data-stop="3"]')).toHaveAttribute('aria-pressed', 'true');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: 'Restart journey' }).click();
  await expect(page.getByRole('button', { name: 'Play journey' })).toBeDisabled();
  await expect(panel).toHaveAttribute('data-playback-phase', 'paused');
});
