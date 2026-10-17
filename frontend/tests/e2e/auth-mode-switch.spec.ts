import { expect } from '@playwright/test';
import { runtimeTest as test } from '../fixtures/browser';

test('form views contract under the pointer, restore cancelled input and clear credentials on commit', async ({
  page,
}) => {
  await page.goto('/en?view=login');
  const control = page.getByRole('group', { name: 'Account access' });
  await expect(control).toBeVisible();
  await page.getByLabel('Email', { exact: true }).fill('person@example.com');
  await page.getByLabel('Password', { exact: true }).fill('private-password');
  const box = (await control.boundingBox())!;
  const x = box.x + box.width / 4;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + box.width / 5, y, { steps: 8 });
  const preview = page.locator('[data-auth-preview]');
  await expect(preview).toHaveAttribute('inert', '');
  await expect(preview).toHaveAttribute('aria-hidden', 'true');
  const samples = await page.locator('[data-auth-form-view]').evaluateAll((nodes) =>
    nodes.map((node) => {
      const style = getComputedStyle(node);
      const transform = new DOMMatrix(style.transform);
      return {
        preview: node.hasAttribute('data-auth-preview'),
        width: (node as HTMLElement).offsetWidth,
        opacity: Number(style.opacity),
        x: transform.m41,
        y: transform.m42,
        scaleX: transform.m11,
        scaleY: transform.m22,
        blur: Number.parseFloat(style.filter.replace('blur(', '')),
      };
    }),
  );
  expect(samples).toHaveLength(2);
  expect(samples[0]!.x).toBeLessThan(0);
  expect(samples[1]!.x).toBeGreaterThan(0);
  expect(samples[0]!.width).toBeCloseTo(samples[1]!.width, 0);
  for (const sample of samples) {
    expect(sample.opacity).toBeGreaterThan(0);
    expect(sample.opacity).toBeLessThan(1);
    expect(Math.abs(sample.x)).toBeLessThan(14);
    expect(sample.y).toBeLessThan(0);
    expect(sample.scaleX).toBeGreaterThan(0.9);
    expect(sample.scaleX).toBeLessThan(1);
    expect(sample.scaleY).toBeGreaterThan(0.8);
    expect(sample.scaleY).toBeLessThan(sample.scaleX);
    expect(sample.blur).toBeGreaterThan(0);
    expect(sample.blur).toBeLessThan(2.5);
  }
  expect(
    await preview
      .locator('input')
      .evaluateAll((inputs) =>
        inputs.every(
          (input) =>
            (input as HTMLInputElement).disabled && (input as HTMLInputElement).value === '',
        ),
      ),
  ).toBe(true);
  await expect(page.locator('[data-auth-panel] form')).toHaveCount(1);
  await expect(page.getByLabel('Email', { exact: true })).toHaveCount(1);
  await page.mouse.up();
  await expect(preview).toHaveCount(0);
  const restored = page.locator('[data-auth-form-view]:not([data-auth-preview])');
  await expect(restored).not.toHaveAttribute('data-slide-phase');
  await expect(restored).toHaveCSS('transform', 'none');
  await expect(restored).toHaveCSS('filter', 'none');
  await expect(restored).toHaveCSS('opacity', '1');
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue('person@example.com');
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('private-password');

  await control.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();
  await expect(preview).toHaveCount(0);
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('');
  for (let index = 0; index < 4; index++) {
    await control
      .getByRole('button')
      .nth(index % 2)
      .click();
  }
  await expect(control).toHaveAttribute('data-mode', 'register');
  await expect(preview).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Create your account' })).toBeFocused();
});

