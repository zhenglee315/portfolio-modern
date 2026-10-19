import { lazy, Suspense, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { Locale } from '@/i18n/config';
import { useReturnFocus } from '@/shared/hooks/useReturnFocus';
import { SectionHeader } from '@/shared/ui/SectionHeader';
import { ExpandableCollection } from '@/shared/ui/ExpandableCollection';
import { SectionState } from '@/shared/ui/SectionState';
import { SectionBoundary } from '@/shared/ui/SectionBoundary';
import type { Project } from '../schemas/projects';
import { ProjectTimeline } from './ProjectTimeline';
import styles from './Projects.module.css';

const ProjectDetail = lazy(() => import('./ProjectDetail'));

/** Share homepage month groups, card disclosure and detail modals with unsaved draft previews. */
export function ProjectsView({
  locale,
  records,
  total = records.length,
  hasMore = false,
  busy = false,
  error,
  status,
  localeControl,
  onLoadMore = () => {},
}: {
  locale: Locale;
  records: Project[];
  total?: number;
  hasMore?: boolean;
  busy?: boolean;
  error?: string;
  status?: ReactNode;
  localeControl?: ReactNode;
  onLoadMore?: () => void;
}) {
  const { t } = useTranslation();
  const [selectedId, setSelectedId] = useState<number>();
  const selected = records.find((project) => project.id === selectedId);
  const rememberTrigger = useReturnFocus(!!selected);
  return (
    <>
      <SectionHeader
        eyebrow={t('ui.projectsEyebrow')}
        title={t('ui.projectsTitle')}
        note={t('ui.projectsNote')}
      />
      {status}
      {!!records.length && (
        <div className={styles.collection} data-timeline-collection="projects">
          <ExpandableCollection
            className={styles.disclosure}
            items={records}
            total={total}
            hasMore={hasMore}
            busy={busy}
            error={error}
            copy={{
              more: t('ui.moreProjects'),
              less: t('ui.lessProjects'),
              load: t('ui.moreProjects'),
              loading: t('ui.loading'),
            }}
            onLoadMore={onLoadMore}
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
          resetKey={`${locale}:${selected.id}`}
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
