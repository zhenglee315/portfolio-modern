import { dehydrate } from '@tanstack/react-query';
import { expect, it } from 'vitest';
import { createQueryClient } from '@/app/query-client';
import {
  managementFilterFields,
  managementListQuery,
  type ManagementListState,
  type ManagementResource,
  type ManagementRow,
} from '@/features/management';

const target = process.env.PORTFOLIO_API_SMOKE_TARGET;
const initial: ManagementListState = { page: 1, size: 6, search: '', sort: [], filters: {} };
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
it.skipIf(!target).each(['roles', 'users', 'sites'] as const)(
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
      expect(ids).toEqual([...ids].sort((a, b) => b - a));
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
        expect(next.items[0]!.id).toBeLessThan(single.items[0]!.id);
      }
      const beyond = await read({ page: first.pages + 1 });
      expect(beyond.page).toBe(first.pages + 1);
      expect(beyond.items).toHaveLength(0);
      expect(beyond.total).toBe(first.total);

      const missing = await read({
        search: `management_missing_${crypto.randomUUID().replaceAll('-', '')}`,
      });
      expect(missing.items).toHaveLength(0);
      expect(missing.total).toBe(0);
      expect(missing.pages).toBe(0);

      const representative = first.items[0];
      if (representative) {
        const name =
          'role' in representative && resource === 'roles'
            ? representative.role
            : 'user' in representative
              ? representative.user
              : '';
        const searched = await read({ search: name.split(/\s+/u)[0]!.toUpperCase() });
        expect(searched.total).toBeGreaterThan(0);
      }

      for (const field of managementFilterFields[resource].filter((item) => item !== 'role_id')) {
        for (const value of [false, true]) {
          const filtered = await read({ filters: { [field]: String(value) } });
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
it.skipIf(!target)(
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
