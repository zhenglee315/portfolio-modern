import type { ReactNode } from 'react';
import type { AuthRegistrationActions } from '../hooks/useAuthRegistration';
export type AuthRequest = { mode: 'login' | 'register'; fields: FormData; signal: AbortSignal };
export type { AuthEmailRequest, AuthVerifyRequest } from '../hooks/useAuthRegistration';
export type AuthField = 'email' | 'password' | 'confirmation';
export type FieldCheck =
  | 'valid'
  | 'fieldRequired'
  | 'emailInvalid'
  | 'emailExists'
  | 'emailChecking'
  | 'emailCheckFailed'
  | 'passwordTooShort'
  | 'passwordMismatchShort'
  | null;

export type AuthPanelProps = {
  initialFocus?: boolean;
  animationActive?: boolean;
  onBack: () => void;
  controls?: ReactNode;
  onAuthenticate?: (request: AuthRequest) => Promise<void>;
  onSuccess?: () => void;
} & AuthRegistrationActions;
