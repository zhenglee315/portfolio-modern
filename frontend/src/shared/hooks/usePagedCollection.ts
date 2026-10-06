import {
  useQueryClient,
  type InfiniteData,
  type QueryKey,
  type UseInfiniteQueryResult,
} from '@tanstack/react-query';
import { ApiError } from '@/shared/api/http';
import { pageRecords } from '@/shared/api/numbered-query';
import type { NumberedPage } from '@/shared/schemas/records';

/** Share cache-preserving collection feedback and first-page contract recovery.
 * @param query Domain-owned infinite query subscription.
 * @param queryKey Exact locale/owner identity, used only for explicit reset.
 */
export function usePagedCollection<T>(
  query: UseInfiniteQueryResult<InfiniteData<NumberedPage<T>>, Error>,
  queryKey: QueryKey,
  locked = false,
) {
  const client = useQueryClient();
  const total = query.data?.pages[0]?.total ?? 0;
  const invalid = query.error instanceof ApiError && query.error.kind === 'contract';
  return {
    records: pageRecords(query.data),
    total,
    invalid,
    status: {
      pending: query.isPending,
      failed: query.isError && (!query.isFetchNextPageError || invalid),
      hasData: !!query.data,
      empty: !!query.data && !total,
      fetching: query.isFetching,
      onRetry: () => {
        if (invalid) void client.resetQueries({ queryKey, exact: true });
        else void query.refetch();
      },
    },
    onLoadMore: () => {
      // Automatic layout/category requests and clicks share one in-flight continuation.
      if (!locked && !query.isFetching) void query.fetchNextPage({ cancelRefetch: false });
    },
  };
}
