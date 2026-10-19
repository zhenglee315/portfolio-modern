import { useId, useState, type KeyboardEvent } from 'react';
import Modal from 'react-bootstrap/Modal';
import { useTranslation } from 'react-i18next';
import type { ProfileCategory } from '@/features/profile-content';
import { cycleDialogTab } from '@/shared/lib/focus';
import { CloseButton } from '@/shared/ui/CloseButton';
import { CategoryPreview } from './ProfilePreview';
import { Icon } from './ProfileIcon';
import editorStyles from '../ProfilePage.module.css';
import styles from './ProfileDialog.module.css';

/** Display the current category draft without creating a second save or navigation action. */
export function SkillsPreview({ category }: { category: ProfileCategory }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const id = useId();
  const close = () => setOpen(false);
  return (
    <>
      <button
        type="button"
        className={editorStyles.textButton}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-profile-preview-trigger="skills"
      >
        <Icon name="eye" />
        {t('profileEditor.skillsPreviewTitle')}
      </button>
      <Modal
        show={open}
        centered
        scrollable
        onHide={close}
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-hint`}
        className={styles.dialog}
        contentClassName={styles.content}
        backdropClassName={styles.backdrop}
        onKeyDown={(event: KeyboardEvent<HTMLElement>) =>
          cycleDialogTab(event, event.currentTarget)
        }
      >
        <Modal.Header>
          <Modal.Title as="h2" id={`${id}-title`}>
            <Icon name="eye" className={editorStyles.accent} />
            {t('profileEditor.skillsPreviewTitle')}
          </Modal.Title>
          <CloseButton label={t('ui.close')} onClose={close} />
        </Modal.Header>
        <Modal.Body>
          <p id={`${id}-hint`} className={editorStyles.hint}>
            {t('profileEditor.skillsPreviewHint')}
          </p>
          <CategoryPreview category={category} />
        </Modal.Body>
      </Modal>
    </>
  );
}
