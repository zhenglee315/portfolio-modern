import { expect, test, type Locator, type Page } from '@playwright/test';
import { runtimeTest as parityTest } from '../fixtures/browser';
import { endpointFixture, siteFixture } from '../fixtures/portfolio';

/** Open the explicit contact surface after hydration without depending on its one-shot offer.
 * @param page Managed browser page at a public locale route.
 * @returns The visible rail/header trigger and its shared pixel bubble.
 */
async function openContact(page: Page) {
  await expect(page.locator('[data-entering]')).toHaveCount(0);
  // Prioritize an explicit control before clicking contact; startup may settle just after entrance.
  await page.getByRole('button', { name: 'Background settings' }).click();
  await expect(page.getByRole('slider', { name: 'Blink frequency' })).toBeFocused();
  await page.keyboard.press('Escape');
  const trigger = page.locator('[data-contact-trigger]:visible');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await trigger.click();
  const bubble = page.locator('[data-contact-bubble]');
  await expect(bubble).toBeVisible();
  await expect(bubble).toHaveCSS('opacity', '1');
  return { trigger, bubble };
}

/** Assert visible bevel geometry through the shared shell, independent of generated CSS names.
 * @param bubble The open contact dialog using the reusable pixel bubble.
 * @returns After both stepped contours and all four inset edges retain their legacy dimensions.
 */
