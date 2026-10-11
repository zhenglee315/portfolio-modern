import { requestJson } from '@/shared/api/http';
import {
  authCodeSchema,
  authEmailAvailabilitySchema,
  authEmailVerifiedSchema,
  authSignOutSchema,
  authUserSchema,
} from '../schemas/auth';

const sessionOptions = { credentials: 'include', cache: 'no-store' } as const;

/** Authenticate once without caching/retrying credentials or persisting them in browser storage. */
export function signIn(credentials: { email: string; password: string }, signal?: AbortSignal) {
  return requestJson('authority/sign-in', authUserSchema, {
    ...sessionOptions,
    signal,
    method: 'POST',
    json: credentials,
  });
}

/** Destroy only the current server session; credentials and identity are not sent again. */
export function signOut(signal?: AbortSignal) {
  return requestJson('authority/sign-out', authSignOutSchema, {
    ...sessionOptions,
    signal,
    method: 'POST',
  });
}

/** Keep email spelling intact so availability agrees with the database's unique constraint. */
export function checkRegistrationEmail(email: string, signal?: AbortSignal) {
  return requestJson(
    `authority/register?${new URLSearchParams({ email }).toString()}`,
    authEmailAvailabilitySchema,
    { ...sessionOptions, signal },
  );
}

/** Start the server's expiring verification challenge using the same session as registration. */
export function sendRegistrationCode(fields: { email: string }, signal?: AbortSignal) {
  return requestJson('authority/confirm-email', authCodeSchema, {
    ...sessionOptions,
    signal,
    method: 'POST',
    json: fields,
  });
}

/** Only the server can accept a code and issue registration proof. */
export function verifyRegistrationEmail(
  fields: { email: string; code: string },
  signal?: AbortSignal,
) {
  return requestJson('authority/verify-email', authEmailVerifiedSchema, {
    ...sessionOptions,
    signal,
    method: 'POST',
    json: fields,
  });
}

/** Registration permissions come from the server's active default role. */
export function register(fields: { email: string; password: string }, signal?: AbortSignal) {
  return requestJson('authority/register', authUserSchema, {
    ...sessionOptions,
    signal,
    method: 'POST',
    json: fields,
  });
}
