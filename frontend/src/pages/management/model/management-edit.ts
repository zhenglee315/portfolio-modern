import { z } from 'zod';
import {
  managementFilterSpecs,
  managementPatchSchemas,
  hasRoleManagementPermission,
  type ManagementResource,
  type ManagementRow,
} from '@/features/management';
import type { InlineFieldEditor } from '@/shared/ui/InlineField';

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

/** Declare editable values from the resource write contracts; IDs, timestamps and projections stay read-only. */
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
    (resource === 'users' && field !== 'is_active') ||
    (resource === 'sites' && ['owner_email', 'user'].includes(field))
  )
    return;
  const shape: Record<string, z.ZodType> = managementPatchSchemas[resource].shape;
  const response = shape[field];
  if (!response) return;
  if (
    resource === 'sites' &&
    'has_translation' in row &&
    field !== 'owner_is_active' &&
    (!row.has_site || (!siteFields.has(field) && !row.has_translation))
  )
    return;
  // Write contracts own nullability/limits; nullable GET joins do not grant write access.
  const validator = response instanceof z.ZodOptional ? response.unwrap() : response;
  const scalar = validator instanceof z.ZodNullable ? validator.unwrap() : validator;
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
      if (!managementPatchSchemas[resource].safeParse({ [field]: value }).success) return false;

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

/** Validate dependent final state without clearing a registration default or mutating related accounts. */
export function managementDraftIssue(
  resource: ManagementResource,
  original: ManagementRow,
  draft: ManagementRow,
): string | undefined {
  if (
    resource === 'sites' &&
    'owner_is_active' in draft &&
    draft.is_default &&
    !draft.owner_is_active
  )
    return 'defaultSiteActiveRequired';
  if (resource === 'roles' && 'user_count' in original && 'user_count' in draft) {
    if (original.is_default && !draft.is_default) return 'defaultRoleRequired';
    if (draft.is_default && (!draft.is_active || hasRoleManagementPermission(draft)))
      return 'defaultRoleEligible';
  }
}

/** Share the Default activation restriction between table switches and detail drafts.
 * @author ZhengLee 2026.10.16
 */
export function managementFieldIssue(
  resource: ManagementResource,
  field: string,
  row: ManagementRow,
): string | undefined {
  if (
    resource === 'sites' &&
    field === 'owner_is_active' &&
    'owner_is_active' in row &&
    row.has_site &&
    row.is_default
  )
    return 'defaultSiteActiveRequired';
}

/** Unpublishing clears the draft Default; account deactivation never silently removes it. */
export function managementDraftChanges(
  resource: ManagementResource,
  row: ManagementRow,
  field: string,
  value: import('@/shared/ui/InlineField').InlineFieldValue,
) {
  return resource === 'sites' &&
    'has_site' in row &&
    row.has_site &&
    value === false &&
    field === 'is_published'
    ? { [field]: value, is_default: false }
    : { [field]: value };
}
