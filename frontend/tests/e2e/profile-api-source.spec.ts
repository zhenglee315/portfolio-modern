import { expect, test as faultTest } from '@playwright/test';
import { runtimeTest as test } from '../fixtures/browser';
import { openEditor, field, save, draftKey } from '../fixtures/profile-editor';
import { createProfileExample } from '../../src/features/profile-content/model/seed';

const lastProject = /^Web application en Project 15 /;

test('all 15 projects and translations load privately; one atomic save survives a reload', async ({
  page,
}) => {
  const reads: string[] = [];
  const writes: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/portfolio/me/')) reads.push(request.url());
    if (!['GET', 'HEAD'].includes(request.method())) writes.push(request.url());
  });
  await openEditor(page, '/en/profile?section=projects', 'mint', { existingApi: true });
  await expect(page.getByText(/Your portfolio · 15 projects/)).toBeVisible();
  const card = page
    .locator('section')
    .filter({ has: page.getByRole('button', { name: lastProject }) });
  await card.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(field(page, 'Project name')).toHaveValue('en Project 15');
  await expect(field(page, 'Project organization')).toHaveValue('Example Studio');
  await expect(field(page, 'Technical approach')).toHaveValue('Typed boundaries.');
  await field(page, 'Content language').selectOption('zh-Hant');
  await expect(field(page, 'Project name')).toHaveValue('zh-Hant Project 15');
  await field(page, 'Content language').selectOption('en');
  await field(page, 'Project name').fill('Saved API project');
  await save(page);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(field(page, 'Project name')).toHaveValue('Saved API project');
  expect(new Set(reads.map((url) => new URL(url).pathname)).size).toBe(5);
  expect(writes).toHaveLength(1);
  expect(writes[0]).toContain('/api/portfolio/site/save');
});

test('a legacy browser draft remains recoverable until the owner explicitly loads server content', async ({
  page,
}) => {
  const previous = createProfileExample();
  await page.addInitScript(
    ({ key, previous }) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(previous));
    },
    { key: draftKey, previous },
  );
  await openEditor(page, '/en/profile?section=projects', 'mint', { existingApi: true });
  await expect(page.getByText(/A previous browser draft is open/)).toBeVisible();
  await page.getByRole('button', { name: 'Load existing API data', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Load existing API data', exact: true })
    .click();
  await expect(page.getByRole('button', { name: lastProject })).toBeVisible();
  expect(
    await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).projectOrder, draftKey),
  ).toEqual(['manufacturing']);
});

faultTest('failed owner reads expose retry without invented public content', async ({ page }) => {
  await openEditor(page, '/en/profile?section=projects', 'mint', {
    existingApi: true,
    waitForWorkspace: false,
    beforeNavigate: async (page) => {
      await page.route('**/api/portfolio/me/projects', (route) =>
        route.fulfill({ status: 503, json: { detail: 'UNAVAILABLE' } }),
      );
    },
  });
  await expect(page.getByRole('alert')).toHaveText(
    'Your existing portfolio could not load. Your saved browser draft has not been changed.',
  );
  await page.unroute('**/api/portfolio/me/projects');
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByRole('button', { name: lastProject })).toBeVisible();
});

faultTest(
  'a rejected save preserves edits and never reports a browser cache as a successful save',
  async ({ page }) => {
    await openEditor(page, '/en/profile?section=overview');
    await field(page, 'First name').fill('Unsaved owner');
    await page.route('**/api/portfolio/site/save', (route) =>
      route.fulfill({ status: 409, json: { detail: 'PORTFOLIO_EDIT_CONFLICT' } }),
    );
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(
      page
        .getByRole('alert')
        .filter({ hasText: /changed elsewhere/ })
        .first(),
    ).toBeVisible();
    await expect(field(page, 'First name')).toHaveValue('Unsaved owner');
    expect(await page.evaluate((key) => localStorage.getItem(key), draftKey)).toBeNull();
    await page.getByRole('button', { name: 'Reload server content', exact: true }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Load existing API data', exact: true })
      .click();
    await expect(field(page, 'First name')).toHaveValue('Zheng');
  },
);

test('saving locks the working copy and role permissions disable creation and deletion', async ({
  page,
}) => {
  await openEditor(page, '/en/profile?section=overview', 'mint', {
    permissions: { is_create: false, is_delete: false },
  });
  await field(page, 'First name').fill('Waiting owner');
  let finish: (() => void) | undefined;
  await page.route('**/api/portfolio/site/save', async (route) => {
    await new Promise<void>((resolve) => {
      finish = resolve;
    });
    await route.fallback();
  });
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(field(page, 'First name')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeDisabled();
  await expect.poll(() => !!finish).toBe(true);
  finish!();
  await expect(field(page, 'First name')).toBeEnabled();
  await page
    .locator('main nav')
    .getByRole('button', { name: /EXPERIENCE/ })
    .click();
  await expect(page.getByRole('button', { name: 'Add experience', exact: true })).toBeDisabled();
});
