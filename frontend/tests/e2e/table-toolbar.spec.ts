import { expect } from '@playwright/test';
import { runtimeTest as test } from '../fixtures/browser';

for (const resource of ['sites', 'users', 'roles']) {
  for (const width of [320, 820, 1440]) {
    test(`toolbar tags slide in one row for ${resource} at ${width}px`, async ({ page }, info) => {
      const search = await open(page, width, 'mint', resource);
      const trigger = search.locator('.dropdown-toggle');
      await trigger.click();
      await search.getByRole('checkbox', { name: 'ID', exact: true }).uncheck();
      const count = (await search.getByRole('checkbox').count()) - 2;
      await page.keyboard.press('Escape');
      await expect(trigger).toHaveText('');
      const icon = trigger.locator('.icon');
      await expect(icon.locator('svg.bi-funnel-fill')).toBeVisible();
      expect(await icon.evaluate((el) => getComputedStyle(el).color)).not.toBe(
        await trigger.evaluate((el) => getComputedStyle(el).color),
      );
      const rail = search.getByRole('list', { name: 'Search column', exact: true });
      await expect(rail.getByRole('button')).toHaveCount(count);
      const tops = await rail
        .locator('li')
        .evaluateAll((items) => items.map((item) => item.getBoundingClientRect().top));
      expect(Math.max(...tops) - Math.min(...tops)).toBeLessThanOrEqual(1);
      const overflow = await rail.evaluate((el) => el.scrollWidth - el.clientWidth);
      if (width === 1440) {
        const bounds = await rail.boundingBox();
        const add = await page.getByRole('button', { name: 'Add', exact: true }).boundingBox();
        expect(bounds!.x + bounds!.width).toBeCloseTo(add!.x - 12, 0);
      }
      await rail.focus();
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      if (overflow > 1)
        await expect.poll(() => rail.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
      else await expect(rail.getByRole('button').last()).toBeInViewport();
      await page.screenshot({ path: info.outputPath(`sliding-${resource}-${width}.png`) });
      const last = rail.getByRole('button').last();
      await last.click();
      await expect(rail.getByRole('button')).toHaveCount(count - 1);
      await expect(search.getByRole('searchbox')).toBeFocused();
      expect(new URL(page.url()).searchParams.has('search_fields')).toBe(false);
      await trigger.click();
      await search.getByRole('checkbox', { name: 'All', exact: true }).check();
      await page.keyboard.press('Escape');
      await expect(rail).toHaveCount(0);
      await expect(trigger).toHaveText('All');
      await expect(trigger.locator('svg.bi-funnel-fill')).toHaveCount(0);
      expect(
        await page.locator('body').evaluate((el) => el.scrollWidth - el.clientWidth),
      ).toBeLessThanOrEqual(1);
    });
  }
}

async function open(page, width: number, theme = 'mint', resource = 'users') {
  await page.setViewportSize({ width, height: 900 });
  await page.context().addCookies([
    {
      name: 'portfolio-appearance',
      value: encodeURIComponent(JSON.stringify({ theme, paused: true })),
      url: 'http://127.0.0.1:4173',
    },
  ]);
  await page.route('**/api/authority/session', (route) =>
    route.fulfill({
      json: {
        id: 91,
        user: 'operator',
        email: 'operator@example.com',
        role: 'admin',
        is_create: true,
        is_read: true,
        is_update: true,
        is_delete: true,
        is_monitor: true,
        is_manage_sites: true,
        is_manage_users: true,
        is_manage_roles: true,
      },
    }),
  );
  await page.goto(`/en/management/${resource}`);
  await expect(page.locator('tbody tr')).toHaveCount(6);
  await expect(page.getByRole('table')).toHaveAttribute('aria-busy', 'false');
  return page.locator('[data-table-search]');
}

for (const width of [320, 820, 1440, 2560]) {
  for (const theme of ['mint', 'blue', 'amber', 'mist']) {
    test(`toolbar menus share styling and fit ${width}px in ${theme}`, async ({ page }, info) => {
      const search = await open(page, width, theme);
      const triggers = [
        page.getByRole('button', { name: 'Export', exact: true }),
        page.getByRole('button', { name: 'Columns', exact: true }),
        search.locator('.dropdown-toggle'),
      ];
      const surfaces = [];
      for (let i = 0; i < triggers.length; i++) {
        await triggers[i].click();
        const menu = page.locator('.dropdown-menu.show');
        await expect(menu).toHaveCount(1);
        await expect
          .poll(async () => (await menu.getAttribute('data-popper-placement')) ?? '')
          .toMatch(/^(bottom|top)-/);
        const bounds = await menu.boundingBox();
        const trigger = await triggers[i].boundingBox();
        if (i === 2) expect(trigger!.width).toBeLessThanOrEqual(64);
        expect(bounds!.x).toBeGreaterThanOrEqual(7);
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width - 7);
        expect(bounds!.y).toBeGreaterThanOrEqual(7);
        expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(893);
        if (width >= 820) {
          expect(bounds!.x).toBeCloseTo(trigger!.x, 0);
          expect(bounds!.y - trigger!.y - trigger!.height).toBeCloseTo(4, 0);
        }
        surfaces.push(
          await menu.evaluate((el) => {
            const style = getComputedStyle(el);
            return [
              style.backgroundColor,
              style.borderColor,
              style.borderRadius,
              style.padding,
              style.fontSize,
              style.boxShadow,
            ];
          }),
        );
        if (theme === 'mint')
          await page.screenshot({ path: info.outputPath(`menu-${i}-${width}.png`) });
        await page.keyboard.press('Escape');
        await expect(triggers[i]).toBeFocused();
      }
      expect(surfaces[0]).toEqual(surfaces[1]);
      expect(surfaces[1]).toEqual(surfaces[2]);
      if (width >= 1440) expect((await search.boundingBox())!.width).toBeGreaterThanOrEqual(350);
      else if (width === 820) expect((await search.boundingBox())!.width).toBe(320);
      await search.locator('.dropdown-toggle').click();
      await search.getByRole('checkbox', { name: 'All', exact: true }).uncheck();
      await search.getByRole('checkbox', { name: 'LastLogin', exact: true }).check();
      await page.keyboard.press('Escape');
      const label = search.getByRole('button', {
        name: 'Remove LastLogin from search',
        exact: true,
      });
      await expect(label.locator('[aria-hidden=true]')).toHaveText('×');
      if (theme === 'mint')
        await page.screenshot({ path: info.outputPath(`selected-${width}.png`) });
      expect(
        await label
          .locator('span')
          .first()
          .evaluate((el) => el.scrollWidth - el.clientWidth),
      ).toBeLessThanOrEqual(1);
      const closeBounds = (await label.locator('[aria-hidden=true]').boundingBox())!;
      const railBounds = (await label.locator('xpath=ancestor::ul').boundingBox())!;
      expect(closeBounds.x + closeBounds.width).toBeLessThanOrEqual(
        railBounds.x + railBounds.width,
      );
      expect(new URL(page.url()).searchParams.has('search_fields')).toBe(false);
      expect(
        await page.locator('body').evaluate((el) => el.scrollWidth - el.clientWidth),
      ).toBeLessThanOrEqual(1);
    });
  }
}

