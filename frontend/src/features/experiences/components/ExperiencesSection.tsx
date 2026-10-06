import { useTranslation } from 'react-i18next';
import type { Locale } from '@/i18n/config';
import { queryCopy } from '@/i18n/query-copy';
import { usePagedCollection } from '@/shared/hooks/usePagedCollection';
import { QueryStatus } from '@/shared/ui/QueryStatus';
import { SectionHeader } from '@/shared/ui/SectionHeader';
import { ExpandableCollection } from '@/shared/ui/ExpandableCollection';
import { experiencesQuery, useExperiences } from '../api/experiences';
import { ExperienceCard } from './ExperienceCard';
import styles from './Experiences.module.css';

/** Own independently recoverable experience pages and compose reusable disclosure UI. */
export function ExperiencesSection({
  locale,
  locked = false,
  yearRange,
}: {
  locale: Locale;
  locked?: boolean;
  yearRange?: string;
}) {
  const { t } = useTranslation();
  const query = useExperiences(locale);
  const collection = usePagedCollection(query, experiencesQuery(locale).queryKey, locked);
  const { records, total, invalid } = collection;
  const copy = queryCopy(t, query.error, !!query.data);
  return (
    <>
      <SectionHeader
        eyebrow={t('ui.experienceEyebrow')}
        title={t('ui.experienceTitle')}
        note={yearRange}
      />
      <QueryStatus
        {...collection.status}
        copy={{ ...copy, retry: invalid ? t('ui.reloadSection') : copy.retry }}
      />
      {!!records.length && (
        <div className={styles.collection} data-timeline-collection="experiences">
          <ExpandableCollection
            className={styles.disclosure}
            items={records}
            total={total}
            hasMore={query.hasNextPage}
            busy={query.isFetchingNextPage || locked}
            error={query.isFetchNextPageError ? copy.error : undefined}
            copy={{
              more: t('ui.moreExperiences'),
              less: t('ui.lessExperiences'),
              load: t('ui.moreExperiences'),
              loading: t('ui.loading'),
            }}
            onLoadMore={collection.onLoadMore}
            renderItems={(items) => (
              <div className={styles.timeline}>
                {items.map((entry) => (
                  <ExperienceCard key={entry.id} entry={entry} locale={locale} />
                ))}
              </div>
            )}
          />
        </div>
      )}
    </>
  );
}
