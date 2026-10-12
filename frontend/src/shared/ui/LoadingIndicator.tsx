import { useId } from 'react';
import styles from './LoadingIndicator.module.css';

export type LoadingIndicatorProps = {
  label: string;
  size?: number;
  className?: string;
};

/** Show a themed waiting state without owning requests, timers or localized copy.
 * @param label Localized loading message announced once and displayed inside the ring.
 * @param size Preferred square size in pixels; the graphic also fits its containing panel.
 * @param className Optional layout class supplied by the owning screen or component.
 */
export function LoadingIndicator({ label, size = 112, className }: LoadingIndicatorProps) {
  const gradientId = `loading-beam-${useId()}`;
  const width = Number.isFinite(size) && size > 0 ? size : 112;
  const compactLabel = Array.from(label).length > 10;

  return (
    <div
      className={[styles.root, className].filter(Boolean).join(' ')}
      style={{ width }}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <span className="visually-hidden">{label}</span>
      <svg
        className={styles.graphic}
        viewBox="0 0 112 112"
        aria-hidden="true"
        focusable="false"
        data-decoration=""
      >
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="var(--accent)" />
            <stop offset="1" stopColor="var(--glow-bright)" />
          </linearGradient>
        </defs>
        <g className={styles.bars}>
          {Array.from({ length: 12 }, (_, index) => (
            <g key={index} className={styles.bar} transform={`rotate(${index * 30} 56 56)`}>
              <rect className={styles.track} x="53.5" y="8" width="5" height="14" rx="2.5" />
              <rect
                className={styles.beam}
                x="53.5"
                y="8"
                width="5"
                height="14"
                rx="2.5"
                fill={`url(#${gradientId})`}
                style={{ animationDelay: `${index * 0.1 - 1.2}s` }}
              />
            </g>
          ))}
        </g>
        <text
          className={styles.label}
          x="56"
          y="56"
          textAnchor="middle"
          dominantBaseline="middle"
          textLength={compactLabel ? 65 : undefined}
          lengthAdjust={compactLabel ? 'spacingAndGlyphs' : undefined}
        >
          {label}
        </text>
        <g>
          {Array.from({ length: 3 }, (_, index) => (
            <circle
              key={index}
              className={styles.dot}
              cx={48 + index * 8}
              cy="69"
              r="2"
              style={{ animationDelay: `${index * 0.16 - 1.44}s` }}
            />
          ))}
        </g>
      </svg>
    </div>
  );
}
