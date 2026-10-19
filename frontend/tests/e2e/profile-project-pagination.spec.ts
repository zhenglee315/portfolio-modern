import { expect, type Locator, type Page } from '@playwright/test';
import { runtimeTest as test } from '../fixtures/browser';
import { openEditor, save, field, reorderPoints } from '../fixtures/profile-editor';

for (const width of [390, 1600]) {
  test(`adjustable project size retains selections and unsaved data at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1100 });
    const reads: string[] = [];
    const writes: { project_scope: { loaded_ids: string[]; order: string[] } }[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.pathname.endsWith('/portfolio/me/projects')) reads.push(url.search);
      if (url.pathname.endsWith('/portfolio/site/save')) writes.push(request.postDataJSON());
    });
    await openEditor(page, '/en/profile?section=projects', 'mist', { existingApi: true });
    const rows = page.locator('[data-project-editor-row]');
    const size = page.getByRole('combobox', { name: 'Rows per page', exact: true });
    await rows.first().getByRole('checkbox').check();
    await rows.first().getByRole('switch').uncheck();
    await size.selectOption('10');
    await expect(rows).toHaveCount(10);
    expect(reads).toContain('?page=1&size=10');
    await expect(page).toHaveURL(/projectSize=10/);
    await expect(rows.first().getByRole('checkbox')).toBeChecked();
    await expect(rows.first().getByRole('switch')).not.toBeChecked();
    await page.getByRole('checkbox', { name: 'Select all on this page', exact: true }).check();
    await expect(rows.getByRole('checkbox', { checked: true })).toHaveCount(10);
    await size.selectOption('6');
    await expect(rows).toHaveCount(6);
    await expect(page.getByText('10 selected', { exact: true })).toBeVisible();
    await save(page);
    expect(writes[0]?.project_scope.loaded_ids).toHaveLength(10);
    expect(writes[0]?.project_scope.order).toHaveLength(15);
    await page.reload();
    await expect(rows.first().getByRole('switch')).not.toBeChecked();
    const address = page.url();
    await page.getByRole('button', { name: 'Preview', exact: true }).click();
    const modal = page.getByRole('dialog', { name: 'Showcase preview', exact: true });
    await modal.getByRole('combobox', { name: 'Rows per page', exact: true }).selectOption('10');
    // Homepage preview keeps its native six-card disclosure before revealing the rest of this page.
    await modal.getByRole('button', { name: 'Show more projects 3', exact: true }).click();
    await expect(modal.locator('[data-draft-section="projects"] [data-project-id]')).toHaveCount(9);
    await expect(page).toHaveURL(address);
    await modal.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(size).toHaveValue('6');
    await size.selectOption('25');
    await expect(rows).toHaveCount(15);
    await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeDisabled();
    await page.reload();
    await expect(size).toHaveValue('25');
    await expect(rows).toHaveCount(15);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    );
  });
}

/** Swipe real card content, leaving the grip and top controls to their independent handlers. */
async function swipeProject(page: Page, card: Locator, dx: number) {
  const title = card.locator('[data-editor-eyebrow]');
  await title.scrollIntoViewIfNeeded();
  const box = (await title.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2, { steps: 12 });
  await page.mouse.up();
}

for (const width of [390, 1600]) {
  test(`project swipe and keyboard disclosure delete only the confirmed card at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 1100 });
    const writes: unknown[] = [];
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.endsWith('/portfolio/site/save'))
        writes.push(request.postDataJSON());
    });
    await openEditor(page, '/en/profile?section=projects', 'mist', { existingApi: true });
    const rows = page.locator('[data-reorder-list="projects"] [data-project-editor-row]');
    const first = rows.first();
    const menu = first.getByRole('button', { name: 'Project actions: en Project 1', exact: true });
    const remove = first.getByRole('button', { name: 'Delete project: en Project 1', exact: true });
    await expect(remove).toHaveCount(0);
    await first.getByRole('checkbox').check();
    await swipeProject(page, first, -100);
    await expect(first).toHaveAttribute('data-swipe-open', 'true');
    await expect(remove).toBeVisible();
    await expect(first.getByRole('checkbox')).toBeChecked();
    await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeDisabled();
    await page.screenshot({ path: info.outputPath('project-swipe-delete.png') });
    await remove.click();
    const dialog = page.getByRole('dialog');
    await expect(rows).toHaveCount(6);
    await dialog.getByRole('button', { name: 'Keep editing', exact: true }).last().click();
    await expect(first).toHaveAttribute('data-project-editor-row', 'project:1');
    await page.keyboard.press('Escape');
    await expect(first).toHaveAttribute('data-swipe-open', 'false');
    await expect(menu).toBeFocused();
    await menu.press('Enter');
    await expect(first.getByRole('button', { name: 'Edit', exact: true })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(remove).toBeFocused();
    await remove.press('Escape');
    await expect(first).toHaveAttribute('data-swipe-open', 'false');
    await swipeProject(page, first, -100);
    await swipeProject(page, rows.nth(1), -100);
    await expect(first).toHaveAttribute('data-swipe-open', 'false');
    await expect(rows.nth(1)).toHaveAttribute('data-swipe-open', 'true');
    await swipeProject(page, first, -100);
    await remove.click();
    await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(rows.first()).toHaveAttribute('data-project-editor-row', 'project:2');
    await expect(page.getByText('0 selected', { exact: true })).toBeVisible();
    expect(writes).toHaveLength(0);
    await save(page);
    await page.reload();
    await expect(rows.first()).toHaveAttribute('data-project-editor-row', 'project:2');
    expect(writes).toHaveLength(1);
  });
}

