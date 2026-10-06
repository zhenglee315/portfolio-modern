import { useTranslation } from 'react-i18next';
import type { Locale } from '@/i18n/config';
import { dateCopy } from '@/i18n/date-copy';
import { periodLabels } from '@/shared/lib/dates';
import type { JourneyStop } from '../schemas/journey';
import styles from './Journey.module.css';

/** Share a chapter's readable career detail between static fallback and the enhanced map.
 * @param entry Validated selected destination; no second entity copy is retained.
 * @param index Zero-based position in the authoritative ordered index.
 * @param count Complete destination count.
 * @param nextCity Optional following city; the final stop never invents a return segment.
 */
export function JourneySummary({
  entry,
  locale,
  index,
  count,
  nextCity,
}: {
  entry: JourneyStop;
  locale: Locale;
  index: number;
  count: number;
  nextCity?: string;
}) {
  const { t } = useTranslation();
  return (
    <div className={styles.status}>
      <span className={styles.stepIndex}>
        {String(index + 1).padStart(2, '0')} / {String(count).padStart(2, '0')}
      </span>
      <div>
        <p className="mono">{periodLabels(entry, locale, dateCopy(t)).date}</p>
        <h3>{entry.organizationName}</h3>
        <p>
          {entry.organizationTitle} · {entry.city}, {entry.countryName}
        </p>
      </div>
      <span className={styles.routeLabel}>
        {nextCity
          ? `${entry.city.toUpperCase()} → ${nextCity.toUpperCase()}`
          : t('ui.routeNext', { city: entry.city.toUpperCase() })}
      </span>
    </div>
  );
}
