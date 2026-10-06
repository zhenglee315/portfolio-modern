import { expect, type Locator, type Page } from '@playwright/test';
import { UNSAFE_decodeViaTurboStream } from 'react-router';
import { z } from 'zod';
import { runtimeTest as test } from '../fixtures/browser';
import { endpointFixture } from '../fixtures/portfolio';

const routeSnapshot = z.object({
  'routes/home': z.object({
    data: z.object({
      dehydratedState: z.object({
        queries: z.array(
          z.object({
            queryKey: z.array(z.unknown()),
            state: z.object({ dataUpdatedAt: z.number().int().positive() }),
          }),
        ),
      }),
    }),
  }),
});

/** Set explicit cache age from the actual delivered route snapshot before hydration.
 * @param ageMs Fresh-preview checks use one second; stale coverage uses the product's read window.
 * The framework codec reads unmodified route data. Only Date is fixed; fonts, rAF and timers run.
 * Full-suite duration therefore cannot turn a fresh-prefix assertion into a stale-refetch check.
 */
async function setSnapshotAge(page: Page, ageMs = 1000) {
  const response = await page.request.get('/en.data');
  expect(response.ok()).toBe(true);
  const stream = new Response(await response.text()).body;
  if (!stream) throw new Error('Expected a delivered route data stream.');
  const decoded = await UNSAFE_decodeViaTurboStream(stream, globalThis);
  const snapshot = routeSnapshot.parse(decoded.value)['routes/home'].data.dehydratedState;
  const categories = snapshot.queries.find((query) => query.queryKey[2] === 'skill-categories');
  if (!categories) throw new Error('Expected validated category data in the route snapshot.');
  await page.clock.setFixedTime(categories.state.dataUpdatedAt + ageMs);
}

/** Record category-owner continuation independently from the complete static category list. */
async function observeSkillPages(page: Page) {
  const requests: URL[] = [];
  await page.route('**/api/portfolio/**', (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/skills')) requests.push(url);
    return route.fulfill({ json: endpointFixture(url) });
  });
  return (ownerId: string) =>
    requests
      .filter((url) => url.searchParams.get('ownerId') === ownerId)
      .map((url) => url.searchParams.get('page'));
}

/** Wait for the actual 75% preview invariant rather than a fixed number of rendering frames.
 * Font readiness and a visible disclosure can precede React's measured-prefix commit in cold dev.
 * The successful sample retains the original width tolerance and includes the disclosure itself.
 */
async function previewGeometry(tags: Locator) {
  let geometry = { budget: 0, used: Infinity };
  await expect
    .poll(async () => {
      geometry = await tags.evaluate(async (element) => {
        await document.fonts.ready;
        const bounds = element.getBoundingClientRect();
        const children = [...element.children].map((child) => child.getBoundingClientRect());
        return {
          budget: bounds.width * 0.75,
          used:
            bounds.width > 0 && children.length
              ? Math.max(...children.map((child) => child.right)) - bounds.left
              : Infinity,
        };
      });
      return geometry.used - geometry.budget;
    })
    .toBeLessThanOrEqual(1);
  return geometry;
}

/** A wide row fills its measured preview, while classification remains fully visible. */
test('wide skill previews fill spare space without an outer category disclosure', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 3840, height: 2160 });
  await setSnapshotAge(page);
  const ownerPages = await observeSkillPages(page);
  await page.goto('/en#skills');
  const toolkit = page.locator('[data-skill-categories]');
  await expect(toolkit).toHaveCount(1);
  await expect(toolkit.locator(':scope > [data-category-id]')).toHaveCount(7);
  await expect(
    page.locator('#skills').getByRole('button', { name: /Show more skill categories/ }),
  ).toHaveCount(0);
  const tags = toolkit.locator('[data-category-id="category-0"] .tag-list');
  await expect(tags.locator(':scope > span')).toHaveCount(14);
  await expect(tags.locator('button[aria-expanded]')).toHaveCount(0);
  expect(ownerPages('category-0')).toEqual(['2', '3']);
  const geometry = await previewGeometry(tags);
  expect(geometry.used).toBeLessThanOrEqual(geometry.budget + 1);
});

/** Font/viewport changes reuse the seeded and continued owner cache rather than page one. */
test('resizing skill previews fills capacity once and reuses owner pages after collapse', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 900 });
  await setSnapshotAge(page);
  const ownerPages = await observeSkillPages(page);
  await page.goto('/en#skills');
  const tags = page.locator('[data-category-id="category-0"] .tag-list');
  const collapsed = tags.locator('button[aria-expanded="false"]');
  await expect(collapsed).toBeVisible();
  const narrow = await previewGeometry(tags);
  expect(narrow.used).toBeLessThanOrEqual(narrow.budget + 1);
  expect(ownerPages('category-0')).toEqual([]);

  await page.setViewportSize({ width: 3840, height: 2160 });
  await expect(tags.locator(':scope > span')).toHaveCount(14);
  await expect(collapsed).toHaveCount(0);
  expect(ownerPages('category-0')).toEqual(['2', '3']);

  await page.setViewportSize({ width: 390, height: 900 });
  await expect(collapsed).toBeVisible();
  await previewGeometry(tags);
  await collapsed.click();
  await expect(tags.locator(':scope > span')).toHaveCount(14);
  await expect(
    page
      .locator('[data-category-id="category-0"]')
      .getByRole('button', { name: 'Load more skills' }),
  ).toHaveCount(0);
  await tags.locator('button[aria-expanded="true"]').click();
  await expect(collapsed).toBeVisible();
  await previewGeometry(tags);
  await page.setViewportSize({ width: 3840, height: 2160 });
  await expect(tags.locator(':scope > span')).toHaveCount(14);
  await expect(collapsed).toHaveCount(0);
  expect(ownerPages('category-0')).toEqual(['2', '3']);
});

/** Expired embedded owner data still refetches normally; fresh checks do not disable this policy. */
test('stale skill previews refresh page one before retaining the narrow disclosure', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 900 });
  await setSnapshotAge(page, 61_000);
  const ownerPages = await observeSkillPages(page);
  await page.goto('/en#skills');
  const tags = page.locator('[data-category-id="category-0"] .tag-list');
  await expect(tags.locator('button[aria-expanded="false"]')).toBeVisible();
  await expect.poll(() => ownerPages('category-0')).toEqual(['1']);
  const geometry = await previewGeometry(tags);
  expect(geometry.used).toBeLessThanOrEqual(geometry.budget + 1);
});
