import { expect, type Locator, type Page } from '@playwright/test';
import { runtimeTest as test } from '../fixtures/browser';

function expandIcon(rail: Locator) {
  return rail.locator(':scope > button[aria-expanded] .icon');
}
const admin = {
  id: 91,
  user: 'operator',
  email: 'operator@example.com',
  role: 'admin',
  is_create: true,
  is_read: true,
  is_update: true,
  is_delete: true,
  is_manage_sites: true,
  is_manage_users: true,
  is_manage_roles: true,
};
async function setup(page: Page, theme = 'mint') {
  await page.context().addCookies([
    {
      name: 'portfolio-appearance',
      value: encodeURIComponent(JSON.stringify({ theme, paused: true })),
      url: 'http://127.0.0.1:4173',
    },
  ]);
  await page.route('**/api/authority/session', (route) => route.fulfill({ json: admin }));
}
async function settled(page: Page) {
  await expect(page.locator('[data-entering]')).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
}
async function geometry(rail: Locator) {
  return rail.evaluate((element) => {
    const item = element.querySelector('[data-sidebar-links] [data-sidebar-item]')!;
    const icon = item.querySelector('svg')!;
    const control = element.querySelector('button[aria-expanded]')!;
    const railStyle = getComputedStyle(element);
    const rect = item.getBoundingClientRect();
    return {
      width: element.getBoundingClientRect().width,
      padding: railStyle.padding,
      transition: {
        properties: railStyle.transitionProperty
          .split(',')
          .slice(0, 2)
          .map((value) => value.trim()),
        durations: railStyle.transitionDuration
          .split(',')
          .slice(0, 2)
          .map((value) => value.trim()),
        timing: railStyle.transitionTimingFunction
          .split(/,(?![^()]*\))/)
          .slice(0, 2)
          .map((value) => value.trim()),
      },
      rowHeight: rect.height,
      iconWidth: icon.getBoundingClientRect().width,
      iconHeight: icon.getBoundingClientRect().height,
      itemGap: getComputedStyle(item).gap,
      collapseWidth: control.getBoundingClientRect().width,
      collapseHeight: control.getBoundingClientRect().height,
      collapseSvg: control.querySelector('svg')!.innerHTML,
      collapseTransition: getComputedStyle(control.querySelector('.icon')!).transition,
      collapseTransform: getComputedStyle(control.querySelector('.icon')!).transform,
    };
  });
}

