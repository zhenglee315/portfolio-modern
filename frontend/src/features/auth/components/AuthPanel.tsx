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
import { Icon } from '@/shared/ui/Icon';
import styles from './AuthPanel.module.css';
import { AuthCowScene } from './AuthCowScene';

type AuthMode = 'login' | 'register' | 'forgot';
const authModes: readonly AuthMode[] = ['login', 'register', 'forgot'];
const feedbackMessages = {
  account: 'auth.serviceUnavailable',
  verification: 'auth.verificationUnavailable',
} as const;
type AuthFeedbackKind = keyof typeof feedbackMessages;

/** Share a decorative input prefix while callers own labels, values and validation. */
function AuthInputFrame({
  icon,
  children,
  className = '',
}: {
  icon: 'envelope' | 'lock';
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`${styles.inputFrame} ${className}`}>
      <Icon name={icon} className={styles.inputIcon} />
      {children}
    </div>
  );
}

/**
 * Render a verification input, or a sizing placeholder when inputId is omitted.
 * The caller supplies the send action; this component does not deliver or verify codes.
 */
function AuthVerificationField({
  inputId,
  onSendCode,
}: {
  inputId?: string;
  onSendCode?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className={styles.field}>
      {inputId ? (
        <label htmlFor={inputId}>{t('auth.verificationCode')}</label>
      ) : (
        <span className={styles.fieldLabel}>{t('auth.verificationCode')}</span>
      )}
      <div className={styles.verificationRow}>
        {inputId ? (
          <input
            id={inputId}
            name="verificationCode"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoCapitalize="none"
            spellCheck={false}
            placeholder={t('auth.verificationCodePlaceholder')}
            required
          />
        ) : (
          <div className={styles.inputSizer} />
        )}
        {onSendCode ? (
          <button type="button" className={styles.sendCode} onClick={onSendCode}>
            {t('auth.sendVerificationCode')}
          </button>
        ) : (
          <span className={styles.sendCode}>{t('auth.sendVerificationCode')}</span>
        )}
      </div>
    </div>
  );
}

/** Share localized headings; sizing copies omit the heading semantics and focus target. */
function AuthHeading({
  mode,
  sizing = false,
  headingRef,
  titleId,
  descriptionId,
}: {
  mode: AuthMode;
  sizing?: boolean;
  headingRef?: Ref<HTMLHeadingElement>;
  titleId?: string;
  descriptionId?: string;
}) {
  const { t } = useTranslation();
  const title = t(`auth.${mode}Title`);
  return (
    <header className={styles.heading}>
      {sizing ? (
        <span className={styles.title}>{title}</span>
      ) : (
        <h1 ref={headingRef} id={titleId} className={styles.title} tabIndex={-1}>
          {title}
        </h1>
      )}
      <p id={descriptionId} className={styles.description}>
        {t(`auth.${mode}Description`)}
      </p>
    </header>
  );
}

/** Render a mode-switch action, or matching inert text when onChangeMode is omitted. */
function AuthSwitchPrompt({
  mode,
  onChangeMode,
}: {
  mode: AuthMode;
  onChangeMode?: (mode: AuthMode) => void;
}) {
  const { t } = useTranslation();
  const nextMode = mode === 'login' ? 'register' : 'login';
  return (
    <p className={styles.switchPrompt}>
      {t(
        mode === 'login'
          ? 'auth.noAccount'
          : mode === 'register'
            ? 'auth.hasAccount'
            : 'auth.rememberPassword',
      )}{' '}
      {onChangeMode ? (
        <button
          type="button"
          className={styles.switchAction}
          onClick={() => onChangeMode(nextMode)}
        >
          {t(`auth.${nextMode}`)}
        </button>
      ) : (
        <span className={styles.switchAction}>{t(`auth.${nextMode}`)}</span>
      )}
    </p>
  );
}

/**
 * Reserve the tallest localized feedback message to keep the card's height stable.
 * Only the current message becomes a live status; sizing text stays hidden and silent.
 */
