import { dehydrate, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type PropsWithChildren } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createQueryClient } from '@/app/query-client';
import {
  managementListParams,
  managementListQuery,
  managementRolesSchema,
  managementUsersSchema,
  managementSitesSchema,
  managementSortFields,
  useManagementList,
  type ManagementListState,
  type RoleRow,
  type SiteRow,
  type UserRow,
} from '@/features/management';
import { ApiError } from '@/shared/api/http';
import { numberedPageSchema, recordIdSchema } from '@/shared/schemas/records';
import { z } from 'zod';

const timestamp = '2026-10-12T09:00:00Z';
const role: RoleRow = {
  id: 4,
  role: 'editor',
  description: null,
  is_create: true,
  is_read: true,
  is_update: true,
  is_delete: false,
  is_manage_sites: false,
  is_manage_users: false,
  is_manage_roles: false,
  is_default: false,
  is_active: true,
  createtime: timestamp,
  updatetime: timestamp,
  user_count: 3,
};
const user: UserRow = {
  id: 12,
  user: 'person',
  email: 'person@example.test',
  role_id: 4,
  role: 'editor',
  is_active: false,
  role_is_active: true,
  site_id: null,
  has_site: false,
  login_count: 0,
  last_login: null,
  createtime: timestamp,
  updatetime: timestamp,
};
const site: SiteRow = {
  id: 12,
  user: 'person',
  owner_is_active: false,
  site_id: null,
  has_site: false,
  is_published: null,
  is_default: null,
  copyright_year: null,
  linkedin: null,
  github: null,
  medium: null,
  email: null,
  chat_icon: null,
  locale: 'zh-Hant',
  has_translation: false,
  brand_title: null,
  brand_title_sub: null,
  first_name: null,
  family_name: null,
  nick_name: null,
  profile_content: null,
  edu_code: null,
  program: null,
  intro_content: null,
  footer_content: null,
  chat_title: null,
  chat_title_sub: null,
  chat_content: null,
  updatetime: timestamp,
};
const initial: ManagementListState = { page: 1, size: 6, search: '', sort: [], filters: {} };

/** Build backend-shaped pages; refinements remain owned by production schemas. */
function page<T>(items: T[], current = 1, size = 6, total = items.length) {
  return { items, total, pages: Math.ceil(total / size), page: current, size };
}

afterEach(() => vi.unstubAllGlobals());

describe('management response contracts', () => {
  it('validates every resource and preserves absent websites and translations as null', () => {
    expect(managementRolesSchema.parse(page([role]))).toEqual(page([role]));
    expect(managementUsersSchema.parse(page([user]))).toEqual(page([user]));
    const row = managementSitesSchema.parse(page([site])).items[0];
    expect(row).toEqual(site);
    expect(row?.is_published).toBeNull();
    expect(row?.is_default).toBeNull();
    expect(row?.owner_is_active).toBe(false);
    expect(row?.updatetime).toBe(timestamp);
  });

  it('requires genuine UTC account update times for person-based platform rows', () => {
    expect(managementSitesSchema.safeParse(page([{ ...site, updatetime: null }])).success).toBe(
      false,
    );
    expect(
      managementSitesSchema.safeParse(page([{ ...site, updatetime: undefined }])).success,
    ).toBe(false);
    expect(
      managementSitesSchema.safeParse(page([{ ...site, updatetime: '2026-10-12T10:00:00+01:00' }]))
        .success,
    ).toBe(false);
    expect(
      managementListParams(
        'sites',
        { ...initial, sort: [{ field: 'updatetime', direction: 'desc' }] },
        'en',
      ).get('sort'),
    ).toBe('updatetime:desc');
  });

  it.each([1, 6, 20, 100])('supports adjustable size %s without changing public pages', (size) => {
    expect(managementRolesSchema.parse(page([role], 1, size)).size).toBe(size);
    const publicSchema = numberedPageSchema(z.object({ id: recordIdSchema }));
    expect(publicSchema.safeParse(page([{ id: 1 }], 1, size)).success).toBe(size === 6);
  });

  it('accepts empty and requested out-of-range pages with exact metadata', () => {
    expect(managementRolesSchema.parse(page([], 1)).pages).toBe(0);
    expect(managementUsersSchema.parse(page([], 9, 6, 2)).page).toBe(9);
  });

  it.each([
    { ...page([role]), items: null },
    { ...page([role]), pages: 2 },
    { ...page([role]), total: 7 },
    { ...page([role]), page: 0 },
    { ...page([role]), size: 0 },
    { ...page([role]), size: 101 },
    page([role, role]),
    page([{ ...role, id: 0 }]),
    page([{ ...role, user_count: -1 }]),
    page([{ ...role, is_active: 'true' }]),
    page([{ ...role, createtime: '2026-10-12T10:00:00+01:00' }]),
    page([{ ...role, updatetime: null }]),
  ])('rejects inconsistent metadata, repeated identities and malformed fields', (value) => {
    expect(managementRolesSchema.safeParse(value).success).toBe(false);
  });

  it('rejects invalid nullable IDs, missing fields and unsupported management languages', () => {
    expect(managementUsersSchema.safeParse(page([{ ...user, site_id: 0 }])).success).toBe(false);
    expect(managementSitesSchema.safeParse(page([{ ...site, site_id: -1 }])).success).toBe(false);
    expect(managementSitesSchema.safeParse(page([{ ...site, locale: 'fr' }])).success).toBe(false);
    expect(
      managementSitesSchema.safeParse(page([{ ...site, is_published: undefined }])).success,
    ).toBe(false);
  });
});

