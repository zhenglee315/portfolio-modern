import { expect, type Page } from '@playwright/test';
import { runtimeTest as test } from '../fixtures/browser';

/** Wait for hydrated decoration and the finite entrance before comparing pixels or geometry.
 * @param page Managed fixture page; motion remains enabled so its settled state is real.
 * @param path Public route to open.
 * @returns After the profile ancestors have normal opacity; no synthetic motion override is used.
 */
async function openSettledPage(page: Page, path = '/en') {
  await page.goto(path);
  await expect
    .poll(() => page.locator('[data-background-field] svg path').count())
    .toBeGreaterThan(1);
  await expect(page.locator('[data-entering]')).toHaveCount(0);
  await expect(page.locator('#overview')).toHaveCSS('opacity', '1');
}

/** Verify the visible legacy geometry, rather than treating an unclipped page as visual parity. */
for (const theme of ['mint', 'mist']) {
  test(`${theme} appearance and language menus preserve legacy controls at every layout breakpoint`, async ({
    page,
    context,
  }, testInfo) => {
    test.setTimeout(60_000);
    await context.addCookies([
      {
        name: 'portfolio-appearance',
        value: encodeURIComponent(JSON.stringify({ theme })),
        url: 'http://127.0.0.1:4173',
      },
    ]);
    for (const width of [320, 360, 390, 760, 761, 1024, 1150, 1440, 1700, 3840]) {
      await page.setViewportSize({ width, height: width > 2000 ? 2160 : 900 });
      await openSettledPage(page);
      const appearance = page.getByRole('button', { name: 'Background settings' });
      await appearance.click();
      const settings = page
        .locator('.dropdown-menu.show')
        .filter({ has: page.getByRole('slider') });
      await expect(settings).toBeVisible();
      await expect(page.getByRole('slider').first()).toBeFocused();
      const geometry = await settings.evaluate((panel) => {
        const style = getComputedStyle(panel);
        const bounds = panel.getBoundingClientRect();
        const heading = panel.querySelector('strong')!.parentElement!;
        const headingStyle = getComputedStyle(heading);
        const unselected = panel.querySelector('button[aria-pressed="false"][data-theme-option]')!;
        const choiceStyle = getComputedStyle(unselected);
        return {
          x: bounds.x,
          right: bounds.right,
          bottom: bounds.bottom,
          width: bounds.width,
          padding: style.padding,
          radius: style.borderRadius,
          headingBorder: headingStyle.borderBottomWidth,
          headingPadding: headingStyle.paddingBottom,
          headingMargin: headingStyle.marginBottom,
          choiceRadius: choiceStyle.borderRadius,
          choiceBackground: choiceStyle.backgroundColor,
          swatchWidth: getComputedStyle(unselected.querySelector('i')!).width,
        };
      });
      expect(geometry.padding).toBe('18px');
      expect(geometry.radius).toBe('8px');
      expect(geometry.headingBorder).toBe('1px');
      expect(geometry.headingPadding).toBe('12px');
      expect(geometry.headingMargin).toBe('16px');
      expect(geometry.choiceRadius).toBe('4px');
      expect(geometry.choiceBackground).toBe('rgba(0, 0, 0, 0)');
      expect(geometry.swatchWidth).toBe('6px');
      expect(geometry.width).toBeCloseTo(Math.min(300, width - 40), 0);
      expect(geometry.x).toBeGreaterThanOrEqual(0);
      expect(geometry.right).toBeLessThanOrEqual(width);
      expect(geometry.bottom).toBeLessThanOrEqual(width > 2000 ? 2160 : 900);
      const triggerPaint = await appearance.evaluate((button) => {
        const style = getComputedStyle(button);
        return {
          border: style.borderTopWidth,
          background: style.backgroundColor,
          radius: style.borderRadius,
        };
      });
      expect(triggerPaint.border).toBe('1px');
      expect(triggerPaint.background).not.toBe('rgba(0, 0, 0, 0)');
      expect(triggerPaint.radius).toBe('50%');
      if ([390, 1024, 1440].includes(width))
        await page.screenshot({ path: testInfo.outputPath(`${theme}-appearance-${width}.png`) });
      await page.keyboard.press('Escape');
      await expect(appearance).toBeFocused();
      const language = page.getByRole('button', { name: 'Change language' });
      await expect(language).toContainText('EN');
      await language.click();
      const languages = language.locator('..').locator('.dropdown-menu.show');
      await expect(languages).toHaveCSS('padding', '6px');
      await expect(languages).toHaveCSS('min-width', '170px');
      const current = languages.getByRole('button', { name: 'English', exact: true });
      await expect(current).toBeFocused();
      await expect(current).toHaveAttribute('aria-current', 'true');
      await expect(current.locator('.icon')).toHaveCSS('visibility', 'visible');
      await expect(
        languages.getByRole('button', { name: '简体中文', exact: true }).locator('.icon'),
      ).toHaveCSS('visibility', 'hidden');
      if (theme === 'mint' && (width === 390 || width === 1440)) {
        const last = languages.getByRole('button', { name: '繁體中文', exact: true });
        await page.keyboard.press('ArrowUp');
        await expect(last).toBeFocused();
        await page.keyboard.press('ArrowDown');
        await expect(current).toBeFocused();
        await page.keyboard.press('End');
        await expect(last).toBeFocused();
        await page.keyboard.press('Home');
        await expect(current).toBeFocused();
        await page.keyboard.press('ArrowDown');
        await expect(
          languages.getByRole('button', { name: '简体中文', exact: true }),
        ).toBeFocused();
        await page.keyboard.press('ArrowDown');
        await expect(last).toBeFocused();
        await page.keyboard.press('ArrowDown');
        await expect(current).toBeFocused();
        await expect(current).toHaveAttribute('aria-current', 'true');
        await expect(page.locator('html')).toHaveAttribute('lang', 'en');
      }
      await page.keyboard.press('Escape');
      await expect(language).toBeFocused();
    }
  });
}