test('draft preview pages privately without changing the project editor URL or submitting edits', async ({
  page,
}) => {
  const reads: number[] = [];
  const writes: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname.endsWith('/portfolio/me/projects'))
      reads.push(Number(url.searchParams.get('page')));
    if (request.method() !== 'GET' && url.pathname.startsWith('/api/portfolio/'))
      writes.push(url.pathname);
  });
  await openEditor(page, '/en/profile?section=projects&projectPage=2&edit=project%3A7', 'mist', {
    existingApi: true,
  });
  await field(page, 'Project name').fill('Unsaved chapter seven');
  const address = page.url();
  const trigger = page.getByRole('button', { name: 'Preview', exact: true });
  await trigger.click();
  const modal = page.getByRole('dialog', { name: 'Showcase preview', exact: true });
  const projects = modal.locator('[data-draft-section="projects"]');
  await expect(projects.locator('[data-project-id]')).toHaveCount(6);
  await expect(projects).not.toContainText('Unsaved chapter seven');
  await modal
    .getByRole('navigation', { name: 'Project pagination', exact: true })
    .getByRole('button', { name: 'Page 2', exact: true })
    .click();
  await expect(
    projects.getByRole('heading', { name: 'Unsaved chapter seven', exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(address);
  expect(reads).toEqual([1, 2]);
  expect(writes).toEqual([]);
  await modal.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(trigger).toBeFocused();
  await expect(field(page, 'Project name')).toHaveValue('Unsaved chapter seven');
  await expect(page).toHaveURL(address);
  await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeEnabled();
});

for (const width of [390, 1600]) {
  test(`project API paging, page selection and draft bulk deletion work at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 1100 });
    const reads: number[] = [];
    const writes: Record<string, unknown>[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.pathname.endsWith('/portfolio/me/projects')) {
        expect(url.searchParams.get('size')).toBe('6');
        reads.push(Number(url.searchParams.get('page')));
      }
      if (url.pathname.endsWith('/portfolio/site/save')) writes.push(request.postDataJSON());
    });
    await openEditor(page, '/en/profile?section=projects', 'mist', { existingApi: true });
    const rows = page.locator('[data-project-editor-row]');
    const pagination = page.getByRole('navigation', { name: 'Project pagination', exact: true });
    const all = page.getByRole('checkbox', { name: 'Select all on this page', exact: true });
    await expect(rows).toHaveCount(6);
    expect(reads).toEqual([1]);
    await rows.first().getByRole('checkbox').check();
    await expect(all).toHaveJSProperty('indeterminate', true);
    await expect(page.getByText('1 selected', { exact: true })).toBeVisible();
    await all.check();
    await expect(rows.getByRole('checkbox', { checked: true })).toHaveCount(6);
    await all.uncheck();
    await rows.first().getByRole('checkbox').check();
    await pagination.getByRole('button', { name: 'Page 2', exact: true }).click();
    await expect(rows).toHaveCount(6);
    await expect(rows.first()).toHaveAttribute('data-project-editor-row', 'project:7');
    expect(reads).toEqual([1, 2]);
    await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeDisabled();
    await rows.first().getByRole('checkbox').check();
    await expect(page.getByText('2 selected', { exact: true })).toBeVisible();
    await pagination.getByRole('button', { name: 'Page 1', exact: true }).click();
    await expect(rows.first()).toHaveAttribute('data-project-editor-row', 'project:1');
    await expect(rows.first().getByRole('checkbox')).toBeChecked();
    await page.getByRole('button', { name: 'Delete selected', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('2 selected project(s)');
    await dialog.getByRole('button', { name: 'Keep editing', exact: true }).last().click();
    await expect(rows).toHaveCount(6);
    expect(writes).toHaveLength(0);
    await page.getByRole('button', { name: 'Delete selected', exact: true }).click();
    await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(rows.first()).toHaveAttribute('data-project-editor-row', 'project:2');
    await expect(page.getByText('0 selected', { exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath('project-paged-selection.png') });
    await save(page);
    expect(writes).toHaveLength(1);
    const body = writes[0] as {
      draft: { projects: Record<string, unknown> };
      project_scope: { loaded_ids: string[]; order: string[] };
    };
    expect(Object.keys(body.draft.projects)).toHaveLength(10);
    expect(body.project_scope.loaded_ids).toHaveLength(12);
    expect(body.project_scope.order).toHaveLength(13);
    expect(reads).not.toContain(3);
    await page.reload();
    await expect(rows).toHaveCount(6);
    await expect(rows.first()).toHaveAttribute('data-project-editor-row', 'project:2');
    await pagination.getByRole('button', { name: 'Page 3', exact: true }).click();
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toHaveAttribute('data-project-editor-row', 'project:15');
    await rows
      .first()
      .getByRole('button', { name: 'Project actions: en Project 15', exact: true })
      .click();
    await rows.first().getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(field(page, 'Technical approach')).toHaveValue('Typed boundaries.');
  });
}

test('card deletion, trailing-page clamping and forbidden delete controls preserve other drafts', async ({
  page,
}) => {
  await openEditor(page, '/en/profile?section=projects&projectPage=3', 'mint', {
    existingApi: true,
  });
  const rows = page.locator('[data-project-editor-row]');
  await expect(rows).toHaveCount(3);
  await page.getByRole('checkbox', { name: 'Select all on this page', exact: true }).check();
  await page.getByRole('button', { name: 'Delete selected', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(rows).toHaveCount(6);
  await expect(rows.first()).toHaveAttribute('data-project-editor-row', 'project:7');
  await rows
    .first()
    .getByRole('button', { name: 'Project actions: en Project 7', exact: true })
    .click();
  await rows
    .first()
    .getByRole('button', { name: 'Delete project: en Project 7', exact: true })
    .click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(rows).toHaveCount(5);
  await expect(rows.first()).toHaveAttribute('data-project-editor-row', 'project:8');
  await page.getByRole('button', { name: 'Cancel changes', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Discard changes', exact: true })
    .click();
  await expect(rows).toHaveCount(3);
  await expect(rows.first()).toHaveAttribute('data-project-editor-row', 'project:13');
});

test('read-only owners can page through projects while write and delete controls stay disabled', async ({
  page,
}) => {
  await openEditor(page, '/en/profile?section=projects', 'mint', {
    existingApi: true,
    permissions: { is_update: false },
  });
  const rows = page.locator('[data-project-editor-row]');
  await expect(page.getByRole('button', { name: 'Add project', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Delete selected', exact: true })).toBeDisabled();
  await expect(
    page.getByRole('checkbox', { name: 'Select all on this page', exact: true }),
  ).toBeDisabled();
  await expect(rows.first().getByRole('switch')).toBeDisabled();
  await expect(
    rows.first().getByRole('button', { name: 'Drag en Project 1 to reorder', exact: true }),
  ).toBeDisabled();
  await page
    .getByRole('navigation', { name: 'Project pagination', exact: true })
    .getByRole('button', { name: 'Page 2', exact: true })
    .click();
  await expect(rows).toHaveCount(6);
  await expect(rows.first()).toHaveAttribute('data-project-editor-row', 'project:7');
  await rows
    .first()
    .getByRole('button', { name: 'Project actions: en Project 7', exact: true })
    .click();
  await expect(
    rows.first().getByRole('button', { name: 'Delete project: en Project 7', exact: true }),
  ).toBeDisabled();
});

for (const width of [390, 820, 1600]) {
  test(`project cards lift at the grab point and preserve scoped page data at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 1100 });
    const reads: number[] = [];
    const writes: Record<string, unknown>[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.pathname.endsWith('/portfolio/me/projects'))
        reads.push(Number(url.searchParams.get('page')));
      if (url.pathname.endsWith('/portfolio/site/save')) writes.push(request.postDataJSON());
    });
    await openEditor(page, '/en/profile?section=projects&projectPage=2', 'mist', {
      existingApi: true,
    });
    const list = page.locator('[data-reorder-list="projects"]');
    const rows = list.locator('[data-project-editor-row]');
    const source = list.locator('[data-reorder-id="project:8"]');
    const target = list.locator('[data-reorder-id="project:7"]');
    await expect(rows).toHaveCount(6);
    const handle = source.getByRole('button', {
      name: 'Drag en Project 8 to reorder',
      exact: true,
    });
    const eyebrow = (await source.locator('[data-editor-eyebrow]').boundingBox())!;
    const grip = (await handle.boundingBox())!;
    const check = (await source.getByRole('checkbox').boundingBox())!;
    const toggle = (await source.getByRole('switch').boundingBox())!;
    expect(grip.x + grip.width).toBeLessThanOrEqual(eyebrow.x);
    expect(grip.y + grip.height / 2).toBeGreaterThanOrEqual(eyebrow.y);
    expect(grip.y + grip.height / 2).toBeLessThanOrEqual(eyebrow.y + eyebrow.height);
    expect(check.x).toBeLessThan(toggle.x);
    expect(check.x + check.width).toBeLessThan(grip.x);
    expect(check.y + check.height / 2).toBeCloseTo(grip.y + grip.height / 2, 0);
    expect(toggle.y + toggle.height / 2).toBeCloseTo(grip.y + grip.height / 2, 0);
    await source.getByRole('checkbox').check();
    const add = page.getByRole('button', { name: 'Add project', exact: true });
    await expect(add.locator('[data-icon-pulse="disclosure"]')).toHaveCount(2);
    await expect(add.locator('[data-icon-group]')).toHaveCSS('border-top-style', 'dashed');
    const points = await reorderPoints(
      source.getByRole('button', { name: 'Drag en Project 8 to reorder', exact: true }),
      target,
      'vertical',
    );
    const original = (await source.boundingBox())!;
    const destination = (await target.boundingBox())!;
    await page.mouse.move(points.from.x, points.from.y);
    await page.mouse.down();
    await page.mouse.move(points.to.x, points.to.y, { steps: 12 });
    const ghost = page.locator('[data-reorder-ghost]');
    await expect(ghost).toBeVisible();
    const lifted = (await ghost.boundingBox())!;
    expect(lifted.width).toBeCloseTo(original.width, 0);
    expect(lifted.height).toBeCloseTo(original.height, 0);
    expect(lifted.x).toBeCloseTo(points.to.x - (points.from.x - original.x), 0);
    expect(lifted.y).toBeCloseTo(points.to.y - (points.from.y - original.y), 0);
    await expect(ghost).toContainText('en Project 8');
    await expect(ghost.locator('input[type="checkbox"]:not([role="switch"])')).toBeChecked();
    await expect(source).toHaveAttribute('data-reorder-placeholder', 'true');
    await expect(source).toHaveCSS('border-top-style', 'dashed');
    expect(await source.evaluate((node) => getComputedStyle(node).backgroundImage)).toContain(
      'linear-gradient',
    );
    const slot = (await source.boundingBox())!;
    expect(slot.x).toBeCloseTo(destination.x, 0);
    expect(slot.y).toBeCloseTo(destination.y, 0);
    expect(slot.height).toBeCloseTo(original.height, 0);
    await expect(rows.first()).toHaveAttribute('data-reorder-id', 'project:7');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    );
    await page.screenshot({ path: info.outputPath('whole-project-drag.png') });
    await page.mouse.up();
    await expect(ghost).toHaveCount(0);
    await expect(rows.first()).toHaveAttribute('data-reorder-id', 'project:8');
    await expect(source.getByRole('checkbox')).toBeChecked();
    const dropped = (await source.boundingBox())!;
    expect(dropped.y).toBeCloseTo(slot.y, 0);
    await page.screenshot({ path: info.outputPath('project-dropped.png') });
    expect(writes).toHaveLength(0);
    expect(reads).toEqual([1, 2]);
    await save(page);
    const body = writes[0] as {
      draft: { projects: Record<string, unknown> };
      project_scope: { loaded_ids: string[]; order: string[] };
    };
    expect(Object.keys(body.draft.projects)).toHaveLength(12);
    expect(body.project_scope.loaded_ids).toHaveLength(12);
    expect(body.project_scope.order).toEqual(
      [1, 2, 3, 4, 5, 6, 8, 7, 9, 10, 11, 12, 13, 14, 15].map((id) => `project:${id}`),
    );
    await page.reload();
    await expect(rows.first()).toHaveAttribute('data-reorder-id', 'project:8');
    expect(reads).toEqual([1, 2, 1, 2]);
  });
}

