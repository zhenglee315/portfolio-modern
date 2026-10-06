import { expect, type Locator, type Page } from '@playwright/test';
import { themeTransitionTiming } from '../../src/features/appearance/model/transition';
import { openClientShell, runtimeTest as test } from '../fixtures/browser';
import { endpointFixture } from '../fixtures/portfolio';

type EntranceEffect = {
  name: string;
  duration: number;
  delay: number;
  playState: string;
  transform: string;
  opacity: number;
};
type EntrancePaint = {
  entering: boolean;
  playState: string;
  edges: EntranceEffect[];
  navigation?: EntranceEffect;
  content?: EntranceEffect;
};

type ThemePaint = {
  duration: number;
  easing: string;
  opacity: number;
  background: string;
  pointerEvents: string;
  palette: string | undefined;
  entrance: EntrancePaint;
};
declare global {
  interface Window {
    __themePaint: {
      samples: ThemePaint[];
      phases: string[];
      contactMounts: number;
      readEntrance: () => EntrancePaint;
      resetPhases: () => void;
      release: () => void;
    };
    __themeVisibility: (hidden: boolean) => void;
  }
}

/** Hold each real Web Animation at its midpoint; observe authored paint without substituting styles. */
async function observeThemePaint(page: Page) {
  await page.addInitScript(() => {
    let held: Animation | undefined;
    /** Read authored CSS animations, including backwards fill during their original delays. */
    const readEntrance = (): EntrancePaint => {
      const root = document.querySelector('main')?.parentElement;
      const effect = (node: Element | undefined): EntranceEffect | undefined => {
        if (!node) return;
        const animation = node.getAnimations().find((item) => item instanceof CSSAnimation);
        if (!(animation instanceof CSSAnimation) || !animation.effect) return;
        const timing = animation.effect.getTiming();
        const style = getComputedStyle(node);
        return {
          name: node.getAttribute('data-field-edge') ?? animation.animationName,
          duration: Number(timing.duration),
          delay: timing.delay ?? 0,
          playState: animation.playState,
          transform: style.transform,
          opacity: Number(style.opacity),
        };
      };
      const navigation = [...(root?.querySelectorAll('[data-entrance-navigation]') ?? [])].find(
        (node) => node.getClientRects().length > 0,
      );
      return {
        entering: root?.getAttribute('data-entering') === 'true',
        playState: root?.style.getPropertyValue('--entrance-play-state') ?? '',
        edges: [...(root?.querySelectorAll('[data-field-edge]') ?? [])]
          .map((node) => effect(node))
          .filter((value): value is EntranceEffect => !!value),
        navigation: effect(navigation),
        content: effect(root?.querySelector('main > *') ?? undefined),
      };
    };
    let previous = 'idle';
    const contacts = new WeakSet<Element>();
    const probe = {
      samples: [] as ThemePaint[],
      phases: [] as string[],
      contactMounts: 0,
      readEntrance,
      resetPhases: () => {
        probe.phases.length = 0;
        previous = 'idle';
      },
      release: () => held?.finish(),
    };
    window.__themePaint = probe;
    // Observe the page owner's existing marker and variable without adding product test markers.
    new MutationObserver((mutations) => {
      if (mutations.some((mutation) => mutation.type === 'childList')) {
        for (const bubble of document.querySelectorAll('[data-contact-bubble]')) {
          if (!contacts.has(bubble)) {
            contacts.add(bubble);
            probe.contactMounts++;
          }
        }
      }
      const root = document.querySelector('main')?.parentElement;
      if (
        !mutations.some(
          (mutation) =>
            mutation.target === root &&
            ['style', 'data-entering'].includes(mutation.attributeName ?? ''),
        )
      )
        return;
      const sample = readEntrance();
      const phase = sample.entering ? sample.playState : 'idle';
      if (phase !== previous) {
        previous = phase;
        probe.phases.push(phase);
      }
    }).observe(document, { attributes: true, childList: true, subtree: true });
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
        entrance: readEntrance(),
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
  await page.evaluate(() => window.__themePaint.resetPhases());
  return page.locator('.dropdown-menu.show').filter({ has: page.getByRole('slider') });
}

/** The opaque commit holds the original four-edge, responsive navigation and content sequence. */
function expectPrepared(sample: ThemePaint) {
  const entrance = sample.entrance;
  expect(entrance.entering).toBe(true);
  expect(entrance.playState).toBe('paused');
  expect(entrance.edges).toHaveLength(4);
  for (const edge of entrance.edges) {
    expect(edge.duration).toBe(650);
    expect(edge.delay).toBe(['left', 'right'].includes(edge.name) ? 100 : 0);
    expect(edge.playState).toBe('paused');
    expect(edge.transform).not.toBe('none');
  }
  expect(entrance.navigation).toMatchObject({
    delay: 800,
    duration: 450,
    playState: 'paused',
    opacity: 0,
  });
  expect(entrance.navigation?.transform).not.toBe('none');
  expect(entrance.content).toMatchObject({
    delay: 750,
    duration: 450,
    playState: 'paused',
    opacity: 0,
  });
}

/** Await the real CSS playback boundary, then its finite marker cleanup; no fixed sleeps are needed. */
async function expectReplayed(page: Page) {
  await expect
    .poll(() => page.evaluate(() => window.__themePaint.readEntrance().playState))
    .toBe('running');
  const sample = await page.evaluate(() => window.__themePaint.readEntrance());
  expect(sample.entering).toBe(true);
  expect(sample.edges).toHaveLength(4);
  for (const effect of [...sample.edges, sample.navigation!, sample.content!]) {
    expect(effect.playState).toBe('running');
  }
  await expect(page.locator('[data-entering]')).toHaveCount(0);
  expect(await page.evaluate(() => window.__themePaint.readEntrance().playState)).toBe('');
  await expect(page.locator('#overview')).toHaveCSS('opacity', '1');
}

/** Export two coherent timeline samples using native CSS effects, then restore their original clocks. */
async function captureReplayPaint(page: Page, path: string) {
  await expect
    .poll(() => page.evaluate(() => window.__themePaint.readEntrance().playState))
    .toBe('running');
  const effects = await page.evaluateHandle(() => {
    const root = document.querySelector('main')!.parentElement!;
    return root
      .getAnimations({ subtree: true })
      .filter(
        (animation) =>
          animation instanceof CSSAnimation &&
          /field-.*-in|navigation-enter|header-enter|page-enter/.test(animation.animationName),
      )
      .map((animation) => ({ animation, currentTime: animation.currentTime }));
  });
  try {
    for (const elapsed of [325, 1025]) {
      await effects.evaluate((items, time) => {
        for (const { animation } of items) {
          animation.pause();
          animation.currentTime = time;
        }
      }, elapsed);
      await page.screenshot({ path: path.replace(/\.png$/, `-${elapsed}ms.png`) });
    }
  } finally {
    await effects.evaluate((items) => {
      for (const { animation, currentTime } of items) {
        animation.currentTime = currentTime;
        animation.play();
      }
    });
    await effects.dispose();
  }
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
    const cover = await paintReady(page, 1);
    expect(cover.entrance.entering).toBe(false);
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
    expectPrepared(await paintReady(page, 2));
    await page.screenshot({ path: testInfo.outputPath(`theme-${width}-reveal.png`) });
    await page.evaluate(() => window.__themePaint.release());
    await expect(page.locator('[data-theme-veil]')).toHaveCount(0);
    await expect(page.locator('html')).not.toHaveAttribute('data-theme-transition');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'amber');
    await expect(menu).toBeVisible();
    await expect(speed).toBeFocused();
    await captureReplayPaint(page, testInfo.outputPath(`theme-${width}-replay.png`));
    await expectReplayed(page);
    expect(await page.evaluate(() => window.__themePaint.phases)).toEqual([
      'paused',
      'running',
      'idle',
    ]);
    // Pausing the infinite background does not suspend the finite palette-triggered entrance.
    await expect(page.locator('html')).toHaveAttribute('data-motion-paused', 'true');
    await speed.focus();
    await page.keyboard.press('ArrowRight');
    await menu.getByRole('button', { name: 'Amber', exact: true }).click();
    expect(await page.evaluate(() => window.__themePaint.samples.length)).toBe(2);
    await expect(page.locator('[data-entering]')).toHaveCount(0);
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
  // Resetting to the original palette under the cover needs neither a prepared nor replayed page.
  expect(reveal.entrance.entering).toBe(false);
  await page.evaluate(() => window.__themePaint.release());
  await expect(page.locator('[data-theme-veil]')).toHaveCount(0);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'mist');
  await expect(menu.getByRole('button', { name: 'Mist', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(menu.getByRole('button', { name: 'Reset', exact: true })).toBeFocused();
  expect(await page.evaluate(() => window.__themePaint.phases)).toEqual([]);
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
  await expect(page.locator('[data-entering]')).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(page.locator('html')).toHaveAttribute('data-motion-paused', 'false');
  await expect(page.locator('[data-entering]')).toHaveCount(0);
  expect(await page.evaluate(() => window.__themePaint.phases)).toEqual([]);
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
  expectPrepared(reveal);
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
  await expectReplayed(page);
});

test('a choice during reveal finishes its paint before a fresh breathing cycle for the latest palette', async ({
  page,
}) => {
  await observeThemePaint(page);
  const menu = await openThemeMenu(page);
  await menu.getByRole('button', { name: 'Amber', exact: true }).click();
  await paintReady(page, 1);
  await page.evaluate(() => window.__themePaint.release());
  expectPrepared(await paintReady(page, 2));
  await menu.getByRole('button', { name: 'Ice', exact: true }).click();
  expect(await page.evaluate(() => window.__themePaint.samples.length)).toBe(2);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'amber');
  await page.evaluate(() => window.__themePaint.release());
  const nextCover = await paintReady(page, 3);
  expect(nextCover.palette).toBe('amber');
  expect(nextCover.entrance.playState).toBe('paused');
  await page.evaluate(() => window.__themePaint.release());
  const nextReveal = await paintReady(page, 4);
  expect(nextReveal.palette).toBe('blue');
  expectPrepared(nextReveal);
  expect(await page.evaluate(() => window.__themePaint.phases)).toEqual(['paused']);
  await page.evaluate(() => window.__themePaint.release());
  await expect(page.locator('[data-theme-veil]')).toHaveCount(0);
  await expect(page.locator('html')).not.toHaveAttribute('data-theme-transition');
  await expect(menu.getByRole('button', { name: 'Ice', exact: true })).toBeFocused();
  await expectReplayed(page);
  expect(await page.evaluate(() => window.__themePaint.phases)).toEqual([
    'paused',
    'running',
    'idle',
  ]);
});

for (const phase of ['prepared', 'playing'] as const) {
  test(`reduced motion releases a ${phase} entrance and never replays it on resume`, async ({
    page,
  }) => {
    await observeThemePaint(page);
    const menu = await openThemeMenu(page);
    const amber = menu.getByRole('button', { name: 'Amber', exact: true });
    await amber.click();
    await paintReady(page, 1);
    await page.evaluate(() => window.__themePaint.release());
    expectPrepared(await paintReady(page, 2));
    if (phase === 'playing') {
      await page.evaluate(() => window.__themePaint.release());
      await expect
        .poll(() => page.evaluate(() => window.__themePaint.readEntrance().playState))
        .toBe('running');
    }
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(page.locator('html')).toHaveAttribute('data-motion-paused', 'true');
    await expect(page.locator('[data-theme-veil], [data-entering]')).toHaveCount(0);
    expect(await page.evaluate(() => window.__themePaint.readEntrance().playState)).toBe('');
    await expect(amber).toBeFocused();
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await expect(page.locator('html')).toHaveAttribute('data-motion-paused', 'false');
    // A late native completion cannot resurrect a cancelled generation.
    await page.evaluate(() => window.__themePaint.release());
    await expect(page.locator('[data-theme-veil], [data-entering]')).toHaveCount(0);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'amber');
    expect(await page.evaluate(() => window.__themePaint.phases)).toEqual(
      phase === 'prepared' ? ['paused', 'idle'] : ['paused', 'running', 'idle'],
    );
  });
}

