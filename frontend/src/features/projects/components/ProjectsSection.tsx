import { lazy, Suspense, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { Locale } from '@/i18n/config';
import { queryCopy } from '@/i18n/query-copy';
import { usePortfolioContext } from '@/shared/context/portfolio';
import { usePagedCollection } from '@/shared/hooks/usePagedCollection';
import { useReturnFocus } from '@/shared/hooks/useReturnFocus';
import { QueryStatus } from '@/shared/ui/QueryStatus';
import { SectionHeader } from '@/shared/ui/SectionHeader';
import { ExpandableCollection } from '@/shared/ui/ExpandableCollection';
import { projectsQuery, useProjects } from '../api/projects';
import { ProjectTimeline } from './ProjectTimeline';
import styles from './Projects.module.css';

import { SectionState } from '@/shared/ui/SectionState';
import { SectionBoundary } from '@/shared/ui/SectionBoundary';

const ProjectDetail = lazy(() => import('./ProjectDetail'));

/** Compose project pages with the same disclosure and recovery policy as experiences. */
export function ProjectsSection({
  locale,
  locked = false,
  localeControl,
  enabled = true,
}: {
  locale: Locale;
  locked?: boolean;
  localeControl?: ReactNode;
  enabled?: boolean;
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
  const [selectedId, setSelectedId] = useState<number>();
  const selected = collection.records.find((project) => project.id === selectedId);
  const rememberTrigger = useReturnFocus(!!selected);
  return (
    <>
      <SectionHeader
        eyebrow={t('ui.projectsEyebrow')}
        title={t('ui.projectsTitle')}
        note={t('ui.projectsNote')}
      />
      <QueryStatus
        {...collection.status}
        copy={{ ...copy, retry: collection.invalid ? t('ui.reloadSection') : copy.retry }}
      />
      {!!collection.records.length && (
        <div className={styles.collection} data-timeline-collection="projects">
          <ExpandableCollection
            className={styles.disclosure}
            items={collection.records}
            total={collection.total}
            hasMore={query.hasNextPage}
            busy={query.isFetchingNextPage || locked}
            error={query.isFetchNextPageError ? copy.error : undefined}
            copy={{
              more: t('ui.moreProjects'),
              less: t('ui.lessProjects'),
              load: t('ui.moreProjects'),
              loading: t('ui.loading'),
            }}
            onLoadMore={collection.onLoadMore}
            renderItems={(items) => (
              <ProjectTimeline
                projects={items}
                locale={locale}
                onDetail={(id, trigger) => {
                  rememberTrigger(trigger);
                  setSelectedId(id);
                }}
              />
            )}
          />
        </div>
      )}
      {selected && (
        <SectionBoundary
          resetKey={`${context?.site?.site_id}:${locale}:${selected.id}`}
          message={t('ui.unavailable')}
          retryLabel={t('ui.reloadPage')}
          reloadOnRetry
          fallback={
            <button type="button" className="text-link" onClick={() => setSelectedId(undefined)}>
              {t('ui.close')}
            </button>
          }
        >
          <Suspense fallback={<SectionState message={t('ui.loading')} busy />}>
            <ProjectDetail
              project={selected}
              localeControl={localeControl}
              locale={locale}
              onClose={() => setSelectedId(undefined)}
            />
          </Suspense>
        </SectionBoundary>
      )}
    </>
  );
}
