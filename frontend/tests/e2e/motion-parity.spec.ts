import { expect } from '@playwright/test';
import { runtimeTest as test } from '../fixtures/browser';

type EntranceSample = {
  edges: { name: string; delay: number; duration: number; transform: string }[];
  navigation: { delay: number; duration: number; transform: string; opacity: string };
  contentDelay: number;
};

test('four inward edges settle before the desktop rail slides and content appears', async ({
  page,
}) => {
  // Observe the first hydrated frame, before normal test actions can miss its short timeline.
  await page.addInitScript(() => {
    const observer = new MutationObserver(() => {
      const root = document.querySelector('[data-entering="true"]');
      const navigation = root?.querySelector('[data-entrance-navigation]');
      const content = root?.querySelector('main > *');
      if (!(navigation instanceof HTMLElement) || !(content instanceof HTMLElement)) return;
      const navigationAnimation = navigation.getAnimations()[0];
      if (!navigationAnimation?.effect) return;
      const timing = navigationAnimation.effect.getTiming();
      const sample = {
        edges: [...root!.querySelectorAll('[data-field-edge]')].map((edge) => {
          const animation = edge.getAnimations()[0];
          const edgeTiming = animation?.effect?.getTiming();
          return {
            name: edge.getAttribute('data-field-edge'),
            delay: edgeTiming?.delay,
            duration: edgeTiming?.duration,
            transform: getComputedStyle(edge).transform,
          };
        }),
        navigation: {
          delay: timing.delay,
          duration: timing.duration,
          transform: getComputedStyle(navigation).transform,
          opacity: getComputedStyle(navigation).opacity,
        },
        contentDelay: content.getAnimations()[0]?.effect?.getTiming().delay,
      };
      Object.defineProperty(window, '__portfolioEntranceSample', { value: sample });
      observer.disconnect();
    });
    observer.observe(document, { attributes: true, childList: true, subtree: true });
  });
  await page.goto('/en');
  await expect.poll(() => page.evaluate(() => '__portfolioEntranceSample' in window)).toBe(true);
  const sample = await page.evaluate(
    () =>
      (window as unknown as { __portfolioEntranceSample: EntranceSample })
        .__portfolioEntranceSample,
  );
  expect(sample.edges).toHaveLength(4);
  for (const edge of sample.edges) {
    expect(edge.duration).toBe(650);
    expect(edge.delay + edge.duration).toBeLessThanOrEqual(sample.navigation.delay);
    expect(edge.transform).not.toBe('none');
  }
  expect(sample.navigation.delay).toBe(800);
  expect(sample.navigation.duration).toBe(450);
  expect(sample.navigation.opacity).toBe('0');
  expect(sample.navigation.transform).toMatch(/matrix\(1, 0, 0, 1, -32, 0\)/);
  expect(sample.contentDelay).toBe(750);
  await expect(page.locator('[data-entering]')).toHaveCount(0);
  await expect(page.locator('aside[data-entrance-navigation]')).toHaveCSS('transform', 'none');
  await expect(page.locator('#overview')).toHaveCSS('opacity', '1');
});

test('static documents keep the profile, rail and inward frame readable without JavaScript', async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(`${baseURL}/en`);
  await expect(page.locator('h1[data-profile-content]')).toBeVisible();
  await expect(page.locator('#overview')).toHaveCSS('opacity', '1');
  await expect(page.locator('aside[data-entrance-navigation]')).toHaveCSS('opacity', '1');
  await expect(page.locator('aside[data-entrance-navigation]')).toHaveCSS('transform', 'none');
  await expect(page.locator('[data-field-edge]')).toHaveCount(4);
  await expect(page.locator('[data-entering]')).toHaveCount(0);
  await context.close();
});

test('a slow optional signal chunk cannot delay the frame, navigation or mouse halo', async ({
  page,
}) => {
  let release: (() => void) | undefined;
  let intercepted = false;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(/\/BackgroundSignals(?:-[^/?]+\.js|\.tsx)(?:\?.*)?$/, async (route) => {
    intercepted = true;
    await pending;
    await route.continue();
  });
  try {
    await page.goto('/en', { waitUntil: 'domcontentloaded' });
    await expect.poll(() => intercepted).toBe(true);
    await expect(page.locator('[data-field-edge]')).toHaveCount(4);
    await page.mouse.move(910, 240);
    const glow = page.locator('[data-pointer-glow]');
    await expect(glow).toHaveAttribute('data-visible', 'true');
    await expect(glow).toHaveCSS('--pointer-glow-x', '910px');
    await expect(glow).toHaveCSS('--pointer-glow-y', '240px');
    await expect(glow).toHaveCSS('opacity', '1');
    await expect(glow).toHaveCSS('pointer-events', 'none');
    expect(await glow.evaluate((node) => getComputedStyle(node).backgroundImage)).toContain(
      'radial-gradient',
    );
    await expect(page.locator('[data-entering]')).toHaveCount(0);
    await expect(page.locator('aside[data-entrance-navigation]')).toHaveCSS('opacity', '1');
    await page.mouse.wheel(0, 400);
    await expect(glow).toHaveAttribute('data-visible', 'true');
    await page.evaluate(() =>
      window.dispatchEvent(new PointerEvent('pointermove', { pointerType: 'touch' })),
    );
    await expect(glow).not.toHaveAttribute('data-visible', 'true');
  } finally {
    release?.();
  }
});

test('live reduced-motion changes finish entrance and suspend halo without hiding content', async ({
  page,
}) => {
  await page.goto('/en');
  await expect.poll(() => page.locator('[data-background-field] path').count()).toBeGreaterThan(1);
  await expect(page.locator('[data-entering]')).toHaveCount(0);
  await page.mouse.move(850, 230);
  const glow = page.locator('[data-pointer-glow]');
  await expect(glow).toHaveAttribute('data-visible', 'true');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('html')).toHaveAttribute('data-motion-paused', 'true');
  await expect(page.locator('[data-entering]')).toHaveCount(0);
  await expect(glow).not.toHaveAttribute('data-visible', 'true');
  await expect(glow).toHaveCSS('display', 'none');
  await expect(page.locator('#overview')).toHaveCSS('opacity', '1');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  // Media emulation returns before React effects; wait for the owner to resume input tracking.
  await expect(page.locator('html')).toHaveAttribute('data-motion-paused', 'false');
  await page.mouse.move(870, 250);
  await expect(glow).toHaveAttribute('data-visible', 'true');
  await expect(page.locator('[data-entering]')).toHaveCount(0);
});
