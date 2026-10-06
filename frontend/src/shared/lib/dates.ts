type Period = {
  startMonth: string;
  endMonth: string | null;
  endDay?: number | null;
  expected?: boolean | null;
};
export type DateCopy = { present: string; expected: string; month: string; months: string };

/** Convert a validated calendar month to an inclusive comparison index. */
export function monthIndex(value: string) {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(value);
  if (!match) throw new Error('Invalid calendar month.');
  return Number(match[1]) * 12 + Number(match[2]) - 1;
}

/** Format a month in UTC, including years 0000–0099 without Date.UTC remapping. */
export function monthLabel(value: string, locale: string) {
  const index = monthIndex(value);
  const date = new Date(0);
  date.setUTCFullYear(Math.floor(index / 12), index % 12, 1);
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : locale, {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

/** Return inclusive months; invalid reverse periods remain explicit errors. */
export function monthDuration(start: string, end: string) {
  const count = monthIndex(end) - monthIndex(start) + 1;
  if (count < 1) throw new Error('Period ends before it starts.');
  return count;
}

/** Share localized date and compact year labels across cards, map and dialogs. */
export function periodLabels(period: Period, locale: string, copy: DateCopy) {
  const start = monthLabel(period.startMonth, locale);
  const end = period.endMonth ? monthLabel(period.endMonth, locale) : copy.present;
  const datedEnd = period.endDay
    ? locale === 'en'
      ? `${period.endDay} ${end}`
      : `${end}${period.endDay}日`
    : end;
  const startYear = period.startMonth.slice(0, 4),
    endYear = period.endMonth?.slice(0, 4);
  return {
    date: `${start} — ${datedEnd}${period.expected ? copy.expected : ''}`,
    year:
      startYear === endYear
        ? `${locale === 'en' ? start.split(' ')[0] : start}–${end}`
        : `${startYear}–${endYear ?? copy.present}`,
  };
}

/** Append the original inclusive duration only for projects with a known end. */
export function projectPeriod(period: Period, locale: string, copy: DateCopy) {
  const label = periodLabels(period, locale, copy).date;
  if (!period.endMonth) return label;
  const count = monthDuration(period.startMonth, period.endMonth);
  return `${label} (${count} ${count === 1 ? copy.month : copy.months})`;
}

/** Produce a deterministic UTC month for SSG/client summary handoff. */
export function currentMonthUTC(now = new Date()) {
  return `${now.getUTCFullYear().toString().padStart(4, '0')}-${(now.getUTCMonth() + 1).toString().padStart(2, '0')}`;
}

/** Derive the complete career span without depending on paginated experience records.
 * @param entries Complete Journey in any order; education is part of the displayed span.
 * @param nowMonth Explicit clock shared by SSG and hydration for ongoing entries.
 * @returns Inclusive year bounds, or no summary when the collection is empty.
 */
export function careerYearRange(entries: Period[], nowMonth: string) {
  if (!entries.length) return undefined;
  const indices = entries.flatMap((entry) => [
    monthIndex(entry.startMonth),
    monthIndex(entry.endMonth ?? nowMonth),
  ]);
  const year = (index: number) =>
    Math.floor(index / 12)
      .toString()
      .padStart(4, '0');
  return `${year(Math.min(...indices))} — ${year(Math.max(...indices))}`;
}

/** Count the union of inclusive work intervals, excluding education and gaps.
 * @param entries Complete Journey, never the first experience page.
 * @param nowMonth Explicit UTC clock for ongoing entries. Expected intervals retain legacy policy.
 * @returns Total months and year/month display units, without per-month allocations.
 */
export function workDuration(entries: (Period & { type: string })[], nowMonth: string) {
  const intervals = entries
    .filter((entry) => entry.type === 'work')
    .map((entry) => {
      const start = monthIndex(entry.startMonth),
        end = monthIndex(entry.endMonth ?? nowMonth);
      if (end < start) throw new Error('Ongoing period has not started.');
      return { start, end };
    })
    .sort((a, b) => a.start - b.start);
  let totalMonths = 0,
    lastEnd = -1;
  for (const interval of intervals) {
    totalMonths += Math.max(0, interval.end - Math.max(interval.start, lastEnd + 1) + 1);
    lastEnd = Math.max(lastEnd, interval.end);
  }
  return { totalMonths, years: Math.floor(totalMonths / 12), months: totalMonths % 12 };
}
