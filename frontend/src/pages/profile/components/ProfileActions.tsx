import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useProfileEditor } from '../model/editor-context';
import { Icon } from './ProfileIcon';
import styles from '../ProfilePage.module.css';

/** Keep read-only preview beside cancel and the sole save action, with status above the controls. */
export function ProfileActions({
  publicHref,
  onPreview,
}: {
  publicHref: string;
  onPreview: () => void;
}) {
  const { t } = useTranslation();
  const { dirty, hasSaved, cancel, busy, canUpdate } = useProfileEditor();
  return (
    <div className={styles.headingTools}>
      <div className={styles.headingMeta}>
        <span className={styles.draftStatus} role="status" aria-live="polite" aria-atomic="true">
          <Icon name={dirty ? 'clock' : 'check'} />
          {t(
            `profileEditor.${busy ? 'saving' : dirty ? 'dirty' : hasSaved ? 'clean' : 'localDraft'}`,
          )}
        </span>
        <Link
          className={styles.textButton}
          to={publicHref}
          aria-disabled={busy}
          onClick={(event) => {
            if (busy) event.preventDefault();
          }}
        >
          {t('profileEditor.viewPublic')}
          <Icon name="arrow" />
        </Link>
      </div>
      <div className={styles.headingActions}>
        <button
          type="button"
          className={styles.button}
          disabled={busy}
          onClick={onPreview}
          aria-haspopup="dialog"
          data-profile-preview-trigger="showcase"
        >
          <Icon name="eye" />
          {t('profileEditor.previewDraft')}
        </button>
        <button type="button" className={styles.button} onClick={cancel} disabled={!dirty || busy}>
          {t('profileEditor.cancel')}
        </button>
        <button
          disabled={busy || !dirty || !canUpdate}
          type="submit"
          form="profile-editor-form"
          className={`${styles.button} ${styles.primary}`}
        >
          {t('profileEditor.save')}
        </button>
      </div>
    </div>
  );
}
