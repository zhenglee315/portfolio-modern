import { expect, test as base, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

type Locale = 'en' | 'zh-Hant' | 'zh-Hans';
type Copy = {
  accessDenied: Record<string, string>;
  auth: Record<string, string>;
  ui: Record<string, string>;
};
type Viewport = { width: number; height: number };
const messages = Object.fromEntries(
  ['en', 'zh-Hant', 'zh-Hans'].map((locale) => [
    locale,
    JSON.parse(
      readFileSync(new URL(`../../src/i18n/messages/${locale}.json`, import.meta.url), 'utf8'),
    ),
  ]),
) as Record<Locale, Copy>;
const viewports: Viewport[] = [
  { width: 320, height: 568 },
  { width: 360, height: 640 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 568, height: 320 },
  { width: 667, height: 375 },
  { width: 844, height: 390 },
  { width: 768, height: 1024 },
  { width: 820, height: 1180 },
  { width: 912, height: 1368 },
  { width: 1024, height: 768 },
  { width: 1180, height: 820 },
  { width: 1024, height: 600 },
  { width: 1280, height: 600 },
  { width: 1280, height: 720 },
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1503, height: 776 },
  { width: 1536, height: 864 },
  { width: 1920, height: 1080 },
  { width: 2560, height: 1080 },
  { width: 3006, height: 1552 },
  { width: 3440, height: 1440 },
  { width: 3840, height: 2160 },
];
const translatedSizes = new Set(['320x568', '667x375', '820x1180', '1280x600', '1503x776']);
const captures = new Map([
  ['390x844', 'phone'],
  ['667x375', 'landscape'],
  ['820x1180', 'tablet'],
  ['1280x600', 'desktop-short'],
]);

