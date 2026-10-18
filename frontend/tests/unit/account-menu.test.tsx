import { fireEvent, render, waitFor, within } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccountMenu } from '@/features/account-menu';
import type { AuthUser } from '@/features/auth/schemas/auth';
import { createI18n, type Locale } from '@/i18n/config';

const account: AuthUser = {
  id: 1,
  user: 'ironman',
  email: 'owner@example.com',
  role: 'editor',
  is_create: true,
  is_read: true,
  is_update: true,
  is_delete: true,
  is_manage_roles: false,
  is_manage_users: false,
  is_monitor: false,
  is_manage_sites: false,
};

afterEach(() => vi.unstubAllGlobals());

/** Render the presentation boundary without API clients or private session readers. */
function renderMenu(
  identity: AuthUser | null = null,
  locale: Locale = 'en',
  actions: Partial<ComponentProps<typeof AccountMenu>> = {},
) {
  const view = render(
    <I18nextProvider i18n={createI18n(locale)}>
      <AccountMenu
        account={identity}
        preferences={{
          theme: <button type="button">Appearance control</button>,
          language: <button type="button">Language control</button>,
        }}
        {...actions}
      />
      <button type="button">Outside menu</button>
    </I18nextProvider>,
  );
  const trigger = view.getByRole('button', {
    name: createI18n(locale).t('accountMenu.trigger'),
  });
  fireEvent.click(trigger);
  return {
    ...view,
    trigger,
    menu: view.getByRole('menu', { name: trigger.getAttribute('aria-label')! }),
  };
}

