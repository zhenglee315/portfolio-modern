import { queryOptions, useQuery } from '@tanstack/react-query';
import type { z } from 'zod';
import { localeSchema, type Locale } from '@/i18n/config';
import { ApiError, requestJson, retryRead } from '@/shared/api/http';
import { parseTableFilters, type DataTableFilterSpec } from '@/shared/lib/table-filter';
import { parseTableSearch } from '@/shared/lib/table-search';
import type { NumberedPage } from '@/shared/schemas/records';
import {
  managementRolesSchema,
  managementUsersSchema,
  managementSitesSchema,
  type ManagementResource,
  type ManagementRows,
} from '../schemas/management';

export type ManagementSort = { field: string; direction: 'asc' | 'desc' };
export type ManagementListState = import('@/shared/lib/table-query').DataTableQueryState;

export const managementSortFields = {
  roles: Object.keys(managementRolesSchema.shape.items.element.shape),
  users: Object.keys(managementUsersSchema.shape.items.element.shape),
  sites: Object.keys(managementSitesSchema.shape.items.element.shape).filter(
    (field) => field !== 'locale',
  ),
} satisfies Record<ManagementResource, string[]>;

const booleans = [
  'is_create',
  'is_read',
  'is_update',
  'is_delete',
  'is_manage_sites',
  'is_manage_users',
  'is_manage_roles',
  'is_default',
  'is_active',
  'role_is_active',
  'owner_is_active',
  'has_site',
  'has_translation',
  'is_published',
];
const numbers = ['id', 'role_id', 'site_id', 'login_count', 'user_count', 'copyright_year'];
const dates = ['createtime', 'updatetime', 'last_login'];
const boundedNumbers = ['id', 'role_id', 'site_id', 'copyright_year'];

/** One capabilities map serves URL validation and every management column menu. */
export const managementFilterSpecs = Object.fromEntries(
  Object.entries({
    roles: managementRolesSchema,
    users: managementUsersSchema,
    sites: managementSitesSchema,
  }).map(([resource, schema]) => [
    resource,
    Object.fromEntries(
      Object.entries(schema.shape.items.element.shape).map(([field, validator]) => {
        const type = booleans.includes(field)
          ? 'boolean'
          : numbers.includes(field)
            ? 'number'
            : dates.includes(field)
              ? 'date'
              : 'text';
        return [
          field,
          field === 'locale'
            ? {
                type: 'enum',
                options: ['en', 'zh-Hans', 'zh-Hant'].map((value) => ({ value, label: value })),
              }
            : {
                type,
                nullable: validator.safeParse(null).success,
                ...(type === 'number'
                  ? {
                      integer: true,
                      ...(boundedNumbers.includes(field)
                        ? { minimum: -2147483648, maximum: 2147483647 }
                        : {}),
                    }
                  : {}),
              },
        ];
      }),
    ),
  ]),
) as Record<ManagementResource, Record<string, DataTableFilterSpec>>;
managementFilterSpecs.sites.profile_name = { type: 'text', nullable: true };
for (const resource of ['roles', 'users'] as const)
  managementFilterSpecs[resource].role = { type: 'text', sets: true };

const schemas: {
  [Resource in ManagementResource]: z.ZodType<NumberedPage<ManagementRows[Resource]>>;
} = {
  roles: managementRolesSchema,
  users: managementUsersSchema,
  sites: managementSitesSchema,
};

/** Serialize the selected page controls without fetching or sorting browser-only subsets.
 * @param resource Endpoint whose filter and sort whitelist validates the request.
 * @param state Current server page, ordered sort criteria and typed column filters.
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

  const filters = parseTableFilters(state.filters, managementFilterSpecs[resource]);
  if (!filters || JSON.stringify(filters).length > 16384) throw new ApiError('contract');
  const sort = state.sort;
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
  if (sort.length)
    params.set('sort', sort.map((item) => `${item.field}:${item.direction}`).join(','));
  if (resource === 'sites') params.set('locale', locale);
  if (filters.length)
    params.set('filters', JSON.stringify(filters.sort((a, b) => a.field.localeCompare(b.field))));
  if (state.search) {
    const search = parseTableSearch(state.search, Object.keys(managementFilterSpecs[resource]));
    if (!search) throw new ApiError('contract');
    if (search.term) {
      params.set('search', search.term);
      params.set('search_fields', JSON.stringify(search.fields));
    }
  }
  return params;
}

/** Create one cancellable GET for the selected management resource and numbered page.
 * @param resource Resource row contract; requests never prefetch other resources or pages.
 * @param state Controlled list values; column filters and sort run in the database.
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
 * @returns Query-owned records, retaining the last page during a read within the same private scope.
 */
export function useManagementList<R extends ManagementResource>(
  resource: R,
  state: ManagementListState,
  locale: Locale,
  enabled = true,
  accountId?: number,
) {
  const options = managementListQuery(resource, state, locale, accountId);
  return useQuery({
    ...options,
    enabled,
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey.length === options.queryKey.length &&
      previousQuery.queryKey.slice(0, -1).every((value, index) => value === options.queryKey[index])
        ? previous
        : undefined,
  });
}
