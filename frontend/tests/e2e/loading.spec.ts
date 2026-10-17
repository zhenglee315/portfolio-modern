import { expect, test } from '@playwright/test';

test('project detail code waits for disclosure and unknown API/assets never become HTML success', async ({
  page,
  request,
}) => {
  const chunks: string[] = [];
  page.on('request', (request) => {
    if (/\/assets\/ProjectDetail-.*\.js/.test(request.url())) chunks.push(request.url());
  });
  await page.goto('/en#projects');
  await expect(page.locator('[data-project-id]')).toHaveCount(6);
  expect(chunks).toEqual([]);
  await page.getByRole('button', { name: 'Read about en Project 1' }).click();
  await expect(page.locator('.modal[role="dialog"]')).toBeVisible();
  expect(chunks).toHaveLength(1);
  const api = await request.get('/api/portfolio/unknown');
  expect(api.status()).toBe(404);
  expect(api.headers()['content-type']).toContain('json');
  expect((await request.get('/assets/missing.js')).status()).toBe(404);
});
