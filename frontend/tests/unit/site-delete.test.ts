import { afterEach, expect, it, vi } from 'vitest';
import { deleteManagementSites } from '@/features/management/api/site-delete';
import { managementSiteSchema } from '@/features/management/schemas/management';
import { managementSiteFixtures } from '../unit-fixtures/management';
const one = managementSiteSchema.parse(managementSiteFixtures().find((row) => row.has_site));
const two = {
  ...one,
  id: one.id + 100,
  site_id: one.site_id! + 100,
  owner_email: 'another@example.com',
};
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it.each([{ rows: [one] }, { rows: [one, two] }])(
  'sends one confirmed transaction for $rows.length targets',
  async ({ rows }) => {
    const result = {
      deleted_count: rows.length,
      deleted: rows.map((row) => ({ account_id: row.id, site_id: row.site_id })),
    };
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(result)));
    vi.stubGlobal('fetch', fetch);
    await deleteManagementSites(rows);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, options] = fetch.mock.calls[0];
    expect(options).toMatchObject({
      credentials: 'include',
      cache: 'no-store',
      method: rows.length === 1 ? 'DELETE' : 'POST',
    });
    expect(url).toBe(
      rows.length === 1 ? `/api/management/sites/${one.id}` : '/api/management/sites/bulk-delete',
    );
    const json = JSON.parse(options.body);
    expect(rows.length === 1 ? json : json.targets[0]).toMatchObject({
      expected_owner_email: one.owner_email,
      expected_site_id: one.site_id,
    });
    expect(options.body).not.toContain('locale');
  },
);
it.each(
  [[], [one, one], Array(101).fill(one), [{ ...one, site_id: null, has_site: false }]].map(
    (rows) => ({ rows }),
  ),
)('rejects invalid batches before transport', async ({ rows }) => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  await expect(deleteManagementSites(rows)).rejects.toMatchObject({ kind: 'contract' });
  expect(fetch).not.toHaveBeenCalled();
});
it.each([
  { deleted_count: 2, deleted: [{ account_id: one.id, site_id: one.site_id }] },
  { deleted_count: 1, deleted: [{ account_id: one.id, site_id: 999999 }] },
])('rejects mismatched deletion receipts', async (result) => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(result)));
  vi.stubGlobal('fetch', fetch);
  await expect(deleteManagementSites([one])).rejects.toMatchObject({ kind: 'contract' });
  expect(fetch).toHaveBeenCalledTimes(1);
});
it('never replays committed-cache errors or lost responses', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: 'MANAGEMENT_DELETE_COMMITTED_CACHE_UNAVAILABLE' }), {
        status: 503,
      }),
    )
    .mockRejectedValueOnce(Error('lost'));
  vi.stubGlobal('fetch', fetch);
  await expect(deleteManagementSites([one])).rejects.toMatchObject({
    code: 'MANAGEMENT_DELETE_COMMITTED_CACHE_UNAVAILABLE',
  });
  expect(fetch).toHaveBeenCalledTimes(1);
  await expect(deleteManagementSites([one])).rejects.toMatchObject({ kind: 'network' });
  expect(fetch).toHaveBeenCalledTimes(2);
});
