import { act, cleanup, fireEvent, render, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthPanel } from '@/features/auth';
import type { AuthRequest } from '@/features/auth/components/AuthPanel';
import { createI18n, type Locale } from '@/i18n/config';
import { ApiError } from '@/shared/api/http';
import { NotificationProvider } from '@/shared/ui/NotificationProvider';

// Form tests keep the independently tested SVG scene out of this account boundary.
vi.mock('@/features/auth/components/AuthCowScene', () => ({ AuthCowScene: () => null }));

function renderPanel(
  locale: Locale = 'en',
  onAuthenticate?: (request: AuthRequest) => Promise<void>,
) {
  const i18n = createI18n(locale);
  const view = render(
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
        <AuthPanel initialFocus onBack={vi.fn()} onAuthenticate={onAuthenticate} />
      </NotificationProvider>
    </I18nextProvider>,
  );
  return {
    view,
    i18n,
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
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.sessionStorage.clear();
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
    expect(view.getByLabelText('Confirm password')).toHaveValue('');
    expect(view.getByLabelText('Verification code')).toHaveValue('');
    expect(view.getByRole('status')).toHaveTextContent('Account services are not open yet.');
    expect(view.container.querySelector('[data-notification-kind]')).toHaveAttribute(
      'data-notification-kind',
      'warning',
    );

    await user.type(view.getByLabelText('Verification code'), '123456');
    await user.type(view.getByLabelText('Password', { exact: true }), 'another-password');
    await user.type(view.getByLabelText('Confirm password'), 'another-password');
    await user.click(modes.getByRole('button', { name: 'Sign in' }));
    expect(view.getByLabelText('Password', { exact: true })).toHaveValue('');
    expect(view.queryByLabelText('Confirm password')).toBeNull();
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
    { error: new ApiError('http', 401), kind: 'error', messageKey: 'notifications.requestFailed' },
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

  it('rejects mismatched registration passwords and clears the error after correction', async () => {
    const { view, user, modes, form } = renderPanel();
    await user.click(modes.getByRole('button', { name: 'Create account' }));
    await user.type(view.getByLabelText('Email'), 'person@example.com');
    await user.type(view.getByLabelText('Verification code'), '123456');
    await user.type(view.getByLabelText('Password', { exact: true }), 'first-password');
    const confirmation = view.getByLabelText('Confirm password') as HTMLInputElement;
    await user.type(confirmation, 'different-password');
    await user.click(within(form()).getByRole('button', { name: 'Register' }));

    expect(confirmation.validity.customError).toBe(true);
    expect(confirmation.validationMessage).toBe('Passwords do not match.');
    expect(confirmation).toBeInvalid();
    expect(view.container.querySelector('[data-notification-kind]')).toBeNull();

    await user.clear(confirmation);
    await user.type(confirmation, 'first-password');
    expect(confirmation.validity.customError).toBe(false);
    expect(confirmation).toBeValid();
    await user.click(within(form()).getByRole('button', { name: 'Register' }));
    expect(view.getByRole('status')).toHaveTextContent('Account services are not open yet.');
  });

  it('requires a verification code for registration and preserves its text value', async () => {
    const { view, user, modes, form } = renderPanel();
    await user.click(modes.getByRole('button', { name: 'Create account' }));
    await user.type(view.getByLabelText('Email'), 'person@example.com');
    await user.type(view.getByLabelText('Password', { exact: true }), 'private-password');
    await user.type(view.getByLabelText('Confirm password'), 'private-password');

    const code = view.getByLabelText('Verification code') as HTMLInputElement;
    expect(code).toHaveAttribute('name', 'verificationCode');
    expect(code).toHaveAttribute('type', 'text');
    expect(code).toHaveAttribute('inputmode', 'numeric');
    expect(code).toHaveAttribute('autocomplete', 'one-time-code');
    expect(code).toBeRequired();
    await user.click(within(form()).getByRole('button', { name: 'Register' }));
    expect(code.validity.valueMissing).toBe(true);
    expect(view.container.querySelector('[data-notification-kind]')).toBeNull();

    await user.type(code, '01234');
    expect(code).toHaveValue('01234');
    expect(form().checkValidity()).toBe(true);
    await user.click(within(form()).getByRole('button', { name: 'Register' }));
    expect(view.getByRole('status')).toHaveTextContent('Account services are not open yet.');
  });

  it.each(['en', 'zh-Hans', 'zh-Hant'] as const)(
    'shows an icon-only mock code acceptance state and clears it in %s',
    async (locale) => {
      const fetch = vi.fn();
      vi.stubGlobal('fetch', fetch);
      const { view, user, modes, i18n } = renderPanel(locale);
      await user.click(modes.getByRole('button', { name: i18n.t('auth.register') }));
      const code = view.getByLabelText(i18n.t('auth.verificationCode'));
      const send = view.getByRole('button', { name: i18n.t('auth.sendVerificationCode') });

      expect(send).toHaveAttribute('title', i18n.t('auth.sendVerificationCode'));
      expect(send.textContent?.trim()).toBe('');
      expect(send).toHaveAttribute('data-code-verified', 'false');
      expect(send.querySelector('svg.bi-send-fill')).not.toBeNull();
      expect(code).not.toHaveAttribute('aria-description');
      await user.type(code, '   ');
      expect(send).toHaveAttribute('data-code-verified', 'false');

      await user.clear(code);
      await user.type(code, '01234');
      expect(code).toHaveValue('01234');
      expect(code).toHaveAttribute('aria-description', i18n.t('auth.verificationCodeAccepted'));
      expect(send).toHaveAttribute('data-code-verified', 'true');
      expect(send.querySelector('svg.bi-send-fill')).toBeNull();
      expect(send.querySelector('svg.bi-send-check-fill')).not.toBeNull();
      expect(send.textContent?.trim()).toBe('');
      expect(send).toBeEnabled();
      expect(view.container.querySelector('[data-notification-kind]')).toBeNull();

      await user.clear(code);
      expect(code).not.toHaveAttribute('aria-description');
      expect(send).toHaveAttribute('data-code-verified', 'false');
      expect(send.querySelector('svg.bi-send-fill')).not.toBeNull();
      await user.type(code, '123456');
      await user.click(modes.getByRole('button', { name: i18n.t('auth.login') }));
      await user.click(modes.getByRole('button', { name: i18n.t('auth.register') }));
      expect(view.getByLabelText(i18n.t('auth.verificationCode'))).toHaveValue('');
      const resetSend = view.getByRole('button', { name: i18n.t('auth.sendVerificationCode') });
      expect(resetSend).toHaveAttribute('data-code-verified', 'false');
      expect(resetSend.querySelector('svg.bi-send-fill')).not.toBeNull();
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it.each(['en', 'zh-Hans', 'zh-Hant'] as const)(
    'validates only email before showing unsent verification feedback in %s',
    async (locale) => {
      const fetch = vi.fn();
      vi.stubGlobal('fetch', fetch);
      const save = vi.spyOn(Storage.prototype, 'setItem');
      const { view, user, modes, form, i18n } = renderPanel(locale);
      await user.click(modes.getByRole('button', { name: i18n.t('auth.register') }));
      const email = view.getByLabelText(i18n.t('auth.email')) as HTMLInputElement;
      const code = view.getByLabelText(i18n.t('auth.verificationCode'));
      const send = view.getByRole('button', { name: i18n.t('auth.sendVerificationCode') });
      const reportEmail = vi.spyOn(email, 'reportValidity');
      const reportForm = vi.spyOn(form(), 'reportValidity');
      const otherReports = Array.from(form().querySelectorAll('input'))
        .filter((input) => input !== email)
        .map((input) => vi.spyOn(input, 'reportValidity'));
      expect(send).toHaveAttribute('type', 'button');
      expect(send).toBeEnabled();

      await user.click(send);
      expect(reportEmail).toHaveBeenCalledOnce();
      expect(email.validity.valueMissing).toBe(true);
      expect(view.container.querySelector('[data-notification-kind]')).toBeNull();
      await user.type(email, 'invalid-email');
      await user.click(send);
      expect(reportEmail).toHaveBeenCalledTimes(2);
      expect(email.validity.typeMismatch).toBe(true);
      expect(view.container.querySelector('[data-notification-kind]')).toBeNull();

      await user.clear(email);
      await user.type(email, 'person@example.com');
      await user.click(send);
      expect(reportEmail).toHaveBeenCalledTimes(3);
      const message = i18n.t('auth.verificationUnavailable');
      expect(message).not.toBe('auth.verificationUnavailable');
      expect(view.getByRole('status')).toHaveTextContent(message);
      expect(view.getByRole('status')).toHaveTextContent(i18n.t('auth.verificationCodeValidity'));
      expect(send).toBeDisabled();
      expect(send).toHaveAccessibleName(i18n.t('auth.sendCodeCooldown', { time: '5:00' }));
      expect(code).toHaveValue('');
      expect(view.getByLabelText(i18n.t('auth.password'), { exact: true })).toHaveValue('');
      expect(view.getByLabelText(i18n.t('auth.confirmPassword'))).toHaveValue('');
      expect(form().checkValidity()).toBe(false);
      expect(reportForm).not.toHaveBeenCalled();
      for (const report of otherReports) expect(report).not.toHaveBeenCalled();

      await user.type(code, '123456');
      expect(send).toHaveAttribute('data-code-verified', 'true');
      expect(send.querySelector('svg.bi-send-check-fill')).not.toBeNull();
      expect(send).toBeDisabled();
      expect(view.getByRole('status')).toHaveTextContent(message);
      await user.click(send);
      expect(view.getByRole('status')).toHaveTextContent(message);
      expect(reportEmail).toHaveBeenCalledTimes(3);
      await user.click(modes.getByRole('button', { name: i18n.t('auth.login') }));
      expect(view.getByRole('status')).toHaveTextContent(message);
      expect(view.queryByLabelText(i18n.t('auth.verificationCode'))).toBeNull();
      await user.click(modes.getByRole('button', { name: i18n.t('auth.register') }));
      expect(view.getByLabelText(i18n.t('auth.verificationCode'))).toHaveValue('');
      expect(view.getByRole('status')).toHaveTextContent(message);
      expect(fetch).not.toHaveBeenCalled();
      expect(save).toHaveBeenCalledOnce();
      expect(save).toHaveBeenCalledWith(
        'portfolio-verification-cooldown',
        expect.stringMatching(/^\d+$/),
      );
    },
  );

  it('keeps the five-minute resend limit across mode changes and remounts, then enables sending', () => {
    vi.useFakeTimers();
    const startedAt = new Date('2026-10-10T10:00:00Z').getTime();
    vi.setSystemTime(startedAt);
    const first = renderPanel();
    fireEvent.click(first.modes.getByRole('button', { name: 'Create account' }));
    fireEvent.change(first.view.getByLabelText('Email'), {
      target: { value: 'person@example.com' },
    });
    const send = first.view.getByRole('button', { name: 'Send code' });
    expect(send.querySelector('[data-icon-pulse]')).toHaveAttribute(
      'data-icon-pulse',
      'disclosure',
    );
    expect(send.querySelector('[data-send-countdown]')).toBeNull();
    fireEvent.click(send);
    expect(send).toBeDisabled();
    expect(send).toHaveAccessibleName('Send code available in 5:00');
    expect(send.querySelector('[data-send-countdown]')).toHaveTextContent(/^300$/);
    expect(send.querySelector('[data-icon-pulse]')).toBeNull();
    act(() => vi.advanceTimersByTime(1000));
    expect(send).toHaveAccessibleName('Send code available in 4:59');
    expect(send.querySelector('[data-send-countdown]')).toHaveTextContent(/^299$/);

    fireEvent.click(first.modes.getByRole('button', { name: 'Sign in' }));
    fireEvent.click(first.modes.getByRole('button', { name: 'Create account' }));
    expect(first.view.getByRole('button', { name: 'Send code available in 4:59' })).toBeDisabled();
    first.view.unmount();
    expect(vi.getTimerCount()).toBe(0);

    vi.setSystemTime(startedAt + 180_000);
    const second = renderPanel();
    fireEvent.click(second.modes.getByRole('button', { name: 'Create account' }));
    const restored = second.view.getByRole('button', { name: 'Send code available in 2:00' });
    expect(restored).toBeDisabled();
    expect(restored.querySelector('[data-send-countdown]')).toHaveTextContent(/^120$/);
    expect(restored.querySelector('[data-icon-pulse]')).toBeNull();
    act(() => {
      vi.setSystemTime(startedAt + 299_000);
      window.dispatchEvent(new Event('focus'));
    });
    expect(restored).toHaveAccessibleName('Send code available in 0:01');
    expect(restored).toBeDisabled();
    expect(restored.querySelector('[data-send-countdown]')).toHaveTextContent(/^1$/);
    act(() => vi.advanceTimersByTime(1000));
    expect(restored).toHaveAccessibleName('Send code');
    expect(restored).toBeEnabled();
    expect(restored.querySelector('[data-send-countdown]')).toBeNull();
    expect(restored.querySelector('[data-icon-pulse]')).toHaveAttribute(
      'data-icon-pulse',
      'disclosure',
    );
    expect(window.sessionStorage.getItem('portfolio-verification-cooldown')).toBeNull();
    fireEvent.change(second.view.getByLabelText('Email'), {
      target: { value: 'person@example.com' },
    });
    fireEvent.click(restored);
    expect(restored).toBeDisabled();
    expect(restored).toHaveAccessibleName('Send code available in 5:00');
    expect(restored.querySelector('[data-send-countdown]')).toHaveTextContent(/^300$/);
  });

  it('keeps checked send icons static during the countdown and restores their enabled state on expiry', () => {
    vi.useFakeTimers();
    const { view, modes } = renderPanel();
    fireEvent.click(modes.getByRole('button', { name: 'Create account' }));
    fireEvent.change(view.getByLabelText('Email'), {
      target: { value: 'person@example.com' },
    });
    const send = view.getByRole('button', { name: 'Send code' });
    fireEvent.click(send);
    fireEvent.change(view.getByLabelText('Verification code'), { target: { value: '123456' } });
    expect(send).toBeDisabled();
    expect(send).toHaveAttribute('data-code-verified', 'true');
    expect(send.querySelector('svg.bi-send-check-fill')).not.toBeNull();
    expect(send.querySelector('[data-icon-pulse]')).toBeNull();
    expect(send.querySelector('[data-send-countdown]')).toHaveTextContent(/^300$/);
    act(() => vi.advanceTimersByTime(300_000));
    expect(send).toBeEnabled();
    expect(send).toHaveAttribute('data-code-verified', 'true');
    expect(send.querySelector('[data-send-countdown]')).toBeNull();
    expect(send.querySelector('[data-icon-pulse]')).toBeNull();
    fireEvent.change(view.getByLabelText('Verification code'), { target: { value: '' } });
    expect(send).toHaveAttribute('data-code-verified', 'false');
    expect(send.querySelector('[data-icon-pulse]')).toHaveAttribute(
      'data-icon-pulse',
      'disclosure',
    );
  });

  it('retains the resend limit when browser storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Blocked', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Blocked', 'SecurityError');
    });
    const { view, modes } = renderPanel();
    fireEvent.click(modes.getByRole('button', { name: 'Create account' }));
    fireEvent.change(view.getByLabelText('Email'), {
      target: { value: 'person@example.com' },
    });
    const send = view.getByRole('button', { name: 'Send code' });
    fireEvent.click(send);
    expect(send).toBeDisabled();
    expect(send).toHaveAccessibleName('Send code available in 5:00');
    fireEvent.click(modes.getByRole('button', { name: 'Sign in' }));
    fireEvent.click(modes.getByRole('button', { name: 'Create account' }));
    expect(view.getByRole('button', { name: 'Send code available in 5:00' })).toBeDisabled();
  });

  it('shows only an email field for password reset and returns to a clear login form', async () => {
    const { view, user, modes, form } = renderPanel();
    await user.type(view.getByLabelText('Email'), 'person@example.com');
    await user.type(view.getByLabelText('Password', { exact: true }), 'private-password');
    await user.click(view.getByRole('button', { name: 'Forgot password?' }));

    expect(view.getByRole('heading', { name: 'Reset your password' })).toBeVisible();
    expect(form().querySelectorAll('input')).toHaveLength(1);
    expect(view.getByLabelText('Email')).toHaveValue('');
    expect(view.queryByLabelText('Password', { exact: true })).toBeNull();
    expect(view.queryByLabelText('Confirm password')).toBeNull();
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
      mode: 'register',
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
      const { view, user, modes, form, i18n } = renderPanel(locale);
      if (mode === 'register') {
        await user.click(modes.getByRole('button', { name: i18n.t('auth.register') }));
      } else if (mode === 'forgot') {
        await user.click(view.getByRole('button', { name: i18n.t('auth.forgotPassword') }));
      }
      await user.type(view.getByLabelText(i18n.t('auth.email')), 'person@example.com');
      if (mode !== 'forgot') {
        await user.type(
          view.getByLabelText(i18n.t('auth.password'), { exact: true }),
          'private-password',
        );
      }
      if (mode === 'register') {
        await user.type(view.getByLabelText(i18n.t('auth.verificationCode')), '123456');
        await user.type(view.getByLabelText(i18n.t('auth.confirmPassword')), 'private-password');
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
