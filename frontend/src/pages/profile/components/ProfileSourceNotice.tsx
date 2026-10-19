import { useTranslation } from 'react-i18next';
import type { ProfileDraft } from '@/features/profile-content';
import { EditorNotice } from './EditorFields';
import styles from '../ProfilePage.module.css';

/** Explicitly distinguish API-backed copies from legacy examples and preserve old saved drafts. */
export function ProfileSourceNotice({
  source,
  current,
  hasSaved,
  onLoad,
  disabled,
}: {
  source: ProfileDraft;
  current: ProfileDraft;
  hasSaved: boolean;
  onLoad: () => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const legacy = hasSaved && current.revision === undefined;
  return (
    <div className={styles.sourceNotice}>
      <EditorNotice icon="check">
        {t(
          `profileEditor.${legacy ? 'legacySource' : current.source ? 'apiSource' : 'emptySource'}`,
          { count: source.projectOrder.length },
        )}
      </EditorNotice>
      {legacy && source.source && (
        <button type="button" className={styles.button} disabled={disabled} onClick={onLoad}>
          {t('profileEditor.loadSource')}
        </button>
      )}
    </div>
  );
}
