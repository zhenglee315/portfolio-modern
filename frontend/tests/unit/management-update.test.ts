import { afterEach, expect, it, vi } from 'vitest';
import { updateManagementRecord } from '@/features/management';
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
const site = managementSiteSchema.parse(
  managementSiteFixtures().find((r) => r.has_translation && r.has_site),
);
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it.each([
  ['roles', role, { role: 'renamed', description: null, is_read: false }],
  ['users', user, { is_active: false }],
  [
    'sites',
    site,
    { first_name: 'Changed', profile_content: 'First\nSecond', email: 'contact@example.com' },
  ],
] as const)(
  'saves %s through one strict identity-confirmed PATCH with original values',
  async (resource, row, changes) => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...row, ...changes })));
    vi.stubGlobal('fetch', fetch);
    await updateManagementRecord(resource, row, changes, 'en');
    const [url, options] = fetch.mock.calls[0];
    expect(url).toContain(`/management/${resource}/${row.id}`);
    expect(options).toMatchObject({ method: 'PATCH', credentials: 'include', cache: 'no-store' });
    const body = JSON.parse(options.body);
    expect(body.changes).toEqual(changes);
    expect(body.expected).toEqual(
      Object.fromEntries(
        Object.keys(changes).map((field) => [field, row[field as keyof typeof row]]),
      ),
    );
    expect(
      body[
        resource === 'roles'
          ? 'expected_role'
          : resource === 'users'
            ? 'expected_email'
            : 'expected_owner_email'
      ],
    ).toBe(resource === 'roles' ? role.role : resource === 'users' ? user.email : site.owner_email);
    expect(fetch).toHaveBeenCalledTimes(1);
  },
);
it.each([
  {},
  { is_active: 'false' },
  { is_active: 0 },
  { is_active: null },
  { email: 'new@example.com' },
  { role_id: 0 },
  { role: 'admin' },
  { site_id: 1 },
  { password: 'secret' },
  { is_active: undefined },
])('rejects invalid or readonly user assignments before transport: %o', async (changes) => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  await expect(updateManagementRecord('users', user, changes, 'en')).rejects.toMatchObject({
    kind: 'contract',
  });
  expect(fetch).not.toHaveBeenCalled();
});
it.each([
  { id: 3 },
  { role: ' bad ' },
  { role: '' },
  { role: 'bad\0name' },
  { is_default: 1 },
  { description: 'a'.repeat(10001) },
])('validates role schema: %o', async (changes) => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  await expect(updateManagementRecord('roles', role, changes, 'en')).rejects.toMatchObject({
    kind: 'contract',
  });
  expect(fetch).not.toHaveBeenCalled();
});
it.each([
  { github: 'javascript:alert(1)' },
  { github: 'https://u:p@example.com' },
  { email: 'bad' },
  { copyright_year: 1899 },
  { first_name: null },
  { owner_email: 'new@example.com' },
  { site_id: 2 },
])('validates site write contracts: %o', async (changes) => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  await expect(updateManagementRecord('sites', site, changes, 'en')).rejects.toMatchObject({
    kind: 'contract',
  });
  expect(fetch).not.toHaveBeenCalled();
});
it('rejects mismatched success identities/values and never retries uncertain writes', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValue(
      new Response(JSON.stringify({ ...user, id: user.id + 1, is_active: false })),
    );
  vi.stubGlobal('fetch', fetch);
  await expect(
    updateManagementRecord('users', user, { is_active: false }, 'en'),
  ).rejects.toMatchObject({ kind: 'contract' });
  expect(fetch).toHaveBeenCalledTimes(1);
  fetch.mockRejectedValueOnce(Error('lost response'));
  await expect(
    updateManagementRecord('users', user, { is_active: false }, 'en'),
  ).rejects.toMatchObject({ kind: 'network' });
  expect(fetch).toHaveBeenCalledTimes(2);
});
it('preserves committed error metadata instead of replaying the write', async () => {
  const fetch = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ detail: 'MANAGEMENT_UPDATE_COMMITTED_CACHE_UNAVAILABLE' }), {
      status: 503,
    }),
  );
  vi.stubGlobal('fetch', fetch);
  await expect(
    updateManagementRecord('users', user, { is_active: false }, 'en'),
  ).rejects.toMatchObject({ code: 'MANAGEMENT_UPDATE_COMMITTED_CACHE_UNAVAILABLE', status: 503 });
  expect(fetch).toHaveBeenCalledTimes(1);
});
