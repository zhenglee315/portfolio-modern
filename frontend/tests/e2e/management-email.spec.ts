import { expect, test } from '@playwright/test';
import { managementEndpointFixture } from '../fixtures/management';

for (const width of [390, 768, 1440]) {
  test(`users use full email without Account in columns and details at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/api/authority/session', (route) =>
      route.fulfill({
        json: {
          id: 91,
          user: 'operator',
          email: 'operator@example.com',
          role: 'administrator',
          is_create: true,
          is_read: true,
          is_update: true,
          is_delete: true,
          is_manage_roles: true,
          is_manage_users: true,
          is_monitor: true,
          is_manage_sites: true,
        },
      }),
    );
    const email = `${'e'.repeat(242)}@example.com`;
    const requests: string[] = [];
    await page.route('**/api/management/users?**', (route) => {
      requests.push(route.request().method());
      const response = managementEndpointFixture(new URL(route.request().url()))!;
      response.items[0]!.email = email;
      return route.fulfill({ json: response });
    });
    await page.goto('/en/management/users');
    const owner = page.locator('[data-management-resource="users"]');
    await expect(owner.locator('tbody > tr')).toHaveCount(6);
    await expect(owner.locator('thead [data-column-title]')).toHaveText([
      'ID',
      'Email',
      'Role',
      'Login',
      'LastLogin',
      'Updated',
      'Active',
      'Actions',
    ]);
    const first = owner.locator('tbody > tr').first();
    const cell = first.locator('td').nth(2);
    await expect(cell).toHaveText(email);
    await expect(cell.locator('span[title]')).toHaveCount(0);
    expect(await cell.evaluate((node) => getComputedStyle(node).textOverflow)).not.toBe('ellipsis');
    expect(await cell.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(
      1,
    );
    const role = first.locator('td').nth(3).locator('span[title]');
    await expect(role).toHaveCount(1);
    expect(await role.evaluate((node) => getComputedStyle(node).textOverflow)).toBe('ellipsis');
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
    ).toBeLessThanOrEqual(1);
    await owner.getByRole('button', { name: 'Columns', exact: true }).click();
    await expect(owner.getByRole('checkbox', { name: 'Account', exact: true })).toHaveCount(0);
    await owner.getByRole('button', { name: 'Columns', exact: true }).click();
    await first.getByRole('button', { name: `Edit ${email}`, exact: true }).click();
    const details = page.getByRole('dialog');
    await expect(details.locator('dt')).toHaveCount(12);
    await expect(details.locator('dt').filter({ hasText: /^Account$/ })).toHaveCount(0);
    await expect(details.locator('.modal-title')).toHaveText('Details');
    await expect(
      details
        .locator('dl > div')
        .filter({ has: page.locator('dt', { hasText: /^Email$/ }) })
        .locator('dd'),
    ).toHaveText(email);
    await expect(details.getByRole('textbox', { name: 'Email', exact: true })).toHaveCount(0);
    await expect(
      details.locator('.modal-footer').getByRole('button', { name: 'Save', exact: true }),
    ).toBeDisabled();
    await details
      .locator('.modal-footer')
      .getByRole('button', { name: 'Close', exact: true })
      .click();
    await first.getByRole('button', { name: `Delete ${email}`, exact: true }).click();
    const deletion = page.getByRole('dialog', {
      name: 'Are you sure you want to delete?',
      exact: true,
    });
    await expect(deletion).toHaveAccessibleDescription(
      `Permanently delete ${email}, their website in every language and all login history? This cannot be undone.`,
    );
    await deletion.getByRole('button', { name: 'Cancel', exact: true }).click();
    expect(requests).toEqual(['GET']);
    expect(errors).toEqual([]);
    await owner.screenshot({ path: test.info().outputPath(`users-full-email-${width}.png`) });
  });
}
