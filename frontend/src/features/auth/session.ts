import { requestJson } from '@/shared/api/http';
import { useHydrated } from '@/shared/hooks/useHydrated';
import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type QueryFilters,
} from '@tanstack/react-query';
import { useRef } from 'react';
import { signOut } from './api/auth';
import { sessionSchema, type AuthSession, type AuthUser } from './schemas/auth';

export { authFailure } from './lib/auth-failure';
export { sessionSchema } from './schemas/auth';
export type { AuthSession, AuthUser } from './schemas/auth';

/** One browser identity follows its HTTP-only cookie across public-page locale changes. */
export const authSessionKey = ['auth', 'session'] as const;

/** Read current server-session identity without caching it in HTTP or browser storage. */
export function getSession(signal?: AbortSignal) {
  return requestJson('authority/session', sessionSchema, {
    signal,
    credentials: 'include',
    cache: 'no-store',
  });
}

/** Private query data is excluded from hydration snapshots by the application QueryClient. */
export function authSessionQuery() {
  return queryOptions({
    queryKey: authSessionKey,
    queryFn: ({ signal }) => getSession(signal),
    meta: { private: true },
    retry: false,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
}

/** Restore only after mount so SSR and its first hydration render contain public identity only. */
export function useAuthSession({ enabled = true }: { enabled?: boolean } = {}) {
  const mounted = useHydrated();
  const query = useQuery({ ...authSessionQuery(), enabled: mounted && enabled });
  return { ...query, data: mounted ? query.data : undefined };
}

/** Recheck entry permission with the current cookie, bypassing the ordinary identity cache.
 * The shared query owns cancellation during sign-in/out; route cancellation also stops this read.
 * A changed identity or permission set discards private records before the caller can mount them.
 */
export async function refreshAuthSession(client: QueryClient, signal: AbortSignal) {
  signal.throwIfAborted();
  await client.cancelQueries({ queryKey: authSessionKey, exact: true });
  signal.throwIfAborted();
  const previous = client.getQueryData<AuthSession>(authSessionKey);
  let lookupSignal: AbortSignal | undefined;
  const identity = await client.fetchQuery({
    ...authSessionQuery(),
    staleTime: 0,
    networkMode: 'always',
    queryFn: async ({ signal: querySignal }) => {
      const currentSignal = AbortSignal.any([signal, querySignal]);
      lookupSignal = currentSignal;
      const current = await getSession(currentSignal);
      currentSignal.throwIfAborted();
      return current;
    },
  });
  // Silent query cancellation may resolve to cached data; it must never authorize this entry.
  lookupSignal?.throwIfAborted();
  signal.throwIfAborted();
  if (
    !identity ||
    previous?.id !== identity.id ||
    previous?.role !== identity.role ||
    previous?.is_create !== identity.is_create ||
    previous?.is_read !== identity.is_read ||
    previous?.is_update !== identity.is_update ||
    previous?.is_delete !== identity.is_delete ||
    previous?.is_manage_sites !== identity.is_manage_sites ||
    previous?.is_manage_users !== identity.is_manage_users ||
    previous?.is_manage_roles !== identity.is_manage_roles
  ) {
    await forgetPrivateResources(client);
  }
  signal.throwIfAborted();
  return identity;
}

/** Mark all account snapshots private, including identities established before a reader mounts. */
function storeAuthSession(client: QueryClient, identity: AuthSession): void {
  client.setQueryDefaults(authSessionKey, { meta: { private: true } });
  const existing = client.getQueryCache().find({ queryKey: authSessionKey, exact: true });
  existing?.setOptions({ ...existing.options, meta: { ...existing.options.meta, private: true } });
  client.setQueryData<AuthSession>(authSessionKey, identity);
}

/** Commit the real success DTO after canceling restoration so an old guest response cannot win. */
export async function rememberAuthSession(
  client: QueryClient,
  user: AuthUser,
  signal: AbortSignal,
): Promise<void> {
  signal.throwIfAborted();
  await client.cancelQueries({ queryKey: authSessionKey, exact: true });
  await forgetPrivateResources(client);
  signal.throwIfAborted();
  storeAuthSession(client, user);
}

/** Cancel and discard private resource snapshots before replacing browser identity. */
async function forgetPrivateResources(client: QueryClient): Promise<void> {
  const filters: QueryFilters = {
    predicate: (query) => query.meta?.private === true && query.queryKey[0] !== 'auth',
  };
  await client.cancelQueries(filters);
  client.removeQueries(filters);
}

/** Forget account identity and private reads after server logout; public content remains available. */
export async function forgetAuthSession(client: QueryClient): Promise<void> {
  await client.cancelQueries({ queryKey: authSessionKey, exact: true });
  await forgetPrivateResources(client);
  storeAuthSession(client, null);
}

/** Share one logout mutation across responsive entries; failed requests preserve identity. */
export function useAuthSignOut() {
  const client = useQueryClient();
  const pendingRequest = useRef<Promise<void> | null>(null);
  return useMutation({
    retry: false,
    mutationFn: async () => {
      if (pendingRequest.current) return pendingRequest.current;
      const request = (async () => {
        await client.cancelQueries({ queryKey: authSessionKey, exact: true });
        await signOut();
        await forgetAuthSession(client);
      })();
      pendingRequest.current = request;
      try {
        await request;
      } finally {
        pendingRequest.current = null;
      }
    },
  });
}
