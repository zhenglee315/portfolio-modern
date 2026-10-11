import { z } from 'zod';

/** Server-issued identity and permissions; session cookies remain browser-managed. */
export const authUserSchema = z.object({
  id: z.number().int().positive(),
  email: z.string().min(5).max(254),
  role: z.string().min(1).max(64),
  is_create: z.boolean(),
  is_read: z.boolean(),
  is_update: z.boolean(),
  is_delete: z.boolean(),
  is_manage_roles: z.boolean(),
  is_manage_users: z.boolean(),
});

export type AuthUser = z.infer<typeof authUserSchema>;

/** The session endpoint returns a validated account or null for a guest. */
export const sessionSchema = authUserSchema.nullable();
export type AuthSession = z.infer<typeof sessionSchema>;

/** Clear browser identity only when the server confirms session destruction. */
export const authSignOutSchema = z.object({ signed_out: z.literal(true) });

/** Registration responses contain no verification code or client-selected permissions. */
export const authEmailAvailabilitySchema = z.object({
  email: z.string().min(5).max(254),
  available: z.boolean(),
});

export const authCodeSchema = z.object({
  expires_in: z.number().int().positive(),
  retry_after: z.number().int().nonnegative(),
});

export const authEmailVerifiedSchema = z.object({
  email: z.string().min(5).max(254),
  verified: z.boolean(),
});
