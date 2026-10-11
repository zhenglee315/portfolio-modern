import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
  type Ref,
} from 'react';
import { useTranslation } from 'react-i18next';
import { isNotificationCancellation, notificationFailure } from '@/i18n/notification-copy';
import { Icon } from '@/shared/ui/Icon';
import { useNotifications } from '@/shared/ui/NotificationProvider';
import { useVerificationCooldown } from '../hooks/useVerificationCooldown';
import { useAuthFormSlide, type AuthFormSnapshot, type AuthMode } from '../hooks/useAuthFormSlide';
import styles from './AuthPanel.module.css';
import { AuthCowScene } from './AuthCowScene';
import { AuthModeSwitch } from './AuthModeSwitch';

export type AuthRequest = { mode: 'login' | 'register'; fields: FormData; signal: AbortSignal };
type AuthField = 'email' | 'password' | 'confirmation';
type FieldCheck =
  'valid' | 'fieldRequired' | 'emailInvalid' | 'passwordTooShort' | 'passwordMismatchShort' | null;

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

/**
 * Render the verification input and its rate-limited send action.
 * Countdown digits share the icon's hit target; nonempty codes preview acceptance until the API exists.
 */
function AuthVerificationField({
  inputId,
  onSendCode,
  remaining = 0,
  preview = false,
  children,
}: {
  inputId: string;
  onSendCode: () => void;
  remaining?: number;
  preview?: boolean;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const [code, setCode] = useState('');
  // Temporary presentation state, replaced by server verification when the API is ready.
  const verified = code.trim().length > 0;
  const waiting = remaining > 0;
  const time = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`;
  const sendLabel = waiting ? t('auth.sendCodeCooldown', { time }) : t('auth.sendVerificationCode');
  // Only the available send action pulses; waiting and accepted icons stay still.
  const sendIcon = (
    <Icon
      name={verified ? 'sendCheck' : 'send'}
      className={styles.sendIcon}
      pulse={!waiting && !verified ? 'disclosure' : undefined}
    />
  );
  return (
    <div className={styles.field}>
      {!preview && (
        <label className="visually-hidden" htmlFor={inputId}>
          {t('auth.verificationCode')}
        </label>
      )}
      <div className={styles.verificationRow}>
        <div className={styles.codeFrame}>
          <input
            id={inputId}
            name="verificationCode"
            type="text"
            inputMode="numeric"
            disabled={preview}
            autoComplete={preview ? 'off' : 'one-time-code'}
            autoCapitalize="none"
            spellCheck={false}
            placeholder={t('auth.verificationCodePlaceholder')}
            value={code}
            onChange={(event) => setCode(event.target.value)}
            aria-description={verified ? t('auth.verificationCodeAccepted') : undefined}
            required
          />
          <button
            type="button"
            className={`${styles.visibility} ${styles.sendCode}`}
            onClick={onSendCode}
            disabled={waiting || preview}
            aria-label={sendLabel}
            title={sendLabel}
            data-code-verified={verified}
          >
            {waiting && (
              <span className={styles.sendCountdown} data-send-countdown aria-hidden="true">
                {remaining}
              </span>
            )}
            {sendIcon}
          </button>
        </div>
        {children}
      </div>
    </div>
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
 * Account services await an action; verification sending remains a presentation preview.
 */
export function AuthPanel({
  initialFocus = false,
  animationActive = true,
  onBack,
  controls,
  onAuthenticate,
}: {
  initialFocus?: boolean;
  animationActive?: boolean;
  onBack: () => void;
  controls?: ReactNode;
  onAuthenticate?: (request: AuthRequest) => Promise<void>;
}) {
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
  const cooldown = useVerificationCooldown();
  const heading = useRef<HTMLHeadingElement>(null);
  const email = useRef<HTMLInputElement>(null);
  const password = useRef<HTMLInputElement>(null);
  const confirmation = useRef<HTMLInputElement>(null);
  const interacted = useRef(new Set<AuthField>());
  const fields = useRef<HTMLDivElement>(null);
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
    pending.current?.abort();
    pending.current = undefined;
    setSubmitting(false);
    setWelcome(false);
    setMode(nextMode);
    setShowPassword(false);
    setChecks({ email: null, password: null, confirmation: null });
    interacted.current.clear();
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

  const validationAttributes = (field: AuthField) => ({
    'aria-describedby': checks[field] ? `${id}-${field}-status` : undefined,
    'aria-invalid': checks[field] && checks[field] !== 'valid' ? true : undefined,
  });

  const editField = (field: AuthField) => {
    interacted.current.add(field);
    inputRefs[field].current?.setCustomValidity('');
    if (field === 'password') confirmation.current?.setCustomValidity('');
    setChecks((previous) => ({
      ...previous,
      [field]: null,
      ...(field === 'password' ? { confirmation: null } : {}),
    }));
  };

  const sendVerificationCode = () => {
    checkField('email', true);
    if (!email.current?.reportValidity()) return;
    if (!cooldown.start()) return;
    // Requested sent-state preview; delivery still awaits a server endpoint.
    notify({
      kind: 'success',
      icon: 'send',
      message: `${t('auth.verificationCodeSent')} ${t('auth.verificationCodeValidity')}`,
    });
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending.current) return;
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
      notify({ kind: 'warning', message: t('auth.serviceUnavailable') });
      return;
    }
    const controller = new AbortController();
    pending.current = controller;
    setSubmitting(true);
    try {
      await onAuthenticate({
        mode,
        fields: new FormData(event.currentTarget),
        signal: controller.signal,
      });
      if (pending.current !== controller || controller.signal.aborted) return;
      setWelcome(true);
      notify({ kind: 'success', message: t('auth.welcome') });
    } catch (error) {
      if (
        pending.current !== controller ||
        controller.signal.aborted ||
        isNotificationCancellation(error)
      )
        return;
      const failure = notificationFailure(error);
      notify({ kind: failure.kind, message: t(failure.message) });
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
                  <AuthFieldCheck id={`${id}-email-status`} check={preview ? null : checks.email} />
                </div>
                <AuthInputFrame icon="envelope" onMouseLeave={() => checkField('email')}>
                  <input
                    disabled={preview}
                    {...viewValidation('email')}
                    onFocus={() => interacted.current.add('email')}
                    onChange={() => editField('email')}
                    onBlur={() => checkField('email')}
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
                          required
                        />
                        <button
                          type="button"
                          className={styles.visibility}
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
                  onSendCode={sendVerificationCode}
                  remaining={cooldown.remaining}
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
      <div className={styles.toolbar}>
        <button type="button" className={styles.back} onClick={onBack}>
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
