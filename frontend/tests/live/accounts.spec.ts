import {
  expect,
  test,
  request as requestFactory,
  type APIRequestContext,
  type Page,
} from '@playwright/test';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { ProfileDraft } from '../../src/features/profile-content/model/profile';

type Account = {
  index: number;
  id: number;
  siteId: number;
  user: string;
  email: string;
  password: string;
  delete: boolean;
};
type Manifest = {
  run: string;
  roles: Record<string, { id: number; name: string }>;
  accounts: Account[];
};
const manifestPath = process.env.PORTFOLIO_LIVE_ACCOUNTS_MANIFEST!;
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Manifest;
const directory = dirname(manifestPath);
if (
  manifest.accounts.length !== 20 ||
  manifest.accounts.filter((item) => item.delete).length !== 10 ||
  manifest.accounts.some((item) => !item.user.startsWith(`${manifest.run}_`))
)
  throw new Error('Only the named 20-account QA cohort may be edited or deleted.');

/** Authenticate through the real form. No route interception, fabricated cookie or SESSION bypass. */
async function signIn(page: Page, account: Account) {
  await page.goto('/en?view=login');
  const form = page.locator('[data-auth-panel]');
  await form.getByLabel('Email', { exact: true }).fill(account.email);
  await form.getByLabel('Password', { exact: true }).fill(account.password);
  const response = page.waitForResponse(
    (value) =>
      value.url().endsWith('/api/authority/sign-in') && value.request().method() === 'POST',
  );
  await form.locator('button[type="submit"]').click();
  expect((await response).status()).toBe(200);
  await expect(form).toHaveCount(0);
}

async function section(page: Page, name: string) {
  await page
    .locator('main nav')
    .getByRole('button', { name: new RegExp(name) })
    .click();
  await expect(page.locator('[data-profile-section]')).not.toHaveAttribute('inert');
}

