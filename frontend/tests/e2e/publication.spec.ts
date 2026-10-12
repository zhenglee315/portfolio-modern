import { expect, test } from '@playwright/test';
import { UNSAFE_decodeViaTurboStream } from 'react-router';
import { z } from 'zod';
import { siteFixture } from '../fixtures/portfolio';
import { waitForFixtureHydration } from '../fixtures/browser';

/** The synthetic HTTP service enforces the same Site-only handle selection as FastAPI. */
test('only Site accepts a public handle; content APIs require a site ID or the default', async ({
  request,
}) => {
  expect((await request.get('/api/portfolio/site?user=sam')).status()).toBe(200);
  expect((await request.get('/api/portfolio/site?user=sam&site_id=2')).status()).toBe(400);
  for (const endpoint of ['journey', 'experiences', 'projects', 'skill-categories', 'skills']) {
    const owner = endpoint === 'skills' ? '&ownerType=category&ownerId=category-0' : '';
    const response = await request.get(`/api/portfolio/${endpoint}?user=sam${owner}`);
    expect(response.status()).toBe(400);
    expect(await response.json()).toEqual({ detail: 'INVALID_SITE_SELECTOR' });
    expect((await request.get(`/api/portfolio/${endpoint}?site_id=2${owner}`)).status()).toBe(200);
    expect((await request.get(`/api/portfolio/${endpoint}?locale=en${owner}`)).status()).toBe(200);
  }
});

/** Real HTTP status and metadata must describe the selected published portfolio. */
test('public documents resolve owner URLs with current metadata and no shared HTML cache', async ({
  request,
}) => {
  const response = await request.get(`/en/${siteFixture.user}`);
  expect(response.status()).toBe(200);
  expect(response.headers()['cache-control']).toBe('no-store');
  const html = await response.text();
  expect(html).toContain('data-profile-content');
  expect(html).toContain(`href="https://example.com/en/${siteFixture.user}"`);
  expect(html).toContain(`href="https://example.com/zh-Hant/${siteFixture.user}"`);
  expect(html).toContain(`content="https://example.com/en/${siteFixture.user}"`);
  const defaultResponse = await request.get('/en');
  expect(defaultResponse.status()).toBe(200);
  const defaultHtml = await defaultResponse.text();
  expect(defaultHtml).toContain('rel="canonical" href="https://example.com/"');
  expect(defaultHtml).toContain('href="https://example.com/zh-Hant"');
});

/** Explicit IDs select a different Site during SSR and retain that identity in sharing links. */
test('query-string site IDs select portfolio documents and metadata independently of the default', async ({
  request,
}) => {
  for (const [id, owner] of [
    [1, 'alex'],
    [2, 'sam'],
  ] as const) {
    const response = await request.get(`/en?site_id=${id}&source=sharing`);
    expect(response.status()).toBe(200);
    expect(response.headers()['cache-control']).toBe('no-store');
    const html = await response.text();
    expect(html).toContain(`data-portfolio-site="${id}"`);
    expect(html).toContain(`data-portfolio-user="${owner}"`);
    expect(html).toContain(`rel="canonical" href="https://example.com/en?site_id=${id}"`);
    expect(html).toContain(`href="https://example.com/zh-Hant?site_id=${id}"`);
    expect(html).toContain(`content="https://example.com/en?site_id=${id}"`);
  }
});

/** Query-only navigation and reload must never retain another owner's cached profile. */
test('site ID pages survive reload and query-only browser navigation', async ({ page }) => {
  await page.goto('/en?site_id=2&source=selection#overview');
  await waitForFixtureHydration(page);
  await expect(page.locator('[data-portfolio-site="2"]')).toBeVisible();
  await page.reload();
  await expect(page.locator('[data-portfolio-site="2"]')).toBeVisible();
  for (const path of ['/en?site_id=1#overview', '/en?site_id=2#overview', '/en#overview']) {
    await page.evaluate((target) => {
      history.pushState(null, '', target);
      dispatchEvent(new PopStateEvent('popstate'));
    }, path);
    await expect(
      page.locator(`[data-portfolio-site="${path.includes('site_id=2') ? 2 : 1}"]`),
    ).toBeVisible();
  }
});

/** Missing/default-independent URLs remain missing rather than displaying another owner. */
test('unknown portfolios and reserved or unsupported routes return actual 404 documents', async ({
  request,
}) => {
  for (const path of [
    '/en/missing-user',
    '/en/admin',
    '/unsupported',
    '/en/example/extra',
    '/en?site_id=999',
    '/en?site_id=0',
    '/en?site_id=not-an-id',
    '/en/sam?site_id=2',
    '/en?site_id=1&site_id=2',
  ]) {
    const response = await request.get(path);
    expect(response.status()).toBe(404);
    expect(response.headers()['cache-control']).toBe('no-store');
    expect(await response.text()).not.toContain('data-profile-content');
  }
});