describe('management request controls', () => {
  it('keeps ordered multi-column sorting, literal search and explicit false filters', () => {
    const params = managementListParams(
      'sites',
      {
        ...initial,
        page: 3,
        size: 20,
        search: '  人物 _rate%  ',
        sort: [
          { field: 'has_site', direction: 'desc' },
          { field: 'brand_title', direction: 'asc' },
          { field: 'id', direction: 'desc' },
        ],
        filters: { has_site: 'false', owner_is_active: '', has_translation: 'TRUE' },
      },
      'zh-Hant',
    );
    expect(Object.fromEntries(params)).toEqual({
      page: '3',
      size: '20',
      search: '人物 _rate%',
      sort: 'has_site:desc,brand_title:asc,id:desc',
      locale: 'zh-Hant',
      has_site: 'false',
      has_translation: 'true',
    });
  });

  it('only sends locale for platform and normalizes optional role identifiers', () => {
    expect(Object.fromEntries(managementListParams('roles', initial, 'en'))).toEqual({
      page: '1',
      size: '6',
      sort: 'id:desc',
    });
    expect(
      managementListParams('users', { ...initial, filters: { role_id: '004' } }, 'zh-Hans').get(
        'role_id',
      ),
    ).toBe('4');
    expect(managementSortFields.sites).not.toContain('locale');
  });

  it.each([
    { page: 0 },
    { page: Number.MAX_SAFE_INTEGER + 1 },
    { size: 0 },
    { size: 101 },
    { size: 2.5 },
    { search: 'x'.repeat(201) },
    { search: Array.from({ length: 11 }, () => 'x').join(' ') },
    { sort: [{ field: 'password', direction: 'asc' }] },
    { sort: [{ field: 'id', direction: 'ascending' }] },
    {
      sort: [
        { field: 'id', direction: 'asc' },
        { field: 'id', direction: 'desc' },
      ],
    },
    {
      sort: ['id', 'role', 'is_active', 'user_count'].map((field) => ({
        field,
        direction: 'asc',
      })),
    },
    { filters: { is_active: '1' } },
    { filters: { has_site: 'true' } },
  ])('rejects invalid controls before a request is issued', (patch) => {
    expect(() =>
      managementListParams('roles', { ...initial, ...patch } as ManagementListState, 'en'),
    ).toThrow(ApiError);
  });

  it.each(['0', '-1', '1.5', '2147483648', 'text'])('rejects invalid role ID %s', (roleId) => {
    expect(() =>
      managementListParams('users', { ...initial, filters: { role_id: roleId } }, 'en'),
    ).toThrow(ApiError);
  });

  it('counts Unicode search characters as the backend does', () => {
    expect(() =>
      managementListParams('roles', { ...initial, search: '🌍'.repeat(200) }, 'en'),
    ).not.toThrow();
  });
});

