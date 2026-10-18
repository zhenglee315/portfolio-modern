/** Synthetic overview observations; no captured account, IP or process data.
 * @author ZhengLee 2026.10.18
 */
export function monitorEndpointFixture(url: URL) {
  const generated_at = new Date().toISOString();
  if (url.pathname === '/monitor/request-totals')
    return {
      run_id: 'fixture-run',
      instance_id: 'fixture',
      basis: 'server_run',
      total: 1040,
      successful: 1000,
      failed: 40,
      started_at: '2026-10-18T00:00:00Z',
      sampled_at: generated_at,
    };
  const start = url.searchParams.get('start') ?? '2026-10-09';
  const end = url.searchParams.get('end') ?? '2026-10-15';
  const period = {
    start,
    end,
    timezone: url.searchParams.get('timezone') ?? 'Asia/Taipei',
    service_id: url.searchParams.get('service_id') ?? 'api',
  };
  const days = Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000) + 1;
  const dates = Array.from({ length: Math.max(1, Math.min(93, days)) }, (_, index) =>
    new Date(Date.parse(start) + index * 86_400_000).toISOString().slice(0, 10),
  );
  const coverage = {
    started_at: '2020-01-01T00:00:00Z',
    data_as_of: generated_at,
    complete: true,
    basis: 'best_effort_http_events',
  };
  const comparison = {
    start: new Date(Date.parse(start) - days * 86_400_000).toISOString().slice(0, 10),
    end: new Date(Date.parse(start) - 86_400_000).toISOString().slice(0, 10),
    total: 9033,
    complete: true,
    change_percent: 20,
  };
  if (url.pathname === '/monitor/services')
    return {
      items: [
        {
          id: 'api',
          name: 'Core API',
          environment: 'Production',
          region: 'ap-northeast-1',
          scope: 'shared_database',
          host: '0.0.0.0',
          port: 8000,
          expected_workers: 4,
          versions: { fastapi: '0.115.0', uvicorn: '0.30.6', python: '3.12.0' },
          probe_scope: 'configured_endpoint',
        },
      ],
      refresh_seconds: 30,
      history_flush_seconds: 60,
      worker_cycle_seconds: 0.5,
    };
  if (url.pathname === '/monitor/traffic')
    return {
      period,
      metric: 'http_requests',
      scope: 'http',
      total: 10840,
      daily_average: 10840 / days,
      series: dates.map((date, index) => ({
        date,
        count: [1240, 1380, 1290, 1520, 1640, 1810, 1960][index % 7],
        complete: true,
      })),
      comparison,
      coverage,
      generated_at,
    };
  if (url.pathname === '/monitor/logins')
    return {
      period,
      total: 1248,
      series: dates.map((date, index) => ({ date, count: 100 + index * 21, complete: true })),
      comparison: { ...comparison, total: 1114, change_percent: 12 },
      countries: [
        ['TW', 624, 50],
        ['US', 250, 20],
        ['JP', 150, 12],
        ['SG', 100, 8],
        ['DE', 74, 5.9],
        ['AU', 50, 4],
      ].map(([country_code, users, percent]) => ({ country_code, users, percent })),
      country_count: 6,
      local_users: 0,
      unknown_users: 0,
      coverage: { ...coverage, basis: 'stored_successful_sign_ins' },
      generated_at,
    };
  if (url.pathname === '/monitor/availability')
    return {
      period,
      basis: 'sampled_http_and_dependencies',
      expected: days * 1440,
      observed: days * 1440,
      successful: days * 1440 - 2,
      availability_percent: 99.98,
      coverage_percent: 100,
      slo_target_percent: 99.9,
      slo_met: true,
      series: dates.map((date, index) => ({
        date,
        expected: 1440,
        observed: 1440,
        successful: index === 3 ? 1438 : 1440,
        availability_percent: index === 3 ? 99.86 : 100,
        coverage_percent: 100,
      })),
      latest: {
        checked_at: generated_at,
        http_ok: true,
        redis_ok: true,
        database_ok: true,
        http_status: 200,
        duration_ms: 10,
      },
      current_status: 'healthy',
      generated_at,
    };
  return undefined;
}

export function monitorSocketFixture(topic = 'workers', revision = '1') {
  const sampled_at = Date.now() / 1000;
  return {
    schema: 1,
    topic,
    revision,
    sampled_at,
    cycle_seconds: 0.5,
    data: {
      workers: Array.from({ length: 4 }, (_, index) => ({
        instance_id: 'fixture',
        run_id: 'fixture-run',
        process_uid: `fixture-worker-${index}`,
        slot: index + 1,
        pid: 18421 + index,
        status: 'running',
        fresh: true,
        started_at: sampled_at - 310_000,
        active_requests: 0,
        active_transactions: 0,
        completed_requests_total: 260,
        failed_requests_total: 10,
        cpu_percent: [12.4, 10.8, 14.2, 11.6][index],
        rss_bytes: [128, 126, 132, 127][index]! * 1024 * 1024,
        uptime_seconds: 310_000,
        restarts: 0,
        reloads: 0,
        sampled_at,
        server: { host: '0.0.0.0', port: 8000, expected_workers: 4 },
      })),
      summary: {
        running_workers: 4,
        expected_workers: 4,
        abnormal_workers: 0,
        unknown_workers: 0,
        health: 'healthy',
        restarts: 0,
        active_requests: 0,
        active_requests_complete: true,
        active_transactions: 0,
        busy_workers: 0,
        idle_workers: 4,
        transaction_busy_workers: 0,
        recent_completed_requests: 0,
        recent_average_duration_ms: null,
        recent_max_duration_ms: null,
      },
      requests: [],
      window_seconds: 60,
      health_basis: 'lifespan_heartbeat',
    },
  };
}
