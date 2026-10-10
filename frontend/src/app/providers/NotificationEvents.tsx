import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useEffectEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { isNotificationCancellation, notificationFailure } from '@/i18n/notification-copy';
import { useNotifications } from '@/shared/ui/NotificationProvider';

type Failure = ReturnType<typeof notificationFailure>;

/** Browser-only integration: final query failures, connection changes and uncaught bugs. */
export function NotificationEvents() {
  const queryClient = useQueryClient();
  const { notify } = useNotifications();
  const { t } = useTranslation();
  const report = useEffectEvent((failure: Failure, id: string) => {
    notify({ kind: failure.kind, message: t(failure.message), id });
  });
  const restored = useEffectEvent(() => {
    notify({ kind: 'success', message: t('notifications.connectionRestored'), id: 'connection' });
  });
  const reportOffline = useEffectEvent(() => {
    notify({ kind: 'warning', message: t('notifications.offline'), id: 'connection' });
  });

  useEffect(() => {
    const failures = new Map<string, Failure>();
    let offline = false;
    let offlineReported = false;

    const onOffline = () => {
      if (offline) return;
      offline = true;
      // A request can fail immediately before the browser announces the same outage.
      const alreadyReported = [...failures.values()].some((failure) => failure.kind === 'warning');
      if (!alreadyReported) reportOffline();
      offlineReported = true;
    };
    const onOnline = () => {
      if (!offline) return;
      offline = false;
      if (offlineReported) restored();
      offlineReported = false;
      // Resumed queries must not repeat the connection recovery announcement.
      for (const [hash, failure] of failures) {
        if (failure.kind === 'warning') failures.delete(hash);
      }
    };
    const onError = (event: ErrorEvent) => {
      if (!isNotificationCancellation(event.error)) {
        report(
          { kind: 'bug', message: 'notifications.unexpectedError' },
          'unhandled-browser-error',
        );
      }
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      if (!isNotificationCancellation(event.reason)) {
        report(
          { kind: 'bug', message: 'notifications.unexpectedError' },
          'unhandled-browser-error',
        );
      }
    };

    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      const hash = event.query.queryHash;
      if (event.type === 'removed') {
        failures.delete(hash);
        return;
      }
      if (event.type !== 'updated') return;
      if (event.action.type === 'error') {
        if (isNotificationCancellation(event.action.error) || failures.has(hash)) return;
        const failure = notificationFailure(event.action.error);
        // Browser connection changes already explain requests paused by an outage.
        if (offline && failure.kind === 'warning') return;
        failures.set(hash, failure);
        report(failure, `query:${hash}`);
      } else if (event.action.type === 'success' && !event.action.manual && failures.delete(hash)) {
        restored();
      }
    });
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    if (!navigator.onLine) onOffline();

    return () => {
      unsubscribe();
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, [queryClient]);

  return null;
}
