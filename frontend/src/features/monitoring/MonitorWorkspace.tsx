import { useTranslation } from 'react-i18next';
import type { Locale } from '@/i18n/config';
import { HelpTooltip } from '@/shared/ui/HelpTooltip';
import { LoadingIndicator } from '@/shared/ui/LoadingIndicator';
import { SearchableSelect } from '@/shared/ui/SearchableSelect';
import { SectionBoundary } from '@/shared/ui/SectionBoundary';
import { MonitorFilters } from './MonitorFilters';
import { MonitorOverview } from './MonitorOverview';
import { MonitoringPanel } from './MonitoringPanel';
import { useMonitorOverview } from './useMonitorOverview';
import { overviewNumber } from './overview-model';
import styles from './MonitorOverview.module.css';

/** Render monitoring content inside the original management shell and inherited theme.
 * Navigation, account actions, background motion and page entrance remain owned by the page.
 * @author ZhengLee 2026.10.18
 */
export function MonitorWorkspace(props: {
  locale: Locale;
  enabled: boolean;
  accountId?: number;
  onDenied: () => void;
  motionPaused?: boolean;
}) {
  const { t } = useTranslation();
  const model = useMonitorOverview(props);
  const title = t(
    model.view === 'overview'
      ? 'overview.title'
      : model.view === 'workers'
        ? 'monitor.workers'
        : 'monitor.title',
  );
  if (model.denied) return <LoadingIndicator label={t('ui.loading')} />;
  return (
    <div
      className={styles.content}
      data-monitor-workspace
      data-monitor-view={model.view}
      data-monitoring
    >
      <div className={styles.pageHeading}>
        <div>
          <h1>{title}</h1>
          {model.view === 'overview' ? (
            <p className={styles.healthCoverage}>
              {t('overview.healthCoverage', {
                percent: overviewNumber(
                  model.valid ? model.availability.data?.coverage_percent : null,
                  props.locale,
                  1,
                ),
              })}
              <HelpTooltip label={t('overview.healthHelpLabel')} text={t('overview.healthHelp')} />
            </p>
          ) : (
            <p>{t('monitor.description')}</p>
          )}
        </div>
        {model.view === 'overview' && <MonitorFilters model={model} />}
      </div>
      {model.services.data && model.services.data.items.length > 1 && (
        <div className={styles.serviceSelect}>
          <SearchableSelect
            label={t('overview.service')}
            value={model.service?.id ?? null}
            source={{
              options: model.services.data.items.map((service) => ({
                value: service.id,
                label: service.name,
              })),
            }}
            copy={{
              search: t('overview.searchService'),
              empty: t('overview.noData'),
              loading: t('ui.loading'),
              error: t('ui.unavailable'),
              retry: t('ui.retry'),
              more: t('overview.more'),
            }}
            onChange={(value) => model.update({ service: String(value) })}
          />
        </div>
      )}
      {model.services.isError && (
        <div className={styles.notice} role="alert">
          {t('ui.unavailable')}
          <button type="button" onClick={() => void model.services.refetch()}>
            {t('ui.retry')}
          </button>
        </div>
      )}
      {model.services.isPending ? (
        <LoadingIndicator label={t('ui.loading')} />
      ) : model.view === 'overview' ? (
        model.valid ? (
          <MonitorOverview model={model} locale={props.locale} />
        ) : (
          <div role="alert" className={styles.notice}>
            {t('overview.dateHint')}
          </div>
        )
      ) : (
        <SectionBoundary
          resetKey={`monitor:${model.view}`}
          message={t('ui.unavailable')}
          retryLabel={t('ui.retry')}
        >
          <MonitoringPanel
            key={model.view}
            {...props}
            initialView={model.view}
            onViewChange={model.setView}
          />
        </SectionBoundary>
      )}
    </div>
  );
}