test('click switches contract and rebound, retaining rendered styles when reversed immediately', async ({
  page,
}) => {
  await page.goto('/en?view=login');
  const control = page.getByRole('group', { name: 'Account access' });
  await expect(control).toBeVisible();
  const motion = await control.evaluate(async (node) => {
    const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const sample = () =>
      Array.from(document.querySelectorAll<HTMLElement>('[data-auth-form-view]')).map((view) => {
        const style = getComputedStyle(view);
        const transform =
          style.transform === 'none' ? new DOMMatrix() : new DOMMatrix(style.transform);
        return {
          mode: view.dataset.authFormView,
          preview: view.hasAttribute('data-auth-preview'),
          phase: view.dataset.slidePhase,
          opacity: Number(style.opacity),
          x: transform.m41,
          y: transform.m42,
          scaleX: transform.m11,
          scaleY: transform.m22,
          blur: style.filter === 'none' ? 0 : Number.parseFloat(style.filter.replace('blur(', '')),
        };
      });
    const frames: ReturnType<typeof sample>[] = [];
    node.querySelectorAll<HTMLButtonElement>('button')[1]!.click();
    const start = performance.now();
    let animated = false;
    while (performance.now() - start < 1200) {
      await frame();
      const views = sample();
      frames.push(views);
      animated ||= views.some((view) => view.phase === 'animate');
      if (animated && views.length === 1 && !views[0]!.phase) break;
    }
    return frames;
  });
  const outgoing = motion.flat().filter((view) => view.mode === 'login');
  const incoming = motion.flat().filter((view) => view.mode === 'register');
  expect(outgoing.some((view) => view.scaleY < 0.99 && view.opacity < 1 && view.blur > 0)).toBe(
    true,
  );
  expect(incoming.some((view) => view.scaleY < 0.99 && view.opacity < 1)).toBe(true);
  expect(incoming.some((view) => view.scaleY > 1.0005)).toBe(true);
  expect(motion.flat().every((view) => Math.abs(view.x) < 20)).toBe(true);
  await expect(page.locator('[data-auth-preview]')).toHaveCount(0);
  await expect(control).toHaveAttribute('data-mode', 'register');

  const reversal = await control.evaluate(async (node) => {
    const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const sample = () =>
      Array.from(document.querySelectorAll<HTMLElement>('[data-auth-form-view]')).map((view) => {
        const style = getComputedStyle(view);
        const transform =
          style.transform === 'none' ? new DOMMatrix() : new DOMMatrix(style.transform);
        return {
          mode: view.dataset.authFormView,
          phase: view.dataset.slidePhase,
          inlineOpacity: view.style.opacity,
          transition: style.transition,
          opacity: Number(style.opacity),
          x: transform.m41,
          y: transform.m42,
          scaleX: transform.m11,
          scaleY: transform.m22,
          blur: style.filter === 'none' ? 0 : Number.parseFloat(style.filter.replace('blur(', '')),
        };
      });
    node.querySelectorAll<HTMLButtonElement>('button')[0]!.click();
    const start = performance.now();
    let before = sample();
    while (performance.now() - start < 1200) {
      await frame();
      before = sample();
      if (performance.now() - start > 110 && before.some((view) => view.phase === 'animate')) break;
    }
    // Reverse inside this frame; the next rendered frame must preserve both sampled views.
    node.querySelectorAll<HTMLButtonElement>('button')[1]!.click();
    await frame();
    return { before, after: sample() };
  });
  expect(reversal.before).toHaveLength(2);
  expect(reversal.after).toHaveLength(2);
  for (const before of reversal.before) {
    const after = reversal.after.find((view) => view.mode === before.mode)!;
    expect(after.phase).toBe('prepare');
    expect(after.opacity, JSON.stringify(reversal)).toBeCloseTo(before.opacity, 3);
    expect(after.x).toBeCloseTo(before.x, 3);
    expect(after.y).toBeCloseTo(before.y, 3);
    expect(after.scaleX).toBeCloseTo(before.scaleX, 3);
    expect(after.scaleY).toBeCloseTo(before.scaleY, 3);
    expect(after.blur).toBeCloseTo(before.blur, 3);
  }
  await expect(control).toHaveAttribute('data-mode', 'register');
  await expect(page.locator('[data-auth-preview]')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Create your account' })).toBeFocused();
});

test('reduced motion switches account forms immediately without an animated preview', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/en?view=login');
  const control = page.getByRole('group', { name: 'Account access' });
  await control.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.locator('[data-auth-preview]')).toHaveCount(0);
  await expect(page.locator('[data-slide-phase]')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Create your account' })).toBeFocused();
});