function AuthFeedback({ feedback }: { feedback?: AuthFeedbackKind | null }) {
  const { t } = useTranslation();
  return (
    <div className={styles.feedback}>
      {Object.values(feedbackMessages).map((message) => (
        <p key={message} className={`${styles.status} ${styles.placeholder}`} aria-hidden="true">
          {t(message)}
        </p>
      ))}
      {feedback && (
        <p className={styles.status} role="status">
          {t(feedbackMessages[feedback])}
        </p>
      )}
    </div>
  );
}

/**
 * Let the tallest account mode determine the card's intrinsic height.
 * These hidden copies contain no controls or credentials and stay outside the live form.
 */
function AuthSizingBody({ mode }: { mode: AuthMode }) {
  const { t } = useTranslation();
  return (
    <div
      className={`${styles.body} ${styles.sizer}`}
      data-auth-size={mode}
      aria-hidden="true"
      inert
    >
      <AuthHeading mode={mode} sizing />
      <div className={styles.form}>
        <div className={styles.fields}>
          <div className={styles.field}>
            <span className={styles.fieldLabel}>{t('auth.email')}</span>
            <div className={styles.inputSizer} />
          </div>
          {mode === 'register' && <AuthVerificationField />}
          {mode !== 'forgot' && (
            <div className={styles.field}>
              <div className={styles.labelRow}>
                <span className={styles.fieldLabel}>{t('auth.password')}</span>
                {mode === 'login' && (
                  <span className={styles.inlineAction}>{t('auth.forgotPassword')}</span>
                )}
              </div>
              <div className={styles.passwordField}>
                <div className={styles.inputSizer} />
              </div>
              {mode === 'register' && <p className={styles.hint}>{t('auth.passwordHint')}</p>}
            </div>
          )}
          {mode === 'register' && (
            <div className={styles.field}>
              <span className={styles.fieldLabel}>{t('auth.confirmPassword')}</span>
              <div className={styles.inputSizer} />
            </div>
          )}
        </div>
        <div className={styles.submit}>
          <span>{t(`auth.${mode}Submit`)}</span>
          <Icon name="arrowRight" />
        </div>
        <AuthFeedback />
      </div>
      <AuthSwitchPrompt mode={mode} />
    </div>
  );
}

/**
 * Render localized account forms and compose page-supplied toolbar controls.
 * Mode changes clear inputs; intrinsic copies keep every mode the same size.
 * initialFocus targets the current heading, and animationActive gates the cow scene.
 * The page owns onBack navigation; account actions and email delivery await a server API.
 */
