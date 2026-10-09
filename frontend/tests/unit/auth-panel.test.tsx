import { fireEvent, render, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthPanel } from '@/features/auth';
import { createI18n, type Locale } from '@/i18n/config';

// Form tests keep the independently tested SVG scene out of this account boundary.
vi.mock('@/features/auth/components/AuthCowScene', () => ({ AuthCowScene: () => null }));

function renderPanel(locale: Locale = 'en') {
  const i18n = createI18n(locale);
  const view = render(
    <I18nextProvider i18n={i18n}>
      <AuthPanel initialFocus onBack={vi.fn()} />
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

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('account form presentation', () => {
  it.each(['en', 'zh-Hans', 'zh-Hant'] as const)(
    'keeps sizing copies inaccessible and free of credentials or controls in %s',
    async (locale) => {
      const { view, user, modes, i18n } = renderPanel(locale);
      const sizers = view.container.querySelectorAll('[data-auth-size]');
      expect(sizers).toHaveLength(3);
      for (const sizer of sizers) {
        expect(sizer).toHaveAttribute('aria-hidden', 'true');
        expect(sizer).toHaveAttribute('inert');
        expect(
          sizer.querySelector(
            'form, input, select, textarea, button, label, [id], [name], [tabindex], [contenteditable]',
          ),
        ).toBeNull();
      }

      const expectActiveForm = (mode: 'login' | 'register' | 'forgot', inputCount: number) => {
        expect(view.container.querySelectorAll('form')).toHaveLength(1);
        expect(view.container.querySelectorAll('input')).toHaveLength(inputCount);
        expect(view.getAllByRole('heading', { level: 1 })).toHaveLength(1);
        expect(view.getByRole('heading', { name: i18n.t(`auth.${mode}Title`) })).toHaveFocus();
        expect(view.getByLabelText(i18n.t('auth.email'))).toHaveValue('');
        expect(view.queryByRole('status')).toBeNull();
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

  it('clears credentials, password visibility and submission feedback when switching modes', async () => {
    const { view, user, modes, form } = renderPanel();
    const email = view.getByLabelText('Email address');
    expect(view.getByRole('heading', { level: 1 })).toHaveFocus();
    await user.type(email, 'person@example.com');
    await user.type(view.getByLabelText('Password', { exact: true }), 'private-password');
    await user.click(view.getByRole('button', { name: 'Show password' }));
    expect(view.getByLabelText('Password', { exact: true })).toHaveAttribute('type', 'text');
    await user.click(within(form()).getByRole('button', { name: 'Sign in' }));
    expect(view.getByRole('status')).toHaveTextContent('Account services are not open yet.');

    await user.click(modes.getByRole('button', { name: 'Create account' }));
    expect(view.getByRole('heading', { name: 'Create your account' })).toBeVisible();
    expect(view.getByLabelText('Email address')).toHaveValue('');
    expect(view.getByRole('heading', { name: 'Create your account' })).toHaveFocus();
    expect(view.getByLabelText('Password', { exact: true })).toHaveValue('');
    expect(view.getByLabelText('Password', { exact: true })).toHaveAttribute('type', 'password');
    expect(view.getByLabelText('Confirm password')).toHaveValue('');
    expect(view.getByLabelText('Verification code')).toHaveValue('');
    expect(view.queryByRole('status')).toBeNull();

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

  it('rejects mismatched registration passwords and clears the error after correction', async () => {
    const { view, user, modes, form } = renderPanel();
    await user.click(modes.getByRole('button', { name: 'Create account' }));
    await user.type(view.getByLabelText('Email address'), 'person@example.com');
    await user.type(view.getByLabelText('Verification code'), '123456');
    await user.type(view.getByLabelText('Password', { exact: true }), 'first-password');
    const confirmation = view.getByLabelText('Confirm password') as HTMLInputElement;
    await user.type(confirmation, 'different-password');
    await user.click(within(form()).getByRole('button', { name: 'Create account' }));

    expect(confirmation.validity.customError).toBe(true);
    expect(confirmation.validationMessage).toBe('Passwords do not match.');
    expect(confirmation).toBeInvalid();
    expect(view.queryByRole('status')).toBeNull();

    await user.clear(confirmation);
    await user.type(confirmation, 'first-password');
    expect(confirmation.validity.customError).toBe(false);
    expect(confirmation).toBeValid();
    await user.click(within(form()).getByRole('button', { name: 'Create account' }));
    expect(view.getByRole('status')).toHaveTextContent('Account services are not open yet.');
  });

  it('requires a verification code for registration and preserves its text value', async () => {
    const { view, user, modes, form } = renderPanel();
    await user.click(modes.getByRole('button', { name: 'Create account' }));
    await user.type(view.getByLabelText('Email address'), 'person@example.com');
    await user.type(view.getByLabelText('Password', { exact: true }), 'private-password');
    await user.type(view.getByLabelText('Confirm password'), 'private-password');

    const code = view.getByLabelText('Verification code') as HTMLInputElement;
    expect(code).toHaveAttribute('name', 'verificationCode');
    expect(code).toHaveAttribute('type', 'text');
    expect(code).toHaveAttribute('inputmode', 'numeric');
    expect(code).toHaveAttribute('autocomplete', 'one-time-code');
    expect(code).toBeRequired();
    await user.click(within(form()).getByRole('button', { name: 'Create account' }));
    expect(code.validity.valueMissing).toBe(true);
    expect(view.queryByRole('status')).toBeNull();

    await user.type(code, '01234');
    expect(code).toHaveValue('01234');
    expect(form().checkValidity()).toBe(true);
    await user.click(within(form()).getByRole('button', { name: 'Create account' }));
    expect(view.getByRole('status')).toHaveTextContent('Account services are not open yet.');
  });

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

      await user.click(send);
      expect(reportEmail).toHaveBeenCalledOnce();
      expect(email.validity.valueMissing).toBe(true);
      expect(view.queryByRole('status')).toBeNull();
      await user.type(email, 'invalid-email');
      await user.click(send);
      expect(reportEmail).toHaveBeenCalledTimes(2);
      expect(email.validity.typeMismatch).toBe(true);
      expect(view.queryByRole('status')).toBeNull();

      await user.clear(email);
      await user.type(email, 'person@example.com');
      await user.click(send);
      expect(reportEmail).toHaveBeenCalledTimes(3);
      const message = i18n.t('auth.verificationUnavailable');
      expect(message).not.toBe('auth.verificationUnavailable');
      expect(view.getByRole('status')).toHaveTextContent(message);
      expect(code).toHaveValue('');
      expect(view.getByLabelText(i18n.t('auth.password'), { exact: true })).toHaveValue('');
      expect(view.getByLabelText(i18n.t('auth.confirmPassword'))).toHaveValue('');
      expect(form().checkValidity()).toBe(false);
      expect(reportForm).not.toHaveBeenCalled();
      for (const report of otherReports) expect(report).not.toHaveBeenCalled();

      await user.type(code, '123456');
      expect(view.queryByRole('status')).toBeNull();
      await user.click(send);
      expect(view.getByRole('status')).toHaveTextContent(message);
      await user.click(modes.getByRole('button', { name: i18n.t('auth.login') }));
      expect(view.queryByRole('status')).toBeNull();
      expect(view.queryByLabelText(i18n.t('auth.verificationCode'))).toBeNull();
      await user.click(modes.getByRole('button', { name: i18n.t('auth.register') }));
      expect(view.getByLabelText(i18n.t('auth.verificationCode'))).toHaveValue('');
      expect(view.queryByRole('status')).toBeNull();
      expect(fetch).not.toHaveBeenCalled();
      expect(save).not.toHaveBeenCalled();
    },
  );

  it('shows only an email field for password reset and returns to a clear login form', async () => {
    const { view, user, modes, form } = renderPanel();
    await user.type(view.getByLabelText('Email address'), 'person@example.com');
    await user.type(view.getByLabelText('Password', { exact: true }), 'private-password');
    await user.click(view.getByRole('button', { name: 'Forgot password?' }));

    expect(view.getByRole('heading', { name: 'Reset your password' })).toBeVisible();
    expect(form().querySelectorAll('input')).toHaveLength(1);
    expect(view.getByLabelText('Email address')).toHaveValue('');
    expect(view.queryByLabelText('Password', { exact: true })).toBeNull();
    expect(view.queryByLabelText('Confirm password')).toBeNull();
    expect(view.queryByRole('button', { name: 'Show password' })).toBeNull();
    await user.type(view.getByLabelText('Email address'), 'person@example.com');
    await user.click(within(form()).getByRole('button', { name: 'Send reset link' }));
    expect(view.getByRole('status')).toHaveTextContent('Account services are not open yet.');

    await user.click(modes.getByRole('button', { name: 'Sign in' }));
    expect(view.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    expect(view.getByLabelText('Email address')).toHaveValue('');
    expect(view.getByLabelText('Password', { exact: true })).toHaveValue('');
    expect(view.queryByRole('status')).toBeNull();
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
