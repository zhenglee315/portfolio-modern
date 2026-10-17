import { act, render, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createQueryClient, trimPortfolioCache } from '@/app/query-client';
import { createI18n } from '@/i18n/config';
import { siteQuery } from '@/features/site';
import { journeyQuery } from '@/features/journey';
import { categoriesQuery, skillsQuery } from '@/features/skills';
import { experiencesQuery, ExperiencesSection } from '@/features/experiences';
import { useExperiences } from '@/features/experiences/api/experiences';
import { projectsQuery } from '@/features/projects';
import { PortfolioProvider } from '@/shared/context/portfolio';
import { fillNumberedPages } from '@/shared/api/numbered-query';
import { useSectionDemand } from '@/shared/hooks/useSectionDemand';
import { publicUserSchema } from '@/shared/schemas/portfolio';
import { captureLocaleScope, prepareLocale } from '@/pages/portfolio/model/locale';
import { endpointFixture } from '../unit-fixtures/portfolio';

const clients = new Set<QueryClient>();
afterEach(() => {
  clients.forEach((client) => client.clear());
  clients.clear();
  vi.unstubAllGlobals();
});

function testClient() {
  const client = createQueryClient();
  clients.add(client);
  return client;
}

function fixtureTransport(requests: URL[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn((path: string) => {
      const url = new URL(path, 'https://example.test');
      requests.push(url);
      const value = endpointFixture(url);
      return Promise.resolve(
        Response.json(value ?? { detail: 'NOT_FOUND' }, { status: value ? 200 : 404 }),
      );
    }),
  );
}

