import {
  infiniteQueryOptions,
  InfiniteQueryObserver,
  type QueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import type { z } from 'zod';
import { ApiError, requestJson } from './http';
import {
  portfolioKey,
  portfolioContentParams,
  portfolioTransport,
  type PortfolioAccess,
} from './portfolio';
import { pageSize, type NumberedPage } from '@/shared/schemas/records';

/** Reject inconsistent append results while retaining the last validated collection. */
export function assertPageAppend<T extends { id: string | number }>(
  previous: NumberedPage<T>[],
  next: NumberedPage<T>,
  requestedPage: number,
) {
  if (
    next.page !== requestedPage ||
    previous.some(
      (page) => page.total !== next.total || page.pages !== next.pages || page.size !== next.size,
    )
  )
    throw new ApiError('contract');
  const ids = new Set(previous.flatMap((page) => page.items.map((item) => item.id)));
  if (next.items.some((item) => ids.has(item.id))) throw new ApiError('contract');
}

/** Create the only continuation policy used by all four paginated endpoints.
 * @param resource Domain endpoint suffix; keys include public Site, locale and optional owner.
 * @param locale Language identifier, passed explicitly by each domain API module.
 * @param schema Specialized common page schema.
 * @param options Server-only origin, resolved Site, category owner and domain validation.
 */
export function numberedQuery<T extends { id: string | number }>(
  resource: string,
  locale: string,
  schema: z.ZodType<NumberedPage<T>>,
  options: {
    baseUrl?: string;
    siteId?: number;
    ownerId?: string;
    access?: PortfolioAccess;
    validate?: (value: NumberedPage<T>, client: QueryClient, previous: NumberedPage<T>[]) => void;
  } = {},
) {
  const queryKey = [
    ...portfolioKey(locale, { site_id: options.siteId }, options.access),
    resource,
    options.ownerId ?? '',
    pageSize,
    options.ownerId ? 'category' : '',
  ] as const;
  const transport = portfolioTransport(options.access);
  return infiniteQueryOptions({
    queryKey,
    meta: options.access === 'preview' ? { private: true } : undefined,
    initialPageParam: 1,
    queryFn: async ({ pageParam, signal, client }) => {
      const params = portfolioContentParams(locale, options.siteId);
      params.set('page', String(pageParam));
      params.set('size', String(pageSize));
      if (options.ownerId) {
        params.set('ownerType', 'category');
        params.set('ownerId', options.ownerId);
      }
      const result = await requestJson(`${transport.prefix}/${resource}?${params}`, schema, {
        signal,
        baseUrl: options.baseUrl,
        credentials: transport.credentials,
        cache: transport.cache,
      });
      const cached = client.getQueryData<InfiniteData<NumberedPage<T>>>(queryKey);
      const previous = cached?.pages.filter((page) => page.page < pageParam) ?? [];
      assertPageAppend(previous, result, pageParam);
      options.validate?.(result, client, previous);
      return result;
    },
    getNextPageParam: (lastPage) =>
      lastPage.page < lastPage.pages ? lastPage.page + 1 : undefined,
  });
}

/** Continue a validated cache without repeating its first-page read.
 * @param client Cache owning the previously validated prefix and query cancellation.
 * @param options Existing domain query; its append and label validators remain authoritative.
 * @param targetPages Required cached range; omitted to complete the declared collection.
 * @returns The validated prefix through the requested range, bounded by page metadata.
 * @throws The original read/contract error while retaining a serializable valid prefix.
 */
export async function fillNumberedPages<T extends { id: string | number }>(
  client: QueryClient,
  options: ReturnType<typeof numberedQuery<T>>,
  targetPages?: number,
): Promise<InfiniteData<NumberedPage<T>, number>> {
  const initial = client.getQueryData<InfiniteData<NumberedPage<T>, number>>(options.queryKey);
  const first = initial?.pages[0];
  if (
    !initial ||
    !first ||
    (targetPages !== undefined && (!Number.isSafeInteger(targetPages) || targetPages < 1))
  )
    throw new ApiError('contract');
  initial.pages.forEach((page, index) =>
    assertPageAppend(initial.pages.slice(0, index), page, index + 1),
  );
  const target = Math.min(targetPages ?? Math.max(first.pages, 1), Math.max(first.pages, 1));
  const observer = new InfiniteQueryObserver(client, options);
  try {
    let result = initial;
    while (result.pages.length < target) {
      await observer.fetchNextPage({ throwOnError: true });
      const next = client.getQueryData<InfiniteData<NumberedPage<T>, number>>(options.queryKey);
      if (!next || next.pages.length <= result.pages.length) throw new ApiError('contract');
      result = next;
    }
    return result;
  } catch (error) {
    // Failed continuation still owns useful data; publish that validated prefix for hydration.
    const prefix = client.getQueryData<InfiniteData<NumberedPage<T>, number>>(options.queryKey);
    if (prefix) client.setQueryData(options.queryKey, prefix);
    throw error;
  } finally {
    observer.destroy();
  }
}

/** Derive visible records; the query cache remains their single source of truth. */
export function pageRecords<T>(data: InfiniteData<NumberedPage<T>> | undefined): T[] {
  return data?.pages.flatMap((page) => page.items) ?? [];
}
