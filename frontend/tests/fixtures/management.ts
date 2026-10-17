import { fullName } from '../../src/features/site/model/profile.ts';
import type { DataTableFilter } from '../../src/shared/lib/table-filter.ts';
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

// Distinct times exercise default ordering; record 14 retains the displayed reference time.
const updateTime = (index: number) =>
  new Date(Date.parse(updated) - (handles.length - 1 - index) * 1000)
    .toISOString()
    .replace('.000Z', 'Z');

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
  updatetime: updateTime(index),
  user_count: assignedRoleIds.filter((roleId) => roleId === index + 1).length,
}));

export const managementUserFixtures: ManagementFixtureRow[] = handles.map((user, index) => ({
  id: index + 1,
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
  updatetime: updateTime(index),
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
      owner_email: `${user}@example.com`,
      owner_is_active: index !== 10,
      site_id: hasSite ? index + 101 : null,
      has_site: hasSite,
      has_profile: hasTranslation && index !== 8,
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
      createtime: created,
      updatetime: updateTime(index),
    };
  });
}

/** Resolve the same selected-page contract as Management GETs; no fixture-wide fetch is needed. */
export function managementEndpointFixture(url: URL, suppliedRows?: ManagementFixtureRow[]) {
  const path = url.pathname.replace(/^\/api/, '');
  const match = /^\/management\/(roles|users|sites)$/.exec(path);
  if (!match) return undefined;
  const resource = match[1] as ManagementResource;
  const locale = url.searchParams.get('locale') ?? 'en';
  let rows = (
    suppliedRows ??
    (resource === 'roles'
      ? managementRoleFixtures
      : resource === 'users'
        ? managementUserFixtures
        : managementSiteFixtures(locale))
  ).slice();
  const term = url.searchParams.get('search')?.trim().toLowerCase();
  if (term) {
    const selected: string[] = JSON.parse(url.searchParams.get('search_fields') ?? '[]');
    rows = rows.filter((row) =>
      (selected.length ? selected : Object.keys(row)).some((field) => {
        const value = row[field];
        if (value === null || value === undefined) return false;
        const text = String(value).toLowerCase();
        return (
          text.includes(term) ||
          (/time|login/.test(field) && text.replaceAll('-', '.').includes(term))
        );
      }),
    );
  }
  const predicates: DataTableFilter[] = JSON.parse(url.searchParams.get('filters') ?? '[]');
  rows = rows.filter((row) =>
    predicates.every((predicate) => {
      const value =
        predicate.field === 'profile_name'
          ? fullName({
              firstName: String(row.first_name ?? '').trim(),
              familyName: String(row.family_name ?? '').trim(),
            }) ||
            String(row.nick_name ?? '').trim() ||
            null
          : row[predicate.field];
      const empty =
        value === null || value === undefined || (typeof value === 'string' && !value.trim());
      if (predicate.operator === 'empty') return empty;
      if (predicate.operator === 'not_empty') return !empty;
      if (value === null || value === undefined) return false;
      if (!('value' in predicate)) return false;
      const scalar = (part: string | number | boolean) =>
        ['createtime', 'updatetime', 'last_login'].includes(predicate.field) &&
        typeof part === 'string'
          ? Date.parse(part)
          : typeof part === 'string'
            ? part.toLowerCase()
            : part;
      const actual = scalar(value);
      if (
        ['createtime', 'updatetime', 'last_login'].includes(predicate.field) &&
        'value' in predicate &&
        typeof predicate.value === 'string' &&
        /^\d{4}-\d\d-\d\d$/.test(predicate.value)
      ) {
        const start = Date.parse(`${predicate.value}T00:00:00Z`);
        const end = start + 86400000;
        const onDay = Number(actual) >= start && Number(actual) < end;
        switch (predicate.operator) {
          case 'equals':
            return onDay;
          case 'not_equals':
            return !onDay;
          case 'gt':
            return Number(actual) >= end;
          case 'gte':
            return Number(actual) >= start;
          case 'lt':
            return Number(actual) < start;
          case 'lte':
            return Number(actual) < end;
        }
      }

      if (predicate.operator === 'between')
        return actual >= scalar(predicate.value[0]) && actual <= scalar(predicate.value[1]);
      if (predicate.operator === 'in' || predicate.operator === 'not_in') {
        const matches = predicate.value.map(scalar).includes(actual);
        return predicate.operator === 'in' ? matches : !matches;
      }
      if (Array.isArray(predicate.value)) return false;
      const expected = scalar(predicate.value);
      switch (predicate.operator) {
        case 'equals':
          return actual === expected;
        case 'not_equals':
          return actual !== expected;
        case 'contains':
          return String(actual).includes(String(expected));
        case 'not_contains':
          return !String(actual).includes(String(expected));
        case 'starts':
          return String(actual).startsWith(String(expected));
        case 'ends':
          return String(actual).endsWith(String(expected));
        case 'gt':
          return actual > expected;
        case 'gte':
          return actual >= expected;
        case 'lt':
          return actual < expected;
        case 'lte':
          return actual <= expected;
      }
    }),
  );
  const sort = (url.searchParams.get('sort') ?? 'updatetime:desc').split(',').map((pair) => {
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
