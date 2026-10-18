import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthPanel } from '@/features/auth/components/AuthPanel';
import { ConnectedAuthPanel } from '@/features/auth';
import type { AuthRequest } from '@/features/auth/components/AuthPanel';
import { createI18n, type Locale } from '@/i18n/config';
import { ApiError } from '@/shared/api/http';
import { NotificationProvider } from '@/shared/ui/NotificationProvider';
import { useAuthNavigation } from '@/pages/portfolio/hooks/useAuthNavigation';
import { createQueryClient } from '@/app/query-client';
import { authSessionKey } from '@/features/auth/session';

// Form tests keep the independently tested SVG scene out of this account boundary.
vi.mock('@/features/auth/components/AuthCowScene', () => ({
  AuthCowScene: ({ denied = false }: { denied?: boolean }) => (
    <div data-testid="auth-cow-state" data-denied={String(denied)} />
  ),
}));

const clients = new Set<QueryClient>();

function renderPanel(
  locale: Locale = 'en',
  onAuthenticate?: (request: AuthRequest) => Promise<void>,
  connected = false,
  onSuccess?: () => void,
) {
  const i18n = createI18n(locale);
  const onBack = vi.fn();
  const client = createQueryClient();
  clients.add(client);
  const view = render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <NotificationProvider
          copy={{
            close: i18n.t('notifications.close'),
            labels: {
              success: i18n.t('notifications.labels.success'),
              warning: i18n.t('notifications.labels.warning'),
              error: i18n.t('notifications.labels.error'),
              bug: i18n.t('notifications.labels.bug'),
            },
            defaults: {
              success: i18n.t('notifications.defaults.success'),
              warning: i18n.t('notifications.defaults.warning'),
              error: i18n.t('notifications.defaults.error'),
              bug: i18n.t('notifications.defaults.bug'),
            },
          }}
        >
          {connected ? (
            <ConnectedAuthPanel initialFocus onBack={onBack} onSuccess={onSuccess} />
          ) : (
            <AuthPanel
              initialFocus
              onBack={onBack}
              onAuthenticate={onAuthenticate}
              onSuccess={onSuccess}
            />
          )}
        </NotificationProvider>
      </I18nextProvider>
    </QueryClientProvider>,
  );
  return {
    view,
    i18n,
    onBack,
    client,
    user: userEvent.setup(),
    modes: within(view.getByRole('group', { name: i18n.t('auth.modeLabel') })),
    form: () => view.container.querySelector('form')!,
  };
}

// Resolve each result through the input's accessible description and its label row.
function inlineFieldResult(input: HTMLElement) {
  const descriptionId = input.getAttribute('aria-describedby');
  expect(descriptionId).toBeTruthy();
  const result = input.ownerDocument.getElementById(descriptionId!);
  expect(result).toBeVisible();
  const label = (input as HTMLInputElement).labels?.[0];
  expect(label).toBeDefined();
  expect(label?.parentElement).toContainElement(result);
  return result!;
}

function expectFieldError(input: HTMLElement, message: string) {
  expect(input).toHaveAttribute('aria-invalid', 'true');
  expect(input).toHaveAccessibleDescription(message);
  const result = inlineFieldResult(input);
  expect(result).toHaveTextContent(message);
  expect(result).not.toHaveAttribute('data-field-status', 'valid');
  return result;
}

function expectFieldValid(input: HTMLElement, label: string) {
  expect(input).not.toHaveAttribute('aria-invalid', 'true');
  const result = inlineFieldResult(input);
  expect(result).toHaveAttribute('data-field-status', 'valid');
  expect(within(result).getByRole('img', { name: label })).toBeVisible();
  expect(result.querySelector('svg.bi-check-lg')).not.toBeNull();
  return result;
}

afterEach(() => {
  cleanup();
  clients.forEach((client) => client.clear());
  clients.clear();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.sessionStorage.clear();
});

