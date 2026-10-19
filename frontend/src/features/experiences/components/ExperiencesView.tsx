import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { Locale } from '@/i18n/config';
import { SectionHeader } from '@/shared/ui/SectionHeader';
import { ExpandableCollection } from '@/shared/ui/ExpandableCollection';
import type { Experience } from '../schemas/experiences';
import { ExperienceCard } from './ExperienceCard';
import styles from './Experiences.module.css';

/** One timeline presentation serves API pages and local drafts; the caller owns data and loading. */
export function ExperiencesView({
  locale,
  records,
  total = records.length,
  hasMore = false,
  busy = false,
  error,
  status,
  yearRange,
  onLoadMore = () => {},
}: {
  locale: Locale;
  records: Experience[];
  total?: number;
  hasMore?: boolean;
  busy?: boolean;
  error?: string;
  status?: ReactNode;
  yearRange?: string;
  onLoadMore?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      <SectionHeader
        eyebrow={t('ui.experienceEyebrow')}
        title={t('ui.experienceTitle')}
        note={yearRange}
      />
      {status}
      {!!records.length && (
        <div className={styles.collection} data-timeline-collection="experiences">
          <ExpandableCollection
            className={styles.disclosure}
            items={records}
            total={total}
            hasMore={hasMore}
            busy={busy}
            error={error}
            copy={{
              more: t('ui.moreExperiences'),
              less: t('ui.lessExperiences'),
              load: t('ui.moreExperiences'),
              loading: t('ui.loading'),
            }}
            onLoadMore={onLoadMore}
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
