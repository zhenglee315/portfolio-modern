import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { Locale } from '@/i18n/config';
import { observeViewport } from '@/shared/lib/viewport';
import { SectionHeader } from '@/shared/ui/SectionHeader';
import { SectionBoundary } from '@/shared/ui/SectionBoundary';
import { StopCarousel } from './StopCarousel';
import { JourneySummary } from './JourneySummary';
import type { JourneyStop } from '../schemas/journey';
import styles from './Journey.module.css';

const JourneyMap = lazy(() => import('./JourneyMap'));

/** Share the real homepage atlas, chapter controls and visibility lifecycle with local drafts. */
export function JourneyView({
  locale,
  items,
  suspended = false,
  status,
}: {
  locale: Locale;
  items?: JourneyStop[];
  suspended?: boolean;
  status?: ReactNode;
}) {
  const { t } = useTranslation();
  const [selectedId, setSelectedId] = useState<number>();
  const [visible, setVisible] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const region = useRef<HTMLDivElement>(null);
  const selected = items?.find((entry) => entry.id === selectedId) ?? items?.[0];
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
  const count = new Set(items?.map((entry) => entry.city)).size;
  const fallback =
    items?.length && selected ? (
      <div className={styles.panel}>
        <JourneySummary
          entry={selected}
          locale={locale}
          index={items.indexOf(selected)}
          count={items.length}
          nextCity={items[items.indexOf(selected) + 1]?.city}
        />
        <StopCarousel
          items={items}
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
          items
            ? t(count === 1 ? 'ui.journeySummaryOne' : 'ui.journeySummary', { count })
            : undefined
        }
      />
      {status}
      <div ref={region} className={styles.placeholder}>
        {items?.length && selected ? (
          <SectionBoundary
            resetKey={locale}
            message={t('ui.mapUnavailable')}
            retryLabel={t('ui.reloadPage')}
            reloadOnRetry
            fallback={fallback}
          >
            {loaded ? (
              <Suspense fallback={fallback}>
                <JourneyMap
                  items={items}
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