describe('public portfolio ownership', () => {
  it('looks up a user only through Site and pins every content read and continuation to its ID', async () => {
    const client = testClient();
    const requests: URL[] = [];
    fixtureTransport(requests);
    const site = await client.fetchQuery(siteQuery('en', undefined, { user: 'sam' }));
    await Promise.all([
      client.fetchQuery(journeyQuery('en', undefined, site.site_id)),
      client.fetchInfiniteQuery(experiencesQuery('en', undefined, site.site_id)),
      client.fetchInfiniteQuery(projectsQuery('en', undefined, site.site_id)),
      client.fetchInfiniteQuery(categoriesQuery('en', undefined, site.site_id)),
    ]);
    await client.fetchInfiniteQuery(skillsQuery('en', 'category-0', undefined, site.site_id));
    await Promise.all([
      fillNumberedPages(client, projectsQuery('en', undefined, site.site_id), 2),
      fillNumberedPages(client, skillsQuery('en', 'category-0', undefined, site.site_id), 2),
    ]);
    expect(requests[0]?.pathname).toBe('/api/portfolio/site');
    expect(requests[0]?.searchParams.get('user')).toBe('sam');
    expect(requests[0]?.searchParams.has('site_id')).toBe(false);
    const contentRequests = requests.slice(1);
    expect(new Set(contentRequests.map((url) => url.pathname))).toEqual(
      new Set([
        '/api/portfolio/journey',
        '/api/portfolio/experiences',
        '/api/portfolio/projects',
        '/api/portfolio/skill-categories',
        '/api/portfolio/skills',
      ]),
    );
    expect(
      contentRequests.every(
        (url) => url.searchParams.get('site_id') === '2' && !url.searchParams.has('user'),
      ),
    ).toBe(true);
    expect(contentRequests.filter((url) => url.searchParams.get('page') === '2')).toHaveLength(2);
  });

  it('keeps shared skill IDs and labels isolated during A → B → A cache reuse', async () => {
    const client = testClient();
    const requests: URL[] = [];
    fixtureTransport(requests);
    const alex = await client.fetchQuery(siteQuery('en', undefined, { user: 'alex' }));
    const sam = await client.fetchQuery(siteQuery('en', undefined, { user: 'sam' }));
    const first = await client.fetchInfiniteQuery(categoriesQuery('en', undefined, alex.site_id));
    const second = await client.fetchInfiniteQuery(categoriesQuery('en', undefined, sam.site_id));
    await client.fetchInfiniteQuery(skillsQuery('en', 'category-0', undefined, alex.site_id));
    await client.fetchInfiniteQuery(skillsQuery('en', 'category-0', undefined, sam.site_id));
    expect(first.pages[0]?.items[0]?.id).toBe(second.pages[0]?.items[0]?.id);
    expect(second.pages[0]?.items[0]?.skills.items[0]?.label).toContain('sam');
    const beforeReturn = requests.length;
    const restored = await client.ensureInfiniteQueryData(
      categoriesQuery('en', undefined, alex.site_id),
    );
    expect(restored.pages[0]?.items[0]?.skills.items[0]?.label).toBe('en Skill 1');
    expect(requests).toHaveLength(beforeReturn);
    expect(
      requests
        .filter((url) => !url.pathname.endsWith('/site'))
        .every((url) => ['1', '2'].includes(url.searchParams.get('site_id') ?? '')),
    ).toBe(true);
  });

  it('never uses a default profile for an explicit missing owner', async () => {
    const client = testClient();
    const requests: URL[] = [];
    fixtureTransport(requests);
    await client.fetchQuery(siteQuery('en'));
    await expect(
      client.fetchQuery(siteQuery('en', undefined, { user: 'missing' })),
    ).rejects.toMatchObject({ status: 404 });
    expect(requests.map((url) => url.searchParams.get('user'))).toEqual([null, 'missing']);
    expect(client.getQueryData(siteQuery('en').queryKey)?.user).toBe('alex');
  });

  it('rejects a response belonging to another owner before seeding any section', async () => {
    const client = testClient();
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          Response.json(endpointFixture(new URL('https://example.test/portfolio/site?user=alex'))),
        ),
      ),
    );
    await expect(
      client.fetchQuery(siteQuery('en', undefined, { user: 'sam' })),
    ).rejects.toMatchObject({ kind: 'contract' });
    expect(
      client.getQueryData(siteQuery('en', undefined, { user: 'sam' }).queryKey),
    ).toBeUndefined();
  });

  it('stages only the selected site and loaded ranges when switching language', async () => {
    const client = testClient();
    const requests: URL[] = [];
    fixtureTransport(requests);
    await client.fetchQuery(siteQuery('en', undefined, { user: 'alex' }));
    await client.fetchInfiniteQuery(projectsQuery('en', undefined, 1));
    await client.fetchInfiniteQuery(projectsQuery('en', undefined, 2));
    await client.fetchInfiniteQuery(categoriesQuery('en', undefined, 1));
    await client.fetchInfiniteQuery(skillsQuery('en', 'category-0', undefined, 1));
    requests.length = 0;
    const snapshot = await prepareLocale(
      captureLocaleScope(client, 'en', { user: 'alex' }),
      'zh-Hant',
      new AbortController().signal,
    );
    expect(
      snapshot.queries.every((query) =>
        ['user:alex', 'site:1'].includes(String(query.queryKey[1])),
      ),
    ).toBe(true);
    expect(
      requests
        .filter((url) => !url.pathname.endsWith('/site'))
        .every((url) => url.searchParams.get('site_id') === '1' && !url.searchParams.has('user')),
    ).toBe(true);
    expect(requests.find((url) => url.pathname.endsWith('/site'))?.searchParams.get('user')).toBe(
      'alex',
    );
  });

  it('does not translate cached default content while a named Site is unresolved', async () => {
    const client = testClient();
    const requests: URL[] = [];
    fixtureTransport(requests);
    await client.fetchInfiniteQuery(projectsQuery('en'));
    await client.fetchInfiniteQuery(categoriesQuery('en'));
    await client.fetchInfiniteQuery(skillsQuery('en', 'category-0'));
    requests.length = 0;
    const scope = captureLocaleScope(client, 'en', { user: 'sam' });
    expect(scope.siteId).toBeUndefined();
    const snapshot = await prepareLocale(scope, 'zh-Hant', new AbortController().signal);
    expect(requests).toEqual([]);
    expect(snapshot.queries).toEqual([]);
  });

  it('limits retained public identities without deleting private session state', () => {
    const client = testClient();
    for (let id = 1; id <= 10; id++)
      client.setQueryData(projectsQuery('en', undefined, id).queryKey, {
        pages: [],
        pageParams: [],
      });
    client.setQueryData(['auth', 'session'], { email: 'private@example.com' });
    trimPortfolioCache(client, ['site:10']);
    expect(client.getQueryCache().findAll({ queryKey: ['portfolio'] })).toHaveLength(6);
    expect(client.getQueryData(projectsQuery('en', undefined, 10).queryKey)).toBeDefined();
    expect(client.getQueryData(['auth', 'session'])).toEqual({ email: 'private@example.com' });
  });

  it.each(['Admin', 'admin', 'a', 'alice.', '_alice', 'alice-', 'alice@example.com'])(
    'rejects invalid or reserved public route %s',
    (user) => {
      expect(publicUserSchema.safeParse(user).success).toBe(false);
    },
  );
});

