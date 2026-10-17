import { MonitorFlow } from './MonitorFlow';
import styles from './MonitoringPanel.module.css';
import { requestElapsed } from './monitor';
import { MonitorSelect, Stat, metric, workerLabel } from './monitor-presentation';
import type { MonitoringModel } from './useMonitoringPanel';

/** Presentation only; the owning controller retains state and cancellation. */
export function MonitorRequestsView({ model }: { model: MonitoringModel }) {
  const {
    t,
    filter,
    setFilter,
    ascending,
    setAscending,
    setPage,
    pageSize,
    setPageSize,
    monitor,
    flow,
    summary,
    requests,
    advance,
    time,
    pages,
    currentPage,
    visible,
    choices,
    busy,
    stale,
  } = model;
  return (
    <>
      <div className={styles.stats}>
        <Stat
          label={t('monitor.active')}
          value={`${summary?.active_requests_complete === false ? '≥ ' : ''}${metric(summary?.active_requests)}`}
          icon="activity"
          note={
            busy.map((worker) => `${workerLabel(worker)}: ${worker.active_requests}`).join(' · ') ||
            t('monitor.noActive')
          }
        />
        <Stat
          label={t('monitor.busyWorkers')}
          value={`${metric(summary?.busy_workers)} / ${metric(summary?.expected_workers)}`}
          icon="gear"
          note={t('monitor.busyNote', {
            busy: summary?.busy_workers ?? '—',
            idle: summary?.idle_workers ?? '—',
          })}
        />
        <Stat
          label={t('monitor.completed')}
          value={metric(summary?.recent_completed_requests)}
          icon="success"
          note={t('monitor.window', { seconds: flow?.data.window_seconds ?? '—' })}
        />
        <Stat
          label={t('monitor.average')}
          value={metric(summary?.recent_average_duration_ms, ' ms')}
          icon="activity"
          note={`${t('monitor.slowest')} ${metric(summary?.recent_max_duration_ms, ' ms')}`}
        />
      </div>
      {(stale || summary?.request_details_truncated) && (
        <p className={styles.notice}>
          {t(stale ? 'monitor.staleNotice' : 'monitor.truncatedNotice')}
        </p>
      )}
      <MonitorFlow model={model} />
      <section className={styles.panel} aria-labelledby="monitor-events-title">
        <div className={styles.panelHeading}>
          <div className={styles.eventTitle}>
            <h2 id="monitor-events-title">{t('monitor.events')}</h2>
            <span>{t('monitor.eventCount', { count: requests.length })}</span>
          </div>
          <div className={styles.tableControls}>
            <MonitorSelect
              label={t('monitor.filter')}
              value={filter}
              options={[
                { value: 'all', label: t('monitor.allWorkers') },
                ...choices.map(([key, row]) => ({
                  value: key,
                  label: `W${row.slot ?? '?'} / ${row.pid}`,
                })),
              ]}
              onChange={(value) => {
                setFilter(value);
                setPage(0);
              }}
            />
            <button
              type="button"
              onClick={() => {
                setAscending((value) => !value);
                setPage(0);
              }}
            >
              {t('monitor.entered')} {ascending ? '↑' : '↓'}
            </button>
          </div>
        </div>
        <div className={styles.tableScroll}>
          <table>
            <thead>
              <tr>
                {[
                  'request',
                  'worker',
                  'method',
                  'path',
                  'entered',
                  'left',
                  'state',
                  'elapsed',
                  'http',
                  'ip',
                  'location',
                ].map((key) => (
                  <th key={key} scope="col">
                    {t(`monitor.columns.${key}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.request_id} data-processing={row.status === 'processing'}>
                  <td title={row.request_id}>● req-{row.request_id.slice(0, 8)}</td>
                  <td>
                    W{row.slot ?? '?'} / {row.pid}
                  </td>
                  <td className={styles.accent}>{row.method}</td>
                  <td title={row.path}>{row.path}</td>
                  <td>{time(row.entered_at)}</td>
                  <td>{time(row.left_at)}</td>
                  <td>
                    <span className={styles.badge}>
                      {t(`monitor.states.${row.status}`, { defaultValue: row.status })}
                    </span>
                  </td>
                  <td>
                    {metric(
                      requestElapsed(
                        row,
                        flow?.sampled_at ?? row.observed_at,
                        advance(monitor.requests?.receivedAt),
                      ),
                      ' ms',
                    )}
                  </td>
                  <td className={styles.accent}>{row.http_status ?? '—'}</td>
                  <td>{row.ip_address ?? '—'}</td>
                  <td>
                    {row.location ||
                      [row.country_code, row.region, row.city].filter(Boolean).join(' / ') ||
                      t(row.geo_status === 'non_public' ? 'monitor.local' : 'monitor.unknown')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!visible.length && <p className={styles.empty}>{t('monitor.noRequests')}</p>}
        <div className={styles.footnote}>
          <span>{t('monitor.tableNote')}</span>
          <div className={styles.pagination}>
            <div className={styles.pageSize}>
              <span>{t('management.rowsPerPage')}</span>
              <MonitorSelect
                label={t('management.rowsPerPage')}
                value={String(pageSize)}
                options={[
                  ...[5, 10, 25, 50, 100].map((value) => ({
                    value: String(value),
                    label: String(value),
                  })),
                  { value: 'all', label: 'ALL' },
                ]}
                onChange={(value) => {
                  setPageSize(value === 'all' ? 'all' : Number(value));
                  setPage(0);
                }}
              />
            </div>
            <button
              type="button"
              disabled={currentPage === 0}
              onClick={() => setPage(currentPage - 1)}
            >
              ←
            </button>
            <span>
              {currentPage + 1} / {pages}
            </span>
            <button
              type="button"
              disabled={currentPage + 1 >= pages}
              onClick={() => setPage(currentPage + 1)}
            >
              →
            </button>
          </div>
        </div>
      </section>
    </>
  );
}
