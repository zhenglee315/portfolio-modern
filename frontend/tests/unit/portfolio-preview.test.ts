import { it, expect, vi, afterEach } from 'vitest';
import { QueryClient, dehydrate } from '@tanstack/react-query';
import { siteQuery } from '@/features/site';
import { projectsQuery } from '@/features/projects';
import { categoriesQuery, skillsQuery } from '@/features/skills/api/skills';
import { cancelPortfolioQueries, portfolioKey } from '@/shared/api/portfolio';
import { siteFixture, pageFixture } from '../unit-fixtures/portfolio';
import { createQueryClient } from '@/app/query-client';
afterEach(() => vi.unstubAllGlobals());
it('preview transport includes credentials and cannot share or dehydrate public data', async () => {
  const fetch = vi.fn(async () => new Response(JSON.stringify({ ...siteFixture, site_id: 114 })));
  vi.stubGlobal('fetch', fetch);
  const client = createQueryClient();
  const query = siteQuery('en', undefined, { site_id: 114 }, 'preview');
  await client.fetchQuery(query);
  expect(fetch.mock.calls[0][0]).toContain('/api/management/preview/site?locale=en&site_id=114');
  expect(fetch.mock.calls[0][1]).toMatchObject({ credentials: 'include', cache: 'no-store' });
  expect(query.queryKey).toEqual(['portfolio-preview', 'site:114', 'en', 'site']);
  expect(query.meta).toEqual({ private: true });
  expect(dehydrate(client).queries).toHaveLength(0);
  expect(
    client.getQueryData(siteQuery('en', undefined, { site_id: 114 }).queryKey),
  ).toBeUndefined();
  client.clear();
});
it('preview pagination and skill owner keys retain the same private scope', async () => {
  const fetch = vi.fn(async () => new Response(JSON.stringify(pageFixture([], 1))));
  vi.stubGlobal('fetch', fetch);
  const client = new QueryClient();
  for (const query of [
    projectsQuery('en', undefined, 114, 'preview'),
    categoriesQuery('en', undefined, 114, 'preview'),
    skillsQuery('en', 'example', undefined, 114, 'preview'),
  ]) {
    await client.fetchInfiniteQuery(query);
    expect(query.queryKey[0]).toBe('portfolio-preview');
  }
  expect(
    fetch.mock.calls.every(
      ([url, opts]) =>
        String(url).includes('site_id=114') &&
        opts.credentials === 'include' &&
        opts.cache === 'no-store',
    ),
  ).toBe(true);
  client.clear();
});
it('closing preview cancels only its mode, owner and locale', async () => {
  const client = new QueryClient();
  const cancel = vi.spyOn(client, 'cancelQueries').mockResolvedValue();
  await cancelPortfolioQueries(client, 'en', { site_id: 114 }, 114, 'preview');
  expect(cancel.mock.calls.every(([q]) => q.queryKey[0] === 'portfolio-preview')).toBe(true);
  expect(portfolioKey('en', { site_id: 114 })).toEqual(['portfolio', 'site:114', 'en']);
  client.clear();
});
