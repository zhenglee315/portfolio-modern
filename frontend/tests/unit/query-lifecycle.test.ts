import { dehydrate, type QueryClient, type QueryKey } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { createQueryClient, withIsolatedQueryClient } from '@/app/query-client';
import { cancelPortfolioQueries } from '@/shared/api/portfolio';
import { siteQuery } from '@/features/site';
import { projectsQuery } from '@/features/projects';

/** Leave reads pending so cancellation is exercised through the real query client. */
function pendingRead(client: QueryClient, queryKey: QueryKey, signals: AbortSignal[]) {
  return client
    .fetchQuery({
      queryKey,
      retry: false,
      queryFn: ({ signal }) => {
        signals.push(signal);
        return new Promise<string>(() => {});
      },
    })
    .catch(() => undefined);
}

describe('temporary query cache lifecycle', () => {
  it('copies concurrent snapshots before releasing their independent caches', async () => {
    const clients: QueryClient[] = [];
    const snapshots = await Promise.all(
      ['alex', 'sam'].map((user) =>
        withIsolatedQueryClient(async (client) => {
          clients.push(client);
          client.setQueryData(['public-owner'], user);
          await Promise.resolve();
          return dehydrate(client);
        }),
      ),
    );
    expect(snapshots.map((snapshot) => snapshot.queries[0]?.state.data)).toEqual(['alex', 'sam']);
    expect(clients.every((client) => client.getQueryCache().getAll().length === 0)).toBe(true);
  });

  it('does not start reads for an already aborted navigation', async () => {
    const controller = new AbortController();
    controller.abort();
    let started = false;
    await expect(
      withIsolatedQueryClient(async () => {
        started = true;
      }, controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(started).toBe(false);
  });

  it('cancels pending work and cannot publish a snapshot after caller cancellation', async () => {
    const controller = new AbortController();
    const signals: AbortSignal[] = [];
    let staged: QueryClient | undefined;
    const result = withIsolatedQueryClient(async (client) => {
      staged = client;
      await pendingRead(client, ['pending-public-owner'], signals);
      return dehydrate(client);
    }, controller.signal);
    expect(signals).toHaveLength(1);
    controller.abort();
    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
    expect(signals[0]?.aborted).toBe(true);
    expect(staged?.getQueryCache().getAll()).toEqual([]);
  });

  it('releases temporary data while preserving the original read failure', async () => {
    const failure = new Error('Public service unavailable');
    let staged: QueryClient | undefined;
    await expect(
      withIsolatedQueryClient(async (client) => {
        staged = client;
        client.setQueryData(['partial-public-owner'], 'alex');
        throw failure;
      }),
    ).rejects.toBe(failure);
    expect(staged?.getQueryCache().getAll()).toEqual([]);
  });
});

describe('public owner query cancellation', () => {
  it('cancels the selected owner lookup and content while retaining another owner and auth reads', async () => {
    const client = createQueryClient();
    const signals: AbortSignal[] = [];
    const keys = [
      siteQuery('en', undefined, { user: 'sam' }).queryKey,
      projectsQuery('en', undefined, 2).queryKey,
      siteQuery('en', undefined, { user: 'alex' }).queryKey,
      projectsQuery('en', undefined, 1).queryKey,
      ['auth', 'session'],
    ];
    const reads = keys.map((key) => pendingRead(client, key, signals));
    try {
      await cancelPortfolioQueries(client, 'en', { user: 'sam' }, 2);
      expect(signals.map((signal) => signal.aborted)).toEqual([true, true, false, false, false]);
      expect(
        keys.slice(2).every((key) => client.getQueryState(key)?.fetchStatus === 'fetching'),
      ).toBe(true);
    } finally {
      client.clear();
      await Promise.all(reads);
    }
  });

  it('does not cancel default content while an explicit owner is unresolved', async () => {
    const client = createQueryClient();
    const signals: AbortSignal[] = [];
    const reads = [
      pendingRead(client, siteQuery('en', undefined, { user: 'sam' }).queryKey, signals),
      pendingRead(client, projectsQuery('en').queryKey, signals),
    ];
    try {
      await cancelPortfolioQueries(client, 'en', { user: 'sam' });
      expect(signals.map((signal) => signal.aborted)).toEqual([true, false]);
    } finally {
      client.clear();
      await Promise.all(reads);
    }
  });
});