test('project drag cancellation and keyboard boundary moves preserve unvisited projects', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 1100 });
  const reads: number[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname.endsWith('/portfolio/me/projects'))
      reads.push(Number(url.searchParams.get('page')));
  });
  await openEditor(page, '/en/profile?section=projects&projectPage=2', 'mint', {
    existingApi: true,
  });
  const list = page.locator('[data-reorder-list="projects"]');
  const source = list.locator('[data-reorder-id="project:8"]');
  const points = await reorderPoints(
    source.getByRole('button', { name: 'Drag en Project 8 to reorder', exact: true }),
    list.locator('[data-reorder-id="project:7"]'),
    'vertical',
  );
  await page.mouse.move(points.from.x, points.from.y);
  await page.mouse.down();
  await page.mouse.move(points.to.x, points.to.y, { steps: 12 });
  await expect(page.locator('[data-reorder-ghost]')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(page.locator('[data-reorder-ghost]')).toHaveCount(0);
  await expect(list.locator('[data-reorder-id]').first()).toHaveAttribute(
    'data-reorder-id',
    'project:7',
  );
  await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeDisabled();
  const handle = page.getByRole('button', { name: 'Drag en Project 7 to reorder', exact: true });
  await handle.focus();
  await page.keyboard.press('ArrowUp');
  await expect(page).toHaveURL(/projectPage=1/);
  await expect(list.locator('[data-reorder-id]').last()).toHaveAttribute(
    'data-reorder-id',
    'project:7',
  );
  await expect(handle).toBeFocused();
  expect(reads).toEqual([1, 2]);
  // The same focused handle can cross back without requesting the already visited page again.
  await page.keyboard.press('ArrowDown');
  await expect(page).toHaveURL(/projectPage=2/);
  await expect(list.locator('[data-reorder-id]').first()).toHaveAttribute(
    'data-reorder-id',
    'project:7',
  );
  await expect(handle).toBeFocused();
  expect(reads).toEqual([1, 2]);
  await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeDisabled();
});

