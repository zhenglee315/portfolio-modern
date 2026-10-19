import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { Locale } from '@/i18n/config';
import { queryCopy } from '@/i18n/query-copy';
import { usePortfolioContext } from '@/shared/context/portfolio';
import { usePagedCollection } from '@/shared/hooks/usePagedCollection';
import { QueryStatus } from '@/shared/ui/QueryStatus';
import { projectsQuery, useProjects } from '../api/projects';
import { ProjectsView } from './ProjectsView';

/** Own API pagination and recovery; the public view also accepts local draft projections. */
export function ProjectsSection({
  locale,
  locked = false,
  enabled = true,
  localeControl,
}: {
  locale: Locale;
  locked?: boolean;
  enabled?: boolean;
  localeControl?: ReactNode;
}) {
  const { t } = useTranslation();
  const context = usePortfolioContext();
  const query = useProjects(locale, enabled);
  const collection = usePagedCollection(
    query,
    projectsQuery(locale, undefined, context?.site?.site_id, context?.access).queryKey,
    locked,
  );
  const copy = queryCopy(t, query.error, !!query.data);
  return (
    <ProjectsView
      locale={locale}
      localeControl={localeControl}
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
