import { expect } from '@playwright/test';
import { runtimeTest as test } from '../fixtures/browser';

/** Verify the old atlas's visible final destination and its independently pausable paint. */
test('journey retains destination coordinates, caption and country breathing', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/en#journey');
  const journey = page.locator('#journey');
  const map = journey.locator('svg[role="group"]');
  await expect(map).toBeVisible();
  await expect(journey.locator('[data-map-coordinates]')).toHaveText(
    '25.0300° N   121.5600° ETAIPEI / NEXT CHAPTER',
  );
  await expect(journey.locator('[data-map-status-dot]')).toBeVisible();
  const compass = journey.locator('[data-map-compass]');
  await expect(compass).toHaveText('N');
  await expect(compass.locator('.icon svg')).toBeVisible();
  await expect(compass.locator('.icon')).toHaveCSS('width', '12px');
  await expect(compass).toHaveAttribute('aria-hidden', 'true');
  const play = journey.getByRole('button', { name: 'Pause journey', exact: true });
  await expect(play).toHaveText('Pause');
  await play.click();
  await expect(journey.getByRole('button', { name: 'Play journey', exact: true })).toHaveText(
    'Play',
  );
  const country = map.locator('.country.final-country');
  await expect(country).toHaveCount(1);
  await expect(country).toHaveAttribute('data-country', 'TWN');
  expect(await country.evaluate((node) => getComputedStyle(node).animationName)).toContain(
    'country-breathe',
  );
  await page.getByRole('button', { name: 'Background settings', exact: true }).click();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect
    .poll(() => country.evaluate((node) => getComputedStyle(node).animationPlayState))
    .toBe('paused');
  await page.keyboard.press('Escape');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect
    .poll(() => country.evaluate((node) => getComputedStyle(node).animationName))
    .toBe('none');
});

/** State changes must preserve the atlas node carrying the painted final-country class. */
test('country decoration survives playback, popup and locale rerenders', async ({ page }) => {
  await page.goto('/en#journey');
  const journey = page.locator('#journey');
  const country = journey.locator('.country.final-country');
  await expect(country).toHaveCount(1);
  const original = await country.elementHandle();
  await journey.getByRole('button', { name: 'Pause journey', exact: true }).click();
  await expect(country).toHaveCount(1);
  expect(await original?.evaluate((node) => node.isConnected)).toBe(true);
  await journey.getByRole('button', { name: 'Play journey', exact: true }).click();
  await expect(country).toHaveCount(1);
  await journey.locator('[data-stop="2"]').focus();
  await expect(page.getByRole('tooltip')).toBeVisible();
  expect(await original?.evaluate((node) => node.isConnected)).toBe(true);
  await page.getByRole('button', { name: 'Change language', exact: true }).click();
  await page.getByRole('button', { name: '繁體中文', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-Hant');
  await expect(country).toHaveCount(1);
  await expect(country).toHaveAttribute('data-country', 'TWN');
  expect(await original?.evaluate((node) => node.isConnected)).toBe(true);
  await expect(journey.locator('[data-id="1"]')).toContainText('2024年1月–2024年12月');
});

/** Keyboard browsing follows the strip without selecting chapters or scrolling the document. */
test('destination strip restores dates, overflow controls and directional keyboard browsing', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/en#journey');
  const journey = page.locator('#journey');
  const carousel = journey.locator('[data-stop-carousel]');
  await expect(journey.locator('svg[role="group"]')).toBeVisible();
  await expect(carousel).toHaveAttribute('data-overflow', 'false');
  await expect(journey.getByRole('button', { name: 'Show earlier destinations' })).toBeHidden();
  await expect(journey.getByRole('button', { name: 'Show later destinations' })).toBeHidden();
  await expect(carousel.locator('[data-id="1"]')).toContainText('Jan–Dec 2024');
  await expect(carousel.locator('[data-id="3"]')).toContainText('2025–Present');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(carousel).toHaveAttribute('data-overflow', 'true');
  await expect(journey.locator('[data-map-coordinates]')).toBeHidden();
  expect(
    await journey
      .locator('svg[role="group"]')
      .evaluate((node) => node.getBoundingClientRect().height),
  ).toBe(220);
  const previous = journey.getByRole('button', { name: 'Show earlier destinations' });
  const next = journey.getByRole('button', { name: 'Show later destinations' });
  await expect(previous).toBeDisabled();
  await expect(next).toBeEnabled();
  await carousel.locator('[data-id="1"]').focus();
  const top = await page.evaluate(() => scrollY);
  await page.keyboard.press('ArrowRight');
  await expect(carousel.locator('[data-id="2"]')).toBeFocused();
  await page.keyboard.press('End');
  await expect(carousel.locator('[data-id="3"]')).toBeFocused();
  await expect(next).toBeDisabled();
  await expect(previous).toBeEnabled();
  await expect(carousel.locator('[data-id="1"]')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => scrollY)).toBe(top);
  await page.keyboard.press('Home');
  await expect(carousel.locator('[data-id="1"]')).toBeFocused();
  await expect(previous).toBeDisabled();
  await next.click();
  await expect(next).toBeDisabled();
  await previous.click();
  await expect(previous).toBeDisabled();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(carousel).toHaveAttribute('data-overflow', 'false');
  await expect(next).toBeHidden();
});

