/** Accept ISO instants or epoch milliseconds; callers convert seconds explicitly. */
type Timestamp = string | number | null | undefined;

function instant(value: Timestamp) {
  if (value == null) return undefined;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : undefined;
}

/** Stable UTC calendar text for management tables, independent of the browser timezone. */
export function formatUtcTimestamp(value: Timestamp) {
  return instant(value)?.toISOString().slice(0, 19).replaceAll('-', '.').replace('T', ' ') ?? '—';
}

/** Localize clock punctuation while keeping every monitoring instant explicitly in UTC. */
export function formatUtcClock(value: Timestamp, locale: string, full = false) {
  const date = instant(value);
  if (!date) return '—';
  return `${new Intl.DateTimeFormat(locale, {
    ...(full ? { year: 'numeric', month: '2-digit', day: '2-digit' } : {}),
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
    hourCycle: 'h23',
    timeZone: 'UTC',
  }).format(date)} UTC`;
}
