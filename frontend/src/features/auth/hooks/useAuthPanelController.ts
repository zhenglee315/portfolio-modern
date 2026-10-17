import { isNotificationCancellation } from '@/i18n/notification-copy';
import { useNotifications } from '@/shared/ui/NotificationProvider';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { AuthField, AuthPanelProps, FieldCheck } from '../components/AuthPanel.types';
import { authFailure } from '../lib/auth-failure';
import { useAuthFormSlide, type AuthFormSnapshot, type AuthMode } from './useAuthFormSlide';
import { useAuthRegistration } from './useAuthRegistration';
/** Own validation and cancellation while credentials remain in native inputs and requests.
 * A mode change, credential edit or unmount invalidates the outstanding operation.
 */
export function useAuthPanelController({
  initialFocus = false,
  animationActive = true,
  onBack,
  controls,
  onAuthenticate,
  onSuccess,
  onCheckEmail,
  onSendCode,
  onVerifyEmail,
}: AuthPanelProps) {
  const { t } = useTranslation();
  const { notify } = useNotifications();
  const id = useId();
  const [mode, setMode] = useState<AuthMode>('login');
  const slide = useAuthFormSlide(mode);
  const [showPassword, setShowPassword] = useState(false);
  const [checks, setChecks] = useState<Record<AuthField, FieldCheck>>({
    email: null,
    password: null,
    confirmation: null,
  });
  const [welcome, setWelcome] = useState(false);
  const [denied, setDenied] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const pending = useRef<AbortController | undefined>(undefined);
  const heading = useRef<HTMLHeadingElement>(null);
  const email = useRef<HTMLInputElement>(null);
  const password = useRef<HTMLInputElement>(null);
  const confirmation = useRef<HTMLInputElement>(null);
  const interacted = useRef(new Set<AuthField>());
  const fields = useRef<HTMLDivElement>(null);
  const {
    availability,
    emailFeedback,
    sendingCode,
    verifyingCode,
    code,
    verified,
    codeError,
    remaining,
    warning,
    setWarning,
    abortRegistration,
    markDuplicateEmail,
    registrationWarning,
    checkEmailAvailability: checkRegistrationEmail,
    sendVerificationCode,
    verifyCode,
    editCode,
    completeVerification,
    rejectVerification,
    isSendingCode,
    verifyOnBlur,
  } = useAuthRegistration({
    getEmail: () => email.current?.value,
    isSubmitting: () => Boolean(pending.current),
    onCheckEmail,
    onSendCode,
    onVerifyEmail,
  });
  const titleId = `${id}-title`;

  useEffect(() => {
    if (initialFocus && !slide.active) heading.current?.focus({ preventScroll: true });
  }, [initialFocus, mode, slide.active]);
  useEffect(() => () => pending.current?.abort(), []);

  const readFormSnapshot = (): AuthFormSnapshot => {
    const view = heading.current?.closest('[data-auth-form-view]');
    const snapshot: AuthFormSnapshot = {};
    view?.parentElement?.querySelectorAll<HTMLElement>('[data-auth-form-view]').forEach((node) => {
      const style = getComputedStyle(node);
      snapshot[node.dataset.authFormView as AuthMode] = {
        transform: style.transform,
        opacity: style.opacity,
        filter: style.filter,
      };
    });
    return snapshot;
  };

  const changeMode = (nextMode: AuthMode) => {
    if (nextMode === mode) return;
    slide.start(nextMode, readFormSnapshot());
    abortRegistration();
    pending.current?.abort();
    pending.current = undefined;
    setSubmitting(false);
    setWelcome(false);
    setDenied(false);
    setMode(nextMode);
    setShowPassword(false);
    setChecks({ email: null, password: null, confirmation: null });
    interacted.current.clear();
  };

  const leave = () => {
    abortRegistration();
    pending.current?.abort();
    pending.current = undefined;
    setSubmitting(false);
    setWelcome(false);
    setDenied(false);
    onBack();
  };

  const inputRefs = { email, password, confirmation };

  const checkField = (field: AuthField, force = false) => {
    const input = inputRefs[field].current;
    if (!input || (!force && !input.value && !interacted.current.has(field))) return true;
    // Read native input values only when checking; React stores results, never credentials.
    input.setCustomValidity('');
    let check: FieldCheck = 'valid';
    if (!input.value) check = 'fieldRequired';
    else if (field === 'email' && input.validity.typeMismatch) check = 'emailInvalid';
    else if (field !== 'email' && mode === 'register' && input.value.length < 8)
      check = 'passwordTooShort';
    else if (field === 'confirmation' && input.value !== password.current?.value)
      check = 'passwordMismatchShort';
    const message =
      check === 'passwordMismatchShort'
        ? 'passwordMismatch'
        : check === 'passwordTooShort'
          ? 'passwordHint'
          : check;
    input.setCustomValidity(check === 'valid' ? '' : t(`auth.${message}`));
    setChecks((previous) => ({ ...previous, [field]: check }));
    return check === 'valid';
  };

  const currentCheck = (field: AuthField) =>
    field === 'email' && mode === 'register' ? (emailFeedback ?? checks.email) : checks[field];

  const validationAttributes = (field: AuthField) => {
    const check = currentCheck(field);
    return {
      'aria-describedby': check ? `${id}-${field}-status` : undefined,
      'aria-invalid': check && check !== 'valid' && check !== 'emailChecking' ? true : undefined,
    };
  };

  const editField = (field: AuthField) => {
    setWelcome(false);
    if (field === 'email' || field === 'password') {
      setDenied(false);
      // A credential edit invalidates a pending login, including adapters that settle after abort.
      if (mode === 'login' && pending.current) {
        pending.current.abort();
        pending.current = undefined;
        setSubmitting(false);
      }
    }
    interacted.current.add(field);
    if (field === 'email') abortRegistration();
    inputRefs[field].current?.setCustomValidity('');
    if (field === 'password') confirmation.current?.setCustomValidity('');
    setChecks((previous) => ({
      ...previous,
      [field]: null,
      ...(field === 'password' ? { confirmation: null } : {}),
    }));
  };

  const checkEmailAvailability = () => {
    if (!checkField('email') || mode !== 'register') return;
    return checkRegistrationEmail();
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending.current) return;
    if (mode === 'register') {
      const blocked = registrationWarning();
      if (blocked) {
        setWarning(blocked);
        return;
      }
      if (isSendingCode()) return;
    }
    const activeFields: AuthField[] =
      mode === 'register'
        ? ['email', 'password', 'confirmation']
        : mode === 'login'
          ? ['email', 'password']
          : ['email'];
    const invalid = activeFields.filter((field) => !checkField(field, true));
    if (invalid.length) {
      inputRefs[invalid[0]!].current?.reportValidity();
      return;
    }
    if (!onAuthenticate || mode === 'forgot') {
      if (mode === 'register') setWarning('auth.serviceUnavailable');
      else notify({ kind: 'warning', message: t('auth.serviceUnavailable') });
      return;
    }
    const submittedFields = new FormData(event.currentTarget);
    const controller = new AbortController();
    pending.current = controller;
    setDenied(false);
    setSubmitting(true);
    try {
      if (mode === 'register' && !(await verifyCode(controller.signal))) return;
      if (pending.current !== controller || controller.signal.aborted) return;
      await onAuthenticate({
        mode,
        fields: submittedFields,
        signal: controller.signal,
      });
      if (pending.current !== controller || controller.signal.aborted) return;
      if (password.current) password.current.value = '';
      if (confirmation.current) confirmation.current.value = '';
      setShowPassword(false);
      setChecks((previous) => ({ ...previous, password: null, confirmation: null }));
      if (mode === 'register') completeVerification();
      setDenied(false);
      setWelcome(true);
      notify({ kind: 'success', message: t('auth.welcome') });
      onSuccess?.();
    } catch (error) {
      if (
        pending.current !== controller ||
        controller.signal.aborted ||
        isNotificationCancellation(error)
      )
        return;
      const failure = authFailure(error);
      if (mode === 'login' && failure.message === 'auth.invalidCredentials') setDenied(true);
      if (failure.message === 'auth.emailExists') {
        markDuplicateEmail(String(submittedFields.get('email') ?? ''));
        setWarning(failure.message);
      } else if (failure.message === 'auth.verificationRequired') {
        rejectVerification(failure.message);
      } else notify({ kind: failure.kind, message: t(failure.message) });
    } finally {
      if (pending.current === controller) {
        pending.current = undefined;
        setSubmitting(false);
      }
    }
  };

  return {
    animationActive,
    controls,
    t,
    mode,
    slide,
    welcome,
    denied,
    fields,
    warning,
    setWarning,
    titleId,
    readFormSnapshot,
    changeMode,
    leave,
    id,
    showPassword,
    setShowPassword,
    checks,
    submitting,
    heading,
    email,
    password,
    confirmation,
    interacted,
    availability,
    sendingCode,
    verifyingCode,
    code,
    verified,
    codeError,
    remaining,
    registrationWarning,
    sendVerificationCode,
    editCode,
    verifyOnBlur,
    checkField,
    currentCheck,
    validationAttributes,
    editField,
    checkEmailAvailability,
    submit,
  };
}
export type AuthPanelController = ReturnType<typeof useAuthPanelController>;