test.describe('touch project sorting', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 1100 } });
  test('touch project swipes reveal deletion while top controls and vertical scroll remain independent', async ({
    page,
  }) => {
    await openEditor(page, '/en/profile?section=projects', 'mist', { existingApi: true });
    const card = page.locator('[data-project-editor-row="project:1"]');
    const cdp = await page.context().newCDPSession(page);
    const gesture = async (dx: number, dy = 0, cancel = false) => {
      const title = card.locator('[data-editor-eyebrow]');
      await title.scrollIntoViewIfNeeded();
      const box = (await title.boundingBox())!;
      const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ ...from, id: 1 }],
      });
      for (let step = 1; step <= 12; step++)
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x: from.x + (dx * step) / 12, y: from.y + (dy * step) / 12, id: 1 }],
        });
      await cdp.send('Input.dispatchTouchEvent', {
        type: cancel ? 'touchCancel' : 'touchEnd',
        touchPoints: [],
      });
    };
    await card.getByRole('checkbox').check();
    await card.getByRole('switch').uncheck();
    await expect(card).toHaveAttribute('data-swipe-open', 'false');
    await gesture(-100, 0, true);
    await expect(card).toHaveAttribute('data-swipe-open', 'false');
    await gesture(-100);
    await expect(card).toHaveAttribute('data-swipe-open', 'true');
    await expect(
      card.getByRole('button', { name: 'Delete project: en Project 1', exact: true }),
    ).toBeVisible();
    await gesture(100);
    await expect(card).toHaveAttribute('data-swipe-open', 'false');
    const before = await page.evaluate(() => scrollY);
    await gesture(0, -90);
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(before + 20);
    await expect(card.getByRole('checkbox')).toBeChecked();
    await expect(card.getByRole('switch')).not.toBeChecked();
    await expect(page.locator('[data-reorder-ghost]')).toHaveCount(0);
  });
  test('project handles capture touch while keeping complete cards and draft selection', async ({
    page,
  }) => {
    await openEditor(page, '/en/profile?section=projects', 'sand', { existingApi: true });
    const list = page.locator('[data-reorder-list="projects"]');
    const source = list.locator('[data-reorder-id="project:2"]');
    await source.getByRole('checkbox').check();
    const points = await reorderPoints(
      source.getByRole('button', { name: 'Drag en Project 2 to reorder', exact: true }),
      list.locator('[data-reorder-id="project:1"]'),
      'vertical',
    );
    const cdp = await page.context().newCDPSession(page);
    const scroll = await page.evaluate(() => scrollY);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ ...points.from, id: 1 }],
    });
    for (let step = 1; step <= 14; step++)
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [
          {
            x: points.from.x + ((points.to.x - points.from.x) * step) / 14,
            y: points.from.y + ((points.to.y - points.from.y) * step) / 14,
            id: 1,
          },
        ],
      });
    await expect(page.locator('[data-reorder-ghost]')).toBeVisible();
    expect(await page.evaluate(() => scrollY)).toBeCloseTo(scroll, 0);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(list.locator('[data-reorder-id]').first()).toHaveAttribute(
      'data-reorder-id',
      'project:2',
    );
    await expect(source.getByRole('checkbox')).toBeChecked();
    await expect(page.locator('[data-reorder-ghost]')).toHaveCount(0);
  });
});