export function AuthPanel({
  initialFocus = false,
  animationActive = true,
  onBack,
  controls,
}: {
  initialFocus?: boolean;
  animationActive?: boolean;
  onBack: () => void;
  controls?: ReactNode;
}) {
  const { t } = useTranslation();
  const id = useId();
  const [mode, setMode] = useState<AuthMode>('login');
  const [showPassword, setShowPassword] = useState(false);
  const [feedback, setFeedback] = useState<AuthFeedbackKind | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const email = useRef<HTMLInputElement>(null);
  const confirmation = useRef<HTMLInputElement>(null);
  const fields = useRef<HTMLDivElement>(null);
  const titleId = `${id}-title`;
  const descriptionId = `${id}-description`;
  const emailId = `${id}-email`;
  const verificationId = `${id}-verification-code`;
  const passwordId = `${id}-password`;
  const confirmationId = `${id}-confirmation`;

  useEffect(() => {
    if (initialFocus) heading.current?.focus({ preventScroll: true });
  }, [initialFocus, mode]);

  const changeMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setShowPassword(false);
    setFeedback(null);
  };

  const sendVerificationCode = () => {
    if (!email.current?.reportValidity()) return;
    // A future server endpoint will send the email; this UI cannot send or verify codes yet.
    setFeedback('verification');
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (mode === 'register') {
      const fields = new FormData(form);
      if (fields.get('password') !== fields.get('passwordConfirmation')) {
        confirmation.current?.setCustomValidity(t('auth.passwordMismatch'));
        confirmation.current?.reportValidity();
        return;
      }
    }
    // This presentation has no account API. Credentials stay in the current form only.
    setFeedback('account');
  };

  return (
    <section className={styles.panel} aria-labelledby={titleId} data-auth-panel>
      <div className={styles.toolbar}>
        <button type="button" className={styles.back} onClick={onBack}>
          <Icon name="arrowRight" className={styles.backIcon} />
          {t('auth.backToPortfolio')}
        </button>
        {controls && <div className={styles.controls}>{controls}</div>}
      </div>

      <div className={styles.card}>
        <div className={styles.reserved}>
          <AuthCowScene active={animationActive} pointerOrigin={fields} />
        </div>
        <div className={styles.content}>
          <div
            className={styles.modes}
            data-mode={mode === 'register' ? 'register' : 'login'}
            role="group"
            aria-label={t('auth.modeLabel')}
          >
            <button
              type="button"
              aria-pressed={mode !== 'register'}
              onClick={() => changeMode('login')}
            >
              {t('auth.login')}
            </button>
            <button
              type="button"
              aria-pressed={mode === 'register'}
              onClick={() => changeMode('register')}
            >
              {t('auth.register')}
            </button>
          </div>

          <div className={styles.bodyStack}>
            {authModes.map((sizingMode) => (
              <AuthSizingBody key={sizingMode} mode={sizingMode} />
            ))}
            <div className={styles.body}>
              <AuthHeading
                mode={mode}
                headingRef={heading}
                titleId={titleId}
                descriptionId={descriptionId}
              />

              <form
                key={mode}
                className={styles.form}
                aria-describedby={descriptionId}
                onSubmit={submit}
                onInput={() => {
                  setFeedback(null);
                  confirmation.current?.setCustomValidity('');
                }}
              >
                <div ref={fields} className={styles.fields}>
                  <div className={styles.field}>
                    <label htmlFor={emailId}>{t('auth.email')}</label>
                    <AuthInputFrame icon="envelope">
                      <input
                        ref={email}
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

                  {mode === 'register' && (
                    <AuthVerificationField
                      inputId={verificationId}
                      onSendCode={sendVerificationCode}
                    />
                  )}

                  {mode !== 'forgot' && (
                    <div className={styles.field}>
                      <div className={styles.labelRow}>
                        <label htmlFor={passwordId}>{t('auth.password')}</label>
                        {mode === 'login' && (
                          <button
                            type="button"
                            className={styles.inlineAction}
                            onClick={() => changeMode('forgot')}
                          >
                            {t('auth.forgotPassword')}
                          </button>
                        )}
                      </div>
                      <AuthInputFrame icon="lock" className={styles.passwordField}>
                        <input
                          id={passwordId}
                          name="password"
                          type={showPassword ? 'text' : 'password'}
                          autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                          aria-describedby={mode === 'register' ? `${id}-password-hint` : undefined}
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
                      {mode === 'register' && (
                        <p id={`${id}-password-hint`} className={styles.hint}>
                          {t('auth.passwordHint')}
                        </p>
                      )}
                    </div>
                  )}

                  {mode === 'register' && (
                    <div className={styles.field}>
                      <label htmlFor={confirmationId}>{t('auth.confirmPassword')}</label>
                      <AuthInputFrame icon="lock">
                        <input
                          ref={confirmation}
                          id={confirmationId}
                          name="passwordConfirmation"
                          type={showPassword ? 'text' : 'password'}
                          autoComplete="new-password"
                          minLength={8}
                          required
                        />
                      </AuthInputFrame>
                    </div>
                  )}
                </div>

                <button type="submit" className={styles.submit}>
                  <svg
                    className={styles.submitStripes}
                    aria-hidden="true"
                    focusable="false"
                    data-decoration="submit-stripes"
                  >
                    <defs>
                      <pattern
                        id={`${id}-submit-stripes`}
                        width="48"
                        height="48"
                        patternUnits="userSpaceOnUse"
                      >
                        <path d="M-24 0h24l48 48H24zM24 0h24l48 48H72z" fill="currentColor" />
                      </pattern>
                    </defs>
                    <rect width="100%" height="100%" fill={`url(#${id}-submit-stripes)`} />
                  </svg>
                  <span>{t(`auth.${mode}Submit`)}</span>
                  <Icon name="arrowRight" />
                </button>
                <AuthFeedback feedback={feedback} />
              </form>

              <AuthSwitchPrompt mode={mode} onChangeMode={changeMode} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
