import { isCancelledError } from '@tanstack/react-query';
import { ApiError } from '@/shared/api/http';

type NotificationFailure = {
  kind: 'warning' | 'error' | 'bug';
  message:
    | 'notifications.connectionFailed'
    | 'notifications.requestFailed'
    | 'notifications.invalidResponse'
    | 'notifications.unexpectedError';
};

/** Intentional transport or query cancellation needs no request-failure notification. */
export function isNotificationCancellation(error: unknown) {
  return (
    isCancelledError(error) ||
    (typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError')
  );
}

/** Keep expected request rejections as warnings; red is reserved for system failures and bugs.
 * Network interruptions remain recoverable warnings; response details never become display copy.
 * @author ZhengLee 2026.10.16
 */
export function notificationFailure(error: unknown): NotificationFailure {
  if (error instanceof ApiError) {
    if (error.kind === 'network' || error.kind === 'timeout') {
      return { kind: 'warning', message: 'notifications.connectionFailed' };
    }
    if (error.kind === 'http') {
      return {
        kind: error.status && error.status >= 400 && error.status < 500 ? 'warning' : 'error',
        message: 'notifications.requestFailed',
      };
    }
    return { kind: 'bug', message: 'notifications.invalidResponse' };
  }
  return { kind: 'bug', message: 'notifications.unexpectedError' };
}