test('dragging during a click transition preserves the rendered pose and settles cancellation or commit', async ({
  page,
}) => {
  await page.goto('/en?view=login');
  const control = page.getByRole('group', { name: 'Account access' });
  await expect(control).toBeVisible();

  for (const commit of [false, true]) {
    const mode = commit ? 'login' : 'register';
    await control
      .getByRole('button')
      .nth(commit ? 0 : 1)
      .click();
    await expect(
      page.locator(`[data-auth-form-view="${mode}"]:not([data-auth-preview])`),
    ).toHaveAttribute('data-slide-phase', 'animate');
    const box = (await control.boundingBox())!;
    const x = box.x + box.width * (commit ? 0.25 : 0.75);
    const y = box.y + box.height / 2;
    const direction = commit ? 1 : -1;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await control.evaluate((node) => {
      // Sample in native capture, immediately before React handles the first drag movement.
      node.addEventListener(
        'pointermove',
        () => {
          const views = Array.from(
            document.querySelectorAll<HTMLElement>('[data-auth-form-view]'),
          ).map((view) => {
            const style = getComputedStyle(view);
            const transform = new DOMMatrix(style.transform);
            return {
              mode: view.dataset.authFormView,
              phase: view.dataset.slidePhase,
              x: transform.m41,
              y: transform.m42,
              scaleX: transform.m11,
              scaleY: transform.m22,
              opacity: Number(style.opacity),
              blur:
                style.filter === 'none' ? 0 : Number.parseFloat(style.filter.replace('blur(', '')),
            };
          });
          node.setAttribute('data-before-drag', JSON.stringify(views));
        },
        { capture: true, once: true },
      );
    });
    await page.mouse.move(x + direction * 12, y);
    const interrupted = await control.evaluate((node) => {
      const after = Array.from(document.querySelectorAll<HTMLElement>('[data-auth-form-view]')).map(
        (view) => {
          const style = getComputedStyle(view);
          const transform = new DOMMatrix(style.transform);
          return {
            mode: view.dataset.authFormView,
            phase: view.dataset.slidePhase,
            x: transform.m41,
            y: transform.m42,
            scaleX: transform.m11,
            scaleY: transform.m22,
            opacity: Number(style.opacity),
            blur:
              style.filter === 'none' ? 0 : Number.parseFloat(style.filter.replace('blur(', '')),
          };
        },
      );
      const before = JSON.parse(node.getAttribute('data-before-drag')!) as typeof after;
      node.removeAttribute('data-before-drag');
      return { before, after };
    });
    expect(interrupted.before).toHaveLength(2);
    expect(interrupted.after).toHaveLength(2);
    for (const before of interrupted.before) {
      const after = interrupted.after.find((view) => view.mode === before.mode)!;
      expect(before.phase).toBe('animate');
      expect(after.phase).toBe('drag');
      expect(after.x).toBeCloseTo(before.x, 3);
      expect(after.y).toBeCloseTo(before.y, 3);
      expect(after.scaleX).toBeCloseTo(before.scaleX, 3);
      expect(after.scaleY).toBeCloseTo(before.scaleY, 3);
      expect(after.opacity).toBeCloseTo(before.opacity, 3);
      expect(after.blur).toBeCloseTo(before.blur, 3);
    }

    await page.mouse.move(x + direction * box.width * (commit ? 0.35 : 0.1), y, { steps: 6 });
    await page.mouse.up();
    await expect(control).toHaveAttribute('data-mode', 'register');
    await expect(page.locator('[data-auth-preview]')).toHaveCount(0);
    const settled = page.locator('[data-auth-form-view]:not([data-auth-preview])');
    await expect(settled).not.toHaveAttribute('data-slide-phase');
    await expect(settled).toHaveCSS('transform', 'none');
    await expect(settled).toHaveCSS('filter', 'none');
    await expect(settled).toHaveCSS('opacity', '1');
    await expect(page.locator('[data-auth-panel] form')).toHaveCount(1);
    await expect(page.getByLabel('Email', { exact: true })).toHaveValue('');
    await expect(page.getByRole('heading', { name: 'Create your account' })).toBeFocused();
  }
});

