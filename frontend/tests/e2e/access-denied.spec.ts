import { expect, test as base, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

type Locale = 'en' | 'zh-Hant' | 'zh-Hans';
type Copy = {
  accessDenied: Record<string, string>;
  auth: Record<string, string>;
  ui: Record<string, string>;
};
const copy: Record<Locale, Copy> = Object.fromEntries(
  ['en', 'zh-Hant', 'zh-Hans'].map((locale) => [
    locale,
    JSON.parse(
      readFileSync(new URL(`../../src/i18n/messages/${locale}.json`, import.meta.url), 'utf8'),
    ),
  ]),
) as Record<Locale, Copy>;

const test = base.extend<{ previewRuntime: void }>({
  previewRuntime: [
    async ({ page }, use) => {
      const managementReads: string[] = [];
      const errors: string[] = [];
      page.on('request', (request) => {
        if (new URL(request.url()).pathname.startsWith('/api/management/'))
          managementReads.push(request.url());
      });
      page.on('pageerror', (error) => errors.push(error.message));
      await use();
      expect(managementReads).toEqual([]);
      expect(errors).toEqual([]);
    },
    { auto: true },
  ],
});

/** Open only the review page; this suite does not assert or install management permission gates. */
async function openPreview(page: Page, locale: Locale = 'en') {
  const response = await page.goto(`/${locale}/access-denied`);
  expect(response?.status()).toBe(403);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    copy[locale].accessDenied.title!,
  );
  await expect(page.locator('[data-auth-view="true"]')).toHaveAttribute('data-auth-phase', 'auth');
  await expect(page.locator('[data-background-field]')).toBeVisible();
  await expect(page.locator('[data-auth-panel], form')).toHaveCount(0);
  const cow = page.locator('[data-access-denied-cow]');
  await expect(cow).toBeVisible();
  await expect(
    page.getByRole('img', { name: copy[locale].accessDenied.artwork!, exact: true }),
  ).toBeVisible();
  await expect(cow.locator('[data-cow-part="cow-arm-left"]')).toHaveAttribute(
    'data-cow-arm-pose',
    'no-entry',
  );
  await expect(cow.locator('[data-cow-part="cow-arm-right"]')).toHaveAttribute(
    'data-cow-arm-pose',
    'mouth-covering',
  );
  await expect(cow.locator('[data-cow-part="cow-eyes"]')).toHaveCount(1);
  await expect(cow.locator('[data-cow-eye-state], [data-cow-part="typing-arms"]')).toHaveCount(0);
  await expect(cow.locator('[data-denied-cow-pupil]')).toHaveCount(2);
  await expect(page.getByRole('table')).toHaveCount(0);
  await expect(page.locator('[data-management-resource]')).toHaveCount(0);
  return cow;
}

async function pupilTransforms(page: Page) {
  return page
    .locator('[data-denied-cow-pupil]')
    .evaluateAll((pupils) => pupils.map((pupil) => pupil.getAttribute('transform')));
}

/** Verify every external SVG source and referenced group, including the new sign arm and eyes. */
async function verifyVectorSources(page: Page) {
  const hrefs = await page
    .locator('[data-access-denied-cow] use')
    .evaluateAll((uses) => [...new Set(uses.map((use) => use.getAttribute('href')!))]);
  const sources = new Map<string, string>();
  expect(hrefs.length).toBeGreaterThan(120);
  for (const href of hrefs) {
    const [source, fragment] = href.split('#');
    expect(source).toBeTruthy();
    if (!sources.has(source!)) {
      const response = await page.request.get(source!);
      expect(response.status()).toBe(200);
      expect(response.headers()['content-type']).toContain('image/svg+xml');
      sources.set(source!, await response.text());
    }
    if (fragment) expect(sources.get(source!)!).toContain(`id="${fragment}"`);
  }
  expect(sources.size).toBeGreaterThanOrEqual(3);
}

function translation(transform: string | null) {
  const values = transform?.match(/^translate\((-?[\d.]+)[ ,]+(-?[\d.]+)\)$/);
  expect(values).not.toBeNull();
  return { x: Number(values![1]), y: Number(values![2]) };
}