describe('section demand reads', () => {
  it('waits for a coordinated owner identity instead of fetching default content', async () => {
    const client = testClient();
    const requests: URL[] = [];
    fixtureTransport(requests);
    let resolved = false;
    const view = renderHook(() => useExperiences('en'), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>
          <PortfolioProvider
            selector={{ user: 'sam' }}
            site={resolved ? { site_id: 2, user: 'sam' } : undefined}
          >
            {children}
          </PortfolioProvider>
        </QueryClientProvider>
      ),
    });
    expect(requests).toHaveLength(0);
    resolved = true;
    view.rerender();
    await waitFor(() => expect(view.result.current.isSuccess).toBe(true));
    expect(requests).toHaveLength(1);
    expect(requests[0]?.searchParams.get('site_id')).toBe('2');
  });

  it('waits for viewport demand and rebinds the section when switching owners', async () => {
    const client = testClient();
    const requests: URL[] = [];
    fixtureTransport(requests);
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe = vi.fn();
        disconnect = vi.fn();
      },
    );
    const observations: {
      callback: IntersectionObserverCallback;
      disconnect: ReturnType<typeof vi.fn>;
    }[] = [];
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        disconnect = vi.fn();
        observe = vi.fn();
        constructor(callback: IntersectionObserverCallback) {
          observations.push({ callback, disconnect: this.disconnect });
        }
      },
    );
    function DemandSection({ siteId }: { siteId: number }) {
      const enabled = useSectionDemand('experience', `${siteId}:en`);
      return (
        <PortfolioProvider
          selector={{ user: siteId === 1 ? 'alex' : 'sam' }}
          site={{ site_id: siteId, user: siteId === 1 ? 'alex' : 'sam' }}
        >
          <section id="experience">
            <ExperiencesSection locale="en" enabled={enabled} />
          </section>
        </PortfolioProvider>
      );
    }
    const wrapper = ({ siteId }: { siteId: number }) => (
      <QueryClientProvider client={client}>
        <I18nextProvider i18n={createI18n('en')}>
          <DemandSection siteId={siteId} />
        </I18nextProvider>
      </QueryClientProvider>
    );
    const view = render(wrapper({ siteId: 1 }));
    expect(requests).toHaveLength(0);
    act(() =>
      observations[0]?.callback(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      ),
    );
    await waitFor(() =>
      expect(
        client.getQueryData(experiencesQuery('en', undefined, 1).queryKey)?.pages,
      ).toHaveLength(1),
    );
    view.rerender(wrapper({ siteId: 2 }));
    expect(observations[0]?.disconnect).toHaveBeenCalledOnce();
    expect(requests).toHaveLength(1);
    act(() =>
      observations[1]?.callback(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      ),
    );
    await waitFor(() =>
      expect(
        client.getQueryData(experiencesQuery('en', undefined, 2).queryKey)?.pages,
      ).toHaveLength(1),
    );
    expect(requests.map((url) => url.searchParams.get('site_id'))).toEqual(['1', '2']);
    expect(requests.every((url) => url.searchParams.get('page') === '1')).toBe(true);
  });
});
