import { expect, type Locator } from '@playwright/test';
import { runtimeTest as test } from '../fixtures/browser';
import {
  draftKey,
  openEditor,
  tab,
  field,
  save,
  reorderPoints,
  editExperience,
  contentLanguage,
} from '../fixtures/profile-editor';

for (const width of [390, 1600]) {
  for (const theme of ['mist', 'amber']) {
    test(`content language reuses the themed menu and retains draft/query state at ${width}px ${theme}`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width, height: 1100 });
      const writes: string[] = [];
      page.on('request', (request) => {
        if (request.url().endsWith('/portfolio/site/save')) writes.push(request.url());
      });
      await openEditor(page, '/en/profile?section=overview&projectPage=2&projectSize=10', theme);
      await field(page, 'First name').fill('Menu draft');
      const trigger = page.getByRole('button', { name: 'Content language', exact: true });
      const choice = (locale: string) => page.locator(`[data-locale="${locale}"]`);
      await expect(page.locator('select[aria-label="Content language"]')).toHaveCount(0);
      await expect(trigger).toHaveText('English');
      const address = page.url();
      await trigger.click();
      await expect(choice('en')).toBeFocused();
      await expect(choice('en')).toHaveAttribute('aria-current', 'true');
      await page.keyboard.press('ArrowUp');
      await expect(choice('zh-Hant')).toBeFocused();
      await expect(page).toHaveURL(address);
      await page.keyboard.press('Home');
      await expect(choice('en')).toBeFocused();
      await page.keyboard.press('End');
      await expect(choice('zh-Hant')).toBeFocused();
      await page.screenshot({ path: info.outputPath('content-language-menu.png') });
      await page.keyboard.press('Escape');
      await expect(trigger).toBeFocused();
      await expect(trigger).toHaveAttribute('aria-expanded', 'false');
      await contentLanguage(page, 'zh-Hant');
      await expect(trigger).toHaveText('繁體中文');
      await expect(trigger).toHaveAttribute('aria-expanded', 'false');
      await expect(page).toHaveURL(
        (url) =>
          url.pathname === '/en/profile' &&
          url.searchParams.get('section') === 'overview' &&
          url.searchParams.get('projectPage') === '2' &&
          url.searchParams.get('projectSize') === '10' &&
          url.searchParams.get('contentLocale') === 'zh-Hant',
      );
      await expect(
        page.getByRole('heading', { name: 'Let people get to know you.', exact: true }),
      ).toBeVisible();
      await contentLanguage(page, 'en');
      await expect(field(page, 'First name')).toHaveValue('Menu draft');
      await trigger.click();
      await page.getByRole('heading', { name: 'Let people get to know you.', exact: true }).click();
      await expect(trigger).toHaveAttribute('aria-expanded', 'false');
      expect(writes).toEqual([]);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      ).toBe(true);
    });
  }
}