async function save(page: Page) {
  const response = page.waitForResponse(
    (value) =>
      value.url().endsWith('/api/portfolio/site/save') && value.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  const result = await response;
  expect(result.status()).toBe(200);
  const saved = (await result.json()) as { revision: number; draft: ProfileDraft };
  await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeDisabled();
  return saved;
}

/** Exercise every individual write operation against real HTTP/SQL using only this owner's synthetic records. */
async function resourceCrud(
  request: APIRequestContext,
  initial: { revision: number; draft: ProfileDraft },
  foreign: Account,
) {
  let state = initial;
  let operations = 0;
  const write = async (path: string, method: string, data: Record<string, unknown> = {}) => {
    const response = await request.fetch(`/api/portfolio/${path}`, {
      method,
      data: { expected_revision: state.revision, ...data },
    });
    expect(response.status(), `${method} ${path}`).toBe(200);
    const next = (await response.json()) as typeof state;
    expect(next.revision).toBe(state.revision + 1);
    state = next;
    operations++;
  };
  const stale = await request.patch('/api/portfolio/site', {
    data: { expected_revision: state.revision - 1, social: { ...state.draft.social, email: '' } },
  });
  expect(stale.status()).toBe(409);
  const selector = await request.get(`/api/portfolio/me/site?site_id=${foreign.siteId}`);
  expect(selector.status()).toBe(400);
  const denied = await request.get('/api/management/users');
  // Only cohort account 01 has management rights during this phase.
  expect([200, 403]).toContain(denied.status());
  await write('site', 'PATCH', {
    profiles: { en: { ...state.draft.profiles.en, footer: 'Verified through resource PATCH' } },
  });
  const experienceTemplate = structuredClone(Object.values(state.draft.experiences)[0]!);
  const existingExperiences = new Set(Object.keys(state.draft.experiences));
  await write('experiences', 'POST', {
    entry: { ...experienceTemplate, id: 'qa-extra-experience' },
  });
  const experience = Object.keys(state.draft.experiences).find(
    (id) => !existingExperiences.has(id),
  )!;
  const experienceId = experience.split(':')[1]!;
  await write(`experiences/${experienceId}`, 'PATCH', { changes: { visible: false } });
  await write('experiences/order', 'PUT', { ids: [...state.draft.experienceOrder].reverse() });
  const projectTemplate = structuredClone(Object.values(state.draft.projects)[0]!);
  const existingProjects = new Set(Object.keys(state.draft.projects));
  await write('projects', 'POST', {
    entry: { ...projectTemplate, id: 'qa-extra-project', experienceId: experience },
  });
  const project = Object.keys(state.draft.projects).find((id) => !existingProjects.has(id))!;
  const projectId = project.split(':')[1]!;
  await write(`projects/${projectId}`, 'PATCH', { changes: { visible: false } });
  await write('projects/order', 'PUT', { ids: [...state.draft.projectOrder].reverse() });
  await write(`experiences/${experienceId}`, 'DELETE');
  expect(state.draft.projects[project]!.experienceId).toBeNull();
  await write(`projects/${projectId}`, 'DELETE');
  const categoryId = 'qa-extra-category';
  const skillId = 'qa-extra-skill';
  await write('skill-categories', 'POST', {
    entry: {
      id: `category:${categoryId}`,
      visible: true,
      names: { en: 'QA', 'zh-Hans': 'QA', 'zh-Hant': 'QA' },
      skillIds: [],
    },
  });
  await write(`skill-categories/${categoryId}`, 'PATCH', { changes: { visible: false } });
  await write('skill-categories/order', 'PUT', { ids: [...state.draft.categoryOrder].reverse() });
  await write('skills', 'POST', {
    entry: {
      id: `skill:${skillId}`,
      label: 'QA shared skill',
      labels: { en: 'QA shared skill', 'zh-Hans': 'QA', 'zh-Hant': 'QA' },
    },
  });
  await write(`skills/${skillId}`, 'PATCH', { changes: { label: 'QA verified skill' } });
  await write(`skill-categories/${categoryId}/skills`, 'PUT', { ids: [`skill:${skillId}`] });
  const used = await request.delete(`/api/portfolio/skills/${skillId}`, {
    data: { expected_revision: state.revision },
  });
  expect(used.status()).toBe(409);
  await write(`skill-categories/${categoryId}/skills`, 'PUT', { ids: [] });
  await write(`skills/${skillId}`, 'DELETE');
  await write(`skill-categories/${categoryId}`, 'DELETE');
  expect(operations).toBe(18); // Seventeen individual write operations plus removing category membership before skill deletion.
  return { state, operations };
}

for (const account of manifest.accounts) {
  test(`real account ${String(account.index).padStart(2, '0')}: four sections, three languages, persistence and resource CUD`, async ({
    page,
  }, info) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await signIn(page, account);
    await page.goto('/en/profile?section=overview');
    await expect(page.locator('[data-editor-field="profile.firstName"] input')).toBeEnabled();
    const marker = `QA-${account.index}-${Date.now()}`;
    for (const locale of ['en', 'zh-Hans', 'zh-Hant']) {
      await page.getByLabel('Content language', { exact: true }).selectOption(locale);
      await page
        .locator('[data-editor-field="profile.firstName"] input')
        .fill(`${marker} ${locale}`);
      await page
        .locator('[data-editor-field="profile.content"] textarea')
        .fill(`Edited biography ${marker} ${locale}`);
    }
    await page.getByLabel('Content language', { exact: true }).selectOption('en');
    await page.getByLabel('GitHub', { exact: true }).fill('https://github.com/example');
    await section(page, 'EXPERIENCE');
    await page
      .locator('[data-experience-editor-row]')
      .first()
      .getByRole('button', { name: /^Edit / })
      .click();
    await page.getByLabel('Company / school').fill(`${marker} Studio`);
    await page.getByLabel('Job title / degree').fill(`${marker} Engineer`);
    await page.getByLabel('Quick location preset', { exact: true }).selectOption('London');
    await expect(page.locator('[data-profile-preview="journey"]')).toContainText(
      `${marker} Studio`,
    );
    await section(page, 'PROJECTS');
    await page.locator('main').getByRole('button', { name: 'Edit', exact: true }).first().click();
    await page.getByLabel('Project name').fill(`${marker} Project`);
    await page.getByLabel('Project summary').fill(`${marker} summary`);
    await page.getByLabel('Workflow description', { exact: true }).fill(`${marker} workflow`);
    await section(page, 'SKILLS');
    await page.getByLabel('Category name').fill(`${marker} Backend`);
    await page.getByLabel('Skill name', { exact: true }).fill(`${marker} Python`);
    await page.getByRole('button', { name: 'Rename skill', exact: true }).click();
    const handles = page.locator('[data-reorder-list="categories"] [data-reorder-label]');
    await handles.first().focus();
    await handles.first().press('ArrowDown');
    const saved = await save(page);
    for (const locale of ['en', 'zh-Hans', 'zh-Hant'] as const)
      expect(saved.draft.profiles[locale].firstName).toBe(`${marker} ${locale}`);
    expect(
      Object.values(saved.draft.projects).some(
        (item) => item.translations.en.name === `${marker} Project`,
      ),
    ).toBe(true);
    expect(
      Object.values(saved.draft.skills).some((item) => item.label === `${marker} Python`),
    ).toBe(true);
    await page.reload();
    await expect(page.getByLabel('Category name')).toBeEnabled();
    const persisted = await page.request.get('/api/portfolio/me/site');
    expect(persisted.status()).toBe(200);
    expect((await persisted.json()).revision).toBe(saved.revision);
    await section(page, 'OVERVIEW');
    await expect(page.locator('[data-editor-field="profile.firstName"] input')).toHaveValue(
      `${marker} en`,
    );
    const verified = await resourceCrud(
      page.request,
      saved,
      manifest.accounts[account.index % 20]!,
    );
    expect(errors).toEqual([]);
    writeFileSync(
      join(directory, `account-${account.index}.verified.json`),
      JSON.stringify({
        index: account.index,
        id: account.id,
        user: account.user,
        revision: verified.state.revision,
        resourceWrites: verified.operations,
        marker,
      }),
      { mode: 0o600 },
    );
    if (account.index === 1 || account.index === 20)
      await page.screenshot({ path: info.outputPath('real-profile-edited.png'), fullPage: true });
    const logout = await page.request.post('/api/authority/sign-out');
    expect(logout.status()).toBe(200);
    expect((await page.request.get('/api/portfolio/me/site')).status()).toBe(401);
  });
}

