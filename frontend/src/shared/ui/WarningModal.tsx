import { useId, type KeyboardEvent } from 'react';
import Modal from 'react-bootstrap/Modal';
import { cycleDialogTab } from '@/shared/lib/focus';
import { Icon } from './Icon';
import styles from './WarningModal.module.css';

/** Reuse Bootstrap's Escape, backdrop, focus trap and focus restoration for account warnings. */
export default function WarningModal({
  title,
  message,
  closeLabel,
  onClose,
}: {
  title: string;
  message: string;
  closeLabel: string;
  onClose: () => void;
}) {
  const id = useId();
  return (
    <Modal
      show
      centered
      onHide={onClose}
      onKeyDown={(event: KeyboardEvent<HTMLElement>) => cycleDialogTab(event, event.currentTarget)}
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-message`}
      className={styles.dialog}
      contentClassName={styles.content}
      backdropClassName={styles.backdrop}
    >
      <Modal.Header>
        <Modal.Title as="h2" id={`${id}-title`}>
          {title}
        </Modal.Title>
        <button type="button" className={styles.close} onClick={onClose} aria-label={closeLabel}>
          <Icon name="close" />
        </button>
      </Modal.Header>
      <Modal.Body>
        <p id={`${id}-message`}>{message}</p>
      </Modal.Body>
      <Modal.Footer>
        <button type="button" className={styles.confirm} onClick={onClose}>
          {closeLabel}
        </button>
      </Modal.Footer>
    </Modal>
  );
}
