import { z } from 'zod';
import type { Locale } from '@/i18n/config';
import { ApiError, requestJson } from '@/shared/api/http';
import { rolePermissionSchema } from '../model/role-permissions';
import {
  managementRoleSchema,
  managementUserSchema,
  managementSiteSchema,
  type ManagementRow,
} from '../schemas/management';

export type EditableManagementResource = 'roles' | 'users' | 'sites';
const text = z
  .string()
  .max(10000)
  .refine(
    (value) =>
      !value.includes('\0') &&
      !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value),
  );
const shortText = text.max(255);
const rolePatch = z.strictObject({
  role: text
    .min(1)
    .max(64)
    .refine((value) => value === value.trim())
    .optional(),
  description: text.nullable().optional(),
  ...rolePermissionSchema.partial().shape,
  is_default: z.boolean().optional(),
  is_active: z.boolean().optional(),
});
const social = text.max(2048).refine((value) => {
  if (value === '') return true;
  try {
    const url = new URL(value);
    return (
      ['http:', 'https:'].includes(url.protocol) &&
      !!url.hostname &&
      !url.username &&
      !url.password &&
      !/[\s\\]/u.test(value) &&
      ![...value].some(
        (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
      ) &&
      url.port !== '0'
    );
  } catch {
    return false;
  }
});
const userPatch = z.strictObject({
  is_active: z.boolean().optional(),
  role_id: z.number().int().min(1).max(2147483647).optional(),
});
const sitePatch = z.strictObject({
  owner_is_active: z.boolean().optional(),
  is_default: z.boolean().optional(),
  is_published: z.boolean().optional(),
  copyright_year: z.number().int().min(1900).max(9999).optional(),
  linkedin: social.optional(),
  github: social.optional(),
  medium: social.optional(),
  email: z.union([z.literal(''), z.email().max(254)]).optional(),
  chat_icon: z
    .enum([
      'src/assets/icons/cow-engineer.svg',
      'assets/icons/cow-engineer.svg',
      'assets/cow-engineer.svg',
      'cow-engineer.svg',
    ])
    .optional(),
  brand_title: shortText.optional(),
  brand_title_sub: shortText.optional(),
  first_name: shortText.optional(),
  family_name: shortText.optional(),
  nick_name: shortText.optional(),
  edu_code: text.max(128).optional(),
  program: shortText.optional(),
  profile_content: text.optional(),
  intro_content: text.optional(),
  footer_content: text.optional(),
  chat_title: shortText.optional(),
  chat_title_sub: shortText.optional(),
  chat_content: text.optional(),
});
export const managementPatchSchemas = { roles: rolePatch, users: userPatch, sites: sitePatch };

/** Validate mutable assignments and confirm original values; every editor uses one resource PATCH.
 * The expected snapshot is only a concurrency condition, never authorization or a mutable identity.
 * Writes are not retried because a lost response may already represent a committed transaction.
 * @author ZhengLee 2026.10.16
 */
export async function updateManagementRecord(
  resource: EditableManagementResource,
  row: ManagementRow,
  changes: unknown,
  locale: Locale,
) {
  const schema: z.ZodType<ManagementRow> =
    resource === 'roles'
      ? managementRoleSchema
      : resource === 'users'
        ? managementUserSchema
        : managementSiteSchema;
  if (
    !schema.safeParse(row).success ||
    (resource === 'sites' && 'locale' in row && row.locale !== locale)
  )
    throw new ApiError('contract');
  const parsed = managementPatchSchemas[resource].safeParse(changes);
  if (!parsed.success || !Object.values(parsed.data).some((value) => value !== undefined))
    throw new ApiError('contract');
  const original = row as unknown as Record<string, unknown>;
  const expected = Object.fromEntries(
    Object.keys(parsed.data).map((field) => [field, original[field]]),
  );
  const confirmation =
    resource === 'roles'
      ? { expected_role: original.role }
      : resource === 'users'
        ? { expected_email: original.email }
        : { expected_owner_email: original.owner_email };
  const result = await requestJson(
    `management/${resource}/${row.id}${resource === 'sites' ? `?${new URLSearchParams({ locale })}` : ''}`,
    schema,
    {
      method: 'PATCH',
      credentials: 'include',
      cache: 'no-store',
      json: { ...confirmation, expected, changes: parsed.data },
    },
  );
  if (
    result.id !== row.id ||
    (resource === 'users' && 'email' in result && result.email !== original.email) ||
    (resource === 'sites' &&
      'owner_email' in result &&
      (result.owner_email !== original.owner_email || result.locale !== locale)) ||
    Object.entries(parsed.data).some(
      ([field, value]) => (result as unknown as Record<string, unknown>)[field] !== value,
    )
  )
    throw new ApiError('contract');
  return result;
}