describe('connected sign-in form', () => {
  const account = {
    id: 12,
    email: 'person@example.com',
    user: 'person',
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

  function fillLogin(view: ReturnType<typeof render>) {
    fireEvent.change(view.getByLabelText('Email'), { target: { value: account.email } });
    fireEvent.change(view.getByLabelText('Password', { exact: true }), {
      target: { value: 'test-password' },
    });
  }

  it('sends one login request, waits for its validated response and clears visible credentials', async () => {
    let resolveRequest: (response: Response) => void = () => {};
    const fetch = vi.fn<(url: string, options: RequestInit) => Promise<Response>>(
      () => new Promise<Response>((resolve) => (resolveRequest = resolve)),
    );
    vi.stubGlobal('fetch', fetch);
    const save = vi.spyOn(Storage.prototype, 'setItem');
    const { view, user, form, i18n } = renderPanel('en', undefined, true);
    fillLogin(view);
    await user.click(view.getByRole('button', { name: 'Show password' }));
    expect(view.getByLabelText('Password', { exact: true })).toHaveAttribute('type', 'text');

    fireEvent.submit(form());
    fireEvent.submit(form());
    expect(fetch).toHaveBeenCalledOnce();
    const [url, options] = fetch.mock.calls[0]!;
    expect(url).toBe('/api/authority/sign-in');
    expect(options).toMatchObject({
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      body: JSON.stringify({ email: account.email, password: 'test-password' }),
    });
    expect(view.container.querySelector('[data-notification-kind]')).toBeNull();
    const submit = within(form()).getByRole('button', { name: 'Sign in' });
    expect(submit).toBeDisabled();

    await act(async () => resolveRequest(new Response(JSON.stringify(account))));
    expect(view.getByRole('status')).toHaveTextContent(i18n.t('auth.welcome'));
    expect(submit).toBeEnabled();
    expect(view.getByLabelText('Password', { exact: true })).toHaveValue('');
    expect(view.getByLabelText('Password', { exact: true })).toHaveAttribute('type', 'password');
    expect(view.container).not.toHaveTextContent('test-password');
    expect(save).not.toHaveBeenCalled();
  });

  it('publishes the validated account and clears credentials before returning to the portfolio', async () => {
    let resolveRequest: (response: Response) => void = () => {};
    const fetch = vi.fn<(url: string, options: RequestInit) => Promise<Response>>(
      () => new Promise<Response>((resolve) => (resolveRequest = resolve)),
    );
    vi.stubGlobal('fetch', fetch);
    const previousUrl = window.location.href;
    const previousState: unknown = window.history.state;
    window.history.replaceState({}, '', '/en?view=login');
    const transition = { open: vi.fn(), back: vi.fn(), dismissContact: vi.fn() };
    const navigation = renderHook(() =>
      useAuthNavigation({ locale: 'en', active: true, visible: false, ...transition }),
    );
    const onSuccess = vi.fn();
    const panel = renderPanel('en', undefined, true, onSuccess);
    try {
      fillLogin(panel.view);
      onSuccess.mockImplementation(() => {
        expect(panel.client.getQueryData(authSessionKey)).toEqual(account);
        expect(panel.view.getByLabelText('Password', { exact: true })).toHaveValue('');
        navigation.result.current.leave();
      });
      fireEvent.submit(panel.form());
      expect(onSuccess).not.toHaveBeenCalled();
      expect(transition.back).not.toHaveBeenCalled();
      expect(window.location.search).toBe('?view=login');
      expect(panel.client.getQueryData(authSessionKey)).toBeUndefined();
      await act(async () => resolveRequest(new Response(JSON.stringify(account))));
      expect(onSuccess).toHaveBeenCalledOnce();
      expect(transition.back).toHaveBeenCalledOnce();
      expect(window.location.search).toBe('');
      expect(panel.client.getQueryData(authSessionKey)).toEqual(account);
      expect(fetch).toHaveBeenCalledOnce();
    } finally {
      navigation.unmount();
      window.history.replaceState(previousState, '', previousUrl);
    }
  });

  it.each(['en', 'zh-Hans', 'zh-Hant'] as const)(
    'shows a translated credential error without server details or storing credentials in %s',
    async (locale) => {
      const fetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            detail: 'INVALID_CREDENTIALS',
            private: 'test-password /private/path',
          }),
          { status: 401 },
        ),
      );
      vi.stubGlobal('fetch', fetch);
      const save = vi.spyOn(Storage.prototype, 'setItem');
      const onSuccess = vi.fn();
      const { view, form, i18n, client } = renderPanel(locale, undefined, true, onSuccess);
      fireEvent.change(view.getByLabelText(i18n.t('auth.email')), {
        target: { value: account.email },
      });
      fireEvent.change(view.getByLabelText(i18n.t('auth.password'), { exact: true }), {
        target: { value: 'test-password' },
      });

      await act(async () => fireEvent.submit(form()));
      const message = i18n.t('auth.invalidCredentials');
      expect(message).not.toBe('auth.invalidCredentials');
      expect(view.getByRole('status')).toHaveTextContent(message);
      expect(view.getByTestId('auth-cow-state')).toHaveAttribute('data-denied', 'true');
      expect(view.container.querySelector('[data-notification-kind]')).toHaveAttribute(
        'data-notification-kind',
        'warning',
      );
      expect(view.getByRole('status')).not.toHaveTextContent('test-password');
      expect(view.getByRole('status')).not.toHaveTextContent('/private/path');
      expect(view.queryByText(i18n.t('auth.welcome'), { exact: true })).toBeNull();
      expect(within(form()).getByRole('button', { name: i18n.t('auth.login') })).toBeEnabled();
      expect(fetch).toHaveBeenCalledOnce();
      expect(save).not.toHaveBeenCalled();
      expect(onSuccess).not.toHaveBeenCalled();
      expect(client.getQueryData(authSessionKey)).toBeUndefined();
    },
  );

  it.each([
    {
      status: 429,
      code: 'TOO_MANY_SIGN_IN_ATTEMPTS',
      key: 'auth.tooManyAttempts',
      kind: 'warning',
    },
    {
      status: 503,
      code: 'AUTH_STORAGE_UNAVAILABLE',
      key: 'auth.temporarilyUnavailable',
      kind: 'warning',
    },
    { status: 422, code: undefined, key: 'auth.invalidInput', kind: 'warning' },
    { status: 200, code: undefined, key: 'notifications.invalidResponse', kind: 'bug' },
  ])(
    'classifies sign-in status $status without automatic retries',
    async ({ status, code, key, kind }) => {
      const fetch = vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ detail: code ? code : [{ type: 'missing' }] }), { status }),
        );
      vi.stubGlobal('fetch', fetch);
      const onSuccess = vi.fn();
      const { view, form, i18n, client } = renderPanel('en', undefined, true, onSuccess);
      fillLogin(view);
      await act(async () => fireEvent.submit(form()));
      expect(i18n.t(key)).not.toBe(key);
      expect(view.getByRole('status')).toHaveTextContent(i18n.t(key));
      expect(view.container.querySelector('[data-notification-kind]')).toHaveAttribute(
        'data-notification-kind',
        kind,
      );
      expect(fetch).toHaveBeenCalledOnce();
      expect(view.queryByText(i18n.t('auth.welcome'), { exact: true })).toBeNull();
      expect(onSuccess).not.toHaveBeenCalled();
      expect(client.getQueryData(authSessionKey)).toBeUndefined();
    },
  );

  it.each(['mode change', 'unmount'] as const)(
    'cancels the login transport on %s and suppresses a late response',
    async (exit) => {
      let resolveRequest: (response: Response) => void = () => {};
      const fetch = vi.fn<(url: string, options: RequestInit) => Promise<Response>>(
        () => new Promise<Response>((resolve) => (resolveRequest = resolve)),
      );
      vi.stubGlobal('fetch', fetch);
      const onSuccess = vi.fn();
      const { view, form, modes, client } = renderPanel('en', undefined, true, onSuccess);
      fillLogin(view);
      fireEvent.submit(form());
      const signal = fetch.mock.calls[0]![1].signal!;
      expect(signal.aborted).toBe(false);
      if (exit === 'mode change')
        fireEvent.click(modes.getByRole('button', { name: 'Create account' }));
      else view.unmount();
      expect(signal.aborted).toBe(true);
      await act(async () => resolveRequest(new Response(JSON.stringify(account))));
      expect(view.container.querySelector('[data-notification-kind]')).toBeNull();
      expect(fetch).toHaveBeenCalledOnce();
      expect(onSuccess).not.toHaveBeenCalled();
      expect(client.getQueryData(authSessionKey)).toBeUndefined();
    },
  );

  it('cancels a login immediately when returning to the portfolio before the panel unmounts', async () => {
    let resolveRequest: (response: Response) => void = () => {};
    const fetch = vi.fn<(url: string, options: RequestInit) => Promise<Response>>(
      () => new Promise<Response>((resolve) => (resolveRequest = resolve)),
    );
    vi.stubGlobal('fetch', fetch);
    const onSuccess = vi.fn();
    const { view, form, client } = renderPanel('en', undefined, true, onSuccess);
    fillLogin(view);
    fireEvent.submit(form());
    const signal = fetch.mock.calls[0]![1].signal!;
    const submit = within(form()).getByRole('button', { name: 'Sign in' });
    expect(signal.aborted).toBe(false);
    expect(submit).toBeDisabled();

    fireEvent.click(view.getByRole('button', { name: 'Back to portfolio' }));
    expect(view.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    expect(signal.aborted).toBe(true);
    expect(submit).toBeEnabled();
    await act(async () => resolveRequest(new Response(JSON.stringify(account))));
    expect(view.container.querySelector('[data-notification-kind]')).toBeNull();
    expect(fetch).toHaveBeenCalledOnce();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(client.getQueryData(authSessionKey)).toBeUndefined();
  });
});

