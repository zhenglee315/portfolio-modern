import { expect, type Page } from '@playwright/test';
import { runtimeTest as test } from '../fixtures/browser';

/** Wait for the real hydration policy before exercising interactive rail behavior. */
async function openPortfolio(page: Page) {
  await page.goto('/en');
  await expect(page.locator('html')).toHaveAttribute('data-motion-paused', 'false');
  await expect(page.locator('[data-entering]')).toHaveCount(0);
}

test('compact rail retains link focus and transitions labels instead of removing their DOM', async ({
  page,
}) => {
  await openPortfolio(page);
  const rail = page.locator('aside[data-entrance-navigation]');
  const overview = rail.getByRole('link', { name: 'Overview', exact: true });
  const label = overview.locator('[data-nav-label]');
  const brand = rail.locator('[data-nav-brand]');
  await page.getByRole('button', { name: 'Collapse sidebar' }).click();
  await expect(rail).toHaveCSS('width', '80px');
  await expect(label).toHaveCount(1);
  await expect(label).toHaveCSS('display', 'block');
  await expect(label).toHaveCSS('max-width', '0px');
  await expect(label).toHaveCSS('visibility', 'hidden');
  await expect(brand).toHaveAttribute('inert', '');
  const linkBox = (await overview.boundingBox())!;
  const iconBox = (await overview.locator('.icon').boundingBox())!;
  expect(Math.abs(iconBox.x + iconBox.width / 2 - linkBox.x - linkBox.width / 2)).toBeLessThan(1);
  expect(await label.evaluate((node) => getComputedStyle(node).transitionProperty)).toContain(
    'max-width',
  );
  await overview.focus();
  const tooltip = page.getByRole('tooltip', { name: 'Overview', exact: true });
  await expect(tooltip).toBeVisible();
  await expect(overview).toBeFocused();
  await expect(overview).toHaveAttribute('aria-describedby', (await tooltip.getAttribute('id'))!);
  expect(await tooltip.evaluate((node) => !!node.closest('aside'))).toBe(false);
  const box = (await tooltip.boundingBox())!;
  const railBox = (await rail.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(railBox.x + railBox.width);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.keyboard.press('Escape');
  await expect(tooltip).toHaveCount(0);
  await expect(overview).toBeFocused();
  await expect(overview).not.toHaveAttribute('aria-describedby');
  await page.getByRole('button', { name: 'Expand sidebar' }).click();
  await expect(label).toHaveCSS('max-width', '200px');
  await expect(label).toHaveCSS('visibility', 'visible');
  await expect(brand).not.toHaveAttribute('inert');
});

test('short desktop rails scroll all content and keep compact tooltips outside clipping', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 380 });
  await openPortfolio(page);
  const rail = page.locator('aside[data-entrance-navigation]');
  await expect(rail).toHaveCSS('overflow-y', 'auto');
  expect(await rail.evaluate((node) => node.scrollHeight)).toBeGreaterThan(380);
  const footer = rail.locator('[data-nav-footer]');
  await footer.scrollIntoViewIfNeeded();
  await expect(footer).toBeInViewport();
  await rail.evaluate((node) => {
    node.scrollTop = 0;
  });
  await page.getByRole('button', { name: 'Collapse sidebar' }).click();
  const overview = rail.getByRole('link', { name: 'Overview', exact: true });
  await overview.hover();
  const tooltip = page.getByRole('tooltip', { name: 'Overview', exact: true });
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toBeInViewport();
  await page.mouse.move(500, 250);
  await expect(tooltip).toHaveCount(0);
});

