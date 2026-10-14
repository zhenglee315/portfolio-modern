import { z } from 'zod';
import {
  managementFilterSpecs,
  managementRoleSchema,
  managementUserSchema,
  managementSiteSchema,
  type ManagementResource,
  type ManagementRow,
} from '@/features/management';
import type { InlineFieldEditor } from '@/shared/ui/InlineField';

const schemas = {
  roles: managementRoleSchema,
  users: managementUserSchema,
  sites: managementSiteSchema,
};
const derived = new Set([
  'login_count',
  'user_count',
  'role_is_active',
  'has_site',
  'has_profile',
  'has_translation',
  'locale',
  'profile_name',
]);
const multiline = new Set([
  'description',
  'profile_content',
  'intro_content',
  'footer_content',
  'chat_content',
]);
const links = new Set(['linkedin', 'github', 'medium']);
const siteFields = new Set([
  'is_published',
  'is_default',
  'copyright_year',
  'linkedin',
  'github',
  'medium',
  'email',
  'chat_icon',
]);

/** Declare editable values from the existing DTO contracts; IDs, timestamps and projections stay read-only. */
export function managementEditor(
  resource: ManagementResource,
  field: string,
  row: ManagementRow,
): InlineFieldEditor | undefined {
  const spec = managementFilterSpecs[resource][field];
  if (
    !spec ||
    field === 'id' ||
    field.endsWith('_id') ||
    spec.type === 'date' ||
    derived.has(field) ||
    (resource === 'users' && field === 'email') ||
    (resource === 'sites' && ['owner_email', 'user'].includes(field))
  )
    return;
  const shape: Record<string, z.ZodType> = schemas[resource].shape;
  const response = shape[field];
  if (!response) return;
  if (
    resource === 'sites' &&
    'has_translation' in row &&
    field !== 'owner_is_active' &&
    (!row.has_site || (!siteFields.has(field) && !row.has_translation))
  )
    return;
  // Missing joins are nullable in a GET, but existing site/translation columns are not nullable in storage.
  const scalar = response instanceof z.ZodNullable ? response.unwrap() : response;
  const validator = resource === 'sites' ? scalar : response;
  const type =
    spec.type === 'boolean'
      ? 'boolean'
      : spec.type === 'number'
        ? 'number'
        : multiline.has(field)
          ? 'multiline'
          : field === 'email'
            ? 'email'
            : links.has(field)
              ? 'url'
              : 'text';
  return {
    type,
    nullable: z.safeParse(validator, null).success,
    checkbox: resource === 'sites' && field === 'is_published',
    maxLength: scalar instanceof z.ZodString ? (scalar.maxLength ?? undefined) : undefined,
    validate: (value) => {
      if (!z.safeParse(validator, value).success) return false;
      if (
        resource === 'sites' &&
        field === 'copyright_year' &&
        (typeof value !== 'number' || value < 1900 || value > 9999)
      )
        return false;
      if (
        type === 'email' &&
        !(resource === 'sites' && (value === null || value === '')) &&
        !z.email().safeParse(value).success
      )
        return false;
      if (type === 'url' && value !== null && value !== '') {
        try {
          if (!['https:', 'http:'].includes(new URL(String(value)).protocol)) return false;
        } catch {
          return false;
        }
      }
      if (
        resource === 'sites' &&
        field === 'is_default' &&
        value === true &&
        'owner_is_active' in row
      )
        return row.owner_is_active && row.has_site && row.is_published === true;
      return true;
    },
  };
}
