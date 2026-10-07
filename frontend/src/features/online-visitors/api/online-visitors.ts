import { queryOptions, useQuery } from '@tanstack/react-query';
import { requestJson } from '@/shared/api/http';
import { useDocumentVisible } from '@/shared/hooks/useDocumentVisible';
import { onlineVisitorsSchema } from '../schemas/online-visitors';

// Leave 15 seconds of headroom within the backend's 60-second heartbeat TTL.
const refreshIntervalMs = 45_000;

/** Define the locale-independent live count, using shared validation and cancellation.
 * @returns Query options without backend response caching, keeping each result current.
 */
export function onlineVisitorsQuery() {
  return queryOptions({
    queryKey: ['system', 'heartbeat'] as const,
    queryFn: ({ signal }) => requestJson('system/heartbeat', onlineVisitorsSchema, { signal }),
    staleTime: refreshIntervalMs,
    refetchOnWindowFocus: true,
  });
}

/** Keep the navigation count current while the document is visible.
 * @returns Shared query state retaining the last validated count after a failed refresh.
 * Polling is browser-only and stops while hidden; Query owns timers, cancellation and retries.
 * A 45-second interval also keeps a visible visitor within the backend's 60-second window.
 */
export function useOnlineVisitors() {
  const visible = useDocumentVisible();
  return useQuery({
    ...onlineVisitorsQuery(),
    enabled: typeof window !== 'undefined' && visible,
    refetchInterval: visible ? refreshIntervalMs : false,
    refetchIntervalInBackground: false,
  });
}
