import { expect } from '@playwright/test';
import { runtimeTest as test, waitForFixtureHydration } from '../fixtures/browser';

/** Check visible legacy hierarchy and shared card geometry at the actual breakpoints. */
test('profile accents, career span and footer alias survive every responsive layout', async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const locale of ['en', 'zh-Hans', 'zh-Hant']) {
    for (const width of [320, 390, 760, 761, 1024, 1150, 1440, 1700, 3840]) {
      await page.setViewportSize({ width, height: width > 2000 ? 2160 : 900 });
      await page.goto(`/${locale}`);
      const heading = page.locator('h1[data-profile-content]');
      await expect(heading).toBeVisible();
      const paint = await heading.evaluate((node) => {
        const name = node.lastElementChild!;
        const greeting = node.firstElementChild!;
        return {
          name: getComputedStyle(name).color,
          greeting: getComputedStyle(greeting).color,
          spacing: getComputedStyle(node).letterSpacing,
        };
      });
      expect(paint.name).not.toBe(paint.greeting);
      if (locale.startsWith('zh')) expect(paint.spacing).toBe('-1px');
      const line = page.locator('#overview .eyebrow > span');
      await expect(line).toHaveCSS('width', '24px');
      await expect(line).toHaveCSS('height', '2px');
      await expect(page.locator('#experience > header')).toContainText(
        `2024 — ${new Date().getUTCFullYear()}`,
      );
      await expect(page.locator('section > header button')).toHaveCount(0);
      for (const section of ['experience', 'projects', 'journey']) {
        const header = page.locator(`#${section} > header`);
        const note = header.locator(':scope > p');
        if (width <= 1150) await expect(note).toBeHidden();
        else {
          await expect(note).toBeVisible();
          const [headerBox, noteBox] = await Promise.all([
            header.boundingBox(),
            note.boundingBox(),
          ]);
          expect(headerBox).not.toBeNull();
          expect(noteBox).not.toBeNull();
          expect(
            Math.abs(headerBox!.x + headerBox!.width - noteBox!.x - noteBox!.width),
          ).toBeLessThanOrEqual(1);
          await expect(note).toHaveCSS('text-align', 'right');
        }
      }
      await expect(page.locator('footer')).toContainText('Engineer');
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
      ).toBeLessThanOrEqual(1);
      if (locale === 'zh-Hant' && [390, 1024, 1440].includes(width))
        await page.screenshot({
          path: testInfo.outputPath(`layout-${locale}-${width}.png`),
          fullPage: true,
        });
    }
  }
});

/** Keyboard expansion must reach newly fetched records, then return to the restored summary. */
test('collection controls align with cards and preserve keyboard focus after lazy expansion', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/en#projects');
    await waitForFixtureHydration(page);
    const section = page.locator('#projects');
    const summary = section
      .locator('button[aria-controls][aria-expanded]')
      .filter({ hasText: 'Show more projects' });
    const card = section.locator('[data-project-id]').first();
    await expect(summary).toBeVisible();
    const geometry = [await summary.boundingBox(), await card.boundingBox()];
    expect(geometry[0]!.x).toBeCloseTo(geometry[1]!.x, 0);
    await summary.focus();
    await summary.press('Enter');
    await expect(section.locator('[data-project-id]')).toHaveCount(12);
    await expect(summary).toBeHidden();
    await expect(
      section.getByRole('button', { name: 'Read about en Project 7', exact: true }),
    ).toBeFocused();
    await section.getByRole('button', { name: 'Show fewer projects' }).click();
    await expect(section.locator('[data-project-id]')).toHaveCount(6);
    await expect(summary).toBeVisible();
    await expect(summary).toBeFocused();
    await summary.press('Enter');
    await expect(section.locator('[data-project-id]')).toHaveCount(12);
    await expect(
      section.getByRole('button', { name: 'Read about en Project 7', exact: true }),
    ).toBeFocused();
    await section.getByRole('button', { name: 'Show fewer projects' }).click();
    await expect(section.locator('[data-project-id]')).toHaveCount(6);
  }
});

/** Visible vocabulary must share its measured width across complete cards and paginated owners. */
test('localized skill disclosures preserve the original chip paint and measured preview', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const locale of ['en', 'zh-Hans', 'zh-Hant']) {
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.mouse.move(5, 5);
      await page.goto(`/${locale}#skills`);
      const toolkit = page.locator('[data-skill-categories]');
      await expect(toolkit).toHaveCount(1);
      await expect(toolkit.locator(':scope > [data-category-id]')).toHaveCount(7);
      await expect(
        page.locator('#skills').getByRole('button', { name: /Show more skill categories/ }),
      ).toHaveCount(0);
      const row = page.locator('[data-category-id="category-0"]');
      await expect(row).toHaveCSS('padding-top', '23px');
      await expect(row).toHaveCSS('padding-bottom', '23px');
      await expect(row).toHaveCSS('column-gap', width <= 760 ? '12px' : '30px');
      await expect(row.locator('h3')).toHaveCSS('margin-top', '4px');
      await expect(row.locator('h3')).toHaveCSS('margin-bottom', '4px');
      await expect(row.locator('h3')).toHaveCSS('line-height', '24.75px');
      const tags = row.locator('.tag-list');
      const toggle = tags.locator('button[aria-expanded="false"]');
      await expect(toggle).toBeVisible();
      await expect(toggle).toHaveText(
        locale === 'en' ? /^\s*\d+ skills?\s*$/ : /^\s*\d+ [項项]技能\s*$/,
      );
      await expect(toggle).toHaveCSS('border-top-style', 'dashed');
      await expect(toggle).toHaveCSS('border-radius', '4px');
      await expect(toggle).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      await expect(tags).toHaveCSS('column-gap', '7px');
      await expect(tags.locator('span').first()).toHaveCSS(
        'font-size',
        width <= 760 ? '11px' : '12px',
      );
      await expect(tags.locator('..')).toHaveCSS('margin-top', '0px');
      const geometry = await tags.evaluate((element) => {
        const button = element.querySelector<HTMLButtonElement>('button')!;
        const probe = [
          ...element.parentElement!.querySelectorAll<HTMLElement>('[data-count]'),
        ].find((candidate) => candidate.textContent === button.textContent)!;
        const bounds = element.getBoundingClientRect();
        const controls = [...element.children].map((child) => child.getBoundingClientRect());
        return {
          budget: bounds.width * 0.75,
          used: Math.max(...controls.map((child) => child.right)) - bounds.left,
          buttonWidth: button.getBoundingClientRect().width,
          probeWidth: probe.getBoundingClientRect().width,
        };
      });
      expect(geometry.used).toBeLessThanOrEqual(geometry.budget + 1);
      expect(geometry.buttonWidth).toBeCloseTo(geometry.probeWidth, 0);
      await toggle.click();
      const expanded = tags.locator('button[aria-expanded="true"]');
      await expect(expanded).toHaveCSS('border-top-style', 'solid');
      await expect(row.getByText(`${locale} Skill 12`, { exact: true }).first()).toBeVisible();
      await expanded.click();
      await page.mouse.move(5, 5);
      await expect(toggle).toBeVisible();
      await expect(toggle).toHaveCSS('border-top-style', 'dashed');
    }
  }
});
