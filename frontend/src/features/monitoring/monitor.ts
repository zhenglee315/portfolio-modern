import { z } from 'zod';

const number = z.number().finite();
const count = number.nonnegative();
const metric = count.nullable().optional();
const worker = z.object({
  instance_id: z.string(),
  run_id: z.string(),
  process_uid: z.string().nullable(),
  slot: count.nullable(),
  pid: count,
  status: z.string(),
  fresh: z.boolean(),
  started_at: number.nullable(),
  active_requests: metric,
  active_transactions: metric,
  completed_requests_total: metric,
  failed_requests_total: metric,
  cpu_percent: metric,
  rss_bytes: metric,
  uptime_seconds: metric,
  restarts: metric,
  reloads: metric,
  sampled_at: number.nullable().optional(),
  server: z
    .object({ host: z.string(), port: count, expected_workers: count.optional() })
    .nullable()
    .optional(),
});
const request = z.object({
  request_id: z.string(),
  instance_id: z.string(),
  run_id: z.string(),
  process_uid: z.string(),
  pid: count,
  slot: count.nullable(),
  method: z.string(),
  path: z.string(),
  entered_at: number,
  left_at: number.nullable(),
  observed_at: number,
  status: z.string(),
  phase: z.string(),
  elapsed_ms: count,
  duration_ms: metric,
  http_status: metric,
  fresh: z.boolean(),
  ip_address: z.string().nullable(),
  country_code: z.string().nullable(),
  region: z.string().nullable(),
  city: z.string().nullable(),
  geo_status: z.string(),
  location: z.string().nullable().optional(),
});
const summary = z.object({
  running_workers: count,
  expected_workers: count.nullable(),
  abnormal_workers: metric,
  unknown_workers: metric,
  health: z.string().optional(),
  restarts: metric,
  active_requests: count.optional(),
  active_requests_complete: z.boolean().optional(),
  active_transactions: count.optional(),
  busy_workers: count.optional(),
  idle_workers: count.optional(),
  transaction_busy_workers: count.optional(),
  recent_completed_requests: count.optional(),
  recent_average_duration_ms: metric,
  recent_max_duration_ms: metric,
  request_details_truncated: z.boolean().optional(),
  recent_http_2xx: z
    .object({ count, average_duration_ms: metric, max_duration_ms: metric })
    .optional(),
});

/** Validate every private socket observation before it can enter the dashboard. */
export const monitorSnapshotSchema = z.object({
  schema: z.literal(1),
  topic: z.enum(['workers', 'requests']),
  revision: z.string().regex(/^\d+$/),
  sampled_at: number,
  cycle_seconds: number.positive(),
  data: z.object({
    workers: z.array(worker),
    summary,
    requests: z.array(request).optional(),
    window_seconds: number.positive(),
    health_basis: z.string(),
  }),
});
export type MonitorSnapshot = z.infer<typeof monitorSnapshotSchema>;
export type MonitorWorker = z.infer<typeof worker>;
export type MonitorRequest = z.infer<typeof request>;

export function workerKey(value: MonitorWorker) {
  return `${value.instance_id}:${value.run_id}:${value.slot ?? value.pid}`;
}

/** Monotonic browser time advances display counters without extra server traffic. */
export function requestElapsed(value: MonitorRequest, sampledAt: number, advanceMs: number) {
  const observed = Math.max(0, sampledAt - value.observed_at) * 1000;
  return value.status === 'processing' && value.fresh
    ? value.elapsed_ms + observed + advanceMs
    : (value.duration_ms ?? value.elapsed_ms);
}
