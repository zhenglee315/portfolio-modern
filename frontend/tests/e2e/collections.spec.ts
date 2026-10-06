import { expect, test } from '@playwright/test';
import { endpointFixture } from '../fixtures/portfolio';

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
  await expect(page.locator('[data-category-id]')).toHaveCount(7);
  await expect(page.locator('[data-skill-categories]')).toHaveCount(1);
  await expect(
    page.locator('#skills').getByRole('button', { name: /Show more skill categories/ }),
  ).toHaveCount(0);
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