const test = base.extend<{ isolatedPreview: void }>({
  isolatedPreview: [
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

function playback(page: Page, locale: Locale = 'en') {
  return page.getByRole('group', { name: messages[locale].auth.cowPlayback!, exact: true });
}

async function openDenied(page: Page, locale: Locale = 'en') {
  const response = await page.goto(`/${locale}/access-denied`);
  expect(response?.status()).toBe(403);
  await expect(page.locator('[data-auth-view="true"]')).toHaveAttribute('data-auth-phase', 'auth');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    messages[locale].accessDenied.title!,
  );
  await expect(playback(page, locale).getByRole('button')).toHaveCount(5);
  await expect(page.locator('[data-auth-panel], form')).toHaveCount(0);
}

async function documentBounded(page: Page, width: number) {
  expect(
    await page.evaluate(() =>
      Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
    ),
  ).toBeLessThanOrEqual(width);
}

/** Check rendered bounds; DOM visibility alone does not detect controls below the viewport. */
async function viewportBounds(locator: Locator, viewport: Viewport, vertical = true) {
  await expect(locator).toBeVisible();
  const rect = (await locator.boundingBox())!;
  expect(rect.x, `${await locator.getAttribute('aria-label')} left`).toBeGreaterThanOrEqual(-1);
  expect(rect.x + rect.width, 'right edge').toBeLessThanOrEqual(viewport.width + 1);
  if (vertical) {
    expect(rect.y, 'top edge').toBeGreaterThanOrEqual(-1);
    expect(rect.y + rect.height, 'bottom edge').toBeLessThanOrEqual(viewport.height + 1);
  }
}

async function clickable(locator: Locator, viewport: Viewport, vertical = true) {
  await viewportBounds(locator, viewport, vertical);
  const rect = (await locator.boundingBox())!;
  expect(rect.width).toBeGreaterThanOrEqual(44);
  expect(rect.height).toBeGreaterThanOrEqual(44);
  if (vertical) {
    expect(
      await locator.evaluate((element) => {
        const box = element.getBoundingClientRect();
        const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
        return hit !== null && (hit === element || element.contains(hit));
      }),
      'control center accepts pointer input',
    ).toBe(true);
  }
}

async function initialLayout(page: Page, viewport: Viewport, locale: Locale) {
  const fullHeight = viewport.width >= 1024 || viewport.width > viewport.height;
  await documentBounded(page, viewport.width);
  await viewportBounds(page.locator('header'), viewport);
  for (const button of await page.locator('header').getByRole('button').all())
    await clickable(button, viewport);
  await viewportBounds(page.locator('[data-access-denied-cow]'), viewport, false);
  await viewportBounds(page.getByRole('heading', { level: 1 }), viewport, fullHeight);
  for (const button of await playback(page, locale).getByRole('button').all())
    await clickable(button, viewport, fullHeight);
  const home = page.getByRole('link', {
    name: messages[locale].accessDenied.backHome!,
    exact: true,
  });
  await clickable(home, viewport, fullHeight);
  if (!fullHeight) {
    for (const target of [playback(page, locale), home]) {
      await target.scrollIntoViewIfNeeded();
      await viewportBounds(target, viewport);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
  }
}

for (const viewport of viewports) {
  const size = `${viewport.width}x${viewport.height}`;
  const touch = viewport.width < 1024;
  test.describe(size, () => {
    test.use({ viewport, hasTouch: touch, isMobile: touch });
    const locales: Locale[] = translatedSizes.has(size) ? ['en', 'zh-Hant', 'zh-Hans'] : ['en'];
    for (const locale of locales) {
      test(`${locale} denied controls and home remain reachable`, async ({ page }) => {
        await openDenied(page, locale);
        await initialLayout(page, viewport, locale);
        const capture = captures.get(size);
        if (locale === 'en' && capture)
          await page.screenshot({
            path: test.info().outputPath(`access-denied-rwd-${capture}.png`),
            fullPage: true,
          });
      });
    }
  });
}

for (const viewport of [
  { width: 320, height: 568 },
  { width: 568, height: 320 },
  { width: 820, height: 1180 },
  { width: 1280, height: 600 },
]) {
  test(`header menus stay bounded and clickable at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await openDenied(page);
    const appearance = page.getByRole('button', { name: messages.en.ui.appearance!, exact: true });
    await appearance.click();
    const panel = page.locator(`[id="${await appearance.getAttribute('aria-controls')}"]`);
    await viewportBounds(panel, viewport);
    await panel.locator('[data-theme-option="amber"]').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'amber');
    await panel.getByRole('button', { name: messages.en.ui.pauseBackground!, exact: true }).click();
    await expect(page.locator('[data-cow-scene]')).toHaveAttribute('data-cow-motion', 'paused');
    await viewportBounds(panel, viewport);
    await page.keyboard.press('Escape');
    await expect(appearance).toBeFocused();
    const language = page.getByRole('button', { name: messages.en.ui.language!, exact: true });
    await language.click();
    const languages = page.locator(`[id="${await language.getAttribute('aria-controls')}"]`);
    await viewportBounds(languages, viewport);
    for (const option of await languages.getByRole('button').all())
      await clickable(option, viewport);
    await languages.locator('[data-locale="zh-Hant"]').click();
    await expect(page).toHaveURL('/zh-Hant/access-denied');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      messages['zh-Hant'].accessDenied.title!,
    );
    await expect(page.locator('.dropdown-menu.show')).toHaveCount(0);
    await documentBounded(page, viewport.width);
  });
}

for (const viewport of [
  { width: 320, height: 568 },
  { width: 667, height: 375 },
  { width: 1280, height: 600 },
]) {
  test(`keyboard reaches every control and home at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await openDenied(page);
    const header = page.locator('header');
    const home = page.getByRole('link', { name: messages.en.accessDenied.backHome!, exact: true });
    const targets = [
      header.getByRole('link'),
      ...(await header.getByRole('button').all()),
      ...(await playback(page).getByRole('button').all()),
      home,
    ];
    for (const target of targets) {
      await page.keyboard.press('Tab');
      await expect(target).toBeFocused();
      await viewportBounds(target, viewport);
    }
    await page.keyboard.press('Shift+Tab');
    await expect(playback(page).getByRole('button').last()).toBeFocused();
  });
}

/** Check live pupil and clip coordinates after the responsive SVG and its head have moved. */
async function pupilsInsideClips(page: Page) {
  const samples = await page.locator('[data-denied-cow-pupil]').evaluateAll((pupils) =>
    pupils.map((node) => {
      const pupil = node as SVGGElement;
      const source = pupil.querySelector('use')!;
      const clipReference = pupil.parentElement!.getAttribute('clip-path')!;
      const clipId = clipReference.match(/^url\(#(.+)\)$/)![1]!;
      const clip = document.getElementById(clipId)!.querySelector('use')!;
      const pupilBox = source.getBBox();
      const clipBox = clip.getBBox();
      const point = pupil.ownerSVGElement!.createSVGPoint();
      point.x = pupilBox.x + pupilBox.width / 2;
      point.y = pupilBox.y + pupilBox.height / 2;
      const screen = point.matrixTransform(source.getScreenCTM()!);
      const local = screen.matrixTransform(clip.getScreenCTM()!.inverse());
      return {
        clipId,
        clipWidth: clipBox.width,
        clipHeight: clipBox.height,
        pupilWidth: pupilBox.width,
        x: local.x,
        y: local.y,
        left: clipBox.x,
        right: clipBox.x + clipBox.width,
        top: clipBox.y,
        bottom: clipBox.y + clipBox.height,
      };
    }),
  );
  expect(samples).toHaveLength(2);
  expect(new Set(samples.map((sample) => sample.clipId)).size).toBe(2);
  for (const sample of samples) {
    expect(sample.clipWidth).toBeGreaterThan(0);
    expect(sample.clipHeight).toBeGreaterThan(0);
    expect(sample.pupilWidth).toBeGreaterThan(0);
    expect(sample.x).toBeGreaterThanOrEqual(sample.left - 1);
    expect(sample.x).toBeLessThanOrEqual(sample.right + 1);
    expect(sample.y).toBeGreaterThanOrEqual(sample.top - 1);
    expect(sample.y).toBeLessThanOrEqual(sample.bottom + 1);
  }
}

test('resizing preserves independent preferences and aligns pupils with their live clips', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1503, height: 776 });
  await openDenied(page);
  const controls = playback(page);
  const globe = controls.getByRole('button', {
    name: messages.en.auth.cowGlobeRotate!,
    exact: true,
  });
  const leaves = controls.getByRole('button', {
    name: messages.en.auth.cowLeavesSway!,
    exact: true,
  });
  await globe.click();
  await leaves.click();
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 844, height: 390 },
    { width: 820, height: 1180 },
    { width: 1280, height: 600 },
    { width: 1503, height: 776 },
  ]) {
    await page.setViewportSize(viewport);
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(globe).toHaveAttribute('aria-pressed', 'false');
    await expect(leaves).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('[data-cow-scene]')).toHaveAttribute(
      'data-cow-globe-motion',
      'paused',
    );
    await expect(page.locator('[data-cow-scene]')).toHaveAttribute(
      'data-cow-leaf-motion',
      'paused',
    );
    for (const point of [
      { x: 4, y: 4 },
      { x: viewport.width - 4, y: viewport.height - 4 },
    ]) {
      await page.mouse.move(point.x, point.y);
      await expect
        .poll(() =>
          page
            .locator('[data-denied-cow-pupil]')
            .evaluateAll((pupils) => pupils.map((pupil) => pupil.getAttribute('transform'))),
        )
        .not.toEqual(['translate(0 0)', 'translate(0 0)']);
      await pupilsInsideClips(page);
    }
    await documentBounded(page, viewport.width);
  }
});

