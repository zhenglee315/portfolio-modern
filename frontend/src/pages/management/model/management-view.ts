import {
  managementFilterSpecs,
  rolePermissionDefinitions,
  rolePermissionFields,
  type ManagementResource,
  type ManagementRow,
  type ManagementRows,
} from '@/features/management';

type ManagementFields = {
  [Resource in ManagementResource]: (
    keyof ManagementRows[Resource] | (Resource extends 'sites' ? 'profile_name' : never)
  )[];
};

// Editable values come first, related read-only facts follow, and Active / Created / Updated stay last.
export const fields: Record<ManagementResource, string[]> = {
  roles: [
    'role',
    'description',
    'is_default',
    ...rolePermissionFields,
    'user_count',
    'id',
    'is_active',
    'createtime',
    'updatetime',
  ],
  users: [
    'email',
    'role',
    'login_count',
    'last_login',
    'has_site',
    'role_id',
    'site_id',
    'id',
    'role_is_active',
    'is_active',
    'createtime',
    'updatetime',
  ],
  sites: [
    'owner_email',
    'first_name',
    'family_name',
    'nick_name',
    'edu_code',
    'program',
    'brand_title',
    'brand_title_sub',
    'intro_content',
    'profile_content',
    'email',
    'linkedin',
    'github',
    'medium',
    'chat_title',
    'chat_title_sub',
    'chat_icon',
    'chat_content',
    'footer_content',
    'copyright_year',
    'is_published',
    'is_default',
    'profile_name',
    'has_site',
    'has_profile',
    'has_translation',
    'locale',
    'site_id',
    'id',
    'owner_is_active',
    'createtime',
    'updatetime',
  ],
} satisfies ManagementFields;
export const visible: Record<ManagementResource, string[]> = {
  roles: ['id', 'role', ...rolePermissionFields, 'is_default', 'is_active', 'updatetime'],
  users: ['id', 'email', 'role', 'login_count', 'last_login', 'updatetime', 'is_active'],
  sites: [
    'id',
    'owner_email',
    'has_profile',
    'is_published',
    'is_default',
    'owner_is_active',
    'updatetime',
  ],
} satisfies ManagementFields;

/** Requested headings are independent of DTO field names and management language. */
export const columnLabels: Record<ManagementResource, Record<string, string>> = {
  roles: {
    id: 'ID',
    role: 'Role',
    ...Object.fromEntries(
      rolePermissionFields.map((field) => [field, rolePermissionDefinitions[field].label]),
    ),
    is_default: 'Default',
    is_active: 'Active',
    updatetime: 'Updated',
    actions: 'Actions',
  },
  users: {
    id: 'ID',
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
    owner_email: 'Email',
    has_profile: 'Profile',
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
  has_site: 'Website exists',
  brand_title: 'Brand',
  brand_title_sub: 'Brand Subtitle',
  has_translation: 'Translation',
  program: 'Program',
  locale: 'Language',
  copyright_year: 'Copyright',
  intro_content: 'Introduction',
  footer_content: 'Footer',
  email: 'Contact email',
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
    ...Object.fromEntries(
      rolePermissionFields.map((field) => [field, rolePermissionDefinitions[field].detail]),
    ),
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