async function expectWrappedBevel(bubble: Locator) {
  const shell = bubble.locator(':scope > div').first();
  await expect(shell).toHaveCSS('padding', '6px');
  const paint = await shell.evaluate((node) => {
    const content = node.firstElementChild!;
    const outerBounds = node.getBoundingClientRect();
    const innerBounds = content.getBoundingClientRect();
    const style = getComputedStyle(content);
    return {
      outerClip: getComputedStyle(node).clipPath,
      innerClip: style.clipPath,
      bevel: style.boxShadow,
      leftInset: innerBounds.left - outerBounds.left,
      rightInset: outerBounds.right - innerBounds.right,
      topInset: innerBounds.top - outerBounds.top,
      bottomInset: outerBounds.bottom - innerBounds.bottom,
      gradient: style.backgroundImage,
      blur: style.backdropFilter,
    };
  });
  expect(paint.outerClip).toMatch(/^polygon\(18px 0px, calc\(100% - 18px\) 0px,/);
  expect(paint.innerClip).toMatch(/^polygon\(12px 0px, calc\(100% - 12px\) 0px,/);
  expect(paint.outerClip.split(',')).toHaveLength(20);
  expect(paint.innerClip.split(',')).toHaveLength(20);
  expect(paint.outerClip).toContain('6px 6px');
  expect(paint.innerClip).toContain('6px 6px');
  expect(paint.bevel).toMatch(/6px 6px 0px 0px inset, .+ -6px -6px 0px 0px inset$/);
  for (const inset of [paint.leftInset, paint.rightInset, paint.topInset, paint.bottomInset])
    expect(inset).toBeCloseTo(6, 1);
  expect(paint.gradient).toContain('linear-gradient');
  expect(paint.blur).toBe('blur(3px)');
}

/** A bare chat silhouette keeps its accessible glow without acquiring a rectangular control frame. */
async function expectBareContactTrigger(trigger: Locator) {
  await expect(trigger).toHaveCSS('width', '44px');
  await expect(trigger).toHaveCSS('height', '44px');
  await expect(trigger).toHaveCSS('outline-style', 'none');
  await expect(trigger).toHaveCSS('box-shadow', 'none');
  await expect(trigger).toHaveCSS('border-top-width', '0px');
  await expect(trigger).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(trigger.locator('[data-icon-pulse="chat"] > svg')).toHaveCSS('width', '28px');
}

/** Establish an exact idle deadline after the controls and lazy contact surface have hydrated.
 * @param page Public page with Playwright's JavaScript clock installed before navigation.
 * @param paused Whether to suspend decoration through its real appearance control.
 * @param keyboard Whether to activate the trigger with keyboard rather than pointer modality.
 * @returns The idle disclosure and its trigger while timeout time remains frozen.
 */
async function openTimedContact(page: Page, paused = false, keyboard = false) {
  await expect(page.locator('[data-entering]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Background settings' }).click();
  await expect(page.getByRole('slider', { name: 'Blink frequency' })).toBeFocused();
  if (paused) await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Background settings' })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  const trigger = page.locator('[data-contact-trigger]:visible');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  if (keyboard) {
    await trigger.focus();
    expect(await trigger.evaluate((node) => node.matches(':focus-visible'))).toBe(true);
    await page.keyboard.press('Enter');
  } else await trigger.click();
  const bubble = page.locator('[data-contact-bubble]');
  await expect(bubble).toBeVisible();
  await expect(bubble).toHaveAttribute('data-appearing', 'false');
  await expect(bubble).toHaveCSS('opacity', '1');
  // Mount lazy modules with a running clock; engagement then clears any elapsed initial idle time.
  await bubble.hover();
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
  await page.mouse.move(1000, 700);
  return { trigger, bubble };
}

/** Sample the native opacity transition without replacing the property's authored paint.
 * @param bubble Contact disclosure that has just entered its idle fade-out state.
 * @returns After the real 400ms transition paints a partially transparent intermediate frame.
 */
async function expectInterpolatedFade(bubble: Locator) {
  const paint = await bubble.evaluate((node) => {
    // Reading the style flushes the attribute change before requesting its native transition.
    void getComputedStyle(node).opacity;
    const transition = node
      .getAnimations()
      .find(
        (animation): animation is CSSTransition =>
          animation instanceof CSSTransition && animation.transitionProperty === 'opacity',
      );
    if (!transition) return { duration: null, opacity: Number(getComputedStyle(node).opacity) };
    transition.pause();
    transition.currentTime = 200;
    return {
      duration: transition.effect?.getTiming().duration,
      opacity: Number(getComputedStyle(node).opacity),
    };
  });
  expect(paint.duration).toBe(400);
  expect(paint.opacity).toBeGreaterThan(0);
  expect(paint.opacity).toBeLessThan(1);
}

parityTest(
  'desktop contact preserves the wrapped pixel frame and bare pointer/keyboard trigger in every theme',
  async ({ page, context }, testInfo) => {
    test.setTimeout(60_000);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1440, height: 900 });
    const paragraphs = ['First introduction paragraph.', 'Backend systems and AI agents.'];
    // A client language transaction reads a fresh DTO instead of the generated first-locale cache.
    await page.route('**/api/portfolio/**', (route) => {
      const url = new URL(route.request().url());
      return route.fulfill({
        json: url.pathname.endsWith('/site')
          ? {
              ...siteFixture,
              chatme: {
                ...siteFixture.chatme,
                content: ` ${paragraphs[0]} \r\n\r\n  \n${paragraphs[1]}\n`,
              },
            }
          : endpointFixture(url),
      });
    });
    for (const theme of ['mint', 'blue', 'amber', 'mist']) {
      await context.addCookies([
        {
          name: 'portfolio-appearance',
          value: encodeURIComponent(JSON.stringify({ theme })),
          url: testInfo.project.use.baseURL ?? 'http://127.0.0.1:4173',
        },
      ]);
      await page.goto('/zh-Hant');
      await page.getByRole('button', { name: '切換語言', exact: true }).click();
      await page.getByRole('button', { name: 'English', exact: true }).click();
      await expect(page).toHaveURL(/\/en(?:#overview)?$/);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const { trigger, bubble } = await openContact(page);
      await expectBareContactTrigger(trigger);
      // Keep the manual offer engaged while checking every edge and capturing its settled paint.
      await bubble.hover();
      await expectWrappedBevel(bubble);
      await expect(bubble).toHaveCSS('width', '410px');
      const inner = bubble.locator(':scope > div > div').first();
      await expect(inner).toHaveCSS('padding', '15px 17px');
      const copy = bubble.locator('p.plain-text');
      await expect(copy).toHaveText(paragraphs);
      await expect(copy).toHaveCount(2);
      for (const paragraph of await copy.all())
        await expect(paragraph).toHaveCSS('margin', '7px 0px');
      const close = bubble.getByRole('button', { name: 'Close internship chatme', exact: true });
      await expect(close).toHaveCSS('width', '32px');
      await expect(close).toHaveCSS('height', '32px');
      await expect(close).toHaveCSS('top', '7px');
      await expect(close).toHaveCSS('right', '7px');
      await expect(close.locator('svg')).toHaveCSS('width', '12px');
      await expect(close.locator('svg')).toHaveCSS('height', '12px');
      const cta = bubble.getByRole('link', { name: 'Let’s talk', exact: true });
      await expect(cta).toHaveCSS('min-height', '34px');
      await expect(cta.locator('svg')).toHaveCSS('width', '13px');
      await expect(cta.locator('svg')).toHaveCSS('height', '13px');
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: testInfo.outputPath(`contact-wrapped-${theme}-desktop.png`) });
      await close.click();
      await expect(bubble).toHaveCount(0);
      await expect(trigger).toBeFocused();
      await expectBareContactTrigger(trigger);
      await page.mouse.move(1000, 800);
      const idleColor = await trigger.evaluate((node) => getComputedStyle(node).color);
      // Use real keyboard modality; a programmatic focus alone can inherit the last pointer action.
      await page.keyboard.press('Tab');
      await page.keyboard.press('Shift+Tab');
      await expect(trigger).toBeFocused();
      expect(await trigger.evaluate((node) => node.matches(':focus-visible'))).toBe(true);
      await expectBareContactTrigger(trigger);
      expect(
        await trigger.locator('svg').evaluate((node) => getComputedStyle(node).filter),
      ).toContain('drop-shadow');
      expect(await trigger.evaluate((node) => getComputedStyle(node).color)).not.toBe(idleColor);
      await page.keyboard.press('Enter');
      await expect(bubble).toBeVisible();
      await expectBareContactTrigger(trigger);
      await page.keyboard.press('Escape');
      await expect(bubble).toHaveCount(0);
      await expect(trigger).toBeFocused();
    }
  },
);