/** Retain exact identity confirmation and check each selected row before a destructive UI action. */
async function management(page: Page, resource: string) {
  await page.goto(`/en/management/${resource}`);
  const owner = page.locator(`[data-management-resource="${resource}"]`);
  await expect(owner.getByRole('table')).toHaveAttribute('aria-busy', 'false');
  await owner.getByRole('searchbox').fill(manifest.run);
  await owner.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page).toHaveURL((url) => url.searchParams.get('search') === manifest.run);
  await expect(owner.getByRole('table')).toHaveAttribute('aria-busy', 'false');
  await owner.getByRole('combobox', { name: 'Rows per page', exact: true }).selectOption('100');
  return owner;
}

test('real management: edit QA accounts, publish/unpublish, then delete exactly the named 10 accounts', async ({
  page,
}, info) => {
  for (const account of manifest.accounts)
    expect(existsSync(join(directory, `account-${account.index}.verified.json`))).toBe(true);
  await signIn(page, manifest.accounts[0]!);
  let owner = await management(page, 'users');
  await expect(owner.locator('tbody tr[data-row-key]')).toHaveCount(20);
  for (const account of manifest.accounts.slice(1)) {
    const row = owner.locator(`tr[data-row-key="${account.id}"]`);
    if ((await row.innerText()).includes(manifest.roles.alternate!.name)) continue;
    await row.locator('button[value="edit"]').click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: /^Edit Role/ }).click();
    await page.getByRole('option', { name: manifest.roles.alternate!.name, exact: true }).click();
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    const confirmed = page.waitForResponse(
      (value) =>
        value.request().method() === 'PATCH' &&
        value.url().endsWith(`/api/management/users/${account.id}`),
    );
    await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
    expect((await confirmed).status()).toBe(200);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(row).toContainText(manifest.roles.alternate!.name);
  }
  owner = await management(page, 'sites');
  await expect(owner.locator('tbody tr[data-row-key]')).toHaveCount(20);
  for (const account of manifest.accounts) {
    const row = owner.locator(`tr[data-row-key="${account.id}"]`);
    for (const published of [true, false]) {
      const current = row.getByRole('checkbox', { name: /^Publish:/ });
      if ((await current.isChecked()) !== published) {
        await row.locator('button[value="edit"]').click();
        const dialog = page.getByRole('dialog');
        await dialog
          .getByRole('checkbox', { name: 'Edit Publish', exact: true })
          .setChecked(published);
        await dialog.getByRole('button', { name: 'Save', exact: true }).click();
        const changed = page.waitForResponse(
          (response) =>
            response.request().method() === 'PATCH' &&
            response.url().includes(`/api/management/sites/${account.id}`),
        );
        await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
        expect((await changed).status()).toBe(200);
        await expect(page.getByRole('dialog')).toHaveCount(0);
      }
      await expect(current).toBeChecked({ checked: published });
      expect(
        (await page.request.get(`/api/portfolio/site?user=${account.user}&locale=en`)).status(),
      ).toBe(published ? 200 : 404);
    }
  }
  owner = await management(page, 'users');
  for (const account of manifest.accounts.filter((item) => item.delete)) {
    const row = owner.locator(`tr[data-row-key="${account.id}"]`);
    await expect(row).toContainText(account.email);
    await row.locator('[data-selection] input').check();
  }
  expect(await owner.locator('tbody [data-selection] input:checked').count()).toBe(10);
  await owner.getByRole('button', { name: 'Delete', exact: true }).click();
  const deletion = page.waitForResponse(
    (value) =>
      value.request().method() === 'POST' && value.url().includes('/api/management/users/'),
  );
  await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
  const deleted = await deletion;
  expect(deleted.status()).toBe(200);
  const result = (await deleted.json()) as { deleted: { account_id: number }[] };
  expect(result.deleted.map((item) => item.account_id).sort((a, b) => a - b)).toEqual(
    manifest.accounts
      .filter((item) => item.delete)
      .map((item) => item.id)
      .sort((a, b) => a - b),
  );
  await expect(owner.locator('tbody tr[data-row-key]')).toHaveCount(10);
  await page.screenshot({
    path: info.outputPath('ten-test-accounts-retained.png'),
    fullPage: true,
  });
  writeFileSync(
    join(directory, 'deletion.verified.json'),
    JSON.stringify({
      deleted: result.deleted,
      retained: manifest.accounts.filter((item) => !item.delete).map((item) => item.id),
    }),
    { mode: 0o600 },
  );
});

