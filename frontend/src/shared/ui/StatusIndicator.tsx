import styles from './StatusIndicator.module.css';

/** Accessible live-presence icon; null means the source is unavailable. @author ZhengLee 2026.10.16 */
export function StatusIndicator({
  value,
  copy,
}: {
  value: boolean | null;
  copy: { online: string; offline: string; unknown: string };
}) {
  const state = value === null ? 'unknown' : value ? 'online' : 'offline';
  return (
    <span
      role="img"
      aria-label={copy[state]}
      title={copy[state]}
      className={styles.status}
      data-status={state}
    >
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
        <circle
          cx="8"
          cy="8"
          r="6"
          fill={value === null ? 'none' : 'currentColor'}
          stroke="currentColor"
          strokeWidth="2"
        />
      </svg>
    </span>
  );
}
