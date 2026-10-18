import { useId, useState } from 'react';
import { useMediaQuery } from '@/shared/hooks/useMediaQuery';
import { overviewNumber } from './overview-model';
import styles from './MonitorOverview.module.css';

export type MonitorChartPoint = { date: string; value: number | null; complete?: boolean };

/** Draw measured daily observations with gaps for unknown samples and keyboard-readable points.
 * The same path model supplies compact KPI sparklines and the daily request chart.
 * @author ZhengLee 2026.10.18
 */
export function MonitorChart({
  points,
  label,
  locale,
  compact = false,
  empty,
}: {
  points: MonitorChartPoint[];
  label: string;
  locale: string;
  compact?: boolean;
  empty: string;
}) {
  const id = useId();
  const narrow = useMediaQuery('(max-width: 760px)');
  const [selected, setSelected] = useState<number>();
  const width = compact ? 90 : narrow ? 320 : 580,
    height = compact ? 42 : 185;
  const left = compact ? 2 : 42,
    right = compact ? 2 : 18,
    top = compact ? 4 : 22,
    bottom = compact ? 4 : 35;
  const known = points.flatMap((point) => (point.value == null ? [] : [point.value]));
  const highest = Math.max(0, ...known);
  const lowest = known.length ? Math.min(...known) : 0;
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(1, highest)));
  const spread = highest - lowest || Math.max(1, highest * 0.1);
  const min = compact ? lowest - spread * 0.1 : 0;
  const max = compact
    ? highest + spread * 0.1
    : Math.max(1, Math.ceil(highest / magnitude) * magnitude);
  const position = (point: MonitorChartPoint, index: number) => ({
    x: left + (index / Math.max(1, points.length - 1)) * (width - left - right),
    y: top + (1 - ((point.value ?? 0) - min) / (max - min)) * (height - top - bottom),
  });
  const segments: string[][] = [];
  points.forEach((point, index) => {
    if (point.value == null) {
      if (segments.at(-1)?.length) segments.push([]);
      return;
    }
    if (!segments.length) segments.push([]);
    const p = position(point, index);
    segments.at(-1)!.push(`${p.x},${p.y}`);
  });
  const dateLabel = (date: string) =>
    new Intl.DateTimeFormat(locale, { timeZone: 'UTC', month: '2-digit', day: '2-digit' }).format(
      new Date(`${date}T00:00:00Z`),
    );
  if (!known.length)
    return compact ? null : (
      <div className={styles.chartEmpty} role="status">
        {empty}
      </div>
    );
  return (
    <svg
      className={compact ? styles.sparkline : styles.chart}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={label}
    >
      <title>{label}</title>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.17" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      {!compact &&
        [0, 0.5, 1].map((ratio) => {
          const y = top + ratio * (height - top - bottom);
          return (
            <g key={ratio} className={styles.chartAxis}>
              <line x1={left} x2={width - right} y1={y} y2={y} />
              <text x={left - 8} y={y + 4} textAnchor="end">
                {overviewNumber(max * (1 - ratio), locale)}
              </text>
            </g>
          );
        })}
      {segments
        .filter((segment) => segment.length)
        .map((segment, index) => (
          <g key={index}>
            {!compact && segment.length > 1 && (
              <path
                d={`M${segment[0]!.split(',')[0]},${height - bottom} L${segment.join(' L')} L${segment.at(-1)!.split(',')[0]},${height - bottom} Z`}
                fill={`url(#${id})`}
              />
            )}
            <path
              d={`M${segment.join(' L')}`}
              fill="none"
              stroke="currentColor"
              strokeWidth={compact ? 1.3 : 2}
              strokeLinejoin="round"
            />
          </g>
        ))}
      {!compact &&
        points.map((point, index) => {
          const p = position(point, index),
            showLabel =
              points.length <= 10 ||
              index % Math.ceil(points.length / 7) === 0 ||
              index === points.length - 1;
          return (
            <g key={point.date}>
              {showLabel && (
                <text className={styles.chartDate} x={p.x} y={height - 10} textAnchor="middle">
                  {dateLabel(point.date)}
                </text>
              )}
              {point.value != null && (
                <g
                  onPointerEnter={() => setSelected(index)}
                  onPointerLeave={() => setSelected(undefined)}
                >
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r="10"
                    fill="transparent"
                    tabIndex={0}
                    onFocus={() => setSelected(index)}
                    onBlur={() => setSelected(undefined)}
                    aria-label={`${point.date}: ${overviewNumber(point.value, locale)}`}
                  />
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={selected === index ? 4 : 2.5}
                    className={point.complete === false ? styles.partialPoint : undefined}
                    fill="var(--panel)"
                    stroke="currentColor"
                    pointerEvents="none"
                  />
                  {(points.length <= 7 || selected === index) && (
                    <text
                      className={styles.chartValue}
                      x={p.x}
                      y={Math.max(12, p.y - 10)}
                      textAnchor="middle"
                      pointerEvents="none"
                    >
                      {overviewNumber(point.value, locale)}
                    </text>
                  )}
                </g>
              )}
            </g>
          );
        })}
    </svg>
  );
}
