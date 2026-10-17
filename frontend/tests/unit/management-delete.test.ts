import { afterEach, expect, it, vi } from 'vitest';
import { deleteManagementRecords } from '@/features/management';
import {
  managementRoleSchema,
  managementUserSchema,
  managementSiteSchema,
} from '@/features/management/schemas/management';
import {
  managementRoleFixtures,
  managementUserFixtures,
  managementSiteFixtures,
} from '../unit-fixtures/management';
const role = managementRoleSchema.parse(managementRoleFixtures.at(-1));
const user = managementUserSchema.parse(managementUserFixtures.at(-1));
const site = managementSiteSchema.parse(managementSiteFixtures().find((row) => row.has_site));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it.each(['roles', 'users', 'sites'] as const)(
  'uses a single confirmed DELETE for %s',
  async (resource) => {
    const row = resource === 'roles' ? role : resource === 'users' ? user : site;
    const receipt =
      resource === 'roles'
        ? { role_id: row.id }
        : { account_id: row.id, site_id: 'site_id' in row ? row.site_id : null };
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ deleted_count: 1, deleted: [receipt] })));
    vi.stubGlobal('fetch', fetch);
    await deleteManagementRecords(resource, [row]);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe(`/api/management/${resource}/${row.id}`);
    expect(options.method).toBe('DELETE');
    const body = JSON.parse(options.body);
    expect(body).toEqual(
      resource === 'roles'
        ? { expected_role: role.role }
        : resource === 'users'
          ? { expected_email: user.email, expected_site_id: user.site_id }
          : { expected_owner_email: site.owner_email, expected_site_id: site.site_id },
    );
  },
);
it.each(['roles', 'users'] as const)('sends one atomic batch for %s', async (resource) => {
  const original = resource === 'roles' ? role : user,
    rows = [original, { ...original, id: original.id + 100 }];
  const deleted = rows.map((row) =>
    resource === 'roles' ? { role_id: row.id } : { account_id: row.id, site_id: user.site_id },
  );
  const fetch = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify({ deleted_count: 2, deleted })));
  vi.stubGlobal('fetch', fetch);
  await deleteManagementRecords(resource, rows);
  expect(fetch).toHaveBeenCalledTimes(1);
  const [url, options] = fetch.mock.calls[0];
  expect(url).toBe(`/api/management/${resource}/bulk-delete`);
  expect(options.method).toBe('POST');
  expect(JSON.parse(options.body).targets).toHaveLength(2);
});
it('explicitly confirms no website when deleting an account without one', async () => {
  const row = { ...user, site_id: null, has_site: false };
  const fetch = vi
    .fn()
    .mockResolvedValue(
      new Response(
        JSON.stringify({ deleted_count: 1, deleted: [{ account_id: row.id, site_id: null }] }),
      ),
    );
  vi.stubGlobal('fetch', fetch);
  await deleteManagementRecords('users', [row]);
  expect(JSON.parse(fetch.mock.calls[0][1].body).expected_site_id).toBeNull();
});
it.each(['roles', 'users'] as const)(
  'rejects duplicated, empty or wrong-resource rows for %s before transport',
  async (resource) => {
    const row = resource === 'roles' ? role : user,
      wrong = resource === 'roles' ? user : role;
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    for (const rows of [[], [row, row], [wrong]])
      await expect(deleteManagementRecords(resource, rows)).rejects.toMatchObject({
        kind: 'contract',
      });
    expect(fetch).not.toHaveBeenCalled();
  },
);
it.each(['roles', 'users'] as const)(
  'rejects mismatched receipts for %s without retrying',
  async (resource) => {
    const row = resource === 'roles' ? role : user;
    const deleted =
      resource === 'roles' ? [{ role_id: 99999 }] : [{ account_id: row.id, site_id: 99999 }];
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ deleted_count: 1, deleted })));
    vi.stubGlobal('fetch', fetch);
    await expect(deleteManagementRecords(resource, [row])).rejects.toMatchObject({
      kind: 'contract',
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  },
);