parityTest(
  'mobile contact retains its stepped wrap and generous close/email hit targets',
  async ({ page }, testInfo) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/en');
    const { trigger, bubble } = await openContact(page);
    await expectBareContactTrigger(trigger);
    await bubble.hover();
    await expectWrappedBevel(bubble);
    await expect(bubble).toHaveCSS('width', '350px');
    const close = bubble.getByRole('button', { name: 'Close internship chatme', exact: true });
    await expect(close).toHaveCSS('width', '44px');
    await expect(close).toHaveCSS('height', '44px');
    await expect(close).toHaveCSS('right', '4px');
    await expect(close.locator('svg')).toHaveCSS('width', '12px');
    const cta = bubble.getByRole('link', { name: 'Let’s talk', exact: true });
    await expect(cta).toHaveCSS('min-height', '44px');
    await expect(cta.locator('svg')).toHaveCSS('width', '14px');
    const bounds = (await bubble.boundingBox())!;
    const controls = (await page.locator('[data-profile-controls]').boundingBox())!;
    const header = (await page.locator('header[data-entrance-navigation]').boundingBox())!;
    expect(bounds.y).toBeCloseTo(header.y + header.height + 12, 1);
    const copy = (await bubble.locator('[data-contact-content]').boundingBox())!;
    const closeBounds = (await close.boundingBox())!;
    expect(copy.y).toBeGreaterThanOrEqual(controls.y + controls.height);
    expect(closeBounds.y).toBeGreaterThanOrEqual(controls.y + controls.height);
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(844);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: testInfo.outputPath('contact-wrapped-mobile.png') });
    await close.click();
    await expect(bubble).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expectBareContactTrigger(trigger);
    await trigger.click();
    await expect(bubble).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(bubble).toHaveCount(0);
    await expect(trigger).toBeFocused();
    // Short viewports keep the frame attached to chat while guarded copy can scroll.
    for (const width of [320, 760]) {
      await page.setViewportSize({ width, height: 430 });
      await trigger.click();
      await expect(bubble).toBeVisible();
      const compact = (await bubble.boundingBox())!;
      const top = (await page.locator('header[data-entrance-navigation]').boundingBox())!;
      expect(compact.y).toBeCloseTo(top.y + top.height + 12, 1);
      expect(compact.y + compact.height).toBeLessThanOrEqual(430);
      await bubble.getByRole('button', { name: 'Close internship chatme', exact: true }).click();
      await expect(bubble).toHaveCount(0);
    }
  },
);

