import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { ApiError } from '@/shared/api/http';
import { useDocumentVisible } from '@/shared/hooks/useDocumentVisible';
import {
  monitorAvailabilityQuery,
  monitorLoginsQuery,
  monitorServicesQuery,
  monitorTrafficQuery,
} from './overview-api';
import { localDate, readOverviewFilters, validPeriod } from './overview-model';
import { useMonitorSocket } from './useMonitorSocket';

/** Own overview filters, independent reads and one worker-only socket; permission loss closes every read.
 * @author ZhengLee 2026.10.18
 */
export function useMonitorOverview({
  enabled,
  accountId,
  onDenied,
}: {
  enabled: boolean;
  accountId?: number;
  onDenied: () => void;
}) {
  const [params, setParams] = useSearchParams();
  const client = useQueryClient();
  const requestedView = params.get('monitorView');
  const view: 'overview' | 'workers' | 'requests' =
    requestedView === 'workers' || requestedView === 'requests' ? requestedView : 'overview';
  const visible = useDocumentVisible();
  const [paused, setPaused] = useState(false);
  const [now, setNow] = useState(Date.now);
  const [blocked, setBlocked] = useState(false);
  const allowed = enabled && !blocked;
  const services = useQuery({ ...monitorServicesQuery(accountId), enabled: allowed });
  const service =
    services.data?.items.find((item) => item.id === params.get('service')) ??
    services.data?.items[0];
  const filters = readOverviewFilters(params, service?.id, localDate(now));
  const valid = validPeriod(filters.start, filters.end, localDate(now));
  const active = allowed && visible && !paused && view === 'overview';
  const interval = active ? Math.max(5, services.data?.refresh_seconds ?? 30) * 1000 : false;
  const queryEnabled = active && !!service && valid;
  const traffic = useQuery({
    ...monitorTrafficQuery(filters, accountId),
    enabled: queryEnabled,
    refetchInterval: interval,
    refetchIntervalInBackground: false,
  });
  const logins = useQuery({
    ...monitorLoginsQuery(filters, accountId),
    enabled: queryEnabled,
    refetchInterval: interval,
    refetchIntervalInBackground: false,
  });
  const availability = useQuery({
    ...monitorAvailabilityQuery(filters, accountId),
    enabled: queryEnabled,
    refetchInterval: interval,
    refetchIntervalInBackground: false,
  });
  const monitor = useMonitorSocket(
    allowed && visible && view === 'overview',
    paused,
    accountId,
    'workers',
  );
  const denied =
    blocked ||
    [services.error, traffic.error, logins.error, availability.error].some(
      (error) =>
        error instanceof ApiError &&
        error.kind === 'http' &&
        [401, 403].includes(error.status ?? 0),
    ) ||
    monitor.status === 'denied';
  if (denied && !blocked) setBlocked(true);
  useEffect(() => {
    if (!allowed || !visible || paused)
      void client.cancelQueries({ queryKey: ['monitor', accountId ?? 'session'] });
    if (denied) {
      client.removeQueries({ queryKey: ['monitor', accountId ?? 'session'] });
      onDenied();
    }
  }, [allowed, visible, paused, denied, onDenied, accountId, client]);
  useEffect(() => {
    if (!allowed || !visible || paused) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [allowed, visible, paused]);
  const update = (values: Record<string, string | null>) =>
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        Object.entries(values).forEach(([key, value]) =>
          value == null ? next.delete(key) : next.set(key, value),
        );
        return next;
      },
      { preventScrollReset: true },
    );
  const setView = (value: string) => update({ monitorView: value === 'overview' ? null : value });
  const refresh = () => {
    void services.refetch();
    if (valid && service) {
      void traffic.refetch();
      void logins.refetch();
      void availability.refetch();
    }
    monitor.retry();
  };
  const observed = monitor.workers;
  const workerLive =
    !paused &&
    monitor.status === 'live' &&
    !!observed &&
    now / 1000 - observed.snapshot.sampled_at < 15;
  return {
    params,
    view,
    setView,
    update,
    paused,
    setPaused,
    now,
    valid,
    services,
    service,
    filters,
    traffic,
    logins,
    availability,
    monitor,
    observed,
    workerLive,
    denied,
    refresh,
    visible,
  };
}
export type MonitorOverviewModel = ReturnType<typeof useMonitorOverview>;