test('mobile drawer retains the 64px header and 250px panel while trapping and restoring focus', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openPortfolio(page);
  const header = page.locator('header[data-entrance-navigation]');
  const trigger = page.getByRole('button', { name: 'Open navigation' });
  await trigger.click();
  const drawer = page.getByRole('dialog', { name: 'Main navigation' });
  await expect(drawer).toBeVisible();
  await expect(drawer).toHaveCSS('top', '64px');
  await expect(drawer).toHaveCSS('width', '250px');
  await expect(page.locator('.offcanvas-backdrop')).toHaveCSS('top', '64px');
  await expect(header).toBeVisible();
  for (let index = 0; index < 8; index++) {
    await page.keyboard.press('Tab');
    // Bootstrap schedules enforcement after focus events; assert its settled result.
    await expect
      .poll(() => drawer.evaluate((node) => node.contains(document.activeElement)))
      .toBe(true);
  }
  const firstControl = drawer.getByRole('button', { name: 'Close navigation' });
  const lastControl = drawer.getByRole('link', { name: 'Skills', exact: true });
  await expect(drawer.getByRole('link', { name: 'Overview', exact: true })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(firstControl).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(lastControl).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(firstControl).toBeFocused();
  expect(await page.evaluate(() => document.hasFocus())).toBe(true);
  await page.keyboard.press('Escape');
  await expect(drawer).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await header.getByRole('button', { name: 'Close navigation' }).click();
  await expect(drawer).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await drawer.getByRole('link', { name: 'Skills', exact: true }).click();
  await expect(drawer).not.toBeVisible();
  await expect(page).toHaveURL(/#skills$/);
  await expect(trigger).toBeFocused();
});

test('desktop and mobile contact triggers preserve the bare animated SVG silhouette', async ({
  page,
}) => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.mouse.move(5, 850);
    await openPortfolio(page);
    const container = page.locator(width > 760 ? 'aside' : 'header[data-entrance-navigation]');
    const trigger = container.locator('[data-contact-trigger]');
    await expect(trigger).toHaveCSS('width', '44px');
    await expect(trigger).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(trigger).toHaveCSS('border-top-width', '0px');
    const icon = trigger.locator('[data-icon-pulse="chat"] > svg');
    await expect(icon).toHaveCSS('width', '28px');
    expect(await icon.evaluate((node) => getComputedStyle(node).animationName)).toContain(
      'icon-breathe',
    );
    await trigger.hover();
    await expect(icon).toHaveCSS('animation-name', 'none');
    expect(await icon.evaluate((node) => getComputedStyle(node).filter)).toContain('drop-shadow');
  }
});

test('scrolled socials and startup contact cannot cover mobile navigation hit targets', async ({
  page,
}) => {
  for (const width of [320, 390, 760]) {
    await page.setViewportSize({ width, height: 844 });
    await openPortfolio(page);
    const trigger = page.getByRole('button', { name: 'Open navigation' });
    const settings = page.getByRole('button', { name: 'Background settings' });
    await expect(page.locator('[data-contact-bubble]')).toBeVisible();
    const position = await settings.evaluate((node) => {
      const box = node.getBoundingClientRect();
      return box.top + box.height / 2 - 32;
    });
    // A real wheel event also releases startup deep-link restoration, like normal scrolling.
    await page.mouse.move(width - 10, 400);
    await page.mouse.wheel(0, position);
    await expect
      .poll(() => settings.evaluate((node) => node.getBoundingClientRect().top))
      .toBeLessThan(64);
    expect(await settings.evaluate((node) => node.getBoundingClientRect().bottom)).toBeGreaterThan(
      0,
    );
    await expect
      .poll(() =>
        trigger.evaluate((node) => {
          const box = node.getBoundingClientRect();
          const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
          return hit === node || node.contains(hit);
        }),
      )
      .toBe(true);
    await trigger.click();
    const drawer = page.getByRole('dialog', { name: 'Main navigation' });
    await expect(drawer).toBeVisible();
    await expect(page.locator('[data-contact-bubble]')).toHaveCount(0);
    await expect(drawer).toHaveCSS('z-index', '70');
    await expect(page.locator('.offcanvas-backdrop')).toHaveCSS('z-index', '69');
    await page.keyboard.press('Escape');
    await expect(drawer).not.toBeVisible();
    await expect(trigger).toBeFocused();
    await expect(page.locator('[data-contact-bubble]')).toHaveCount(0);
  }
});
