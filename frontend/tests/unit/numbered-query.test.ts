import { dehydrate } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createQueryClient } from '@/app/query-client';
import { fillNumberedPages } from '@/shared/api/numbered-query';
import {
  categoriesQuery,
  prefetchCategoryIndex,
  skillsQuery,
  skillsSchema,
} from '@/features/skills';
import { endpointFixture } from '../fixtures/portfolio';

afterEach(() => vi.unstubAllGlobals());

/** Validate the embedded owner seed through its real numbered contract. */
function ownerSeed(locale = 'en') {
  return skillsSchema.parse(
    endpointFixture(new URL(`https://example.test/portfolio/skills?locale=${locale}&page=1`)),
  );
}

/** Record synthetic API reads without introducing a test-only paging implementation. */
function fixtureFetch(requests: URL[], transform?: (url: URL, result: unknown) => unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn((path: string) => {
      const url = new URL(path, 'https://example.test');
      requests.push(url);
      const result = endpointFixture(url);
      return Promise.resolve(Response.json(transform?.(url, result) ?? result));
    }),
  );
}

describe('validated numbered continuation', () => {
  it('fills only the requested range, reuses cached pages, and completes metadata on demand', async () => {
    const client = createQueryClient();
    const options = skillsQuery('en', 'category-0');
    const requests: URL[] = [];
    fixtureFetch(requests);
    client.setQueryData(options.queryKey, { pages: [ownerSeed()], pageParams: [1] });

    expect((await fillNumberedPages(client, options, 2)).pages).toHaveLength(2);
    expect((await fillNumberedPages(client, options, 2)).pages).toHaveLength(2);
    expect((await fillNumberedPages(client, options)).pages).toHaveLength(3);
    expect(requests.map((url) => url.searchParams.get('page'))).toEqual(['2', '3']);
    expect(requests.every((url) => url.searchParams.get('ownerId') === 'category-0')).toBe(true);
    client.clear();
  });

  it('rejects inconsistent continuation and hydrates only the last validated prefix', async () => {
    const client = createQueryClient();
    const options = skillsQuery('en', 'category-0');
    const requests: URL[] = [];
    const seed = ownerSeed();
    client.setQueryData(options.queryKey, { pages: [seed], pageParams: [1] });
    fixtureFetch(requests, (url, result) => {
      if (url.searchParams.get('page') !== '2') return result;
      const next = skillsSchema.parse(result);
      return { ...next, items: [seed.items[0], ...next.items.slice(1)] };
    });

    await expect(fillNumberedPages(client, options)).rejects.toMatchObject({ kind: 'contract' });
    expect(client.getQueryData(options.queryKey)?.pages).toEqual([seed]);
    expect(client.getQueryState(options.queryKey)?.status).toBe('success');
    expect(dehydrate(client).queries).toHaveLength(1);
    fixtureFetch(requests);
    expect((await fillNumberedPages(client, options)).pages).toHaveLength(3);
    expect(requests.map((url) => url.searchParams.get('page'))).toEqual(['2', '2', '3']);
    client.clear();
  });

  it('honors cache cancellation without accepting an unfinished page', async () => {
    const client = createQueryClient();
    const options = skillsQuery('en', 'category-0');
    const seed = ownerSeed();
    client.setQueryData(options.queryKey, { pages: [seed], pageParams: [1] });
    let requestSignal: AbortSignal | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn((_path: string, options: RequestInit) => {
        requestSignal = options.signal ?? undefined;
        return new Promise<Response>((_resolve, reject) => {
          requestSignal?.addEventListener('abort', () => reject(requestSignal?.reason), {
            once: true,
          });
        });
      }),
    );
    const fill = fillNumberedPages(client, options);
    const rejection = expect(fill).rejects.toBeDefined();
    expect(requestSignal?.aborted).toBe(false);
    await client.cancelQueries({ queryKey: options.queryKey });
    await rejection;
    expect(requestSignal?.aborted).toBe(true);
    expect(client.getQueryData(options.queryKey)?.pages).toEqual([seed]);
    client.clear();
  });
});

describe('static skill category index', () => {
  it('prepares every category while retaining embedded owner page-one previews', async () => {
    const client = createQueryClient();
    const requests: URL[] = [];
    fixtureFetch(requests);
    await prefetchCategoryIndex(client, 'en', 'https://example.test');
    const data = client.getQueryData(categoriesQuery('en').queryKey);
    expect(data?.pages.flatMap((page) => page.items)).toHaveLength(7);
    expect(requests.map((url) => url.searchParams.get('page'))).toEqual(['1', '2']);
    expect(requests.every((url) => url.pathname.endsWith('/skill-categories'))).toBe(true);
    expect(client.getQueriesData({ queryKey: ['portfolio', 'en', 'skills'] })).toHaveLength(0);
    client.clear();
  });

  it('keeps first-page categories serializable when optional continuation is malformed', async () => {
    const client = createQueryClient();
    const requests: URL[] = [];
    fixtureFetch(requests, (url, result) =>
      url.searchParams.get('page') === '2' ? { items: [] } : result,
    );
    await expect(prefetchCategoryIndex(client, 'en')).resolves.toBeUndefined();
    const options = categoriesQuery('en');
    expect(client.getQueryData(options.queryKey)?.pages.flatMap((page) => page.items)).toHaveLength(
      6,
    );
    expect(client.getQueryState(options.queryKey)?.status).toBe('success');
    expect(dehydrate(client).queries).toHaveLength(1);
    client.clear();
  });

  it('leaves an unavailable first page optional rather than failing the loader', async () => {
    const client = createQueryClient();
    const requests: URL[] = [];
    fixtureFetch(requests, () => ({ items: [] }));
    await expect(prefetchCategoryIndex(client, 'en')).resolves.toBeUndefined();
    expect(client.getQueryData(categoriesQuery('en').queryKey)).toBeUndefined();
    expect(dehydrate(client).queries).toHaveLength(0);
    client.clear();
  });
});
