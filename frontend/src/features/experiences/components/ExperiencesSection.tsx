import { useTranslation } from 'react-i18next';
import type { Locale } from '@/i18n/config';
import { queryCopy } from '@/i18n/query-copy';
import { usePortfolioContext } from '@/shared/context/portfolio';
import { usePagedCollection } from '@/shared/hooks/usePagedCollection';
import { QueryStatus } from '@/shared/ui/QueryStatus';
import { experiencesQuery, useExperiences } from '../api/experiences';
import { ExperiencesView } from './ExperiencesView';

/** Own API pagination and recovery; the public view also accepts local draft projections. */
export function ExperiencesSection({
  locale,
  locked = false,
  enabled = true,
  yearRange,
}: {
  locale: Locale;
  locked?: boolean;
  enabled?: boolean;
  yearRange?: string;
}) {
  const { t } = useTranslation();
  const context = usePortfolioContext();
  const query = useExperiences(locale, enabled);
  const collection = usePagedCollection(
    query,
    experiencesQuery(locale, undefined, context?.site?.site_id, context?.access).queryKey,
    locked,
  );
  const copy = queryCopy(t, query.error, !!query.data);
  return (
    <ExperiencesView
      locale={locale}
      yearRange={yearRange}
      records={collection.records}
      total={collection.total}
      hasMore={query.hasNextPage}
      busy={query.isFetchingNextPage || locked}
      error={query.isFetchNextPageError ? copy.error : undefined}
      onLoadMore={collection.onLoadMore}
      status={
        <QueryStatus
          {...collection.status}
          copy={{ ...copy, retry: collection.invalid ? t('ui.reloadSection') : copy.retry }}
        />
      }
    />
  );
}
