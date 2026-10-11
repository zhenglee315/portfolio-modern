import type { ComponentProps } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@/shared/api/http';
import {
  checkRegistrationEmail,
  register,
  sendRegistrationCode,
  signIn,
  verifyRegistrationEmail,
} from '../api/auth';
import { rememberAuthSession, type AuthUser } from '../session';
import { AuthPanel, type AuthRequest } from './AuthPanel';

/** Adapt native form fields without retaining passwords in React state or browser storage. */
async function authenticate({ mode, fields, signal }: AuthRequest): Promise<AuthUser> {
  const email = fields.get('email');
  const password = fields.get('password');
  if (typeof email !== 'string' || typeof password !== 'string') throw new ApiError('http', 422);
  return (mode === 'login' ? signIn : register)({ email, password }, signal);
}

/** Inject real session-aware transports while keeping the form independently reusable. */
export function ConnectedAuthPanel(
  props: Omit<
    ComponentProps<typeof AuthPanel>,
    'onAuthenticate' | 'onCheckEmail' | 'onSendCode' | 'onVerifyEmail'
  >,
) {
  const client = useQueryClient();
  const authenticateAndRemember = async (request: AuthRequest): Promise<void> => {
    const user = await authenticate(request);
    await rememberAuthSession(client, user, request.signal);
  };
  return (
    <AuthPanel
      {...props}
      onAuthenticate={authenticateAndRemember}
      onCheckEmail={({ email, signal }) => checkRegistrationEmail(email, signal)}
      onSendCode={({ email, signal }) => sendRegistrationCode({ email }, signal)}
      onVerifyEmail={({ email, code, signal }) => verifyRegistrationEmail({ email, code }, signal)}
    />
  );
}
