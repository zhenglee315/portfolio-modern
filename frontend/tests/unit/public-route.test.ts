import { describe, expect, it } from 'vitest';
import { publicPortfolioRoute } from '@/routes/public-route';

describe('public portfolio URL selection', () => {
  it('keeps the default, public handle and query ID as distinct Site lookups', () => {
    expect(publicPortfolioRoute({ locale: 'en' }, 'https://example.test/en?source=link')).toEqual({
      locale: 'en',
      selector: {},
    });
    expect(
      publicPortfolioRoute({ locale: 'en', user: 'sam' }, 'https://example.test/en/sam'),
    ).toEqual({
      locale: 'en',
      selector: { user: 'sam' },
    });
    expect(
      publicPortfolioRoute({ locale: 'zh-Hant' }, 'https://example.test/zh-Hant?site_id=2'),
    ).toEqual({
      locale: 'zh-Hant',
      selector: { site_id: 2 },
    });
  });

  it.each(['', '0', '-1', '1.5', 'abc', '2147483648', '9007199254740993'])(
    'rejects invalid site_id=%s before any default read',
    (id) => {
      let failure: unknown;
      try {
        publicPortfolioRoute({ locale: 'en' }, `https://example.test/en?site_id=${id}`);
      } catch (error) {
        failure = error;
      }
      expect(failure).toMatchObject({ init: { status: 404 } });
    },
  );

  it('rejects conflicting handles and repeated ID selectors instead of choosing another portfolio', () => {
    for (const [params, url] of [
      [{ locale: 'en', user: 'sam' }, 'https://example.test/en/sam?site_id=2'],
      [{ locale: 'en' }, 'https://example.test/en?site_id=1&site_id=2'],
    ] as const) {
      let failure: unknown;
      try {
        publicPortfolioRoute(params, url);
      } catch (error) {
        failure = error;
      }
      expect(failure).toMatchObject({ init: { status: 404 } });
    }
  });
});