/** A transient hover tooltip dismisses on pointer/focus departure and preserves explicit close. */
test('city hover and focus information close when their interaction ends', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/en#journey');
  const journey = page.locator('#journey');
  const map = journey.locator('svg[role="group"]');
  const marker = map.locator('[data-stop="2"]');
  await expect(map).toBeVisible();
  await marker.locator('circle').last().hover();
  await expect(page.getByRole('tooltip')).toContainText('Bengaluru');
  await page.mouse.move(20, 20);
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  await marker.focus();
  await expect(page.getByRole('tooltip')).toContainText('Bengaluru');
  await journey.getByRole('button', { name: 'Restart journey' }).focus();
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  await journey.locator('[data-id="3"]').click();
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  await journey.locator('[data-id="2"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('tooltip')).toContainText('Bengaluru');
  await page.getByRole('button', { name: 'Close city information' }).click();
  await expect(page.getByRole('tooltip')).toHaveCount(0);
});

/** Arrival paint precedes the next chapter without changing selection or restarting flight. */
test('arrival highlights the destination during the source chapter final 500ms', async ({
  page,
}) => {
  await page.clock.install();
  await page.goto('/en#journey');
  const journey = page.locator('#journey');
  const map = journey.locator('svg[role="group"]');
  await expect(map).toBeVisible();
  await journey.getByRole('button', { name: 'Restart journey' }).click();
  await page.clock.runFor(6800);
  await expect(map.locator('[data-stop="2"]')).toHaveAttribute('data-highlighted', 'true');
  await expect(map.locator('[data-stop="1"]')).toHaveAttribute('data-highlighted', 'false');
  await expect(map.locator('[data-stop="1"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(journey.locator('[data-id="1"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(journey.getByText('01 / 03', { exact: true })).toBeVisible();
  await page.clock.runFor(500);
  await expect(map.locator('[data-stop="2"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(journey.locator('[data-id="2"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(journey.getByText('02 / 03', { exact: true })).toBeVisible();
});

/** Long API copy scrolls inside the map region without covering playback or stop controls. */
test('long mobile destination detail fits between the caption and stop controls', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/en#journey');
  const journey = page.locator('#journey');
  await expect(journey.locator('svg[role="group"]')).toBeVisible();
  await journey.locator('[data-stop="2"]').focus();
  const popup = journey.locator('[data-city-bubble]');
  const content = page.getByRole('tooltip');
  await expect(content).toContainText('A long but valid career detail.');
  await expect
    .poll(() => content.evaluate((node) => node.scrollHeight - node.clientHeight))
    .toBeGreaterThan(0);
  const box = await popup.boundingBox();
  const play = await journey
    .getByRole('button', { name: 'Play journey', exact: true })
    .boundingBox();
  const stops = await journey.locator('[data-stop-carousel]').boundingBox();
  expect(box).not.toBeNull();
  expect(play).not.toBeNull();
  expect(stops).not.toBeNull();
  if (box && play && stops) {
    expect(box.y).toBeGreaterThanOrEqual(play.y + play.height);
    expect(box.y + box.height).toBeLessThanOrEqual(stops.y - 20);
  }
  await content.focus();
  await page.keyboard.press('End');
  await expect(content).toBeFocused();
  await page.getByRole('button', { name: 'Close city information' }).click();
  await expect(popup).toHaveCount(0);
});

test.describe('touch destination details', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  /** Touch has no hover, so tapping a stop reveals its safely clamped career detail. */
  test('tapping a destination opens detail and preserves map controls', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/zh-Hant#journey');
    const journey = page.locator('#journey');
    await expect(journey.locator('svg[role="group"]')).toBeVisible();
    await journey.locator('[data-id="2"]').tap();
    await expect(page.getByRole('tooltip')).toContainText('Bengaluru');
    await expect(journey.locator('[data-stop="2"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(journey.locator('[data-id="2"]')).toContainText('2024年6月–2024年10月');
    await page.getByRole('button', { name: '關閉城市資訊' }).tap();
    await expect(page.getByRole('tooltip')).toHaveCount(0);
  });
});

for (const locale of ['en', 'zh-Hans', 'zh-Hant']) {
  /** Capture the enhanced atlas, rather than an untriggered static/lazy fallback. */
  test(`${locale} enhanced journey matches mobile, tablet and wide-screen geometry`, async ({
    page,
    context,
  }, testInfo) => {
    const labels =
      locale === 'en'
        ? { pause: 'Pause journey', play: 'Play journey', close: 'Close city information' }
        : locale === 'zh-Hans'
          ? { pause: '暂停旅程', play: '播放旅程', close: '关闭城市信息' }
          : { pause: '暫停旅程', play: '播放旅程', close: '關閉城市資訊' };
    for (const theme of ['mint', 'mist']) {
      await context.addCookies([
        {
          name: 'portfolio-appearance',
          value: encodeURIComponent(JSON.stringify({ theme })),
          url: testInfo.project.use.baseURL ?? 'http://127.0.0.1:4173',
        },
      ]);
      for (const width of [390, 1024, 1440, 1700, 3840]) {
        const height = width === 390 ? 844 : width >= 3840 ? 2160 : width >= 1700 ? 1080 : 900;
        await page.setViewportSize({ width, height });
        await page.goto(`/${locale}#journey`);
        // Repeated fragment navigation preserves playback state; every capture starts fresh.
        await page.reload();
        const journey = page.locator('#journey');
        const map = journey.locator('svg[role="group"]');
        await expect(map).toBeVisible();
        await expect(map.locator('[data-stop]')).toHaveCount(3);
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await expect(page.locator('[data-entering="true"]')).toHaveCount(0);
        await page.evaluate(() => document.fonts.ready);
        await journey.getByRole('button', { name: labels.pause, exact: true }).click();
        await expect(journey.getByRole('button', { name: labels.play, exact: true })).toBeVisible();
        const mapHeight = await map.evaluate((node) => node.getBoundingClientRect().height);
        if (width === 390) expect(mapHeight).toBe(220);
        if (width >= 1700) {
          expect(mapHeight).toBeGreaterThanOrEqual(500);
          expect(mapHeight).toBeLessThanOrEqual(760);
        }
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
        ).toBeLessThanOrEqual(1);
        await map.locator('[data-stop="2"]').focus();
        const popup = journey.locator('[data-city-bubble]');
        await expect(popup).toBeVisible();
        const bubbleBox = await popup.boundingBox();
        const controlBox = await journey
          .getByRole('button', { name: labels.play, exact: true })
          .boundingBox();
        expect(bubbleBox).not.toBeNull();
        expect(controlBox).not.toBeNull();
        if (bubbleBox && controlBox) {
          const overlapX =
            Math.min(bubbleBox.x + bubbleBox.width, controlBox.x + controlBox.width) -
            Math.max(bubbleBox.x, controlBox.x);
          const overlapY =
            Math.min(bubbleBox.y + bubbleBox.height, controlBox.y + controlBox.height) -
            Math.max(bubbleBox.y, controlBox.y);
          expect(Math.min(overlapX, overlapY)).toBeLessThanOrEqual(0);
        }
        await page.getByRole('button', { name: labels.close, exact: true }).click();
        await expect(popup).toHaveCount(0);
        await page.screenshot({
          path: testInfo.outputPath(`journey-${locale}-${theme}-${width}.png`),
          animations: 'disabled',
        });
      }
    }
  });
}
