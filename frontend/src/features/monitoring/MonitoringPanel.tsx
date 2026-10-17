import type { Locale } from '@/i18n/config';
import { Icon } from '@/shared/ui/Icon';
import styles from './MonitoringPanel.module.css';
import { MonitorRequestsView } from './MonitorRequestsView';
import { MonitorWorkersView } from './MonitorWorkersView';
import { useMonitoringPanel } from './useMonitoringPanel';
/** Compose one live monitor controller with the two independently rendered topics. */
export function MonitoringPanel(props: {
  locale: Locale;
  enabled: boolean;
  accountId?: number;
  onDenied: () => void;
  motionPaused?: boolean;
}) {
  const model = useMonitoringPanel(props);
  const {
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
  } = model;
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
        <MonitorRequestsView model={model} />
      ) : (
        <MonitorWorkersView model={model} />
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
