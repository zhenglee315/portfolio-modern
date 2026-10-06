import { useTranslation } from 'react-i18next';
import type { Locale } from '@/i18n/config';
import { dateCopy } from '@/i18n/date-copy';
import { tagCopy } from '@/i18n/tag-copy';
import { projectPeriod } from '@/shared/lib/dates';
import { labelTags } from '@/shared/lib/tag-layout';
import { Icon } from '@/shared/ui/Icon';
import { ExpandableTagList } from '@/shared/ui/ExpandableTagList';
import type { Project } from '../schemas/projects';
import { hasProjectDetail } from '../model/projects';
import styles from './Projects.module.css';

/** Present complete project copy and local skills; meaningful detail controls are optional. */
export function ProjectCard({
  project,
  locale,
  onDetail,
}: {
  project: Project;
  locale: Locale;
  onDetail?: (id: number) => void;
}) {
  const { t } = useTranslation();
  return (
    <article className={styles['project-card']} data-project-id={project.id}>
      <div className={styles['project-top']}>
        <div className={styles['project-heading']}>
          <div className={styles['project-organization-name']}>{project.organizationName}</div>
          <div className={styles['project-period']}>
            {projectPeriod(project, locale, dateCopy(t))}
          </div>
        </div>
        {onDetail && hasProjectDetail(project) && (
          <button
            type="button"
            className={styles['project-open']}
            aria-label={t('ui.readProject', { projectName: project.projectName })}
            onClick={() => onDetail(project.id)}
          >
            <Icon name="arrow" pulse="disclosure" />
          </button>
        )}
      </div>
      <div className={styles['project-title']}>{project.projectTitle}</div>
      <h3>{project.projectName}</h3>
      <p className="plain-text">{project.intro}</p>
      <ExpandableTagList items={labelTags(project.skills)} copy={tagCopy(t)} />
    </article>
  );
}
