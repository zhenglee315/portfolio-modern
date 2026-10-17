import { expect, test, type Page } from '@playwright/test';
import { managementEndpointFixture, managementSiteFixtures } from '../fixtures/management';

async function setup(
  page: Page,
  options: {
    failure?: number;
    committed?: boolean;
    lost?: boolean;
    hold?: boolean;
    actorId?: number;
  } = {},
) {
  const rows = managementSiteFixtures();
  rows.forEach((r) => (r.is_default = r.has_site ? r.id === 9 : null));
  const writes: { url: string; body: { changes: Record<string, unknown> } }[] = [];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let expired = false;
  const admin = {
    id: options.actorId ?? 91,
    user: 'operator',
    email: 'operator@example.com',
    role: 'custom',
    is_create: false,
    is_read: false,
    is_update: false,
    is_delete: false,
    is_manage_sites: true,
    is_manage_users: false,
    is_manage_roles: false,
  };
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/authority/session', (route) =>
    route.fulfill({ json: expired ? null : admin }),
  );
  await page.route('**/api/management/sites?**', (route) => {
    const url = new URL(route.request().url());
    return route.fulfill({
      json: managementEndpointFixture(
        url,
        rows.map((r) => ({ ...r, locale: url.searchParams.get('locale') ?? 'en' })),
      ),
    });
  });
  await page.route('**/api/management/sites/*', async (route) => {
    const body = route.request().postDataJSON();
    const id = Number(new URL(route.request().url()).pathname.split('/').at(-1));
    writes.push({ url: route.request().url(), body });
    expect(route.request().method()).toBe('PATCH');
    if (options.hold) await gate;
    const row = rows.find((r) => r.id === id)!;
    expect(body.expected_owner_email).toBe(row.owner_email);
    if (!options.failure || options.committed || options.lost) {
      if (body.changes.is_default === true)
        rows.forEach((r) => {
          if (r.is_default !== null) r.is_default = false;
        });
      Object.assign(row, body.changes);
      if (body.changes.owner_is_active !== undefined) row.updatetime = '2026-10-16T09:00:00Z';
      if (row.owner_is_active === false) row.is_default = row.has_site ? false : null;
    }
    if (id === admin.id && body.changes.owner_is_active === false) expired = true;
    if (options.failure === 401) expired = true;
    if (options.lost) return route.abort('failed');
    if (options.failure)
      return route.fulfill({
        status: options.failure,
        json: {
          detail: options.committed
            ? 'MANAGEMENT_UPDATE_COMMITTED_CACHE_UNAVAILABLE'
            : options.failure === 409
              ? 'DEFAULT_SITE_REQUIRES_ACTIVE_PUBLISHED'
              : 'AUTH_REQUIRED',
        },
      });
    return route.fulfill({
      json: { ...row, locale: new URL(route.request().url()).searchParams.get('locale') },
    });
  });
  return {
    writes,
    release,
    get rows() {
      return rows;
    },
  };
}
const scope = (page: Page) => page.locator('[data-management-resource="sites"]');
const cell = (page: Page, id: number, label: string) =>
  scope(page)
    .locator(`tbody tr[data-row-key="${id}"]`)
    .getByRole('switch', { name: new RegExp(`^${label}: ${id}(;|$)`) });
