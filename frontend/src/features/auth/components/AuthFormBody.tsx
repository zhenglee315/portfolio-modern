import { Icon } from '@/shared/ui/Icon';
import { type FormEvent, type ReactNode, type Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { type AuthMode } from '../hooks/useAuthFormSlide';
import type { AuthPanelController } from '../hooks/useAuthPanelController';
import styles from './AuthPanel.module.css';
import type { AuthField, FieldCheck } from './AuthPanel.types';
import { AuthVerificationField } from './AuthVerificationField';
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

/** Live and inert slide bodies share layout without copying credentials. */
export function AuthFormBody({
  mode,
  preview = false,
  controller,
}: {
  mode: AuthMode;
  preview?: boolean;
  controller: AuthPanelController;
}) {
  const {
    t,
    id,
    slide,
    showPassword,
    setShowPassword,
    checks,
    submitting,
    heading,
    email,
    password,
    confirmation,
    interacted,
    fields,
    availability,
    sendingCode,
    verifyingCode,
    code,
    verified,
    codeError,
    remaining,
    setWarning,
    registrationWarning,
    sendVerificationCode,
    editCode,
    verifyOnBlur,
    changeMode,
    checkField,
    currentCheck,
    validationAttributes,
    editField,
    checkEmailAvailability,
    submit,
  } = controller;
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
        if (!preview && event.target === event.currentTarget && event.propertyName === 'transform')
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

        <AuthFormFrame key={mode} preview={preview} descriptionId={descriptionId} onSubmit={submit}>
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
                        aria-description={mode === 'register' ? t('auth.passwordHint') : undefined}
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
}
