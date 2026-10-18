import { mobileQuery, useMediaQuery } from '@/shared/hooks/useMediaQuery';
import { requestElapsed } from './monitor';
import { metric } from './monitor-presentation';
import type { MonitoringModel } from './useMonitoringPanel';
import styles from './MonitoringPanel.module.css';

/** Render the same retained events as phone cards or a desktop table, sharing filtering and paging.
 * @author ZhengLee 2026.10.18
 */
export function MonitorRequestEvents({ model }: { model: MonitoringModel }) {
  const { t, visible, time, flow, advance, monitor } = model;
  const narrow = useMediaQuery(mobileQuery);
  if (narrow)
    return (
      <div className={styles.eventCards} data-monitor-event-cards>
        {visible.map((row) => (
          <article
            key={row.request_id}
            className={styles.eventCard}
            data-processing={row.status === 'processing'}
            aria-label={`req-${row.request_id.slice(0, 8)}`}
          >
            <header>
              <strong title={row.request_id}>req-{row.request_id.slice(0, 8)}</strong>
              <span className={styles.badge}>
                {t(`monitor.states.${row.status}`, { defaultValue: row.status })}
              </span>
            </header>
            <p className={styles.eventPath}>
              <b className={styles.accent}>{row.method}</b>
              <span>{row.path}</span>
            </p>
            <p className={styles.eventWorker}>
              W{row.slot ?? '?'} / PID {row.pid}
            </p>
            <dl className={styles.eventTimes}>
              <div>
                <dt>{t('monitor.columns.entered')}</dt>
                <dd>{time(row.entered_at)}</dd>
              </div>
              <div>
                <dt>{t('monitor.columns.left')}</dt>
                <dd>{time(row.left_at)}</dd>
              </div>
            </dl>
            <div className={styles.eventResult}>
              <span>
                {t('monitor.columns.elapsed')}{' '}
                {metric(
                  requestElapsed(
                    row,
                    flow?.sampled_at ?? row.observed_at,
                    advance(monitor.requests?.receivedAt),
                  ),
                  ' ms',
                )}
              </span>
              <span
                className={
                  row.http_status != null && row.http_status >= 400
                    ? styles.failure
                    : row.http_status != null
                      ? styles.accent
                      : undefined
                }
              >
                HTTP {row.http_status ?? '—'}
              </span>
            </div>
            <details className={styles.eventOrigin}>
              <summary>
                {t('monitor.columns.ip')} / {t('monitor.columns.location')}
              </summary>
              <dl>
                <div>
                  <dt>{t('monitor.columns.ip')}</dt>
                  <dd>{row.ip_address ?? '—'}</dd>
                </div>
                <div>
                  <dt>{t('monitor.columns.location')}</dt>
                  <dd>
                    {row.location ||
                      [row.country_code, row.region, row.city].filter(Boolean).join(' / ') ||
                      t(row.geo_status === 'non_public' ? 'monitor.local' : 'monitor.unknown')}
                  </dd>
                </div>
              </dl>
            </details>
          </article>
        ))}
      </div>
    );
  return (
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
  );
}
