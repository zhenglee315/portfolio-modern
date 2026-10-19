import { useId, type KeyboardEvent } from 'react';
import Modal from 'react-bootstrap/Modal';
import { useTranslation } from 'react-i18next';
import { cycleDialogTab } from '@/shared/lib/focus';
import { CloseButton } from '@/shared/ui/CloseButton';
import { ProfileEditorContext, useProfileEditor } from '../model/editor-context';
import { ShowcasePreview } from './ShowcasePreview';
import { Icon } from './ProfileIcon';
import modalStyles from './ProfileDialog.module.css';
import styles from './ProfilePreviewModal.module.css';
import editorStyles from '../ProfilePage.module.css';

/** Preview one working copy with independent paging; Bootstrap restores focus and the editor scroll. */
export function ProfilePreviewModal({
  page,
  size,
  onSizeChange,
  onPageChange,
  onClose,
}: {
  page: number;
  size: number;
  onSizeChange: (size: number) => void;
  onPageChange: (page: number) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const editor = useProfileEditor();
  const id = useId();
  return (
    <Modal
      show
      centered
      scrollable
      onHide={onClose}
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-hint`}
      className={`${modalStyles.dialog} ${styles.dialog}`}
      contentClassName={modalStyles.content}
      backdropClassName={modalStyles.backdrop}
      onKeyDown={(event: KeyboardEvent<HTMLElement>) => {
        // Detail dialogs are rendered through a portal and own their own keyboard boundary.
        if (event.currentTarget.contains(event.target as Node))
          cycleDialogTab(event, event.currentTarget);
      }}
    >
      <Modal.Header>
        <div>
          <Modal.Title as="h2" id={`${id}-title`}>
            <Icon name="eye" />
            {t('profileEditor.showcase')}
          </Modal.Title>
          <p id={`${id}-hint`} className={editorStyles.hint}>
            {t('profileEditor.previewHint')}
          </p>
        </div>
        <CloseButton label={t('ui.close')} onClose={onClose} />
      </Modal.Header>
      <Modal.Body>
        <ProfileEditorContext.Provider
          value={{
            ...editor,
            projectPage: page,
            projectSize: size,
            openProjectPage: onPageChange,
            openProjectSize: onSizeChange,
          }}
        >
          <ShowcasePreview />
        </ProfileEditorContext.Provider>
      </Modal.Body>
    </Modal>
  );
}
