import { expect, test, type Page } from '@playwright/test';
import { resolve } from 'node:path';
import { openEditor, field } from '../fixtures/profile-editor';
import { ownerProfileSnapshot } from '../fixtures/profile-owner';

const images = resolve('../docs/images');
const permissions = {
  is_monitor: true,
  is_manage_sites: true,
  is_manage_roles: true,
  is_manage_users: true,
};

/** Capture real UI with synthetic owner records; documentation never writes to the configured backend. */
async function prepare(page: Page, section: string, width = 1440) {
  await page.setViewportSize({ width, height: width < 500 ? 1000 : 1100 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const snapshot = ownerProfileSnapshot('alex');
  if (section === 'skills') {
    // Public fixtures repeat labels across categories; the owner editor requires globally unique names.
    Object.values(snapshot.skills).forEach((skill, index) => {
      const label = `Example skill ${index + 1}`;
      skill.label = label;
      skill.labels = { en: label, 'zh-Hans': label, 'zh-Hant': label };
    });
    const category = snapshot.categories[snapshot.categoryOrder[0]!]!;
    const names = [
      'Python',
      'FastAPI',
      'Django',
      'Django REST Framework',
      'Flask',
      'REST',
      'gRPC',
      'Groovy',
      'SQLAlchemy',
      'PostgreSQL',
      'Redis',
      'Docker',
      'Kubernetes',
      'OpenAPI',
    ];
    category.names = { en: 'Backend & APIs', 'zh-Hans': '后端与 API', 'zh-Hant': '後端與 API' };
    category.skillIds.forEach((id, index) => {
      const label = names[index % names.length]!;
      snapshot.skills[id]!.label = label;
      snapshot.skills[id]!.labels = { en: label, 'zh-Hans': label, 'zh-Hant': label };
    });
    // Populate genuine references in the normalized fixture, rather than fabricating a usage count.
    for (const record of [
      ...Object.values(snapshot.experiences),
      ...Object.values(snapshot.projects),
    ])
      record.skillIds = [category.skillIds[0]!];
  }
  await openEditor(page, `/en/profile?section=${section}`, 'mint', {
    existingApi: true,
    permissions,
    snapshot,
  });
  await page.evaluate(() => document.fonts.ready);
}

test('capture Profile workspace, content language and unsaved homepage preview', async ({
  page,
}) => {
  await prepare(page, 'overview');
  await page.screenshot({ path: resolve(images, 'profile-workspace.png') });
  const language = page.getByRole('button', { name: 'Content language', exact: true });
  await language.click();
  const menu = page.locator('.dropdown-menu.show[aria-label="Website language"]');
  await expect(menu).toBeVisible();
  const triggerBounds = (await language.boundingBox())!;
  const menuBounds = (await menu.boundingBox())!;
  const x = Math.min(triggerBounds.x, menuBounds.x) - 8;
  const y = triggerBounds.y - 8;
  await page.screenshot({
    path: resolve(images, 'profile-language.png'),
    clip: {
      x,
      y,
      width:
        Math.max(triggerBounds.x + triggerBounds.width, menuBounds.x + menuBounds.width) - x + 8,
      height: menuBounds.y + menuBounds.height - y + 8,
    },
  });
  await page.keyboard.press('Escape');
  await field(page, 'First name').fill('Unsaved preview');
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  const preview = page.getByRole('dialog', { name: 'Showcase preview', exact: true });
  await expect(preview).toContainText('Unsaved preview');
  await preview.screenshot({ path: resolve(images, 'profile-preview.png') });
});

test('capture project pagination, shared swipe actions and drag deletion highlight', async ({
  page,
}) => {
  await prepare(page, 'projects');
  const rows = page.locator('[data-project-editor-row]');
  await expect(rows).toHaveCount(6);
  await page.screenshot({ path: resolve(images, 'profile-projects.png') });
  await rows
    .first()
    .getByRole('button', { name: /^Project actions:/ })
    .click();
  await expect(rows.first()).toHaveAttribute('data-swipe-open', 'true');
  await rows.first().screenshot({ path: resolve(images, 'profile-swipe-actions.png') });
  await page.keyboard.press('Escape');
  const handle = rows.first().getByRole('button', { name: /^Drag .* to reorder$/ });
  const target = page.getByRole('button', { name: 'Delete selected', exact: true });
  await handle.scrollIntoViewIfNeeded();
  const grip = (await handle.boundingBox())!;
  const card = (await rows.first().boundingBox())!;
  const drop = (await target.boundingBox())!;
  const x = grip.x + grip.width / 2;
  const y = grip.y + grip.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, drop.y + drop.height - 2 + y - card.y, { steps: 12 });
  await expect(target).toHaveAttribute('data-delete-drop-over', 'true');
  await page.screenshot({ path: resolve(images, 'profile-drag-delete.png') });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await page.getByRole('combobox', { name: 'Rows per page', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: resolve(images, 'profile-pagination.png') });
});

test('capture normalized skill categories and shared skill usage', async ({ page }) => {
  await prepare(page, 'skills');
  await expect(page.getByLabel('Category name')).toBeEnabled();
  await expect(
    page.getByText('Another skill already uses this name.', { exact: true }),
  ).toHaveCount(0);
  await page.screenshot({ path: resolve(images, 'profile-skills.png'), fullPage: true });
});

test('capture the mobile editor and offline location picker', async ({ page }) => {
  await prepare(page, 'projects', 390);
  await page.screenshot({ path: resolve(images, 'profile-mobile.png') });
  await page.goto('/en/profile?section=experience');
  const row = page.locator('[data-experience-editor-row]').first();
  await row.getByRole('button', { name: /^Experience actions:/ }).click();
  await row.getByRole('button', { name: /^Edit / }).click();
  await page.getByRole('button', { name: 'Choose on map', exact: true }).click();
  const modal = page.getByRole('dialog');
  await expect(modal.locator('.leaflet-container')).toBeVisible();
  await modal.getByLabel('Search cities offline', { exact: true }).fill('Taipei');
  await expect(modal.getByRole('button', { name: /Taipei/ }).first()).toBeVisible();
  await modal.screenshot({ path: resolve(images, 'profile-location-mobile.png') });
});
