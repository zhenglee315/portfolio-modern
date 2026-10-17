import { afterEach, expect, it, vi } from 'vitest';
import { createQueryClient } from '@/app/query-client';
import { managementListQuery, managementListParams } from '@/features/management/api/management';
import { managementLoginRecordsSchema } from '@/features/management/schemas/management';

const state = { page: 1, size: 6, sort: [], filters: [] };
const row = {
  id: 7,
  user_id: 12,
  email: 'person@example.com',
  logintime: '2026-10-15T12:00:00Z',
  ip_address: null,
  country_code: null,
  region: null,
  city: null,
  geo_status: 'unknown',
  is_online: false,
};
const response = { items: [row], total: 1, pages: 1, page: 1, size: 6 };
afterEach(() => vi.unstubAllGlobals());

it('preserves legacy nulls and validates status/country/time contracts', () => {
  expect(managementLoginRecordsSchema.parse(response)).toEqual(response);
  for (const patch of [
    { geo_status: 'invalid' },
    { country_code: 'uk' },
    { country_code: 'GBR' },
    { logintime: '2026-10-15T12:00:00' },
    { ip_address: 'x'.repeat(46) },
  ])
    expect(
      managementLoginRecordsSchema.safeParse({ ...response, items: [{ ...row, ...patch }] })
        .success,
    ).toBe(false);
});

it('uses backend event ordering and accepts explicit history controls', () => {
  expect(managementListParams('login-records', state, 'en').has('sort')).toBe(false);
  const params = managementListParams(
    'login-records',
    {
      ...state,
      sort: [{ field: 'logintime', direction: 'asc' }],
      search: { term: 'London', fields: ['city', 'region'] },
    },
    'en',
  );
  expect(params.get('sort')).toBe('logintime:asc');
  expect(params.get('search')).toBe('London');
});

it('isolates private history by actor, account, locale and query', async () => {
  const first = managementListQuery('login-records', state, 'en', 91, { userId: 12 });
  expect(first.meta).toEqual({ private: true });
  for (const next of [
    managementListQuery('login-records', state, 'en', 92, { userId: 12 }),
    managementListQuery('login-records', state, 'en', 91, { userId: 13 }),
    managementListQuery('login-records', state, 'zh-Hant', 91, { userId: 12 }),
    managementListQuery('login-records', { ...state, page: 2 }, 'en', 91, { userId: 12 }),
  ])
    expect(next.queryKey).not.toEqual(first.queryKey);
  const fetch = vi.fn(async () => new Response(JSON.stringify(response), { status: 200 }));
  vi.stubGlobal('fetch', fetch);
  const client = createQueryClient();
  await expect(client.fetchQuery(first)).resolves.toEqual(response);
  const [url, options] = fetch.mock.calls[0]!;
  expect(String(url)).toContain('management/login-records?');
  expect(new URL(String(url), 'https://example.test').searchParams.get('user_id')).toBe('12');
  expect(options.credentials).toBe('include');
  client.clear();
});

it.each([0, -1, 2147483648, 1.5, NaN])('rejects invalid account selector %s', (userId) => {
  expect(() => managementListQuery('login-records', state, 'en', 91, { userId })).toThrow();
});

it('rejects selectors on other resources and mismatched returned pagination', async () => {
  expect(() => managementListQuery('users', state, 'en', 91, { userId: 12 })).toThrow();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ ...response, size: 10 }))),
  );
  const client = createQueryClient();
  const options = managementListQuery('login-records', state, 'en', 91, { userId: 12 });
  await expect(client.fetchQuery({ ...options, retry: false })).rejects.toThrow();
  client.clear();
});
