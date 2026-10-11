import {
  lazy,
  Suspense,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
  type Ref,
} from 'react';
import { useTranslation } from 'react-i18next';
import { isNotificationCancellation } from '@/i18n/notification-copy';
import { Icon } from '@/shared/ui/Icon';
import { useNotifications } from '@/shared/ui/NotificationProvider';
import { useAuthRegistration, type AuthRegistrationActions } from '../hooks/useAuthRegistration';
import { AuthVerificationField } from './AuthVerificationField';
import { useAuthFormSlide, type AuthFormSnapshot, type AuthMode } from '../hooks/useAuthFormSlide';
import styles from './AuthPanel.module.css';
import { AuthCowScene } from './AuthCowScene';
import { AuthModeSwitch } from './AuthModeSwitch';
import { authFailure } from '../lib/auth-failure';

const WarningModal = lazy(() => import('@/shared/ui/WarningModal'));

export type AuthRequest = { mode: 'login' | 'register'; fields: FormData; signal: AbortSignal };
export type { AuthEmailRequest, AuthVerifyRequest } from '../hooks/useAuthRegistration';
type AuthField = 'email' | 'password' | 'confirmation';
type FieldCheck =
  | 'valid'
  | 'fieldRequired'
  | 'emailInvalid'
  | 'emailExists'
  | 'emailChecking'
  | 'emailCheckFailed'
  | 'passwordTooShort'
  | 'passwordMismatchShort'
  | null;

/** Keep exactly one live form; the inert slide preview only reproduces its visual layout. */
function AuthFormFrame({
  preview,
  descriptionId,
  onSubmit,
  children,
}: {
  preview: boolean;
  descriptionId: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  children: ReactNode;
}) {
  return preview ? (
    <div className={styles.form}>{children}</div>
  ) : (
    <form className={styles.form} aria-describedby={descriptionId} onSubmit={onSubmit}>
      {children}
    </form>
  );
}

/** Share a decorative input prefix while callers own labels, values and validation. */
function AuthInputFrame({
  icon,
  children,
  className = '',
  onMouseLeave,
}: {
  icon: 'envelope' | 'lock';
  children: ReactNode;
  className?: string;
  onMouseLeave?: () => void;
}) {
  return (
    <div className={`${styles.inputFrame} ${className}`} onMouseLeave={onMouseLeave}>
      <Icon name={icon} className={styles.inputIcon} />
      {children}
    </div>
  );
}

/** Keep format feedback beside its label; success describes local checks only. */
function AuthFieldCheck({ id, check }: { id: string; check: FieldCheck }) {
  const { t } = useTranslation();
  if (!check) return null;
  return (
    <span id={id} className={styles.hint} data-field-status={check}>
      {check === 'valid' ? <Icon name="check" label={t('auth.fieldValid')} /> : t(`auth.${check}`)}
    </span>
  );
}

/** Provide the localized title and keyboard-focus target for the current account mode. */
function AuthHeading({
  mode,
  headingRef,
  titleId,
  descriptionId,
}: {
  mode: AuthMode;
  headingRef: Ref<HTMLHeadingElement>;
  titleId: string;
  descriptionId: string;
}) {
  const { t } = useTranslation();
  const title = t(`auth.${mode}Title`);
  return (
    <header className={styles.heading}>
      <h1 ref={headingRef} id={titleId} className={styles.title} tabIndex={-1}>
        {title}
      </h1>
      <p id={descriptionId} className={styles.description}>
        {t(`auth.${mode}Description`)}
      </p>
    </header>
  );
}

/** Provide the secondary account-mode action below the current form. */
function AuthSwitchPrompt({
  mode,
  onChangeMode,
}: {
  mode: AuthMode;
  onChangeMode: (mode: AuthMode) => void;
}) {
  const { t } = useTranslation();
  const nextMode = mode === 'login' ? 'register' : 'login';
  return (
    <p className={styles.switchPrompt}>
      <span>
        {t(
          mode === 'login'
            ? 'auth.noAccount'
            : mode === 'register'
              ? 'auth.hasAccount'
              : 'auth.rememberPassword',
        )}{' '}
        <button
          type="button"
          className={styles.switchAction}
          onClick={() => onChangeMode(nextMode)}
        >
          {t(`auth.${nextMode}`)}
        </button>
      </span>
    </p>
  );
}

/**
 * Render localized account forms and compose page-supplied toolbar controls.
 * Mode changes clear inputs; form previews collapse and expand without copying credentials.
 * initialFocus targets the current heading, and animationActive gates the cow scene.
 * The page supplies an optional real account action; a resolved action enables the welcome pose.
 * Pending actions abort on mode changes or unmount; credentials remain in the form/request only.
 * Registration availability and verification are confirmed by injected server actions.
 */
