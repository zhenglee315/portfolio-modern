import { expect, test } from '@playwright/test';
import { endpointFixture } from '../fixtures/portfolio';
import { openClientShell, openProjectLanguage } from '../fixtures/browser';

/** Intercept only public reads; the user's running backend is never stopped or modified. */
test.beforeEach(async ({ page }) => {
  await page.route('**/api/portfolio/**', (route) =>
    route.fulfill({ json: endpointFixture(new URL(route.request().url())) }),
  );
});

test('project pages, collapse and lazy details reuse validated list payloads', async ({ page }) => {
  const detailRequests: string[] = [];
  page.on('request', (request) => {
    if (/\/portfolio\/projects\//.test(request.url())) detailRequests.push(request.url());
  });
  await page.goto('/en#projects');
  const section = page.locator('#projects');
  await expect(section.locator('[data-project-id]')).toHaveCount(6);
  await section.getByRole('button', { name: /Show more projects/ }).click();
  await expect(section.locator('[data-project-id]')).toHaveCount(12);
  await section.getByRole('button', { name: 'Show more projects', exact: true }).click();
  await expect(section.locator('[data-project-id]')).toHaveCount(15);
  await section.getByRole('button', { name: 'Show fewer projects' }).click();
  await expect(section.locator('[data-project-id]')).toHaveCount(6);
  const button = section.getByRole('button', { name: 'Read about en Project 1' });
  await button.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Typed boundaries.')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(button).toBeFocused();
  expect(detailRequests).toEqual([]);
});

test('narrow skill rows seed page one and request continuation only on disclosure', async ({
  page,
}) => {
  const requests: URL[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/portfolio/skills?')) requests.push(new URL(request.url()));
  });
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto('/en#skills');
  await expect(page.locator('[data-category-id]')).toHaveCount(6);
  await expect(page.locator('[data-skill-categories]')).toHaveCount(1);
  await expect(
    page.locator('#skills').getByRole('button', { name: /Show more categories/ }),
  ).toBeVisible();
  const row = page.locator('[data-category-id="category-0"]');
  await expect(row).toBeVisible();
  expect(requests).toEqual([]);
  await row.locator('button[aria-expanded="false"]').click();
  await expect(row.getByText('en Skill 12', { exact: true }).first()).toBeVisible();
  expect(requests.map((url) => url.searchParams.get('page'))).toEqual(['2']);
  await row.getByRole('button', { name: 'Load more skills' }).click();
  await expect(row.getByText('en Skill 14', { exact: true }).first()).toBeVisible();
  expect(requests.map((url) => url.searchParams.get('page'))).toEqual(['2', '3']);
});

for (const selection of [
  { name: 'named', path: '/en/sam#projects', translated: /\/zh-Hant\/sam#projects$/ },
  {
    name: 'query-ID',
    path: '/en?site_id=2#projects',
    translated: /\/zh-Hant\?site_id=2#projects$/,
  },
]) {
  /** Retain the URL's Site through language changes and every content continuation. */
  test(`${selection.name} portfolio locale and pagination reads use the resolved site ID`, async ({
    page,
  }) => {
    const requests: URL[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.pathname.startsWith('/api/portfolio/')) requests.push(url);
    });
    await page.setViewportSize({ width: 390, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openClientShell(page, selection.path);
    const projects = page.locator('#projects');
    await expect(projects.locator('[data-project-id]')).toHaveCount(6);
    await expect(projects).toContainText('sam en Project 1');
    await projects.getByRole('button', { name: /Show more projects/ }).click();
    await expect(projects.locator('[data-project-id]')).toHaveCount(12);
    const { dialog, trigger, close } = await openProjectLanguage(page);
    await trigger.click();
    await page.getByRole('button', { name: '繁體中文', exact: true }).click();
    await expect(page).toHaveURL(selection.translated);
    await expect(projects.locator('[data-project-id]')).toHaveCount(12);
    await expect(projects).toContainText('sam zh-Hant Project 8');
    await close.click();
    await expect(dialog).not.toBeVisible();
    await page.locator('#skills').scrollIntoViewIfNeeded();
    const row = page.locator('[data-category-id="category-0"]');
    await expect(row).toContainText('sam zh-Hant Category 1');
    await row.locator('button[aria-expanded="false"]').click();
    await expect(row.getByText('sam zh-Hant Skill 12', { exact: true }).first()).toBeVisible();
    await row.getByRole('button', { name: '載入更多技能', exact: true }).click();
    await expect(row.getByText('sam zh-Hant Skill 14', { exact: true }).first()).toBeVisible();

    const siteReads = requests.filter((url) => url.pathname.endsWith('/site'));
    const selectedSite = (url: URL) =>
      selection.name === 'named'
        ? url.searchParams.get('user') === 'sam'
        : url.searchParams.get('site_id') === '2' && !url.searchParams.has('user');
    expect(siteReads.some(selectedSite)).toBe(true);
    expect(
      siteReads.some((url) => selectedSite(url) && url.searchParams.get('locale') === 'zh-Hant'),
    ).toBe(true);
    const contentReads = requests.filter((url) => !url.pathname.endsWith('/site'));
    for (const url of contentReads) {
      expect(url.searchParams.has('user')).toBe(false);
      expect(url.searchParams.has('site_id')).toBe(true);
      if (url.searchParams.get('locale') === 'zh-Hant')
        expect(url.searchParams.get('site_id')).toBe('2');
    }
    const namedReads = contentReads.filter((url) => url.searchParams.get('site_id') === '2');
    expect(new Set(namedReads.map((url) => url.pathname))).toEqual(
      new Set([
        '/api/portfolio/journey',
        '/api/portfolio/experiences',
        '/api/portfolio/projects',
        '/api/portfolio/skill-categories',
        '/api/portfolio/skills',
      ]),
    );
    expect(
      namedReads.some(
        (url) => url.pathname.endsWith('/projects') && url.searchParams.get('page') === '2',
      ),
    ).toBe(true);
    expect(
      namedReads
        .filter((url) => url.pathname.endsWith('/skills'))
        .map((url) => [url.searchParams.get('ownerId'), url.searchParams.get('page')]),
    ).toEqual([
      ['category-0', '2'],
      ['category-0', '3'],
    ]);
  });
}
