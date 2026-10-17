import { expect, type Locator, type Page, type TestInfo } from '@playwright/test';
import { runtimeTest as test } from '../fixtures/browser';

const viewports = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 768, height: 1024 },
  { width: 820, height: 1180 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
  { width: 2560, height: 1440 },
  { width: 844, height: 390 },
];
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

async function setup(page: Page, signedIn = true) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.context().addCookies([
    {
      name: 'portfolio-appearance',
      value: encodeURIComponent(JSON.stringify({ theme: 'mint', paused: true })),
      url: 'http://127.0.0.1:4173',
    },
  ]);
  await page.route('**/api/authority/session', (route) =>
    route.fulfill({ json: signedIn ? admin : null }),
  );
  await page.route('**/api/authority/register?**', (route) =>
    route.fulfill({
      json: { email: new URL(route.request().url()).searchParams.get('email'), available: true },
    }),
  );
}

async function bounded(locator: Locator, label: string, vertical = false) {
  await expect(locator, label).toBeVisible();
  const box = await locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const window = element.ownerDocument.defaultView!;
    return {
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      width: window.innerWidth,
      height: window.innerHeight,
    };
  });
  expect.soft(box.left, `${label} left`).toBeGreaterThanOrEqual(-1);
  expect.soft(box.right, `${label} right`).toBeLessThanOrEqual(box.width + 1);
  if (vertical) {
    expect.soft(box.top, `${label} top`).toBeGreaterThanOrEqual(-1);
    expect.soft(box.bottom, `${label} bottom`).toBeLessThanOrEqual(box.height + 1);
  }
}

async function documentBounded(page: Page) {
  const size = await page.evaluate(() => ({
    width: innerWidth,
    content: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth),
  }));
  expect.soft(size.content, 'document horizontal overflow').toBeLessThanOrEqual(size.width + 1);
}

async function capture(page: Page, info: TestInfo, name: string) {
  if ([320, 820, 1440, 844].includes(page.viewportSize()!.width))
    await page.screenshot({ path: info.outputPath(`${name}.png`) });
}

async function modalBounded(page: Page, info: TestInfo, name: string) {
  const modal = page.locator('.modal.show').last();
  await expect(modal.locator('.modal-dialog')).toHaveCSS('transform', 'none');
  await bounded(modal.locator('.modal-content'), name, true);
  for (const control of await modal.locator('.modal-header button, .modal-footer button').all())
    await bounded(control, `${name} control`, true);
  await capture(page, info, name);
  return modal;
}

async function gearPanels(page: Page, info: TestInfo) {
  const trigger = page.locator('[data-account-menu-trigger]');
  await trigger.scrollIntoViewIfNeeded();
  await trigger.click();
  let panel = page.locator('[data-account-menu]');
  await bounded(panel, 'gear menu', true);
  await capture(page, info, 'gear');
  for (const key of ['theme', 'language']) {
    await panel.locator(`[data-account-menu-item="${key}"]`).scrollIntoViewIfNeeded();
    await panel.locator(`[data-account-menu-item="${key}"]`).click();
    panel = page.locator('[data-account-menu]');
    await bounded(panel, `gear ${key}`, true);
    const last = panel.locator('button').last();
    await last.scrollIntoViewIfNeeded();
    await bounded(last, `${key} last control`, true);
    await capture(page, info, `gear-${key}`);
    await page.keyboard.press('Escape');
    await expect(panel.locator(`[data-account-menu-item="${key}"]`)).toBeFocused();
  }
  await page.keyboard.press('Escape');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
}

