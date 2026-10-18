import { queryOptions } from '@tanstack/react-query';
import { z } from 'zod';
import { ApiError, requestJson, retryRead } from '@/shared/api/http';

const count = z.number().int().nonnegative();
const percent = z.number().finite().min(0).max(100).nullable();
const instant = z.iso.datetime({ offset: true });
const period = z.object({
  start: z.iso.date(),
  end: z.iso.date(),
  timezone: z.string(),
  service_id: z.string(),
});
const day = z.object({ date: z.iso.date(), count, complete: z.boolean() });
const comparison = z.object({
  start: z.iso.date(),
  end: z.iso.date(),
  total: count,
  complete: z.boolean(),
  change_percent: z.number().finite().nullable(),
});
const coverage = z.object({
  started_at: instant.nullable(),
  data_as_of: instant.nullable(),
  complete: z.boolean(),
  basis: z.enum(['best_effort_http_events', 'stored_successful_sign_ins']),
});

/** Validate private overview responses, preserving unknown values and observation coverage.
 * @author ZhengLee 2026.10.18
 */
export const monitorTrafficSchema = z.object({
  period,
  metric: z.literal('http_requests'),
  scope: z.enum(['http', 'portfolio']),
  total: count,
  daily_average: z.number().finite().nonnegative(),
  series: z.array(day),
  comparison,
  coverage,
  generated_at: instant,
});
export const monitorLoginsSchema = z.object({
  period,
  total: count,
  series: z.array(day),
  comparison,
  countries: z.array(
    z.object({
      country_code: z.string().regex(/^[A-Z]{2}$/),
      users: count,
      percent: z.number().finite().min(0).max(100),
    }),
  ),
  country_count: count,
  local_users: count.default(0),
  unknown_users: count,
  coverage,
  generated_at: instant,
});
export const monitorAvailabilitySchema = z.object({
  period,
  basis: z.literal('sampled_http_and_dependencies'),
  expected: count,
  observed: count,
  successful: count,
  availability_percent: percent,
  coverage_percent: percent,
  slo_target_percent: z.number().finite().min(0).max(100),
  slo_met: z.boolean().nullable(),
  series: z.array(
    z.object({
      date: z.iso.date(),
      expected: count,
      observed: count,
      successful: count,
      availability_percent: percent,
      coverage_percent: percent,
    }),
  ),
  latest: z
    .object({
      checked_at: instant,
      http_ok: z.boolean(),
      redis_ok: z.boolean(),
      database_ok: z.boolean(),
      http_status: count.nullable(),
      duration_ms: z.number().finite().nonnegative(),
    })
    .nullable(),
  current_status: z.enum(['healthy', 'unhealthy', 'unknown']),
  generated_at: instant,
});
export const monitorServicesSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      environment: z.string(),
      region: z.string().nullable(),
      scope: z.literal('shared_database'),
      host: z.string(),
      port: count,
      expected_workers: count,
      versions: z.record(z.string(), z.string()),
      probe_scope: z.literal('configured_endpoint'),
    }),
  ),
  refresh_seconds: z.number().positive(),
  history_flush_seconds: z.number().positive(),
  worker_cycle_seconds: z.number().positive(),
});
export type MonitorTraffic = z.infer<typeof monitorTrafficSchema>;
export type MonitorLogins = z.infer<typeof monitorLoginsSchema>;
export type MonitorAvailability = z.infer<typeof monitorAvailabilitySchema>;
export type MonitorService = z.infer<typeof monitorServicesSchema>['items'][number];

export const monitorRequestTotalsSchema = z
  .object({
    run_id: z.string(),
    instance_id: z.string(),
    basis: z.literal('server_run'),
    total: count,
    successful: count,
    failed: count,
    started_at: instant,
    sampled_at: instant,
  })
  .refine((value) => value.total === value.successful + value.failed);

/** Read the current server run from SYS Redis; account identity isolates private browser state.
 * @author ZhengLee 2026.10.18
 */
export function monitorRequestTotalsQuery(accountId?: number) {
  return queryOptions({
    queryKey: ['monitor', accountId ?? 'session', 'request-totals'],
    queryFn: ({ signal }) =>
      requestJson('monitor/request-totals', monitorRequestTotalsSchema, {
        signal,
        credentials: 'include',
        cache: 'no-store',
      }),
    meta: { private: true },
    staleTime: 0,
    gcTime: 0,
    retry: retryRead,
  });
}
export type OverviewFilters = { start: string; end: string; timezone: string; service_id: string };

/** Keep authenticated overview reads out of SSR hydration and shared browser caches.
 * @author ZhengLee 2026.10.18
 */
export function monitorServicesQuery(accountId?: number) {
  return queryOptions({
    queryKey: ['monitor', accountId ?? 'session', 'services'],
    queryFn: ({ signal }) =>
      requestJson('monitor/services', monitorServicesSchema, {
        signal,
        credentials: 'include',
        cache: 'no-store',
      }),
    meta: { private: true },
    staleTime: 60_000,
    retry: retryRead,
  });
}

function aggregateQuery<T extends { period: z.infer<typeof period> }>(
  resource: string,
  schema: z.ZodType<T>,
  filters: OverviewFilters,
  accountId?: number,
) {
  const params = new URLSearchParams({ ...filters, is_caching: 'true' });
  if (resource === 'traffic') params.set('scope', 'http');
  return queryOptions({
    queryKey: ['monitor', accountId ?? 'session', resource, params.toString()],
    queryFn: async ({ signal }) => {
      const result = await requestJson(`monitor/${resource}?${params}`, schema, {
        signal,
        credentials: 'include',
        cache: 'no-store',
      });
      if (
        Object.entries(filters).some(
          ([key, value]) => result.period[key as keyof typeof filters] !== value,
        )
      )
        throw new ApiError('contract');
      return result;
    },
    meta: { private: true },
    staleTime: 20_000,
    retry: retryRead,
  });
}
export const monitorTrafficQuery = (filters: OverviewFilters, accountId?: number) =>
  aggregateQuery('traffic', monitorTrafficSchema, filters, accountId);
export const monitorLoginsQuery = (filters: OverviewFilters, accountId?: number) =>
  aggregateQuery('logins', monitorLoginsSchema, filters, accountId);
export const monitorAvailabilityQuery = (filters: OverviewFilters, accountId?: number) =>
  aggregateQuery('availability', monitorAvailabilitySchema, filters, accountId);
