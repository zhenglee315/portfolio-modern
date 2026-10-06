import { afterEach, describe, expect, it, vi } from 'vitest';
import { hydrate } from '@tanstack/react-query';
import { createQueryClient } from '@/app/query-client';
import { captureLocaleScope, prepareLocale } from '@/pages/portfolio/model/locale';
import { projectsQuery } from '@/features/projects';
import { categoriesQuery, skillsQuery, assertSkillLabels } from '@/features/skills';
import { messages } from '@/i18n/config';
import { endpointFixture } from '../fixtures/portfolio';

afterEach(() => vi.unstubAllGlobals());
describe('atomic locale preparation', () => {
  it('replays only loaded project/owner pages and never refetches seeded owner page one', async () => {
    const source = createQueryClient();
    const requests: URL[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((path: string) => {
        const url = new URL(path, 'https://example.test');
        requests.push(url);
        return Promise.resolve(Response.json(endpointFixture(url)));
      }),
    );
    const projectPages = [1, 2].map((page) =>
      endpointFixture(new URL(`https://example.test/portfolio/projects?locale=en&page=${page}`)),
    );
    const categories = endpointFixture(
      new URL('https://example.test/portfolio/skill-categories?locale=en'),
    );
    const skills = [1, 2].map((page) =>
      endpointFixture(new URL(`https://example.test/portfolio/skills?locale=en&page=${page}`)),
    );
    // Fixtures cross the same production schemas before entering the synthetic source cache.
    source.setQueryData(projectsQuery('en').queryKey, {
      pages: projectPages.map((page) => projectsPage(page)),
      pageParams: [1, 2],
    });
    source.setQueryData(categoriesQuery('en').queryKey, {
      pages: [categoryPage(categories)],
      pageParams: [1],
    });
    source.setQueryData(skillsQuery('en', 'category-0').queryKey, {
      pages: skills.map((page) => skillsPage(page)),
      pageParams: [1, 2],
    });
    const prepared = await prepareLocale(
      captureLocaleScope(source, 'en'),
      'zh-Hant',
      new AbortController().signal,
    );
    expect(source.getQueryData(projectsQuery('zh-Hant').queryKey)).toBeUndefined();
    hydrate(source, prepared);
    expect(
      source.getQueryData(projectsQuery('zh-Hant').queryKey)?.pages.flatMap((page) => page.items),
    ).toHaveLength(12);
    expect(
      requests
        .filter((url) => url.pathname.endsWith('/skills'))
        .map((url) => url.searchParams.get('page')),
    ).toEqual(['2']);
    expect(
      source.getQueryData(skillsQuery('zh-Hant', 'category-0').queryKey)?.pages[1]?.items[0]?.label,
    ).toContain('zh-Hant');
    source.clear();
  });
  it('fails before cache commit when translated identities are inconsistent', async () => {
    const source = createQueryClient();
    const original = projectsPage(
      endpointFixture(new URL('https://example.test/portfolio/projects?locale=en')),
    );
    source.setQueryData(projectsQuery('en').queryKey, { pages: [original], pageParams: [1] });
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          Response.json({
            ...original,
            items: original.items.map((item) => ({ ...item, id: item.id + 100 })),
          }),
        ),
      ),
    );
    await expect(
      prepareLocale(captureLocaleScope(source, 'en'), 'zh-Hans', new AbortController().signal),
    ).rejects.toMatchObject({ kind: 'contract' });
    expect(source.getQueryData(projectsQuery('zh-Hans').queryKey)).toBeUndefined();
    expect(source.getQueryData(projectsQuery('en').queryKey)?.pages[0]).toEqual(original);
    source.clear();
  });
  it('preserves the full category index during a locale transaction without fetching owner pages', async () => {
    const source = createQueryClient();
    const categories = [1, 2].map((page) =>
      categoryPage(
        endpointFixture(
          new URL(`https://example.test/portfolio/skill-categories?locale=en&page=${page}`),
        ),
      ),
    );
    source.setQueryData(categoriesQuery('en').queryKey, {
      pages: categories,
      pageParams: [1, 2],
    });
    const requests: URL[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((path: string) => {
        const url = new URL(path, 'https://example.test');
        requests.push(url);
        return Promise.resolve(Response.json(endpointFixture(url)));
      }),
    );
    const prepared = await prepareLocale(
      captureLocaleScope(source, 'en'),
      'zh-Hant',
      new AbortController().signal,
    );
    hydrate(source, prepared);
    expect(
      source.getQueryData(categoriesQuery('zh-Hant').queryKey)?.pages.flatMap((page) => page.items),
    ).toHaveLength(7);
    expect(requests.map((url) => url.searchParams.get('page'))).toEqual(['1', '2']);
    expect(requests.every((url) => url.pathname.endsWith('/skill-categories'))).toBe(true);
    source.clear();
  });
  it('does not commit a partial translated category index when its continuation fails', async () => {
    const source = createQueryClient();
    const categories = [1, 2].map((page) =>
      categoryPage(
        endpointFixture(
          new URL(`https://example.test/portfolio/skill-categories?locale=en&page=${page}`),
        ),
      ),
    );
    source.setQueryData(categoriesQuery('en').queryKey, {
      pages: categories,
      pageParams: [1, 2],
    });
    vi.stubGlobal(
      'fetch',
      vi.fn((path: string) => {
        const url = new URL(path, 'https://example.test');
        return Promise.resolve(
          Response.json(
            url.searchParams.get('page') === '2' ? { items: [] } : endpointFixture(url),
          ),
        );
      }),
    );
    await expect(
      prepareLocale(captureLocaleScope(source, 'en'), 'zh-Hant', new AbortController().signal),
    ).rejects.toMatchObject({ kind: 'contract' });
    expect(source.getQueryData(categoriesQuery('zh-Hant').queryKey)).toBeUndefined();
    expect(source.getQueryData(categoriesQuery('en').queryKey)?.pages).toEqual(categories);
    source.clear();
  });
  it('rejects inconsistent shared labels and keeps all locale dictionaries aligned', () => {
    expect(() =>
      assertSkillLabels([[{ id: 'x', label: 'A' }], [{ id: 'x', label: 'B' }]]),
    ).toThrow();
    expect(Object.keys(messages.en.ui).sort()).toEqual(Object.keys(messages['zh-Hant'].ui).sort());
    expect(Object.keys(messages.en.ui).sort()).toEqual(Object.keys(messages['zh-Hans'].ui).sort());
  });
});

import { projectsSchema } from '@/features/projects';
import { categoriesSchema, skillsSchema } from '@/features/skills';
/** Validate fixture DTOs through real schemas instead of bypassing types with assertions. */
const projectsPage = (value: unknown) => projectsSchema.parse(value);
const categoryPage = (value: unknown) => categoriesSchema.parse(value);
const skillsPage = (value: unknown) => skillsSchema.parse(value);
