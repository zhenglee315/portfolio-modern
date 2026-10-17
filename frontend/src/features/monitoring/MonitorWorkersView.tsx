import styles from './MonitoringPanel.module.css';
import { workerKey } from './monitor';
import { Stat, metric, workerLabel } from './monitor-presentation';
import type { MonitoringModel } from './useMonitoringPanel';

/** Presentation only; the owning controller retains state and cancellation. */
export function MonitorWorkersView({ model }: { model: MonitoringModel }) {
  const { t, resources, cpu, memory, uptime } = model;
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
      </div>
      <section className={styles.panel}>
        <div className={styles.panelHeading}>
          <h2>{t('monitor.workerStatus')}</h2>
          <span className={styles.accent}>{t('monitor.heartbeat')}</span>
        </div>
        <div className={styles.tableScroll}>
          <table>
            <thead>
              <tr>
                {['worker', 'state', 'cpu', 'memory', 'uptime', 'restarts', 'transactions'].map(
                  (key) => (
                    <th key={key}>{t(`monitor.columns.${key}`)}</th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {resources?.data.workers.map((worker) => (
                <tr key={workerKey(worker)}>
                  <td>
                    <strong>{workerLabel(worker)}</strong>
                    <small className={styles.pid}>PID {worker.pid}</small>
                  </td>
                  <td>{t(`monitor.states.${worker.status}`, { defaultValue: worker.status })}</td>
                  <td>
                    {cpu(worker)}
                    <progress
                      value={Math.min(worker.cpu_percent ?? 0, 100)}
                      max={100}
                      aria-label="CPU"
                    />
                  </td>
                  <td>{memory(worker)}</td>
                  <td>{uptime(worker)}</td>
                  <td>{metric(worker.restarts)}</td>
                  <td>{metric(worker.active_transactions)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!resources?.data.workers.length && (
          <p className={styles.empty}>{t('monitor.noWorkers')}</p>
        )}
        <p className={styles.footnote}>{t('monitor.resourceNote')}</p>
      </section>
    </>
  );
}
