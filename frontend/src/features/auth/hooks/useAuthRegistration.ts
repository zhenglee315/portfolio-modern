import { isNotificationCancellation } from '@/i18n/notification-copy';
import { ApiError } from '@/shared/api/http';
import { useNotifications } from '@/shared/ui/NotificationProvider';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authFailure } from '../lib/auth-failure';
import { useVerificationCooldown } from './useVerificationCooldown';

export type AuthEmailRequest = { email: string; signal: AbortSignal };
export type AuthVerifyRequest = AuthEmailRequest & { code: string };
type EmailAvailability = 'idle' | 'checking' | 'available' | 'duplicate' | 'error';
export type AuthRegistrationEmailCheck =
  'valid' | 'emailExists' | 'emailChecking' | 'emailCheckFailed';

export type AuthRegistrationActions = {
  onCheckEmail?: (request: AuthEmailRequest) => Promise<{ email: string; available: boolean }>;
  onSendCode?: (request: AuthEmailRequest) => Promise<{ expires_in: number; retry_after: number }>;
  onVerifyEmail?: (request: AuthVerifyRequest) => Promise<{ email: string; verified: boolean }>;
};

/** Own registration requests, proof lifetime and cancellation independently of form layout.
 * The caller checks local email format first; server results alone unlock registration.
 * Native form values are read on demand, and OTPs remain in this mounted feature only.
 */
