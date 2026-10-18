import styles from './MonitoringPanel.module.css';
import { WorkerTable } from './WorkerTable';
import { Stat, metric } from './monitor-presentation';
import type { MonitoringModel } from './useMonitoringPanel';
import { QueryStatus } from '@/shared/ui/QueryStatus';

/** Presentation only; the owning controller retains state and cancellation. */
export function MonitorWorkersView({ model }: { model: MonitoringModel }) {
  const { t, resources, cpu, memory, uptime, totals } = model;
  return (
    <>
      <div className={styles.stats}>
        <Stat
          label={t('monitor.runningWorkers')}
          value={`${metric(resources?.data.summary.running_workers)} / ${metric(resources?.data.summary.expected_workers)}`}
          note={t('monitor.heartbeat')}
          icon="gear"
        />
        <Stat
          label={t('monitor.restarts')}
          value={metric(resources?.data.summary.restarts)}
          note={t('monitor.restartNote')}
          icon="restart"
        />
        <Stat
          label={t('monitor.successfulRequests')}
          value={metric(totals.isError ? null : totals.data?.successful)}
          note={t('monitor.successNote')}
          icon="success"
        />
        <Stat
          label={t('monitor.failedRequests')}
          value={metric(totals.isError ? null : totals.data?.failed)}
          note={t('monitor.failedNote')}
          icon="error"
        />
      </div>
      <QueryStatus
        pending={totals.isPending}
        failed={totals.isError}
        hasData={totals.data !== undefined}
        fetching={totals.isFetching}
        copy={{
          loading: t('ui.loading'),
          error: t('ui.unavailable'),
          retry: t('ui.retry'),
          empty: t('overview.noData'),
        }}
        onRetry={() => void totals.refetch()}
      />
      <section className={styles.panel}>
        <div className={styles.panelHeading}>
          <h2>{t('monitor.workerStatus')}</h2>
          <span className={styles.accent}>{t('monitor.heartbeat')}</span>
        </div>
        <WorkerTable
          workers={resources?.data.workers ?? []}
          t={t}
          cpu={cpu}
          memory={memory}
          uptime={uptime}
          stale={!model.paused && model.monitor.status !== 'live'}
        />
        {!resources?.data.workers.length && (
          <p className={styles.empty}>{t('monitor.noWorkers')}</p>
        )}
        <p className={styles.footnote}>
          {t('monitor.resourceNote')} {t('monitor.workerTotalsNote')}
        </p>
      </section>
    </>
  );
}
