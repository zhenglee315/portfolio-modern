import { useTranslation } from 'react-i18next';
import { LoadingIndicator } from '@/shared/ui/LoadingIndicator';
import { useProfileEditor } from '../model/editor-context';
import styles from '../ProfilePage.module.css';

/** Loading/errors never substitute an empty collection or discard existing unsaved content. */
export function ProjectPageStatus() {
  const { t } = useTranslation();
  const { projectError, retryProjects, reloadContent } = useProfileEditor();
  return projectError ? (
    <div className={styles.stackSmall}>
      <p role="alert" className={styles.hint}>
        {t('profileEditor.projectLoadError')}
      </p>
      <button type="button" className={styles.button} onClick={retryProjects}>
        {t('ui.retry')}
      </button>
      <button type="button" className={styles.textButton} onClick={reloadContent}>
        {t('profileEditor.reloadServer')}
      </button>
    </div>
  ) : (
    <LoadingIndicator label={t('ui.loading')} />
  );
}
