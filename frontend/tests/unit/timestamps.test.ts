import { describe, expect, it } from 'vitest';
import { formatUtcClock, formatUtcTimestamp } from '@/shared/lib/timestamps';

describe('UTC display policy', () => {
  it.each(['en', 'zh-Hant', 'zh-Hans'])('keeps %s clocks in UTC across offset inputs', (locale) => {
    const value = '2026-10-17T20:04:05.123+08:00';
    expect(formatUtcTimestamp(value)).toBe('2026.10.17 12:04:05');
    expect(formatUtcClock(value, locale)).toBe(formatUtcClock(Date.parse(value), locale));
    expect(formatUtcClock(value, locale)).toMatch(/12:04:05\.123 UTC$/);
    expect(formatUtcClock(value, locale, true)).toContain('2026');
  });
  it.each([null, undefined, '', 'invalid', NaN, Infinity])(
    'renders unavailable %s without throwing',
    (value) => {
      expect(formatUtcTimestamp(value)).toBe('—');
      expect(formatUtcClock(value, 'en')).toBe('—');
    },
  );
  it('preserves epoch zero and uses a 00–23 clock', () => {
    expect(formatUtcTimestamp(0)).toBe('1970.01.01 00:00:00');
    expect(formatUtcClock(0, 'en')).toBe('00:00:00.000 UTC');
  });
});