for (const width of [390, 1600]) {
  test(`experience cards reuse swipe deletion and drag while preserving linked projects at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 1100 });
    const writes: { draft: { projects: Record<string, { experienceId: string | null }> } }[] = [];
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.endsWith('/portfolio/site/save'))
        writes.push(request.postDataJSON());
    });
    await openEditor(page, '/en/profile?section=experience', 'mist');
    const rows = page.locator('[data-experience-editor-row]');
    const delta = page.locator('[data-experience-editor-row="experience:3"]');
    await expect(rows).toHaveCount(6);
    const add = page.getByRole('button', { name: 'Add experience', exact: true });
    await expect(add.locator('[data-icon-pulse="disclosure"]')).toHaveCount(2);
    const handle = delta.getByRole('button', {
      name: 'Drag Delta Electronics to reorder',
      exact: true,
    });
    const points = await reorderPoints(handle, rows.first(), 'vertical');
    await page.mouse.move(points.from.x, points.from.y);
    await page.mouse.down();
    await page.mouse.move(points.to.x, points.to.y, { steps: 12 });
    await expect(page.locator('[data-reorder-ghost]')).toContainText('Delta Electronics');
    await page.mouse.up();
    await expect(rows.first()).toHaveAttribute('data-experience-editor-row', 'experience:3');
    await delta.getByRole('checkbox').check();
    const remove = delta.getByRole('button', {
      name: 'Delete experience: Delta Electronics',
      exact: true,
    });
    await expect(remove).toHaveCount(0);
    const caption = delta.locator('[data-editor-eyebrow]');
    await caption.scrollIntoViewIfNeeded();
    const box = (await caption.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 - 100, box.y + box.height / 2, { steps: 12 });
    await page.mouse.up();
    await expect(remove).toBeVisible();
    await expect(delta.getByRole('checkbox')).toBeChecked();
    await delta.screenshot({ path: info.outputPath('experience-swipe-delete.png') });
    await remove.click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Keep editing', exact: true }).last().click();
    await expect(delta).toHaveCount(1);
    await page.keyboard.press('Escape');
    const menu = delta.getByRole('button', {
      name: 'Experience actions: Delta Electronics',
      exact: true,
    });
    await expect(menu).toBeFocused();
    await menu.press('Enter');
    await expect(
      delta.getByRole('button', { name: 'Edit Delta Electronics', exact: true }),
    ).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(remove).toBeFocused();
    await remove.click();
    await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(delta).toHaveCount(0);
    await expect(page.getByText('0 selected', { exact: true })).toBeVisible();
    expect(writes).toEqual([]);
    await save(page);
    expect(writes[0]?.draft.projects['project:1']?.experienceId).toBeNull();
    await page.reload();
    await expect(rows).toHaveCount(5);
    await expect(delta).toHaveCount(0);
  });
}

test('experience selections survive filters and share page-size and confirmed bulk deletion', async ({
  page,
}) => {
  await openEditor(page, '/en/profile?section=experience', 'mist');
  const rows = page.locator('[data-experience-editor-row]');
  await page.locator('[data-experience-editor-row="experience:3"]').getByRole('checkbox').check();
  await page.getByRole('button', { name: /^Education / }).click();
  await expect(rows).toHaveCount(2);
  await page.getByRole('checkbox', { name: 'Select all on this page', exact: true }).check();
  await expect(page.getByText('3 selected', { exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'Rows per page', exact: true }).selectOption('10');
  await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Delete selected', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('3 selected experience(s)');
  await dialog.getByRole('button', { name: 'Keep editing', exact: true }).last().click();
  await expect(rows).toHaveCount(2);
  await page.getByRole('button', { name: 'Delete selected', exact: true }).click();
  await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('button', { name: /^All / }).click();
  await expect(rows).toHaveCount(3);
  await expect(page.getByText('0 selected', { exact: true })).toBeVisible();
  await save(page);
  await page.reload();
  await expect(rows).toHaveCount(3);
});
import { ownerProfileSnapshot, ownerProfileResponse } from '../fixtures/profile-owner';

for (const help of [
  {
    topic: 'skillSorting',
    title: 'Skill ordering help',
    option: 'skillSortHelpAcknowledged',
    cookie: 'portfolio-profile-skill-sorting-help-v1',
    hint: 'Drag skill grips to arrange the display order.',
  },
  {
    topic: 'skillLibrary',
    title: 'Shared skills help',
    option: 'skillLibraryHelpAcknowledged',
    cookie: 'portfolio-profile-skill-library-help-v1',
    hint: 'Skill names are shared. Renaming updates every experience and project that uses the skill.',
  },
] as const) {
  for (const width of [390, 1600]) {
    test(`${help.topic} help shares reminder behavior and keeps its own cookie at ${width}px`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await openEditor(page, '/en/profile?section=skills', 'mist', { [help.option]: false });
      const trigger = page.getByRole('button', { name: help.title, exact: true });
      const panel = page.locator(`[data-profile-help="${help.topic}"]`);
      await trigger.scrollIntoViewIfNeeded();
      await expect(panel).toHaveAttribute('data-open', 'true');
      await expect(panel).toHaveCSS('opacity', '1');
      await expect(panel).toContainText(help.hint);
      await expect(page.locator('main')).not.toContainText(help.hint);
      const triggerBounds = (await trigger.boundingBox())!;
      if (help.topic === 'skillSorting') {
        const titleBounds = (await page
          .getByRole('heading', { name: 'Skills in this category', exact: true })
          .boundingBox())!;
        expect(triggerBounds.x).toBeGreaterThanOrEqual(titleBounds.x + titleBounds.width);
      } else {
        const inputBounds = (await field(page, 'Add skill').boundingBox())!;
        expect(triggerBounds.x + triggerBounds.width).toBeLessThanOrEqual(inputBounds.x);
        // The visible action names this row; the input retains its hidden accessible label.
        const label = page.locator('label').filter({ hasText: /^Add skill$/ });
        expect((await label.boundingBox())!.width).toBeLessThanOrEqual(1);
      }
      await panel.screenshot({ path: info.outputPath(`${help.topic}-help.png`) });
      await page.reload();
      await trigger.scrollIntoViewIfNeeded();
      await expect(panel).toHaveAttribute('data-open', 'true');
      await panel.getByRole('checkbox').check();
      const cookies = await page.context().cookies();
      expect(cookies.find((item) => item.name === help.cookie)?.value).toBe('acknowledged');
      expect(cookies.find((item) => item.name === 'portfolio-profile-help-v1')?.value).toBe(
        'acknowledged',
      );
      await page.mouse.move(0, 0);
      await page.reload();
      await trigger.scrollIntoViewIfNeeded();
      await expect(panel).toHaveAttribute('data-open', 'false');
      await trigger.hover();
      await expect(panel).toHaveCSS('opacity', '1');
      await expect(panel.getByRole('checkbox')).toBeChecked();
      await panel.hover();
      await page.mouse.move(0, 0);
      await expect(panel).toHaveAttribute('data-open', 'false');
      expect(
        await panel.evaluate((node) => Number(getComputedStyle(node).opacity)),
      ).toBeGreaterThan(0);
      await expect(panel).toHaveCSS('opacity', '0');
      if (help.topic === 'skillLibrary') {
        await field(page, 'Add skill').fill('A shared test skill');
        await page.getByRole('button', { name: 'Add skill', exact: true }).click();
        await expect(
          page
            .locator('[data-reorder-list="skills"]')
            .getByRole('button', { name: 'A shared test skill', exact: true }),
        ).toBeVisible();
      }
    });
  }
}

test('editing reminder fades on entry and departure, remembers acknowledgement and remains available', async ({
  page,
}, info) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await openEditor(page, '/en/profile?section=skills', 'mist', {
    helpAcknowledged: false,
    beforeNavigate: async () => {
      await page.addInitScript(() => {
        document.addEventListener('transitionrun', (event) => {
          if (
            event.target instanceof HTMLElement &&
            event.target.hasAttribute('data-profile-help') &&
            event.propertyName === 'opacity'
          )
            event.target.dataset.animated = 'true';
        });
      });
    },
  });
  const trigger = page.getByRole('button', { name: 'Editing reminder', exact: true });
  const panel = page.locator('[data-profile-help="editing"]');
  await expect(panel).toHaveAttribute('data-open', 'true');
  await expect(panel).toHaveAttribute('data-animated', 'true');
  await expect(panel).toHaveCSS('opacity', '1');
  await expect(panel).toContainText('Editing English content');
  await panel.screenshot({ path: info.outputPath('profile-help.png') });
  await trigger.hover();
  await panel.hover();
  await expect(panel).toHaveAttribute('data-open', 'true');
  await page.mouse.move(0, 0);
  await expect(panel).toHaveAttribute('data-open', 'false');
  // Departure uses the slow transition, rather than immediately unmounting the reminder.
  expect(await panel.evaluate((node) => Number(getComputedStyle(node).opacity))).toBeGreaterThan(0);
  await expect(panel).toHaveCSS('opacity', '0');
  await page.reload();
  await expect(panel).toHaveAttribute('data-open', 'true');
  await panel.getByRole('checkbox').check();
  const cookie = (await page.context().cookies()).find(
    (item) => item.name === 'portfolio-profile-help-v1',
  );
  expect(cookie?.value).toBe('acknowledged');
  expect(cookie?.sameSite).toBe('Lax');
  await page.mouse.move(0, 0);
  await expect(panel).toHaveCSS('opacity', '0');
  await page.reload();
  await expect(panel).toHaveAttribute('data-open', 'false');
  await trigger.hover();
  await expect(panel).toHaveAttribute('data-open', 'true');
  await expect(panel.getByRole('checkbox')).toBeChecked();
  await panel.getByRole('checkbox').uncheck();
  await page.reload();
  await expect(panel).toHaveAttribute('data-open', 'true');
});

test('editing reminder supports keyboard access, Escape and reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openEditor(page);
  const trigger = page.getByRole('button', { name: 'Editing reminder', exact: true });
  const panel = page.locator('[data-profile-help="editing"]');
  await trigger.focus();
  await trigger.press('ArrowDown');
  await expect(panel.getByRole('checkbox')).toBeFocused();
  await expect(panel).toHaveCSS('transition-duration', '0s');
  await page.keyboard.press('Escape');
  await expect(panel).toHaveAttribute('data-open', 'false');
  await expect(trigger).toBeFocused();
  await trigger.press('Enter');
  await expect(panel.getByRole('checkbox')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(panel).toHaveAttribute('data-open', 'false');
});

test.describe('touch editing reminder', () => {
  test.use({ hasTouch: true });
  test('tap opens a bounded reminder and outside tap dismisses it', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openEditor(page);
    const panel = page.locator('[data-profile-help="editing"]');
    await page.getByRole('button', { name: 'Editing reminder', exact: true }).tap();
    await expect(panel).toHaveCSS('opacity', '1');
    const bounds = (await panel.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
    await panel.getByRole('checkbox').tap();
    await expect(panel.getByRole('checkbox')).not.toBeChecked();
    await page.locator('h1').tap();
    await expect(panel).toHaveAttribute('data-open', 'false');
  });
});

for (const width of [390, 1600]) {
  test(`public skill preview opens beside the name input in a modal at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    const writes: string[] = [];
    page.on('request', (request) => {
      if (request.url().endsWith('/api/portfolio/site/save')) writes.push(request.url());
    });
    await openEditor(page, '/en/profile?section=skills', 'mist');
    const name = field(page, 'Skill name');
    const trigger = page.getByRole('button', { name: 'Public page preview', exact: true });
    await name.fill('Python preview draft');
    await trigger.scrollIntoViewIfNeeded();
    const inputBounds = (await name.boundingBox())!;
    const triggerBounds = (await trigger.boundingBox())!;
    expect(triggerBounds.x).toBeGreaterThanOrEqual(inputBounds.x + inputBounds.width);
    expect(Math.abs(triggerBounds.y - inputBounds.y)).toBeLessThan(2);
    await expect(page.locator('[data-profile-preview="skills"]')).toHaveCount(0);
    await trigger.click();
    const modal = page.getByRole('dialog', { name: 'Public page preview', exact: true });
    await expect(modal).toBeVisible();
    await expect(modal).toHaveCSS('opacity', '1');
    await expect(modal.locator('.modal-dialog')).toHaveCSS('transform', 'none');
    await expect(modal.getByRole('heading', { name: 'Backend & APIs', exact: true })).toBeVisible();
    await expect(modal).toContainText('Python preview draft');
    const bounds = (await modal.locator('.modal-content').boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    await modal.screenshot({ path: info.outputPath('public-skills-preview-modal.png') });
    const close = modal.getByRole('button', { name: 'Close', exact: true });
    await close.focus();
    await page.keyboard.press('Tab');
    await expect(close).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(modal).not.toBeVisible();
    await expect(trigger).toBeFocused();
    await trigger.click();
    await close.click();
    await expect(modal).not.toBeVisible();
    await expect(name).toHaveValue('Python preview draft');
    expect(writes).toEqual([]);
  });
}

