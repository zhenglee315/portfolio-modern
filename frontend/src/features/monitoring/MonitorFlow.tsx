import { FlowRoutes } from './FlowRoutes';
import styles from './MonitoringPanel.module.css';
import { workerKey } from './monitor';
import { WorkerMetric, metric, workerLabel } from './monitor-presentation';
import type { MonitoringModel } from './useMonitoringPanel';
/** Visualize retained request phases; subscriptions and the monotonic clock stay in the controller. */
export function MonitorFlow({ model }: { model: MonitoringModel }) {
  const {
    motionPaused,
    t,
    flowRoot,
    summary,
    workers,
    requests,
    resourceWorkers,
    cpu,
    memory,
    uptime,
    ready,
  } = model;
  return (
    <section className={styles.panel} aria-labelledby="monitor-flow-title">
      <div className={styles.panelHeading}>
        <div>
          <h2 id="monitor-flow-title">{t('monitor.flowTitle')}</h2>
          <p>{t('monitor.flowDescription')}</p>
        </div>
        <span className={styles.legend}>
          <span className={styles.incoming}>
            <i className={styles.legendLine} aria-hidden="true" />
            {t('monitor.incoming')}
          </span>
          <span className={styles.outgoing}>
            <i className={styles.legendLine} aria-hidden="true" />
            {t('monitor.outgoing')}
          </span>
        </span>
      </div>
      <div className={styles.flowScroll}>
        <div className={styles.flow} ref={flowRoot}>
          <FlowRoutes root={flowRoot} requests={requests} animate={ready && !motionPaused} />
          <div className={styles.clients} data-flow-client>
            <small>HTTP CLIENTS</small>
            <strong>{t('monitor.clients')}</strong>
            <span className={styles.incoming}>{metric(summary?.active_requests)} in-flight →</span>
          </div>
          <div className={styles.socket}>
            <span>{t('monitor.sharedSocket')}</span>
            <span>{t('monitor.osDispatch')}</span>
          </div>
          <div className={styles.workerBox}>
            <div className={styles.server}>
              <strong>Uvicorn · FastAPI</strong>
              <small>
                {t('monitor.workerTarget', { count: summary?.expected_workers ?? '—' })}
              </small>
              <span>{t('monitor.asgi')}</span>
            </div>
            <div className={styles.workerList} data-flow-list>
              {workers.map((worker) => {
                const resource = worker.process_uid
                  ? resourceWorkers.get(worker.process_uid)
                  : undefined;
                const active = requests.filter(
                  (row) => row.process_uid === worker.process_uid && row.status === 'processing',
                );
                const finished = requests.find(
                  (row) => row.process_uid === worker.process_uid && row.status === 'completed',
                );
                const working = worker.fresh && (worker.active_requests ?? 0) > 0;
                const responding = active.some((row) => row.phase === 'response');
                const applying = active.some((row) => row.phase === 'application');
                return (
                  <article
                    className={styles.worker}
                    key={workerKey(worker)}
                    data-flow-worker={worker.process_uid ?? workerKey(worker)}
                    data-busy={working}
                    data-stale={!worker.fresh}
                  >
                    <header>
                      <strong>● {workerLabel(worker)}</strong>
                      <span>PID {worker.pid}</span>
                      <span className={styles.workerState}>
                        {t(
                          !worker.fresh
                            ? 'monitor.unknown'
                            : working
                              ? 'monitor.processing'
                              : 'monitor.idle',
                        )}{' '}
                        · {metric(worker.active_requests)} in-flight
                      </span>
                    </header>
                    <div className={styles.stages} data-flow-stages>
                      <span data-active={working}>
                        {t('monitor.middlewareIn')}
                        {working ? ' ✓' : ''}
                      </span>
                      <b>→</b>
                      <span data-active={working && (!responding || applying)}>
                        {t('monitor.application')}
                        <small className={styles.stageStatus} data-active={working}>
                          {t(
                            !worker.fresh
                              ? 'monitor.unknown'
                              : working
                                ? 'monitor.processing'
                                : 'monitor.awaiting',
                          )}
                        </small>
                      </span>
                      <b>→</b>
                      <span data-active={responding}>
                        {t('monitor.middlewareOut')}
                        <small>{responding ? t('monitor.sending') : '—'}</small>
                      </span>
                    </div>
                    <div className={styles.workerFooter}>
                      <div className={styles.requestPreview}>
                        {active.length ? (
                          active.slice(0, 2).map((row) => (
                            <span key={row.request_id} title={row.request_id}>
                              req-{row.request_id.slice(0, 8)} {row.method} {row.path}
                            </span>
                          ))
                        ) : finished ? (
                          <span>
                            {t('monitor.lastCompleted')} {finished.method} {finished.path} ·{' '}
                            {finished.http_status} · {metric(finished.duration_ms, ' ms')}
                          </span>
                        ) : (
                          <span>{t('monitor.noRequests')}</span>
                        )}
                      </div>
                      <dl className={styles.workerMetrics}>
                        <WorkerMetric
                          icon="cpu"
                          label={t('monitor.columns.cpu')}
                          value={cpu(resource)}
                        />
                        <WorkerMetric
                          icon="memory"
                          label={t('monitor.columns.memory')}
                          value={memory(resource)}
                        />
                        <WorkerMetric
                          icon="clock"
                          label={t('monitor.columns.uptime')}
                          value={uptime(resource)}
                        />
                        <WorkerMetric
                          icon="restart"
                          label={t('monitor.columns.restarts')}
                          value={metric(resource?.restarts)}
                        />
                      </dl>
                    </div>
                  </article>
                );
              })}
            </div>
            {!workers.length && <p className={styles.empty}>{t('monitor.noWorkers')}</p>}
          </div>
          <div className={styles.returnPath} data-flow-return>
            ← {t('monitor.returnPath')}
          </div>
        </div>
      </div>
      <div className={styles.footnote}>
        <span>{t('monitor.dispatchNote')}</span>
        <span>{t('monitor.inFlightNote')}</span>
      </div>
    </section>
  );
}
