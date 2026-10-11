import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/shared/ui/Icon';
import styles from './AuthPanel.module.css';

/** Render server-verified code feedback and a guarded, rate-limited send action. */
export function AuthVerificationField({
  inputId,
  code,
  verified,
  checking,
  error,
  onCodeChange,
  onVerify,
  onSendCode,
  locked,
  busy,
  remaining = 0,
  preview = false,
  children,
}: {
  inputId: string;
  code: string;
  verified: boolean;
  checking: boolean;
  error: string | null;
  onCodeChange: (code: string) => void;
  onVerify: () => void;
  onSendCode: () => void;
  locked: boolean;
  busy: boolean;
  remaining?: number;
  preview?: boolean;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const waiting = remaining > 0;
  const time = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`;
  const sendLabel = waiting ? t('auth.sendCodeCooldown', { time }) : t('auth.sendVerificationCode');
  const statusId = `${inputId}-status`;
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
            readOnly={busy}
            autoComplete={preview ? 'off' : 'one-time-code'}
            autoCapitalize="none"
            spellCheck={false}
            placeholder={t('auth.verificationCodePlaceholder')}
            value={preview ? '' : code}
            onChange={(event) => onCodeChange(event.target.value)}
            onBlur={onVerify}
            aria-description={verified ? t('auth.verificationCodeAccepted') : undefined}
            aria-describedby={error || checking ? statusId : undefined}
            aria-invalid={error ? true : undefined}
            maxLength={3}
            pattern="[0-9]{3}"
            required
          />
          <button
            type="button"
            className={`${styles.visibility} ${styles.sendCode}`}
            onClick={onSendCode}
            disabled={preview}
            aria-disabled={waiting || locked || busy}
            aria-busy={busy}
            aria-label={sendLabel}
            title={sendLabel}
            data-code-verified={!preview && verified}
          >
            {waiting && (
              <span className={styles.sendCountdown} data-send-countdown aria-hidden="true">
                {remaining}
              </span>
            )}
            <Icon
              name={verified ? 'sendCheck' : 'send'}
              className={styles.sendIcon}
              pulse={!waiting && !verified && !locked && !busy ? 'disclosure' : undefined}
            />
          </button>
        </div>
        {children}
      </div>
      {!preview && (error || checking) && (
        <span id={statusId} className={styles.hint} role="status">
          {t(error ?? 'auth.verificationChecking')}
        </span>
      )}
    </div>
  );
}