/** Public SSR neither forwards a browser session to public APIs nor dehydrates credentials. */
test('public SSR excludes incoming session cookies from API reads and serialized HTML', async ({
  request,
}) => {
  const response = await request.get('/en', {
    headers: { Cookie: 'session_id=private-identity-sentinel' },
  });
  expect(response.status()).toBe(200);
  const html = await response.text();
  expect(html).not.toContain('private-identity-sentinel');
  expect(html).not.toContain('is_manage_roles');
  expect(html).not.toContain('is_manage_users');
  expect(html).not.toContain('is_manage_sites');
});

/** Backend failure retains its real service status while exposing only a public error document. */
test('an unavailable profile returns 503 without private upstream details', async ({ request }) => {
  const response = await request.get('/en/unavailable');
  expect(response.status()).toBe(503);
  expect(response.headers()['cache-control']).toBe('no-store');
  const html = await response.text();
  expect(html).toContain('Unable to load this page');
  expect(html).not.toContain('PRIVATE_UPSTREAM_SENTINEL');
  expect(html).not.toContain('data-profile-content');
});

for (const [user, heading] of [
  ['missing-user', 'Page not found'],
  ['unavailable', 'Unable to load this page'],
] as const) {
  /** Browser routing uses the same sanitized errors and recovers on a different owner. */
  test(`browser navigation preserves the ${user} error without displaying default content`, async ({
    page,
  }) => {
    await page.goto('/en');
    await waitForFixtureHydration(page);
    const navigate = (path: string) =>
      page.evaluate((target) => {
        history.pushState(null, '', target);
        dispatchEvent(new PopStateEvent('popstate'));
      }, path);
    await navigate(`/en/${user}`);
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    await expect(page.locator('[data-profile-content]')).toHaveCount(0);
    await navigate('/en/sam');
    await expect(page.locator('[data-portfolio-user="sam"]')).toBeVisible();
    await expect(page.locator('h1[data-profile-content]')).toBeVisible();
  });
}

/** Bound SSR pagination and identity across independent concurrent document requests. */
test('server snapshots contain only resolved identity and bounded first-page data', async ({
  request,
}) => {
  const selections = [
    { path: '/en.data', siteId: 1, user: 'alex', identity: 'default' },
    { path: '/en/sam.data', siteId: 2, user: 'sam', identity: 'user:sam' },
    { path: '/en.data?site_id=2', siteId: 2, user: 'sam', identity: 'site:2' },
  ];
  const responses = await Promise.all(selections.map(({ path }) => request.get(path)));
  const snapshotSchema = z.record(
    z.string(),
    z.object({
      data: z
        .object({
          site: z.object({ site_id: z.number(), user: z.string() }),
          dehydratedState: z.object({
            queries: z.array(
              z.object({
                queryKey: z.array(z.unknown()),
                state: z.object({ data: z.unknown() }),
              }),
            ),
          }),
        })
        .optional(),
    }),
  );
  for (const [index, response] of responses.entries()) {
    expect(response.status()).toBe(200);
    const decoded = await UNSAFE_decodeViaTurboStream(
      new Response(await response.text()).body!,
      globalThis,
    );
    const values = snapshotSchema.parse(
      Object.fromEntries(
        Object.entries(decoded.value as Record<string, unknown>).filter(([key]) => key !== 'root'),
      ),
    );
    const snapshot = Object.values(values).find((entry) => entry.data?.site)?.data;
    expect(snapshot).toBeDefined();
    const site = snapshot!.site;
    expect(site.site_id).toBe(selections[index]!.siteId);
    expect(site.user).toBe(selections[index]!.user);
    // Strict fixtures reject user on content reads; successful prefetched pages prove ID pinning.
    expect(snapshot!.dehydratedState.queries.map((query) => query.queryKey[3]).sort()).toEqual([
      'experiences',
      'projects',
      'site',
      'skill-categories',
    ]);
    for (const query of snapshot!.dehydratedState.queries) {
      expect(query.queryKey[3]).not.toBe('journey');
      if (query.queryKey[3] === 'site') {
        expect(query.queryKey[1]).toBe(selections[index]!.identity);
        continue;
      }
      expect(query.queryKey[1]).toBe(`site:${site.site_id}`);
      const pageData = z
        .object({ pages: z.array(z.object({ items: z.array(z.unknown()) })) })
        .parse(query.state.data);
      expect(pageData.pages).toHaveLength(1);
      expect(pageData.pages[0]!.items.length).toBeLessThanOrEqual(6);
    }
  }
  const html = await (await request.get('/en')).body();
  expect(html.byteLength).toBeLessThanOrEqual(200 * 1024);
});
