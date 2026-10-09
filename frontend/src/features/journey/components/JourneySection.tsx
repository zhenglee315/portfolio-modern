import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Locale } from '@/i18n/config';
import { queryCopy } from '@/i18n/query-copy';
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
}: {
  locale: Locale;
  suspended?: boolean;
}) {
  const { t } = useTranslation();
  const query = useJourney(locale);
  const [selectedId, setSelectedId] = useState<number>();
  const [visible, setVisible] = useState(false);
  const region = useRef<HTMLDivElement>(null);
  const selected = query.data?.find((entry) => entry.id === selectedId) ?? query.data?.[0];
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' },
    );
    if (region.current) observer.observe(region.current);
    return () => observer.disconnect();
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
        note={t(count === 1 ? 'ui.journeySummaryOne' : 'ui.journeySummary', { count })}
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
            resetKey={locale}
            message={t('ui.mapUnavailable')}
            retryLabel={t('ui.reloadPage')}
            reloadOnRetry
            fallback={fallback}
          >
            {visible ? (
              <Suspense fallback={fallback}>
                <JourneyMap
                  items={query.data}
                  selectedId={selected.id}
                  locale={locale}
                  onSelect={setSelectedId}
                  suspended={suspended}
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
