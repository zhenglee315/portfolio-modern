import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { managementEndpointFixture, type ManagementResource } from '../fixtures/management';

type Locale = 'en' | 'zh-Hant';
type Messages = typeof import('../../src/i18n/messages/en.json');
const en = JSON.parse(
  readFileSync(new URL('../../src/i18n/messages/en.json', import.meta.url), 'utf8'),
) as Messages;
const zhHant = JSON.parse(
  readFileSync(new URL('../../src/i18n/messages/zh-Hant.json', import.meta.url), 'utf8'),
) as Messages;
const messages = { en, 'zh-Hant': zhHant };
const resources = ['sites', 'users', 'roles'] as const;
const widths = [320, 375, 390, 768, 820, 1024, 1280, 1920];
const headingKeys = {
  sites: 'platformManagement',
  users: 'userManagement',
  roles: 'roleManagement',
} as const;

/** Use generated administrator identity while management data comes from the shared API fixture. */
async function openManagement(
  page: Page,
  width: number,
  locale: Locale,
  resource: ManagementResource,
  query = '',
  identity = { user: 'operator', role: 'administrator' },
) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width, height: 900 });
  await page.route('**/api/authority/session', (route) =>
    route.fulfill({
      json: {
        id: 91,
        user: identity.user,
        email: 'operator@example.com',
        role: identity.role,
        is_create: true,
        is_read: true,
        is_update: true,
        is_delete: true,
        is_manage_roles: true,
        is_manage_users: true,
        is_manage_sites: true,
      },
    }),
  );
  await page.goto(`/${locale}/management/${resource}${query}`);
  const management = page.locator(`[data-management-resource="${resource}"]`);
  await expect(management.getByRole('heading', { level: 1 })).toHaveText(
    messages[locale].accountMenu[headingKeys[resource]],
  );
  await expect(management.getByRole('table')).toHaveAttribute('aria-busy', 'false');
  await expect(management.locator('tbody > tr')).toHaveCount(query ? 1 : 6);
  expect(errors).toEqual([]);
  return management;
}

/** Bounds assertions allow vertical document scrolling, while only the data viewport may scroll sideways. */
async function expectHorizontalBounds(locator: Locator, width: number) {
  const bounds = await locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { left: rect.left, right: rect.right, width: rect.width };
  });
  expect(bounds.width).toBeGreaterThan(0);
  expect(bounds.left).toBeGreaterThanOrEqual(-1);
  expect(bounds.right).toBeLessThanOrEqual(width + 1);
}

async function expectDocumentBounded(page: Page, width: number) {
  expect(
    await page.evaluate(() =>
      Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
    ),
  ).toBeLessThanOrEqual(width);
}

async function expectTouchTarget(locator: Locator) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
}

