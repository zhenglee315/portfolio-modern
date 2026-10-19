import { expect, type Page } from '@playwright/test';
import { ownerProfileSnapshot, ownerProfileResponse, canonicalOwnerDraft } from './profile-owner';

export const draftKey = 'portfolio.profile-draft.v1:91';

/** Restore the established session and serve existing Portfolio DTOs without backend writes. */
export async function openEditor(
  page: Page,
  path = '/en/profile',
  theme = 'mint',
  options: {
    existingApi?: boolean;
    user?: string;
    waitForWorkspace?: boolean;
    beforeNavigate?: (page: Page) => Promise<void>;
    permissions?: Partial<Record<'is_create' | 'is_read' | 'is_update' | 'is_delete', boolean>>;
  } = {},
) {
  await page.context().addCookies([
    {
      name: 'portfolio-appearance',
      value: encodeURIComponent(JSON.stringify({ theme, paused: true })),
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
  let snapshot = ownerProfileSnapshot(options.user ?? (options.existingApi ? 'alex' : 'operator'));
  await page.route('**/api/portfolio/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.includes('/portfolio/me/')) {
      const body = ownerProfileResponse(snapshot, url.pathname);
      return body === undefined ? route.fallback() : route.fulfill({ json: body });
    }
    if (url.pathname.endsWith('/portfolio/site/save')) {
      const input = route.request().postDataJSON();
      if (input.expected_revision !== snapshot.revision)
        return route.fulfill({ status: 409, json: { detail: 'PORTFOLIO_EDIT_CONFLICT' } });
      snapshot = { ...canonicalOwnerDraft(input.draft), revision: snapshot.revision! + 1 };
      return route.fulfill({ json: { revision: snapshot.revision, draft: snapshot } });
    }
    return route.fallback();
  });
  await options.beforeNavigate?.(page);
  await page.goto(path);
  if (options.waitForWorkspace !== false)
    await expect(page.locator('[data-profile-editor]')).toBeVisible();
}

export async function tab(page: Page, caption: string) {
  await page
    .locator('main nav')
    .getByRole('button', { name: new RegExp(caption) })
    .click();
  const section = caption === 'OVERVIEW' ? 'overview' : caption.toLowerCase();
  const panel = page.locator('[data-profile-section]');
  await expect(panel).toHaveAttribute('data-profile-section', section);
  await expect(panel).toHaveCSS('opacity', '1');
}

export function field(page: Page, label: string) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return page.getByLabel(new RegExp('^' + escaped + '(?:\\s*＊)?$'));
}

export async function save(page: Page) {
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByText('All changes saved', { exact: true })).toBeVisible();
}