test('startup contact does not steal appearance-menu focus or dismissal', async ({ page }) => {
  await page.goto('/en');
  await expect(page.locator('[data-contact-bubble]')).toBeVisible();
  const trigger = page.getByRole('button', { name: 'Background settings' });
  await trigger.click();
  await expect(page.getByRole('slider', { name: 'Blink frequency' })).toBeFocused();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
});

test('contact stays usable when decoration pauses or its optional mascot fails', async ({
  page,
}) => {
  await page.route('**/cow-engineer*.svg', (route) => route.abort());
  await page.goto('/en');
  await page.getByRole('button', { name: 'Background settings' }).click();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.keyboard.press('Escape');
  const trigger = page.locator('[data-contact-trigger]:visible');
  // Suspending entrance can finish its automatic offer before the manual interaction.
  if ((await trigger.getAttribute('aria-expanded')) === 'true') {
    await trigger.click();
    await expect(page.locator('[data-contact-bubble]')).toHaveCount(0);
  }
  await trigger.click();
  const bubble = page.locator('[data-contact-bubble]');
  await expect(bubble).toBeVisible();
  await expect(bubble).toHaveCSS('opacity', '1');
  await expect(bubble.locator('a[href="mailto:hello@example.com"]')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(bubble).toBeVisible();
  const rect = await bubble.boundingBox();
  expect(rect?.x).toBeGreaterThanOrEqual(0);
  expect((rect?.x ?? 0) + (rect?.width ?? 0)).toBeLessThanOrEqual(390);
  await page.keyboard.press('Escape');
  await expect(bubble).toHaveCount(0);
  await expect(page.locator('[data-contact-trigger]:visible')).toBeFocused();
});

parityTest(
  'idle contact fades, engagement rescues it, and leaving restarts the bounded timer',
  async ({ page }) => {
    await page.clock.install();
    await page.goto('/en');
    const { bubble } = await openTimedContact(page);
    await bubble.dispatchEvent('pointerover', { pointerType: 'mouse' });
    await bubble.dispatchEvent('pointerout', { pointerType: 'mouse', relatedTarget: null });
    await page.clock.runFor(2990);
    await expect(bubble).toHaveAttribute('data-fading', 'false');
    await expect(bubble).toHaveCSS('opacity', '1');
    await page.clock.runFor(50);
    await expect(bubble).toHaveAttribute('data-fading', 'true');
    await expectInterpolatedFade(bubble);
    await bubble.dispatchEvent('pointerover', { pointerType: 'mouse' });
    await expect(bubble).toHaveAttribute('data-fading', 'false');
    await expect(bubble).toHaveCSS('opacity', '1');
    await page.clock.runFor(5000);
    await expect(bubble).toBeVisible();
    await bubble.dispatchEvent('pointerout', { pointerType: 'mouse', relatedTarget: null });
    await page.clock.runFor(3401);
    await expect(bubble).toHaveCount(0);
  },
);

parityTest(
  'paused decoration keeps the contact idle fade visibly interpolated before dismissal',
  async ({ page }) => {
    await page.clock.install();
    await page.goto('/en');
    const { bubble } = await openTimedContact(page, true);
    await expect(page.locator('html')).toHaveAttribute('data-motion-paused', 'true');
    await page.clock.runFor(3040);
    await expect(bubble).toHaveAttribute('data-fading', 'true');
    await expectInterpolatedFade(bubble);
    await page.clock.runFor(400);
    await expect(bubble).toHaveCount(0);
  },
);

parityTest(
  'activating the contact trigger during fade rescues the mounted copy and restarts its idle interval',
  async ({ page }) => {
    await page.clock.install();
    await page.goto('/en');
    const { trigger, bubble } = await openTimedContact(page);
    await page.clock.runFor(3040);
    await expect(bubble).toHaveAttribute('data-fading', 'true');
    await trigger.click();
    await expect(bubble).toHaveAttribute('data-fading', 'false');
    await expect(bubble).toHaveAttribute('data-appearing', 'false');
    await expect(bubble).toHaveCSS('opacity', '1');
    await page.clock.runFor(2990);
    await expect(bubble).toHaveAttribute('data-fading', 'false');
    await page.clock.runFor(50);
    await expect(bubble).toHaveAttribute('data-fading', 'true');
    await expectInterpolatedFade(bubble);
    await page.clock.runFor(400);
    await expect(bubble).toHaveCount(0);
  },
);

parityTest(
  'automatic contact finishes its brief appearance before counting the full idle interval',
  async ({ page }) => {
    type AppearanceCapture = {
      mountedAt: number;
      initiallyAppearing: boolean;
      appearedAt: number | null;
      animation: { duration: number | string | null; fill: string | null } | null;
      sample: { opacity: number; currentTime: number | null } | null;
    };
    await page.clock.install();
    await page.addInitScript(() => {
      let capture: AppearanceCapture | undefined;
      const observer = new MutationObserver(() => {
        const bubble = document.querySelector('[data-contact-bubble]');
        if (!bubble) return;
        if (!capture) {
          // Capture the brief initial phase at its DOM commit instead of relying on host polling.
          capture = {
            mountedAt: Date.now(),
            initiallyAppearing: bubble.getAttribute('data-appearing') === 'true',
            appearedAt: null,
            animation: null,
            sample: null,
          };
          Object.defineProperty(window, '__contactAppearance', { value: capture });
          void getComputedStyle(bubble).opacity;
          const animation = bubble
            .getAnimations()
            .find(
              (candidate): candidate is CSSAnimation =>
                candidate instanceof CSSAnimation &&
                candidate.animationName.includes('contact-enter'),
            );
          if (animation) {
            const timing = animation.effect?.getTiming();
            capture.animation = {
              duration:
                typeof timing?.duration === 'number' || typeof timing?.duration === 'string'
                  ? timing.duration
                  : null,
              fill: timing?.fill ?? null,
            };
            const mountedCapture = capture;
            // Read genuine mid-entrance paint; neither seek nor pause the authored animation.
            setTimeout(() => {
              if (!bubble.isConnected || bubble.getAttribute('data-appearing') !== 'true') return;
              mountedCapture.sample = {
                opacity: Number(getComputedStyle(bubble).opacity),
                currentTime:
                  typeof animation.currentTime === 'number' ? animation.currentTime : null,
              };
            }, 200);
          }
        }
        if (bubble.getAttribute('data-appearing') !== 'false') return;
        capture.appearedAt = Date.now();
        observer.disconnect();
      });
      observer.observe(document, { attributes: true, childList: true, subtree: true });
    });
    await page.goto('/en');
    const bubble = page.locator('[data-contact-bubble]');
    await page.waitForFunction(() => {
      const capture = (window as unknown as { __contactAppearance?: AppearanceCapture })
        .__contactAppearance;
      return !!capture && capture.appearedAt !== null;
    });
    const entrance = await page.evaluate(
      () => (window as unknown as { __contactAppearance: AppearanceCapture }).__contactAppearance,
    );
    expect(entrance.initiallyAppearing).toBe(true);
    expect(entrance.animation?.duration).toBe(400);
    expect(entrance.animation?.fill).toBe('backwards');
    expect(entrance.sample?.currentTime).toBeGreaterThan(150);
    expect(entrance.sample?.currentTime).toBeLessThan(300);
    expect(entrance.sample?.opacity).toBeGreaterThan(0);
    expect(entrance.sample?.opacity).toBeLessThan(1);
    // The mounted copy receives its full brief entrance, with a bounded rendering tolerance.
    expect(entrance.appearedAt! - entrance.mountedAt).toBeGreaterThanOrEqual(350);
    expect(entrance.appearedAt! - entrance.mountedAt).toBeLessThan(600);
    // Keep hydration and the finite entrance running; freeze only after their actual phase change.
    await expect(bubble).toHaveAttribute('data-appearing', 'false');
    await expect(bubble).toHaveCSS('opacity', '1');
    await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
    const remaining = await page.evaluate(
      () =>
        3000 -
        (Date.now() -
          (window as unknown as { __contactAppearance: AppearanceCapture }).__contactAppearance
            .appearedAt!),
    );
    expect(remaining).toBeGreaterThan(2000);
    // A small render margin avoids pretending the observer and passive timer effect are simultaneous.
    await page.clock.runFor(remaining - 100);
    await expect(bubble).toHaveAttribute('data-fading', 'false');
    await page.clock.runFor(150);
    await expect(bubble).toHaveAttribute('data-fading', 'true');
    await expectInterpolatedFade(bubble);
    await page.clock.runFor(400);
    await expect(bubble).toHaveCount(0);
  },
);

parityTest(
  'a delayed contact enhancement preserves basic contact and receives a fresh full idle interval',
  async ({ page }) => {
    type DelayedAppearance = { mountedAt: number | null; appearedAt: number | null };
    await page.clock.install();
    await page.addInitScript(() => {
      const capture: DelayedAppearance = { mountedAt: null, appearedAt: null };
      Object.defineProperty(window, '__delayedContactAppearance', { value: capture });
      const observer = new MutationObserver(() => {
        const bubble = document.querySelector('[data-contact-bubble]');
        if (!bubble) return;
        capture.mountedAt ??= Date.now();
        if (bubble.getAttribute('data-appearing') !== 'false') return;
        capture.appearedAt = Date.now();
        observer.disconnect();
      });
      observer.observe(document, { attributes: true, childList: true, subtree: true });
    });
    let chunkRequested!: () => void;
    let releaseChunk!: () => void;
    const requested = new Promise<void>((resolve) => (chunkRequested = resolve));
    const gate = new Promise<void>((resolve) => (releaseChunk = resolve));
    // Hold the same optional module in production and cold development, after fetching its response.
    await page.route(
      /\/(?:assets\/ContactBubble-[^/]+\.js|src\/features\/site\/components\/ContactBubble\.tsx)(?:\?.*)?$/,
      async (route) => {
        const response = await route.fetch();
        chunkRequested();
        await gate;
        await route.fulfill({ response });
      },
    );
    try {
      await page.goto('/en');
      await requested;
      const fallback = page.getByRole('dialog', { name: siteFixture.chatme.title, exact: true });
      const bubble = page.locator('[data-contact-bubble]');
      await expect(fallback.getByRole('status')).toHaveAttribute('aria-busy', 'true');
      await expect(fallback.getByRole('link', { name: 'Let’s talk', exact: true })).toHaveAttribute(
        'href',
        'mailto:hello@example.com',
      );
      await expect(fallback.getByRole('button', { name: 'Close', exact: true })).toBeVisible();
      // Real hover belongs to the outgoing bottom-right surface, not the later anchored bubble.
      await fallback.hover();
      await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
      await page.clock.runFor(1200);
      await expect(bubble).toHaveCount(0);
      await expect(fallback.getByRole('status')).toHaveAttribute('aria-busy', 'true');
      releaseChunk();
      // Let React's lazy commit and the real entrance finish before freezing timeout time again.
      await page.clock.resume();
      await page.waitForFunction(() => {
        const capture = (window as unknown as { __delayedContactAppearance: DelayedAppearance })
          .__delayedContactAppearance;
        return capture.appearedAt !== null;
      });
      await expect(bubble).toHaveAttribute('data-appearing', 'false');
      await expect(bubble).toHaveCSS('opacity', '1');
      expect(await bubble.evaluate((node) => node.matches(':hover'))).toBe(false);
      await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
      const remaining = await page.evaluate(
        () =>
          3000 -
          (Date.now() -
            (window as unknown as { __delayedContactAppearance: DelayedAppearance })
              .__delayedContactAppearance.appearedAt!),
      );
      expect(remaining).toBeGreaterThan(2000);
      await page.clock.runFor(remaining - 100);
      await expect(bubble).toHaveAttribute('data-fading', 'false');
      await expect(bubble).toHaveCSS('opacity', '1');
      await page.clock.runFor(150);
      await expect(bubble).toHaveAttribute('data-fading', 'true');
      await expectInterpolatedFade(bubble);
      await page.clock.runFor(400);
      await expect(bubble).toHaveCount(0);
    } finally {
      releaseChunk();
    }
  },
);

// Deliberately failed optional imports emit browser errors; verify their contained recovery instead.
test('failed contact enhancement retains basic contact and the bounded idle fade', async ({
  page,
}) => {
  await page.clock.install();
  await page.route(
    /\/(?:assets\/ContactBubble-[^/]+\.js|src\/features\/site\/components\/ContactBubble\.tsx)(?:\?.*)?$/,
    (route) => route.abort(),
  );
  await page.goto('/en');
  const fallback = page.locator('[data-contact-fallback="failed"]');
  await expect(fallback.getByRole('status')).toHaveAttribute('aria-busy', 'false');
  await expect(fallback.getByRole('link', { name: 'Let’s talk', exact: true })).toHaveAttribute(
    'href',
    'mailto:hello@example.com',
  );
  await expect(fallback.getByRole('button', { name: 'Close', exact: true })).toBeVisible();
  await expect(page.locator('h1')).toContainText(siteFixture.profile.firstName);
  // Engagement grants the recovery copy a fresh interval after hydration, just like the enhanced copy.
  await fallback.hover();
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
  // Recovery sits at the bottom-right; leave to the opposite edge instead of hovering its email row.
  await page.mouse.move(10, 700);
  await page.clock.runFor(2990);
  await expect(fallback).toHaveAttribute('data-fading', 'false');
  await page.clock.runFor(50);
  await expect(fallback).toHaveAttribute('data-fading', 'true');
  await expectInterpolatedFade(fallback);
  await page.clock.runFor(400);
  await expect(fallback).toHaveCount(0);
  await expect(page.locator('[data-contact-trigger]:visible')).toHaveAttribute(
    'aria-expanded',
    'false',
  );
});

parityTest(
  'pointer-focused contact copy does not pin its idle disclosure open',
  async ({ page }) => {
    await page.clock.install();
    await page.goto('/en');
    const { bubble } = await openTimedContact(page);
    const cta = bubble.getByRole('link', { name: 'Let’s talk', exact: true });
    // Prevent only the external mail navigation while preserving the actual pointer focus action.
    await cta.evaluate((node) =>
      node.addEventListener('click', (event) => event.preventDefault(), { once: true }),
    );
    await cta.click();
    await expect(cta).toBeFocused();
    expect(await cta.evaluate((node) => node.matches(':focus-visible'))).toBe(false);
    await page.mouse.move(1000, 700);
    await page.clock.runFor(3040);
    await expect(bubble).toHaveAttribute('data-fading', 'true');
    await expectInterpolatedFade(bubble);
    await page.clock.runFor(400);
    await expect(bubble).toHaveCount(0);
  },
);

parityTest(
  'keyboard contact-copy focus pauses inactivity and leaving it restarts the timer',
  async ({ page }) => {
    await page.clock.install();
    await page.goto('/en');
    const { trigger, bubble } = await openTimedContact(page);
    const cta = bubble.getByRole('link', { name: 'Let’s talk', exact: true });
    await page.keyboard.press('Tab');
    await cta.focus();
    await expect(cta).toBeFocused();
    expect(await cta.evaluate((node) => node.matches(':focus-visible'))).toBe(true);
    await page.clock.runFor(5000);
    await expect(bubble).toHaveAttribute('data-fading', 'false');
    await expect(bubble).toHaveCSS('opacity', '1');
    // A focused icon is outside the copy; focusout must resume rather than retain the old pause.
    await trigger.focus();
    await expect(trigger).toBeFocused();
    await page.clock.runFor(2990);
    await expect(bubble).toHaveAttribute('data-fading', 'false');
    await page.clock.runFor(50);
    await expect(bubble).toHaveAttribute('data-fading', 'true');
    await page.clock.runFor(400);
    await expect(bubble).toHaveCount(0);
  },
);

parityTest(
  'keyboard activation of the chat icon still expires after its idle interval',
  async ({ page }) => {
    await page.clock.install();
    await page.goto('/en');
    const { trigger, bubble } = await openTimedContact(page, false, true);
    await expect(trigger).toBeFocused();
    await page.clock.runFor(3040);
    await expect(bubble).toHaveAttribute('data-fading', 'true');
    await expectInterpolatedFade(bubble);
    await page.clock.runFor(400);
    await expect(bubble).toHaveCount(0);
  },
);
