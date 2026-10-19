import { expect, type Locator } from '@playwright/test';
import { runtimeTest as test } from '../fixtures/browser';
import { draftKey, openEditor, tab, field, save } from '../fixtures/profile-editor';

test('tabs fade out before swapping and settle on the last rapid selection', async ({ page }) => {
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
  const navigation = page.locator('main nav');
  await navigation.getByRole('button', { name: /EXPERIENCE/ }).click();
  await navigation.getByRole('button', { name: /PROJECTS/ }).click();
  await navigation.getByRole('button', { name: /SKILLS/ }).click();
  await expect(panel).toHaveAttribute('data-profile-section', 'skills');
  await expect(panel).toHaveCSS('opacity', '1');
  await expect(panel).not.toHaveAttribute('inert');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await tab(page, 'EXPERIENCE');
  await expect(panel).toHaveCSS('transition-duration', '0s');
});

/** Move real browser pointers through capture/hit testing instead of dispatching synthetic drops. */
async function reorderPoints(
  handle: Locator,
  target: Locator,
  axis: 'vertical' | 'horizontal',
  after = false,
) {
  await target.scrollIntoViewIfNeeded();
  await handle.scrollIntoViewIfNeeded();
  const from = (await handle.boundingBox())!;
  const to = (await target.boundingBox())!;
  return {
    from: { x: from.x + from.width / 2, y: from.y + from.height / 2 },
    to: {
      x: to.x + (axis === 'horizontal' ? (after ? to.width - 6 : 6) : to.width / 2),
      y: to.y + (axis === 'vertical' ? (after ? to.height - 6 : 6) : to.height / 2),
    },
  };
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

test.describe('touch skill sorting', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 1000 } });
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
  test(`Profile rail and top tabs share destinations, labels and selection at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await openEditor(page, '/en/profile?contentLocale=zh-Hant');
    const panel = page.locator('[data-profile-section]');
    const rail = page.locator('[data-sidebar-rail]');
    const top = page.locator('main nav');
    const targets = [
      ['overview', 'Introduction', 'OVERVIEW'],
      ['experience', 'Work & education', 'EXPERIENCE'],
      ['projects', 'Projects', 'PROJECTS'],
      ['skills', 'Skill categories', 'SKILLS'],
    ] as const;
    await expect(rail.locator('[data-sidebar-item="experience"]')).toHaveAttribute(
      'aria-current',
      'page',
    );
    for (const [section, label, caption] of targets) {
      let navigation = rail;
      if (width < 760) {
        await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
        navigation = page.getByRole('dialog', { name: 'Main navigation', exact: true });
      }
      const link = navigation.getByRole('link', { name: label, exact: true });
      const href = new URL((await link.getAttribute('href'))!, page.url());
      expect(href.pathname).toBe('/en/profile');
      expect(href.searchParams.get('contentLocale')).toBe('zh-Hant');
      expect(href.searchParams.get('section')).toBe(section);
      await link.click();
      await expect(panel).toHaveAttribute('data-profile-section', section);
      await expect(panel).toHaveCSS('opacity', '1');
      await expect(top.getByRole('button', { name: new RegExp(caption) })).toHaveAttribute(
        'aria-current',
        'page',
      );
      await expect(rail.locator(`[data-sidebar-item="${section}"]`)).toHaveAttribute(
        'aria-current',
        'page',
      );
      if (width < 760) await expect(navigation).not.toBeVisible();
    }
    // Switching from the top tabs also highlights the rail and retains unsaved profile text.
    await tab(page, 'EXPERIENCE');
    await page.getByRole('button', { name: 'Edit Delta Electronics', exact: true }).click();
    await field(page, 'City').fill('Profile draft city');
    await tab(page, 'SKILLS');
    await expect(rail.locator('[data-sidebar-item="skills"]')).toHaveAttribute(
      'aria-current',
      'page',
    );
    await tab(page, 'EXPERIENCE');
    await page.getByRole('button', { name: 'Edit Delta Electronics', exact: true }).click();
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
  await page.getByRole('button', { name: 'Edit Delta Electronics', exact: true }).click();
  await field(page, 'City').fill('Taipei studio');
  await expect(page.locator('[data-profile-preview="experience"]')).toContainText('Taipei studio');
  await expect(page.locator('[data-profile-preview="journey"]')).toContainText('Taipei studio');
  await expect(page.locator('main nav').getByRole('button')).toHaveCount(4);
  await field(page, 'Quick location preset').selectOption('London');
  await expect(field(page, 'Latitude')).toHaveValue('51.5246');
  await expect(page.locator('[data-profile-preview="journey"]')).toContainText('London');
  await expect(field(page, 'City')).toHaveValue('London');
  await field(page, 'Content language').selectOption('zh-Hant');
  await expect(field(page, 'City')).not.toHaveValue('London');
  await field(page, 'Content language').selectOption('en');
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
  await expect(page.locator('main nav').getByRole('button')).toHaveCount(4);
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
    page.getByRole('button', { name: 'Edit Example studio', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Edit Delta Electronics', exact: true }).click();
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
  await openEditor(page);
  await tab(page, 'SKILLS');
  const name = field(page, 'Skill name');
  await name.clear();
  await expect(name).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Rename skill', exact: true })).toBeDisabled();
  await name.fill('Python 3');
  await page.getByRole('button', { name: 'Rename skill', exact: true }).click();
  await expect(page.locator('[data-profile-preview="skills"]')).toContainText('Python 3');
  await tab(page, 'EXPERIENCE');
  await page.getByRole('button', { name: /^Delta Electronics Work / }).click();
  await expect(page.locator('[data-profile-preview="experience"]')).toContainText('Python 3');
  await page.getByRole('button', { name: 'Adjust order', exact: true }).click();
  await page.getByRole('button', { name: 'Move Delta Electronics up', exact: true }).click();
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
    await page
      .locator('[data-experience-editor-row="experience:3"]')
      .getByRole('button')
      .last()
      .click();
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