for (const { width, height, theme } of [
  { width: 1025, height: 900, theme: 'mint' },
  { width: 1150, height: 900, theme: 'mint' },
  { width: 1440, height: 900, theme: 'mint' },
  { width: 2560, height: 1440, theme: 'mint' },
  { width: 1440, height: 390, theme: 'mint' },
  { width: 1440, height: 900, theme: 'mist' },
  { width: 1440, height: 900, theme: 'blue' },
  { width: 1440, height: 900, theme: 'amber' },
]) {
  test(`public and settings share expanded/compact navigation at ${width}x${height} ${theme}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height });
    await setup(page, theme);
    await page.goto('/en');
    await settled(page);
    const rail = page.locator('[data-sidebar-rail]');
    const publicExpanded = await geometry(rail);
    await rail.getByRole('button', { name: 'Collapse sidebar', exact: true }).click();
    await expect(rail).toHaveCSS('width', '80px');
    await expect(rail.locator('[data-nav-label]').first()).toHaveCSS('visibility', 'hidden');
    await expect(rail.locator(':scope > button[aria-expanded] .icon')).toHaveCSS(
      'transform',
      'matrix(-1, 0, 0, -1, 0, 0)',
    );
    const publicCompact = await geometry(rail);
    await page.goto('/en/management/sites');
    await expect(page.locator('tbody tr')).toHaveCount(6);
    await settled(page);
    expect(await geometry(rail)).toEqual(publicExpanded);
    await expect(rail.locator('.sidebar-navigation-group-title')).toHaveText([
      'Monitoring',
      'Management',
    ]);
    const items = rail.locator('[data-sidebar-links]').first().locator('[data-sidebar-item]');
    await expect(items).toHaveText(['Requests', 'Platform', 'Roles', 'Users']);
    for (const item of await items.all()) {
      expect(
        await item
          .locator('[data-nav-label]')
          .evaluate((label) => label.scrollWidth - label.clientWidth),
        'full navigation label',
      ).toBeLessThanOrEqual(1);
    }
    const collapse = rail.getByRole('button', { name: 'Collapse navigation', exact: true });
    await collapse.click();
    await expect(rail).toHaveCSS('width', '80px');
    await expect(items.first().locator('[data-nav-label]')).toHaveCSS('visibility', 'hidden');
    await expect(expandIcon(rail)).toHaveCSS('transform', 'matrix(-1, 0, 0, -1, 0, 0)');
    expect(await geometry(rail)).toEqual(publicCompact);
    await expect(rail.locator('[data-nav-brand]')).toHaveAttribute('inert', '');
    const logo = rail.locator('[aria-hidden] > .icon').first();
    const expand = rail.getByRole('button', { name: 'Expand navigation', exact: true });
    const boxes = await Promise.all([logo.boundingBox(), expand.boundingBox()]);
    expect(boxes[1]!.y + boxes[1]!.height).toBeLessThanOrEqual(boxes[0]!.y);
    const itemBounds = (await items.first().boundingBox())!;
    const iconBounds = (await items.first().locator('.icon').boundingBox())!;
    expect(
      Math.abs(iconBounds.x + iconBounds.width / 2 - itemBounds.x - itemBounds.width / 2),
    ).toBeLessThanOrEqual(1);
    await items.first().focus();
    const tooltip = page.getByRole('tooltip', { name: 'Requests', exact: true });
    await expect(tooltip).toBeVisible();
    expect(await tooltip.evaluate((element) => !!element.closest('aside'))).toBe(false);
    await page.keyboard.press('Escape');
    await expect(tooltip).toHaveCount(0);
    await expect(items.first()).toBeFocused();
    if (width === 1440 && height === 900 && theme === 'mint')
      await page.screenshot({ path: info.outputPath('settings-compact.png') });
    await expand.click();
    await expect(items.first().locator('[data-nav-label]')).toHaveCSS('visibility', 'visible');
    await expect(rail.locator('[data-nav-brand]')).not.toHaveAttribute('inert');
    await expect(rail).toHaveCSS('width', `${publicExpanded.width}px`);
    await expect(expandIcon(rail)).toHaveCSS('transform', 'none');
    if (width === 1440 && height === 900 && theme === 'mint')
      await page.screenshot({ path: info.outputPath('settings-expanded.png') });
    expect(
      await page.evaluate(
        () =>
          Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) - innerWidth,
      ),
    ).toBeLessThanOrEqual(1);
  });
}

for (const { width, height } of [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 820, height: 1180 },
  { width: 844, height: 390 },
]) {
  test.describe(`shared drawer ${width}x${height}`, () => {
    test.use({ viewport: { width, height }, hasTouch: true });
    test('settings drawer shares item/close geometry and restores focus while resizing', async ({
      page,
    }, info) => {
      await setup(page);
      await page.goto('/en/management/sites');
      await expect(page.locator('tbody tr')).toHaveCount(6);
      const trigger = page.getByRole('button', { name: 'Open management navigation', exact: true });
      await trigger.click();
      const drawer = page.locator('[data-sidebar-drawer]');
      await expect(drawer).toHaveCSS('transform', 'none');
      await expect(drawer).toHaveCSS('width', '250px');
      await expect(drawer).toHaveCSS('top', '0px');
      expect(
        await drawer.evaluate((element) => element.getBoundingClientRect().right),
      ).toBeLessThanOrEqual(width);
      await expect(
        drawer.locator('[data-sidebar-links]').first().locator('[data-sidebar-item]'),
      ).toHaveText(['Requests', 'Platform', 'Roles', 'Users']);
      const close = drawer.getByRole('button', { name: 'Close', exact: true });
      expect((await close.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await close.focus();
      await page.keyboard.press('Shift+Tab');
      await expect(drawer.getByRole('link', { name: 'View portfolio', exact: true })).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(close).toBeFocused();
      await page.screenshot({ path: info.outputPath('settings-drawer.png') });
      await page.keyboard.press('Escape');
      await expect(drawer).toHaveCount(0);
      await expect(trigger).toBeFocused();
      await trigger.click();
      await expect(drawer).toHaveCSS('transform', 'none');
      await page.setViewportSize({ width: 1440, height: 900 });
      await expect(drawer).toHaveCount(0);
      await expect.poll(() => page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
      await page.setViewportSize({ width, height });
      await trigger.click();
      await expect(drawer).toHaveCSS('transform', 'none');
      await drawer.getByRole('link', { name: 'Users', exact: true }).click();
      await expect(page).toHaveURL(/\/management\/users$/);
      await expect(page.locator('[data-management-resource="users"] tbody tr')).toHaveCount(6);
      await expect(drawer).toHaveCount(0);
      expect(
        await page.evaluate(
          () =>
            Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) - innerWidth,
        ),
      ).toBeLessThanOrEqual(1);
    });
  });
}

test('collapsed settings brand retains its portfolio home link', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await setup(page);
  await page.goto('/en/management/sites');
  await expect(page.locator('tbody tr')).toHaveCount(6);
  const rail = page.locator('[data-sidebar-rail]');
  await rail.getByRole('button', { name: 'Collapse navigation', exact: true }).click();
  await expect(rail).toHaveCSS('width', '80px');
  const home = rail.getByRole('link', { name: 'View portfolio', exact: true }).first();
  await expect(home).toHaveAttribute('href', '/en');
  await home.click();
  await expect(page).toHaveURL(/\/en#overview$/);
  await expect(page.locator('[data-portfolio-site]')).toBeVisible();
});
