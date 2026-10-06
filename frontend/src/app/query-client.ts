import { QueryClient } from '@tanstack/react-query';
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
      queries: {
        staleTime: 60_000,
        gcTime: 30 * 60_000,
        retry: retryRead,
        retryDelay: 400,
        refetchOnWindowFocus: false,
      },
    },
  });
}
