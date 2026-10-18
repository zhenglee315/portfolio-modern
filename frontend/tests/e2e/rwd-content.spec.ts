import { expect } from '@playwright/test';
import { runtimeTest as test, openClientShell } from '../fixtures/browser';
import { managementEndpointFixture } from '../fixtures/management';
import { endpointFixture } from '../fixtures/portfolio';

const admin = {
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
};
for (const viewport of [
  { width: 320, height: 568 },
  { width: 820, height: 1180 },
  { width: 1440, height: 900 },
  { width: 844, height: 390 },
]) {
  test.describe(`content ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport, hasTouch: viewport.width <= 1024 });
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.context().addCookies([
        {
          name: 'portfolio-appearance',
          value: encodeURIComponent(JSON.stringify({ theme: 'mint', paused: true })),
          url: 'http://127.0.0.1:4173',
        },
      ]);
      await page.route('**/api/authority/session', (route) => route.fulfill({ json: admin }));
    });

    for (const embedded of [false, true])
      test(`long project heading retains readable modal body (${embedded ? 'preview' : 'public'})`, async ({
        page,
      }, info) => {
        const title =
          'Responsive project documentation and administrative review across manufacturing platforms '
            .repeat(2)
            .trim();
        await page.route('**/api/**/projects?**', (route) => {
          const url = new URL(route.request().url());
          url.pathname = '/portfolio/projects';
          url.searchParams.set('site_id', '1');
          const data = endpointFixture(url) as { items: Record<string, unknown>[] };
          data.items[0] = {
            ...data.items[0],
            projectName: title,
            projectTitle:
              'Research and development of reusable international production platforms and multi-tenant reporting interfaces',
          };
          return route.fulfill({ json: data });
        });
        if (embedded) {
          await page.goto('/en/management/sites');
          await expect(page.locator('tbody tr')).toHaveCount(6);
          await page.locator('tbody tr').first().locator('button[value="preview"]').click();
        } else await openClientShell(page, '/en/sam#projects');
        const frame = embedded ? page.frameLocator('iframe') : page;
        await expect(frame.locator('[data-portfolio-site]')).toBeVisible();
        await frame.locator('#projects').scrollIntoViewIfNeeded();
        await frame.locator('#projects button[aria-label]').first().click();
        const modal = frame.locator('.modal.show');
        await expect(modal.locator('.modal-dialog')).toHaveCSS('transform', 'none');
        await expect(modal.locator('h2')).toHaveText(title);
        const body = modal.locator('.modal-body');
        const geometry = await body.evaluate((element) => {
          const bounds = element.getBoundingClientRect();
          return {
            height: element.clientHeight,
            bottom: bounds.bottom,
            viewport: element.ownerDocument.defaultView!.innerHeight,
          };
        });
        expect.soft(geometry.height, 'readable body below long title').toBeGreaterThanOrEqual(44);
        expect
          .soft(geometry.bottom, 'modal body remains inside preview')
          .toBeLessThanOrEqual(geometry.viewport + 1);
        if (!embedded) {
          await modal.getByRole('button', { name: 'Change language', exact: true }).click();
          await expect(modal.locator('.dropdown-menu.show')).toBeVisible();
        }
        await expect(modal.locator('.modal-header > button')).toBeVisible();
        expect(
          await modal
            .locator('.modal-header > button')
            .evaluate(
              (element) =>
                element.getBoundingClientRect().bottom <=
                element.ownerDocument.defaultView!.innerHeight,
            ),
        ).toBe(true);
        await page.screenshot({
          path: info.outputPath(
            `long-title-${embedded ? 'preview' : 'public'}-${viewport.width}.png`,
          ),
        });
      });

    test('long immutable email wraps in the table and details without horizontal body scrolling', async ({
      page,
    }, info) => {
      const email = `${'responsive.account.'.repeat(8)}user@example.test`;
      await page.route('**/api/management/users?**', (route) => {
        const data = managementEndpointFixture(new URL(route.request().url()))!;
        data.items[0].email = email;
        return route.fulfill({ json: data });
      });
      await page.goto('/en/management/users');
      await expect(page.locator('tbody tr')).toHaveCount(6);
      const row = page.locator('tbody tr').first();
      const cell = row.locator('td').filter({ hasText: email });
      await expect(cell).toHaveText(email);
      expect(
        await cell.evaluate((element) => element.scrollWidth - element.clientWidth),
      ).toBeLessThanOrEqual(1);
      await row.locator('button[value="edit"]').click();
      const modal = page.locator('.modal.show');
      const emailRow = modal
        .locator('dl > div')
        .filter({ has: page.locator('dt').filter({ hasText: /^Email$/ }) });
      await expect(emailRow.locator('dd')).toHaveText(email);
      expect(
        await modal
          .locator('.modal-body')
          .evaluate((element) => element.scrollWidth - element.clientWidth),
      ).toBeLessThanOrEqual(1);
      await page.screenshot({ path: info.outputPath(`long-email-${viewport.width}.png`) });
    });
  });
}