export function useAuthRegistration({
  getEmail,
  isSubmitting,
  onCheckEmail,
  onSendCode,
  onVerifyEmail,
}: AuthRegistrationActions & {
  getEmail: () => string | undefined;
  isSubmitting: () => boolean;
}) {
  const { t } = useTranslation();
  const { notify } = useNotifications();
  const emailPending = useRef<AbortController | undefined>(undefined);
  const sendingPending = useRef<AbortController | undefined>(undefined);
  const verifyPending = useRef<AbortController | undefined>(undefined);
  const emailCheck = useRef<{
    email: string;
    status: EmailAvailability;
    promise?: Promise<boolean>;
  }>({ email: '', status: 'idle' });
  const verificationCheck = useRef<{
    email: string;
    code: string;
    promise: Promise<boolean>;
  } | null>(null);
  const [availability, setAvailability] = useState<EmailAvailability>('idle');
  const [sendingCode, setSendingCode] = useState(false);
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [code, setCode] = useState('');
  const codeValue = useRef('');
  const verifiedProof = useRef<{ email: string; code: string } | null>(null);
  const sentEmail = useRef<string | null>(null);
  const [verified, setVerified] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [verificationExpiresAt, setVerificationExpiresAt] = useState(0);
  const [emailFeedback, setEmailFeedback] = useState<AuthRegistrationEmailCheck | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const cooldown = useVerificationCooldown();
  useEffect(
    () => () => {
      emailPending.current?.abort();
      sendingPending.current?.abort();
      verifyPending.current?.abort();
    },
    [],
  );
  useEffect(() => {
    if (!verificationExpiresAt) return;
    const timer = window.setTimeout(
      () => {
        verifiedProof.current = null;
        sentEmail.current = null;
        setVerified(false);
        setCodeError('auth.verificationExpired');
      },
      Math.max(0, verificationExpiresAt - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [verificationExpiresAt]);

  const abortRegistration = () => {
    emailPending.current?.abort();
    emailPending.current = undefined;
    sendingPending.current?.abort();
    sendingPending.current = undefined;
    verifyPending.current?.abort();
    verifyPending.current = undefined;
    emailCheck.current = { email: '', status: 'idle' };
    verificationCheck.current = null;
    verifiedProof.current = null;
    sentEmail.current = null;
    codeValue.current = '';
    setAvailability('idle');
    setEmailFeedback(null);
    setSendingCode(false);
    setVerifyingCode(false);
    setVerified(false);
    setCode('');
    setCodeError(null);
    setVerificationExpiresAt(0);
    setWarning(null);
  };

  const markDuplicateEmail = (value: string) => {
    emailCheck.current = { email: value, status: 'duplicate' };
    setAvailability('duplicate');
    setEmailFeedback('emailExists');
    verifiedProof.current = null;
    setVerified(false);
  };

  const registrationWarning = () => {
    const result = emailCheck.current;
    if (result.email !== getEmail() || result.status === 'idle') return 'auth.emailCheckRequired';
    if (result.status === 'duplicate') return 'auth.emailExists';
    if (result.status === 'checking') return 'auth.emailChecking';
    if (result.status === 'error')
      return onCheckEmail ? 'auth.emailCheckFailed' : 'auth.serviceUnavailable';
    return null;
  };

  const checkEmailAvailability = async () => {
    const value = getEmail();
    if (!value) return;
    const previous = emailCheck.current;
    if (previous.email === value && previous.status === 'checking') {
      setEmailFeedback('emailChecking');
      return previous.promise;
    }
    if (previous.email === value && previous.status === 'available') return true;
    if (previous.email === value && previous.status === 'duplicate') {
      markDuplicateEmail(value);
      return false;
    }
    if (!onCheckEmail) {
      emailCheck.current = { email: value, status: 'error' };
      setAvailability('error');
      setEmailFeedback('emailCheckFailed');
      return false;
    }
    emailPending.current?.abort();
    const controller = new AbortController();
    emailPending.current = controller;
    emailCheck.current = { email: value, status: 'checking' };
    setAvailability('checking');
    setEmailFeedback('emailChecking');
    const promise = (async () => {
      try {
        const result = await onCheckEmail({ email: value, signal: controller.signal });
        if (
          controller.signal.aborted ||
          emailPending.current !== controller ||
          getEmail() !== value
        )
          return false;
        if (result.email !== value) throw new ApiError('contract');
        if (!result.available) {
          markDuplicateEmail(value);
          return false;
        }
        emailCheck.current = { email: value, status: 'available' };
        setAvailability('available');
        setEmailFeedback('valid');
        return true;
      } catch (error) {
        if (
          controller.signal.aborted ||
          emailPending.current !== controller ||
          isNotificationCancellation(error)
        )
          return false;
        emailCheck.current = { email: value, status: 'error' };
        setAvailability('error');
        setEmailFeedback('emailCheckFailed');
        return false;
      } finally {
        if (emailPending.current === controller) emailPending.current = undefined;
      }
    })();
    emailCheck.current.promise = promise;
    return promise;
  };

  const sendVerificationCode = async () => {
    if (sendingPending.current || isSubmitting()) return;
    if (!onSendCode) {
      setWarning('auth.serviceUnavailable');
      return;
    }
    const blocked = registrationWarning();
    if (blocked) {
      setWarning(blocked);
      return;
    }
    if (cooldown.remaining > 0) {
      setWarning('auth.codeRequestTooFrequent');
      return;
    }
    const value = getEmail()!;
    const controller = new AbortController();
    sendingPending.current = controller;
    verifyPending.current?.abort();
    verifyPending.current = undefined;
    verificationCheck.current = null;
    setVerifyingCode(false);
    setSendingCode(true);
    try {
      const result = await onSendCode({ email: value, signal: controller.signal });
      if (
        controller.signal.aborted ||
        sendingPending.current !== controller ||
        getEmail() !== value
      )
        return;
      cooldown.start(result.retry_after);
      sentEmail.current = value;
      verifiedProof.current = null;
      codeValue.current = '';
      setCode('');
      setVerified(false);
      setCodeError(null);
      setVerificationExpiresAt(Date.now() + result.expires_in * 1000);
      notify({
        kind: 'success',
        icon: 'send',
        message: `${t('auth.verificationCodeSent')} ${t('auth.verificationCodeValidity')}`,
      });
    } catch (error) {
      if (
        controller.signal.aborted ||
        sendingPending.current !== controller ||
        isNotificationCancellation(error)
      )
        return;
      const failure = authFailure(error);
      if (failure.message === 'auth.emailExists') markDuplicateEmail(value);
      setWarning(failure.message);
    } finally {
      if (sendingPending.current === controller) {
        sendingPending.current = undefined;
        setSendingCode(false);
      }
    }
  };

  const verifyCode = async (parentSignal?: AbortSignal): Promise<boolean> => {
    const value = getEmail();
    const enteredCode = codeValue.current;
    if (!value || !/^[0-9]{3}$/.test(enteredCode)) {
      setCodeError('auth.verificationCodeInvalid');
      return false;
    }
    if (verificationExpiresAt && verificationExpiresAt <= Date.now()) {
      verifiedProof.current = null;
      setVerified(false);
      setCodeError('auth.verificationExpired');
      return false;
    }
    if (verifiedProof.current?.email === value && verifiedProof.current.code === enteredCode)
      return true;
    if (!onVerifyEmail) {
      setCodeError('auth.serviceUnavailable');
      return false;
    }
    if (sentEmail.current !== value || registrationWarning()) {
      setCodeError('auth.verificationRequired');
      return false;
    }
    if (verificationExpiresAt <= Date.now()) {
      setCodeError('auth.verificationExpired');
      return false;
    }
    const previous = verificationCheck.current;
    if (previous?.email === value && previous.code === enteredCode) return previous.promise;
    verifyPending.current?.abort();
    const controller = new AbortController();
    verifyPending.current = controller;
    const signal = parentSignal
      ? AbortSignal.any([parentSignal, controller.signal])
      : controller.signal;
    setVerifyingCode(true);
    setCodeError(null);
    const promise = (async () => {
      try {
        const result = await onVerifyEmail({ email: value, code: enteredCode, signal });
        if (
          signal.aborted ||
          verifyPending.current !== controller ||
          getEmail() !== value ||
          codeValue.current !== enteredCode
        )
          return false;
        if (result.email !== value || !result.verified) throw new ApiError('contract');
        if (verificationExpiresAt <= Date.now()) {
          setCodeError('auth.verificationExpired');
          return false;
        }
        verifiedProof.current = { email: value, code: enteredCode };
        setVerified(true);
        return true;
      } catch (error) {
        if (
          signal.aborted ||
          verifyPending.current !== controller ||
          isNotificationCancellation(error)
        )
          return false;
        verifiedProof.current = null;
        setVerified(false);
        setCodeError(authFailure(error).message);
        return false;
      } finally {
        if (verifyPending.current === controller) {
          verifyPending.current = undefined;
          // Keep this attempt until input changes so blur does not spend a second server attempt.
          setVerifyingCode(false);
        }
      }
    })();
    verificationCheck.current = { email: value, code: enteredCode, promise };
    return promise;
  };

  const editCode = (value: string) => {
    verifyPending.current?.abort();
    verifyPending.current = undefined;
    verificationCheck.current = null;
    verifiedProof.current = null;
    codeValue.current = value;
    setCode(value);
    setVerified(false);
    setVerifyingCode(false);
    setCodeError(null);
    if (/^[0-9]{3}$/.test(value)) void verifyCode();
  };

  const completeVerification = () => {
    verifiedProof.current = null;
    verificationCheck.current = null;
    sentEmail.current = null;
    codeValue.current = '';
    setCode('');
    setVerified(false);
    setCodeError(null);
    setVerificationExpiresAt(0);
  };

  const rejectVerification = (message: string) => {
    verifiedProof.current = null;
    verificationCheck.current = null;
    sentEmail.current = null;
    setVerified(false);
    setCodeError(message);
  };

  return {
    availability,
    emailFeedback,
    sendingCode,
    verifyingCode,
    code,
    verified,
    codeError,
    remaining: cooldown.remaining,
    warning,
    setWarning,
    abortRegistration,
    markDuplicateEmail,
    registrationWarning,
    checkEmailAvailability,
    sendVerificationCode,
    verifyCode,
    editCode,
    completeVerification,
    rejectVerification,
    isSendingCode: () => Boolean(sendingPending.current),
    verifyOnBlur: () => {
      if (codeValue.current) void verifyCode();
    },
  };
}
