import { useId, type KeyboardEvent, type ReactNode } from 'react';
import Modal from 'react-bootstrap/Modal';
import { useTranslation } from 'react-i18next';
import type { Locale } from '@/i18n/config';
import { dateCopy } from '@/i18n/date-copy';
import { tagCopy } from '@/i18n/tag-copy';
import { projectPeriod } from '@/shared/lib/dates';
import { cycleDialogTab } from '@/shared/lib/focus';
import { labelTags } from '@/shared/lib/tag-layout';
import { ExpandableTagList } from '@/shared/ui/ExpandableTagList';
import { Icon } from '@/shared/ui/Icon';
import type { Project } from '../schemas/projects';
import styles from './ProjectDetail.module.css';

/** Present legacy project details with shared skill disclosure and Bootstrap's focus lifecycle.
 * @param props Selected stable project, URL locale and close callback.
 * @returns A responsive detail dialog with ordered architecture steps and the complete skill set.
 * Shared Tab-boundary handling complements Bootstrap activation, Escape and focus restoration.
 * No detail request is issued; API strings remain escaped plain text.
 */
export default function ProjectDetail({
  project,
  locale,
  onClose,
  localeControl,
}: {
  project: Project;
  locale: Locale;
  onClose: () => void;
  localeControl?: ReactNode;
}) {
  const { t } = useTranslation();
  const id = useId();
  const detail = project.detail;
  const flow = detail?.flow?.filter((label) => label.trim()) ?? [];
  return (
    <Modal
      show
      onHide={onClose}
      onKeyDown={(event: KeyboardEvent<HTMLElement>) => cycleDialogTab(event, event.currentTarget)}
      aria-labelledby={id}
      className={styles.dialog}
      dialogClassName={styles.viewport}
      contentClassName={styles.content}
      backdropClassName={styles.backdrop}
      centered
      scrollable
    >
      <Modal.Header>
        <div>
          <p className="eyebrow">{project.projectTitle}</p>
          <Modal.Title as="h2" id={id}>
            {project.projectName}
          </Modal.Title>
        </div>
        {localeControl}
        <button
          className={styles.close}
          type="button"
          aria-label={t('ui.closeProject')}
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      </Modal.Header>
      <Modal.Body>
        <p className={styles.organization}>{project.organizationName}</p>
        <p className={styles.organizationTitle}>{project.organizationTitle}</p>
        <p className={styles.period}>{projectPeriod(project, locale, dateCopy(t))}</p>
        {detail?.workflowDescription?.trim() && (
          <section>
            <h3>{t('ui.workflowDescription')}</h3>
            <p className="plain-text">{detail.workflowDescription}</p>
          </section>
        )}
        {!!flow.length && (
          <ol className={styles.flow}>
            {flow.map((label, index) => (
              <li key={index}>
                <span data-flow-step>{label}</span>
                {index < flow.length - 1 && <Icon name="arrowRight" className={styles.connector} />}
              </li>
            ))}
          </ol>
        )}
        {(['technicalDescription', 'contribution', 'outcome'] as const).map(
          (key) =>
            detail?.[key]?.trim() && (
              <section key={key}>
                <h3>{t(`ui.${key}`)}</h3>
                <p className="plain-text">{detail[key]}</p>
              </section>
            ),
        )}
        <ExpandableTagList items={labelTags(project.skills)} copy={tagCopy(t)} />
      </Modal.Body>
    </Modal>
  );
}
