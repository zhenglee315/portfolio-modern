import { dehydrate } from '@tanstack/react-query';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { createQueryClient } from '@/app/query-client';
import { fullName } from '@/features/site';
import {
  managementFilterSpecs,
  type ManagementListState,
  type ManagementResource,
  type ManagementRow,
} from '@/features/management';
import { managementListQuery } from '@/features/management/api/management';

const target = process.env.PORTFOLIO_API_SMOKE_TARGET;
const email = process.env.PORTFOLIO_SMOKE_EMAIL;
const password = process.env.PORTFOLIO_SMOKE_PASSWORD;
const liveEnabled = Boolean(target && email && password);
const originalFetch = globalThis.fetch;
let sessionCookie = '';

beforeAll(async () => {
  if (!liveEnabled) return;
  const response = await originalFetch(`${target}/authority/sign-in`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  expect(response.status).toBe(200);
  sessionCookie =
    response.headers
      .getSetCookie()
      .find((cookie) => cookie.startsWith('session_id='))
      ?.split(';')[0] ?? '';
  expect(sessionCookie).not.toBe('');
  // Node fetch has no browser cookie jar; bind this test's authenticated cookie to its target only.
  vi.stubGlobal('fetch', ((input, init) => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
    );
    if (url.origin !== new URL(target!).origin || !url.pathname.startsWith('/management/'))
      return originalFetch(input, init);
    const headers = new Headers(init?.headers);
    headers.set('Cookie', sessionCookie);
    return originalFetch(input, { ...init, headers });
  }) satisfies typeof fetch);
});

afterAll(async () => {
  vi.unstubAllGlobals();
  if (sessionCookie)
    await originalFetch(`${target}/authority/sign-out`, {
      method: 'POST',
      headers: { Cookie: sessionCookie },
    });
});
const initial: ManagementListState = { page: 1, size: 6, sort: [], filters: [] };
const activeField = { roles: 'is_active', users: 'is_active', sites: 'owner_is_active' };

/** Check priority sorting using scalar booleans and IDs, independent of database collation. */
function expectPriority(rows: ManagementRow[], field: string) {
  const values = rows as Record<string, string | number | boolean | null>[];
  for (let index = 1; index < values.length; index++) {
    const before = values[index - 1]!;
    const after = values[index]!;
    expect(Number(before[field])).toBeLessThanOrEqual(Number(after[field]));
    if (before[field] === after[field]) expect(before.id).toBeLessThan(after.id as number);
  }
}

