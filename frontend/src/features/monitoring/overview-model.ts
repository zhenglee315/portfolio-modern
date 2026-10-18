import type { OverviewFilters } from './overview-api';

export const overviewTimezone = 'Asia/Taipei';
const dayMs = 86_400_000;

/** Resolve calendar controls in the declared monitoring timezone, independent of the browser.
 * @author ZhengLee 2026.10.18
 */
export function localDate(now = Date.now(), timezone = overviewTimezone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}
export function shiftDate(date: string, days: number) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * dayMs).toISOString().slice(0, 10);
}
export function presetPeriod(days = 7, today = localDate()) {
  // Overview includes the active day so minute-by-minute observations are visible immediately.
  const end = today;
  return { start: shiftDate(end, 1 - days), end };
}
export function validPeriod(start: string, end: string, today = localDate()) {
  if (
    ![start, end].every(
      (value) =>
        /^\d{4}-\d{2}-\d{2}$/.test(value) &&
        Number.isFinite(Date.parse(`${value}T00:00:00Z`)) &&
        new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value,
    )
  )
    return false;
  const days = (Date.parse(end) - Date.parse(start)) / dayMs + 1;
  const previousStart = Date.parse(start) - days * dayMs;
  return days >= 1 && days <= 93 && end <= today && previousStart >= Date.parse('0001-01-01');
}
export function readOverviewFilters(
  params: URLSearchParams,
  serviceId = '',
  today = localDate(),
): OverviewFilters {
  const preset = presetPeriod(Number(params.get('days')) === 30 ? 30 : 7, today);
  return {
    start: params.get('start') ?? preset.start,
    end: params.get('end') ?? preset.end,
    timezone: overviewTimezone,
    service_id: serviceId,
  };
}
export function overviewTime(
  value: string | number | null | undefined,
  locale: string,
  timezone = overviewTimezone,
) {
  if (value == null || !Number.isFinite(new Date(value).getTime())) return '—';
  return new Intl.DateTimeFormat(locale, {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(value));
}
export function overviewNumber(value: number | null | undefined, locale: string, digits = 0) {
  return value == null
    ? '—'
    : new Intl.NumberFormat(locale, {
        maximumFractionDigits: digits,
        minimumFractionDigits: digits,
      }).format(value);
}
export function countryName(code: string, locale: string) {
  return new Intl.DisplayNames([locale], { type: 'region' }).of(code) ?? code;
}
