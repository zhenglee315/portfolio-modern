import {
  managementFilterSpecs,
  type ManagementResource,
  type ManagementRow,
  type ManagementRows,
} from '@/features/management';

type ManagementFields = {
  [Resource in ManagementResource]: (
    keyof ManagementRows[Resource] | (Resource extends 'sites' ? 'profile_name' : never)
  )[];
};

export const fields: Record<ManagementResource, string[]> = {
  roles: [
    'id',
    'role',
    'user_count',
    'is_default',
    'is_create',
    'is_read',
    'is_update',
    'is_delete',
    'is_manage_sites',
    'is_manage_users',
    'is_manage_roles',
    'is_active',
    'description',
    'createtime',
    'updatetime',
  ],
  users: [
    'id',
    'user',
    'email',
    'role',
    'login_count',
    'last_login',
    'updatetime',
    'is_active',
    'role_id',
    'role_is_active',
    'site_id',
    'has_site',
    'createtime',
  ],
  sites: [
    'id',
    'user',
    'first_name',
    'family_name',
    'nick_name',
    'edu_code',
    'profile_name',
    'has_site',
    'brand_title',
    'brand_title_sub',
    'is_published',
    'has_translation',
    'is_default',
    'owner_is_active',
    'program',
    'locale',
    'copyright_year',
    'intro_content',
    'footer_content',
    'email',
    'linkedin',
    'github',
    'medium',
    'chat_icon',
    'chat_title',
    'chat_title_sub',
    'chat_content',
    'profile_content',
    'site_id',
    'createtime',
    'updatetime',
  ],
} satisfies ManagementFields;
export const visible: Record<ManagementResource, string[]> = {
  roles: [
    'id',
    'role',
    'is_create',
    'is_read',
    'is_update',
    'is_delete',
    'is_manage_sites',
    'is_manage_users',
    'is_manage_roles',
    'is_default',
    'is_active',
    'updatetime',
  ],
  users: ['id', 'user', 'email', 'role', 'login_count', 'last_login', 'updatetime', 'is_active'],
  sites: ['id', 'user', 'has_site', 'is_published', 'is_default', 'owner_is_active', 'updatetime'],
} satisfies ManagementFields;

/** Requested headings are independent of DTO field names and management language. */
export const columnLabels: Record<ManagementResource, Record<string, string>> = {
  roles: {
    id: 'ID',
    role: 'Role',
    is_create: 'Create',
    is_read: 'Read',
    is_update: 'Update',
    is_delete: 'Delete',
    is_manage_sites: 'Site',
    is_manage_users: 'Users',
    is_manage_roles: 'Roles',
    is_default: 'Default',
    is_active: 'Active',
    updatetime: 'Updated',
    actions: 'Actions',
  },
  users: {
    id: 'ID',
    user: 'Account',
    email: 'Email',
    role: 'Role',
    login_count: 'Login',
    last_login: 'LastLogin',
    updatetime: 'Updated',
    is_active: 'Active',
    actions: 'Actions',
  },
  sites: {
    id: 'ID',
    user: 'Account',
    has_site: 'Profile',
    is_published: 'Publish',
    is_default: 'Default',
    owner_is_active: 'Active',
    updatetime: 'Updated',
    actions: 'Actions',
  },
};

/** Complete Actions details follow fields.sites, independently of the compact table. */
const platformDetailLabels: Record<string, string> = {
  ...columnLabels.sites,
  first_name: 'First name',
  family_name: 'Family name',
  nick_name: 'Nickname',
  edu_code: 'Education',
  profile_name: 'Profile name',
  has_site: 'Profile data',
  brand_title: 'Brand',
  brand_title_sub: 'Brand Subtitle',
  has_translation: 'Translation',
  program: 'Program',
  locale: 'Language',
  copyright_year: 'Copyright',
  intro_content: 'Introduction',
  footer_content: 'Footer',
  email: 'Email',
  linkedin: 'LinkedIn',
  github: 'GitHub',
  medium: 'Medium',
  chat_icon: 'Chat icon',
  chat_title: 'Chat title',
  chat_title_sub: 'Chat subtitle',
  chat_content: 'Chat content',
  profile_content: 'Profile introduction',
  site_id: 'Website ID',
  createtime: 'Created',
};

/** Detail ordering and labels do not depend on visible table columns. */
export const detailLabels: Record<ManagementResource, Record<string, string>> = {
  sites: platformDetailLabels,
  users: {},
  roles: {
    ...columnLabels.roles,
    user_count: 'Users',
    is_manage_sites: 'Manage Site',
    is_manage_users: 'Manage Users',
    is_manage_roles: 'Manage Roles',
    description: 'Description',
    createtime: 'Created',
  },
};

// Boolean field IDs select status renderers; presentation order follows the column configuration.
export const booleanFields = Object.fromEntries(
  Object.entries(managementFilterSpecs).map(([resource, specs]) => [
    resource,
    Object.entries(specs)
      .filter(([, spec]) => spec.type === 'boolean')
      .map(([field]) => field),
  ]),
) as Record<ManagementResource, string[]>;

/** Read scalar DTO values without interpreting any API strings as markup or links. */
export function rowValue(row: ManagementRow, field: string): string | number | boolean | null {
  const values: Record<string, string | number | boolean | null> = row;
  return values[field] ?? null;
}
