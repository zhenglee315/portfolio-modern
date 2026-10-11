import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { useRef, useSyncExternalStore } from 'react';
import { requestJson } from '@/shared/api/http';
import { sessionSchema, type AuthSession, type AuthUser } from './schemas/auth';
import { signOut } from './api/auth';

export { sessionSchema } from './schemas/auth';
export { authFailure } from './lib/auth-failure';
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

// React owns the server-to-browser snapshot transition; no private identity enters SSR.
const subscribeToHydration = () => () => {};

/** Restore only after mount so SSR and its first hydration render contain public identity only. */
export function useAuthSession({ enabled = true }: { enabled?: boolean } = {}) {
  const mounted = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false,
  );
  const query = useQuery({ ...authSessionQuery(), enabled: mounted && enabled });
  return { ...query, data: mounted ? query.data : undefined };
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
  signal.throwIfAborted();
  storeAuthSession(client, user);
}

/** Forget only account identity after server logout; public content remains available. */
export async function forgetAuthSession(client: QueryClient): Promise<void> {
  await client.cancelQueries({ queryKey: authSessionKey, exact: true });
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