export function AuthPanel({
  initialFocus = false,
  animationActive = true,
  onBack,
  controls,
  onAuthenticate,
  onSuccess,
  onCheckEmail,
  onSendCode,
  onVerifyEmail,
}: {
  initialFocus?: boolean;
  animationActive?: boolean;
  onBack: () => void;
  controls?: ReactNode;
  onAuthenticate?: (request: AuthRequest) => Promise<void>;
  onSuccess?: () => void;
} & AuthRegistrationActions) {
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

  // Both views share markup; the temporary inert preview has fresh, disabled inputs and unique IDs.
  const renderBody = (mode: AuthMode, preview = false) => {
    const viewId = preview ? `${id}-preview-${mode}` : id;
    const FieldLabel = preview ? 'span' : 'label';
    const titleId = `${viewId}-title`;
    const descriptionId = `${viewId}-description`;
    const emailId = `${viewId}-email`;
    const verificationId = `${viewId}-verification-code`;
    const passwordId = `${viewId}-password`;
    const confirmationId = `${viewId}-confirmation`;
    const viewValidation = (field: AuthField) => (preview ? {} : validationAttributes(field));
    const submitButton = (
      <button
        type="submit"
        className={styles.submit}
        disabled={preview || submitting}
        aria-busy={submitting}
        aria-disabled={
          mode === 'register' && (availability !== 'available' || sendingCode || submitting)
        }
        onClick={(event) => {
          if (mode !== 'register' || preview) return;
          const blocked = registrationWarning();
          if (blocked) {
            event.preventDefault();
            setWarning(blocked);
          }
        }}
      >
        <svg
          className={styles.submitStripes}
          aria-hidden="true"
          focusable="false"
          data-decoration="submit-stripes"
        >
          <defs>
            <pattern
              id={`${viewId}-submit-stripes`}
              width="48"
              height="48"
              patternUnits="userSpaceOnUse"
            >
              <path d="M-24 0h24l48 48H24zM24 0h24l48 48H72z" fill="currentColor" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill={`url(#${viewId}-submit-stripes)`} />
        </svg>
        <span>{t(`auth.${mode}Submit`)}</span>
        <Icon name="arrowRight" />
      </button>
    );

    return (
      <div
        key={mode}
        className={styles.body}
        data-auth-form-view={mode}
        data-auth-preview={preview || undefined}
        data-slide-phase={slide.phase}
        data-form-entering={slide.entering(mode)}
        aria-hidden={preview || undefined}
        inert={preview || undefined}
        style={slide.style(mode)}
        onTransitionEnd={(event) => {
          if (
            !preview &&
            event.target === event.currentTarget &&
            event.propertyName === 'transform'
          )
            slide.finish();
        }}
      >
        <div className={styles.formBody}>
          <AuthHeading
            mode={mode}
            headingRef={preview ? null : heading}
            titleId={titleId}
            descriptionId={descriptionId}
          />

          <AuthFormFrame
            key={mode}
            preview={preview}
            descriptionId={descriptionId}
            onSubmit={submit}
          >
            <div ref={preview ? null : fields} className={styles.fields}>
              <div className={styles.field}>
                <div className={styles.labelRow}>
                  <FieldLabel data-field-label htmlFor={emailId}>
                    {t('auth.email')}
                  </FieldLabel>
                  <AuthFieldCheck
                    id={`${id}-email-status`}
                    check={preview ? null : currentCheck('email')}
                  />
                </div>
                <AuthInputFrame icon="envelope" onMouseLeave={() => void checkEmailAvailability()}>
                  <input
                    disabled={preview}
                    readOnly={submitting}
                    {...viewValidation('email')}
                    aria-description={
                      mode === 'register' && availability === 'checking'
                        ? t('auth.emailChecking')
                        : undefined
                    }
                    onFocus={() => interacted.current.add('email')}
                    onChange={() => editField('email')}
                    onBlur={() => void checkEmailAvailability()}
                    onInvalid={() => checkField('email', true)}
                    ref={preview ? null : email}
                    id={emailId}
                    name="email"
                    type="email"
                    autoComplete="email"
                    inputMode="email"
                    autoCapitalize="none"
                    spellCheck={false}
                    placeholder={t('auth.emailPlaceholder')}
                    maxLength={254}
                    required
                  />
                </AuthInputFrame>
              </div>

              {mode !== 'forgot' && (
                <div className={styles.passwordFields}>
                  <div className={mode === 'register' ? styles.passwordRow : undefined}>
                    <div className={styles.field}>
                      <div className={styles.labelRow}>
                        <FieldLabel data-field-label htmlFor={passwordId}>
                          {t('auth.password')}
                        </FieldLabel>
                        <div className={styles.labelActions}>
                          {mode === 'login' && (
                            <button
                              type="button"
                              className={styles.inlineAction}
                              onClick={() => changeMode('forgot')}
                            >
                              {t('auth.forgotPassword')}
                            </button>
                          )}
                          <AuthFieldCheck
                            id={`${id}-password-status`}
                            check={preview ? null : checks.password}
                          />
                        </div>
                      </div>
                      <AuthInputFrame
                        icon="lock"
                        className={styles.passwordField}
                        onMouseLeave={() => checkField('password')}
                      >
                        <input
                          disabled={preview}
                          readOnly={submitting}
                          {...viewValidation('password')}
                          onFocus={() => interacted.current.add('password')}
                          onChange={() => editField('password')}
                          onBlur={() => checkField('password')}
                          onInvalid={() => checkField('password', true)}
                          ref={preview ? null : password}
                          id={passwordId}
                          name="password"
                          type={showPassword ? 'text' : 'password'}
                          autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                          aria-description={
                            mode === 'register' ? t('auth.passwordHint') : undefined
                          }
                          placeholder={mode === 'register' ? t('auth.passwordHint') : undefined}
                          minLength={mode === 'register' ? 8 : undefined}
                          maxLength={1024}
                          required
                        />
                        <button
                          type="button"
                          className={styles.visibility}
                          disabled={preview || submitting}
                          aria-label={t(showPassword ? 'auth.hidePassword' : 'auth.showPassword')}
                          aria-controls={
                            mode === 'register' ? `${passwordId} ${confirmationId}` : passwordId
                          }
                          onClick={() => setShowPassword((visible) => !visible)}
                        >
                          <Icon name={showPassword ? 'eyeSlash' : 'eye'} />
                        </button>
                      </AuthInputFrame>
                    </div>
                    {mode === 'register' && (
                      <div className={styles.field}>
                        <div className={styles.labelRow}>
                          <FieldLabel data-field-label htmlFor={confirmationId}>
                            {t('auth.confirmPassword')}
                          </FieldLabel>
                          <AuthFieldCheck
                            id={`${id}-confirmation-status`}
                            check={preview ? null : checks.confirmation}
                          />
                        </div>
                        <AuthInputFrame icon="lock" onMouseLeave={() => checkField('confirmation')}>
                          <input
                            disabled={preview}
                            readOnly={submitting}
                            {...viewValidation('confirmation')}
                            onFocus={() => interacted.current.add('confirmation')}
                            onChange={() => editField('confirmation')}
                            onBlur={() => checkField('confirmation')}
                            onInvalid={() => checkField('confirmation', true)}
                            ref={preview ? null : confirmation}
                            id={confirmationId}
                            name="passwordConfirmation"
                            type={showPassword ? 'text' : 'password'}
                            autoComplete="new-password"
                            aria-description={t('auth.passwordHint')}
                            minLength={8}
                            maxLength={1024}
                            required
                          />
                        </AuthInputFrame>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {mode === 'register' && (
                <AuthVerificationField
                  inputId={verificationId}
                  code={code}
                  verified={verified}
                  checking={verifyingCode}
                  error={codeError}
                  onCodeChange={editCode}
                  onVerify={verifyOnBlur}
                  onSendCode={() => void sendVerificationCode()}
                  locked={availability !== 'available'}
                  busy={sendingCode || submitting}
                  remaining={remaining}
                  preview={preview}
                >
                  {submitButton}
                </AuthVerificationField>
              )}
            </div>

            {mode !== 'register' && submitButton}
          </AuthFormFrame>
        </div>

        <AuthSwitchPrompt mode={mode} onChangeMode={changeMode} />
      </div>
    );
  };

  return (
    <section className={styles.panel} aria-labelledby={titleId} data-auth-panel>
      {warning && (
        <Suspense fallback={null}>
          <WarningModal
            title={t('auth.warningTitle')}
            message={t(warning)}
            closeLabel={t('auth.closeWarning')}
            onClose={() => setWarning(null)}
          />
        </Suspense>
      )}
      <div className={styles.toolbar}>
        <button type="button" className={styles.back} onClick={leave}>
          <Icon name="doorOpenOutline" className={styles.backIcon} pulse="chat" />
          {t('auth.backToPortfolio')}
        </button>
        {controls && <div className={styles.controls}>{controls}</div>}
      </div>

      <div className={styles.card}>
        <div className={styles.reserved}>
          <AuthCowScene active={animationActive} pointerOrigin={fields} welcome={welcome} />
        </div>
        <div className={styles.content}>
          <AuthModeSwitch
            mode={mode === 'register' ? 'register' : 'login'}
            onChange={changeMode}
            onDragPosition={(position) => slide.drag(position, readFormSnapshot)}
          />

          {renderBody(mode)}
          {slide.previewMode && renderBody(slide.previewMode, true)}
        </div>
      </div>
    </section>
  );
}
