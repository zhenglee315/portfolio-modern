import { expect, type Locator, type Page } from '@playwright/test';
import { themeTransitionTiming } from '../../src/features/appearance/model/transition';
import { openAuthControls, runtimeTest as test } from '../fixtures/browser';

type ThemePaint = {
  duration: number;
  easing: string;
  opacity: number;
  background: string;
  pointerEvents: string;
  palette: string | undefined;
  authPhase: string | undefined;
  entering: boolean;
};

declare global {
  interface Window {
    __themePaint: {
      samples: ThemePaint[];
      release: () => void;
    };
    __themeVisibility: (hidden: boolean) => void;
  }
}

/** Hold each real veil animation at its midpoint without replacing authored styles or events. */
async function observeThemePaint(page: Page) {
  await page.addInitScript(() => {
    let held: Animation | undefined;
    const probe = {
      samples: [] as ThemePaint[],
      release: () => held?.finish(),
    };
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
        authPhase: document.querySelector<HTMLElement>('[data-auth-phase]')?.dataset.authPhase,
        entering: !!document.querySelector('[data-entering]'),
      });
      return animation;
    };
  });
}

/** Read the native animation boundary and verify the account form remains independently active. */
async function paintReady(page: Page, count: number) {
  await expect.poll(() => page.evaluate(() => window.__themePaint.samples.length)).toBe(count);
  const sample = await page.evaluate(() => window.__themePaint.samples.at(-1)!);
  expect(sample.duration).toBe(themeTransitionTiming.durationMs / 2);
  expect(sample.easing).toBe(themeTransitionTiming.easing);
  expect(sample.opacity).toBeGreaterThan(0);
  expect(sample.opacity).toBeLessThan(1);
  expect(sample.pointerEvents).toBe('none');
  expect(sample.authPhase).toBe('auth');
  expect(sample.entering).toBe(false);
  await expect(page.locator('[data-auth-panel]')).toBeVisible();
  return sample;
}

/** Use the retained form settings control while the public Gear entries remain a UI scaffold. */
async function openThemeMenu(page: Page, path = '/en') {
  await openAuthControls(page, path);
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('[data-entering]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Background settings' }).click();
  await expect(page.getByRole('slider').first()).toBeFocused();
  return page.locator('.dropdown-menu.show').filter({ has: page.getByRole('slider') });
}

/** Palette paint cannot resize the menu; one pixel of trigger hover feedback remains legitimate. */
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

/** Complete visual work while retaining the same account-form surface and interaction state. */
async function expectThemeSettled(page: Page, theme: string) {
  await expect(page.locator('[data-theme-veil], [data-entering]')).toHaveCount(0);
  await expect(page.locator('html')).not.toHaveAttribute('data-theme-transition');
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  await expect(page.locator('[data-auth-phase]')).toHaveAttribute('data-auth-phase', 'auth');
  await expect(page.locator('[data-auth-panel]')).toBeVisible();
}

