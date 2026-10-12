import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Locale } from '@/i18n/config';
import { queryCopy } from '@/i18n/query-copy';
import { usePortfolioContext } from '@/shared/context/portfolio';
import { observeViewport } from '@/shared/lib/viewport';
import { QueryStatus } from '@/shared/ui/QueryStatus';
import { SectionHeader } from '@/shared/ui/SectionHeader';
import { SectionBoundary } from '@/shared/ui/SectionBoundary';
import { StopCarousel } from './StopCarousel';
import { JourneySummary } from './JourneySummary';
import { useJourney } from '../api/journey';
import styles from './Journey.module.css';

const JourneyMap = lazy(() => import('./JourneyMap'));

/** Own full-index feedback and stable selection with a progressively enhanced atlas.
 * Lazy failure retains accessible destinations and never hides sibling sections.
 */
export function JourneySection({
  locale,
  suspended = false,
  enabled = true,
}: {
  locale: Locale;
  suspended?: boolean;
  enabled?: boolean;
}) {
  const { t } = useTranslation();
  const context = usePortfolioContext();
  const query = useJourney(locale, enabled);
  const [selectedId, setSelectedId] = useState<number>();
  const [visible, setVisible] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const region = useRef<HTMLDivElement>(null);
  const selected = query.data?.find((entry) => entry.id === selectedId) ?? query.data?.[0];
  useEffect(() => {
    const target = region.current;
    if (!target) return;
    const disconnectVisibility = observeViewport(target, setVisible);
    const disconnectDemand = observeViewport(
      target,
      (near) => {
        if (near) setLoaded(true);
      },
      '200px',
    );
    return () => {
      disconnectVisibility();
      disconnectDemand();
    };
  }, []);
  const count = new Set(query.data?.map((entry) => entry.city)).size;
  const fallback =
    query.data?.length && selected ? (
      <div className={styles.panel}>
        <JourneySummary
          entry={selected}
          locale={locale}
          index={query.data.indexOf(selected)}
          count={query.data.length}
          nextCity={query.data[query.data.indexOf(selected) + 1]?.city}
        />
        <StopCarousel
          items={query.data}
          selectedId={selected.id}
          locale={locale}
          onSelect={setSelectedId}
        />
      </div>
    ) : null;
  return (
    <>
      <SectionHeader
        eyebrow={t('ui.journeyEyebrow')}
        title={t('ui.journeyTitle')}
        note={
          query.data
            ? t(count === 1 ? 'ui.journeySummaryOne' : 'ui.journeySummary', { count })
            : undefined
        }
      />
      <QueryStatus
        pending={query.isPending}
        failed={query.isError}
        empty={query.data?.length === 0}
        hasData={!!query.data}
        fetching={query.isFetching}
        copy={queryCopy(t, query.error, !!query.data)}
        onRetry={() => void query.refetch()}
      />
      <div ref={region} className={styles.placeholder}>
        {query.data?.length && selected ? (
          <SectionBoundary
            resetKey={`${context?.site?.site_id}:${locale}`}
            message={t('ui.mapUnavailable')}
            retryLabel={t('ui.reloadPage')}
            reloadOnRetry
            fallback={fallback}
          >
            {loaded ? (
              <Suspense fallback={fallback}>
                <JourneyMap
                  items={query.data}
                  selectedId={selected.id}
                  locale={locale}
                  onSelect={setSelectedId}
                  suspended={suspended || !visible}
                />
              </Suspense>
            ) : (
              fallback
            )}
          </SectionBoundary>
        ) : null}
      </div>
    </>
  );
}
