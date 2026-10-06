import { useTranslation } from 'react-i18next';
import type { Locale } from '@/i18n/config';
import { dateCopy } from '@/i18n/date-copy';
import { tagCopy } from '@/i18n/tag-copy';
import { periodLabels } from '@/shared/lib/dates';
import { labelTags } from '@/shared/lib/tag-layout';
import { Icon } from '@/shared/ui/Icon';
import { ExpandableTagList } from '@/shared/ui/ExpandableTagList';
import type { Experience } from '../schemas/experiences';
import styles from './Experiences.module.css';

/** Present one career DTO with complete local tags and optional supplementary period. */
export function ExperienceCard({ entry, locale }: { entry: Experience; locale: Locale }) {
  const { t } = useTranslation();
  const copy = dateCopy(t);
  return (
    <article className={styles['experience-row']} data-decoration data-experience-id={entry.id}>
      <div className={styles['experience-date']}>
        {periodLabels(entry, locale, copy).date}
        <span>{entry.countryName}</span>
      </div>
      <div className={styles['experience-card']}>
        <div className={styles['experience-title']}>
          <div>
            <h3>
              <Icon
                name={entry.type === 'education' ? 'education' : 'building'}
                label={t(`ui.${entry.type === 'education' ? 'education' : 'work'}`)}
                className={styles.category}
              />
              <span>{entry.organizationName}</span>
            </h3>
            <div className={styles.company}>{entry.organizationTitle}</div>
          </div>
          <span className={styles.location}>{entry.city}</span>
        </div>
        <p className="plain-text">{entry.content}</p>
        {entry.detail && (
          <p className={`${styles['experience-ta']} plain-text`}>
            {entry.detail.content} · {periodLabels(entry.detail, locale, copy).date}
          </p>
        )}
        <ExpandableTagList items={labelTags(entry.skills)} copy={tagCopy(t)} />
      </div>
    </article>
  );
}
