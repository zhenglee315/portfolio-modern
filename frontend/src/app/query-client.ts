import { defaultShouldDehydrateQuery, QueryClient } from '@tanstack/react-query';
import { retryRead } from '@/shared/api/http';

let browserClient: QueryClient | undefined;

/** Allocate per-render server clients and one browser cache across locale navigation. */
export function getQueryClient() {
  if (typeof window === 'undefined') return createQueryClient();
  browserClient ??= createQueryClient();
  return browserClient;
}

/** Build isolated caches for server rendering and atomic locale preparation. */
export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      // Browser session identity stays out of server and locale-preparation snapshots.
      dehydrate: {
        shouldDehydrateQuery: (query) =>
          query.meta?.private !== true && defaultShouldDehydrateQuery(query),
      },
      queries: {
        staleTime: 60_000,
        gcTime: typeof window === 'undefined' ? Infinity : 5 * 60_000,
        retry: retryRead,
        retryDelay: 400,
        refetchOnWindowFocus: false,
      },
    },
  });
}

/** Own one temporary cache for request rendering or atomic locale preparation.
 * @param work Reads and validates data, then copies the result before the cache is released.
 * @param signal Caller cancellation; aborted work cannot return a completed snapshot.
 * @returns The callback result without retaining its query data or abort subscriptions.
 * @throws The callback failure, or caller cancellation when its signal has been aborted.
 */
export async function withIsolatedQueryClient<T>(
  work: (client: QueryClient) => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  signal?.throwIfAborted();
  const client = createQueryClient();
  const cancel = () => void client.cancelQueries();
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    const result = await work(client);
    signal?.throwIfAborted();
    return result;
  } catch (error) {
    signal?.throwIfAborted();
    throw error;
  } finally {
    signal?.removeEventListener('abort', cancel);
    client.clear();
  }
}

/** Bound inactive public identity caches while keeping current account and site reads intact.
 * Six selector/content identities retain at most three recently visited named portfolios.
 */
export function trimPortfolioCache(client: QueryClient, active: string[]) {
  const queries = client.getQueryCache().findAll({ queryKey: ['portfolio'] });
  const identities = new Map<string, number>();
  const observed = new Set(active);
  for (const query of queries) {
    const identity = query.queryKey[1];
    if (typeof identity !== 'string') continue;
    identities.set(identity, Math.max(identities.get(identity) ?? 0, query.state.dataUpdatedAt));
    if (query.getObserversCount()) observed.add(identity);
  }
  const inactive = [...identities].filter(([identity]) => !observed.has(identity));
  inactive.sort((a, b) => b[1] - a[1]);
  for (const [identity] of inactive.slice(Math.max(0, 6 - observed.size)))
    client.removeQueries({ queryKey: ['portfolio', identity] });
}