for (const [index, width] of widths.entries()) {
  for (const [localeIndex, locale] of (['en', 'zh-Hant'] as const).entries()) {
    const resource = resources[(index + localeIndex) % resources.length]!;
    test(`${locale} ${resource} controls and table stay usable at ${width}px`, async ({ page }) => {
      const management = await openManagement(page, width, locale, resource);
      const copy = messages[locale].management;
      await expect(management.locator('thead th').first()).toContainText(copy.fields.id);
      await expect(
        management.getByRole('button', { name: copy.clearSort, exact: true }),
      ).toBeVisible();
      const title = management.getByRole('heading', { level: 1 });
      const search = management.getByRole('searchbox', { name: copy.search, exact: true });
      const columns = management.getByRole('button', { name: copy.columns, exact: true });
      const size = management.getByRole('combobox', { name: copy.rowsPerPage, exact: true });
      const navigation = management.getByRole('navigation', { name: copy.pagination, exact: true });
      const scroll = management.locator('.table-responsive');
      for (const control of [title, search, columns, size, navigation, scroll]) {
        await expectHorizontalBounds(control, width);
      }
      expect(
        await title.evaluate((node) => node.scrollWidth - node.clientWidth),
      ).toBeLessThanOrEqual(1);
      const filters = management.locator('form label');
      for (let filter = 0; filter < (await filters.count()); filter++) {
        await expectHorizontalBounds(filters.nth(filter), width);
        expect(
          await filters.nth(filter).evaluate((node) => node.scrollWidth - node.clientWidth),
        ).toBeLessThanOrEqual(1);
      }
      await expectDocumentBounded(page, width);
      await expect(scroll).toHaveCSS('overflow-x', 'auto');
      if (width <= 390) {
        expect(await scroll.evaluate((node) => node.scrollWidth)).toBeGreaterThan(
          await scroll.evaluate((node) => node.clientWidth),
        );
      }
      if (width <= 760) {
        for (const control of [
          search,
          size,
          columns,
          management.getByRole('button', { name: copy.refresh, exact: true }),
          management.getByRole('button', { name: copy.clearSort, exact: true }),
          management.getByRole('button', { name: copy.next, exact: true }),
        ]) {
          await expectTouchTarget(control);
        }
        const selects = management.locator('form select, form input[type="number"]');
        for (let index = 0; index < (await selects.count()); index++) {
          await expectTouchTarget(selects.nth(index));
        }
      }
      await scroll.evaluate((node) => {
        node.scrollLeft = node.scrollWidth;
      });
      const action = management.locator('tbody > tr').first().getByRole('button');
      await action.scrollIntoViewIfNeeded();
      await expect(action).toBeInViewport();
      await expectHorizontalBounds(action, width);
      if (width <= 760) await expectTouchTarget(action);
      await action.click();
      const detail = page.getByRole('dialog');
      await expect(detail).toBeVisible();
      await expectHorizontalBounds(detail.locator('.modal-content'), width);
      await detail
        .locator('.modal-footer')
        .getByRole('button', { name: copy.close, exact: true })
        .click();
      await expect(detail).not.toBeVisible();
      await size.selectOption('10');
      await expect(management.locator('tbody > tr')).toHaveCount(10);
      await management.getByRole('button', { name: copy.next, exact: true }).click();
      await expect(management.locator('tbody > tr')).toHaveCount(4);
      await expect(management.locator('tbody > tr').first()).toHaveAttribute('data-row-key', '4');
      await expectDocumentBounded(page, width);
      if (locale === 'en' && [320, 390, 820, 1920].includes(width)) {
        await scroll.evaluate((node) => {
          node.scrollLeft = 0;
        });
        await title.click();
        await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
        await page.screenshot({
          path: test.info().outputPath(`management-rwd-${width}.png`),
          fullPage: true,
        });
      }
    });
  }
}

test.describe('mobile touch sorting', () => {
  test.use({ hasTouch: true });
  test('mobile multi-column sorting works without a Shift key', async ({ page }) => {
    const management = await openManagement(page, 390, 'en', 'roles');
    await management.getByRole('button', { name: 'Sort Active ascending', exact: true }).tap();
    await expect(management.getByRole('table')).toHaveAttribute('aria-busy', 'false');
    const multiSort = management.getByRole('checkbox', {
      name: en.management.multiSort,
      exact: true,
    });
    await expectTouchTarget(multiSort.locator('..'));
    await multiSort.locator('..').tap();
    await expect(multiSort).toBeChecked();
    await management.getByRole('button', { name: 'Sort Role name ascending', exact: true }).tap();
    await expect
      .poll(() => new URL(page.url()).searchParams.get('sort'))
      .toBe('is_active:asc,role:asc');
    await expect(management.getByRole('table')).toHaveAttribute('aria-busy', 'false');
    await expect(management.locator('tbody > tr').nth(1)).toContainText('administrator');
    await expectDocumentBounded(page, 390);
  });
});

