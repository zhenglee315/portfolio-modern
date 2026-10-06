import { expect, type Locator, type Page } from '@playwright/test';
import { themeTransitionTiming } from '../../src/features/appearance/model/transition';
import { runtimeTest as test } from '../fixtures/browser';

type ThemePaint = {
  duration: number;
  easing: string;
  opacity: number;
  background: string;
  pointerEvents: string;
  palette: string | undefined;
};
declare global {
  interface Window {
    __themePaint: { samples: ThemePaint[]; release: () => void };
  }
}

/** Hold each real Web Animation at its midpoint; observe authored paint without substituting styles. */
async function observeThemePaint(page: Page) {
  await page.addInitScript(() => {
    let held: Animation | undefined;
    const probe = { samples: [] as ThemePaint[], release: () => held?.finish() };
    window.__themePaint = probe;
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (frames, options) {
      const animation = animate.call(this, frames, options);
      if (!this.hasAttribute('data-theme-veil')) return animation;
      held = animation;
      animation.pause();
      const timing = animation.effect!.getTiming();
      animation.currentTime = Number(timing.duration) / 2;
      const style = getComputedStyle(this);
      probe.samples.push({
        duration: Number(timing.duration),
        easing: timing.easing ?? '',
        opacity: Number(style.opacity),
        background: style.backgroundColor,
        pointerEvents: style.pointerEvents,
        palette: document.documentElement.dataset.theme,
      });
      return animation;
    };
  });
}

/** Wait for the actual animation boundary rather than racing its finite lifetime with a sleep. */
async function paintReady(page: Page, count: number) {
  await expect.poll(() => page.evaluate(() => window.__themePaint.samples.length)).toBe(count);
  const sample = await page.evaluate(() => window.__themePaint.samples.at(-1)!);
  expect(sample.duration).toBe(themeTransitionTiming.durationMs / 2);
  expect(sample.easing).toBe(themeTransitionTiming.easing);
  expect(sample.opacity).toBeGreaterThan(0);
  expect(sample.opacity).toBeLessThan(1);
  expect(sample.pointerEvents).toBe('none');
  return sample;
}

/** Open hydrated controls after fonts and entrance settle; keep the original focus lifecycle. */
async function openThemeMenu(page: Page) {
  await page.goto('/en');
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('[data-entering]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Background settings' }).click();
  await expect(page.getByRole('slider').first()).toBeFocused();
  return page.locator('.dropdown-menu.show').filter({ has: page.getByRole('slider') });
}