// Follow-ups run after the twenty-owner edit pass and the exact ten-account deletion.
test('real follow-up: monitoring uses live HTTP and Socket.IO data', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await signIn(page, manifest.accounts[0]!);
  const traffic = page.waitForResponse((response) =>
    response.url().includes('/api/monitor/traffic'),
  );
  await page.goto('/en/management/monitoring');
  expect((await traffic).status()).toBe(200);
  await expect(page.locator('[data-monitor-overview]')).toBeVisible();
  await page.getByRole('link', { name: 'Workers', exact: true }).click();
  await expect(page.locator('[data-monitor-workspace]')).toHaveAttribute(
    'data-monitor-view',
    'workers',
  );
  await expect(page.locator('[data-worker-status]').first()).toBeVisible();
  await expect(page.locator('[data-worker-status]').first()).not.toHaveAttribute(
    'data-worker-status',
    'unknown',
  );
  await page.getByRole('link', { name: 'Requests', exact: true }).click();
  await expect(page.locator('[data-monitor-workspace]')).toHaveAttribute(
    'data-monitor-view',
    'requests',
  );
  expect(errors).toEqual([]);
  await page.screenshot({ path: info.outputPath('real-monitor-requests.png'), fullPage: true });
});

test('real follow-up: retained owner uses the offline location modal on a phone', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, manifest.accounts[1]!);
  await page.goto('/en/profile?section=experience');
  await page
    .locator('[data-experience-editor-row]')
    .first()
    .getByRole('button', { name: /^Edit / })
    .click();
  const before = await page.getByLabel('Latitude', { exact: true }).inputValue();
  await page.getByRole('button', { name: 'Choose on map', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('.leaflet-container')).toBeVisible();
  await dialog.getByLabel('Search cities offline', { exact: true }).fill('Taipei');
  await expect(dialog.getByRole('button', { name: /Taipei/ }).first()).toBeVisible();
  await page.screenshot({ path: info.outputPath('real-mobile-offline-map.png'), fullPage: true });
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByLabel('Latitude', { exact: true })).toHaveValue(before);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
});