for (const width of [390, 1440]) {
  test(`theme breathing preserves account settings geometry and focus at ${width}px without animating unrelated preferences`, async ({
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
    await page.screenshot({ path: testInfo.outputPath(`auth-theme-${width}-reveal.png`) });
    await page.evaluate(() => window.__themePaint.release());
    await expectThemeSettled(page, 'amber');
    await expect(menu).toBeVisible();
    await expect(speed).toBeFocused();
    await expectMenuGeometry(menu, before);
    await expect(page.locator('html')).toHaveAttribute('data-motion-paused', 'true');
    await speed.focus();
    await page.keyboard.press('ArrowRight');
    await amber.click();
    expect(await page.evaluate(() => window.__themePaint.samples.length)).toBe(2);
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
  await page.screenshot({ path: testInfo.outputPath('auth-theme-rapid-cover.png') });
  await page.evaluate(() => window.__themePaint.release());
  expect((await paintReady(page, 2)).palette).toBe('mist');
  await page.evaluate(() => window.__themePaint.release());
  await expectThemeSettled(page, 'mist');
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
  await expectThemeSettled(page, 'amber');
  expect(await page.evaluate(() => window.__themePaint.samples)).toEqual([]);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await menu.getByRole('button', { name: 'Mint', exact: true }).click();
  await paintReady(page, 1);
  await menu.getByRole('button', { name: 'Ice', exact: true }).click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expectThemeSettled(page, 'blue');
  expect(await page.evaluate(() => window.__themePaint.samples.length)).toBe(1);
  await expect(menu.getByRole('button', { name: 'Ice', exact: true })).toBeFocused();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(page.locator('html')).toHaveAttribute('data-motion-paused', 'false');
  await expectThemeSettled(page, 'blue');
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
  await expectThemeSettled(page, 'amber');
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
  expect((await paintReady(page, 3)).palette).toBe('amber');
  await page.evaluate(() => window.__themePaint.release());
  expect((await paintReady(page, 4)).palette).toBe('blue');
  await page.evaluate(() => window.__themePaint.release());
  await expectThemeSettled(page, 'blue');
  await expect(menu.getByRole('button', { name: 'Ice', exact: true })).toBeFocused();
});

for (const phase of ['cover', 'reveal'] as const) {
  test(`reduced motion releases a held ${phase} and never restarts it on resume`, async ({
    page,
  }) => {
    await observeThemePaint(page);
    const menu = await openThemeMenu(page);
    const amber = menu.getByRole('button', { name: 'Amber', exact: true });
    await amber.click();
    await paintReady(page, 1);
    if (phase === 'reveal') {
      await page.evaluate(() => window.__themePaint.release());
      await paintReady(page, 2);
    }
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(page.locator('html')).toHaveAttribute('data-motion-paused', 'true');
    await expectThemeSettled(page, 'amber');
    await expect(amber).toBeFocused();
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await expect(page.locator('html')).toHaveAttribute('data-motion-paused', 'false');
    // A late native completion cannot resurrect the interrupted generation.
    await page.evaluate(() => window.__themePaint.release());
    await expectThemeSettled(page, 'amber');
    expect(await page.evaluate(() => window.__themePaint.samples.length)).toBe(
      phase === 'cover' ? 1 : 2,
    );
  });
}

test('document visibility cancels held paint and returns without a delayed transition', async ({
  page,
}) => {
  await page.addInitScript(() => {
    // Retain the real visibility event subscription and policy while controlling its boundary.
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
  await paintReady(page, 2);
  await page.evaluate(() => window.__themeVisibility(true));
  await expect(page.locator('html')).toHaveAttribute('data-motion-paused', 'true');
  await expectThemeSettled(page, 'amber');
  await page.evaluate(() => window.__themeVisibility(false));
  await expect(page.locator('html')).toHaveAttribute('data-motion-paused', 'false');
  await page.evaluate(() => window.__themePaint.release());
  await expectThemeSettled(page, 'amber');
  await expect(amber).toBeFocused();
  expect(await page.evaluate(() => window.__themePaint.samples.length)).toBe(2);
});

test('theme paint retains account input and DOM identity while session restoration is pending', async ({
  page,
}) => {
  let releaseSession!: () => void;
  let sessionPending = false;
  const pending = new Promise<void>((resolve) => {
    releaseSession = resolve;
  });
  const requests: string[] = [];
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith('/api/portfolio/') || path === '/api/authority/session')
      requests.push(path);
  });
  await page.route('**/api/authority/session', async (route) => {
    sessionPending = true;
    await pending;
    await route.fulfill({ json: null });
  });
  await observeThemePaint(page);
  try {
    const menu = await openThemeMenu(page, '/en?site_id=2');
    await expect.poll(() => sessionPending).toBe(true);
    const panel = page.locator('[data-auth-panel]');
    const email = panel.locator('input[type="email"]');
    const password = panel.locator('input[type="password"]');
    await page.keyboard.press('Escape');
    await email.fill('demo@example.com');
    await password.fill('sample-password-123');
    await page.getByRole('button', { name: 'Background settings' }).click();
    const identities = await page.evaluateHandle(() => [
      document.querySelector('[data-portfolio-site]'),
      document.querySelector('[data-auth-panel]'),
      document.querySelector('[data-auth-panel] input[type="email"]'),
      document.querySelector('[data-auth-panel] input[type="password"]'),
      document.querySelector('.dropdown-menu.show'),
    ]);
    const beforeRequests = [...requests];
    await menu.getByRole('button', { name: 'Amber', exact: true }).click();
    await paintReady(page, 1);
    await page.evaluate(() => window.__themePaint.release());
    await paintReady(page, 2);
    await page.evaluate(() => window.__themePaint.release());
    await expectThemeSettled(page, 'amber');
    await expect(email).toHaveValue('demo@example.com');
    await expect(password).toHaveValue('sample-password-123');
    await expect(menu.getByRole('button', { name: 'Amber', exact: true })).toBeFocused();
    expect(requests).toEqual(beforeRequests);
    expect(
      await page.evaluate((before) => {
        const after = [
          document.querySelector('[data-portfolio-site]'),
          document.querySelector('[data-auth-panel]'),
          document.querySelector('[data-auth-panel] input[type="email"]'),
          document.querySelector('[data-auth-panel] input[type="password"]'),
          document.querySelector('.dropdown-menu.show'),
        ];
        return before.every((node, index) => node === after[index]);
      }, identities),
    ).toBe(true);
    const restored = page.waitForResponse((response) =>
      new URL(response.url()).pathname.endsWith('/authority/session'),
    );
    releaseSession();
    await restored;
    await expect(email).toHaveValue('demo@example.com');
    await expect(password).toHaveValue('sample-password-123');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Back to portfolio' }).click();
    await expect(page).toHaveURL(/\/en\?site_id=2#overview$/);
    await expect(page.locator('h1[data-profile-content]')).toContainText('Sam');
    await expect(page.getByRole('button', { name: 'Account settings' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'amber');
    await identities.dispose();
  } finally {
    releaseSession();
  }
});