/** Palette paint cannot resize the menu; one pixel of anchor hover feedback remains legitimate. */
async function expectMenuGeometry(
  menu: Locator,
  before: Awaited<ReturnType<Locator['boundingBox']>>,
) {
  const after = await menu.boundingBox();
  expect(before).not.toBeNull();
  expect(after).not.toBeNull();
  expect(after!.width).toBeCloseTo(before!.width, 1);
  expect(after!.height).toBeCloseTo(before!.height, 1);
  expect(Math.abs(after!.x - before!.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(after!.y - before!.y)).toBeLessThanOrEqual(1);
}

for (const width of [390, 1440]) {
  test(`theme breathing preserves menu geometry and focus at ${width}px without animating unrelated preferences`, async ({
    page,
    context,
    baseURL,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await context.addCookies([
      {
        name: 'portfolio-appearance',
        value: encodeURIComponent(JSON.stringify({ theme: 'mint', paused: true })),
        url: baseURL!,
      },
    ]);
    await observeThemePaint(page);
    const menu = await openThemeMenu(page);
    expect(await page.evaluate(() => window.__themePaint.samples)).toEqual([]);
    await expect(page.locator('html')).toHaveAttribute('data-motion-paused', 'true');
    const before = await menu.boundingBox();
    const amber = menu.getByRole('button', { name: 'Amber', exact: true });
    await amber.click();
    await paintReady(page, 1);
    await expect(amber).toBeFocused();
    await expect(amber).toHaveAttribute('aria-pressed', 'true');
    await amber.click();
    const speed = page.getByRole('slider', { name: 'Blink frequency' });
    await speed.focus();
    await page.keyboard.press('ArrowRight');
    await expect(speed).toHaveValue('1.1');
    await expect(speed).toBeFocused();
    expect(await page.evaluate(() => window.__themePaint.samples.length)).toBe(1);
    await expect(page.locator('[data-theme-veil]')).toHaveCount(1);
    await expectMenuGeometry(menu, before);
    await page.evaluate(() => window.__themePaint.release());
    await paintReady(page, 2);
    await page.screenshot({ path: testInfo.outputPath(`theme-${width}-reveal.png`) });
    await page.evaluate(() => window.__themePaint.release());
    await expect(page.locator('[data-theme-veil]')).toHaveCount(0);
    await expect(page.locator('html')).not.toHaveAttribute('data-theme-transition');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'amber');
    await expect(menu).toBeVisible();
    await expect(speed).toBeFocused();
  });
}

test('rapid palette clicks and reset keep the current cover and reveal only the latest choice', async ({
  page,
}, testInfo) => {
  await observeThemePaint(page);
  const menu = await openThemeMenu(page);
  for (const [index, name] of ['Mint', 'Ice', 'Amber', 'Reset'].entries()) {
    const choice = menu.getByRole('button', { name, exact: true });
    await choice.click();
    if (index === 0) await paintReady(page, 1);
    expect(await page.evaluate(() => window.__themePaint.samples.length)).toBe(1);
    await expect(choice).toBeFocused();
    await expect(page.locator('[data-theme-veil]')).toHaveCount(1);
  }
  await page.screenshot({ path: testInfo.outputPath('theme-rapid-cover.png') });
  await page.evaluate(() => window.__themePaint.release());
  const reveal = await paintReady(page, 2);
  expect(reveal.palette).toBe('mist');
  await page.evaluate(() => window.__themePaint.release());
  await expect(page.locator('[data-theme-veil]')).toHaveCount(0);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'mist');
  await expect(menu.getByRole('button', { name: 'Mist', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(menu.getByRole('button', { name: 'Reset', exact: true })).toBeFocused();
});

test('reduced motion skips theme breathing and cancels an already active cover', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await observeThemePaint(page);
  const menu = await openThemeMenu(page);
  await menu.getByRole('button', { name: 'Amber', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'amber');
  expect(await page.evaluate(() => window.__themePaint.samples)).toEqual([]);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await menu.getByRole('button', { name: 'Mint', exact: true }).click();
  await paintReady(page, 1);
  await menu.getByRole('button', { name: 'Ice', exact: true }).click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('[data-theme-veil]')).toHaveCount(0);
  await expect(page.locator('html')).not.toHaveAttribute('data-theme-transition');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'blue');
  expect(await page.evaluate(() => window.__themePaint.samples.length)).toBe(1);
  await expect(menu.getByRole('button', { name: 'Ice', exact: true })).toBeFocused();
});

test('palette breathing covers with the old background and reveals new paint without losing input', async ({
  page,
}) => {
  await observeThemePaint(page);
  const menu = await openThemeMenu(page);
  const before = await menu.boundingBox();
  const background = await page
    .locator('html')
    .evaluate((root) => getComputedStyle(root).getPropertyValue('--bg').trim());
  const amber = menu.getByRole('button', { name: 'Amber', exact: true });
  await amber.click();
  const cover = await paintReady(page, 1);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'mist');
  await page.evaluate(() => window.__themePaint.release());
  const reveal = await paintReady(page, 2);
  const colors = await page.evaluate(
    ([oldColor, veilColor]) => {
      const canvas = document.createElement('canvas').getContext('2d')!;
      canvas.fillStyle = oldColor!;
      const old = canvas.fillStyle;
      canvas.fillStyle = veilColor!;
      return [old, canvas.fillStyle];
    },
    [background, cover.background],
  );
  expect(colors[0]).toBe(colors[1]);
  expect([cover.palette, reveal.palette]).toEqual(['mist', 'amber']);
  await expectMenuGeometry(menu, before);
  await expect(amber).toBeFocused();
  await page.evaluate(() => window.__themePaint.release());
  await expect(page.locator('[data-theme-veil]')).toHaveCount(0);
  await expect(page.locator('html')).not.toHaveAttribute('data-theme-transition');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'amber');
  await expect(amber).toBeFocused();
});

test('a choice during reveal finishes its paint before a fresh breathing cycle for the latest palette', async ({
  page,
}) => {
  await observeThemePaint(page);
  const menu = await openThemeMenu(page);
  await menu.getByRole('button', { name: 'Amber', exact: true }).click();
  await paintReady(page, 1);
  await page.evaluate(() => window.__themePaint.release());
  await paintReady(page, 2);
  await menu.getByRole('button', { name: 'Ice', exact: true }).click();
  expect(await page.evaluate(() => window.__themePaint.samples.length)).toBe(2);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'amber');
  await page.evaluate(() => window.__themePaint.release());
  const nextCover = await paintReady(page, 3);
  expect(nextCover.palette).toBe('amber');
  await page.evaluate(() => window.__themePaint.release());
  const nextReveal = await paintReady(page, 4);
  expect(nextReveal.palette).toBe('blue');
  await page.evaluate(() => window.__themePaint.release());
  await expect(page.locator('[data-theme-veil]')).toHaveCount(0);
  await expect(page.locator('html')).not.toHaveAttribute('data-theme-transition');
  await expect(menu.getByRole('button', { name: 'Ice', exact: true })).toBeFocused();
});
