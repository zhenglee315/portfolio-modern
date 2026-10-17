import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import Dropdown from 'react-bootstrap/Dropdown';
import type { Locale } from '@/i18n/config';
import { tableToolbarMenuPosition } from '@/shared/lib/menu-position';
import { Icon, type IconName } from '@/shared/ui/Icon';
import menuStyles from '@/shared/ui/DataTableMenu.module.css';
import { requestElapsed, workerKey, type MonitorWorker } from './monitor';
import { useMonitorSocket } from './useMonitorSocket';
import { FlowRoutes } from './FlowRoutes';
import styles from './MonitoringPanel.module.css';

const metric = (value: number | null | undefined, suffix = '') =>
  value == null ? '—' : `${Math.round(value).toLocaleString()}${suffix}`;
const workerLabel = (worker: MonitorWorker) =>
  `Worker ${String(worker.slot ?? worker.pid).padStart(2, '0')}`;

/** Compact single choice using the same menu surface and placement as DataTable controls. */
function MonitorSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  const id = useId();
  const selected = options.find((option) => option.value === value);
  return (
    <Dropdown>
      <Dropdown.Toggle
        id={`${id}-toggle`}
        type="button"
        variant="outline-secondary"
        size="sm"
        className={styles.selectToggle}
        aria-label={`${label}: ${selected?.label ?? label}`}
        aria-controls={`${id}-options`}
        aria-haspopup="menu"
      >
        {selected?.label ?? label}
      </Dropdown.Toggle>
      <Dropdown.Menu
        id={`${id}-options`}
        role="menu"
        aria-labelledby={`${id}-toggle`}
        className={menuStyles.menu}
        popperConfig={tableToolbarMenuPosition}
      >
        {options.map((option) => (
          <Dropdown.Item
            key={option.value}
            as="button"
            type="button"
            role="menuitemradio"
            aria-checked={option.value === value}
            active={option.value === value}
            className={styles.selectOption}
            onClick={() => onChange(option.value)}
          >
            {option.label}
            {option.value === value && <Icon name="check" />}
          </Dropdown.Item>
        ))}
      </Dropdown.Menu>
    </Dropdown>
  );
}

/** Inline worker resource value; the icon keeps its readable label and hover detail. */
function WorkerMetric({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  return (
    <div title={`${label}: ${value}`}>
      <dt>
        <Icon name={icon} label={label} />
      </dt>
      <dd>{value}</dd>
    </div>
  );
}

/** One summary card; values describe all retained events, independent of table filters. */
function Stat({
  label,
  value,
  note,
  icon,
}: {
  label: string;
  value: string;
  note: string;
  icon: IconName;
}) {
  return (
    <section className={styles.stat} aria-label={label}>
      <div>
        <span>{label}</span>
        <Icon name={icon} />
      </div>
      <strong>{value}</strong>
      <small>{note}</small>
    </section>
  );
}

/** Render live observations in the existing private management shell and palette. */
export function MonitoringPanel({
  locale,
  enabled,
  accountId,
  onDenied,
  motionPaused = false,
}: {
  locale: Locale;
  enabled: boolean;
  accountId?: number;
  onDenied: () => void;
  motionPaused?: boolean;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [paused, setPaused] = useState(false);
  const [view, setView] = useState<'requests' | 'workers'>('requests');
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
    seconds == null
      ? '—'
      : new Intl.DateTimeFormat(locale, {
          ...(full ? { year: 'numeric', month: '2-digit', day: '2-digit' } : {}),
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          fractionalSecondDigits: 3,
          hour12: false,
        }).format(new Date(seconds * 1000));
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
  return (
    <div className={styles.monitor} data-monitoring>
      <div className={styles.toolbar}>
        <div className={styles.tabs} role="group" aria-label={t('monitor.views')}>
          {(['requests', 'workers'] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={view === value}
              onClick={() => setView(value)}
            >
              {t(`monitor.${value}`)}
            </button>
          ))}
        </div>
        <span className={styles.connection} data-live={ready} role="status">
          ● {t(`monitor.${status}`)}
        </span>
        <button
          type="button"
          className={styles.snapshot}
          onClick={() => {
            setClock(performance.now());
            setPaused((value) => !value);
          }}
          aria-pressed={paused}
          disabled={!observation}
        >
          <Icon name={paused ? 'play' : 'pause'} />
          {t(paused ? 'monitor.resume' : 'monitor.pause')}
          <span>{time(observation?.snapshot.sampled_at, true)}</span>
        </button>
      </div>
      {!paused && ['offline', 'unavailable'].includes(monitor.status) && (
        <div className={styles.notice} role="alert">
          <span>{t('monitor.reconnectNotice')}</span>
          <button type="button" onClick={monitor.retry}>
            {t('ui.retry')}
          </button>
        </div>
      )}
      {!observation && (
        <p className={styles.notice} role="status">
          {t('monitor.waiting')}
        </p>
      )}
      {view === 'requests' ? (
        <>
          <div className={styles.stats}>
            <Stat
              label={t('monitor.active')}
              value={`${summary?.active_requests_complete === false ? '≥ ' : ''}${metric(summary?.active_requests)}`}
              icon="activity"
              note={
                busy
                  .map((worker) => `${workerLabel(worker)}: ${worker.active_requests}`)
                  .join(' · ') || t('monitor.noActive')
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
                  <span className={styles.incoming}>
                    {metric(summary?.active_requests)} in-flight →
                  </span>
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
                        (row) =>
                          row.process_uid === worker.process_uid && row.status === 'processing',
                      );
                      const finished = requests.find(
                        (row) =>
                          row.process_uid === worker.process_uid && row.status === 'completed',
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
      ) : (
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
                      <td>
                        {t(`monitor.states.${worker.status}`, { defaultValue: worker.status })}
                      </td>
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
      )}
      <footer className={styles.footer}>
        <span>
          {t('monitor.cycleNote', { seconds: observation?.snapshot.cycle_seconds ?? '—' })}
        </span>
        <button type="button" onClick={() => void navigate(`/${locale}`)}>
          {t('management.backHome')}
        </button>
      </footer>
    </div>
  );
}
