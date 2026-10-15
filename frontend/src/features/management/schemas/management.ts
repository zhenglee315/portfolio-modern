import { z } from 'zod';
import { localeSchema } from '@/i18n/config';
import { recordIdSchema, uniqueRecords } from '@/shared/schemas/records';

const countSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const utcTimestampSchema = z.iso
  .datetime({ offset: true })
  .refine((value) => /(?:Z|\+00:00)$/.test(value));

/** Validate one role, preserving nullable description and server-owned permission flags. */
export const managementRoleSchema = z.object({
  id: recordIdSchema,
  role: z.string().min(1).max(64),
  description: z.string().nullable(),
  is_create: z.boolean(),
  is_read: z.boolean(),
  is_update: z.boolean(),
  is_delete: z.boolean(),
  is_manage_sites: z.boolean(),
  is_manage_users: z.boolean(),
  is_manage_roles: z.boolean(),
  is_default: z.boolean(),
  is_active: z.boolean(),
  createtime: utcTimestampSchema,
  updatetime: utcTimestampSchema,
  user_count: countSchema,
});

/** Validate one account without exposing authentication credentials or duplicating role rows. */
export const managementUserSchema = z.object({
  id: recordIdSchema,
  email: z.string().max(254),
  role_id: recordIdSchema,
  role: z.string().min(1).max(64),
  is_active: z.boolean(),
  role_is_active: z.boolean(),
  site_id: recordIdSchema.nullable(),
  has_site: z.boolean(),
  login_count: countSchema,
  last_login: utcTimestampSchema.nullable(),
  createtime: utcTimestampSchema,
  updatetime: utcTimestampSchema,
});

/** Validate one person-based platform row; missing sites and translations retain null values. */
export const managementSiteSchema = z.object({
  id: recordIdSchema,
  user: z.string(),
  owner_email: managementUserSchema.shape.email,
  owner_is_active: z.boolean(),
  site_id: recordIdSchema.nullable(),
  has_site: z.boolean(),
  has_profile: z.boolean(),
  is_published: z.boolean().nullable(),
  is_default: z.boolean().nullable(),
  copyright_year: z.number().int().nullable(),
  linkedin: z.string().nullable(),
  github: z.string().nullable(),
  medium: z.string().nullable(),
  email: z.string().nullable(),
  chat_icon: z.string().nullable(),
  locale: localeSchema,
  has_translation: z.boolean(),
  brand_title: z.string().nullable(),
  brand_title_sub: z.string().nullable(),
  first_name: z.string().nullable(),
  family_name: z.string().nullable(),
  nick_name: z.string().nullable(),
  profile_content: z.string().nullable(),
  edu_code: z.string().nullable(),
  program: z.string().nullable(),
  intro_content: z.string().nullable(),
  footer_content: z.string().nullable(),
  chat_title: z.string().nullable(),
  chat_title_sub: z.string().nullable(),
  chat_content: z.string().nullable(),
  createtime: utcTimestampSchema,
  updatetime: utcTimestampSchema,
});

/** Specialize the common envelope for adjustable management page sizes.
 * @param item Resource row schema, retaining its stable account or role identity.
 * @returns A schema validating complete page arithmetic and unique IDs before caching.
 */
export function managementPageSchema<T extends z.ZodType<{ id: number }>>(item: T) {
  return z
    .object({
      items: z.array(item),
      total: countSchema,
      pages: countSchema,
      page: recordIdSchema,
      size: z.number().int().min(1).max(100),
    })
    .superRefine((value, context) => {
      const expected =
        value.page > value.pages
          ? 0
          : Math.min(value.size, value.total - (value.page - 1) * value.size);
      if (value.pages !== Math.ceil(value.total / value.size) || value.items.length !== expected) {
        context.addIssue({ code: 'custom', message: 'Page arithmetic is inconsistent.' });
      }
      uniqueRecords(value.items, context);
    });
}

export const managementRolesSchema = managementPageSchema(managementRoleSchema);
export const managementUsersSchema = managementPageSchema(managementUserSchema);
export const managementSitesSchema = managementPageSchema(managementSiteSchema);

/** Validate a historical login snapshot; unavailable/legacy geography keeps its null values.
 * @author ZhengLee 2026.10.15
 */
export const managementLoginRecordSchema = z.object({
  id: recordIdSchema,
  user_id: recordIdSchema,
  email: managementUserSchema.shape.email,
  logintime: utcTimestampSchema,
  ip_address: z.string().max(45).nullable(),
  country_code: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .nullable(),
  region: z.string().max(128).nullable(),
  city: z.string().max(128).nullable(),
  geo_status: z.enum(['unknown', 'resolved', 'not_found', 'non_public', 'unavailable']),
});
export const managementLoginRecordsSchema = managementPageSchema(managementLoginRecordSchema);
export type LoginRecordRow = z.infer<typeof managementLoginRecordSchema>;
export type RoleRow = z.infer<typeof managementRoleSchema>;
export type UserRow = z.infer<typeof managementUserSchema>;
export type SiteRow = z.infer<typeof managementSiteSchema>;
export type ManagementRows = { roles: RoleRow; users: UserRow; sites: SiteRow };
export type ManagementResource = keyof ManagementRows;
export type ManagementRow = ManagementRows[ManagementResource];
