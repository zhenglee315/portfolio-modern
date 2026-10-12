import { z } from 'zod';

export const reservedPublicUsers = new Set([
  'admin',
  'dashboard',
  'login',
  'register',
  'authority',
  'portfolio',
  'api',
  'assets',
  'en',
  'zh-hans',
  'zh-hant',
  'system',
]);

/** Validate the same canonical public handle accepted by account and portfolio APIs. */
export const publicUserSchema = z
  .string()
  .regex(/^[a-z0-9](?:[a-z0-9_-]{1,30}[a-z0-9])$/)
  .refine((value) => !reservedPublicUsers.has(value));
