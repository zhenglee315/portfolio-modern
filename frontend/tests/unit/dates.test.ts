import { describe, expect, it } from 'vitest';
import {
  careerYearRange,
  monthDuration,
  monthLabel,
  periodLabels,
  workDuration,
} from '@/shared/lib/dates';

const copy = { present: 'Present', expected: ' (expected)', month: 'month', months: 'months' };
describe('career date policies', () => {
  it('derives the full career span independent of sorting and pagination', () => {
    expect(careerYearRange([], '2026-10')).toBeUndefined();
    expect(
      careerYearRange(
        [
          { startMonth: '2024-01', endMonth: null },
          { startMonth: '2012-09', endMonth: '2016-06' },
          { startMonth: '2027-01', endMonth: '2027-06', expected: true },
        ],
        '2026-10',
      ),
    ).toBe('2012 — 2027');
    expect(careerYearRange([{ startMonth: '0001-01', endMonth: '0099-12' }], '2026-10')).toBe(
      '0001 — 0099',
    );
    expect(() => careerYearRange([{ startMonth: '2024-99', endMonth: null }], '2026-10')).toThrow();
  });
  it('counts inclusive months without overlap, education or gaps', () => {
    const entries = [
      { type: 'work', startMonth: '2024-01', endMonth: '2024-03' },
      { type: 'work', startMonth: '2024-03', endMonth: '2024-05' },
      { type: 'education', startMonth: '2024-01', endMonth: '2024-12' },
      { type: 'work', startMonth: '2024-08', endMonth: null },
    ];
    expect(workDuration(entries, '2024-09')).toEqual({ totalMonths: 7, years: 0, months: 7 });
    expect(workDuration([], '2024-09').totalMonths).toBe(0);
    expect(monthDuration('2024-01', '2024-01')).toBe(1);
    expect(() => monthDuration('2024-03', '2024-01')).toThrow();
  });
  it('formats UTC dates and nullable exact days in both scripts', () => {
    expect(monthLabel('2024-01', 'en')).toBe('Jan 2024');
    expect(periodLabels({ startMonth: '2024-01', endMonth: null }, 'en', copy).date).toBe(
      'Jan 2024 — Present',
    );
    expect(
      periodLabels(
        { startMonth: '2024-01', endMonth: '2024-02', endDay: 29, expected: true },
        'en',
        copy,
      ).date,
    ).toBe('Jan 2024 — 29 Feb 2024 (expected)');
    expect(
      periodLabels({ startMonth: '2024-01', endMonth: '2024-02', endDay: 29 }, 'zh-Hant', copy)
        .date,
    ).toContain('29日');
  });
  it('retains expected fixed intervals and explicitly rejects future ongoing periods', () => {
    expect(
      workDuration(
        [{ type: 'work', startMonth: '2027-01', endMonth: '2027-03', expected: true }],
        '2026-10',
      ).totalMonths,
    ).toBe(3);
    expect(() =>
      workDuration([{ type: 'work', startMonth: '2027-01', endMonth: null }], '2026-10'),
    ).toThrow();
  });
});