test('document visibility cancels held preparation and returns without a delayed entrance', async ({
  page,
}) => {
  await page.addInitScript(() => {
    // Emulate the browser visibility boundary, retaining the real event subscription and policies.
    let hidden = false;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
    window.__themeVisibility = (value) => {
      hidden = value;
      document.dispatchEvent(new Event('visibilitychange'));
    };
  });
  await observeThemePaint(page);
  const menu = await openThemeMenu(page);
  const amber = menu.getByRole('button', { name: 'Amber', exact: true });
  await amber.click();
  await paintReady(page, 1);
  await page.evaluate(() => window.__themePaint.release());
  expectPrepared(await paintReady(page, 2));
  await page.evaluate(() => window.__themeVisibility(true));
  await expect(page.locator('html')).toHaveAttribute('data-motion-paused', 'true');
  await expect(page.locator('[data-theme-veil], [data-entering]')).toHaveCount(0);
  await page.evaluate(() => window.__themeVisibility(false));
  await expect(page.locator('html')).toHaveAttribute('data-motion-paused', 'false');
  await page.evaluate(() => window.__themePaint.release());
  await expect(page.locator('[data-theme-veil], [data-entering]')).toHaveCount(0);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'amber');
  await expect(amber).toBeFocused();
  expect(await page.evaluate(() => window.__themePaint.phases)).toEqual(['paused', 'idle']);
});

