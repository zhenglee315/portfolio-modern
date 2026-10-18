import type { UseQueryResult } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { HelpTooltip } from '@/shared/ui/HelpTooltip';
import { QueryStatus } from '@/shared/ui/QueryStatus';
import { SectionBoundary } from '@/shared/ui/SectionBoundary';
import { Stat } from './monitor-presentation';
import { MonitorChart } from './MonitorChart';
import { MonitorGlyph } from './MonitorGlyph';
import { MonitorLoginMap } from './MonitorLoginMap';
import { WorkerTable } from './WorkerTable';
import { overviewNumber, overviewTime } from './overview-model';
import type { MonitorOverviewModel } from './useMonitorOverview';
import styles from './MonitorOverview.module.css';

/** Render each aggregate independently so a failed source never replaces unrelated observations.
 * @author ZhengLee 2026.10.18
 */
function SourceState({ query }: { query: UseQueryResult<unknown, unknown> }) {
  const { t } = useTranslation();
  return (
    <QueryStatus
      pending={query.isPending}
      failed={query.isError}
      hasData={query.data !== undefined}
      fetching={query.isFetching}
      copy={{
        loading: t('ui.loading'),
        error: t('ui.unavailable'),
        retry: t('ui.retry'),
        empty: t('overview.noData'),
      }}
      onRetry={() => void query.refetch()}
    />
  );
}

/** Compose the four KPIs, geographic distribution, daily traffic and immediate worker resources.
 * @author ZhengLee 2026.10.18
 */
