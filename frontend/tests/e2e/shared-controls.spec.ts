import { expect, type Locator } from '@playwright/test';
import { runtimeTest as test } from '../fixtures/browser';

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
async function closeContract(button: Locator) {
  await expect(button).toBeVisible();
  await expect(button).toHaveCSS('width', '44px');
  await expect(button).toHaveCSS('height', '44px');
  await expect(button.locator('.icon')).toHaveCSS('width', '20px');
  const bounds = await button.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const viewport = element.ownerDocument.defaultView!;
    return {
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      width: viewport.innerWidth,
      height: viewport.innerHeight,
      trailingInset: element.closest('.modal-content')!.getBoundingClientRect().right - rect.right,
    };
  });
  expect(bounds.left).toBeGreaterThanOrEqual(0);
  expect(bounds.right).toBeLessThanOrEqual(bounds.width + 1);
  expect(bounds.trailingInset).toBeGreaterThanOrEqual(0);
  expect(bounds.trailingInset).toBeLessThanOrEqual(32);
  expect(bounds.top).toBeGreaterThanOrEqual(0);
  expect(bounds.bottom).toBeLessThanOrEqual(bounds.height + 1);
}

for (const viewport of [
  { width: 320, height: 568, theme: 'mist' },
  { width: 820, height: 1180, theme: 'blue' },
  { width: 1440, height: 900, theme: 'mint' },
  { width: 844, height: 390, theme: 'amber' },
]) {
  test(`dialog controls preserve geometry and iframe focus at ${viewport.width}px ${viewport.theme}`, async ({
    page,
  }, info) => {
    test.setTimeout(60_000);
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.context().addCookies([
      {
        name: 'portfolio-appearance',
        value: encodeURIComponent(JSON.stringify({ theme: viewport.theme, paused: true })),
        url: 'http://127.0.0.1:4173',
      },
    ]);
    await page.route('**/api/authority/session', (route) => route.fulfill({ json: admin }));
    await page.goto('/en/management/sites');
    const row = page.locator('tbody tr').first();
    await expect(row).toBeVisible();
    const edit = row.locator('button[value="edit"]');
    await edit.click();
    const dialog = page.getByRole('dialog');
    const close = dialog.locator('.shared-close-button');
    await closeContract(close);
    await page.keyboard.press('Tab');
    await close.focus();
    await expect(close).toHaveCSS('outline-style', 'solid');
    await close.press('Enter');
    await expect(dialog).toHaveCount(0);
    await expect(edit).toBeFocused();
    const remove = row.locator('button[value="delete"]');
    await remove.click();
    await closeContract(dialog.locator('.shared-close-button'));
    await dialog.locator('.shared-close-button').press('Enter');
    await expect(dialog).toHaveCount(0);
    await expect(remove).toBeFocused();
    const preview = row.locator('button[value="preview"]');
    await preview.click();
    const frame = page.frameLocator('iframe');
    await expect(frame.locator('[data-portfolio-site]')).toBeVisible();
    await closeContract(dialog.locator('.shared-close-button'));
    // Use the real child Tab boundary to exercise the shared native button ref handoff.
    await frame.locator('body').evaluate(() => {
      const controls = [
        ...document.querySelectorAll<HTMLElement>(
          'a[href],button,input,select,textarea,[tabindex]',
        ),
      ].filter(
        (node) =>
          node.tabIndex >= 0 &&
          !node.matches(':disabled') &&
          !node.closest('[hidden],[inert]') &&
          node.getClientRects().length > 0,
      );
      controls.at(-1)?.focus();
    });
    await page.keyboard.press('Tab');
    await expect(dialog.locator('.shared-close-button')).toBeFocused();
    await frame.locator('#projects').scrollIntoViewIfNeeded();
    const project = frame.locator('#projects button[aria-label]').first();
    await project.click();
    const child = frame.getByRole('dialog');
    await closeContract(child.locator('.shared-close-button'));
    await page.screenshot({ path: info.outputPath('shared-dialog-close.png') });
    await child.locator('.shared-close-button').press('Enter');
    await expect(child).toHaveCount(0);
    // Child teardown restores its trigger on the next frame; finish that handoff
    // before moving focus across the iframe to activate the parent close button.
    await expect(project).toBeFocused();
    await expect(dialog).toBeVisible();
    const previewClose = dialog.locator('.shared-close-button');
    await previewClose.focus();
    await expect(previewClose).toBeFocused();
    await previewClose.press('Enter');
    await expect(dialog).toHaveCount(0);
    await expect(preview).toBeFocused();
  });
}

test('compact navigation tooltip changes anchors and dismisses on nested scroll and outside pointer', async ({
  page,
}) => {
  await page.goto('/en');
  await expect(page.locator('[data-entering]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Collapse sidebar' }).click();
  const rail = page.locator('[data-sidebar-rail]');
  await expect(rail).toHaveCSS('width', '80px');
  const first = rail.locator('[data-sidebar-item]').first();
  const second = rail.locator('[data-sidebar-item]').nth(1);
  await first.focus();
  const tooltip = page.getByRole('tooltip');
  await expect(tooltip).toHaveText((await first.getAttribute('aria-label')) ?? '');
  await second.focus();
  await expect(tooltip).toHaveText((await second.getAttribute('aria-label')) ?? '');
  await expect(first).not.toHaveAttribute('aria-describedby');
  await expect(second).toHaveAttribute(
    'aria-describedby',
    (await tooltip.getAttribute('id')) ?? '',
  );
  await rail.dispatchEvent('scroll');
  await expect(tooltip).toHaveCount(0);
  await expect(second).toBeFocused();
  await second.blur();
  await second.focus();
  await expect(tooltip).toBeVisible();
  await page.locator('h1').dispatchEvent('pointerdown');
  await expect(tooltip).toHaveCount(0);
  await expect(second).toBeFocused();
  await second.blur();
  await second.focus();
  await expect(tooltip).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(tooltip).toHaveCount(0);
  await expect(second).toBeFocused();
});