async function open(page: Page, path = '/en/management/sites') {
  await page.goto(path);
  await expect(scope(page).locator('tbody tr').first()).toBeVisible();
  await expect(scope(page).getByRole('table')).toHaveAttribute('aria-busy', 'false');
}
for (const width of [320, 820, 1440])
  test(`Default replaces the previous row in one PATCH and persists at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const api = await setup(page, { hold: true });
    await open(page);
    await expect(cell(page, 14, 'Default')).toBeDisabled();
    await expect(cell(page, 9, 'Default')).toBeChecked();
    const chosen = cell(page, 13, 'Default');
    await chosen.scrollIntoViewIfNeeded();
    await chosen.click();
    await expect(chosen).toBeChecked();
    await expect(chosen).toBeDisabled();
    await expect(chosen).toHaveAttribute('aria-busy', 'true');
    await expect(cell(page, 9, 'Default')).not.toBeChecked();
    expect(api.writes).toHaveLength(1);
    expect(api.writes[0].body).toEqual({
      expected_owner_email: 'avery@example.com',
      expected: { is_default: false },
      changes: { is_default: true },
    });
    api.release();
    await expect(chosen).toBeEnabled();
    await expect(chosen).toBeChecked();
    await expect(cell(page, 9, 'Default')).not.toBeChecked();
    await expect(page.getByRole('status')).toContainText('Saved.');
    await page.reload();
    await expect(cell(page, 13, 'Default')).toBeChecked();
    await expect(cell(page, 9, 'Default')).not.toBeChecked();
    await scope(page).screenshot({ path: info.outputPath(`saved-switches-${width}.png`) });
  });
test('Active works without a website; clear Default before disabling and keep Preview available', async ({
  page,
}) => {
  const api = await setup(page);
  await open(page);
  await expect(cell(page, 11, 'Active')).not.toBeChecked();
  await cell(page, 11, 'Active').click();
  await expect(cell(page, 11, 'Active')).toBeEnabled();
  await expect(cell(page, 11, 'Active')).toBeChecked();
  expect(api.writes[0].body.changes).toEqual({ owner_is_active: true });
  await expect(cell(page, 9, 'Active')).toBeDisabled();
  await cell(page, 9, 'Default').click();
  await expect(cell(page, 9, 'Default')).not.toBeChecked();
  await expect(cell(page, 9, 'Active')).toBeEnabled();
  await cell(page, 9, 'Active').click();
  await expect(cell(page, 9, 'Active')).toBeEnabled();
  await expect(cell(page, 9, 'Active')).not.toBeChecked();
  await expect(cell(page, 9, 'Default')).not.toBeChecked();
  await expect(cell(page, 9, 'Default')).toBeDisabled();
  await expect(scope(page).locator('tr[data-row-key="9"] button[value="preview"]')).toBeEnabled();
  await expect(scope(page).locator('tr[data-row-key="9"] time')).toHaveText('2026.10.16 09:00:00');
});
test('Active edits reapply the current filter and remove the changed row from that result', async ({
  page,
}) => {
  await setup(page);
  await open(
    page,
    '/en/management/sites?filters=' +
      encodeURIComponent(
        JSON.stringify([{ field: 'owner_is_active', operator: 'equals', value: true }]),
      ),
  );
  await cell(page, 14, 'Active').click();
  await expect(scope(page).locator('tr[data-row-key="14"]')).toHaveCount(0);
  await expect(scope(page).locator('tbody tr')).toHaveCount(6);
});
test('a rejected write restores both switches and is never retried', async ({ page }) => {
  const api = await setup(page, { failure: 409 });
  await open(page);
  await cell(page, 13, 'Default').click();
  await expect(cell(page, 13, 'Default')).toBeEnabled();
  await expect(cell(page, 13, 'Default')).not.toBeChecked();
  await expect(cell(page, 9, 'Default')).toBeChecked();
  await expect(page.getByRole('status')).toContainText('active account');
  expect(api.writes).toHaveLength(1);
});
for (const failure of ['cache', 'network'] as const)
  test(`a ${failure} failure after commit refetches the actual state without replay`, async ({
    page,
  }) => {
    const api = await setup(
      page,
      failure === 'cache' ? { failure: 503, committed: true } : { lost: true },
    );
    await open(page);
    await cell(page, 13, 'Default').click();
    await expect(cell(page, 13, 'Default')).toBeEnabled();
    await expect(cell(page, 13, 'Default')).toBeChecked();
    await expect(cell(page, 9, 'Default')).not.toBeChecked();
    await expect(page.locator('[data-notification-kind="warning"]')).toBeVisible();
    expect(api.writes).toHaveLength(1);
  });
test('the switch supports keyboard Space and toggling Default off', async ({ page }) => {
  const api = await setup(page);
  await open(page);
  const selected = cell(page, 9, 'Default');
  await selected.focus();
  await page.keyboard.press('Space');
  await expect(selected).toBeEnabled();
  await expect(selected).not.toBeChecked();
  await expect(selected).toBeFocused();
  expect(api.writes[0].body.changes).toEqual({ is_default: false });
});
for (const actorId of [91, 14])
  test(`expired or self-disabled actor ${actorId} drops private content`, async ({ page }) => {
    const api = await setup(page, actorId === 91 ? { failure: 401 } : { actorId: 14 });
    await open(page);
    await cell(page, 14, 'Active').click();
    await expect(page).toHaveURL(/\/access-denied$/);
    await expect(scope(page)).toHaveCount(0);
    expect(api.writes).toHaveLength(1);
  });
test('the full Edit dialog remains separate from immediately saved table switches', async ({
  page,
}) => {
  const api = await setup(page);
  await open(page);
  await scope(page).locator('tbody tr').first().locator('button[value="edit"]').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(
    page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }),
  ).toBeDisabled();
  expect(api.writes).toHaveLength(0);
});

for (const locale of ['zh-Hant', 'zh-Hans'])
  test(`${locale} quick switches preserve the management locale`, async ({ page }) => {
    const api = await setup(page);
    await page.goto(`/${locale}/management/sites`);
    await expect(scope(page).locator('tbody tr')).toHaveCount(6);
    await cell(page, 13, 'Default').click();
    await expect(cell(page, 13, 'Default')).toBeEnabled();
    await expect(cell(page, 13, 'Default')).toBeChecked();
    expect(new URL(api.writes[0].url).searchParams.get('locale')).toBe(locale);
    await expect(page.getByRole('status')).toContainText(
      locale === 'zh-Hant' ? '已儲存' : '已保存',
    );
  });