export function MonitorOverview({
  model,
  locale,
}: {
  model: MonitorOverviewModel;
  locale: string;
}) {
  const { t } = useTranslation();
  const {
    traffic,
    logins,
    availability,
    service,
    monitor,
    observed,
    workerLive,
    paused,
    now,
    filters,
  } = model;
  const trafficData = traffic.data,
    loginData = logins.data,
    health = availability.data;
  const trafficKnown =
    trafficData &&
    (trafficData.coverage.complete ||
      trafficData.series.some((day) => day.complete || day.count > 0));
  const loginsKnown =
    loginData &&
    (loginData.coverage.complete || loginData.series.some((day) => day.complete || day.count > 0));
  const workerSnapshot = observed?.snapshot;
  const workerKnown = (workerLive || paused) && !!workerSnapshot;
  const summary = workerKnown ? workerSnapshot.data.summary : undefined;
  const number = (value: number | null | undefined, digits = 0) =>
    overviewNumber(value, locale, digits);
  const change = (value: number | null | undefined) =>
    value == null ? null : (
      <span className={styles.change} data-negative={value < 0}>
        {value > 0 ? '↗ ' : value < 0 ? '↘ ' : ''}
        {value > 0 ? '+' : ''}
        {number(value, 1)}%
      </span>
    );
  const trafficPoints =
    trafficData?.series.map((day) => ({
      date: day.date,
      value: day.complete || day.count > 0 ? day.count : null,
      complete: day.complete,
    })) ?? [];
  const loginPoints =
    loginData?.series.map((day) => ({
      date: day.date,
      value: day.complete || day.count > 0 ? day.count : null,
      complete: day.complete,
    })) ?? [];
  const healthPoints =
    health?.series.map((day) => ({ date: day.date, value: day.availability_percent })) ?? [];
  const observedTimes = [
    trafficData?.generated_at,
    loginData?.generated_at,
    health?.generated_at,
  ].filter((value): value is string => !!value);
  const oldest = observedTimes.length
    ? observedTimes.reduce((a, b) => (Date.parse(a) < Date.parse(b) ? a : b))
    : undefined;
  const currentHealth =
    health && health.latest && now - Date.parse(health.latest.checked_at) <= 120_000
      ? health.current_status
      : 'unknown';
  return (
    <div className={styles.overview} data-monitor-overview>
      <div className={styles.kpis}>
        <Stat
          className={styles.metric}
          label={t('overview.runningWorkers')}
          value={`${number(summary?.running_workers)} / ${number(summary?.expected_workers)}`}
          icon="cpu"
          graphic={<MonitorGlyph name="cpu" />}
          note={
            <>
              <span
                className={styles.healthText}
                data-status={workerKnown ? summary?.health : 'unknown'}
              >
                ●{' '}
                {t(
                  paused
                    ? 'monitor.paused'
                    : workerKnown && summary?.health === 'healthy'
                      ? 'overview.allHealthy'
                      : workerKnown && ['degraded', 'unhealthy'].includes(summary?.health ?? '')
                        ? 'overview.workersUnhealthy'
                        : 'overview.unknown',
                )}
              </span>
              <span>
                {t('overview.workerCounts', {
                  expected: number(summary?.expected_workers),
                  abnormal: number(summary?.abnormal_workers),
                })}
              </span>
            </>
          }
        >
          <div className={styles.workerSignal} data-live={workerLive} aria-hidden="true" />
        </Stat>
        <Stat
          className={styles.metric}
          label={t('overview.httpRequests')}
          value={number(trafficKnown ? trafficData?.total : null)}
          icon="activity"
          graphic={<MonitorGlyph name="trend" />}
          note={
            <>
              {change(trafficData?.comparison.change_percent)}
              {trafficData?.comparison.change_percent != null && (
                <span>{t('overview.previousPeriod')}</span>
              )}
            </>
          }
        >
          <MonitorChart
            compact
            points={trafficPoints}
            locale={locale}
            label={t('overview.httpRequests')}
            empty={t('overview.noData')}
          />
        </Stat>
        <Stat
          className={styles.metric}
          label={t('overview.distinctLogins')}
          value={number(loginsKnown ? loginData?.total : null)}
          icon="people"
          graphic={<MonitorGlyph name="users" />}
          note={
            <>
              {change(loginData?.comparison.change_percent)}
              <span>{t('overview.uniqueAccounts')}</span>
            </>
          }
        >
          <MonitorChart
            compact
            points={loginPoints}
            locale={locale}
            label={t('overview.distinctLogins')}
            empty={t('overview.noData')}
          />
        </Stat>
        <Stat
          className={styles.metric}
          label={t('overview.availability')}
          value={
            health?.availability_percent == null
              ? '—'
              : `${number(health.availability_percent, 2)}%`
          }
          icon="shieldLock"
          graphic={<MonitorGlyph name="shield" />}
          note={
            <>
              <span
                className={styles.healthText}
                data-status={
                  health?.slo_met === true
                    ? 'healthy'
                    : health?.slo_met === false
                      ? 'unhealthy'
                      : 'unknown'
                }
              >
                ●{' '}
                {t(
                  health?.slo_met === true
                    ? 'overview.sloMet'
                    : health?.slo_met === false
                      ? 'overview.sloMissed'
                      : 'overview.sloUnknown',
                )}
              </span>
              <span>
                {t('overview.sloTarget', { value: number(health?.slo_target_percent, 1) })}
              </span>
            </>
          }
        >
          <MonitorChart
            compact
            points={healthPoints}
            locale={locale}
            label={t('overview.availability')}
            empty={t('overview.noData')}
          />
        </Stat>
      </div>
      <div className={styles.sourceStates}>
        <SourceState query={traffic} />
        <SourceState query={availability} />
      </div>
      <section
        className={`${styles.card} ${styles.geographyCard}`}
        id="monitor-geography"
        aria-labelledby="monitor-geo-title"
      >
        <div className={styles.cardHeading}>
          <div>
            <h2 id="monitor-geo-title">
              <MonitorGlyph name="mapGlobe" />
              {t('overview.loginDistribution')}
              <HelpTooltip label={t('overview.geoHelpLabel')} text={t('overview.geoHelp')} />
            </h2>
            <p>{t('overview.geoDescription')}</p>
          </div>
          <div className={styles.geoSummary}>
            <span>
              <strong>{number(loginData?.total)}</strong>
              {t('overview.usersLabel')}
            </span>
            <span>
              <strong>{number(loginData?.country_count)}</strong>
              {t('overview.regionsLabel')}
            </span>
          </div>
        </div>
        <SourceState query={logins} />
        {loginData && (
          <SectionBoundary
            resetKey={`map:${filters.start}:${filters.end}`}
            message={t('ui.unavailable')}
            retryLabel={t('ui.retry')}
          >
            <MonitorLoginMap data={loginData} locale={locale} />
          </SectionBoundary>
        )}
      </section>
      <div className={styles.bottomGrid}>
        <section
          className={styles.card}
          id="monitor-traffic"
          aria-labelledby="monitor-traffic-title"
        >
          <div className={styles.cardHeading}>
            <h2 id="monitor-traffic-title">{t('overview.dailyTraffic')}</h2>
            <span className={styles.chartLegend}>
              ━ {t('overview.requestsUnit')}
              <HelpTooltip
                label={t('overview.trafficHelpLabel')}
                text={t('overview.trafficHelp')}
              />
            </span>
          </div>
          <div className={styles.trafficTotal}>
            <strong>{number(trafficKnown ? trafficData?.total : null)}</strong>
            <span>{t('overview.requestsUnit')}</span>
            {change(trafficData?.comparison.change_percent)}
            {trafficData?.comparison.change_percent != null && (
              <span>{t('overview.previousPeriod')}</span>
            )}
          </div>
          <SectionBoundary
            resetKey={`traffic:${filters.start}:${filters.end}`}
            message={t('ui.unavailable')}
            retryLabel={t('ui.retry')}
          >
            <MonitorChart
              points={trafficPoints}
              locale={locale}
              label={t('overview.dailyTraffic')}
              empty={t('overview.noCompleteData')}
            />
          </SectionBoundary>
          <div className={styles.cardFoot}>
            <span>
              {t(trafficData?.coverage.complete ? 'overview.httpOnly' : 'overview.incomplete')}
            </span>
            <span>
              {t('overview.dailyAverage', {
                value: number(trafficKnown ? trafficData?.daily_average : null),
              })}
            </span>
          </div>
        </section>
        <section
          className={`${styles.card} ${styles.workerCard}`}
          aria-labelledby="monitor-worker-title"
        >
          <div className={styles.cardHeading}>
            <h2 id="monitor-worker-title">
              {t('monitor.workerStatus')}
              <span className={styles.badge}>
                {number(summary?.running_workers)} / {number(summary?.expected_workers)}
              </span>
            </h2>
            <button
              type="button"
              className={styles.textButton}
              onClick={() => model.setView('workers')}
            >
              {t('overview.processDetails')}
              <MonitorGlyph name="arrow" />
            </button>
          </div>
          <div className={styles.serviceStrip}>
            <span>
              <MonitorGlyph name="zap" />
              FastAPI <code>{service ? `${service.host}:${service.port}` : '—'}</code>
            </span>
            <span className={styles.healthText} data-status={currentHealth}>
              ● {t(`overview.health.${currentHealth}`)}
            </span>
          </div>
          {(!workerLive || paused) && (
            <div className={styles.socketNotice} role="status">
              {t(paused ? 'monitor.paused' : `monitor.${monitor.status}`)}
              {!paused && ['offline', 'unavailable'].includes(monitor.status) && (
                <button type="button" onClick={monitor.retry}>
                  {t('ui.retry')}
                </button>
              )}
            </div>
          )}
          <WorkerTable
            compact
            workers={workerSnapshot?.data.workers ?? []}
            t={t}
            stale={!workerKnown}
            cpu={(worker) =>
              worker.cpu_percent == null ? '—' : `${number(worker.cpu_percent, 1)}%`
            }
            memory={(worker) =>
              worker.rss_bytes == null ? '—' : `${number(worker.rss_bytes / 1024 / 1024)} MiB`
            }
            uptime={(worker) => {
              if (worker.uptime_seconds == null || !workerSnapshot) return '—';
              const seconds =
                worker.uptime_seconds +
                Math.max(
                  0,
                  workerSnapshot.sampled_at - (worker.sampled_at ?? workerSnapshot.sampled_at),
                ) +
                (workerLive ? Math.max(0, now / 1000 - workerSnapshot.sampled_at) : 0);
              return `${Math.floor(seconds / 86400)}d ${Math.floor(seconds / 3600) % 24}h ${Math.floor(seconds / 60) % 60}m`;
            }}
          />
          {!workerSnapshot?.data.workers.length && (
            <p className={styles.coverageNote}>{t('monitor.noWorkers')}</p>
          )}
          <div className={styles.cardFoot}>
            <span>
              {t('overview.workersLive')}
              <HelpTooltip label={t('overview.workerHelpLabel')} text={t('overview.workerHelp')} />
            </span>
            <span>
              {t('overview.workerSummary', {
                abnormal: number(summary?.abnormal_workers),
                restarts: number(summary?.restarts),
              })}
            </span>
          </div>
        </section>
      </div>
      <footer className={styles.footer}>
        <span>
          <MonitorGlyph name="info" />
          {t('overview.refreshNote', { seconds: model.services.data?.history_flush_seconds ?? 60 })}
        </span>
        <span>
          {filters.timezone} · {t('overview.lastUpdated', { time: overviewTime(oldest, locale) })}
        </span>
      </footer>
    </div>
  );
}
