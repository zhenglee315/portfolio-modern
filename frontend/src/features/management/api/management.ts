import { queryOptions, useQuery } from '@tanstack/react-query';
import type { z } from 'zod';
import { localeSchema, type Locale } from '@/i18n/config';
import { ApiError, requestJson, retryRead } from '@/shared/api/http';
import type { NumberedPage } from '@/shared/schemas/records';
import {
  managementRolesSchema,
  managementUsersSchema,
  managementSitesSchema,
  type ManagementResource,
  type ManagementRows,
} from '../schemas/management';

export type ManagementSort = { field: string; direction: 'asc' | 'desc' };
export type ManagementListState = {
  page: number;
  size: number;
  search: string;
  sort: ManagementSort[];
  filters: Record<string, string>;
};

export const managementSortFields = {
  roles: Object.keys(managementRolesSchema.shape.items.element.shape),
  users: Object.keys(managementUsersSchema.shape.items.element.shape),
  sites: Object.keys(managementSitesSchema.shape.items.element.shape).filter(
    (field) => field !== 'locale',
  ),
} satisfies Record<ManagementResource, string[]>;

export const managementFilterFields = {
  roles: ['is_active', 'is_default'],
  users: ['is_active', 'role_is_active', 'has_site', 'role_id'],
  sites: ['owner_is_active', 'has_site', 'is_published', 'is_default', 'has_translation'],
} satisfies Record<ManagementResource, string[]>;

const schemas: {
  [Resource in ManagementResource]: z.ZodType<NumberedPage<ManagementRows[Resource]>>;
} = {
  roles: managementRolesSchema,
  users: managementUsersSchema,
  sites: managementSitesSchema,
};

/** Serialize the selected page controls without fetching or sorting browser-only subsets.
 * @param resource Endpoint whose filter and sort whitelist validates the request.
 * @param state Current server page, search, ordered sort criteria and optional filters.
 * @param locale Current management language; only platform content queries use it on the wire.
 * @returns Canonical query parameters used for both the request and its cache identity.
 * @throws ApiError when controls violate the management GET contract.
 */
export function managementListParams(
  resource: ManagementResource,
  state: ManagementListState,
  locale: Locale,
) {
  if (
    !Object.hasOwn(schemas, resource) ||
    !localeSchema.safeParse(locale).success ||
    !Number.isSafeInteger(state.page) ||
    state.page < 1 ||
    !Number.isSafeInteger(state.size) ||
    state.size < 1 ||
    state.size > 100
  )
    throw new ApiError('contract');

  const search = state.search.trim();
  if (Array.from(search).length > 200 || (search ? search.split(/\s+/u).length : 0) > 10)
    throw new ApiError('contract');
  const sort = state.sort.length ? state.sort : [{ field: 'id', direction: 'desc' }];
  if (
    sort.length > 3 ||
    new Set(sort.map((item) => item.field)).size !== sort.length ||
    sort.some(
      (item) =>
        !managementSortFields[resource].includes(item.field) ||
        (item.direction !== 'asc' && item.direction !== 'desc'),
    )
  )
    throw new ApiError('contract');

  const params = new URLSearchParams({ page: String(state.page), size: String(state.size) });
  if (search) params.set('search', search);
  params.set('sort', sort.map((item) => `${item.field}:${item.direction}`).join(','));
  if (resource === 'sites') params.set('locale', locale);
  for (const [field, raw] of Object.entries(state.filters).sort(([a], [b]) => a.localeCompare(b))) {
    if (!managementFilterFields[resource].includes(field)) throw new ApiError('contract');
    if (raw === '') continue;
    if (field === 'role_id') {
      const value = Number(raw);
      if (!/^\d+$/.test(raw) || !Number.isInteger(value) || value < 1 || value > 2147483647)
        throw new ApiError('contract');
      params.set(field, String(value));
    } else {
      const value = raw.trim().toLowerCase();
      if (value !== 'true' && value !== 'false') throw new ApiError('contract');
      params.set(field, value);
    }
  }
  return params;
}

/** Create one cancellable GET for the selected management resource and numbered page.
 * @param resource Resource row contract; requests never prefetch other resources or pages.
 * @param state Controlled list values; search, filters and sort run in the database.
 * @param locale Current management language, included in cache identity for every resource.
 * @param accountId Session account identity isolating private records across account changes.
 * @param options Optional API origin for explicit read-only integration checks.
 * @returns Private query options whose validated page remains the only record store.
 * @throws ApiError for invalid controls, failed transport or mismatched response metadata.
 */
export function managementListQuery<R extends ManagementResource>(
  resource: R,
  state: ManagementListState,
  locale: Locale,
  accountId?: number,
  options: { baseUrl?: string } = {},
) {
  const params = managementListParams(resource, state, locale).toString();
  const { page, size } = state;
  const schema = schemas[resource];
  return queryOptions({
    queryKey: ['management', accountId ?? 'session', resource, locale, params] as const,
    queryFn: async ({ signal }) => {
      const result = await requestJson(`management/${resource}?${params}`, schema, {
        credentials: 'include',
        signal,
        baseUrl: options.baseUrl,
      });
      if (
        result.page !== page ||
        result.size !== size ||
        (resource === 'sites' &&
          result.items.some((item) => 'locale' in item && item.locale !== locale))
      )
        throw new ApiError('contract');
      return result;
    },
    meta: { private: true },
    staleTime: 0,
    retry: retryRead,
  });
}

/** Subscribe after browser/session readiness; changing controls loads only the requested page.
 * @param enabled The page's browser/session lifecycle gate; disabled observers never send reads.
 * @returns Query-owned records and loading/error state without copying stale resource rows.
 */
export function useManagementList<R extends ManagementResource>(
  resource: R,
  state: ManagementListState,
  locale: Locale,
  enabled = true,
  accountId?: number,
) {
  return useQuery({ ...managementListQuery(resource, state, locale, accountId), enabled });
}
