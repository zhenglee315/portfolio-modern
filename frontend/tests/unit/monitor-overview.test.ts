import { dehydrate } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createQueryClient } from '@/app/query-client';
import {
  monitorAvailabilitySchema,
  monitorLoginsSchema,
  monitorServicesQuery,
  monitorServicesSchema,
  monitorTrafficQuery,
  monitorTrafficSchema,
  monitorRequestTotalsQuery,
  monitorRequestTotalsSchema,
} from '@/features/monitoring/overview-api';
import {
  localDate,
  overviewTime,
  presetPeriod,
  readOverviewFilters,
  validPeriod,
} from '@/features/monitoring/overview-model';
import { monitorEndpointFixture } from '../fixtures/monitor';

afterEach(() => vi.unstubAllGlobals());
const filters = {
  start: '2026-10-09',
  end: '2026-10-15',
  timezone: 'Asia/Taipei',
  service_id: 'api',
};

describe('monitor local-calendar controls', () => {
  it('includes today in rolling ranges at the Taiwan day boundary', () => {
    const today = localDate(Date.parse('2026-10-17T16:00:00Z'));
    expect(today).toBe('2026-10-18');
    expect(presetPeriod(7, today)).toEqual({ start: '2026-10-12', end: '2026-10-18' });
    expect(readOverviewFilters(new URLSearchParams('days=30'), 'api', today)).toMatchObject({
      start: '2026-09-19',
      end: '2026-10-18',
      timezone: 'Asia/Taipei',
    });
  });
  it('rejects future, reversed, impossible and overlong dates before transport', () => {
    for (const [start, end] of [
      ['2026-10-19', '2026-10-19'],
      ['2026-10-18', '2026-10-17'],
      ['2026-02-30', '2026-03-01'],
      ['2026-01-01', '2026-10-18'],
      ['', '2026-10-18'],
      ['0000-01-01', '0000-01-01'],
      ['0001-01-01', '0001-01-01'],
    ])
      expect(validPeriod(start!, end!, '2026-10-18')).toBe(false);
    expect(validPeriod('2026-07-18', '2026-10-18', '2026-10-18')).toBe(true);
    expect(validPeriod('2026-07-17', '2026-10-18', '2026-10-18')).toBe(false);
  });
  it('preserves invalid bookmarked dates for correction and formats zero as an instant', () => {
    expect(readOverviewFilters(new URLSearchParams('start=bad&end=2026-10-15'), 'api').start).toBe(
      'bad',
    );
    expect(overviewTime(0, 'en')).toContain('1970');
    expect(overviewTime('invalid', 'en')).toBe('—');
  });
});

describe('monitor HTTP contracts and private cache', () => {
  it('validates server-run request outcomes and isolates their private queries', () => {
    const response = monitorEndpointFixture(new URL('https://example.test/monitor/request-totals'));
    const totals = monitorRequestTotalsSchema.parse(response);
    expect(totals).toMatchObject({
      basis: 'server_run',
      total: 1040,
      successful: 1000,
      failed: 40,
    });
    expect(monitorRequestTotalsSchema.safeParse({ ...totals, total: 1041 }).success).toBe(false);
    expect(monitorRequestTotalsSchema.safeParse({ ...totals, failed: -1 }).success).toBe(false);
    expect(monitorRequestTotalsQuery(1).queryKey).not.toEqual(
      monitorRequestTotalsQuery(2).queryKey,
    );
    expect(monitorRequestTotalsQuery(1).meta?.private).toBe(true);
  });
  it('accepts backend-shaped aggregates and retains all unknown health values', () => {
    const url = (path: string) =>
      new URL(`https://example.test/monitor/${path}?${new URLSearchParams(filters)}`);
    expect(monitorTrafficSchema.parse(monitorEndpointFixture(url('traffic'))).total).toBe(10840);
    expect(
      monitorLoginsSchema.parse(monitorEndpointFixture(url('logins'))).countries[0]?.country_code,
    ).toBe('TW');
    expect(
      monitorServicesSchema.parse(monitorEndpointFixture(url('services'))).items[0]?.region,
    ).toBe('ap-northeast-1');
    const health = monitorAvailabilitySchema.parse(monitorEndpointFixture(url('availability')));
    expect(
      monitorAvailabilitySchema.parse({
        ...health,
        availability_percent: null,
        coverage_percent: null,
        slo_met: null,
        latest: null,
        current_status: 'unknown',
      }).availability_percent,
    ).toBeNull();
    expect(
      monitorAvailabilitySchema.safeParse({ ...health, availability_percent: 101 }).success,
    ).toBe(false);
  });
  it('shares one aggregate across widgets and excludes private data from hydration', async () => {
    const client = createQueryClient();
    const fetcher = vi.fn(async (path: string, options: RequestInit) => {
      const url = new URL(path, 'https://example.test');
      expect(options.credentials).toBe('include');
      expect(options.cache).toBe('no-store');
      if (url.pathname.endsWith('/traffic')) {
        expect(url.searchParams.get('is_caching')).toBe('true');
        expect(url.searchParams.get('scope')).toBe('http');
      }
      return Response.json(
        monitorEndpointFixture(new URL(url.href.replace('/api/monitor/', '/monitor/'))),
      );
    });
    vi.stubGlobal('fetch', fetcher);
    await Promise.all([
      client.fetchQuery(monitorTrafficQuery(filters, 7)),
      client.fetchQuery(monitorTrafficQuery(filters, 7)),
      client.fetchQuery(monitorServicesQuery(7)),
    ]);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(dehydrate(client).queries).toEqual([]);
    expect(monitorTrafficQuery(filters, 8).queryKey).not.toEqual(
      monitorTrafficQuery(filters, 7).queryKey,
    );
    expect(monitorTrafficQuery({ ...filters, end: '2026-10-16' }, 7).queryKey).not.toEqual(
      monitorTrafficQuery(filters, 7).queryKey,
    );
    client.clear();
  });
  it('rejects a response belonging to another requested period', async () => {
    const client = createQueryClient();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json(
          monitorEndpointFixture(
            new URL(
              'https://example.test/monitor/traffic?start=2026-10-01&end=2026-10-07&timezone=Asia/Taipei&service_id=api',
            ),
          ),
        ),
      ),
    );
    await expect(client.fetchQuery(monitorTrafficQuery(filters, 7))).rejects.toMatchObject({
      kind: 'contract',
    });
    client.clear();
  });
  it('propagates cancellation to the HTTP boundary', async () => {
    const client = createQueryClient();
    let signal: AbortSignal | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn((_path, options: RequestInit) => {
        signal = options.signal!;
        return new Promise((_resolve, reject) =>
          signal?.addEventListener('abort', () => reject(signal?.reason)),
        );
      }),
    );
    const pending = client.fetchQuery(monitorTrafficQuery(filters, 7));
    const cancelled = expect(pending).rejects.toBeDefined();
    await client.cancelQueries({ queryKey: ['monitor', 7] });
    await cancelled;
    expect(signal?.aborted).toBe(true);
    client.clear();
  });
});