for (const locale of ['en', 'zh-Hant', 'zh-Hans'] as const) {
  for (const width of [320, 768, 1440]) {
    test(`${locale} standalone 403 preview stays bounded at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      const cow = await openPreview(page, locale);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        width,
      );
      for (const target of [cow, page.getByRole('heading', { level: 1 }), page.locator('header')]) {
        const bounds = (await target.boundingBox())!;
        expect(bounds.x).toBeGreaterThanOrEqual(-1);
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(width + 1);
      }
      const home = page.getByRole('link', {
        name: copy[locale].accessDenied.backHome!,
        exact: true,
      });
      await expect(home).toHaveAttribute('href', `/${locale}`);
      expect((await home.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      const controls = page.getByRole('group', {
        name: copy[locale].auth.cowPlayback!,
        exact: true,
      });
      await expect(controls.getByRole('button')).toHaveCount(5);
      for (const label of [
        copy[locale].auth.cowGlobeRotate!,
        copy[locale].auth.cowMouseFollow!,
        copy[locale].auth.cowLeavesSway!,
        copy[locale].accessDenied.eyeFollow!,
        copy[locale].auth.cowPause!,
      ]) {
        const control = controls.getByRole('button', {
          name: label,
          exact: true,
        });
        await expect(control).toBeVisible();
        const bounds = (await control.boundingBox())!;
        expect(bounds.width).toBeGreaterThanOrEqual(44);
        expect(bounds.height).toBeGreaterThanOrEqual(44);
        expect(bounds.x).toBeGreaterThanOrEqual(-1);
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(width + 1);
        if (label !== copy[locale].auth.cowPause!)
          await expect(control).toHaveAttribute('aria-pressed', 'true');
      }
      if (locale === 'en' && width === 1440) await verifyVectorSources(page);
      for (const part of [
        'desk',
        'laptop',
        'coffee',
        'plant-pot',
        'plant-leaves',
        'books',
        'globe',
        'open-book',
      ]) {
        await expect(cow.locator(`[data-cow-part="${part}"]`)).toHaveCount(1);
      }
      await expect(cow.locator('[data-globe-frame]')).toHaveCount(120);
      await expect(cow.locator('image')).toHaveCount(0);
      if (locale === 'en' && [320, 1440].includes(width)) {
        await page.screenshot({
          path: test.info().outputPath(`access-denied-${width}.png`),
          fullPage: true,
        });
      }
    });
  }
}

test('cow pupils follow the pointer and reset on leaving, blur and motion pause', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const cow = await openPreview(page);
  await expect(cow).toHaveAttribute('data-motion', 'true');
  await page.mouse.move(1420, 870);
  await expect.poll(() => pupilTransforms(page)).not.toEqual(['translate(0 0)', 'translate(0 0)']);
  const right = await pupilTransforms(page);
  expect(right.map(translation).every(({ x, y }) => x > 0 && y > 0)).toBe(true);
  await page.mouse.move(2, 2);
  await expect.poll(() => pupilTransforms(page)).not.toEqual(right);
  const left = await pupilTransforms(page);
  expect(left.map(translation).every(({ x, y }) => x < 0 && y < 0)).toBe(true);
  expect(
    [...right, ...left].map(translation).every(({ x, y }) => Math.abs(x) < 60 && Math.abs(y) < 60),
  ).toBe(true);
  await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointerleave')));
  await expect.poll(() => pupilTransforms(page)).toEqual(['translate(0 0)', 'translate(0 0)']);
  await page.mouse.move(1420, 870);
  await expect.poll(() => pupilTransforms(page)).not.toEqual(['translate(0 0)', 'translate(0 0)']);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect.poll(() => pupilTransforms(page)).toEqual(['translate(0 0)', 'translate(0 0)']);
  await page.getByRole('button', { name: copy.en.ui.appearance!, exact: true }).click();
  await page.getByRole('button', { name: copy.en.ui.pauseBackground!, exact: true }).click();
  await expect(cow).toHaveAttribute('data-motion', 'false');
  await page.keyboard.press('Escape');
  await page.mouse.move(1420, 870);
  expect(await pupilTransforms(page)).toEqual(['translate(0 0)', 'translate(0 0)']);
  await page.getByRole('button', { name: copy.en.ui.appearance!, exact: true }).click();
  await page.getByRole('button', { name: copy.en.ui.playBackground!, exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(cow).toHaveAttribute('data-motion', 'true');
  await page.mouse.move(2, 2);
  await expect.poll(() => pupilTransforms(page)).not.toEqual(['translate(0 0)', 'translate(0 0)']);
});

test('the reused desk props animate while the character keeps its denied pose', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const cow = await openPreview(page);
  const workspace = cow.locator('[data-cow-scene]');
  await expect(workspace).toHaveAttribute('data-cow-motion', 'active');
  await expect(cow.locator('[data-globe-surface="rotating"]')).toBeVisible();
  await expect(cow.locator('[data-globe-frame="0"]')).toHaveCSS('animation-play-state', 'running');
  await expect
    .poll(() =>
      cow
        .locator('[data-cow-part="coffee"]')
        .evaluate((element) =>
          [...element.children].map((child) => getComputedStyle(child).animationName),
        ),
    )
    .toEqual(
      expect.arrayContaining([expect.stringContaining('steam'), expect.stringContaining('coffee')]),
    );
  await page.mouse.move(1400, 800);
  await expect
    .poll(() =>
      workspace.evaluate((element) =>
        Number((element as HTMLElement).style.getPropertyValue('--cow-pointer-x')),
      ),
    )
    .toBeGreaterThan(0);
  await expect(cow.locator('[data-cow-arm-pose="mouth-covering"]')).toBeVisible();
  await expect(cow.locator('[data-cow-arm-pose="no-entry"]')).toBeVisible();
  await expect(cow.locator('[data-cow-arm-pose="mouth-covering"]')).not.toHaveAttribute(
    'transform',
  );
  const character = cow.locator('[data-decoration]');
  await expect(character).toHaveCSS('animation-name', /denied-cow-breathe/);
  expect(
    await character.evaluate((element) => {
      const matrix = new DOMMatrix(getComputedStyle(element).transform);
      return { a: matrix.a, b: matrix.b, c: matrix.c, d: matrix.d, x: matrix.e };
    }),
  ).toEqual({ a: 1, b: 0, c: 0, d: 1, x: 0 });
  for (const effect of ['typing-sweat', 'laptop-typing-light']) {
    const layer = cow.locator(`[data-cow-part="${effect}"]`);
    await expect(layer).toHaveCount(1);
    await expect(layer).toBeVisible();
    const animated = layer.locator(':scope > g > g').first();
    await expect(animated).toHaveCSS('animation-play-state', 'running');
    await expect(animated).not.toHaveCSS('animation-name', 'none');
  }
});

test('the login entrance reveals the shared background and denied page without a login card', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const phases: string[] = [];
    Object.defineProperty(window, '__deniedEntrancePhases', { value: phases, configurable: true });
    new MutationObserver(() => {
      const phase =
        document.querySelector<HTMLElement>('[data-auth-view="true"]')?.dataset.authPhase;
      if (phase && phase !== phases.at(-1)) phases.push(phase);
    }).observe(document, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-auth-phase'],
    });
  });
  await openPreview(page);
  const phases = await page.evaluate(
    () => (window as typeof window & { __deniedEntrancePhases: string[] }).__deniedEntrancePhases,
  );
  expect(phases.filter((phase) => phase !== 'portfolio')).toEqual([
    'exit',
    'collide',
    'expand',
    'reveal',
    'auth',
  ]);
  const background = page.locator('[data-background-field]');
  await expect(background.locator('[data-field-edge]')).toHaveCount(4);
  await expect(background.locator('[data-signals-ready="true"]')).toBeVisible();
  await expect.poll(() => background.locator('path').count()).toBeGreaterThan(1);
  expect(await background.locator('path').count()).toBeLessThanOrEqual(401);
  await expect(page.locator('[data-auth-panel], form')).toHaveCount(0);
});

test('eye, mouse, globe, leaf and playback controls preserve their independent preferences', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const cow = await openPreview(page);
  const workspace = cow.locator('[data-cow-scene]');
  const controls = page.getByRole('group', { name: copy.en.auth.cowPlayback!, exact: true });
  const eyes = controls.getByRole('button', {
    name: copy.en.accessDenied.eyeFollow!,
    exact: true,
  });
  const mouse = controls.getByRole('button', { name: copy.en.auth.cowMouseFollow!, exact: true });
  const globe = controls.getByRole('button', { name: copy.en.auth.cowGlobeRotate!, exact: true });
  const leaves = controls.getByRole('button', { name: copy.en.auth.cowLeavesSway!, exact: true });
  const leafSurface = cow.locator('[data-cow-part="plant-leaves"]');
  const pointerX = () =>
    workspace.evaluate((element) =>
      Number((element as HTMLElement).style.getPropertyValue('--cow-pointer-x')),
    );

  await leaves.click();
  await expect(leaves).toHaveAttribute('aria-pressed', 'false');
  await expect(workspace).toHaveAttribute('data-cow-leaf-motion', 'paused');
  await expect(leafSurface).toHaveCSS('animation-play-state', 'paused');
  await expect(cow.locator('[data-globe-frame="0"]')).toHaveCSS('animation-play-state', 'running');
  await page.mouse.move(1420, 870);
  await expect.poll(pointerX).toBeGreaterThan(0);
  await expect.poll(() => pupilTransforms(page)).not.toEqual(['translate(0 0)', 'translate(0 0)']);

  await eyes.click();
  await expect(eyes).toHaveAttribute('aria-pressed', 'false');
  await page.mouse.move(1420, 870);
  await expect.poll(pointerX).toBeGreaterThan(0);
  expect(await pupilTransforms(page)).toEqual(['translate(0 0)', 'translate(0 0)']);
  await expect(workspace).toHaveAttribute('data-cow-motion', 'active');
  await expect(cow.locator('[data-globe-frame="0"]')).toHaveCSS('animation-play-state', 'running');

  await eyes.click();
  await mouse.click();
  await expect(eyes).toHaveAttribute('aria-pressed', 'true');
  await expect(mouse).toHaveAttribute('aria-pressed', 'false');
  await page.mouse.move(1420, 870);
  await expect.poll(pointerX).toBe(0);
  await expect.poll(() => pupilTransforms(page)).not.toEqual(['translate(0 0)', 'translate(0 0)']);

  await globe.click();
  await expect(globe).toHaveAttribute('aria-pressed', 'false');
  await expect(leaves).toHaveAttribute('aria-pressed', 'false');
  await expect(workspace).toHaveAttribute('data-cow-globe-motion', 'paused');
  await expect(workspace).toHaveAttribute('data-cow-leaf-motion', 'paused');
  await expect(cow.locator('[data-globe-frame="0"]')).toHaveCSS('animation-play-state', 'paused');
  await expect(workspace).toHaveAttribute('data-cow-motion', 'active');
  await page.mouse.move(2, 2);
  await expect.poll(() => pupilTransforms(page)).not.toEqual(['translate(0 0)', 'translate(0 0)']);
  await expect.poll(pointerX).toBe(0);

  await controls.getByRole('button', { name: copy.en.auth.cowPause!, exact: true }).click();
  await expect(workspace).toHaveAttribute('data-cow-motion', 'paused');
  await expect(cow).toHaveAttribute('data-motion', 'false');
  for (const effect of ['typing-sweat', 'laptop-typing-light'])
    await expect(cow.locator(`[data-cow-part="${effect}"]`)).toBeHidden();
  await page.mouse.move(1420, 870);
  await expect.poll(() => pupilTransforms(page)).toEqual(['translate(0 0)', 'translate(0 0)']);
  expect(await pointerX()).toBe(0);
  await expect(eyes).toHaveAttribute('aria-pressed', 'true');
  await expect(mouse).toHaveAttribute('aria-pressed', 'false');
  await expect(globe).toHaveAttribute('aria-pressed', 'false');
  await expect(leaves).toHaveAttribute('aria-pressed', 'false');

  await controls.getByRole('button', { name: copy.en.auth.cowPlay!, exact: true }).click();
  await expect(workspace).toHaveAttribute('data-cow-motion', 'active');
  for (const effect of ['typing-sweat', 'laptop-typing-light'])
    await expect(cow.locator(`[data-cow-part="${effect}"]`)).toBeVisible();
  await expect(workspace).toHaveAttribute('data-cow-globe-motion', 'paused');
  await expect(workspace).toHaveAttribute('data-cow-leaf-motion', 'paused');
  await page.mouse.move(1420, 870);
  await expect.poll(() => pupilTransforms(page)).not.toEqual(['translate(0 0)', 'translate(0 0)']);
  expect(await pointerX()).toBe(0);
  await globe.click();
  await mouse.click();
  await leaves.click();
  await page.mouse.move(1420, 870);
  await expect.poll(pointerX).toBeGreaterThan(0);
  await expect(cow.locator('[data-globe-frame="0"]')).toHaveCSS('animation-play-state', 'running');
  await expect(leafSurface).toHaveCSS('animation-play-state', 'running');
});

test('the login scene uses the same stronger leaf animation and independent leaf control', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/en?view=login');
  const login = page.locator('[data-auth-cow]');
  const workspace = login.locator('[data-cow-scene]');
  await expect(workspace).toHaveAttribute('data-cow-motion', 'active');
  const controls = login.getByRole('group', { name: copy.en.auth.cowPlayback!, exact: true });
  await expect(controls.getByRole('button')).toHaveCount(4);
  const leaves = controls.getByRole('button', { name: copy.en.auth.cowLeavesSway!, exact: true });
  const leafSurface = workspace.locator('[data-cow-part="plant-leaves"]');
  await expect(leaves).toHaveAttribute('aria-pressed', 'true');
  await expect(leafSurface).toHaveCSS('animation-play-state', 'running');
  const leafRange = await leafSurface.evaluate((element) =>
    element
      .getAnimations()
      .flatMap((animation) => (animation.effect as KeyframeEffect).getKeyframes())
      .map((keyframe) => String(keyframe.transform).match(/rotate\((-?[\d.]+)deg\)/)?.[1])
      .filter((angle) => angle !== undefined)
      .map(Number),
  );
  expect(Math.min(...leafRange)).toBeLessThanOrEqual(-4);
  expect(Math.max(...leafRange)).toBeGreaterThanOrEqual(4);
  await leaves.click();
  await expect(leaves).toHaveAttribute('aria-pressed', 'false');
  await expect(workspace).toHaveAttribute('data-cow-leaf-motion', 'paused');
  await expect(leafSurface).toHaveCSS('animation-play-state', 'paused');
  await expect(workspace).toHaveAttribute('data-cow-motion', 'active');
  await expect(workspace.locator('[data-globe-frame="0"]')).toHaveCSS(
    'animation-play-state',
    'running',
  );
  await leaves.click();
  await expect(leafSurface).toHaveCSS('animation-play-state', 'running');
});

test('reduced motion keeps the cow still with centered pupils', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const cow = await openPreview(page);
  await page.mouse.move(1400, 800);
  expect(await pupilTransforms(page)).toEqual(['translate(0 0)', 'translate(0 0)']);
  await expect(cow.locator('[data-decoration]')).toHaveCSS('animation-name', 'none');
  for (const effect of ['typing-sweat', 'laptop-typing-light'])
    await expect(cow.locator(`[data-cow-part="${effect}"]`)).toBeHidden();
});

test.describe('touch preview', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });
  test('coarse-pointer preview keeps pupils centered', async ({ page }) => {
    await openPreview(page);
    expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
    await page.mouse.move(380, 830);
    expect(await pupilTransforms(page)).toEqual(['translate(0 0)', 'translate(0 0)']);
  });
});

test('standalone 403 uses all existing themes without management reads', async ({ page }) => {
  const cow = await openPreview(page);
  const colors = new Set<string>();
  for (const theme of ['mist', 'mint', 'blue', 'amber']) {
    await page.getByRole('button', { name: copy.en.ui.appearance!, exact: true }).click();
    await page.locator(`[data-theme-option="${theme}"]`).click();
    await page.keyboard.press('Escape');
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    colors.add(
      await page
        .getByRole('heading', { level: 1 })
        .evaluate((node) => getComputedStyle(node).color),
    );
    await expect(cow).toBeVisible();
  }
  expect(colors.size).toBeGreaterThan(1);
  await page.screenshot({
    path: test.info().outputPath('access-denied-themed.png'),
    fullPage: true,
  });
});