test('account switch follows mouse drags, snaps back for short drags and retains keyboard activation', async ({
  page,
}) => {
  await page.goto('/en?view=login');
  const control = page.getByRole('group', { name: 'Account access' });
  await expect(control).toBeVisible();
  await page.getByLabel('Email', { exact: true }).fill('person@example.com');
  const box = (await control.boundingBox())!;
  const x = box.x + box.width / 4;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + box.width / 8, y, { steps: 5 });
  await expect(control).toHaveAttribute('data-dragging', '');
  const offset = await control.evaluate((node) =>
    Number.parseFloat((node as HTMLElement).style.getPropertyValue('--auth-mode-offset')),
  );
  expect(offset).toBeGreaterThan(0);
  expect(offset).toBeLessThan(50);
  await page.mouse.up();
  await expect(control).toHaveAttribute('data-mode', 'login');
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue('person@example.com');

  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + box.width / 2, y, { steps: 10 });
  await page.mouse.up();
  await expect(control).toHaveAttribute('data-mode', 'register');
  await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue('');
  await control.getByRole('button', { name: 'Sign in', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(control).toHaveAttribute('data-mode', 'login');
  await control.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(control).toHaveAttribute('data-mode', 'register');
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 820, height: 1180 },
]) {
  test.describe(`touch account switch at ${viewport.width}px`, () => {
    test.use({ viewport, hasTouch: true });

    test('supports both drag directions and restores selection after cancellation or vertical gestures', async ({
      page,
      context,
    }) => {
      await page.goto('/en?view=login');
      const control = page.getByRole('group', { name: 'Account access' });
      await expect(control).toBeVisible();
      await control.scrollIntoViewIfNeeded();
      const session = await context.newCDPSession(page);
      const gesture = async (
        from: number,
        to: number,
        end: 'touchEnd' | 'touchCancel' = 'touchEnd',
        dy = 0,
      ) => {
        const box = (await control.boundingBox())!;
        const y = box.y + box.height / 2;
        await session.send('Input.dispatchTouchEvent', {
          type: 'touchStart',
          touchPoints: [{ x: box.x + box.width * from, y }],
        });
        for (let step = 1; step <= 8; step++) {
          await session.send('Input.dispatchTouchEvent', {
            type: 'touchMove',
            touchPoints: [
              { x: box.x + box.width * (from + ((to - from) * step) / 8), y: y + (dy * step) / 8 },
            ],
          });
        }
        await session.send('Input.dispatchTouchEvent', { type: end, touchPoints: [] });
      };
      await expect(control).toHaveCSS('touch-action', 'pan-y pinch-zoom');
      await gesture(0.25, 0.75);
      await expect(control).toHaveAttribute('data-mode', 'register');
      await gesture(0.75, 0.25);
      await expect(control).toHaveAttribute('data-mode', 'login');
      await page.getByLabel('Email', { exact: true }).fill('person@example.com');
      await gesture(0.25, 0.75, 'touchCancel');
      await expect(control).toHaveAttribute('data-mode', 'login');
      await expect(control).not.toHaveAttribute('data-dragging');
      await expect(page.getByLabel('Email', { exact: true })).toHaveValue('person@example.com');
      await gesture(0.25, 0.25, 'touchEnd', -35);
      await expect(control).toHaveAttribute('data-mode', 'login');
      await control.getByRole('button', { name: 'Create account', exact: true }).tap();
      await expect(control).toHaveAttribute('data-mode', 'register');
      await session.detach();
    });
  });
}
