import {
  managementFilterFields,
  managementSortFields,
  type ManagementListState,
  type ManagementResource,
  type ManagementRow,
  type ManagementSort,
} from '@/features/management';
import type { IconName } from '@/shared/ui/Icon';

export const resources: { resource: ManagementResource; label: string; icon: IconName }[] = [
  { resource: 'sites', label: 'platformManagement', icon: 'dashboard' },
  { resource: 'users', label: 'userManagement', icon: 'people' },
  { resource: 'roles', label: 'roleManagement', icon: 'shieldLock' },
];

export const fields: Record<ManagementResource, string[]> = {
  roles: [
    'id',
    'role',
    'description',
    'is_create',
    'is_read',
    'is_update',
    'is_delete',
    'is_manage_sites',
    'is_manage_users',
    'is_manage_roles',
    'is_default',
    'is_active',
    'createtime',
    'updatetime',
    'user_count',
  ],
  users: [
    'id',
    'user',
    'email',
    'role_id',
    'role',
    'is_active',
    'role_is_active',
    'site_id',
    'has_site',
    'login_count',
    'last_login',
    'createtime',
    'updatetime',
  ],
  sites: [
    'profile_name',
    'id',
    'user',
    'owner_is_active',
    'site_id',
    'has_site',
    'is_published',
    'is_default',
    'copyright_year',
    'linkedin',
    'github',
    'medium',
    'email',
    'chat_icon',
    'locale',
    'has_translation',
    'brand_title',
    'brand_title_sub',
    'first_name',
    'family_name',
    'nick_name',
    'profile_content',
    'edu_code',
    'program',
    'intro_content',
    'footer_content',
    'chat_title',
    'chat_title_sub',
    'chat_content',
    'updatetime',
  ],
};
export const visible: Record<ManagementResource, string[]> = {
  roles: ['id', 'role', 'description', 'user_count', 'updatetime', 'is_active', 'is_default'],
  users: [
    'id',
    'user',
    'email',
    'role',
    'login_count',
    'last_login',
    'updatetime',
    'is_active',
    'role_is_active',
    'has_site',
  ],
  sites: [
    'id',
    'user',
    'profile_name',
    'brand_title',
    'updatetime',
    'owner_is_active',
    'has_site',
    'is_published',
    'is_default',
    'has_translation',
  ],
};
// Field order remains predictable even when optional permission/status columns are revealed.
export const booleanFields: Record<ManagementResource, string[]> = {
  roles: [
    'is_create',
    'is_read',
    'is_update',
    'is_delete',
    'is_manage_sites',
    'is_manage_users',
    'is_manage_roles',
    'is_default',
    'is_active',
  ],
  users: ['is_active', 'role_is_active', 'has_site'],
  sites: ['owner_is_active', 'has_site', 'is_published', 'is_default', 'has_translation'],
};

/** Normalize link parameters into the same bounded controls accepted by the feature API. */
export function listState(
  resource: ManagementResource,
  params: URLSearchParams,
): ManagementListState {
  const integer = (key: string, fallback: number, maximum: number) => {
    const value = Number(params.get(key));
    return Number.isSafeInteger(value) && value >= 1 && value <= maximum ? value : fallback;
  };
  const rawSort = params.get('sort');
  const sort = (rawSort ?? 'id:desc').split(',').flatMap<ManagementSort>((pair) => {
    const [field, direction] = pair.split(':');
    return field &&
      managementSortFields[resource].includes(field) &&
      (direction === 'asc' || direction === 'desc')
      ? [{ field, direction }]
      : [];
  });
  const unique = sort
    .filter((entry, index) => sort.findIndex((item) => item.field === entry.field) === index)
    .slice(0, 3);
  const filters = Object.fromEntries(
    managementFilterFields[resource].flatMap((field) => {
      const value = params.get(field);
      if (field === 'role_id') {
        const id = Number(value);
        return Number.isInteger(id) && id > 0 && id <= 2147483647 ? [[field, String(id)]] : [];
      }
      return value === 'true' || value === 'false' ? [[field, value]] : [];
    }),
  );
  const search = (params.get('search') ?? '')
    .trim()
    .slice(0, 200)
    .split(/\s+/)
    .slice(0, 10)
    .join(' ');
  return {
    page: integer('page', 1, Number.MAX_SAFE_INTEGER),
    size: integer('size', 6, 100),
    search,
    // An explicit reset stays empty in the UI; transport supplies its stable database default.
    sort: unique.length || !rawSort ? unique : [{ field: 'id', direction: 'desc' }],
    filters,
  };
}

/** Read scalar DTO values without interpreting any API strings as markup or links. */
export function rowValue(row: ManagementRow, field: string): string | number | boolean | null {
  const values: Record<string, string | number | boolean | null> = row;
  return values[field] ?? null;
}
