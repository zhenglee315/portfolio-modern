import { expect, type Locator, type Page } from '@playwright/test';
import { runtimeTest as test } from '../fixtures/browser';

type Feature = 'projects' | 'experiences';
type PulseSample = {
  count: number;
  name: string | null;
  state: AnimationPlayState | null;
  beforeTime: number | null;
  currentTime: number | null;
  beforeShadow: string;
  shadow: string;
  duration: number | string | null;
  easing: string | null;
  frameEasings: string[];
  infinite: boolean;
  keyframes: number;
};

/** Inspect the running pseudo-element effect, rather than accepting an unresolved CSS name.
 * @param element Card or month group that owns the visible timeline point.
 * @param frames Number of painted frames over which to measure motion or a frozen pause.
 * @returns Real CSS animation identity, timing and computed ring paint before/after those frames.
 */
async function samplePulse(element: Element, frames: number): Promise<PulseSample> {
  const animations = element
    .getAnimations({ subtree: true })
    .filter(
      (animation): animation is CSSAnimation =>
        animation instanceof CSSAnimation &&
        animation.effect instanceof KeyframeEffect &&
        animation.effect.target === element &&
        animation.effect.pseudoElement === '::before',
    );
  const animation = animations[0];
  const beforeTime = typeof animation?.currentTime === 'number' ? animation.currentTime : null;
  const beforeShadow = getComputedStyle(element, '::before').boxShadow;
  for (let frame = 0; frame < frames; frame++)
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  const effect = animation?.effect as KeyframeEffect | undefined;
  const timing = effect?.getTiming();
  return {
    count: animations.length,
    name: animation?.animationName ?? null,
    state: animation?.playState ?? null,
    beforeTime,
    currentTime: typeof animation?.currentTime === 'number' ? animation.currentTime : null,
    beforeShadow,
    shadow: getComputedStyle(element, '::before').boxShadow,
    duration:
      typeof timing?.duration === 'number' || typeof timing?.duration === 'string'
        ? timing.duration
        : (timing?.duration?.toString() ?? null),
    // CSS applies animation-timing-function between keyframes; the effect-level easing stays linear.
    easing: animation ? getComputedStyle(element, '::before').animationTimingFunction : null,
    frameEasings: effect?.getKeyframes().map((frame) => frame.easing) ?? [],
    infinite: timing?.iterations === Infinity,
    keyframes: effect?.getKeyframes().length ?? 0,
  };
}

/** Reuse the same effect probe for each point so collection-wide selection cannot double up. */
async function activePoints(points: Locator) {
  const samples = await Promise.all(
    Array.from({ length: await points.count() }, (_, index) =>
      points.nth(index).evaluate(samplePulse, 0),
    ),
  );
  return samples.filter((sample) => sample.count > 0).length;
}

/** Read point owners without relying on generated CSS Module hashes. */
function timelinePoints(page: Page, feature: Feature) {
  const collection = page.locator(`[data-timeline-collection='${feature}']`);
  return collection.locator(
    feature === 'projects' ? '[class*="project-group-cards"]' : '[class*="experience-card"]',
  );
}

/** Read the shared distinct-month fixtures through normal static or development delivery. */
async function openTimelines(page: Page) {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.mouse.move(5, 5);
  await page.goto('/en');
  await expect(page.locator('html')).toHaveAttribute('data-motion-paused', 'false');
  await expect(page.locator('[data-entering]')).toHaveCount(0);
  for (const feature of ['projects', 'experiences'] as const)
    await expect(timelinePoints(page, feature)).toHaveCount(6);
  await page.mouse.move(5, 5);
}

/** Both responsive axes must use the original outer diameter, including the Bootstrap reset. */
test('timeline points retain twelve pixel outer circles and their mobile and desktop axes', async ({
  page,
}) => {
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await openTimelines(page);
    for (const feature of ['projects', 'experiences'] as const) {
      const point = timelinePoints(page, feature).first();
      const geometry = await point.evaluate((element, kind) => {
        const timeline = element.closest(
          kind === 'projects' ? '[class*="project-timeline"]' : '[class*="timeline"]',
        )!;
        const circle = getComputedStyle(element, '::before');
        const axis = getComputedStyle(timeline, '::before');
        const outerWidth =
          parseFloat(circle.width) +
          (circle.boxSizing === 'border-box'
            ? 0
            : parseFloat(circle.borderLeftWidth) + parseFloat(circle.borderRightWidth));
        const translation = (transform: string) =>
          transform === 'none' ? 0 : new DOMMatrixReadOnly(transform).m41;
        const center =
          element.getBoundingClientRect().left +
          parseFloat(getComputedStyle(element).borderLeftWidth) +
          parseFloat(circle.left) +
          translation(circle.transform) +
          outerWidth / 2;
        const axisCenter =
          timeline.getBoundingClientRect().left +
          parseFloat(getComputedStyle(timeline).borderLeftWidth) +
          parseFloat(axis.left) +
          translation(axis.transform) +
          parseFloat(axis.width) / 2;
        return {
          width: outerWidth,
          height: parseFloat(circle.height),
          border: circle.borderTopWidth,
          sizing: circle.boxSizing,
          radius: circle.borderRadius,
          offset: Math.abs(center - axisCenter),
        };
      }, feature);
      expect(geometry.width).toBe(12);
      expect(geometry.height).toBe(12);
      expect(geometry.border).toBe('2px');
      expect(geometry.sizing).toBe('border-box');
      expect(geometry.radius).toBe('50%');
      expect(geometry.offset).toBeLessThanOrEqual(1);
    }
  }
});