describe('connected registration form', () => {
  const email = 'new.person@example.com';
  const account = {
    id: 13,
    email,
    user: 'new-person',
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
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

  function mockTransport(
    overrides: Partial<
      Record<'availability' | 'send' | 'verify' | 'register', () => Response>
    > = {},
  ) {
    const fetch = vi.fn(async (url: string, options: RequestInit) => {
      if (options.method === 'GET' && url.startsWith('/api/authority/register?'))
        return overrides.availability?.() ?? json({ email, available: true });
      if (url === '/api/authority/confirm-email')
        return overrides.send?.() ?? json({ expires_in: 300, retry_after: 60 }, 202);
      if (url === '/api/authority/verify-email')
        return overrides.verify?.() ?? json({ email, verified: true });
      if (url === '/api/authority/register' && options.method === 'POST')
        return overrides.register?.() ?? json(account, 201);
      throw new Error('Unexpected account request');
    });
    vi.stubGlobal('fetch', fetch);
    return fetch;
  }

  function registrationPanel(locale: Locale = 'en', onSuccess?: () => void) {
    const panel = renderPanel(locale, undefined, true, onSuccess);
    fireEvent.click(panel.modes.getByRole('button', { name: panel.i18n.t('auth.register') }));
    return panel;
  }

  async function checkEmail(panel: ReturnType<typeof registrationPanel>, value = email) {
    const input = panel.view.getByLabelText(panel.i18n.t('auth.email'));
    fireEvent.change(input, { target: { value } });
    await act(async () => fireEvent.blur(input));
    return input;
  }

  async function sendCode(panel: ReturnType<typeof registrationPanel>) {
    await act(async () =>
      fireEvent.click(
        panel.view.getByRole('button', { name: panel.i18n.t('auth.sendVerificationCode') }),
      ),
    );
  }

  function fillPasswords(panel: ReturnType<typeof registrationPanel>) {
    fireEvent.change(panel.view.getByLabelText(panel.i18n.t('auth.password'), { exact: true }), {
      target: { value: 'private-password' },
    });
    fireEvent.change(panel.view.getByLabelText(panel.i18n.t('auth.confirmPassword')), {
      target: { value: 'private-password' },
    });
  }

  async function enterCode(panel: ReturnType<typeof registrationPanel>, code = '123') {
    await act(async () =>
      fireEvent.change(panel.view.getByLabelText(panel.i18n.t('auth.verificationCode')), {
        target: { value: code },
      }),
    );
  }

  it.each(['en', 'zh-Hans', 'zh-Hant'] as const)(
    'checks email on pointer leave and blur, puts duplicates beside the label and guards actions in %s',
    async (locale) => {
      const fetch = mockTransport({ availability: () => json({ email, available: false }) });
      const panel = registrationPanel(locale);
      const { view, form, i18n } = panel;
      const input = view.getByLabelText(i18n.t('auth.email'));
      fireEvent.change(input, { target: { value: email } });
      await act(async () => fireEvent.mouseLeave(input.parentElement!));
      await act(async () => fireEvent.blur(input));
      expect(fetch).toHaveBeenCalledOnce();
      expect(fetch.mock.calls[0]![0]).toBe(
        `/api/authority/register?email=${encodeURIComponent(email)}`,
      );
      const message = i18n.t('auth.emailExists');
      expect(message).not.toBe('auth.emailExists');
      expectFieldError(input, message);
      const buttons = [
        view.getByRole('button', { name: i18n.t('auth.sendVerificationCode') }),
        within(form()).getByRole('button', { name: i18n.t('auth.registerSubmit') }),
      ];
      for (const button of buttons) {
        expect(button).toHaveAttribute('aria-disabled', 'true');
        expect(button).toBeEnabled();
        fireEvent.click(button);
        const modal = await view.findByRole('dialog', { name: i18n.t('auth.warningTitle') });
        expect(modal).toHaveTextContent(message);
        fireEvent.click(
          within(modal).getAllByRole('button', { name: i18n.t('auth.closeWarning') })[0]!,
        );
        await waitFor(() => expect(view.queryByRole('dialog')).toBeNull());
      }
      expect(fetch).toHaveBeenCalledOnce();
    },
  );

  it('locks unchecked and pending email actions without sending a code or registering', async () => {
    let resolveCheck: (response: Response) => void = () => {};
    const fetch = vi.fn<(url: string, options: RequestInit) => Promise<Response>>(
      () => new Promise<Response>((resolve) => (resolveCheck = resolve)),
    );
    vi.stubGlobal('fetch', fetch);
    const panel = registrationPanel();
    const { view, form, i18n } = panel;
    const register = within(form()).getByRole('button', { name: 'Register' });
    expect(register).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(register);
    expect(
      await view.findByRole('dialog', { name: i18n.t('auth.warningTitle') }),
    ).toHaveTextContent(i18n.t('auth.emailCheckRequired'));
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(view.getAllByRole('button', { name: i18n.t('auth.closeWarning') })[0]!);
    await waitFor(() => expect(view.queryByRole('dialog')).toBeNull());

    const input = view.getByLabelText('Email');
    fireEvent.change(input, { target: { value: email } });
    fireEvent.blur(input);
    expect(input).toHaveAccessibleDescription(i18n.t('auth.emailChecking'));
    const send = view.getByRole('button', { name: 'Send code' });
    expect(send).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(send);
    expect(
      await view.findByRole('dialog', { name: i18n.t('auth.warningTitle') }),
    ).toHaveTextContent(i18n.t('auth.emailChecking'));
    fireEvent.submit(form());
    expect(fetch).toHaveBeenCalledOnce();
    await act(async () => resolveCheck(json({ email, available: true })));
    expectFieldValid(input, i18n.t('auth.fieldValid'));
  });

  it('uses Escape to close only the warning, preserve the form and restore its trigger focus', async () => {
    mockTransport({ availability: () => json({ email, available: false }) });
    const previousUrl = window.location.href;
    const previousState: unknown = window.history.state;
    window.history.replaceState({}, '', '/en?view=login');
    const transition = { open: vi.fn(), back: vi.fn(), dismissContact: vi.fn() };
    // Mount the real navigation listener before Bootstrap opens its warning.
    const navigation = renderHook(() =>
      useAuthNavigation({ locale: 'en', active: true, visible: false, ...transition }),
    );
    const panel = registrationPanel();
    try {
      const input = await checkEmail(panel);
      const send = panel.view.getByRole('button', { name: 'Send code' });
      await panel.user.click(send);
      const modal = await panel.view.findByRole('dialog', {
        name: panel.i18n.t('auth.warningTitle'),
      });
      expect(modal).toHaveTextContent(panel.i18n.t('auth.emailExists'));
      await waitFor(() => expect(modal).toHaveFocus());
      await panel.user.keyboard('{Escape}');
      await waitFor(() => expect(panel.view.queryByRole('dialog')).toBeNull());
      expect(transition.back).not.toHaveBeenCalled();
      expect(panel.onBack).not.toHaveBeenCalled();
      expect(window.location.search).toBe('?view=login');
      expect(panel.view.getByRole('heading', { name: 'Create your account' })).toBeVisible();
      expect(input).toHaveValue(email);
      expectFieldError(input, panel.i18n.t('auth.emailExists'));
      await waitFor(() => expect(send).toHaveFocus());

      // The surface's normal Escape shortcut still works after its warning closes.
      await panel.user.keyboard('{Escape}');
      expect(transition.back).toHaveBeenCalledOnce();
      expect(window.location.search).toBe('');
    } finally {
      navigation.unmount();
      window.history.replaceState(previousState, '', previousUrl);
    }
  });

  it('aborts an edited email check and ignores its stale duplicate response', async () => {
    const results: Array<(response: Response) => void> = [];
    const fetch = vi.fn<(url: string, options: RequestInit) => Promise<Response>>(
      () => new Promise<Response>((resolve) => results.push(resolve)),
    );
    vi.stubGlobal('fetch', fetch);
    const panel = registrationPanel();
    const input = panel.view.getByLabelText('Email');
    fireEvent.change(input, { target: { value: 'old.person@example.com' } });
    fireEvent.blur(input);
    const oldSignal = (fetch.mock.calls[0]![1] as RequestInit).signal!;
    fireEvent.change(input, { target: { value: email } });
    expect(oldSignal.aborted).toBe(true);
    fireEvent.blur(input);
    await act(async () => results[1]!(json({ email, available: true })));
    expectFieldValid(input, panel.i18n.t('auth.fieldValid'));
    await act(async () => results[0]!(json({ email: 'old.person@example.com', available: false })));
    expectFieldValid(input, panel.i18n.t('auth.fieldValid'));
    expect(input).toHaveValue(email);
    expect(panel.view.queryByText(panel.i18n.t('auth.emailExists'))).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it.each(['mode change', 'unmount', 'back'] as const)(
    'cancels a pending registration email check on %s',
    async (exit) => {
      let resolveCheck: (response: Response) => void = () => {};
      const fetch = vi.fn<(url: string, options: RequestInit) => Promise<Response>>(
        () => new Promise<Response>((resolve) => (resolveCheck = resolve)),
      );
      vi.stubGlobal('fetch', fetch);
      const panel = registrationPanel();
      const input = panel.view.getByLabelText('Email');
      fireEvent.change(input, { target: { value: email } });
      fireEvent.blur(input);
      const signal = (fetch.mock.calls[0]![1] as RequestInit).signal!;
      if (exit === 'mode change')
        fireEvent.click(panel.modes.getByRole('button', { name: 'Sign in' }));
      else if (exit === 'back')
        fireEvent.click(panel.view.getByRole('button', { name: 'Back to portfolio' }));
      else panel.view.unmount();
      expect(signal.aborted).toBe(true);
      await act(async () => resolveCheck(json({ email, available: false })));
      expect(panel.view.queryByText(panel.i18n.t('auth.emailExists'))).toBeNull();
    },
  );

  it('fails closed when email availability fails and retries only after another blur', async () => {
    let available = false;
    const fetch = mockTransport({
      availability: () =>
        available
          ? json({ email, available: true })
          : json({ detail: 'AUTH_DATABASE_UNAVAILABLE' }, 503),
    });
    const panel = registrationPanel();
    const input = await checkEmail(panel);
    expectFieldError(input, panel.i18n.t('auth.emailCheckFailed'));
    const send = panel.view.getByRole('button', { name: 'Send code' });
    expect(send).toHaveAttribute('aria-disabled', 'true');
    expect(fetch).toHaveBeenCalledOnce();
    available = true;
    await act(async () => fireEvent.blur(input));
    expectFieldValid(input, panel.i18n.t('auth.fieldValid'));
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('does not mark an arbitrary code or an unsent fixed code as verified', async () => {
    const fetch = mockTransport();
    const panel = registrationPanel();
    await checkEmail(panel);
    const code = panel.view.getByLabelText('Verification code');
    const send = panel.view.getByRole('button', { name: 'Send code' });
    await enterCode(panel, '01234');
    expect(send).toHaveAttribute('data-code-verified', 'false');
    expect(code).not.toHaveAttribute('aria-description');
    await enterCode(panel);
    expect(send).toHaveAttribute('data-code-verified', 'false');
    expect(fetch).toHaveBeenCalledOnce();
    expect(code).toHaveAccessibleDescription(panel.i18n.t('auth.verificationRequired'));
  });

  it('waits for server verification and cancels an edited code without accepting the late response', async () => {
    let resolveVerification: (response: Response) => void = () => {};
    const fetch = vi.fn<(url: string, options: RequestInit) => Promise<Response>>(async (url) => {
      if (url.includes('/register?')) return json({ email, available: true });
      if (url === '/api/authority/confirm-email')
        return json({ expires_in: 300, retry_after: 60 }, 202);
      return new Promise<Response>((resolve) => (resolveVerification = resolve));
    });
    vi.stubGlobal('fetch', fetch);
    const panel = registrationPanel();
    await checkEmail(panel);
    await sendCode(panel);
    const code = panel.view.getByLabelText('Verification code');
    const send = panel.view.getByRole('button', { name: 'Send code available in 1:00' });
    fireEvent.change(code, { target: { value: '123' } });
    expect(fetch).toHaveBeenCalledTimes(3);
    const signal = (fetch.mock.calls[2]![1] as RequestInit).signal!;
    expect(send).toHaveAttribute('data-code-verified', 'false');
    expect(code).not.toHaveAttribute(
      'aria-description',
      panel.i18n.t('auth.verificationCodeAccepted'),
    );
    fireEvent.change(code, { target: { value: '12' } });
    expect(signal.aborted).toBe(true);
    await act(async () => resolveVerification(json({ email, verified: true })));
    expect(code).toHaveValue('12');
    expect(send).toHaveAttribute('data-code-verified', 'false');
    expect(code).not.toHaveAttribute(
      'aria-description',
      panel.i18n.t('auth.verificationCodeAccepted'),
    );
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('requires a code before registering and never sends confirmation or privileges to the backend', async () => {
    const fetch = mockTransport();
    const panel = registrationPanel();
    await checkEmail(panel);
    fillPasswords(panel);
    const code = panel.view.getByLabelText('Verification code') as HTMLInputElement;
    await panel.user.click(within(panel.form()).getByRole('button', { name: 'Register' }));
    expect(code.validity.valueMissing).toBe(true);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('shares a pending verification with submit and creates the account only once', async () => {
    let resolveVerification: (response: Response) => void = () => {};
    const fetch = vi.fn<(url: string, options: RequestInit) => Promise<Response>>(async (url) => {
      if (url.includes('/register?')) return json({ email, available: true });
      if (url === '/api/authority/confirm-email')
        return json({ expires_in: 300, retry_after: 60 }, 202);
      if (url === '/api/authority/verify-email')
        return new Promise<Response>((resolve) => (resolveVerification = resolve));
      if (url === '/api/authority/register') return json(account, 201);
      throw new Error('Unexpected account request');
    });
    vi.stubGlobal('fetch', fetch);
    const panel = registrationPanel();
    await checkEmail(panel);
    await sendCode(panel);
    fillPasswords(panel);
    fireEvent.change(panel.view.getByLabelText('Verification code'), { target: { value: '123' } });
    fireEvent.submit(panel.form());
    fireEvent.submit(panel.form());
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(within(panel.form()).getByRole('button', { name: 'Register' })).toBeDisabled();
    await act(async () => resolveVerification(json({ email, verified: true })));
    expect(fetch.mock.calls.filter(([url]) => url === '/api/authority/verify-email')).toHaveLength(
      1,
    );
    expect(fetch.mock.calls.filter(([url]) => url === '/api/authority/register')).toHaveLength(1);
    expect(panel.view.getByRole('status')).toHaveTextContent(panel.i18n.t('auth.welcome'));
  });

  it('expires a previously accepted code after 300 seconds and prevents registration', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-11T10:00:00Z'));
    const fetch = mockTransport();
    const panel = registrationPanel();
    await checkEmail(panel);
    await sendCode(panel);
    await enterCode(panel);
    fillPasswords(panel);
    const code = panel.view.getByLabelText('Verification code');
    expect(code).toHaveAccessibleDescription(panel.i18n.t('auth.verificationCodeAccepted'));
    act(() => vi.advanceTimersByTime(300_000));
    expect(code).toHaveAccessibleDescription(panel.i18n.t('auth.verificationExpired'));
    expect(panel.view.getByRole('button', { name: 'Send code' })).toHaveAttribute(
      'data-code-verified',
      'false',
    );
    await act(async () => fireEvent.submit(panel.form()));
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(fetch.mock.calls.some(([url]) => url === '/api/authority/register')).toBe(false);
  });

  it.each(['en', 'zh-Hans', 'zh-Hant'] as const)(
    'shows a verified icon only after the real verification response and registers in %s',
    async (locale) => {
      const fetch = mockTransport();
      const save = vi.spyOn(Storage.prototype, 'setItem');
      const onSuccess = vi.fn();
      const panel = registrationPanel(locale, onSuccess);
      const { view, form, i18n } = panel;
      await checkEmail(panel);
      await sendCode(panel);
      expect(view.getByRole('status')).toHaveTextContent(i18n.t('auth.verificationCodeSent'));
      expect(view.getByRole('status')).toHaveTextContent(i18n.t('auth.verificationCodeValidity'));
      const code = view.getByLabelText(i18n.t('auth.verificationCode'));
      expect(code).toHaveAttribute('inputmode', 'numeric');
      expect(code).toHaveAttribute('autocomplete', 'one-time-code');
      expect(code).toBeRequired();
      await enterCode(panel);
      const send = view.getByRole('button', {
        name: i18n.t('auth.sendCodeCooldown', { time: '1:00' }),
      });
      expect(code).toHaveAccessibleDescription(i18n.t('auth.verificationCodeAccepted'));
      expect(send).toHaveAttribute('data-code-verified', 'true');
      expect(send.querySelector('svg.bi-send-check-fill')).not.toBeNull();
      fillPasswords(panel);
      await act(async () => fireEvent.submit(form()));
      expect(fetch.mock.calls.map(([url]) => url)).toEqual([
        `/api/authority/register?email=${encodeURIComponent(email)}`,
        '/api/authority/confirm-email',
        '/api/authority/verify-email',
        '/api/authority/register',
      ]);
      expect(fetch.mock.calls[2]![1]).toMatchObject({
        method: 'POST',
        body: JSON.stringify({ email, code: '123' }),
        credentials: 'include',
        cache: 'no-store',
      });
      expect(fetch.mock.calls[3]![1]).toMatchObject({
        method: 'POST',
        body: JSON.stringify({ email, password: 'private-password' }),
        credentials: 'include',
        cache: 'no-store',
      });
      expect(view.getByRole('status')).toHaveTextContent(i18n.t('auth.welcome'));
      expect(view.getByLabelText(i18n.t('auth.password'), { exact: true })).toHaveValue('');
      expect(view.getByLabelText(i18n.t('auth.confirmPassword'))).toHaveValue('');
      expect(code).toHaveValue('');
      expect(code).not.toHaveAttribute('aria-description');
      expect(view.container).not.toHaveTextContent('private-password');
      expect(panel.client.getQueryData(authSessionKey)).toEqual(account);
      expect(onSuccess).toHaveBeenCalledOnce();
      expect(save).toHaveBeenCalledOnce();
      expect(save).toHaveBeenCalledWith(
        'portfolio-verification-cooldown',
        expect.stringMatching(/^\d+$/),
      );
    },
  );

  it.each(['mode change', 'unmount', 'back'] as const)(
    'does not publish a late registration account or report success after %s',
    async (exit) => {
      let resolveRegistration: (response: Response) => void = () => {};
      const fetch = vi.fn<(url: string, options: RequestInit) => Promise<Response>>(async (url) => {
        if (url.includes('/register?')) return json({ email, available: true });
        if (url === '/api/authority/confirm-email')
          return json({ expires_in: 300, retry_after: 60 }, 202);
        if (url === '/api/authority/verify-email') return json({ email, verified: true });
        return new Promise<Response>((resolve) => (resolveRegistration = resolve));
      });
      vi.stubGlobal('fetch', fetch);
      const onSuccess = vi.fn();
      const panel = registrationPanel('en', onSuccess);
      await checkEmail(panel);
      await sendCode(panel);
      await enterCode(panel);
      fillPasswords(panel);
      fireEvent.submit(panel.form());
      await waitFor(() => expect(fetch).toHaveBeenCalledTimes(4));
      const signal = fetch.mock.calls[3]![1].signal!;
      if (exit === 'mode change')
        fireEvent.click(panel.modes.getByRole('button', { name: 'Sign in' }));
      else if (exit === 'back')
        fireEvent.click(panel.view.getByRole('button', { name: 'Back to portfolio' }));
      else panel.view.unmount();
      expect(signal.aborted).toBe(true);
      await act(async () => resolveRegistration(json(account, 201)));
      expect(onSuccess).not.toHaveBeenCalled();
      expect(panel.client.getQueryData(authSessionKey)).toBeUndefined();
    },
  );

  it.each([
    { detail: 'INVALID_VERIFICATION_CODE', key: 'auth.verificationCodeInvalid' },
    { detail: 'EMAIL_VERIFICATION_REQUIRED', key: 'auth.verificationRequired' },
  ])(
    'rejects verification $detail without sending a registration request',
    async ({ detail, key }) => {
      const fetch = mockTransport({
        verify: () => json({ detail, private: 'private backend error' }, 400),
      });
      const panel = registrationPanel();
      await checkEmail(panel);
      await sendCode(panel);
      fillPasswords(panel);
      await enterCode(panel);
      const send = panel.view.getByRole('button', { name: 'Send code available in 1:00' });
      expect(send).toHaveAttribute('data-code-verified', 'false');
      const code = panel.view.getByLabelText('Verification code');
      expect(code).toHaveAccessibleDescription(panel.i18n.t(key));
      expect(code).toHaveAttribute('aria-invalid', 'true');
      expect(panel.view.container).not.toHaveTextContent('private backend error');
      await act(async () => fireEvent.blur(code));
      expect(
        fetch.mock.calls.filter(([url]) => url === '/api/authority/verify-email'),
      ).toHaveLength(1);
      expect(
        fetch.mock.calls.some(
          ([url, options]) => url === '/api/authority/register' && options.method === 'POST',
        ),
      ).toBe(false);
    },
  );

  it.each(['send', 'register'] as const)(
    'locks the email again when the backend reports a duplicate during %s',
    async (operation) => {
      const fetch = mockTransport({
        [operation]: () => json({ detail: 'EMAIL_ALREADY_EXISTS' }, 409),
      });
      const panel = registrationPanel();
      const input = await checkEmail(panel);
      await sendCode(panel);
      if (operation === 'register') {
        await enterCode(panel);
        fillPasswords(panel);
        await act(async () => fireEvent.submit(panel.form()));
      }
      expectFieldError(input, panel.i18n.t('auth.emailExists'));
      const register = within(panel.form()).getByRole('button', { name: 'Register' });
      expect(register).toHaveAttribute('aria-disabled', 'true');
      const count = fetch.mock.calls.length;
      fireEvent.click(register);
      expect(
        await panel.view.findByRole('dialog', { name: panel.i18n.t('auth.warningTitle') }),
      ).toHaveTextContent(panel.i18n.t('auth.emailExists'));
      expect(fetch).toHaveBeenCalledTimes(count);
    },
  );

  it('does not start a cooldown or announce a sent code before delivery succeeds', async () => {
    let resolveDelivery: (response: Response) => void = () => {};
    const fetch = vi.fn<(url: string, options: RequestInit) => Promise<Response>>(async (url) => {
      if (url.includes('/register?')) return json({ email, available: true });
      return new Promise<Response>((resolve) => (resolveDelivery = resolve));
    });
    vi.stubGlobal('fetch', fetch);
    const panel = registrationPanel();
    await checkEmail(panel);
    const send = panel.view.getByRole('button', { name: 'Send code' });
    fireEvent.click(send);
    fireEvent.click(send);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(send).toHaveAttribute('aria-disabled', 'true');
    expect(send.querySelector('[data-send-countdown]')).toBeNull();
    expect(window.sessionStorage.getItem('portfolio-verification-cooldown')).toBeNull();
    expect(panel.view.container.querySelector('[data-notification-kind]')).toBeNull();
    await act(async () => resolveDelivery(json({ detail: 'AUTH_STORAGE_UNAVAILABLE' }, 503)));
    expect(
      await panel.view.findByRole('dialog', { name: panel.i18n.t('auth.warningTitle') }),
    ).toHaveTextContent(panel.i18n.t('auth.temporarilyUnavailable'));
    expect(send).toBeEnabled();
    expect(window.sessionStorage.getItem('portfolio-verification-cooldown')).toBeNull();
  });

  it('keeps the server 60-second resend deadline across remounts and never stores credentials', async () => {
    vi.useFakeTimers();
    const startedAt = new Date('2026-10-11T10:00:00Z').getTime();
    vi.setSystemTime(startedAt);
    mockTransport();
    const first = registrationPanel();
    await checkEmail(first);
    await sendCode(first);
    const send = first.view.getByRole('button', { name: 'Send code available in 1:00' });
    expect(send).toHaveAttribute('aria-disabled', 'true');
    expect(send.querySelector('[data-send-countdown]')).toHaveTextContent(/^60$/);
    expect(window.sessionStorage.getItem('portfolio-verification-cooldown')).toBe(
      String(startedAt + 60_000),
    );
    act(() => vi.advanceTimersByTime(1000));
    expect(send).toHaveAccessibleName('Send code available in 0:59');
    first.view.unmount();
    vi.setSystemTime(startedAt + 30_000);
    const second = registrationPanel();
    const restored = second.view.getByRole('button', { name: 'Send code available in 0:30' });
    expect(restored).toHaveAttribute('aria-disabled', 'true');
    await checkEmail(second);
    act(() => vi.advanceTimersByTime(30_000));
    expect(restored).toHaveAccessibleName('Send code');
    expect(restored).toBeEnabled();
    expect(restored).not.toHaveAttribute('aria-disabled', 'true');
    expect(restored.querySelector('[data-send-countdown]')).toBeNull();
    expect(window.sessionStorage.getItem('portfolio-verification-cooldown')).toBeNull();
  });

  it('retains the server resend deadline when browser storage is blocked', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Blocked', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Blocked', 'SecurityError');
    });
    mockTransport();
    const panel = registrationPanel();
    await checkEmail(panel);
    await sendCode(panel);
    const send = panel.view.getByRole('button', { name: 'Send code available in 1:00' });
    expect(send).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(panel.modes.getByRole('button', { name: 'Sign in' }));
    fireEvent.click(panel.modes.getByRole('button', { name: 'Create account' }));
    expect(panel.view.getByRole('button', { name: 'Send code available in 1:00' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });
});

describe('account form presentation', () => {
  it.each(['en', 'zh-Hans', 'zh-Hant'] as const)(
    'renders a single live form without sizing copies in each account mode in %s',
    async (locale) => {
      const { view, user, modes, i18n } = renderPanel(locale);
      const expectActiveForm = (mode: 'login' | 'register' | 'forgot', inputCount: number) => {
        expect(view.container.querySelector('[data-auth-size]')).toBeNull();
        expect(view.container.querySelectorAll('form')).toHaveLength(1);
        expect(view.container.querySelectorAll('input')).toHaveLength(inputCount);
        expect(view.getAllByRole('heading', { level: 1 })).toHaveLength(1);
        expect(view.getByRole('heading', { name: i18n.t(`auth.${mode}Title`) })).toHaveFocus();
        expect(view.getByLabelText(i18n.t('auth.email'))).toHaveValue('');
        expect(view.container.querySelector('[data-notification-kind]')).toBeNull();
      };
      expectActiveForm('login', 2);
      expect(view.queryByLabelText(i18n.t('auth.verificationCode'))).toBeNull();
      await user.click(modes.getByRole('button', { name: i18n.t('auth.register') }));
      expectActiveForm('register', 4);
      await user.click(modes.getByRole('button', { name: i18n.t('auth.login') }));
      await user.click(view.getByRole('button', { name: i18n.t('auth.forgotPassword') }));
      expectActiveForm('forgot', 1);
      expect(view.queryByLabelText(i18n.t('auth.verificationCode'))).toBeNull();
    },
  );

  it('clears credentials and password visibility while retaining a global notice across modes', async () => {
    const { view, user, modes, form } = renderPanel();
    const email = view.getByLabelText('Email');
    expect(view.getByRole('heading', { level: 1 })).toHaveFocus();
    await user.type(email, 'person@example.com');
    await user.type(view.getByLabelText('Password', { exact: true }), 'private-password');
    await user.click(view.getByRole('button', { name: 'Show password' }));
    expect(view.getByLabelText('Password', { exact: true })).toHaveAttribute('type', 'text');
    await user.click(within(form()).getByRole('button', { name: 'Sign in' }));
    expect(view.getByRole('status')).toHaveTextContent('Account services are not open yet.');

    await user.click(modes.getByRole('button', { name: 'Create account' }));
    expect(view.getByRole('heading', { name: 'Create your account' })).toBeVisible();
    expect(view.getByLabelText('Email')).toHaveValue('');
    expect(view.getByRole('heading', { name: 'Create your account' })).toHaveFocus();
    expect(view.getByLabelText('Password', { exact: true })).toHaveValue('');
    expect(view.getByLabelText('Password', { exact: true })).toHaveAttribute('type', 'password');
    expect(view.getByLabelText('Confirm')).toHaveValue('');
    expect(view.getByLabelText('Verification code')).toHaveValue('');
    expect(view.getByRole('status')).toHaveTextContent('Account services are not open yet.');
    expect(view.container.querySelector('[data-notification-kind]')).toHaveAttribute(
      'data-notification-kind',
      'warning',
    );

    await user.type(view.getByLabelText('Verification code'), '123456');
    await user.type(view.getByLabelText('Password', { exact: true }), 'another-password');
    await user.type(view.getByLabelText('Confirm'), 'another-password');
    await user.click(modes.getByRole('button', { name: 'Sign in' }));
    expect(view.getByLabelText('Password', { exact: true })).toHaveValue('');
    expect(view.queryByLabelText('Confirm')).toBeNull();
    expect(view.queryByLabelText('Verification code')).toBeNull();

    await user.click(modes.getByRole('button', { name: 'Create account' }));
    expect(view.getByLabelText('Verification code')).toHaveValue('');
  });

  it('shows account feedback in the global notification and dismisses it without changing the form', () => {
    vi.useFakeTimers();
    const { view, form, i18n } = renderPanel();
    const email = view.getByLabelText('Email');
    const password = view.getByLabelText('Password', { exact: true });
    fireEvent.change(email, { target: { value: 'person@example.com' } });
    fireEvent.change(password, { target: { value: 'private-password' } });
    fireEvent.submit(form());
    expect(view.getByRole('status')).toHaveTextContent(i18n.t('auth.serviceUnavailable'));
    expect(form().querySelector('[role="status"]')).toBeNull();
    expect(view.container.querySelector('[data-notification-kind]')).toHaveAttribute(
      'data-notification-kind',
      'warning',
    );
    act(() => vi.advanceTimersByTime(3000));
    expect(view.container.querySelector('[data-notification-kind]')).toBeNull();
    expect(email).toHaveValue('person@example.com');
    expect(password).toHaveValue('private-password');
  });

  it('shows success only after a supplied account request resolves and avoids duplicate submissions', async () => {
    let resolveRequest = () => {};
    const request = new Promise<void>((resolve) => {
      resolveRequest = resolve;
    });
    const authenticate = vi.fn<(request: AuthRequest) => Promise<void>>(() => request);
    const { view, form, i18n } = renderPanel('en', authenticate);
    fireEvent.change(view.getByLabelText('Email'), {
      target: { value: 'person@example.com' },
    });
    fireEvent.change(view.getByLabelText('Password', { exact: true }), {
      target: { value: 'private-password' },
    });
    fireEvent.submit(form());
    fireEvent.submit(form());
    expect(authenticate).toHaveBeenCalledOnce();
    const accountRequest = authenticate.mock.calls[0]![0];
    expect(accountRequest.mode).toBe('login');
    expect(accountRequest.fields.get('email')).toBe('person@example.com');
    expect(accountRequest.fields.get('password')).toBe('private-password');
    expect(accountRequest.signal.aborted).toBe(false);
    const submit = within(form()).getByRole('button', { name: 'Sign in' });
    expect(submit).toBeDisabled();
    expect(submit).toHaveAttribute('aria-busy', 'true');
    expect(view.container.querySelector('[data-notification-kind]')).toBeNull();
    await act(async () => resolveRequest());
    expect(view.container.querySelector('[data-notification-kind]')).toHaveAttribute(
      'data-notification-kind',
      'success',
    );
    expect(view.getByRole('status')).toHaveTextContent(i18n.t('auth.welcome'));
    expect(submit).toBeEnabled();
  });

  it.each([
    {
      error: new ApiError('network'),
      kind: 'warning',
      messageKey: 'notifications.connectionFailed',
    },
    {
      error: new ApiError('timeout'),
      kind: 'warning',
      messageKey: 'notifications.connectionFailed',
    },
    {
      error: new ApiError('http', 401),
      kind: 'warning',
      messageKey: 'notifications.requestFailed',
    },
    { error: new ApiError('parse'), kind: 'bug', messageKey: 'notifications.invalidResponse' },
    { error: new ApiError('contract'), kind: 'bug', messageKey: 'notifications.invalidResponse' },
    {
      error: new Error('Private server detail'),
      kind: 'bug',
      messageKey: 'notifications.unexpectedError',
    },
  ])(
    'routes a rejected account request to a $kind notification',
    async ({ error, kind, messageKey }) => {
      const authenticate = vi.fn<(request: AuthRequest) => Promise<void>>(async () => {
        throw error;
      });
      const { view, form, i18n } = renderPanel('en', authenticate);
      fireEvent.change(view.getByLabelText('Email'), {
        target: { value: 'person@example.com' },
      });
      fireEvent.change(view.getByLabelText('Password', { exact: true }), {
        target: { value: 'private-password' },
      });
      await act(async () => fireEvent.submit(form()));
      expect(view.container.querySelector('[data-notification-kind]')).toHaveAttribute(
        'data-notification-kind',
        kind,
      );
      expect(view.getByRole('status')).toHaveTextContent(i18n.t(messageKey));
      expect(view.getByRole('status')).not.toHaveTextContent('Private server detail');
      expect(view.queryByText(i18n.t('auth.welcome'), { exact: true })).toBeNull();
      expect(within(form()).getByRole('button', { name: 'Sign in' })).toBeEnabled();
    },
  );

  it.each(['mode change', 'unmount'] as const)(
    'aborts a pending account request on %s and suppresses its later result',
    async (exit) => {
      let resolveRequest = () => {};
      const request = new Promise<void>((resolve) => {
        resolveRequest = resolve;
      });
      const authenticate = vi.fn<(request: AuthRequest) => Promise<void>>(() => request);
      const { view, form, modes } = renderPanel('en', authenticate);
      fireEvent.change(view.getByLabelText('Email'), {
        target: { value: 'person@example.com' },
      });
      fireEvent.change(view.getByLabelText('Password', { exact: true }), {
        target: { value: 'private-password' },
      });
      fireEvent.submit(form());
      const signal = authenticate.mock.calls[0]![0].signal;
      if (exit === 'mode change') {
        fireEvent.click(modes.getByRole('button', { name: 'Create account' }));
        expect(within(form()).getByRole('button', { name: 'Register' })).toBeEnabled();
      } else view.unmount();
      expect(signal.aborted).toBe(true);
      await act(async () => resolveRequest());
      expect(view.container.querySelector('[data-notification-kind]')).toBeNull();
    },
  );

  it('ignores an intentionally cancelled account request without a failure notification', async () => {
    const authenticate = vi.fn<(request: AuthRequest) => Promise<void>>(async () => {
      throw new DOMException('Cancelled', 'AbortError');
    });
    const { view, form } = renderPanel('en', authenticate);
    fireEvent.change(view.getByLabelText('Email'), {
      target: { value: 'person@example.com' },
    });
    fireEvent.change(view.getByLabelText('Password', { exact: true }), {
      target: { value: 'private-password' },
    });
    await act(async () => fireEvent.submit(form()));
    expect(view.container.querySelector('[data-notification-kind]')).toBeNull();
    expect(within(form()).getByRole('button', { name: 'Sign in' })).toBeEnabled();
  });

  it.each(['en', 'zh-Hans', 'zh-Hant'] as const)(
    'checks email after pointer leave or keyboard blur and resets stale results in %s',
    async (locale) => {
      const fetch = vi.fn();
      vi.stubGlobal('fetch', fetch);
      const { view, user, modes, i18n } = renderPanel(locale);
      const email = view.getByLabelText(i18n.t('auth.email'));
      fireEvent.mouseLeave(email.parentElement!);
      expect(email).not.toHaveAttribute('aria-invalid', 'true');
      expect(email).not.toHaveAttribute('aria-describedby');

      await user.click(email);
      await user.tab();
      expectFieldError(email, i18n.t('auth.fieldRequired'));
      await user.type(email, 'invalid-email');
      expect(email).not.toHaveAttribute('aria-invalid', 'true');
      expect(email).not.toHaveAttribute('aria-describedby');
      fireEvent.mouseLeave(email.parentElement!);
      expectFieldError(email, i18n.t('auth.emailInvalid'));

      await user.clear(email);
      await user.type(email, 'person@example.com');
      expect(email).not.toHaveAttribute('aria-describedby');
      await user.tab();
      expectFieldValid(email, i18n.t('auth.fieldValid'));
      await user.type(email, 'x');
      expect(email).not.toHaveAttribute('aria-describedby');
      expect(email).not.toHaveAttribute('aria-invalid', 'true');
      fireEvent.mouseLeave(email.parentElement!);
      expectFieldValid(email, i18n.t('auth.fieldValid'));

      await user.click(view.getByRole('button', { name: i18n.t('auth.forgotPassword') }));
      const resetEmail = view.getByLabelText(i18n.t('auth.email'));
      expect(resetEmail).toHaveValue('');
      expect(resetEmail).not.toHaveAttribute('aria-describedby');
      fireEvent.mouseLeave(resetEmail.parentElement!);
      expect(resetEmail).not.toHaveAttribute('aria-describedby');
      await user.type(resetEmail, 'invalid-email');
      expect(resetEmail).not.toHaveAttribute('aria-describedby');
      fireEvent.blur(resetEmail);
      expectFieldError(resetEmail, i18n.t('auth.emailInvalid'));

      await user.click(modes.getByRole('button', { name: i18n.t('auth.register') }));
      const registrationEmail = view.getByLabelText(i18n.t('auth.email'));
      expect(registrationEmail).toHaveValue('');
      expect(registrationEmail).not.toHaveAttribute('aria-describedby');
      expect(registrationEmail).not.toHaveAttribute('aria-invalid', 'true');
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it.each(['en', 'zh-Hans', 'zh-Hant'] as const)(
    'keeps the password hint inside the field and validates after leaving in %s',
    async (locale) => {
      const fetch = vi.fn();
      vi.stubGlobal('fetch', fetch);
      const { view, user, modes, i18n } = renderPanel(locale);
      await user.click(modes.getByRole('button', { name: i18n.t('auth.register') }));
      const password = view.getByLabelText(i18n.t('auth.password'), { exact: true });
      const confirmation = view.getByLabelText(i18n.t('auth.confirmPassword'));
      const tooShort = i18n.t('auth.passwordTooShort');

      expect(password).toHaveAttribute('placeholder', i18n.t('auth.passwordHint'));
      expect(password).toHaveAttribute('minlength', '8');
      expect(password).not.toHaveAttribute('aria-invalid', 'true');
      expect(password).not.toHaveAttribute('aria-describedby');
      expect(confirmation).toHaveAttribute('minlength', '8');
      expect(confirmation).not.toHaveAttribute('aria-describedby');
      expect(view.queryByText(i18n.t('auth.passwordHint'), { exact: true })).toBeNull();
      expect(view.queryByText(tooShort, { exact: true })).toBeNull();

      await user.type(password, '1234567');
      expect(password).not.toHaveAttribute('aria-invalid', 'true');
      expect(password).not.toHaveAttribute('aria-describedby');
      fireEvent.mouseLeave(password.parentElement!);
      expectFieldError(password, tooShort);

      await user.type(password, '8');
      expect(password).toHaveValue('12345678');
      expect(view.queryByText(tooShort, { exact: true })).toBeNull();
      expect(password).not.toHaveAttribute('aria-invalid', 'true');
      expect(password).not.toHaveAttribute('aria-describedby');
      fireEvent.blur(password);
      expectFieldValid(password, i18n.t('auth.fieldValid'));

      await user.clear(password);
      expect(password).not.toHaveAttribute('aria-invalid', 'true');
      expect(password).not.toHaveAttribute('aria-describedby');
      fireEvent.mouseLeave(password.parentElement!);
      expectFieldError(password, i18n.t('auth.fieldRequired'));
      await user.type(password, 'x');
      expect(password).not.toHaveAttribute('aria-describedby');
      fireEvent.blur(password);
      expectFieldError(password, tooShort);

      await user.click(modes.getByRole('button', { name: i18n.t('auth.login') }));
      const loginPassword = view.getByLabelText(i18n.t('auth.password'), { exact: true });
      expect(loginPassword).toHaveValue('');
      expect(loginPassword).not.toHaveAttribute('placeholder');
      expect(loginPassword).not.toHaveAttribute('minlength');
      expect(loginPassword).not.toHaveAttribute('aria-describedby');
      await user.type(loginPassword, 'x');
      expect(loginPassword).not.toHaveAttribute('aria-invalid', 'true');
      expect(loginPassword).not.toHaveAttribute('aria-describedby');
      fireEvent.blur(loginPassword);
      expectFieldValid(loginPassword, i18n.t('auth.fieldValid'));
      expect(view.queryByText(tooShort, { exact: true })).toBeNull();

      await user.click(modes.getByRole('button', { name: i18n.t('auth.register') }));
      const resetPassword = view.getByLabelText(i18n.t('auth.password'), { exact: true });
      expect(resetPassword).toHaveValue('');
      expect(resetPassword).toHaveAttribute('placeholder', i18n.t('auth.passwordHint'));
      expect(resetPassword).not.toHaveAttribute('aria-invalid', 'true');
      expect(resetPassword).not.toHaveAttribute('aria-describedby');
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it.each(['en', 'zh-Hans', 'zh-Hant'] as const)(
    'checks password confirmation at its label and clears it after password edits in %s',
    async (locale) => {
      const fetch = vi.fn();
      vi.stubGlobal('fetch', fetch);
      const { view, user, modes, i18n } = renderPanel(locale);
      await user.click(modes.getByRole('button', { name: i18n.t('auth.register') }));
      const password = view.getByLabelText(i18n.t('auth.password'), { exact: true });
      const confirmation = view.getByLabelText(i18n.t('auth.confirmPassword')) as HTMLInputElement;

      await user.type(password, 'matching-password');
      fireEvent.blur(password);
      expectFieldValid(password, i18n.t('auth.fieldValid'));
      await user.type(confirmation, 'different-password');
      expect(confirmation).not.toHaveAttribute('aria-invalid', 'true');
      expect(confirmation).not.toHaveAttribute('aria-describedby');
      fireEvent.mouseLeave(confirmation.parentElement!);
      expectFieldError(confirmation, i18n.t('auth.passwordMismatchShort'));
      expect(confirmation.validity.customError).toBe(true);
      expect(confirmation.validationMessage).toBe(i18n.t('auth.passwordMismatch'));

      await user.clear(confirmation);
      await user.type(confirmation, 'matching-password');
      expect(confirmation.validity.customError).toBe(false);
      expect(confirmation).not.toHaveAttribute('aria-describedby');
      fireEvent.blur(confirmation);
      expectFieldValid(confirmation, i18n.t('auth.fieldValid'));

      await user.type(password, '!');
      expect(password).not.toHaveAttribute('aria-describedby');
      expect(confirmation).not.toHaveAttribute('aria-describedby');
      expect(confirmation).not.toHaveAttribute('aria-invalid', 'true');
      expect(confirmation.validity.customError).toBe(false);
      fireEvent.blur(password);
      expectFieldValid(password, i18n.t('auth.fieldValid'));
      fireEvent.mouseLeave(confirmation.parentElement!);
      expectFieldError(confirmation, i18n.t('auth.passwordMismatchShort'));

      await user.click(modes.getByRole('button', { name: i18n.t('auth.login') }));
      await user.click(modes.getByRole('button', { name: i18n.t('auth.register') }));
      const resetConfirmation = view.getByLabelText(i18n.t('auth.confirmPassword'));
      expect(resetConfirmation).toHaveValue('');
      expect(resetConfirmation).not.toHaveAttribute('aria-describedby');
      expect(resetConfirmation).not.toHaveAttribute('aria-invalid', 'true');
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it('shows only an email field for password reset and returns to a clear login form', async () => {
    const { view, user, modes, form } = renderPanel();
    await user.type(view.getByLabelText('Email'), 'person@example.com');
    await user.type(view.getByLabelText('Password', { exact: true }), 'private-password');
    await user.click(view.getByRole('button', { name: 'Forgot password?' }));

    expect(view.getByRole('heading', { name: 'Reset your password' })).toBeVisible();
    expect(form().querySelectorAll('input')).toHaveLength(1);
    expect(view.getByLabelText('Email')).toHaveValue('');
    expect(view.queryByLabelText('Password', { exact: true })).toBeNull();
    expect(view.queryByLabelText('Confirm')).toBeNull();
    expect(view.queryByRole('button', { name: 'Show password' })).toBeNull();
    await user.type(view.getByLabelText('Email'), 'person@example.com');
    await user.click(within(form()).getByRole('button', { name: 'Send reset link' }));
    expect(view.getByRole('status')).toHaveTextContent('Account services are not open yet.');

    await user.click(modes.getByRole('button', { name: 'Sign in' }));
    expect(view.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    expect(view.getByLabelText('Email')).toHaveValue('');
    expect(view.getByLabelText('Password', { exact: true })).toHaveValue('');
    expect(view.getByRole('status')).toHaveTextContent('Account services are not open yet.');
  });

  it.each([
    {
      locale: 'en',
      mode: 'login',
      message: 'Account services are not open yet. Your details have not been sent.',
    },
    {
      locale: 'en',
      mode: 'forgot',
      message: 'Account services are not open yet. Your details have not been sent.',
    },
    { locale: 'zh-Hans', mode: 'login', message: '账户服务尚未开放，你填写的资料未发送。' },
    { locale: 'zh-Hant', mode: 'login', message: '帳戶服務尚未開放，你填寫的資料未傳送。' },
  ] as const)(
    'keeps a valid $mode submission pending in $locale without sending or saving credentials',
    async ({ locale, mode, message }) => {
      const fetch = vi.fn();
      vi.stubGlobal('fetch', fetch);
      const save = vi.spyOn(Storage.prototype, 'setItem');
      const { view, user, form, i18n } = renderPanel(locale);
      if (mode === 'forgot') {
        await user.click(view.getByRole('button', { name: i18n.t('auth.forgotPassword') }));
      }
      await user.type(view.getByLabelText(i18n.t('auth.email')), 'person@example.com');
      if (mode !== 'forgot') {
        await user.type(
          view.getByLabelText(i18n.t('auth.password'), { exact: true }),
          'private-password',
        );
      }
      expect(form().checkValidity()).toBe(true);
      const submit = new Event('submit', { bubbles: true, cancelable: true });
      fireEvent(form(), submit);

      expect(submit.defaultPrevented).toBe(true);
      expect(view.getByRole('status')).toHaveTextContent(message);
      expect(view.getByRole('heading', { level: 1 })).toHaveTextContent(
        i18n.t(`auth.${mode}Title`),
      );
      expect(
        view.queryByText(/signed in successfully|account created|reset link sent/i),
      ).toBeNull();
      expect(fetch).not.toHaveBeenCalled();
      expect(save).not.toHaveBeenCalled();
    },
  );
});

function fillCowLogin(view: ReturnType<typeof render>) {
  fireEvent.change(view.getByLabelText('Email'), { target: { value: 'person@example.com' } });
  fireEvent.change(view.getByLabelText('Password', { exact: true }), {
    target: { value: 'incorrect-password' },
  });
}

describe('credential rejection cow recovery', () => {
  it.each([401, 403])(
    'shows the denied cow for classified invalid credentials with status %s',
    async (status) => {
      const authenticate = vi.fn(async () => {
        throw new ApiError('http', status, 'INVALID_CREDENTIALS');
      });
      const onSuccess = vi.fn();
      const { view, form, i18n, onBack } = renderPanel('en', authenticate, false, onSuccess);
      fillCowLogin(view);
      await act(async () => fireEvent.submit(form()));
      expect(view.getByTestId('auth-cow-state')).toHaveAttribute('data-denied', 'true');
      expect(view.getByRole('status')).toHaveTextContent(i18n.t('auth.invalidCredentials'));
      expect(view.getByRole('heading', { name: i18n.t('auth.loginTitle') })).toBeVisible();
      expect(onBack).not.toHaveBeenCalled();
      expect(onSuccess).not.toHaveBeenCalled();
      expect(authenticate).toHaveBeenCalledOnce();
    },
  );

  it.each([
    ['network', new ApiError('network')],
    ['timeout', new ApiError('timeout')],
    ['rate limit', new ApiError('http', 429, 'TOO_MANY_SIGN_IN_ATTEMPTS')],
    ['server failure', new ApiError('http', 500)],
    ['unclassified 401', new ApiError('http', 401)],
    ['unclassified 403', new ApiError('http', 403)],
  ] as const)(
    'keeps the original cow for %s while retaining the failure notification',
    async (_name, error) => {
      const { view, form, i18n } = renderPanel('en', async () => {
        throw error;
      });
      fillCowLogin(view);
      await act(async () => fireEvent.submit(form()));
      expect(view.getByTestId('auth-cow-state')).toHaveAttribute('data-denied', 'false');
      expect(view.container.querySelector('[data-notification-kind]')).not.toBeNull();
      expect(view.getByRole('heading', { name: i18n.t('auth.loginTitle') })).toBeVisible();
    },
  );

  it.each([
    { field: 'Email', value: 'other@example.com', inputType: 'insertReplacementText' },
    { field: 'Password', value: 'another-password', inputType: 'insertText' },
    { field: 'Email', value: '', inputType: 'deleteContentBackward' },
    { field: 'Password', value: '', inputType: 'deleteContentBackward' },
  ])(
    'restores the cow after $inputType edits to $field, while focus alone retains it',
    async ({ field, value, inputType }) => {
      const { view, form, i18n } = renderPanel('en', async () => {
        throw new ApiError('http', 401, 'INVALID_CREDENTIALS');
      });
      fillCowLogin(view);
      await act(async () => fireEvent.submit(form()));
      const input = view.getByLabelText(field, { exact: true });
      fireEvent.focus(input);
      expect(view.getByTestId('auth-cow-state')).toHaveAttribute('data-denied', 'true');
      fireEvent.input(input, { target: { value }, inputType });
      expect(view.getByTestId('auth-cow-state')).toHaveAttribute('data-denied', 'false');
      expect(input).toHaveValue(value);
      expect(view.getByRole('status')).toHaveTextContent(i18n.t('auth.invalidCredentials'));
    },
  );

  it.each(['Email', 'Password'])(
    'cancels a pending login edited through %s and ignores its stale rejection',
    async (field) => {
      let reject: (error: unknown) => void = () => {};
      const request = new Promise<void>((_resolve, rejectRequest) => {
        reject = rejectRequest;
      });
      const authenticate = vi.fn<(request: AuthRequest) => Promise<void>>(() => request);
      const { view, form } = renderPanel('en', authenticate);
      fillCowLogin(view);
      fireEvent.submit(form());
      const signal = authenticate.mock.calls[0]![0].signal;
      const input = view.getByLabelText(field, { exact: true });
      expect(input).toHaveAttribute('readonly');
      fireEvent.input(input, {
        target: { value: field === 'Email' ? 'other@example.com' : 'another-password' },
        inputType: 'insertReplacementText',
      });
      expect(signal.aborted).toBe(true);
      expect(input).not.toHaveAttribute('readonly');
      await act(async () => reject(new ApiError('http', 401, 'INVALID_CREDENTIALS')));
      expect(view.getByTestId('auth-cow-state')).toHaveAttribute('data-denied', 'false');
      expect(view.container.querySelector('[data-notification-kind]')).toBeNull();
      expect(within(form()).getByRole('button', { name: 'Sign in' })).toBeEnabled();
    },
  );

  it('clears denial on retry, keeps pending credentials and restores success without another failure', async () => {
    let complete = () => {};
    const retry = new Promise<void>((resolve) => {
      complete = resolve;
    });
    const authenticate = vi
      .fn<(request: AuthRequest) => Promise<void>>()
      .mockRejectedValueOnce(new ApiError('http', 401, 'INVALID_CREDENTIALS'))
      .mockImplementationOnce(() => retry);
    const onSuccess = vi.fn();
    const { view, form, i18n } = renderPanel('en', authenticate, false, onSuccess);
    fillCowLogin(view);
    await act(async () => fireEvent.submit(form()));
    expect(view.getByTestId('auth-cow-state')).toHaveAttribute('data-denied', 'true');
    fireEvent.submit(form());
    expect(view.getByTestId('auth-cow-state')).toHaveAttribute('data-denied', 'false');
    expect(view.getByLabelText('Password', { exact: true })).toHaveValue('incorrect-password');
    await act(async () => complete());
    expect(onSuccess).toHaveBeenCalledOnce();
    expect(view.getByRole('status')).toHaveTextContent(i18n.t('auth.welcome'));
    expect(view.getByTestId('auth-cow-state')).toHaveAttribute('data-denied', 'false');
  });

  it('clears denial on an account mode change', async () => {
    const { view, form, modes } = renderPanel('en', async () => {
      throw new ApiError('http', 401, 'INVALID_CREDENTIALS');
    });
    fillCowLogin(view);
    await act(async () => fireEvent.submit(form()));
    expect(view.getByTestId('auth-cow-state')).toHaveAttribute('data-denied', 'true');
    fireEvent.click(modes.getByRole('button', { name: 'Create account' }));
    expect(view.getByTestId('auth-cow-state')).toHaveAttribute('data-denied', 'false');
  });
});
