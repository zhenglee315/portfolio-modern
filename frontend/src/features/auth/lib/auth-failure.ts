import { notificationFailure } from '@/i18n/notification-copy';
import { ApiError } from '@/shared/api/http';

/** Known account/input restrictions are warnings; shared policy owns unexpected system failures. */
export function authFailure(error: unknown) {
  if (error instanceof ApiError && error.kind === 'http') {
    if (error.code === 'INVALID_CREDENTIALS')
      return { kind: 'warning', message: 'auth.invalidCredentials' } as const;
    if (error.code === 'TOO_MANY_SIGN_IN_ATTEMPTS')
      return { kind: 'warning', message: 'auth.tooManyAttempts' } as const;
    if (error.code === 'EMAIL_ALREADY_EXISTS')
      return { kind: 'warning', message: 'auth.emailExists' } as const;
    if (error.code === 'INVALID_EMAIL')
      return { kind: 'warning', message: 'auth.emailInvalid' } as const;
    if (error.code === 'INVALID_VERIFICATION_CODE')
      return { kind: 'warning', message: 'auth.verificationCodeInvalid' } as const;
    if (error.code === 'EMAIL_VERIFICATION_REQUIRED')
      return { kind: 'warning', message: 'auth.verificationRequired' } as const;
    if (error.code === 'CODE_REQUEST_TOO_FREQUENT')
      return { kind: 'warning', message: 'auth.codeRequestTooFrequent' } as const;
    if (error.code === 'REGISTRATION_UNAVAILABLE')
      return { kind: 'warning', message: 'auth.registrationUnavailable' } as const;
    if (error.code === 'AUTH_NOT_AVAILABLE')
      return { kind: 'warning', message: 'auth.serviceUnavailable' } as const;
    if (error.status === 503)
      return { kind: 'warning', message: 'auth.temporarilyUnavailable' } as const;
    if (error.status === 422) return { kind: 'warning', message: 'auth.invalidInput' } as const;
  }
  return notificationFailure(error);
}