/** A computed animation-name alone previously passed while the scoped keyframe did not exist. */
test('the selected timeline point truly breathes and hover transfers its single heartbeat', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openTimelines(page);
  for (const feature of ['projects', 'experiences'] as const) {
    const points = timelinePoints(page, feature);
    const first = points.first();
    const second = points.nth(1);
    await expect.poll(() => activePoints(points)).toBe(1);
    await expect.poll(() => first.evaluate(samplePulse, 0).then((sample) => sample.count)).toBe(1);
    const moving = await first.evaluate(samplePulse, 4);
    expect(moving.name).toBe('timeline-point-breathe');
    expect(moving.state).toBe('running');
    expect(moving.duration).toBe(2200);
    expect(moving.easing).toBe('ease-in-out');
    expect(moving.frameEasings.every((easing) => easing === 'ease-in-out')).toBe(true);
    expect(moving.infinite).toBe(true);
    expect(moving.keyframes).toBeGreaterThan(1);
    expect(moving.beforeTime).not.toBeNull();
    expect(moving.currentTime!).toBeGreaterThan(moving.beforeTime!);
    expect(moving.shadow).not.toBe(moving.beforeShadow);
    await second.hover();
    await expect.poll(() => first.evaluate(samplePulse, 0).then((sample) => sample.count)).toBe(0);
    await expect.poll(() => second.evaluate(samplePulse, 0).then((sample) => sample.count)).toBe(1);
    await expect.poll(() => activePoints(points)).toBe(1);
    await page.mouse.move(5, 5);
    await expect.poll(() => first.evaluate(samplePulse, 0).then((sample) => sample.count)).toBe(1);
    await expect.poll(() => second.evaluate(samplePulse, 0).then((sample) => sample.count)).toBe(0);
  }
});

/** Historical rows share their section's selection instead of starting another default pulse. */
test('expanding history keeps one active point and hovering extra rows suppresses the preview', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openTimelines(page);
  for (const feature of ['projects', 'experiences'] as const) {
    const section = page.locator(feature === 'projects' ? '#projects' : '#experience');
    const points = timelinePoints(page, feature);
    await section
      .getByRole('button', {
        name: feature === 'projects' ? 'Show more projects' : 'Show more experience',
        exact: false,
      })
      .click();
    await expect(points).toHaveCount(feature === 'projects' ? 12 : 8);
    await page.mouse.move(5, 5);
    const first = points.first();
    const extra = points.nth(6);
    await expect.poll(() => activePoints(points)).toBe(1);
    await expect.poll(() => first.evaluate(samplePulse, 0).then((sample) => sample.count)).toBe(1);
    await expect.poll(() => extra.evaluate(samplePulse, 0).then((sample) => sample.count)).toBe(0);
    await extra.hover();
    await expect.poll(() => first.evaluate(samplePulse, 0).then((sample) => sample.count)).toBe(0);
    await expect.poll(() => extra.evaluate(samplePulse, 0).then((sample) => sample.count)).toBe(1);
    await expect.poll(() => activePoints(points)).toBe(1);
    await page.mouse.move(5, 5);
    await expect.poll(() => first.evaluate(samplePulse, 0).then((sample) => sample.count)).toBe(1);
    await expect.poll(() => extra.evaluate(samplePulse, 0).then((sample) => sample.count)).toBe(0);
  }
});

/** Pause freezes the real effect; reduced motion removes it while preserving the selected dot. */
test('timeline heartbeat freezes and resumes with preferences and respects reduced motion', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openTimelines(page);
  await page.getByRole('button', { name: 'Background settings' }).click();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-motion-paused', 'true');
  for (const feature of ['projects', 'experiences'] as const) {
    const point = timelinePoints(page, feature).first();
    await expect
      .poll(() => point.evaluate(samplePulse, 0).then((sample) => sample.state))
      .toBe('paused');
    const frozen = await point.evaluate(samplePulse, 4);
    expect(frozen.count).toBe(1);
    expect(frozen.currentTime).toBe(frozen.beforeTime);
    expect(frozen.shadow).toBe(frozen.beforeShadow);
  }
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-motion-paused', 'false');
  await page.keyboard.press('Escape');
  for (const feature of ['projects', 'experiences'] as const) {
    const point = timelinePoints(page, feature).first();
    await expect
      .poll(() => point.evaluate(samplePulse, 0).then((sample) => sample.state))
      .toBe('running');
    const moving = await point.evaluate(samplePulse, 4);
    expect(moving.currentTime!).toBeGreaterThan(moving.beforeTime!);
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('html')).toHaveAttribute('data-motion-paused', 'true');
  for (const feature of ['projects', 'experiences'] as const) {
    const point = timelinePoints(page, feature).first();
    await expect.poll(() => point.evaluate(samplePulse, 0).then((sample) => sample.count)).toBe(0);
    const circle = await point.evaluate((element) => {
      const style = getComputedStyle(element, '::before');
      return {
        width: style.width,
        background: style.backgroundColor,
        border: style.borderTopColor,
      };
    });
    expect(circle.width).toBe('12px');
    expect(circle.background).toBe(circle.border);
  }
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(page.locator('html')).toHaveAttribute('data-motion-paused', 'false');
  for (const feature of ['projects', 'experiences'] as const)
    await expect.poll(() => activePoints(timelinePoints(page, feature))).toBe(1);
});