// Only this synthetic manager account changes assignment; no shared role is edited or deleted.
test('real follow-up: QA manager self-demotion revokes management access', async ({ page }) => {
  expect(existsSync(join(directory, 'deletion.verified.json'))).toBe(true);
  const account = manifest.accounts[0]!;
  await signIn(page, account);
  const owner = await management(page, 'users');
  const member = manifest.accounts[1]!;
  const guest = await requestFactory.newContext({ baseURL: new URL(page.url()).origin });
  try {
    for (const active of [false, true]) {
      await owner
        .locator(`tr[data-row-key="${member.id}"]`)
        .locator('button[value="edit"]')
        .click();
      const editor = page.getByRole('dialog');
      await editor.getByRole('switch', { name: 'Edit Active', exact: true }).setChecked(active);
      await editor.getByRole('button', { name: 'Save', exact: true }).click();
      const change = page.waitForResponse(
        (response) =>
          response.request().method() === 'PATCH' &&
          response.url().endsWith(`/api/management/users/${member.id}`),
      );
      await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
      expect((await change).status()).toBe(200);
      await expect(page.getByRole('dialog')).toHaveCount(0);
      const login = await guest.post('/api/authority/sign-in', {
        data: { email: member.email, password: member.password },
      });
      expect(login.status()).toBe(active ? 200 : 401);
    }
    expect((await guest.post('/api/authority/sign-out')).status()).toBe(200);
  } finally {
    await guest.dispose();
  }
  const row = owner.locator(`tr[data-row-key="${account.id}"]`);
  await row.locator('button[value="edit"]').click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: /^Edit Role/ }).click();
  await page.getByRole('option', { name: manifest.roles.alternate!.name, exact: true }).click();
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  const changed = page.waitForResponse(
    (response) =>
      response.request().method() === 'PATCH' &&
      response.url().endsWith(`/api/management/users/${account.id}`),
  );
  await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
  expect((await changed).status()).toBe(200);
  const session = await page.request.get('/api/authority/session');
  expect((await session.json()).is_manage_users).toBe(false);
  expect((await page.request.get('/api/management/users')).status()).toBe(403);
  expect((await page.request.get('/api/portfolio/me/site')).status()).toBe(200);
  writeFileSync(
    join(directory, 'security.verified.json'),
    JSON.stringify({ managerDemoted: true, sharedRolesChanged: false, userManagementDenied: true }),
    { mode: 0o600 },
  );
});
