import { expect, type Locator, type Page } from '@playwright/test';
import type { ProfileDraft } from '../../src/features/profile-content/model/profile';
import { ownerProfileSnapshot, ownerProfileResponse, saveOwnerProfile } from './profile-owner';

export const draftKey = 'portfolio.profile-draft.v1:91';

/** Editing lives in the explicit swipe rail; normal navigation opens it without mutating the draft. */
export async function editExperience(page: Page, name: string) {
  const row = page.locator('[data-experience-editor-row]').filter({
    has: page.getByRole('button', { name: `Experience actions: ${name}`, exact: true }),
  });
  await row.getByRole('button', { name: `Experience actions: ${name}`, exact: true }).click();
  await row.getByRole('button', { name: `Edit ${name}`, exact: true }).click();
}

/** Measure real pointer paths once for every editor list, including wrapped chips and paged cards. */
export async function reorderPoints(
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

/** Restore the established session and serve existing Portfolio DTOs without backend writes. */
export async function openEditor(
  page: Page,
  path = '/en/profile',
  theme = 'mint',
  options: {
    existingApi?: boolean;
    /** Explicit private API state, rather than attempting to overwrite a versioned browser cache. */
    snapshot?: ProfileDraft;
    user?: string;
    waitForWorkspace?: boolean;
    helpAcknowledged?: boolean;
    skillSortHelpAcknowledged?: boolean;
    skillLibraryHelpAcknowledged?: boolean;
    beforeNavigate?: (page: Page) => Promise<void>;
    permissions?: Partial<
      Record<
        | 'is_create'
        | 'is_read'
        | 'is_update'
        | 'is_delete'
        | 'is_monitor'
        | 'is_manage_sites'
        | 'is_manage_users'
        | 'is_manage_roles',
        boolean
      >
    >;
  } = {},
) {
  await page.context().addCookies([
    {
      name: 'portfolio-appearance',
      value: encodeURIComponent(JSON.stringify({ theme, paused: true })),
      url: 'http://127.0.0.1:4173',
    },
  ]);
  // Ordinary editor tests opt out of onboarding; dedicated help cases exercise first-visit behavior.
  if (options.helpAcknowledged !== false)
    await page.context().addCookies([
      {
        name: 'portfolio-profile-help-v1',
        value: 'acknowledged',
        url: 'http://127.0.0.1:4173',
      },
    ]);
  if (options.skillSortHelpAcknowledged !== false)
    await page.context().addCookies([
      {
        name: 'portfolio-profile-skill-sorting-help-v1',
        value: 'acknowledged',
        url: 'http://127.0.0.1:4173',
      },
    ]);
  if (options.skillLibraryHelpAcknowledged !== false)
    await page.context().addCookies([
      {
        name: 'portfolio-profile-skill-library-help-v1',
        value: 'acknowledged',
        url: 'http://127.0.0.1:4173',
      },
    ]);
  await page.route('**/api/authority/session', (route) =>
    route.fulfill({
      json: {
        id: 91,
        user: options.user ?? (options.existingApi ? 'alex' : 'operator'),
        email: 'operator@example.com',
        role: 'member',
        is_create: true,
        is_read: true,
        is_update: true,
        is_delete: true,
        is_manage_roles: false,
        is_manage_users: false,
        is_monitor: false,
        is_manage_sites: false,
        ...options.permissions,
      },
    }),
  );
  let snapshot =
    options.snapshot ??
    ownerProfileSnapshot(options.user ?? (options.existingApi ? 'alex' : 'operator'));
  await page.route('**/api/portfolio/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.includes('/portfolio/me/')) {
      const body = ownerProfileResponse(snapshot, url.pathname, url.searchParams);
      return body === undefined ? route.fallback() : route.fulfill({ json: body });
    }
    if (url.pathname.endsWith('/portfolio/site/save')) {
      const input = route.request().postDataJSON();
      if (input.expected_revision !== snapshot.revision)
        return route.fulfill({ status: 409, json: { detail: 'PORTFOLIO_EDIT_CONFLICT' } });
      const saved = saveOwnerProfile(snapshot, input);
      snapshot = saved.snapshot;
      return route.fulfill({ json: saved.response });
    }
    return route.fallback();
  });
  await options.beforeNavigate?.(page);
  await page.goto(path);
  if (options.waitForWorkspace !== false)
    await expect(page.locator('[data-profile-editor]')).toBeVisible();
}

/** Navigate through the shared private rail/drawer while retaining the current draft and query. */
export async function tab(page: Page, caption: string) {
  const section = caption.toLowerCase();
  const mobile = page.viewportSize()!.width <= 1024;
  if (mobile) await page.locator('button[aria-controls="management-navigation"]').click();
  const navigation = page.locator(mobile ? '[data-sidebar-drawer]' : '[data-sidebar-rail]');
  await navigation.locator(`[data-sidebar-item="${section}"]`).click();
  if (mobile) await expect(navigation).toHaveCount(0);
  const panel = page.locator('[data-profile-section]');
  await expect(panel).toHaveAttribute('data-profile-section', section);
  await expect(panel).toHaveCSS('opacity', '1');
}

export function field(page: Page, label: string) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return page.getByLabel(new RegExp('^' + escaped + '(?:\\s*＊)?$'));
}

/** Exercise the existing themed language disclosure rather than the browser's native select UI. */
export async function contentLanguage(page: Page, locale: string) {
  const trigger = field(page, 'Content language');
  await trigger.click();
  const option = page.locator(`[data-locale="${locale}"]:visible`);
  const label = (await option.innerText()).trim();
  await option.click();
  // Router commits are deferred; wait for the controlled value before typing into another locale.
  await expect(trigger).toHaveText(label);
  await expect(page).toHaveURL((url) => url.searchParams.get('contentLocale') === locale);
}

export async function save(page: Page) {
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByText('All changes saved', { exact: true })).toBeVisible();
}
