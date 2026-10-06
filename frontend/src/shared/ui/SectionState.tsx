import type { ReactNode } from 'react';

type SectionStateProps = {
  message: string;
  retryLabel?: string;
  busy?: boolean;
  onRetry?: () => void;
  children?: ReactNode;
};

/** Present loading, empty, initial failure or stale-data notices with injected copy.
 * @param props Safe localized message and optional bounded recovery callback.
 */
export function SectionState({
  message,
  retryLabel,
  busy = false,
  onRetry,
  children,
}: SectionStateProps) {
  return (
    <div className="section-state" role={onRetry ? 'alert' : 'status'} aria-busy={busy}>
      <p>{message}</p>
      {onRetry && (
        <button type="button" className="text-link" onClick={onRetry} disabled={busy}>
          {retryLabel}
        </button>
      )}
      {children}
    </div>
  );
}
