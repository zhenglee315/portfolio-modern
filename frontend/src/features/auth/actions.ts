import { useNotifications } from '@/shared/ui/NotificationProvider';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { authFailure, useAuthSession, useAuthSignOut } from './session';

/** Share session suspension and logout feedback; the owner supplies its successful destination. */
export function useAccountSession(onSignedOut?: () => void) {
  const { t } = useTranslation();
  const { notify } = useNotifications();
  const signOut = useAuthSignOut();
  const session = useAuthSession({ enabled: !signOut.isPending });
  const logout = () => {
    if (signOut.isPending) return;
    signOut.mutate(undefined, {
      onSuccess: () => {
        notify({ kind: 'success', message: t('auth.signedOut') });
        onSignedOut?.();
      },
      onError: (error) => {
        const failure = authFailure(error);
        notify({ kind: failure.kind, message: t(failure.message) });
      },
    });
  };
  return { session, signOut, logout };
}

/** One permission warning/replace lifecycle is reused for entry checks and later revocations. */
export function useAccessDeniedRedirect({
  denied,
  destination,
  enabled = true,
}: {
  denied: boolean;
  destination: string;
  enabled?: boolean;
}) {
  const { t } = useTranslation();
  const { notify } = useNotifications();
  const navigate = useNavigate();
  useEffect(() => {
    if (!denied || !enabled) return;
    notify({
      kind: 'warning',
      message: t('accessDenied.description'),
      id: 'management-access-denied',
    });
    void navigate(destination, { replace: true });
  }, [denied, destination, enabled, navigate, notify, t]);
}
