/** Synthetic person-based management rows, shared by the browser API and fault injection.
 * All values are generated locally; the fixtures never contain captured administrative data.
 */
export type ManagementResource = 'roles' | 'users' | 'sites';
type FixtureValue = string | number | boolean | null;
export type ManagementFixtureRow = Record<string, FixtureValue>;

const created = '2026-01-01T08:00:00Z';
const updated = '2026-09-15T12:30:00Z';
const handles = [
  'alex',
  'sam',
  'reviewer',
  'no_site',
  'pat',
  'lee',
  'nina',
  'taylor',
  'casey',
  'jules',
  'inactive',
  'river',
  'avery',
  'operator',
];
const roleNames = [
  'administrator',
  'editor_ops',
  'reviewer',
  'rate%reviewer',
  'reader',
  'author',
  'translator',
  'publisher',
  'auditor',
  'designer',
  'archived',
  'moderator',
  'maintainer',
  'support',
];
const assignedRoleIds = [1, 2, 2, 3, 4, 4, 4, 5, 5, 6, 11, 12, 14, 14];

export const managementRoleFixtures: ManagementFixtureRow[] = roleNames.map((role, index) => ({
  id: index + 1,
  role,
  description:
    index === 10 ? null : `Content ${index % 2 ? 'review' : 'support'} team ${index + 1}`,
  is_create: index % 3 === 0,
  is_read: true,
  is_update: index % 2 === 0,
  is_delete: index === 0,
  is_manage_sites: index === 0,
  is_manage_users: index === 0,
  is_manage_roles: index === 0,
  is_default: index === 4,
  is_active: index !== 10,
  createtime: created,
  updatetime: updated,
  user_count: assignedRoleIds.filter((roleId) => roleId === index + 1).length,
}));

export const managementUserFixtures: ManagementFixtureRow[] = handles.map((user, index) => ({
  id: index + 1,
  user,
  email: `${user}@example.com`,
  role_id: assignedRoleIds[index]!,
  role: roleNames[assignedRoleIds[index]! - 1]!,
  is_active: index !== 10,
  role_is_active: index !== 10,
  site_id: [3, 10].includes(index) ? null : index + 101,
  has_site: ![3, 10].includes(index),
  login_count: index % 5,
  last_login: index % 5 === 0 ? null : `2026-09-${String(index + 1).padStart(2, '0')}T09:00:00Z`,
  createtime: created,
  updatetime: updated,
}));

/** Generate one selected-language row per owner, including absent sites and translations. */
export function managementSiteFixtures(locale = 'en'): ManagementFixtureRow[] {
  return handles.map((user, index) => {
    const hasSite = ![3, 10].includes(index);
    const hasTranslation = hasSite && (locale === 'en' || index % 3 !== 0);
    const localized = (value: string) => (hasTranslation ? value : null);
    return {
      id: index + 1,
      user,
      owner_is_active: index !== 10,
      site_id: hasSite ? index + 101 : null,
      has_site: hasSite,
      is_published: hasSite ? index % 2 === 0 : null,
      is_default: hasSite ? index === 0 : null,
      copyright_year: hasSite ? 2026 : null,
      linkedin: hasSite ? '' : null,
      github: hasSite ? `https://github.com/${user}` : null,
      medium: hasSite ? '' : null,
      email: hasSite ? `${user}.public@example.com` : null,
      chat_icon: hasSite ? 'assets/cow-engineer.svg' : null,
      locale,
      has_translation: hasTranslation,
      brand_title: localized(`${locale} ${user} Studio`),
      brand_title_sub: localized('Engineer'),
      first_name: localized(user.charAt(0).toUpperCase() + user.slice(1)),
      family_name: localized('Example'),
      nick_name: localized(user),
      profile_content: localized(`Design accessible systems for ${user}.`),
      edu_code: localized('UNI'),
      program: localized('Computer science'),
      intro_content: localized('Software engineer'),
      footer_content: localized('Keep building.'),
      chat_title: localized('Hello'),
      chat_title_sub: localized('Get in touch'),
      chat_content: localized(`Send an email to ${user}.\nWe can discuss your project.`),
      updatetime: updated,
    };
  });
}

const searchFields: Record<ManagementResource, string[]> = {
  roles: ['role', 'description'],
  users: ['user', 'email', 'role'],
  sites: [
    'user',
    'email',
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
  ],
};
const booleanFilters: Record<ManagementResource, string[]> = {
  roles: ['is_active', 'is_default'],
  users: ['is_active', 'role_is_active', 'has_site'],
  sites: ['owner_is_active', 'has_site', 'is_published', 'is_default', 'has_translation'],
};

/** Resolve the same selected-page contract as Management GETs; no fixture-wide fetch is needed. */
export function managementEndpointFixture(url: URL) {
  const path = url.pathname.replace(/^\/api/, '');
  const match = /^\/management\/(roles|users|sites)$/.exec(path);
  if (!match) return undefined;
  const resource = match[1] as ManagementResource;
  const locale = url.searchParams.get('locale') ?? 'en';
  let rows = (
    resource === 'roles'
      ? managementRoleFixtures
      : resource === 'users'
        ? managementUserFixtures
        : managementSiteFixtures(locale)
  ).slice();
  const terms = (url.searchParams.get('search') ?? '')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  rows = rows.filter((row) =>
    terms.every((term) =>
      searchFields[resource].some((field) =>
        String(row[field] ?? '')
          .toLowerCase()
          .includes(term),
      ),
    ),
  );
  for (const field of booleanFilters[resource]) {
    const value = url.searchParams.get(field);
    if (value !== null) rows = rows.filter((row) => row[field] === (value === 'true'));
  }
  if (resource === 'users' && url.searchParams.has('role_id')) {
    rows = rows.filter((row) => row.role_id === Number(url.searchParams.get('role_id')));
  }
  const sort = (url.searchParams.get('sort') ?? 'id:desc').split(',').map((pair) => {
    const [field = 'id', direction = 'desc'] = pair.split(':');
    return [field, direction] as const;
  });
  if (!sort.some(([field]) => field === 'id')) sort.push(['id', 'asc']);
  rows.sort((left, right) => {
    for (const [field, direction] of sort) {
      const a = left[field];
      const b = right[field];
      // SQL explicitly places absent values last for both ascending and descending sorts.
      if (a === null && b !== null) return 1;
      if (a !== null && b === null) return -1;
      if (a === b) continue;
      const comparison = a! < b! ? -1 : 1;
      return direction === 'desc' ? -comparison : comparison;
    }
    return 0;
  });
  const page = Number(url.searchParams.get('page') ?? 1);
  const size = Number(url.searchParams.get('size') ?? 6);
  return {
    // Route-specific overrides own their rows and cannot alter another test's fixture records.
    items: rows.slice((page - 1) * size, page * size).map((row) => ({ ...row })),
    total: rows.length,
    pages: Math.ceil(rows.length / size),
    page,
    size,
  };
}