describe('permission-aware account menu framework', () => {
  it('shows exactly three guest rows in order and reuses the existing login heartbeat', () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const view = renderMenu();
    expect(
      within(view.menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent?.trim()),
    ).toEqual(['Theme', 'Language', 'Sign in']);
    const login = within(view.menu).getByRole('menuitem', { name: 'Sign in' });
    expect(login.querySelector('[data-icon-pulse="chat"]')).toHaveAttribute(
      'data-icon-highlight',
      '',
    );
    expect(login.querySelector('.bi-door-open-fill')).not.toBeNull();
    expect(view.trigger.querySelector('.bi-gear-fill')).not.toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(
    [false, true].flatMap((monitor) =>
      [false, true].flatMap((sites) =>
        [false, true].flatMap((roles) =>
          [false, true].map((users) => [monitor, sites, roles, users]),
        ),
      ),
    ),
  )(
    'filters rows for monitor=%s, sites=%s, roles=%s, users=%s without role names',
    (monitor, sites, roles, users) => {
      const view = renderMenu({
        ...account,
        role: 'custom-role',
        is_monitor: monitor,
        is_manage_sites: sites,
        is_manage_roles: roles,
        is_manage_users: users,
      });
      expect(
        within(view.menu)
          .getAllByRole('menuitem')
          .map((item) => item.textContent?.trim()),
      ).toEqual([
        'Profile',
        ...(monitor ? ['Overview', 'Requests', 'Workers'] : []),
        ...(sites ? ['Platform'] : []),
        ...(roles ? ['Roles'] : []),
        ...(users ? ['Users'] : []),
        'Theme',
        'Language',
        'Sign out',
      ]);
      expect(within(view.menu).queryByRole('group', { name: 'Monitor' })).toBe(
        monitor ? within(view.menu).getByRole('group', { name: 'Monitor' }) : null,
      );
      expect(within(view.menu).queryByRole('group', { name: 'Management' })).toBe(
        sites || roles || users
          ? within(view.menu).getByRole('group', { name: 'Management' })
          : null,
      );
      expect(
        within(within(view.menu).getByRole('group', { name: 'Preferences' }))
          .getAllByRole('menuitem')
          .map((item) => item.textContent?.trim()),
      ).toEqual(['Theme', 'Language']);
      expect(view.menu).toHaveTextContent('ironman');
      expect(view.menu).not.toHaveTextContent(account.email);
      expect(within(view.menu).queryByRole('menuitem', { name: 'Sign in' })).toBeNull();
    },
  );

  it.each([
    ['en', ['Theme', 'Language', 'Sign in']],
    ['zh-Hans', ['主题', '语言', '登录']],
    ['zh-Hant', ['主題', '語言', '登入']],
  ] as const)('localizes all guest rows for %s', (locale, labels) => {
    const view = renderMenu(null, locale);
    expect(
      within(view.menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent?.trim()),
    ).toEqual(labels);
  });

  it('delegates ordinary rows without adding menu-owned network or navigation', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const initialUrl = window.location.href;
    const view = renderMenu({ ...account, is_manage_sites: true, is_manage_roles: true });
    const labels = within(view.menu)
      .getAllByRole('menuitem')
      .map((item) => item.textContent!.trim())
      .filter((label) => !['Theme', 'Language'].includes(label));
    for (const label of labels) {
      fireEvent.click(view.getByRole('menuitem', { name: label }));
      await waitFor(() => expect(view.trigger).toHaveAttribute('aria-expanded', 'false'));
      expect(view.trigger).toHaveFocus();
      fireEvent.click(view.trigger);
    }
    expect(fetch).not.toHaveBeenCalled();
    expect(window.location.href).toBe(initialUrl);
  });

  it.each(['Theme', 'Language'])(
    'opens %s controls and returns focus without closing the gear',
    async (label) => {
      const view = renderMenu(null, 'en', { busy: true });
      fireEvent.click(view.getByRole('menuitem', { name: label }));
      expect(view.trigger).toHaveAttribute('aria-expanded', 'true');
      expect(view.queryByRole('menuitem')).toBeNull();
      expect(
        view.getByRole('button', {
          name: label === 'Theme' ? 'Appearance control' : 'Language control',
        }),
      ).toBeVisible();
      const back = view.getByRole('button', { name: 'Back to settings' });
      await waitFor(() => expect(back).toHaveFocus());
      fireEvent.keyDown(back, { key: 'Escape' });
      await waitFor(() => expect(view.getByRole('menuitem', { name: label })).toHaveFocus());
      expect(view.trigger).toHaveAttribute('aria-expanded', 'true');
      fireEvent.click(view.getByRole('menuitem', { name: label }));
      fireEvent.click(view.getByRole('button', { name: 'Back to settings' }));
      await waitFor(() => expect(view.getByRole('menuitem', { name: label })).toHaveFocus());
      fireEvent.keyDown(view.getByRole('menuitem', { name: label }), { key: 'Escape' });
      await waitFor(() => expect(view.trigger).toHaveAttribute('aria-expanded', 'false'));
      expect(view.trigger).toHaveFocus();
    },
  );

  it.each([false, true])(
    'delegates the %s account action and closes the gear',
    async (signedIn) => {
      const onLogin = vi.fn();
      const onLogout = vi.fn();
      const view = renderMenu(signedIn ? account : null, 'en', { onLogin, onLogout });
      fireEvent.click(
        within(view.menu).getByRole('menuitem', { name: signedIn ? 'Sign out' : 'Sign in' }),
      );
      expect(signedIn ? onLogout : onLogin).toHaveBeenCalledOnce();
      expect(signedIn ? onLogin : onLogout).not.toHaveBeenCalled();
      await waitFor(() => expect(view.trigger).toHaveAttribute('aria-expanded', 'false'));
    },
  );

  it.each([false, true])('disables only the %s account action while busy', (signedIn) => {
    const onLogin = vi.fn();
    const onLogout = vi.fn();
    const view = renderMenu(signedIn ? account : null, 'en', { busy: true, onLogin, onLogout });
    const action = within(view.menu).getByRole('menuitem', {
      name: signedIn ? 'Sign out' : 'Sign in',
    });
    expect(action).toHaveAttribute('aria-disabled', 'true');
    expect(action).toHaveAttribute('aria-busy', 'true');
    fireEvent.click(action);
    expect(onLogin).not.toHaveBeenCalled();
    expect(onLogout).not.toHaveBeenCalled();
    expect(within(view.menu).getByRole('menuitem', { name: 'Theme' })).toBeEnabled();
  });

  it('focuses the first row, supports Bootstrap keyboard navigation and restores Escape focus', async () => {
    const view = renderMenu();
    const theme = within(view.menu).getByRole('menuitem', { name: 'Theme' });
    const language = within(view.menu).getByRole('menuitem', { name: 'Language' });
    await waitFor(() => expect(theme).toHaveFocus());
    fireEvent.keyDown(theme, { key: 'ArrowDown' });
    await waitFor(() => expect(language).toHaveFocus());
    fireEvent.keyDown(language, { key: 'Escape' });
    await waitFor(() => expect(view.trigger).toHaveAttribute('aria-expanded', 'false'));
    expect(view.trigger).toHaveFocus();
  });

  it('dismisses on outside focus and leaves focus with the new control', async () => {
    const view = renderMenu();
    await waitFor(() =>
      expect(within(view.menu).getByRole('menuitem', { name: 'Theme' })).toHaveFocus(),
    );
    const outside = view.getByRole('button', { name: 'Outside menu' });
    outside.focus();
    await waitFor(() => expect(view.trigger).toHaveAttribute('aria-expanded', 'false'));
    expect(outside).toHaveFocus();
  });
});