for (const width of [390, 1600]) {
  test(`skill references paginate and reset for another skill at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1100 });
    const snapshot = ownerProfileSnapshot('alex', true);
    const category = snapshot.categories[snapshot.categoryOrder[0]!]!;
    const skillIds = category.skillIds.slice(0, 2);
    // All records reference both skills, spanning experience and project boundaries on page two.
    for (const entry of [
      ...Object.values(snapshot.experiences),
      ...Object.values(snapshot.projects),
    ])
      entry.skillIds = [...new Set([...entry.skillIds, ...skillIds])];
    await openEditor(page, '/en/profile?section=skills', 'mist', {
      existingApi: true,
      beforeNavigate: async () => {
        await page.route('**/api/portfolio/me/**', (route) =>
          route.fulfill({
            json: ownerProfileResponse(
              snapshot,
              new URL(route.request().url()).pathname,
              new URL(route.request().url()).searchParams,
            ),
          }),
        );
      },
    });
    const list = page.locator('[data-profile-skill-uses]');
    const pages = list.getByRole('navigation', { name: 'Skill usage pages' });
    await expect(list.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(5);
    const size = list.getByRole('combobox', { name: 'Rows per page', exact: true });
    await size.selectOption('10');
    await expect(list.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(10);
    await expect(pages.getByRole('button', { name: 'Page 1', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await size.selectOption('5');
    await expect(pages.getByRole('button', { name: 'Previous page' })).toBeDisabled();
    await pages.getByRole('button', { name: 'Next page' }).click();
    await expect(pages.getByRole('button', { name: 'Page 2', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
    const total = snapshot.experienceOrder.length + snapshot.projectOrder.length;
    const lastPage = Math.ceil(total / 5);
    await pages.getByRole('button', { name: `Page ${lastPage}`, exact: true }).click();
    await expect(list.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(
      total % 5 || 5,
    );
    await expect(pages.getByRole('button', { name: 'Next page' })).toBeDisabled();
    await page
      .locator('[data-reorder-list="skills"]')
      .getByRole('button', { name: snapshot.skills[skillIds[1]!]!.label, exact: true })
      .click();
    await expect(pages.getByRole('button', { name: 'Page 1', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await pages.getByRole('button', { name: `Page ${lastPage}`, exact: true }).click();
    await list.getByRole('button', { name: 'Edit', exact: true }).last().click();
    await expect(field(page, 'Project name')).toHaveValue(
      snapshot.projects[snapshot.projectOrder.at(-1)!]!.translations.en.name,
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    );
  });
}

test('sections fade out before swapping and settle on the last rapid selection', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await openEditor(page);
  const panel = page.locator('[data-profile-section]');
  // Observe actual browser transitions, not just classes or a fixed sleep.
  await panel.evaluate((element) => {
    const events: { section: string | undefined; outgoing: string | undefined }[] = [];
    element.addEventListener('transitionrun', (event) => {
      if (event.target === element && (event as TransitionEvent).propertyName === 'opacity') {
        const node = element as HTMLElement;
        events.push({ section: node.dataset.profileSection, outgoing: node.dataset.fading });
        node.dataset.fadeEvents = JSON.stringify(events);
      }
    });
  });
  await tab(page, 'OVERVIEW');
  expect(await panel.getAttribute('data-fade-events')).toBe(
    JSON.stringify([
      { section: 'experience', outgoing: 'true' },
      { section: 'overview', outgoing: 'false' },
    ]),
  );
  const navigation = page.locator('[data-sidebar-rail]');
  await navigation.locator('[data-sidebar-item="experience"]').click();
  await navigation.locator('[data-sidebar-item="projects"]').click();
  await navigation.locator('[data-sidebar-item="skills"]').click();
  await expect(panel).toHaveAttribute('data-profile-section', 'skills');
  await expect(panel).toHaveCSS('opacity', '1');
  await expect(panel).not.toHaveAttribute('inert');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await tab(page, 'EXPERIENCE');
  await expect(panel).toHaveCSS('transition-duration', '0s');
});

for (const width of [390, 820, 1600]) {
  test(`wrapped skill drag preserves its own width and exact drop space at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 1100 });
    await openEditor(page, '/en/profile?section=skills', 'mist');
    const list = page.locator('[data-reorder-list="skills"]');
    const source = list.locator('[data-reorder-id="skill:skill-4"]');
    const points = await reorderPoints(
      page.getByRole('button', { name: 'Drag Django REST Framework to reorder', exact: true }),
      list.locator('[data-reorder-id="skill:skill-1"]'),
      'horizontal',
    );
    const original = (await source.boundingBox())!;
    const order = await list
      .locator('[data-reorder-id]')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-reorder-id')));
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
    await expect(source).toHaveAttribute('data-reorder-placeholder', 'true');
    const slot = (await source.boundingBox())!;
    expect(slot.width).toBeCloseTo(original.width, 0);
    expect(slot.height).toBeCloseTo(original.height, 0);
    expect(
      await list
        .locator('[data-reorder-id]')
        .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-reorder-id'))),
    ).toEqual(order);
    await expect
      .poll(() =>
        list.evaluate(
          (node) =>
            node
              .getAnimations({ subtree: true })
              .filter((animation) => animation.playState === 'running').length,
        ),
      )
      .toBe(0);
    const layout = await list.evaluate((node) => {
      const bounds = node.getBoundingClientRect();
      return [...node.querySelectorAll('[data-reorder-id]')].every((item) => {
        const rect = item.getBoundingClientRect();
        return rect.bottom <= bounds.bottom + 1 && rect.right <= bounds.right + 1;
      });
    });
    expect(layout).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    );
    await page.screenshot({ path: info.outputPath('whole-skill-drag.png') });
    await page.mouse.up();
    await expect(list.locator('[data-reorder-id]').first()).toHaveAttribute(
      'data-reorder-id',
      'skill:skill-4',
    );
    const dropped = (await source.boundingBox())!;
    expect(dropped.x).toBeCloseTo(slot.x, 0);
    expect(dropped.y).toBeCloseTo(slot.y, 0);
    await expect(ghost).toHaveCount(0);
  });

  test(`category drag lifts the full card at the grab point and previews its exact slot at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 1100 });
    await openEditor(page, '/en/profile?section=skills', 'mist');
    const list = page.locator('[data-reorder-list="categories"]');
    const source = list.locator('[data-reorder-id="category:databases"]');
    const target = list.locator('[data-reorder-id="category:backend"]');
    const points = await reorderPoints(
      page.getByRole('button', { name: 'Drag Databases to reorder', exact: true }),
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
    await expect(source).toHaveAttribute('data-reorder-placeholder', 'true');
    const slot = (await source.boundingBox())!;
    expect(slot.x).toBeCloseTo(destination.x, 0);
    expect(slot.y).toBeCloseTo(destination.y, 0);
    expect(slot.width).toBeCloseTo(original.width, 0);
    expect(slot.height).toBeCloseTo(original.height, 0);
    await expect
      .poll(() =>
        list.evaluate(
          (node) =>
            node
              .getAnimations({ subtree: true })
              .filter((animation) => animation.playState === 'running').length,
        ),
      )
      .toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    );
    await page.screenshot({ path: info.outputPath('whole-category-drag.png') });
    await page.mouse.up();
    await expect(list.locator('[data-reorder-id]').first()).toHaveAttribute(
      'data-reorder-id',
      'category:databases',
    );
    const dropped = (await source.boundingBox())!;
    expect(dropped.x).toBeCloseTo(slot.x, 0);
    expect(dropped.y).toBeCloseTo(slot.y, 0);
    await expect(ghost).toHaveCount(0);
  });
}

test('categories and wrapped skills support pointer drops, cancellation, keyboard moves and saved order', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1600, height: 1100 });
  await openEditor(page, '/en/profile?section=skills');
  const categories = page.locator('[data-reorder-list="categories"]');
  const skills = page.locator('[data-reorder-list="skills"]');
  const order = (list: Locator) =>
    list
      .locator('[data-reorder-id]')
      .evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).dataset.reorderId));
  let points = await reorderPoints(
    page.getByRole('button', { name: 'Drag Databases to reorder', exact: true }),
    categories.locator('[data-reorder-id="category:backend"]'),
    'vertical',
  );
  await page.mouse.move(points.from.x, points.from.y);
  await page.mouse.down();
  await page.mouse.move(points.to.x, points.to.y, { steps: 12 });
  await expect(page.locator('[data-reorder-ghost]')).toBeVisible();
  await expect(categories.locator('[data-reorder-id="category:backend"]')).toHaveAttribute(
    'data-drop-position',
    'before',
  );
  expect(await order(categories)).toEqual([
    'category:backend',
    'category:databases',
    'category:data-ai',
    'category:devops',
  ]);
  await page.screenshot({ path: info.outputPath('skills-category-drag.png') });
  await page.mouse.up();
  expect(await order(categories)).toEqual([
    'category:databases',
    'category:backend',
    'category:data-ai',
    'category:devops',
  ]);
  points = await reorderPoints(
    page.getByRole('button', { name: 'Drag Python to reorder', exact: true }),
    skills.locator('[data-reorder-id="skill:skill-4"]'),
    'horizontal',
    true,
  );
  await page.mouse.move(points.from.x, points.from.y);
  await page.mouse.down();
  await page.mouse.move(points.to.x, points.to.y, { steps: 12 });
  await expect(skills.locator('[data-reorder-id="skill:skill-4"]')).toHaveAttribute(
    'data-drop-position',
    'after',
  );
  await page.mouse.up();
  expect((await order(skills)).slice(0, 4)).toEqual([
    'skill:skill-2',
    'skill:skill-3',
    'skill:skill-4',
    'skill:skill-1',
  ]);
  const python = page.getByRole('button', { name: 'Drag Python to reorder', exact: true });
  await python.focus();
  await python.press('ArrowLeft');
  expect((await order(skills)).slice(0, 4)).toEqual([
    'skill:skill-2',
    'skill:skill-3',
    'skill:skill-1',
    'skill:skill-4',
  ]);
  const unchanged = await order(skills);
  points = await reorderPoints(
    python,
    skills.locator('[data-reorder-id="skill:skill-2"]'),
    'horizontal',
  );
  await page.mouse.move(points.from.x, points.from.y);
  await page.mouse.down();
  await page.mouse.move(points.to.x, points.to.y, { steps: 8 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(page.locator('[data-reorder-ghost]')).toHaveCount(0);
  expect(await order(skills)).toEqual(unchanged);
  // Releasing outside the list must also leave the normalized order untouched.
  await page.mouse.move(points.from.x, points.from.y);
  await page.mouse.down();
  await page.mouse.move(15, 200, { steps: 8 });
  await page.mouse.up();
  expect(await order(skills)).toEqual(unchanged);
  await save(page);
  await page.reload();
  await expect(categories.locator('[data-reorder-id]')).toHaveCount(4);
  expect(await order(categories)).toEqual([
    'category:databases',
    'category:backend',
    'category:data-ai',
    'category:devops',
  ]);
  await categories.getByRole('button', { name: 'Backend & APIs 8', exact: true }).click();
  expect(await order(skills)).toEqual(unchanged);
  const stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), draftKey);
  expect(stored.experiences['experience:3'].skillIds).toContain('skill:skill-1');
  expect(stored.skills['skill:skill-1'].label).toBe('Python');
});

test('category swipe reveals one explicit delete action with mouse and keyboard access', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 1100 });
  await openEditor(page, '/en/profile?section=skills', 'mist');
  const list = page.locator('[data-reorder-list="categories"]');
  const backend = list.locator('[data-reorder-id="category:backend"]');
  const databases = list.locator('[data-reorder-id="category:databases"]');
  const swipe = async (item: Locator, distance: number) => {
    await item.scrollIntoViewIfNeeded();
    const box = (await item.boundingBox())!;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + distance, y, { steps: 10 });
    await page.mouse.up();
  };
  const remove = backend.getByRole('button', {
    name: 'Delete category: Backend & APIs',
    exact: true,
  });
  await expect(remove).toHaveCount(0);
  await swipe(backend, -20);
  await expect(backend).toHaveAttribute('data-swipe-open', 'false');
  await swipe(backend, -100);
  await expect(remove).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(list.locator('[data-reorder-id]')).toHaveCount(4);
  await expect(page.locator('[data-reorder-ghost]')).toHaveCount(0);
  await backend.screenshot({ path: info.outputPath('category-swipe-delete.png') });
  await swipe(backend, 90);
  await expect(backend).toHaveAttribute('data-swipe-open', 'false');
  const trigger = backend.getByRole('button', {
    name: 'Category actions: Backend & APIs',
    exact: true,
  });
  await trigger.focus();
  await trigger.press('Enter');
  await expect(
    backend.getByRole('button', { name: 'Edit Backend & APIs', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(remove).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await expect(backend).toHaveAttribute('data-swipe-open', 'false');
  await trigger.click();
  await databases.getByRole('button', { name: 'Category actions: Databases', exact: true }).click();
  await expect(backend).toHaveAttribute('data-swipe-open', 'false');
  await expect(databases).toHaveAttribute('data-swipe-open', 'true');
  await expect(page.getByRole('button', { name: 'Backend & APIs 8', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await databases.getByRole('button', { name: 'Edit Databases', exact: true }).click();
  await expect(field(page, 'Category name')).toHaveValue('Databases');
  await expect(field(page, 'Category name')).toBeFocused();
  await expect(databases).toHaveAttribute('data-swipe-open', 'false');
  await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeDisabled();
  await trigger.click();
  await remove.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Keep editing', exact: true }).last().click();
  await expect(backend).toHaveCount(1);
  await remove.click();
  await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(backend).toHaveCount(0);
  // Shared skill identities survive deleting a category, and only global Save writes the API.
  await save(page);
  await page.reload();
  await expect(list.locator('[data-reorder-id]')).toHaveCount(3);
  const stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), draftKey);
  expect(stored.skills['skill:skill-1'].label).toBe('Python');
});

test.describe('touch skill sorting', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 1000 } });
  test('touch category swipe reveals delete while vertical gestures still scroll', async ({
    page,
  }, info) => {
    await openEditor(page, '/en/profile?section=skills', 'mist');
    const card = page.locator('[data-reorder-id="category:backend"]');
    await card.scrollIntoViewIfNeeded();
    const box = (await card.boundingBox())!;
    const cdp = await page.context().newCDPSession(page);
    const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const gesture = async (dx: number, dy: number, cancel = false) => {
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
    await gesture(-100, 0, true);
    await expect(card).toHaveAttribute('data-swipe-open', 'false');
    await gesture(-100, 0);
    await expect(card).toHaveAttribute('data-swipe-open', 'true');
    await expect(
      card.getByRole('button', { name: 'Delete category: Backend & APIs', exact: true }),
    ).toBeVisible();
    await expect(page.locator('[data-reorder-ghost]')).toHaveCount(0);
    await card.screenshot({ path: info.outputPath('touch-category-swipe.png') });
    await gesture(90, 0);
    await expect(card).toHaveAttribute('data-swipe-open', 'false');
    const before = await page.evaluate(() => scrollY);
    await gesture(0, -90);
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(before + 20);
    await expect(card).toHaveAttribute('data-swipe-open', 'false');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    );
  });

  test('touch dragging reorders categories and skills without turning into page scrolling', async ({
    page,
  }) => {
    await openEditor(page, '/en/profile?section=skills');
    const cdp = await page.context().newCDPSession(page);
    const drag = async (
      handle: Locator,
      target: Locator,
      axis: 'vertical' | 'horizontal',
      after = false,
    ) => {
      const points = await reorderPoints(handle, target, axis, after);
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
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await expect(page.locator('[data-reorder-ghost]')).toHaveCount(0);
    };
    const categories = page.locator('[data-reorder-list="categories"]');
    await drag(
      page.getByRole('button', { name: 'Drag Databases to reorder', exact: true }),
      categories.locator('[data-reorder-id="category:backend"]'),
      'vertical',
    );
    await expect(categories.locator('[data-reorder-id]').first()).toHaveAttribute(
      'data-reorder-id',
      'category:databases',
    );
    const skills = page.locator('[data-reorder-list="skills"]');
    await drag(
      page.getByRole('button', { name: 'Drag Python to reorder', exact: true }),
      skills.locator('[data-reorder-id="skill:skill-2"]'),
      'horizontal',
      true,
    );
    await expect(skills.locator('[data-reorder-id]').first()).toHaveAttribute(
      'data-reorder-id',
      'skill:skill-2',
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    );
  });
});

for (const width of [390, 1600]) {
  test(`draft modal shares homepage views and preserves unsaved edits at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 1100 });
    const writes: string[] = [];
    const publicReads: string[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.pathname.endsWith('/portfolio/site/save')) writes.push(url.pathname);
      if (
        url.pathname.startsWith('/api/portfolio/') &&
        !url.pathname.includes('/me/') &&
        request.method() === 'GET'
      )
        publicReads.push(url.pathname);
    });
    await openEditor(page, '/en/profile?section=overview', 'mist');
    await field(page, 'First name').fill('Preview Ada');
    const tabs = page
      .locator('[data-sidebar-rail] [data-sidebar-links]')
      .first()
      .locator('[data-sidebar-item]');
    await expect(tabs).toHaveCount(4);
    await expect(tabs.first()).toHaveText('Introduction');
    for (const button of await tabs.all()) await expect(button.locator('.icon svg')).toHaveCount(1);
    await expect(page.locator('[data-sidebar-item="showcase"]')).toHaveCount(0);
    const trigger = page.getByRole('button', { name: 'Preview', exact: true });
    const cancel = page.getByRole('button', { name: 'Cancel changes', exact: true });
    const language = field(page, 'Content language');
    const reminder = page.getByRole('button', { name: 'Editing reminder', exact: true });
    const languageBox = (await language.boundingBox())!;
    const helpBox = (await reminder.boundingBox())!;
    expect(helpBox.x).toBeGreaterThanOrEqual(languageBox.x + languageBox.width);
    expect(
      Math.abs(helpBox.y + helpBox.height / 2 - languageBox.y - languageBox.height / 2),
    ).toBeLessThan(4);
    const before = (await trigger.boundingBox())!;
    const cancelBox = (await cancel.boundingBox())!;
    expect(before.x + before.width).toBeLessThanOrEqual(cancelBox.x + 1);
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: 'Showcase preview', exact: true });
    const preview = dialog.locator('[data-profile-preview="showcase"]');
    await expect(preview.locator('[data-profile-content]')).toContainText('Preview Ada');
    const draft = ownerProfileSnapshot();
    const visibleExperiences = Object.values(draft.experiences).filter(
      (item) => item.visible,
    ).length;
    await expect(preview.locator('[data-experience-id]')).toHaveCount(
      Math.min(6, visibleExperiences),
    );
    await expect(preview.locator('[data-project-id]')).toHaveCount(
      Object.values(draft.projects).filter((item) => item.visible).length,
    );
    await expect(preview.locator('[data-category-id]')).toHaveCount(
      Math.min(6, Object.values(draft.categories).filter((item) => item.visible).length),
    );
    const chat = preview.locator('[data-draft-contact-trigger]');
    await chat.click();
    const introduction = dialog.locator('[data-contact-bubble]');
    await expect(
      introduction.getByRole('heading', { name: draft.profiles.en.chatTitle, exact: true }),
    ).toBeVisible();
    await introduction
      .getByRole('button', { name: 'Close internship chatme', exact: true })
      .click();
    await expect(introduction).toHaveCount(0);
    await expect(chat).toBeFocused();
    const projectName = Object.values(draft.projects).find((item) => item.visible)!.translations.en
      .name;
    const detailTrigger = preview
      .locator('[data-project-id]')
      .first()
      .getByRole('button', { name: new RegExp(projectName) });
    await detailTrigger.click();
    const detail = page.getByRole('dialog', { name: projectName, exact: true });
    await expect(detail).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(detail).toHaveCount(0);
    await expect(dialog).toBeVisible();
    await expect(detailTrigger).toBeFocused();
    await dialog.locator('[data-draft-section="journey"]').scrollIntoViewIfNeeded();
    await expect(dialog.locator('[data-stop]').first()).toBeAttached();
    await dialog
      .locator('.modal-body')
      .first()
      .evaluate((node) => {
        node.scrollTop = 0;
      });
    expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    await page.screenshot({ path: info.outputPath('draft-homepage-modal.png') });
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect(field(page, 'First name')).toHaveValue('Preview Ada');
    await expect(page).toHaveURL(/section=overview/);
    expect(writes).toEqual([]);
    expect(publicReads).toEqual([]);
    await tab(page, 'EXPERIENCE');
    await editExperience(page, 'Delta Electronics');
    await expect(field(page, 'City')).toBeVisible();
    await page.getByRole('switch', { name: 'Show on homepage', exact: true }).uncheck();
    await trigger.click();
    await expect(preview.locator('[data-experience-id]')).toHaveCount(
      Math.min(6, visibleExperiences - 1),
    );
    await expect(
      preview.getByRole('heading', { name: 'Delta Electronics', exact: true }),
    ).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await contentLanguage(page, 'zh-Hant');
    await trigger.click();
    await expect(preview).toHaveAttribute('lang', 'zh-Hant');
    await expect(preview.locator('[data-profile-content]')).toHaveCSS('letter-spacing', '-1px');
    await expect(preview.locator('[data-draft-section="overview"]')).toContainText(
      draft.profiles['zh-Hant'].content,
    );
    await expect(preview).not.toContainText('profileEditor.');
    await page.keyboard.press('Escape');
    await contentLanguage(page, 'en');
    await trigger.click();
    await expect(preview.locator('[data-profile-content]')).toContainText('Preview Ada');
    await page.keyboard.press('Escape');
    expect(writes).toEqual([]);
    await save(page);
    expect(writes).toHaveLength(1);
    await page.reload();
    await expect(page.getByRole('dialog', { name: 'Showcase preview', exact: true })).toHaveCount(
      0,
    );
    await page.getByRole('button', { name: 'Preview', exact: true }).click();
    await expect(preview.locator('[data-profile-content]')).toContainText('Preview Ada');
  });

  test(`Profile shares grouped workspace navigation and retains draft state at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await openEditor(page, '/en/profile?contentLocale=zh-Hant');
    const panel = page.locator('[data-profile-section]');
    const rail = page.locator('[data-sidebar-rail]');
    await expect(
      page.locator('main nav').getByRole('button', { name: /OVERVIEW|EXPERIENCE|PROJECTS|SKILLS/ }),
    ).toHaveCount(0);
    await expect(rail.locator('.sidebar-navigation-group-title')).toHaveText(['Profile']);
    const targets = [
      ['overview', 'Introduction'],
      ['experience', 'Work & education'],
      ['projects', 'Projects'],
      ['skills', 'Skill categories'],
    ] as const;
    await expect(rail.locator('[data-sidebar-item="experience"]')).toHaveAttribute(
      'aria-current',
      'page',
    );
    for (const [section, label] of targets) {
      let navigation = rail;
      if (width <= 1024) {
        await page.getByRole('button', { name: 'Open management navigation', exact: true }).click();
        navigation = page.locator('[data-sidebar-drawer]');
      }
      const link = navigation.getByRole('link', { name: label, exact: true });
      const href = new URL((await link.getAttribute('href'))!, page.url());
      expect(href.pathname).toBe('/en/profile');
      expect(href.searchParams.get('contentLocale')).toBe('zh-Hant');
      expect(href.searchParams.get('section')).toBe(section);
      await link.click();
      await expect(panel).toHaveAttribute('data-profile-section', section);
      await expect(panel).toHaveCSS('opacity', '1');
      await expect(rail.locator(`[data-sidebar-item="${section}"]`)).toHaveAttribute(
        'aria-current',
        'page',
      );
      if (width <= 1024) await expect(navigation).toHaveCount(0);
    }
    // The common rail and drawer preserve unsaved profile text while switching sections.
    await tab(page, 'EXPERIENCE');
    await editExperience(page, 'Delta Electronics');
    await field(page, 'City').fill('Profile draft city');
    await tab(page, 'SKILLS');
    await expect(rail.locator('[data-sidebar-item="skills"]')).toHaveAttribute(
      'aria-current',
      'page',
    );
    await tab(page, 'EXPERIENCE');
    await editExperience(page, 'Delta Electronics');
    await expect(field(page, 'City')).toHaveValue('Profile draft city');
    await expect(page).toHaveURL(
      (url) =>
        url.pathname === '/en/profile' && url.searchParams.get('contentLocale') === 'zh-Hant',
    );
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
}

test('shared experience and Journey edits, content languages, and explicit server saves', async ({
  page,
}) => {
  const writes: string[] = [];
  const contentReads: string[] = [];
  page.on('request', (request) => {
    if (!['GET', 'HEAD'].includes(request.method())) writes.push(request.url());
    if (/\/api\/portfolio\/me\/(experiences|projects|skill-categories|skills)/.test(request.url()))
      contentReads.push(request.url());
  });
  await page.setViewportSize({ width: 1600, height: 1100 });
  await openEditor(page);
  await expect(page.locator('[data-experience-editor-row]')).toHaveCount(6);
  await editExperience(page, 'Delta Electronics');
  await field(page, 'City').fill('Taipei studio');
  await expect(page.locator('[data-profile-preview="experience"]')).toContainText('Taipei studio');
  await expect(page.locator('[data-profile-preview="journey"]')).toContainText('Taipei studio');
  await expect(
    page.locator('[data-sidebar-rail] [data-sidebar-links]').first().locator('[data-sidebar-item]'),
  ).toHaveCount(4);
  await field(page, 'Quick location preset').selectOption('London');
  await expect(field(page, 'Latitude')).toHaveValue('51.5246');
  await expect(page.locator('[data-profile-preview="journey"]')).toContainText('London');
  await expect(field(page, 'City')).toHaveValue('London');
  await contentLanguage(page, 'zh-Hant');
  await expect(field(page, 'City')).not.toHaveValue('London');
  await contentLanguage(page, 'en');
  await expect(field(page, 'City')).toHaveValue('London');
  expect(await page.evaluate((key) => localStorage.getItem(key), draftKey)).toBeNull();
  await save(page);
  await page.reload();
  await expect(field(page, 'City')).toHaveValue('London');
  await expect(field(page, 'Country / region')).toHaveValue('United Kingdom');
  expect(writes).toHaveLength(1);
  expect(writes[0]).toContain('/api/portfolio/site/save');
  expect(contentReads.some((url) => url.includes('/api/portfolio/me/projects'))).toBe(true);
});

test('one career form owns Journey locations, visibility and legacy links', async ({ page }) => {
  await openEditor(page, '/en/profile?section=journey&edit=experience%3A3&contentLocale=zh-Hant');
  await expect(page).toHaveURL(
    (url) =>
      url.searchParams.get('section') === 'experience' &&
      url.searchParams.get('edit') === 'experience:3' &&
      url.searchParams.get('contentLocale') === 'zh-Hant',
  );
  await expect(
    page.locator('[data-sidebar-rail] [data-sidebar-links]').first().locator('[data-sidebar-item]'),
  ).toHaveCount(4);
  await expect(page.locator('[data-sidebar-item="journey"]')).toHaveCount(0);
  await field(page, 'City').fill('Unified city');
  const route = page.locator('[data-profile-preview="journey"]');
  await expect(route).toContainText('Unified city');
  await page.getByRole('switch', { name: 'Show on homepage', exact: true }).uncheck();
  await expect(route).not.toContainText('Unified city');
  await expect(field(page, 'City')).toHaveValue('Unified city');
  await page.getByRole('switch', { name: 'Show on homepage', exact: true }).check();
  await expect(route).toContainText('Unified city');
  await route.getByRole('button').first().click();
  await expect(page).toHaveURL((url) => url.searchParams.get('edit') === 'experience:6');
  await expect(page.getByRole('button', { name: 'Choose on map', exact: true })).toBeVisible();
});

test('creation, date validation, cancellation, and safe relationship deletion', async ({
  page,
}) => {
  await openEditor(page);
  await page.getByRole('button', { name: 'Add experience', exact: true }).click();
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(field(page, 'Company / school')).toHaveAttribute('aria-invalid', 'true');
  await field(page, 'Company / school').fill('Example studio');
  await field(page, 'Job title / degree').fill('Product engineer');
  await field(page, 'Start date').fill('2026-04');
  await field(page, 'Currently working / studying here').uncheck();
  await field(page, 'End date').fill('2026-03');
  await field(page, 'Country / region').fill('Taiwan');
  await field(page, 'City').fill('Taipei');
  await field(page, 'Experience introduction').fill('Built a modular profile editor.');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(field(page, 'End date')).toHaveAttribute('aria-invalid', 'true');
  await field(page, 'End date').fill('2026-08');
  await field(page, 'Quick location preset').selectOption('London');
  await save(page);
  await field(page, 'City').fill('Unsaved city');
  await page.getByRole('button', { name: 'Cancel changes', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Discard changes', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Experience actions: Example studio', exact: true }),
  ).toBeVisible();
  await editExperience(page, 'Delta Electronics');
  await page.getByRole('button', { name: 'Delete experience', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.locator('[data-experience-editor-row="experience:3"]')).toHaveCount(0);
  await tab(page, 'PROJECTS');
  await expect(page.locator('[data-profile-preview="project"]')).toContainText('Manufacturing');
  await save(page);
  const stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), draftKey);
  expect(stored.projects['project:1'].experienceId).toBeNull();
  expect(Object.keys(stored.skills).length).toBeGreaterThan(0);
});

test('projects support summaries, independent workflow steps, and shared skill assignment', async ({
  page,
}) => {
  await openEditor(page);
  await tab(page, 'PROJECTS');
  await page.getByRole('button', { name: 'Add project', exact: true }).click();
  await field(page, 'Project name').fill('Profile workspace');
  await field(page, 'Project summary').fill('A structured frontend editor.');
  await field(page, 'Start date').fill('2026-10');
  await field(page, 'Linked experience').selectOption('experience:3');
  await page.getByRole('button', { name: 'Add step', exact: true }).click();
  await field(page, 'Step 1').fill('Review the profile draft');
  await expect(page.locator('[data-profile-preview="project"]')).toContainText(
    'Review the profile draft',
  );
  await page.getByRole('button', { name: 'Choose skills', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Python', exact: true }).check();
  await expect(page.locator('[data-profile-preview="project"]')).toContainText('Python');
  await save(page);
  await page.reload();
  await expect(field(page, 'Project name')).toHaveValue('Profile workspace');
  await expect(field(page, 'Step 1')).toHaveValue('Review the profile draft');
  await page.getByRole('button', { name: 'Delete project', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
  await tab(page, 'EXPERIENCE');
  await expect(page.locator('[data-experience-editor-row="experience:3"]')).toHaveCount(1);
});

test('skill renames, accessible ordering, and unsaved navigation protection', async ({ page }) => {
  const writes: string[] = [];
  page.on('request', (request) => {
    if (request.url().endsWith('/api/portfolio/site/save')) writes.push(request.url());
  });
  await openEditor(page);
  await tab(page, 'SKILLS');
  const name = field(page, 'Skill name');
  await name.fill('Temporary name');
  await name.press('Enter');
  expect(writes).toEqual([]);
  await page.getByRole('button', { name: 'Cancel changes', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Discard changes', exact: true })
    .click();
  await expect(name).toHaveValue('Python');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await name.clear();
  await expect(name).toHaveValue('');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(name).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByText('This field is required.', { exact: true })).toBeVisible();
  await name.fill('FastAPI');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(name).toHaveAttribute('aria-invalid', 'true');
  await expect(
    page.getByText('Another skill already uses this name.', { exact: true }),
  ).toBeVisible();
  expect(writes).toEqual([]);
  await name.fill('Python 3');
  await expect(page.getByRole('button', { name: 'Rename skill', exact: true })).toHaveCount(0);
  await expect(name).not.toHaveAttribute('aria-invalid');
  await page.getByRole('button', { name: 'Public page preview', exact: true }).click();
  const preview = page.getByRole('dialog', { name: 'Public page preview', exact: true });
  await expect(page.locator('[data-profile-preview="skills"]')).toBeVisible();
  await expect(page.locator('[data-profile-preview="skills"]')).toContainText('Python 3');
  await preview.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(preview).not.toBeVisible();
  expect(writes).toEqual([]);
  await tab(page, 'EXPERIENCE');
  await page.getByRole('button', { name: /^Delta Electronics / }).click();
  await expect(page.locator('[data-profile-preview="experience"]')).toContainText('Python 3');
  await page
    .getByRole('button', { name: 'Drag Delta Electronics to reorder', exact: true })
    .press('ArrowUp');
  await expect(page.locator('[data-experience-editor-row]').nth(1)).toHaveAttribute(
    'data-experience-editor-row',
    'experience:3',
  );
  await page.getByRole('link', { name: 'View public page', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Keep editing', exact: true })
    .last()
    .click();
  await expect(page).toHaveURL(/\/en\/profile/);
  await save(page);
  expect(writes).toHaveLength(1);
  await page.reload();
  await expect(page.locator('[data-experience-editor-row]').nth(1)).toHaveAttribute(
    'data-experience-editor-row',
    'experience:3',
  );
});

for (const { width, locale, theme } of [
  { width: 390, locale: 'zh-Hant', theme: 'mist' },
  { width: 820, locale: 'en', theme: 'blue' },
  { width: 1600, locale: 'zh-Hant', theme: 'mint' },
  { width: 2560, locale: 'en', theme: 'mint' },
]) {
  test(`all sections fit at ${width}px / ${theme}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1100 });
    await openEditor(page, `/${locale}/profile`, theme);
    for (const section of ['EXPERIENCE', 'OVERVIEW', 'PROJECTS', 'SKILLS']) {
      await tab(page, section);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      ).toBe(true);
      await expect(page.locator('main')).not.toContainText('profileEditor.');
      if (width === 1600 || (width === 390 && section === 'EXPERIENCE'))
        await page.screenshot({
          path: testInfo.outputPath(`profile-${section.toLowerCase()}.png`),
          fullPage: true,
        });
    }
    await tab(page, 'EXPERIENCE');
    const row = page.locator('[data-experience-editor-row="experience:3"]');
    await row.locator('button[aria-controls]').click();
    await row.locator('[data-swipe-edit]').click();
    await expect(
      page.locator('[data-editor-field="experiences.experience:3.organization"] input'),
    ).toBeVisible();
    await expect(page.locator('[data-profile-section]')).toHaveCSS('opacity', '1');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    );
    if (width === 390 || width === 1600)
      await page.screenshot({ path: testInfo.outputPath('profile-edit.png'), fullPage: true });
  });
}

test('the existing gear opens Profile and unauthenticated visits return to sign-in', async ({
  page,
}) => {
  await openEditor(page);
  await page.goto('/en');
  await page.getByRole('button', { name: 'Account settings', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Profile', exact: true }).click();
  await expect(page.locator('[data-profile-editor]')).toBeVisible();
  await page.route('**/api/authority/session', (route) => route.fulfill({ json: null }));
  await page.goto('/en/profile');
  await expect(page).toHaveURL(/\/en\?view=login/);
  await expect(page.locator('[data-profile-editor]')).toHaveCount(0);
});
