import { expect, test } from '@playwright/test';
import { endpointFixture, pageFixture, siteFixture } from '../fixtures/portfolio';
import { openClientShell } from '../fixtures/browser';

test('backend outage retains static content and independently reports continuation failure', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/portfolio/**', (route) =>
    route.fulfill({ status: 503, body: '<html>private failure</html>' }),
  );
  await page.goto('/en#projects');
  await page.getByRole('button', { name: /Show more projects/ }).click();
  await expect(page.locator('#projects .load-more-control [role="alert"]')).toBeVisible();
  await expect(page.locator('[data-project-id]')).toHaveCount(6);
  await expect(page.locator('[data-experience-id]')).toHaveCount(6);
  await expect(page.locator('h1')).toContainText('Alex Example');
  expect(await page.locator('body').innerText()).not.toContain('private failure');
  expect(errors).toEqual([]);
});

for (const mode of ['empty', 'invalid', 'validation', 'html'] as const) {
  test(`first-read ${mode} response stays local to projects`, async ({ page }) => {
    await page.route('**/api/portfolio/**', (route) => {
      const url = new URL(route.request().url());
      if (!url.pathname.endsWith('/projects')) return route.fulfill({ json: endpointFixture(url) });
      if (mode === 'empty') return route.fulfill({ json: pageFixture([]) });
      if (mode === 'invalid')
        return route.fulfill({ json: { items: null, total: 0, pages: 0, page: 1, size: 6 } });
      if (mode === 'validation')
        return route.fulfill({
          status: 422,
          json: { detail: [{ msg: 'private validation details' }] },
        });
      return route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<html>private upstream</html>',
      });
    });
    await openClientShell(page);
    const section = page.locator('#projects');
    await expect(
      section.getByText(
        mode === 'empty'
          ? 'No data available yet.'
          : mode === 'validation'
            ? 'This content is temporarily unavailable.'
            : 'This content has an unexpected format.',
      ),
    ).toBeVisible();
    await expect(page.locator('[data-experience-id]')).toHaveCount(6);
    expect(await page.locator('body').innerText()).not.toContain('private');
  });
}

test('continuation failure retries the same page without losing validated cards', async ({
  page,
}) => {
  let fail = true;
  const requested: string[] = [];
  await page.route('**/api/portfolio/projects?**', (route) => {
    const url = new URL(route.request().url());
    requested.push(url.searchParams.get('page')!);
    return fail ? route.fulfill({ status: 503 }) : route.fulfill({ json: endpointFixture(url) });
  });
  await page.goto('/en#projects');
  const section = page.locator('#projects');
  await section.getByRole('button', { name: /Show more projects/ }).click();
  await expect(section.locator('[role="alert"]')).toBeVisible();
  await expect(section.locator('[data-project-id]')).toHaveCount(6);
  fail = false;
  await section.getByRole('button', { name: 'Show more projects', exact: true }).click();
  await expect(section.locator('[data-project-id]')).toHaveCount(12);
  expect(new Set(requested)).toEqual(new Set(['2']));
});

test('duplicate continuation identity requires first-page contract recovery', async ({ page }) => {
  let duplicate = true;
  await page.route('**/api/portfolio/projects?**', (route) => {
    const url = new URL(route.request().url());
    const body = endpointFixture(url) as { items: { id: number }[] };
    if (duplicate && url.searchParams.get('page') === '2') body.items[0]!.id = 1;
    return route.fulfill({ json: body });
  });
  await page.goto('/en#projects');
  const section = page.locator('#projects');
  await section.getByRole('button', { name: /Show more projects/ }).click();
  await expect(section.getByRole('button', { name: 'Reload this section' })).toBeVisible();
  await expect(section.locator('[data-project-id]')).toHaveCount(6);
  duplicate = false;
  await section.getByRole('button', { name: 'Reload this section' }).click();
  await expect(section.locator('[data-project-id]')).toHaveCount(6);
  await expect(section.getByRole('button', { name: 'Reload this section' })).toHaveCount(0);
});

test('Site not found leaves language controls and sibling domains usable', async ({ page }) => {
  await page.route('**/api/portfolio/**', (route) => {
    const url = new URL(route.request().url());
    return url.pathname.endsWith('/site')
      ? route.fulfill({ status: 404, json: { detail: 'NOT_FOUND' } })
      : route.fulfill({ json: endpointFixture(url) });
  });
  await openClientShell(page);
  await expect(page.locator('#overview .section-state')).toContainText('profile');
  await expect(page.locator('[data-project-id]')).toHaveCount(6);
  await expect(page.getByRole('button', { name: 'Change language', exact: true })).toBeVisible();
});

test('public text escapes markup and unsafe social links cannot execute', async ({ page }) => {
  const payload = '<img src=x onerror="window.pwned=true">';
  await page.route('**/api/portfolio/**', (route) => {
    const url = new URL(route.request().url());
    return route.fulfill({
      json: url.pathname.endsWith('/site')
        ? {
            ...siteFixture,
            profile: { ...siteFixture.profile, content: payload },
            social: { ...siteFixture.social, github: 'javascript:window.pwned=true' },
          }
        : endpointFixture(url),
    });
  });
  await openClientShell(page);
  await expect(page.locator('#overview')).toContainText(payload);
  await expect(page.locator('#overview img')).toHaveCount(0);
  await expect(page.locator('a[href^="javascript:"]')).toHaveCount(0);
  expect(await page.evaluate(() => 'pwned' in window)).toBe(false);
});

test('failed map chunk keeps destinations and other sections available', async ({ page }) => {
  await page.route('**/assets/JourneyMap-*.js', (route) => route.abort());
  await page.goto('/en#journey');
  await expect(
    page.getByText('The interactive map is unavailable. Select a destination below.'),
  ).toBeVisible();
  await expect(page.locator('#journey button[data-id]')).toHaveCount(3);
  await page.locator('#journey button[data-id="2"]').click();
  await expect(page.locator('#journey').getByText('Jun 2024 — Oct 2024')).toBeVisible();
  await expect(page.locator('[data-project-id]')).toHaveCount(6);
});

/** Client-only reads append all categories; a failed continuation retains its validated prefix. */
test('skill category continuation failure retains rows and retries only the missing page', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  let fail = true;
  const requested: string[] = [];
  await page.route('**/api/portfolio/**', (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/skill-categories')) {
      const requestedPage = url.searchParams.get('page')!;
      requested.push(requestedPage);
      if (requestedPage === '2' && fail)
        return route.fulfill({ status: 503, body: '<html>private continuation failure</html>' });
    }
    return route.fulfill({ json: endpointFixture(url) });
  });
  await openClientShell(page);
  const section = page.locator('#skills');
  const toolkit = section.locator('[data-skill-categories]');
  await expect(toolkit.locator(':scope > [data-category-id]')).toHaveCount(6);
  await expect(section.getByRole('alert')).toBeVisible();
  await expect(section.getByRole('button', { name: 'Try again', exact: true })).toBeVisible();
  await expect(page.locator('[data-project-id]')).toHaveCount(6);
  expect(await section.innerText()).not.toContain('private continuation failure');
  expect(requested.filter((number) => number === '1')).toHaveLength(1);

  fail = false;
  await section.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(toolkit.locator(':scope > [data-category-id]')).toHaveCount(7);
  await expect(section.getByRole('alert')).toHaveCount(0);
  expect(requested.filter((number) => number === '1')).toHaveLength(1);
  expect(requested.slice(1).every((number) => number === '2')).toBe(true);
  await expect(section.getByRole('button', { name: /Show more skill categories/ })).toHaveCount(0);
});