describe('lazy management reads', () => {
  it('allows an explicit read-only API target without changing private cache identity', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json(page([role])));
    vi.stubGlobal('fetch', fetch);
    const client = createQueryClient();
    try {
      const query = managementListQuery('roles', initial, 'en', undefined, {
        baseUrl: 'https://api.example.test/',
      });
      expect(query.queryKey).toEqual(managementListQuery('roles', initial, 'en').queryKey);
      expect((await client.fetchQuery(query)).items).toEqual([role]);
      const [rawUrl, options] = fetch.mock.calls[0]!;
      expect(new URL(rawUrl).origin).toBe('https://api.example.test');
      expect(new URL(rawUrl).pathname).toBe('/management/roles');
      expect(options).toMatchObject({ method: 'GET', credentials: 'include' });
      expect(dehydrate(client).queries).toHaveLength(0);
    } finally {
      client.clear();
    }
  });

  it('sends no request before readiness and then reads only the selected page', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json(page([role], 2, 1, 3)));
    vi.stubGlobal('fetch', fetch);
    const client = createQueryClient();
    const wrapper = ({ children }: PropsWithChildren) =>
      createElement(QueryClientProvider, { client }, children);
    const { result, rerender, unmount } = renderHook(
      ({ enabled }) =>
        useManagementList('roles', { ...initial, page: 2, size: 1 }, 'en', enabled, 12),
      { initialProps: { enabled: false }, wrapper },
    );
    expect(fetch).not.toHaveBeenCalled();
    rerender({ enabled: true });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetch).toHaveBeenCalledOnce();
    const url = new URL(fetch.mock.calls[0]![0], 'https://example.test');
    expect(url.searchParams.get('page')).toBe('2');
    expect(url.searchParams.get('size')).toBe('1');
    expect(result.current.data?.items).toEqual([role]);
    unmount();
    client.clear();
  });

  it.each([
    { resource: 'roles' as const, row: role, locale: 'en' as const },
    { resource: 'users' as const, row: user, locale: 'en' as const },
    { resource: 'sites' as const, row: site, locale: 'zh-Hant' as const },
  ])(
    'requests only $resource with session cookies and no extra HTTP cache policy',
    async (test) => {
      const fetch = vi.fn().mockResolvedValue(Response.json(page([test.row])));
      vi.stubGlobal('fetch', fetch);
      const client = createQueryClient();
      const result = await client.fetchQuery(
        managementListQuery(test.resource, initial, test.locale, 12),
      );
      expect(result.items).toEqual([test.row]);
      expect(fetch).toHaveBeenCalledOnce();
      const [rawUrl, options] = fetch.mock.calls[0]!;
      const url = new URL(rawUrl, 'https://example.test');
      expect(url.pathname).toBe(`/api/management/${test.resource}`);
      expect(url.searchParams.get('page')).toBe('1');
      expect(url.searchParams.get('size')).toBe('6');
      expect(options).toMatchObject({ method: 'GET', credentials: 'include' });
      expect(options.cache).toBeUndefined();
      expect(options.body).toBeUndefined();
      client.clear();
    },
  );

  it('isolates private cache by account, resource, language and canonical controls', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(page([role]))));
    const client = createQueryClient();
    const first = managementListQuery('roles', initial, 'en', 12);
    await client.fetchQuery(first);
    expect(first.meta).toEqual({ private: true });
    expect(first.staleTime).toBe(0);
    expect(dehydrate(client).queries).toHaveLength(0);
    for (const query of [
      managementListQuery('roles', initial, 'en', 13),
      managementListQuery('users', initial, 'en', 12),
      managementListQuery('roles', initial, 'zh-Hant', 12),
      managementListQuery('roles', { ...initial, page: 2 }, 'en', 12),
      managementListQuery('roles', { ...initial, search: 'editor' }, 'en', 12),
    ]) {
      expect(query.queryKey).not.toEqual(first.queryKey);
      expect(client.getQueryData(query.queryKey)).toBeUndefined();
    }
    expect(
      managementListQuery('roles', { ...initial, filters: { is_active: '' } }, 'en', 12).queryKey,
    ).toEqual(first.queryKey);
    client.clear();
  });

  it.each([{ ...page([role]), page: 2, items: [] }, page([role], 1, 20)])(
    'rejects otherwise valid responses for another page or size',
    async (response) => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(response)));
      const client = createQueryClient();
      await expect(
        client.fetchQuery(managementListQuery('roles', initial, 'en')),
      ).rejects.toMatchObject({ kind: 'contract' });
      client.clear();
    },
  );

  it('rejects content in another language instead of displaying fallback translation', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json(page([{ ...site, locale: 'en' }]))),
    );
    const client = createQueryClient();
    await expect(
      client.fetchQuery(managementListQuery('sites', initial, 'zh-Hant')),
    ).rejects.toMatchObject({ kind: 'contract' });
    client.clear();
  });

  it('passes query cancellation to the HTTP request without storing unfinished records', async () => {
    let signal: AbortSignal | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, options: RequestInit) => {
        signal = options.signal ?? undefined;
        return new Promise<Response>((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(signal?.reason), { once: true });
        });
      }),
    );
    const client = createQueryClient();
    const query = managementListQuery('users', initial, 'en', 12);
    const pending = client.fetchQuery(query);
    const rejected = expect(pending).rejects.toBeDefined();
    expect(signal?.aborted).toBe(false);
    await client.cancelQueries({ queryKey: query.queryKey });
    await rejected;
    expect(signal?.aborted).toBe(true);
    expect(client.getQueryData(query.queryKey)).toBeUndefined();
    client.clear();
  });

  it('keeps backend error codes safe and does not retry validation errors', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        Response.json({ detail: 'INVALID_SORT', debug: 'private' }, { status: 400 }),
      );
    vi.stubGlobal('fetch', fetch);
    const client = createQueryClient();
    await expect(
      client.fetchQuery(managementListQuery('users', initial, 'en')),
    ).rejects.toMatchObject({ kind: 'http', status: 400, code: 'INVALID_SORT' });
    expect(fetch).toHaveBeenCalledOnce();
    client.clear();
  });
});