test('toolbar field menu supports keyboard selection, cancellation and delayed search', async ({
  page,
}) => {
  const search = await open(page, 1440);
  const trigger = search.locator('.dropdown-toggle');
  await search.getByRole('searchbox').fill('ALEX');
  await trigger.focus();
  await page.keyboard.press('ArrowDown');
  const all = search.getByRole('checkbox', { name: 'All', exact: true });
  await expect(all).toBeFocused();
  await page.keyboard.press(' ');
  await expect(all).not.toBeChecked();
  await expect(search.locator('button[type=submit]')).toBeDisabled();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  const email = search.getByRole('checkbox', { name: 'Email', exact: true });
  await expect(email).toBeFocused();
  await page.keyboard.press(' ');
  await expect(email).toBeChecked();
  expect(await all.evaluate((el) => (el as HTMLInputElement).indeterminate)).toBe(true);
  await expect(trigger).toHaveText('');
  await expect(trigger.locator('svg.bi-funnel-fill')).toBeVisible();
  expect(new URL(page.url()).searchParams.has('search')).toBe(false);
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await search.getByRole('searchbox').press('Enter');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(page).toHaveURL((url) => url.searchParams.get('search_fields') === '["email"]');
  await trigger.click();
  await all.check();
  await expect(search.locator('[role=group] input:not(:checked)')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await search.locator('button[type=submit]').click();
  await expect(page).toHaveURL(
    (url) => JSON.parse(url.searchParams.get('search_fields')!).length > 1,
  );
});

test('independent checkboxes submit two selected fields and restore them from URL', async ({
  page,
}) => {
  const search = await open(page, 820);
  const trigger = search.locator('.dropdown-toggle');
  await search.getByRole('searchbox').fill('alex');
  await trigger.click();
  const all = search.getByRole('checkbox', { name: 'All', exact: true });
  await all.uncheck();
  await search.getByRole('checkbox', { name: 'Email', exact: true }).check();
  await search.getByRole('checkbox', { name: 'Role', exact: true }).check();
  await expect(trigger).toHaveText('');
  await expect(trigger.locator('svg.bi-funnel-fill')).toBeVisible();
  expect(await all.evaluate((el) => (el as HTMLInputElement).indeterminate)).toBe(true);
  expect(new URL(page.url()).searchParams.has('search')).toBe(false);
  await page.keyboard.press('Escape');
  await search.locator('button[type=submit]').click();
  await expect(page).toHaveURL(
    (url) => url.searchParams.get('search_fields') === '["email","role"]',
  );
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await page.reload();
  await expect(trigger).toHaveText('');
  await expect(trigger.locator('svg.bi-funnel-fill')).toBeVisible();
  await trigger.click();
  await expect(search.getByRole('checkbox', { name: 'Email', exact: true })).toBeChecked();
  await expect(search.getByRole('checkbox', { name: 'Role', exact: true })).toBeChecked();
  await expect(search.getByRole('checkbox', { name: 'ID', exact: true })).not.toBeChecked();
});