for (const viewport of viewports) {
  const name = `${viewport.width}x${viewport.height}`;
  test.describe(name, () => {
    test.use({ viewport, hasTouch: viewport.width <= 1024 });

    test('public page and project modal geometry', async ({ page }, info) => {
      await setup(page);
      await page.goto('/en');
      await expect(page.locator('[data-entering]')).toHaveCount(0);
      await expect(page.locator('[data-project-id]')).toHaveCount(6);
      await documentBounded(page);
      await bounded(page.locator('h1'), 'profile heading');
      await capture(page, info, 'public-overview');
      for (const id of ['journey', 'experience', 'projects', 'skills']) {
        const section = page.locator(`#${id}`);
        await section.scrollIntoViewIfNeeded();
        await bounded(section, id);
        await capture(page, info, `public-${id}`);
      }
      await page.locator('#projects [data-project-id] button[aria-label]').first().click();
      const project = await modalBounded(page, info, 'project-modal');
      await project.locator('.modal-header button[aria-label="Change language"]').click();
      await bounded(project.locator('.dropdown-menu.show'), 'project language menu', true);
      await page.keyboard.press('Escape');
      await expect(
        project.locator('.modal-header button[aria-label="Change language"]'),
      ).toBeFocused();
      await project.locator('.modal-header > button').click();
      await expect(page.locator('.modal.show')).toHaveCount(0);
      await gearPanels(page, info);
      await documentBounded(page);
    });

    test('login register and recovery geometry', async ({ page }, info) => {
      await setup(page, false);
      await page.goto('/en?view=login');
      await expect(page.locator('[data-auth-panel]')).toBeVisible();
      for (const mode of ['login', 'register', 'forgot']) {
        if (mode === 'register')
          await page.locator('[data-auth-panel] [data-mode] button').nth(1).click();
        if (mode === 'forgot') {
          await page.locator('[data-auth-panel] [data-mode] button').nth(0).click();
          await expect(
            page.locator('[data-auth-form-view="login"]:not([data-auth-preview])'),
          ).not.toHaveAttribute('data-slide-phase');
          await page.getByRole('button', { name: /Forgot/ }).click();
        }
        const form = page.locator(`[data-auth-form-view="${mode}"]:not([data-auth-preview])`);
        await expect(form).not.toHaveAttribute('data-slide-phase');
        await bounded(form, `auth ${mode}`);
        const email = form.locator('input[type="email"]');
        await email.fill('person.with.a.long.responsive.test.address@example.test');
        if (mode === 'register') {
          const available = await form.locator('input[type="password"]').evaluateAll((inputs) =>
            inputs.map((input) => {
              const style = getComputedStyle(input);
              return (
                input.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
              );
            }),
          );
          expect
            .soft(Math.min(...available), 'password text space after icons')
            .toBeGreaterThanOrEqual(64);
        }
        for (const input of await form.locator('input').all()) {
          await input.scrollIntoViewIfNeeded();
          await bounded(input, `${mode} input`, true);
        }
        await documentBounded(page);
        await capture(page, info, `auth-${mode}`);
      }
    });

    for (const resource of ['sites', 'users', 'roles']) {
      test(`${resource} controls detail save warning and preview geometry`, async ({
        page,
      }, info) => {
        await setup(page);
        await page.goto(`/en/management/${resource}`);
        const owner = page.locator(`[data-management-resource="${resource}"]`);
        await expect(owner.locator('tbody tr')).toHaveCount(6);
        await expect(owner).not.toHaveAttribute('data-entering');
        await documentBounded(page);
        await bounded(owner.locator('[data-table-search]'), `${resource} search`);
        await capture(page, info, 'management');
        for (const label of ['Export', 'Columns']) {
          await owner.getByRole('button', { name: label, exact: true }).click();
          const menu = page.locator('.dropdown-menu.show');
          await bounded(menu, `${resource} ${label} menu`, true);
          await capture(page, info, label.toLowerCase());
          await page.keyboard.press('Escape');
        }
        for (const label of resource === 'sites'
          ? ['ID', 'Email', 'Profile', 'Updated']
          : resource === 'users'
            ? ['ID', 'Role', 'Active', 'Updated']
            : ['ID', 'Role', 'Read', 'Updated']) {
          const trigger = owner.getByRole('button', {
            name: `Sort and filter ${label}`,
            exact: true,
          });
          await trigger.scrollIntoViewIfNeeded();
          await trigger.click();
          await bounded(page.locator('.dropdown-menu.show'), `${resource} ${label} filter`, true);
          await capture(page, info, `filter-${label}`);
          await page.keyboard.press('Escape');
        }
        await owner.locator('tbody tr').first().locator('button[value="edit"]').click();
        const detail = await modalBounded(page, info, 'edit');
        if (resource === 'users') {
          await expect(
            detail.getByRole('button', { name: 'Edit Role', exact: true }),
          ).toBeEnabled();
          await detail.getByRole('switch', { name: 'Edit Active', exact: true }).click();
        } else {
          const field = resource === 'sites' ? 'First name' : 'Role';
          const entry = detail
            .locator('dl > div')
            .filter({ has: page.locator('dt').filter({ hasText: new RegExp(`^${field}$`) }) });
          await entry.locator('dd button').first().click();
          await detail.getByRole('textbox', { name: field, exact: true }).fill('Responsive');
          await detail.getByRole('textbox', { name: field, exact: true }).press('Tab');
        }
        await detail
          .locator('.modal-footer')
          .getByRole('button', { name: 'Save', exact: true })
          .click();
        const warning = await modalBounded(page, info, 'save-warning');
        await warning
          .locator('.modal-footer')
          .getByRole('button', { name: 'Cancel', exact: true })
          .click();
        await expect(detail).toBeVisible();
        await detail
          .locator('.modal-footer')
          .getByRole('button', { name: 'Close', exact: true })
          .click();
        const deletable = owner
          .locator('tbody tr')
          .filter({ has: page.locator('button[value="delete"]:enabled') })
          .first();
        await deletable.locator('[data-selection] input').check();
        await owner.getByRole('button', { name: 'Delete', exact: true }).click();
        const deletion = await modalBounded(page, info, 'delete-warning');
        await deletion
          .locator('.modal-footer')
          .getByRole('button', { name: 'Cancel', exact: true })
          .click();
        await gearPanels(page, info);
        if (resource === 'sites') {
          await owner.locator('tbody tr').first().locator('button[value="preview"]').click();
          const preview = await modalBounded(page, info, 'portfolio-preview');
          const frame = page.frameLocator('iframe');
          await expect(frame.locator('[data-portfolio-site]')).toBeVisible();
          await bounded(frame.locator('h1'), 'preview heading');
          await frame.locator('#projects').scrollIntoViewIfNeeded();
          await frame.locator('#projects button[aria-label]').first().click();
          await bounded(frame.locator('.modal.show .modal-content'), 'preview project modal', true);
          await frame.locator('.modal.show').press('Escape');
          const frameBounds = await frame.locator('body').evaluate((body) => ({
            width: body.ownerDocument.defaultView!.innerWidth,
            content: Math.max(body.scrollWidth, body.ownerDocument.documentElement.scrollWidth),
          }));
          expect
            .soft(frameBounds.content, 'preview document horizontal overflow')
            .toBeLessThanOrEqual(frameBounds.width + 1);
          await preview.locator('.modal-header button').click();
        }
        await documentBounded(page);
      });
    }
  });
}
