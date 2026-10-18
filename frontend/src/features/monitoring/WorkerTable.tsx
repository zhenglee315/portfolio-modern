import type { TFunction } from 'i18next';
import type { MonitorWorker } from './monitor';
import { workerKey } from './monitor';
import { metric, workerLabel } from './monitor-presentation';
import styles from './MonitoringPanel.module.css';

/** Share worker identity and resource columns between the compact overview and process detail.
 * Stale metrics stay unknown; CPU text retains multi-core values while its bar caps at one core.
 * @author ZhengLee 2026.10.18
 */
export function WorkerTable({
  workers,
  t,
  cpu,
  memory,
  uptime,
  compact = false,
  stale = false,
}: {
  workers: MonitorWorker[];
  t: TFunction;
  cpu: (worker: MonitorWorker) => string;
  memory: (worker: MonitorWorker) => string;
  uptime: (worker: MonitorWorker) => string;
  compact?: boolean;
  stale?: boolean;
}) {
  return (
    <div className={`${styles.tableScroll} ${styles.workerTable}`}>
      <table>
        <caption className="visually-hidden">{t('monitor.workerStatus')}</caption>
        <thead>
          <tr>
            {[
              'worker',
              'state',
              'cpu',
              'memory',
              'uptime',
              ...(!compact ? ['requests', 'failed'] : []),
              'restarts',
              ...(!compact ? ['transactions'] : []),
            ].map((key) => (
              <th key={key} scope="col">
                {t(`monitor.columns.${key}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {workers.map((worker) => {
            const fresh = worker.fresh && !stale;
            return (
              <tr key={workerKey(worker)}>
                <td>
                  <strong>{workerLabel(worker)}</strong>
                  <small className={styles.pid}>PID {worker.pid}</small>
                </td>
                <td>
                  <span data-worker-status={fresh ? worker.status : 'unknown'}>
                    {t(`monitor.states.${fresh ? worker.status : 'unknown'}`, {
                      defaultValue: fresh ? worker.status : t('overview.unknown'),
                    })}
                  </span>
                </td>
                <td>
                  {fresh ? cpu(worker) : '—'}
                  {fresh && worker.cpu_percent != null && (
                    <progress
                      value={Math.min(worker.cpu_percent, 100)}
                      max={100}
                      aria-label={`CPU ${workerLabel(worker)}`}
                    />
                  )}
                </td>
                <td>{fresh ? memory(worker) : '—'}</td>
                <td>{fresh ? uptime(worker) : '—'}</td>
                {!compact && (
                  <>
                    <td>{fresh ? metric(worker.completed_requests_total) : '—'}</td>
                    <td>{fresh ? metric(worker.failed_requests_total) : '—'}</td>
                  </>
                )}
                <td>{metric(worker.restarts)}</td>
                {!compact && <td>{fresh ? metric(worker.active_transactions) : '—'}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
