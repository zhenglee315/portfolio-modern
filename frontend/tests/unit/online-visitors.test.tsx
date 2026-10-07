import { render, within } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createQueryClient } from '@/app/query-client';
import { createI18n, type Locale } from '@/i18n/config';
import {
  OnlineVisitors,
  onlineVisitorsQuery,
  onlineVisitorsSchema,
} from '@/features/online-visitors';

afterEach(() => vi.unstubAllGlobals());

describe('live online visitor contract', () => {
  it.each([-1, 1.5, '3', null, Number.MAX_SAFE_INTEGER + 1])(
    'rejects an invalid count %s rather than displaying a misleading zero',
    (online) => expect(onlineVisitorsSchema.safeParse({ online }).success).toBe(false),
  );

  it('reads the uncached endpoint and retains a valid zero after a malformed refresh', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ online: 0 }))
      .mockResolvedValueOnce(Response.json({ online: 'unknown' }));
    vi.stubGlobal('fetch', fetch);
    const client = createQueryClient();
    const query = { ...onlineVisitorsQuery(), retry: false };
    try {
      await expect(client.fetchQuery(query)).resolves.toEqual({ online: 0 });
      expect(fetch.mock.calls[0]?.[0]).toBe('/api/system/heartbeat');
      await expect(client.fetchQuery({ ...query, staleTime: 0 })).rejects.toMatchObject({
        kind: 'contract',
      });
      expect(client.getQueryData(query.queryKey)).toEqual({ online: 0 });
    } finally {
      client.clear();
    }
  });

  it.each([
    ['en', 'Online now: 0'],
    ['zh-Hans', '当前在线：0'],
    ['zh-Hant', '目前在線：0'],
  ] as const)(
    'localizes the accessible label for %s and renders zero as an integer',
    (locale, label) => {
      const view = render(
        <I18nextProvider i18n={createI18n(locale as Locale)}>
          <OnlineVisitors data={{ online: 0 }} failed={false} />
        </I18nextProvider>,
      );
      expect(within(view.container).getByRole('button', { name: label })).toHaveTextContent('0');
      expect(view.container.querySelector('.bi-person-hearts')).not.toBeNull();
    },
  );

  it('distinguishes loading, unavailable and stale values without discarding the last count', () => {
    const i18n = createI18n('en');
    const indicator = (data?: { online: number }, failed = false) => (
      <I18nextProvider i18n={i18n}>
        <OnlineVisitors data={data} failed={failed} />
      </I18nextProvider>
    );
    const view = render(indicator());
    expect(
      within(view.container).getByRole('button', { name: 'Loading online count…' }),
    ).toHaveTextContent('—');
    view.rerender(indicator(undefined, true));
    expect(
      within(view.container).getByRole('button', { name: 'Online count unavailable.' }),
    ).toHaveTextContent('—');
    view.rerender(indicator({ online: 7 }, true));
    expect(
      within(view.container).getByRole('button', { name: /Last known online count: 7/ }),
    ).toHaveTextContent('7');
  });
});