test('replay retains page identity, focused input and scroll while a first API read is pending', async ({
  page,
}, testInfo) => {
  // The generated empty-cache fallback is a production artifact; other theme cases also run in dev.
  test.skip(
    testInfo.project.testDir.endsWith('/dev'),
    'Production SPA fallback exercises an empty first-read cache.',
  );
  let releaseJourney!: () => void;
  let journeyPending = false;
  const pending = new Promise<void>((resolve) => {
    releaseJourney = resolve;
  });
  const requests: string[] = [];
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    if (/\/api\/portfolio\/(?:site|journey|experiences|projects)$/.test(path)) requests.push(path);
  });
  await page.route('**/api/portfolio/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/journey')) {
      journeyPending = true;
      await pending;
    }
    await route.fulfill({ json: endpointFixture(url) });
  });
  await observeThemePaint(page);
  try {
    await openClientShell(page);
    await expect.poll(() => journeyPending).toBe(true);
    await expect(page.locator('[data-entering]')).toHaveCount(0);
    await expect(page.locator('h1[data-profile-content]')).toContainText('Alex');
    await expect.poll(() => requests.length).toBe(4);
    await page.getByRole('button', { name: 'Background settings' }).click();
    const speed = page.getByRole('slider', { name: 'Blink frequency' });
    await expect(speed).toBeFocused();
    await page.evaluate(() => window.__themePaint.resetPhases());
    const identities = await page.evaluateHandle(() => [
      document.querySelector('main')!.parentElement,
      document.querySelector('main'),
      document.querySelector('h1[data-profile-content]'),
      document.querySelector('aside[data-entrance-navigation]'),
      document.querySelector('.dropdown-menu.show'),
      document.querySelector('input[type="range"]'),
    ]);
    const contactMounts = await page.evaluate(() => window.__themePaint.contactMounts);
    const beforeRequests = [...requests];
    await page.getByRole('button', { name: 'Amber', exact: true }).click();
    await paintReady(page, 1);
    // Establish a nonzero scroll after pointer activation, which legitimately scrolls its target.
    await speed.evaluate((node) => {
      window.scrollTo({ top: 120, behavior: 'instant' });
      (node as HTMLElement).focus({ preventScroll: true });
    });
    const scroll = await page.evaluate(() => window.scrollY);
    expect(scroll).toBeGreaterThan(0);
    await page.evaluate(() => window.__themePaint.release());
    expectPrepared(await paintReady(page, 2));
    await page.evaluate(() => window.__themePaint.release());
    await expectReplayed(page);
    await expect(speed).toBeFocused();
    expect(await page.evaluate(() => window.scrollY)).toBe(scroll);
    expect(requests).toEqual(beforeRequests);
    expect(
      await page.evaluate((before) => {
        const after = [
          document.querySelector('main')!.parentElement,
          document.querySelector('main'),
          document.querySelector('h1[data-profile-content]'),
          document.querySelector('aside[data-entrance-navigation]'),
          document.querySelector('.dropdown-menu.show'),
          document.querySelector('input[type="range"]'),
        ];
        return before.every((node, index) => node === after[index]);
      }, identities),
    ).toBe(true);
    const journeyResponse = page.waitForResponse((response) =>
      new URL(response.url()).pathname.endsWith('/journey'),
    );
    releaseJourney();
    await journeyResponse;
    await expect(page.locator('[data-journey-atlas]')).toHaveCount(1);
    await expect(page.locator('[data-entering], [data-contact-bubble]')).toHaveCount(0);
    expect(await page.evaluate(() => window.__themePaint.contactMounts)).toBe(contactMounts);
    expect(await page.evaluate(() => window.__themePaint.phases)).toEqual([
      'paused',
      'running',
      'idle',
    ]);
    expect(requests).toEqual(beforeRequests);
    await expect(speed).toBeFocused();
    await identities.dispose();
  } finally {
    releaseJourney();
  }
});
