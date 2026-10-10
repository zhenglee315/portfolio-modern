import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Icon, type IconName } from './Icon';
import styles from './NotificationProvider.module.css';

export type NotificationKind = 'success' | 'warning' | 'error' | 'bug';
export type NotificationInput = { kind: NotificationKind; message?: string; id?: string };
export type NotificationCopy = {
  close: string;
  labels: Record<NotificationKind, string>;
  defaults: Record<NotificationKind, string>;
};
type NotificationActions = { notify: (input: NotificationInput) => void; dismiss: () => void };
type ActiveNotification = NotificationInput & { sequence: number };
export const notificationDurationMs = 3_000;
export const NotificationContext = createContext<NotificationActions | undefined>(undefined);
const icons: Record<NotificationKind, IconName> = {
  success: 'success',
  warning: 'warning',
  error: 'error',
  bug: 'bug',
};

/**
 * Own one viewport notification for the application; consumers inject localized copy.
 * New messages replace the current one and get three seconds; identical IDs do not extend it.
 * Timer cleanup prevents an older message from dismissing a newer one or surviving unmount.
 * The live region stays mounted, never moves focus, and only its close button intercepts clicks.
 */
export function NotificationProvider({
  children,
  copy,
}: {
  children: ReactNode;
  copy: NotificationCopy;
}) {
  const [active, setActive] = useState<ActiveNotification | null>(null);
  const sequence = useRef(0);
  const notify = useCallback((input: NotificationInput) => {
    const next = { ...input, sequence: ++sequence.current };
    setActive((previous) =>
      input.id &&
      previous?.id === input.id &&
      previous.kind === input.kind &&
      previous.message === input.message
        ? previous
        : next,
    );
  }, []);
  const dismiss = useCallback(() => setActive(null), []);
  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => {
      setActive((current) => (current?.sequence === active.sequence ? null : current));
    }, notificationDurationMs);
    return () => clearTimeout(timer);
  }, [active]);
  const value = useMemo(() => ({ notify, dismiss }), [notify, dismiss]);

  return (
    <NotificationContext.Provider value={value}>
      {children}
      <div className={styles.viewport} role="status" aria-live="polite" aria-atomic="true">
        {active && (
          <div key={active.sequence} className={styles.toast} data-notification-kind={active.kind}>
            <Icon name={icons[active.kind]} className={styles.statusIcon} />
            <div className={styles.copy}>
              <strong>{copy.labels[active.kind]}</strong>
              <p>{active.message ?? copy.defaults[active.kind]}</p>
            </div>
            <button
              type="button"
              className={styles.close}
              onClick={dismiss}
              aria-label={copy.close}
            >
              <Icon name="close" />
            </button>
          </div>
        )}
      </div>
    </NotificationContext.Provider>
  );
}

/** Publish a nonblocking message through the single application-owned notification host. */
export function useNotifications() {
  const value = useContext(NotificationContext);
  if (!value) throw new Error('Notification provider is required.');
  return value;
}
