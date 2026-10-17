declare global {
  interface Window {
    __tableGeometry: { active: boolean; heights: number[] };
  }
}
import { expect, test, type Page } from '@playwright/test';
import { managementEndpointFixture } from '../fixtures/management';
async function restore(page: Page) {
  await page.route('**/api/authority/session', (r) =>
    r.fulfill({
      json: {
        id: 91,
        user: 'operator',
        email: 'operator@example.com',
        role: 'admin',
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
}
for (const resource of ['sites', 'users', 'roles'] as const) {
  for (const width of [390, 820, 1440]) {
    test(`${resource} paging keeps geometry until the next page is ready at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await restore(page);
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      let release!: () => void;
      let gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      let blocked = '2';
      await page.route(`**/api/management/${resource}?**`, async (route) => {
        const url = new URL(route.request().url());
        if (url.searchParams.get('page') === blocked) await gate;
        await route.fulfill({ json: managementEndpointFixture(url) });
      });
      await page.goto(`/en/management/${resource}`);
      const owner = page.locator(`[data-management-resource="${resource}"]`);
      const panel = owner.locator('section').filter({ has: page.locator('table') });
      const scroll = owner.locator('.table-responsive');
      const table = owner.getByRole('table');
      await expect(owner.locator('tbody tr')).toHaveCount(6);
      await expect(table).toHaveAttribute('aria-busy', 'false');
      const verifyPending = async (action: () => Promise<void>) => {
        const before = {
          panel: (await panel.boundingBox())!,
          scroll: (await scroll.boundingBox())!,
          footer: (await owner.locator('nav[aria-label]').last().boundingBox())!,
        };
        await panel.evaluate((node) => {
          const state = { active: true, heights: [] as number[] };
          window.__tableGeometry = state;
          const sample = () => {
            if (!state.active) return;
            state.heights.push(node.getBoundingClientRect().height);
            requestAnimationFrame(sample);
          };
          requestAnimationFrame(sample);
        });
        try {
          await action();
          await expect(table).toHaveAttribute('aria-busy', 'true');
          await expect(owner.locator('[data-pending="true"]')).toHaveCount(1);
          await expect(
            owner.getByRole('status').filter({ has: page.locator('svg[data-decoration]') }),
          ).toBeVisible();
          await expect(owner.locator('tbody')).toHaveAttribute('aria-hidden', 'true');
          await expect(owner.locator('tbody')).toHaveAttribute('inert', '');
          await expect(table).toHaveCSS('opacity', '0');
          await expect(
            owner.getByRole('button', { name: 'Next page', exact: true }),
          ).toBeDisabled();
          await expect
            .poll(() => page.evaluate(() => window.__tableGeometry.heights.length))
            .toBeGreaterThan(8);
          const heights = await page.evaluate(() => {
            const s = window.__tableGeometry;
            s.active = false;
            return s.heights as number[];
          });
          expect(Math.min(...heights)).toBeGreaterThanOrEqual(before.panel.height - 1);
          expect(Math.max(...heights)).toBeLessThanOrEqual(before.panel.height + 1);
          expect(
            Math.abs((await scroll.boundingBox())!.height - before.scroll.height),
          ).toBeLessThanOrEqual(1);
          expect(
            Math.abs(
              (await owner.locator('nav[aria-label]').last().boundingBox())!.y -
                (await panel.boundingBox())!.y -
                (before.footer.y - before.panel.y),
            ),
          ).toBeLessThanOrEqual(1);
          await panel.screenshot({
            path: test.info().outputPath(`${resource}-paging-${width}.png`),
          });
        } finally {
          await page.evaluate(() => {
            window.__tableGeometry.active = false;
          });
          release();
        }
      };
      await verifyPending(() =>
        owner.getByRole('button', { name: 'Next page', exact: true }).click(),
      );
      await expect(table).toHaveAttribute('aria-busy', 'false');
      await expect(owner.locator('tbody tr').first()).toHaveAttribute('data-row-key', '8');
      await expect(owner.locator('tbody')).not.toHaveAttribute('aria-hidden', 'true');
      await expect(table).toHaveCSS('opacity', '1');
      await expect(
        owner.getByText('Showing 7 to 12 of 14 rows, Total: 14', { exact: true }),
      ).toBeVisible();
      const fullHeight = (await scroll.boundingBox())!.height;
      blocked = '3';
      gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      await verifyPending(() =>
        owner.getByRole('button', { name: 'Last page', exact: true }).click(),
      );
      await expect(table).toHaveAttribute('aria-busy', 'false');
      await expect(owner.locator('tbody tr')).toHaveCount(2);
      await expect(
        owner.getByText('Showing 13 to 14 of 14 rows, Total: 14', { exact: true }),
      ).toBeVisible();
      expect((await scroll.boundingBox())!.height).toBeLessThan(fullHeight);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
      ).toBeLessThanOrEqual(1);
      expect(errors).toEqual([]);
    });
  }
}
test('one-row pages fit the loading indicator without widening or resizing the panel', async ({
  page,
}) => {
  await restore(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/management/users?**', async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('page') === '2') await gate;
    await route.fulfill({ json: managementEndpointFixture(url) });
  });
  await page.goto('/en/management/users?size=1');
  const owner = page.locator('[data-management-resource="users"]');
  const scroll = owner.locator('.table-responsive');
  await expect(owner.locator('tbody tr')).toHaveCount(1);
  const before = (await scroll.boundingBox())!;
  try {
    await owner.getByRole('button', { name: 'Next page', exact: true }).click();
    await expect(owner.getByRole('table')).toHaveAttribute('aria-busy', 'true');
    const loading = owner.getByRole('status').filter({ has: page.locator('svg[data-decoration]') });
    await expect(loading).toBeVisible();
    const bounds = (await loading.boundingBox())!;
    expect(bounds.y).toBeGreaterThanOrEqual(before.y);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(before.y + before.height + 1);
    const svg = (await loading.locator('svg').boundingBox())!;
    expect(svg.y + svg.height).toBeLessThanOrEqual(before.y + before.height + 1);
    expect((await scroll.boundingBox())!.height).toBe(before.height);
  } finally {
    release();
  }
  await expect(owner.getByRole('table')).toHaveAttribute('aria-busy', 'false');
  await expect(owner.locator('tbody tr').first()).toHaveAttribute('data-row-key', '13');
});

test('a failed second-page request hides stale records and retries the selected page', async ({
  page,
}) => {
  await restore(page);
  let failed = true;
  const requests: URL[] = [];
  await page.route('**/api/management/users?**', (route) => {
    const url = new URL(route.request().url());
    requests.push(url);
    if (failed && url.searchParams.get('page') === '2')
      return route.fulfill({ status: 400, json: { detail: 'TEST_PAGE_UNAVAILABLE' } });
    return route.fulfill({ json: managementEndpointFixture(url) });
  });
  await page.goto('/en/management/users');
  const owner = page.locator('[data-management-resource="users"]');
  await expect(owner.locator('tbody tr')).toHaveCount(6);
  await owner.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(owner.getByRole('alert')).toBeVisible();
  await expect(owner.locator('tbody tr')).toHaveCount(0);
  expect(requests.at(-1)?.searchParams.get('page')).toBe('2');
  failed = false;
  await owner.getByRole('alert').getByRole('button').click();
  await expect(owner.getByRole('alert')).toHaveCount(0);
  await expect(owner.locator('tbody tr')).toHaveCount(6);
  await expect(owner.locator('tbody tr').first()).toHaveAttribute('data-row-key', '8');
  expect(requests.at(-1)?.searchParams.get('page')).toBe('2');
});
