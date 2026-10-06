import { expect, test } from '@playwright/test';
import { siteSchema } from '@/features/site/schemas/site';
import { fullName } from '@/features/site/model/profile';
import { projectsSchema } from '@/features/projects/schemas/projects';
import { categoriesSchema } from '@/features/skills/schemas/skills';

test.skip(
  !process.env.PORTFOLIO_API_SMOKE_TARGET,
  'Explicit public API target required for read-only integration.',
);

for (const locale of ['en', 'zh-Hans', 'zh-Hant'] as const) {
  test(`live ${locale} static content, project continuation and complete skill categories`, async ({
    page,
    request,
  }, testInfo) => {
    await page.setViewportSize({ width: 1512, height: 982 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const site = siteSchema.parse(
      await (await request.get(`/api/portfolio/site?locale=${locale}`)).json(),
    );
    const projects = projectsSchema.parse(
      await (await request.get(`/api/portfolio/projects?locale=${locale}&page=1&size=6`)).json(),
    );
    const categories = categoriesSchema.parse(
      await (
        await request.get(`/api/portfolio/skill-categories?locale=${locale}&page=1&size=6`)
      ).json(),
    );
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`/${locale}#projects`);
    await expect(page.locator('h1')).toContainText(fullName(site.profile));
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect(page.locator('#projects [data-project-id]')).toHaveCount(projects.items.length);
    if (projects.total > 6) {
      // The collection disclosure follows its cards; nested tag controls precede it.
      await page.locator('#projects button[aria-expanded="false"][aria-controls]').last().click();
      await expect(page.locator('#projects [data-project-id]')).toHaveCount(
        Math.min(12, projects.total),
      );
    }
    await expect(page.locator('[data-category-id]')).toHaveCount(categories.total);
    await expect(page.locator('[data-skill-categories]')).toHaveCount(1);
    // Keep a representative real-data viewport for visual review alongside contract checks.
    if (locale === 'en') {
      await page.locator('#skills').scrollIntoViewIfNeeded();
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      const closeIntroduction = page.getByRole('button', {
        name: 'Close internship chatme',
        exact: true,
      });
      if (await closeIntroduction.isVisible()) {
        await closeIntroduction.click();
        await expect(closeIntroduction).toHaveCount(0);
      }
      await page.screenshot({ path: testInfo.outputPath('skills-live-desktop.png') });
    }
    expect(errors).toEqual([]);
  });
}

/** Inspect the contact shell with public API copy at both responsive sizes. */
test('live contact preserves its wrapped frame and multiline copy on desktop and mobile', async ({
  page,
  request,
  context,
  baseURL,
}, testInfo) => {
  await context.addCookies([
    {
      name: 'portfolio-appearance',
      value: encodeURIComponent(JSON.stringify({ theme: 'mist', paused: true })),
      url: baseURL!,
    },
  ]);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1512, height: 982 });
  const site = siteSchema.parse(await (await request.get('/api/portfolio/site?locale=en')).json());
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/en');
  // Explicit menu use suppresses the startup offer before manually opening the same disclosure.
  await page.getByRole('button', { name: 'Background settings' }).click();
  await page.keyboard.press('Escape');
  const trigger = page.locator('[data-contact-trigger]:visible');
  await trigger.click();
  const bubble = page.locator('[data-contact-bubble]');
  await expect(bubble).toBeVisible();
  await bubble.hover();
  await expect(bubble.locator('p.plain-text')).toHaveText(
    site.chatme.content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean),
  );
  await expect(trigger).toHaveCSS('outline-style', 'none');
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await page.screenshot({ path: testInfo.outputPath('contact-live-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  const close = bubble.getByRole('button');
  await expect(close).toHaveCSS('width', '44px');
  const rect = await bubble.boundingBox();
  expect(rect!.x).toBeGreaterThanOrEqual(0);
  expect(rect!.x + rect!.width).toBeLessThanOrEqual(390);
  const controls = (await page.locator('[data-profile-controls]').boundingBox())!;
  expect(rect!.y).toBeGreaterThanOrEqual(controls.y + controls.height + 12);
  await page.screenshot({ path: testInfo.outputPath('contact-live-mobile.png') });
  await page.setViewportSize({ width: 320, height: 430 });
  await expect
    .poll(() =>
      bubble
        .locator('[data-contact-content]')
        .evaluate((node) => node.scrollHeight - node.clientHeight),
    )
    .toBeGreaterThan(0);
  const short = (await bubble.boundingBox())!;
  expect(short.y + short.height).toBeLessThanOrEqual(430);
  await page.screenshot({ path: testInfo.outputPath('contact-live-short.png') });
  await close.click();
  await expect(bubble).toHaveCount(0);
  await expect(page.locator('[data-contact-trigger]:visible')).toBeFocused();
  expect(errors).toEqual([]);
});
