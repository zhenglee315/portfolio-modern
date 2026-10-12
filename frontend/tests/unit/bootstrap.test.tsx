import { act, cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { QueryClientProvider, dehydrate, type QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppProviders } from '@/app/providers/AppProviders';
import { createI18n } from '@/i18n/config';
import { useTranslation } from 'react-i18next';
import { I18nextProvider } from 'react-i18next';
import type { ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { createQueryClient } from '@/app/query-client';
import { ProfileOverview, siteQuery } from '@/features/site';
import {
  authSessionKey,
  rememberAuthSession,
  useAuthSession,
  useAuthSignOut,
} from '@/features/auth/session';
import { AccountMenu } from '@/features/account-menu';
import { siteFixture } from '../fixtures/portfolio';

const clients = new Set<QueryClient>();

afterEach(() => {
  cleanup();
  clients.forEach((client) => client.clear());
  clients.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function sessionClient() {
  const client = createQueryClient();
  client.setQueryData(siteQuery('en').queryKey, siteFixture);
  clients.add(client);
  return client;
}

function SessionBoundary({ client, children }: { client: QueryClient; children: ReactNode }) {
  return (
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={createI18n('en')}>{children}</I18nextProvider>
    </QueryClientProvider>
  );
}

function SessionIdentity({ label }: { label: string }) {
  const session = useAuthSession();
  return <output aria-label={label}>{session.data?.email ?? 'Guest'}</output>;
}

function SessionOverview() {
  return <ProfileOverview locale="en" onExplore={vi.fn()} />;
}

/** Exercise the real entry, query and mutation together without public-page network requests. */
function SessionEntry({ onLogin }: { onLogin?: () => void }) {
  const signOut = useAuthSignOut();
  const session = useAuthSession({ enabled: !signOut.isPending });
  const entry = (
    <AccountMenu
      account={session.data ?? null}
      busy={signOut.isPending || session.isPending}
      onLogin={onLogin}
      onLogout={() => signOut.mutate()}
    />
  );
  return (
    <>
      {entry}
      <output aria-label="Entry account">{session.data?.email ?? 'Guest'}</output>
      {signOut.isError && <p role="alert">Unable to sign out</p>}
    </>
  );
}

/** Open the real gear before inspecting or activating its account row. */
function authEntry(view: ReturnType<typeof render>, name: string) {
  const trigger = view.getByRole('button', { name: 'Account settings' });
  if (trigger.getAttribute('aria-expanded') !== 'true') fireEvent.click(trigger);
  return view.getByRole('menuitem', { name });
}

/** Render only the localized provider boundary, independently of API features. */
function Heading() {
  const { t } = useTranslation();
  return <h1>{t('profile.title')}</h1>;
}

describe('application localization boundaries', () => {
  it('keeps independently initialized render contexts in their own language', () => {
    const english = createI18n('en');
    const traditionalChinese = createI18n('zh-Hant');

    expect(english.t('profile.title')).toBe('Personal profile');
    expect(traditionalChinese.t('profile.title')).toBe('個人檔案');
  });

  it('updates visible translations when the route locale changes', () => {
    const view = render(
      <AppProviders locale="en">
        <Heading />
      </AppProviders>,
    );
    expect(within(view.container).getByRole('heading', { name: 'Personal profile' })).toBeVisible();

    view.rerender(
      <AppProviders locale="zh-Hant">
        <Heading />
      </AppProviders>,
    );
    expect(within(view.container).getByRole('heading', { name: '個人檔案' })).toBeVisible();
    expect(within(view.container).queryByRole('heading', { name: 'Personal profile' })).toBeNull();
  });
});

describe('private account identity boundaries', () => {
  const account = {
    id: 12,
    email: 'Case.Owner+Portfolio@example.com',
    user: 'case-owner-portfolio',
    role: 'editor',
    is_create: true,
    is_read: true,
    is_update: true,
    is_delete: true,
    is_manage_roles: false,
    is_manage_users: false,
    is_manage_sites: false,
  };

  it('shares one restoration request across readers and restores a fresh page from its session', async () => {
    const fetch = vi.fn().mockImplementation(async () => new Response(JSON.stringify(account)));
    vi.stubGlobal('fetch', fetch);
    const client = sessionClient();
    const view = render(
      <SessionBoundary client={client}>
        <SessionIdentity label="First account" />
        <SessionIdentity label="Second account" />
        <SessionOverview />
      </SessionBoundary>,
    );
    await waitFor(() =>
      expect(view.getByLabelText('First account')).toHaveTextContent(account.email),
    );
    expect(view.getByLabelText('Second account')).toHaveTextContent(account.email);
    expect(view.container.querySelector('.eyebrow')).toHaveTextContent(
      siteFixture.profile.introContent,
    );
    expect(view.container.querySelector('.eyebrow')).not.toHaveTextContent('Case.Owner+Portfolio');
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0]![0]).toBe('/api/authority/session');
    view.unmount();

    const refreshedClient = sessionClient();
    expect(refreshedClient.getQueryData(authSessionKey)).toBeUndefined();
    const refreshed = render(
      <SessionBoundary client={refreshedClient}>
        <SessionIdentity label="Restored account" />
        <SessionOverview />
      </SessionBoundary>,
    );
    await waitFor(() =>
      expect(refreshed.getByLabelText('Restored account')).toHaveTextContent(account.email),
    );
    expect(refreshed.container.querySelector('.eyebrow')).toHaveTextContent(
      siteFixture.profile.introContent,
    );
    expect(refreshed.container.querySelector('.eyebrow')).not.toHaveTextContent(account.email);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('keeps the original public introduction when restoration returns a guest', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('null'));
    vi.stubGlobal('fetch', fetch);
    const client = sessionClient();
    const view = render(
      <SessionBoundary client={client}>
        <SessionIdentity label="Guest account" />
        <SessionOverview />
      </SessionBoundary>,
    );
    await waitFor(() => expect(client.getQueryData(authSessionKey)).toBeNull());
    expect(view.container.querySelector('.eyebrow')).toHaveTextContent(
      siteFixture.profile.introContent,
    );
    expect(view.getByLabelText('Guest account')).toHaveTextContent('Guest');
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('prevents a canceled guest restoration from overwriting a newly authenticated account', async () => {
    let resolveRestore: (response: Response) => void = () => {};
    const fetch = vi.fn<(url: string, options: RequestInit) => Promise<Response>>(
      () => new Promise<Response>((resolve) => (resolveRestore = resolve)),
    );
    vi.stubGlobal('fetch', fetch);
    const client = sessionClient();
    const view = render(
      <SessionBoundary client={client}>
        <SessionIdentity label="First account" />
        <SessionIdentity label="Second account" />
        <SessionOverview />
      </SessionBoundary>,
    );
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    const restoreSignal = fetch.mock.calls[0]![1].signal!;
    const controller = new AbortController();
    await act(async () => rememberAuthSession(client, account, controller.signal));
    expect(restoreSignal.aborted).toBe(true);
    await act(async () => resolveRestore(new Response('null')));
    await waitFor(() =>
      expect(view.getByLabelText('First account')).toHaveTextContent(account.email),
    );
    expect(view.getByLabelText('Second account')).toHaveTextContent(account.email);
    expect(view.container.querySelector('.eyebrow')).toHaveTextContent(
      siteFixture.profile.introContent,
    );
    expect(view.container.querySelector('.eyebrow')).not.toHaveTextContent(account.email);
    expect(client.getQueryData(authSessionKey)).toEqual(account);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('does not publish identity if authentication is canceled while restoration is being canceled', async () => {
    const client = sessionClient();
    client.setQueryData(authSessionKey, null);
    let finishCancellation = () => {};
    vi.spyOn(client, 'cancelQueries').mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishCancellation = resolve;
        }),
    );
    const controller = new AbortController();
    const pending = rememberAuthSession(client, account, controller.signal);
    controller.abort();
    finishCancellation();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(client.getQueryData(authSessionKey)).toBeNull();
  });

  it('keeps cached browser identity out of SSR, private fetches and hydration snapshots', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const client = sessionClient();
    // Cover a preexisting guest query whose metadata was not established by a hook.
    client.setQueryData(authSessionKey, null);
    await rememberAuthSession(client, account, new AbortController().signal);
    const html = renderToString(
      <SessionBoundary client={client}>
        <SessionIdentity label="Server account" />
        <SessionEntry onLogin={vi.fn()} />
        <SessionOverview />
      </SessionBoundary>,
    );
    expect(html).toContain(siteFixture.profile.introContent);
    expect(html).toContain('Guest');
    expect(html).toContain('aria-label="Account settings"');
    expect(html).not.toContain('aria-label="Sign out"');
    expect(html).not.toContain('Case.Owner+Portfolio');
    expect(html).not.toContain(account.email);
    expect(fetch).not.toHaveBeenCalled();
    const snapshot = dehydrate(client);
    expect(snapshot.queries.map((query) => query.queryKey)).toContainEqual(
      siteQuery('en').queryKey,
    );
    expect(snapshot.queries.map((query) => query.queryKey)).not.toContainEqual(authSessionKey);
    expect(JSON.stringify(snapshot)).not.toContain(account.email);
  });

  it.each([
    'Case.Owner+Portfolio@example.com',
    `${'Ab'.repeat(32)}@example.com`,
    'zhenglee315@gmail.com',
  ])('keeps the public overview unchanged with cached account %s', (email) => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const client = sessionClient();
    client.setQueryData(authSessionKey, { ...account, email });
    const view = render(
      <SessionBoundary client={client}>
        <SessionOverview />
      </SessionBoundary>,
    );
    const eyebrow = view.container.querySelector('.eyebrow');
    expect(eyebrow?.textContent).toBe(siteFixture.profile.introContent);
    expect(view.container).not.toHaveTextContent(email.split('@')[0]!);
    expect(view.container).not.toHaveTextContent(email);
    expect(view.getByRole('heading', { level: 1 })).toHaveTextContent('Alex Example');
    expect(view.getByText(siteFixture.profile.content)).toBeVisible();
    expect(client.getQueryData(siteQuery('en').queryKey)).toEqual(siteFixture);
    expect(client.getQueryData(authSessionKey)).toEqual({ ...account, email });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('keeps the guest entry delegated to sign-in navigation', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('null'));
    vi.stubGlobal('fetch', fetch);
    const onLogin = vi.fn();
    const client = sessionClient();
    const view = render(
      <SessionBoundary client={client}>
        <SessionEntry onLogin={onLogin} />
      </SessionBoundary>,
    );
    const entry = authEntry(view, 'Sign in');
    await waitFor(() => expect(entry).not.toHaveAttribute('aria-disabled', 'true'));
    expect(entry).toHaveAttribute('data-auth-action', 'sign-in');
    fireEvent.click(entry);
    expect(onLogin).toHaveBeenCalledOnce();
    expect(view.queryByRole('menuitem', { name: 'Sign out', hidden: true })).toBeNull();
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0]![0]).toBe('/api/authority/session');
  });

  it('switches the entry after successful authentication without changing the public introduction', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('null'));
    vi.stubGlobal('fetch', fetch);
    const client = sessionClient();
    const view = render(
      <SessionBoundary client={client}>
        <SessionEntry onLogin={vi.fn()} />
        <SessionOverview />
      </SessionBoundary>,
    );
    await waitFor(() =>
      expect(authEntry(view, 'Sign in')).not.toHaveAttribute('aria-disabled', 'true'),
    );
    await act(async () => rememberAuthSession(client, account, new AbortController().signal));
    await waitFor(() =>
      expect(authEntry(view, 'Sign out')).not.toHaveAttribute('aria-disabled', 'true'),
    );
    expect(authEntry(view, 'Sign out')).toHaveAttribute('data-auth-action', 'sign-out');
    expect(view.getByLabelText('Entry account')).toHaveTextContent(account.email);
    expect(view.container.querySelector('.eyebrow')).toHaveTextContent(
      siteFixture.profile.introContent,
    );
    expect(view.container.querySelector('.eyebrow')).not.toHaveTextContent(account.email);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('restores the sign-out entry, clears it on success and stays signed out after a fresh mount', async () => {
    let authenticated = true;
    const fetch = vi.fn(async (url: string) => {
      if (url === '/api/authority/sign-out') {
        authenticated = false;
        return new Response(JSON.stringify({ signed_out: true }));
      }
      return new Response(JSON.stringify(authenticated ? account : null));
    });
    vi.stubGlobal('fetch', fetch);
    const client = sessionClient();
    const view = render(
      <SessionBoundary client={client}>
        <SessionEntry onLogin={vi.fn()} />
      </SessionBoundary>,
    );
    await waitFor(() =>
      expect(authEntry(view, 'Sign out')).not.toHaveAttribute('aria-disabled', 'true'),
    );
    fireEvent.click(authEntry(view, 'Sign out'));
    await waitFor(() =>
      expect(authEntry(view, 'Sign in')).not.toHaveAttribute('aria-disabled', 'true'),
    );
    expect(client.getQueryData(authSessionKey)).toBeNull();
    expect(view.getByLabelText('Entry account')).toHaveTextContent('Guest');
    expect(client.getQueryData(siteQuery('en').queryKey)).toEqual(siteFixture);
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      '/api/authority/session',
      '/api/authority/sign-out',
    ]);
    view.unmount();

    const refreshedClient = sessionClient();
    const refreshed = render(
      <SessionBoundary client={refreshedClient}>
        <SessionEntry onLogin={vi.fn()} />
      </SessionBoundary>,
    );
    await waitFor(() =>
      expect(authEntry(refreshed, 'Sign in')).not.toHaveAttribute('aria-disabled', 'true'),
    );
    expect(refreshed.queryByRole('menuitem', { name: 'Sign out', hidden: true })).toBeNull();
    expect(refreshedClient.getQueryData(authSessionKey)).toBeNull();
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      '/api/authority/session',
      '/api/authority/sign-out',
      '/api/authority/session',
    ]);
  });

  it('blocks repeated sign-out taps from the shared gear while the request is pending', async () => {
    let resolveSignOut: (response: Response) => void = () => {};
    const fetch = vi.fn(() => new Promise<Response>((resolve) => (resolveSignOut = resolve)));
    vi.stubGlobal('fetch', fetch);
    const client = sessionClient();
    client.setQueryData(authSessionKey, account);
    const onLogin = vi.fn();
    const view = render(
      <SessionBoundary client={client}>
        <SessionEntry onLogin={onLogin} />
      </SessionBoundary>,
    );
    const entry = authEntry(view, 'Sign out');
    act(() => {
      fireEvent.click(entry);
      fireEvent.click(entry);
    });
    await waitFor(() =>
      expect(authEntry(view, 'Sign out')).toHaveAttribute('aria-disabled', 'true'),
    );
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    expect(view.getByLabelText('Entry account')).toHaveTextContent(account.email);
    expect(client.getQueryData(authSessionKey)).toEqual(account);
    fireEvent.click(authEntry(view, 'Sign out'));
    expect(fetch).toHaveBeenCalledOnce();
    expect(onLogin).not.toHaveBeenCalled();
    await act(async () => resolveSignOut(new Response(JSON.stringify({ signed_out: true }))));
    await waitFor(() =>
      expect(authEntry(view, 'Sign in')).not.toHaveAttribute('aria-disabled', 'true'),
    );
    expect(client.getQueryData(authSessionKey)).toBeNull();
  });

  it('retains the account after a sign-out error and enables a successful retry', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ detail: 'SESSION_UNAVAILABLE' }), { status: 503 }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ signed_out: true })));
    vi.stubGlobal('fetch', fetch);
    const client = sessionClient();
    client.setQueryData(authSessionKey, account);
    const view = render(
      <SessionBoundary client={client}>
        <SessionEntry onLogin={vi.fn()} />
      </SessionBoundary>,
    );
    fireEvent.click(authEntry(view, 'Sign out'));
    await waitFor(() => expect(view.getByRole('alert')).toHaveTextContent('Unable to sign out'));
    expect(authEntry(view, 'Sign out')).not.toHaveAttribute('aria-disabled', 'true');
    expect(view.getByLabelText('Entry account')).toHaveTextContent(account.email);
    expect(client.getQueryData(authSessionKey)).toEqual(account);
    expect(fetch).toHaveBeenCalledOnce();
    fireEvent.click(authEntry(view, 'Sign out'));
    await waitFor(() =>
      expect(authEntry(view, 'Sign in')).not.toHaveAttribute('aria-disabled', 'true'),
    );
    expect(view.queryByRole('alert')).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(client.getQueryData(authSessionKey)).toBeNull();
  });

  it('prevents an old account restoration from restoring identity after sign-out', async () => {
    let resolveRestore: (response: Response) => void = () => {};
    const fetch = vi.fn<(url: string, options: RequestInit) => Promise<Response>>((url) => {
      if (url === '/api/authority/session') {
        return new Promise<Response>((resolve) => (resolveRestore = resolve));
      }
      return Promise.resolve(new Response(JSON.stringify({ signed_out: true })));
    });
    vi.stubGlobal('fetch', fetch);
    const client = sessionClient();
    client.setQueryData(authSessionKey, account);
    const view = render(
      <SessionBoundary client={client}>
        <SessionEntry onLogin={vi.fn()} />
      </SessionBoundary>,
    );
    let restoration: Promise<void> = Promise.resolve();
    act(() => {
      restoration = client.refetchQueries({ queryKey: authSessionKey, exact: true });
    });
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    const restoreSignal = fetch.mock.calls[0]![1].signal;
    fireEvent.click(authEntry(view, 'Sign out'));
    await waitFor(() =>
      expect(authEntry(view, 'Sign in')).not.toHaveAttribute('aria-disabled', 'true'),
    );
    expect(restoreSignal?.aborted).toBe(true);
    await act(async () => {
      resolveRestore(new Response(JSON.stringify(account)));
      await restoration;
    });
    expect(client.getQueryData(authSessionKey)).toBeNull();
    expect(view.getByLabelText('Entry account')).toHaveTextContent('Guest');
    expect(view.queryByRole('menuitem', { name: 'Sign out', hidden: true })).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