test('a short landscape viewport scrolls appearance controls and still reaches reset', async ({
  page,
}) => {
  await page.setViewportSize({ width: 760, height: 390 });
  await openSettledPage(page);
  await page.getByRole('button', { name: 'Background settings' }).click();
  const settings = page.locator('.dropdown-menu.show').filter({ has: page.getByRole('slider') });
  await expect(settings).toHaveCSS('overflow-y', 'auto');
  await expect(settings).toHaveCSS('max-height', '210px');
  await settings.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'mist');
});

/** The detail dialog must carry the same list-owned skills and architecture semantics as the cards. */
test('project detail preserves the original dialog geometry, connectors and shared skill disclosure', async ({
  page,
}, testInfo) => {
  for (const width of [390, 760, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await openSettledPage(page, '/en#projects');
    const trigger = page.getByRole('button', { name: 'Read about en Project 1', exact: true });
    await trigger.click();
    const dialog = page.locator('[role="dialog"][aria-modal="true"]');
    await expect(dialog).toBeVisible();
    await expect(
      dialog.locator('.tag-list').getByText('TypeScript', { exact: true }),
    ).toBeVisible();
    await expect(dialog.locator('[data-flow-step]')).toHaveText(['Design', 'Build', 'Review']);
    await expect(dialog.locator('ol .icon')).toHaveCount(2);
    const content = dialog.locator('.modal-content');
    await expect(content).toHaveCSS('padding', width <= 760 ? '30px 24px' : '42px');
    await expect(content).toHaveCSS('border-radius', '12px');
    const bounds = await content.boundingBox();
    expect(bounds?.width).toBeCloseTo(Math.min(680, width - 32), 0);
    await expect(page.locator('.modal-backdrop.show')).toHaveCSS('backdrop-filter', 'blur(6px)');
    const language = dialog.getByRole('button', { name: 'Change language', exact: true });
    const close = dialog.getByRole('button', { name: 'Close project details', exact: true });
    const languageBounds = await language.boundingBox();
    const closeBounds = await close.boundingBox();
    expect(languageBounds).not.toBeNull();
    expect(closeBounds).not.toBeNull();
    expect(
      languageBounds!.x + languageBounds!.width <= closeBounds!.x ||
        closeBounds!.x + closeBounds!.width <= languageBounds!.x ||
        languageBounds!.y + languageBounds!.height <= closeBounds!.y ||
        closeBounds!.y + closeBounds!.height <= languageBounds!.y,
    ).toBe(true);
    await language.click();
    await expect(dialog.getByRole('button', { name: 'English', exact: true })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(language).toBeFocused();
    await expect(dialog).toBeVisible();
    if (width === 390 || width === 1440) {
      // The closed language trigger is the first usable control and close is the fixture's last.
      await page.keyboard.press('Shift+Tab');
      await expect(close).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(language).toBeFocused();
    }
    await page.screenshot({ path: testInfo.outputPath(`detail-${width}.png`) });
    await close.click();
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toBeFocused();
  }
});

for (const paused of [false, true]) {
  test(`contact retains its gradient, bevel and narrow mascot with background pause=${paused}`, async ({
    page,
    context,
  }, testInfo) => {
    await context.addCookies([
      {
        name: 'portfolio-appearance',
        value: encodeURIComponent(JSON.stringify({ theme: 'mint', paused })),
        url: 'http://127.0.0.1:4173',
      },
    ]);
    for (const width of [320, 380, 390, 761, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await openSettledPage(page);
      const bubble = page.locator('[data-contact-bubble]');
      await expect(bubble).toBeVisible();
      await expect(bubble).toHaveCSS('opacity', '1');
      await expect(bubble.locator('img')).toHaveCSS(
        'width',
        width <= 380 ? '64px' : width <= 760 ? '80px' : '104px',
      );
      const paint = await bubble.evaluate((element) => {
        const content = element.firstElementChild!.firstElementChild!;
        const style = getComputedStyle(content);
        return {
          gradient: style.backgroundImage,
          bevel: style.boxShadow,
          blur: style.backdropFilter,
          animations: getComputedStyle(element).animationName,
        };
      });
      expect(paint.gradient).toContain('linear-gradient');
      expect(paint.bevel).toContain('inset');
      expect(paint.blur).toBe('blur(3px)');
      if (paused) expect(paint.animations).not.toContain('contact-note-breathe');
      else expect(paint.animations).toContain('contact-note-breathe');
      if (width === 320 || width === 1440)
        await page.screenshot({ path: testInfo.outputPath(`contact-${paused}-${width}.png`) });
    }
  });
}

/** Explicit controls win over the one-shot introduction, including a pause that finishes entrance. */
test('opening menus suppresses a later startup offer without disabling manual contact', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto('/en');
  const appearance = page.getByRole('button', { name: 'Background settings' });
  await appearance.click();
  await expect(page.getByRole('slider').first()).toBeFocused();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-motion-paused', 'true');
  await expect(page.locator('[data-entering]')).toHaveCount(0);
  await expect(page.locator('[data-contact-bubble]')).toHaveCount(0);
  // Cross the original startup deadline so an already-open control cannot receive a delayed offer.
  await page.waitForTimeout(1500);
  await expect(page.locator('[data-contact-bubble]')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(appearance).toBeFocused();
  const language = page.getByRole('button', { name: 'Change language' });
  await language.click();
  await expect(page.getByRole('button', { name: 'English', exact: true })).toBeFocused();
  await expect(page.locator('[data-contact-bubble]')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(language).toBeFocused();
  await page.locator('[data-contact-trigger]:visible').click();
  await expect(page.locator('[data-contact-bubble]')).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 900 });
  await appearance.click();
  await expect(page.locator('[data-contact-bubble]')).toHaveCount(0);
  await expect(page.getByRole('slider').first()).toBeFocused();
});

/** Portaled introduction paint must never intercept the fixed-size profile controls underneath it. */
test('startup contact leaves profile controls on the pointer layer across mobile, tablet and desktop', async ({
  page,
}) => {
  test.setTimeout(60_000);
  for (const width of [320, 390, 760, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await openSettledPage(page);
    await expect(page.locator('[data-contact-bubble]')).toBeVisible();
    const appearance = page.getByRole('button', { name: 'Background settings' });
    const language = page.getByRole('button', { name: 'Change language' });
    for (const control of [appearance, language]) {
      expect(
        await control.evaluate((button) => {
          const bounds = button.getBoundingClientRect();
          const hit = document.elementFromPoint(
            bounds.x + bounds.width / 2,
            bounds.y + bounds.height / 2,
          );
          return hit === button || (!!hit && button.contains(hit));
        }),
      ).toBe(true);
    }
    await appearance.click();
    await expect(appearance).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('slider').first()).toBeFocused();
    await expect(page.locator('[data-contact-bubble]')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await language.click();
    await expect(language).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('button', { name: 'English', exact: true })).toBeFocused();
    await page.keyboard.press('Escape');
  }
});