test('a 300px embedded table uses its own compact layout on a desktop', async ({ page }) => {
  const management = await openManagement(page, 1920, 'en', 'users', '?size=1');
  const panel = management.locator('#management-content > section');
  await panel.evaluate((element) => {
    element.style.width = '300px';
  });
  const navigation = management.getByRole('navigation', {
    name: en.management.pagination,
    exact: true,
  });
  const controls = [
    management.getByRole('searchbox', { name: en.management.search, exact: true }),
    management.getByRole('combobox', { name: en.management.rowsPerPage, exact: true }),
    management.getByRole('button', { name: en.management.columns, exact: true }),
    management.getByRole('button', { name: en.management.next, exact: true }),
  ];
  for (const control of controls) await expectTouchTarget(control);
  expect(await panel.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(
    1,
  );
  expect(
    await navigation.evaluate((node) => node.scrollWidth - node.clientWidth),
  ).toBeLessThanOrEqual(1);
  await navigation.getByRole('button', { name: 'Page 14', exact: true }).click();
  await expect(management.locator('tbody > tr').first()).toHaveAttribute('data-row-key', '1');
  await expectDocumentBounded(page, 1920);
});

test.describe('tablet touch controls', () => {
  test.use({ hasTouch: true });
  for (const width of [768, 820, 1024]) {
    test(`coarse-pointer controls provide 44px targets at ${width}px`, async ({ page }) => {
      const management = await openManagement(page, width, 'en', 'users');
      expect(await page.evaluate(() => matchMedia('(any-pointer: coarse)').matches)).toBe(true);
      for (const control of [
        management.getByRole('button', { name: en.management.openNavigation, exact: true }),
        management.getByRole('searchbox', { name: en.management.search, exact: true }),
        management.getByRole('combobox', { name: en.management.rowsPerPage, exact: true }),
        management.getByRole('button', { name: en.management.columns, exact: true }),
        management.getByRole('button', { name: en.management.refresh, exact: true }),
        management.getByRole('button', { name: en.management.next, exact: true }),
      ]) {
        await expectTouchTarget(control);
      }
      await expectDocumentBounded(page, width);
    });
  }
});

for (const { width, resource, locale } of [
  { width: 320, resource: 'sites', locale: 'en' },
  { width: 390, resource: 'users', locale: 'zh-Hant' },
  { width: 768, resource: 'roles', locale: 'en' },
] as const) {
  test(`${resource} all columns and long text remain reachable at ${width}px`, async ({ page }) => {
    const token = 'UnbrokenSyntheticManagementValue'.repeat(18);
    const detailText = resource === 'users' ? `${token.slice(0, 242)}@example.com` : token;
    await page.route(`**/api/management/${resource}?**`, (route) => {
      const response = managementEndpointFixture(new URL(route.request().url()))!;
      const first = response.items[0]!;
      first[resource === 'roles' ? 'role' : 'user'] = token.slice(
        0,
        resource === 'roles' ? 64 : 32,
      );
      if (resource === 'sites') {
        first.brand_title = token;
        first.chat_content = token;
      } else if (resource === 'users') first.email = detailText;
      else first.description = token;
      return route.fulfill({ json: response });
    });
    const management = await openManagement(page, width, locale, resource);
    const copy = messages[locale].management;
    const columns = management.getByRole('button', { name: copy.columns, exact: true });
    await columns.click();
    const menu = management.locator('.dropdown-menu.show');
    await expect(menu).toBeVisible();
    await expectHorizontalBounds(menu, width);
    expect(await menu.evaluate((node) => node.scrollHeight)).toBeGreaterThan(
      await menu.evaluate((node) => node.clientHeight),
    );
    const choices = menu.getByRole('checkbox');
    const count = await choices.count();
    expect(count).toBe(resource === 'sites' ? 30 : resource === 'users' ? 13 : 15);
    for (let index = 0; index < count; index++) {
      if (await choices.nth(index).isEnabled()) await choices.nth(index).check();
      else await expect(choices.nth(index)).toBeChecked();
    }
    await columns.click();
    await expect(menu).not.toBeVisible();
    await expect(management.locator('thead th')).toHaveCount(count + 1);
    await expectDocumentBounded(page, width);
    const scroll = management.locator('.table-responsive');
    await scroll.evaluate((node) => {
      node.scrollLeft = node.scrollWidth;
    });
    const action = management.locator('tbody > tr').first().getByRole('button');
    await action.scrollIntoViewIfNeeded();
    await expect(action).toBeInViewport();
    await action.click();
    const detail = page.getByRole('dialog');
    await expect(detail).toBeVisible();
    const content = detail.locator('.modal-content');
    const body = detail.locator('.modal-body');
    const modalTitle = detail.locator('.modal-title');
    await expectHorizontalBounds(content, width);
    expect(
      await content.evaluate((node) => node.scrollWidth - node.clientWidth),
    ).toBeLessThanOrEqual(1);
    expect(
      await modalTitle.evaluate((node) => node.scrollWidth - node.clientWidth),
    ).toBeLessThanOrEqual(1);
    expect(await body.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(
      1,
    );
    await expect(body).toContainText(detailText);
    expect(await body.evaluate((node) => node.scrollHeight)).toBeGreaterThan(
      await body.evaluate((node) => node.clientHeight),
    );
    await detail
      .locator('.modal-footer')
      .getByRole('button', { name: copy.close, exact: true })
      .click();
    await expect(detail).not.toBeVisible();
    await expect(action).toBeFocused();
    await expectDocumentBounded(page, width);
    await scroll.evaluate((node) => {
      node.scrollLeft = 0;
    });
    await management.getByRole('heading', { level: 1 }).click();
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.screenshot({
      path: test.info().outputPath(`management-${resource}-${width}.png`),
      fullPage: true,
    });
  });
}

test('320px pagination keeps fourteen pages reachable without widening the document', async ({
  page,
}) => {
  const width = 320;
  const management = await openManagement(page, width, 'en', 'sites', '?size=1');
  const navigation = management.getByRole('navigation', {
    name: en.management.pagination,
    exact: true,
  });
  await expectHorizontalBounds(navigation, width);
  await expectDocumentBounded(page, width);
  const last = navigation.getByRole('button', { name: 'Page 14', exact: true });
  await last.scrollIntoViewIfNeeded();
  await expect(last).toBeInViewport();
  await expectTouchTarget(last);
  await last.click();
  await expect(management.locator('tbody > tr').first()).toHaveAttribute('data-row-key', '1');
  await expect(
    navigation.getByRole('button', { name: en.management.next, exact: true }),
  ).toBeDisabled();
  const first = navigation.getByRole('button', { name: 'Page 1', exact: true });
  await first.scrollIntoViewIfNeeded();
  await expect(first).toBeInViewport();
  await first.click();
  await expect(management.locator('tbody > tr').first()).toHaveAttribute('data-row-key', '14');
  await expectDocumentBounded(page, width);
});

for (const width of [390, 1024, 1280]) {
  test(`management navigation adapts to the ${width}px layout`, async ({ page }) => {
    const management = await openManagement(page, width, 'en', 'sites');
    const mobile = management.getByRole('button', {
      name: en.management.openNavigation,
      exact: true,
    });
    const collapse = management.getByRole('button', {
      name: en.management.collapseNavigation,
      exact: true,
    });
    if (width <= 1024) {
      await expect(collapse).not.toBeVisible();
      await expect(mobile).toBeVisible();
      if (width <= 760) await expectTouchTarget(mobile);
      await mobile.click();
      const drawer = page.getByRole('dialog', { name: en.management.workspace, exact: true });
      await expect(drawer).toBeVisible();
      await expect(drawer).toHaveCSS('transform', 'none');
      await expectHorizontalBounds(drawer, width);
      await drawer.getByRole('link', { name: en.accountMenu.userManagement, exact: true }).click();
      await expect(drawer).not.toBeVisible();
      await expect(page).toHaveURL(/\/en\/management\/users$/);
      await expect(page.locator('[data-management-resource="users"] tbody > tr')).toHaveCount(6);
    } else {
      await expect(mobile).not.toBeVisible();
      await expect(collapse).toBeVisible();
      await collapse.click();
      await expect(
        management.getByRole('button', { name: en.management.expandNavigation, exact: true }),
      ).toBeVisible();
      await expect(management.locator('.table-responsive')).toBeVisible();
    }
    await expectDocumentBounded(page, width);
  });
}

test('an open mobile drawer releases the page when resized to desktop and stays usable on return', async ({
  page,
}) => {
  const management = await openManagement(page, 390, 'en', 'sites');
  const toggle = management.getByRole('button', {
    name: en.management.openNavigation,
    exact: true,
  });
  const drawer = page.getByRole('dialog', { name: en.management.workspace, exact: true });
  await toggle.click();
  await expect(drawer).toHaveCSS('transform', 'none');
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(drawer).not.toBeVisible();
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
  await expect(
    management.getByRole('button', { name: en.management.collapseNavigation, exact: true }),
  ).toBeVisible();
  await expectDocumentBounded(page, 1280);
  await page.setViewportSize({ width: 390, height: 900 });
  await expect(toggle).toBeVisible();
  await expect(drawer).not.toBeVisible();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await expect(drawer).toHaveCSS('transform', 'none');
  await expectHorizontalBounds(drawer, 390);
  await drawer.getByRole('button', { name: en.management.close, exact: true }).click();
  await expect(drawer).not.toBeVisible();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expectDocumentBounded(page, 390);
});

for (const width of [640, 768]) {
  test(`column chooser stays inside a ${width}px landscape viewport`, async ({ page }) => {
    const management = await openManagement(page, width, 'en', 'sites');
    await page.setViewportSize({ width, height: 360 });
    const columns = management.getByRole('button', { name: en.management.columns, exact: true });
    await columns.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      window.scrollTo({
        top: window.scrollY + rect.top - window.innerHeight / 2,
        behavior: 'instant',
      });
    });
    await columns.click();
    const menu = management.locator('.dropdown-menu.show');
    await expect(menu).toBeVisible();
    await expect.poll(async () => (await menu.boundingBox())!.y).toBeGreaterThanOrEqual(7);
    await expect
      .poll(async () => {
        const box = (await menu.boundingBox())!;
        return box.y + box.height;
      })
      .toBeLessThanOrEqual(353);
    await expectHorizontalBounds(menu, width);
    const last = menu.getByRole('checkbox').last();
    await last.scrollIntoViewIfNeeded();
    await last.check();
    await expect(last).toBeInViewport();
    const box = (await last.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(360);
    expect(await menu.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
    await expectDocumentBounded(page, width);
  });
}

for (const width of [1025, 1280]) {
  test(`long account identity keeps the desktop header bounded at ${width}px`, async ({ page }) => {
    const identity = {
      user: 'unbrokenuseridentity'.repeat(2).slice(0, 32),
      role: 'UnbrokenAdministratorRole'.repeat(3).slice(0, 64),
    };
    const management = await openManagement(page, width, 'en', 'users', '', identity);
    const header = management.locator('header');
    await expectHorizontalBounds(header, width);
    for (const text of [identity.user, identity.role]) {
      const label = header.getByText(text, { exact: true });
      await expect(label).toBeVisible();
      await expectHorizontalBounds(label, width);
    }
    await expectHorizontalBounds(
      header.getByRole('button', { name: en.accountMenu.trigger, exact: true }),
      width,
    );
    await expectDocumentBounded(page, width);
  });
}

for (const { width, height, locale } of [
  { width: 320, height: 640, locale: 'en' },
  { width: 390, height: 844, locale: 'zh-Hant' },
  { width: 768, height: 360, locale: 'en' },
  { width: 1024, height: 768, locale: 'zh-Hant' },
  { width: 1440, height: 900, locale: 'en' },
] as const) {
  test(`${locale} header filter menu stays reachable at ${width}×${height}px`, async ({ page }) => {
    const management = await openManagement(page, width, locale, 'roles');
    await page.setViewportSize({ width, height });
    const copy = messages[locale].management;
    const trigger = management.getByRole('button', {
      name: copy.columnMenu.replace('{{column}}', copy.fields.is_active),
      exact: true,
    });
    await trigger.scrollIntoViewIfNeeded();
    await trigger.click();
    const menu = page.locator('.dropdown-menu.show').filter({
      has: page.getByRole('radio', { name: copy.no, exact: true }),
    });
    await expect(menu).toBeVisible();
    await expectHorizontalBounds(menu, width);
    await expect.poll(async () => (await menu.boundingBox())!.y).toBeGreaterThanOrEqual(7);
    await expect
      .poll(async () => {
        const bounds = (await menu.boundingBox())!;
        return bounds.y + bounds.height;
      })
      .toBeLessThanOrEqual(height - 7);
    expect(await menu.evaluate((node) => Boolean(node.closest('.table-responsive')))).toBe(false);
    const option = menu.getByRole('radio', { name: copy.no, exact: true });
    await expectTouchTarget(option.locator('..'));
    await option.click();
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(trigger).toBeFocused();
    await expect(management.locator('tbody > tr')).toHaveCount(1);
    await expect(management.locator('tbody')).toContainText('archived');
    await expect.poll(() => new URL(page.url()).searchParams.get('is_active')).toBe('false');
    await expectDocumentBounded(page, width);
    await trigger.click();
    await menu.getByRole('radio', { name: copy.all, exact: true }).click();
    await expect(management.locator('tbody > tr')).toHaveCount(6);
    await expect(trigger).toBeFocused();
    await expect.poll(() => new URL(page.url()).searchParams.get('is_active')).toBeNull();
  });
}
