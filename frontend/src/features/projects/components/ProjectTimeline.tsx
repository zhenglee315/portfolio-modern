import { useTranslation } from 'react-i18next';
import type { Locale } from '@/i18n/config';
import { monthLabel } from '@/shared/lib/dates';
import type { Project } from '../schemas/projects';
import { projectGroups } from '../model/projects';
import { ProjectCard } from './ProjectCard';
import styles from './Projects.module.css';

/** Keep month groups separate at the six-record preview boundary, matching the legacy view. */
export function ProjectTimeline({
  projects,
  locale,
  onDetail,
}: {
  projects: Project[];
  locale: Locale;
  onDetail?: (id: number) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className={styles['project-timeline']} data-decoration>
      {projectGroups(projects).map((group, i) => (
        <div key={`${group.start}-${i}`} className={styles['project-time-row']}>
          <div className={styles['project-start']}>
            <time dateTime={group.start}>{monthLabel(group.start, locale)}</time>
            <span>{t('ui.projectStart')}</span>
          </div>
          <div className={styles['project-group-cards']}>
            {group.members.map((project) => (
              <ProjectCard key={project.id} project={project} locale={locale} onDetail={onDetail} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
