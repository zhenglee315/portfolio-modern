import type { Locale } from '@/i18n/config';
import { formatUtcClock } from '@/shared/lib/timestamps';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { type MonitorWorker } from './monitor';
import { metric } from './monitor-presentation';
import { useMonitorSocket } from './useMonitorSocket';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@/shared/api/http';
import { useDocumentVisible } from '@/shared/hooks/useDocumentVisible';
import { monitorRequestTotalsQuery } from './overview-api';
/** Own one socket subscription and presentation state for both monitor views.
 * Monotonic ticks advance ages only; event timestamps retain explicit UTC formatting.
 */
export function useMonitoringPanel({
  locale,
  enabled,
  accountId,
  onDenied,
  motionPaused = false,
  initialView = 'requests',
}: {
  locale: Locale;
  enabled: boolean;
  accountId?: number;
  onDenied: () => void;
  motionPaused?: boolean;
  initialView?: 'requests' | 'workers';
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [paused, setPaused] = useState(false);
  const [view, setView] = useState<'requests' | 'workers'>(initialView);
  const visibleDocument = useDocumentVisible();
  const client = useQueryClient();
  const totalsOptions = monitorRequestTotalsQuery(accountId);
  const totalsActive = enabled && visibleDocument && !paused && view === 'workers';
  const totals = useQuery({
    ...totalsOptions,
    enabled: totalsActive,
    refetchInterval: totalsActive ? 5000 : false,
    refetchIntervalInBackground: false,
  });
  useEffect(() => {
    if (!totalsActive)
      void client.cancelQueries({
        queryKey: ['monitor', accountId ?? 'session', 'request-totals'],
      });
  }, [totalsActive, client, accountId]);
  useEffect(() => {
    if (
      totals.error instanceof ApiError &&
      totals.error.kind === 'http' &&
      [401, 403].includes(totals.error.status ?? 0)
    ) {
      client.removeQueries({ queryKey: ['monitor', accountId ?? 'session'] });
      onDenied();
    }
  }, [totals.error, onDenied, client, accountId]);
  const [clock, setClock] = useState(0);
  const [filter, setFilter] = useState('all');
  const [ascending, setAscending] = useState(false);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<number | 'all'>(5);
  const flowRoot = useRef<HTMLDivElement>(null);
  const monitor = useMonitorSocket(enabled, paused, accountId, view);
  useEffect(() => {
    if (monitor.status === 'denied') onDenied();
  }, [monitor.status, onDenied]);
  useEffect(() => {
    if (paused || monitor.status !== 'live') return;
    // This timer only advances displayed ages; it never fetches another snapshot.
    const timer = window.setInterval(() => setClock(performance.now()), 250);
    return () => window.clearInterval(timer);
  }, [paused, monitor.status]);
  const flow = monitor.requests?.snapshot;
  const resources = monitor.workers?.snapshot;
  const summary = flow?.data.summary;
  const workers = flow?.data.workers ?? [];
  const requests = flow?.data.requests ?? [];
  // Topics arrive independently. A process UID prevents attaching a replaced PID's
  // resource values to another worker occupying the same supervisor slot.
  const resourceWorkers = new Map(
    resources?.data.workers.map((worker) => [worker.process_uid, worker]),
  );
  const newestObservation =
    monitor.workers &&
    (!monitor.requests || monitor.workers.receivedAt > monitor.requests.receivedAt)
      ? monitor.workers
      : monitor.requests;
  const observation = view === 'requests' ? newestObservation : monitor.workers;
  const advance = (receivedAt?: number) => Math.max(0, clock - (receivedAt ?? clock));
  const time = (seconds: number | null | undefined, full = false) =>
    formatUtcClock(seconds == null ? seconds : seconds * 1000, locale, full);
  const duration = (seconds: number | null | undefined) => {
    if (seconds == null) return '—';
    const age = Math.max(0, seconds);
    return `${Math.floor(age / 86400)}d ${Math.floor(age / 3600) % 24}h ${Math.floor(age / 60) % 60}m`;
  };
  const cpu = (worker?: MonitorWorker) =>
    !worker?.fresh || worker.cpu_percent == null ? '—' : `${worker.cpu_percent.toFixed(1)}%`;
  const memory = (worker?: MonitorWorker) =>
    metric(
      !worker?.fresh || worker.rss_bytes == null ? null : worker.rss_bytes / 1024 / 1024,
      ' MiB',
    );
  const uptime = (worker?: MonitorWorker) =>
    duration(
      !worker?.fresh || worker.uptime_seconds == null || !resources
        ? null
        : worker.uptime_seconds +
            Math.max(0, resources.sampled_at - (worker.sampled_at ?? resources.sampled_at)) +
            advance(monitor.workers?.receivedAt) / 1000,
    );
  // Filtering and pagination affect this table only. Expiring events can shrink
  // its page count, so clamp the current page before slicing the retained snapshot.
  const filtered = requests.filter(
    (row) => filter === 'all' || `${row.run_id}:${row.pid}` === filter,
  );
  const sorted = ascending ? [...filtered].reverse() : filtered;
  const size = pageSize === 'all' ? Math.max(1, sorted.length) : pageSize;
  const pages = Math.max(1, Math.ceil(sorted.length / size));
  const currentPage = Math.min(page, pages - 1);
  const visible = sorted.slice(currentPage * size, (currentPage + 1) * size);
  const choices = [...new Map(requests.map((row) => [`${row.run_id}:${row.pid}`, row])).entries()];
  const busy = workers.filter((worker) => worker.fresh && (worker.active_requests ?? 0) > 0);
  const stale =
    workers.some((worker) => !worker.fresh) || summary?.active_requests_complete === false;
  const ready = monitor.status === 'live' && !paused;
  const status = paused ? 'paused' : monitor.status;

  return {
    locale,
    t,
    navigate,
    paused,
    setPaused,
    view,
    setView,
    setClock,
    monitor,
    observation,
    time,
    ready,
    status,
    filter,
    setFilter,
    ascending,
    setAscending,
    setPage,
    pageSize,
    setPageSize,
    flow,
    summary,
    requests,
    advance,
    pages,
    currentPage,
    visible,
    choices,
    busy,
    stale,
    resources,
    totals,
    cpu,
    memory,
    uptime,
    motionPaused,
    flowRoot,
    workers,
    resourceWorkers,
  };
}
export type MonitoringModel = ReturnType<typeof useMonitoringPanel>;