test.describe('touch rotation', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
  test('rotation retains paused controls and keeps touch pupils centered', async ({ page }) => {
    await openDenied(page);
    const controls = playback(page);
    const globe = controls.getByRole('button', {
      name: messages.en.auth.cowGlobeRotate!,
      exact: true,
    });
    const leaves = controls.getByRole('button', {
      name: messages.en.auth.cowLeavesSway!,
      exact: true,
    });
    await globe.click();
    await leaves.click();
    await controls.getByRole('button', { name: messages.en.auth.cowPause!, exact: true }).click();
    await page.setViewportSize({ width: 844, height: 390 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(globe).toHaveAttribute('aria-pressed', 'false');
    await expect(leaves).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('[data-cow-scene]')).toHaveAttribute('data-cow-motion', 'paused');
    await controls.getByRole('button', { name: messages.en.auth.cowPlay!, exact: true }).click();
    await page.mouse.move(830, 370);
    expect(
      await page
        .locator('[data-denied-cow-pupil]')
        .evaluateAll((pupils) => pupils.map((pupil) => pupil.getAttribute('transform'))),
    ).toEqual(['translate(0 0)', 'translate(0 0)']);
    await initialLayout(page, { width: 844, height: 390 }, 'en');
    await pupilsInsideClips(page);
  });
});

for (const viewport of [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 667, height: 375 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1280, height: 600 },
  { width: 1503, height: 776 },
]) {
  test(`shared login control row remains usable at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('/en?view=login');
    const login = page.locator('[data-auth-cow]');
    const controls = login.getByRole('group', { name: messages.en.auth.cowPlayback!, exact: true });
    await expect(controls.getByRole('button')).toHaveCount(4);
    await controls.scrollIntoViewIfNeeded();
    await viewportBounds(controls, viewport);
    await documentBounded(page, viewport.width);
    for (const button of await controls.getByRole('button').all())
      await clickable(button, viewport);
    const leaves = controls.getByRole('button', {
      name: messages.en.auth.cowLeavesSway!,
      exact: true,
    });
    await leaves.click();
    await expect(leaves).toHaveAttribute('aria-pressed', 'false');
    await expect(login.locator('[data-cow-scene]')).toHaveAttribute(
      'data-cow-leaf-motion',
      'paused',
    );
    await controls.getByRole('button', { name: messages.en.auth.cowPause!, exact: true }).click();
    await expect(login.locator('[data-cow-scene]')).toHaveAttribute('data-cow-motion', 'paused');
    await expect(leaves).toHaveAttribute('aria-pressed', 'false');
  });
}