/** Opt in to actual database reads through production query options; never write or seed data. */
it.skipIf(!liveEnabled).each(['roles', 'users', 'sites'] as const)(
  'live management %s validates lazy pages, search, filters and ordered sorting',
  async (resource) => {
    const client = createQueryClient();
    const read = (patch: Partial<ManagementListState> = {}) =>
      client.fetchQuery(
        managementListQuery(resource, { ...initial, ...patch }, 'en', undefined, {
          baseUrl: target,
        }),
      );
    try {
      const first = await read();
      expect(first.page).toBe(1);
      expect(first.size).toBe(6);
      expect(first.items.length).toBe(Math.min(6, first.total));
      const ids = first.items.map((row) => row.id);
      expect(ids).toEqual(
        [...first.items]
          .sort((a, b) => Date.parse(b.updatetime) - Date.parse(a.updatetime) || a.id - b.id)
          .map((row) => row.id),
      );
      // A requested page creates one resource cache entry, not an eager read of other pages.
      expect(client.getQueryCache().getAll()).toHaveLength(1);
      expect(dehydrate(client).queries).toHaveLength(0);

      const single = await read({ size: 1 });
      expect(single.total).toBe(first.total);
      expect(single.items.map((row) => row.id)).toEqual(ids.slice(0, 1));
      if (single.pages > 1) {
        const next = await read({ page: 2, size: 1 });
        expect(next.page).toBe(2);
        expect(next.items).toHaveLength(1);
        expect(Date.parse(next.items[0]!.updatetime)).toBeLessThanOrEqual(
          Date.parse(single.items[0]!.updatetime),
        );
        if (next.items[0]!.updatetime === single.items[0]!.updatetime)
          expect(next.items[0]!.id).toBeGreaterThan(single.items[0]!.id);
      }
      const beyond = await read({ page: first.pages + 1 });
      expect(beyond.page).toBe(first.pages + 1);
      expect(beyond.items).toHaveLength(0);
      expect(beyond.total).toBe(first.total);

      const missing = await read({
        filters: [
          {
            field: resource === 'roles' ? 'role' : resource === 'users' ? 'email' : 'user',
            operator: 'contains',
            value: `management_missing_${crypto.randomUUID().replaceAll('-', '')}`,
          },
        ],
      });
      expect(missing.items).toHaveLength(0);
      expect(missing.total).toBe(0);
      expect(missing.pages).toBe(0);

      const representative = first.items[0];
      if (representative) {
        if (resource === 'roles' && 'role' in representative) {
          const selected = await read({
            filters: [{ field: 'role', operator: 'in', value: [representative.role] }],
          });
          expect(selected.items.some((row) => row.id === representative.id)).toBe(true);
          const excluded = await read({
            filters: [{ field: 'role', operator: 'not_in', value: [representative.role] }],
          });
          expect(excluded.total).toBe(first.total - selected.total);
          const none = await read({ filters: [{ field: 'role', operator: 'in', value: [] }] });
          expect(none).toMatchObject({ items: [], total: 0, pages: 0 });
        }
        const exactId = await read({
          filters: [
            { field: 'id', operator: 'between', value: [representative.id, representative.id] },
          ],
        });
        expect(exactId.items.map((row) => row.id)).toEqual([representative.id]);
        const updated = (representative as Record<string, unknown>).updatetime;
        if (typeof updated === 'string') {
          const dated = await read({
            filters: [{ field: 'updatetime', operator: 'equals', value: updated }],
          });
          expect(dated.items.some((row) => row.id === representative.id)).toBe(true);
          const day = updated.slice(0, 10);
          const calendar = await read({
            filters: [{ field: 'updatetime', operator: 'equals', value: day }],
          });
          expect(calendar.items.some((row) => row.id === representative.id)).toBe(true);
          expect(calendar.items.every((row) => row.updatetime.startsWith(day))).toBe(true);
        }
        if ('has_translation' in representative && representative.has_translation) {
          const profile =
            fullName({
              firstName: representative.first_name?.trim() ?? '',
              familyName: representative.family_name?.trim() ?? '',
            }) || representative.nick_name?.trim();
          if (profile) {
            const named = await read({
              filters: [{ field: 'profile_name', operator: 'equals', value: profile }],
            });
            expect(named.items.some((row) => row.id === representative.id)).toBe(true);
          }
          const localized = await read({
            filters: [{ field: 'locale', operator: 'equals', value: 'en' }],
          });
          expect(localized.total).toBe(first.total);
        }
        const name =
          'role' in representative && resource === 'roles'
            ? representative.role
            : resource === 'users' && 'email' in representative
              ? representative.email
              : 'user' in representative
                ? representative.user
                : '';
        const searched = await read({
          filters: [
            {
              field: resource === 'roles' ? 'role' : resource === 'users' ? 'email' : 'user',
              operator: 'contains',
              value: name.split(/\s+/u)[0]!.toUpperCase(),
            },
          ],
        });
        expect(searched.total).toBeGreaterThan(0);
      }

      for (const field of Object.keys(managementFilterSpecs[resource]).filter(
        (field) => managementFilterSpecs[resource][field]?.type === 'boolean',
      )) {
        for (const value of [false, true]) {
          const filtered = await read({ filters: [{ field, operator: 'equals', value }] });
          expect(
            filtered.items.every((row) => (row as Record<string, unknown>)[field] === value),
          ).toBe(true);
        }
      }
      const sorted = await read({
        sort: [
          { field: activeField[resource], direction: 'asc' },
          { field: 'id', direction: 'asc' },
        ],
      });
      expectPriority(sorted.items, activeField[resource]);
      for (const row of first.items) {
        if ('site_id' in row) expect(row.has_site).toBe(row.site_id !== null);
        if ('login_count' in row) expect(row.login_count).toBeGreaterThanOrEqual(0);
        if ('user_count' in row) expect(row.user_count).toBeGreaterThanOrEqual(0);
        if ('has_translation' in row && !row.has_site) {
          expect(row.has_translation).toBe(false);
          expect(row.is_published).toBeNull();
          expect(row.is_default).toBeNull();
        }
      }
    } finally {
      client.clear();
    }
  },
  30_000,
);

/** Language selection changes site content while retaining one row per account. */
it.skipIf(!liveEnabled)(
  'live management locales retain person identity without fallback rows',
  async () => {
    const client = createQueryClient();
    try {
      let expected: { ids: number[]; total: number } | undefined;
      for (const locale of ['en', 'zh-Hans', 'zh-Hant'] as const) {
        const result = await client.fetchQuery(
          managementListQuery('sites' satisfies ManagementResource, initial, locale, undefined, {
            baseUrl: target,
          }),
        );
        const identity = { ids: result.items.map((row) => row.id), total: result.total };
        if (expected) expect(identity).toEqual(expected);
        else expected = identity;
        expect(result.items.every((row) => row.locale === locale)).toBe(true);
        for (const row of result.items) {
          if (!row.has_translation) {
            expect(row.brand_title).toBeNull();
            expect(row.profile_content).toBeNull();
            expect(row.chat_content).toBeNull();
          }
        }
      }
    } finally {
      client.clear();
    }
  },
  30_000,
);
