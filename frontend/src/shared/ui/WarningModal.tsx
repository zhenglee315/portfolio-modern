import { useId, useRef, type KeyboardEvent } from 'react';
import Modal from 'react-bootstrap/Modal';
import { cycleDialogTab } from '@/shared/lib/focus';
import { Icon } from './Icon';
import { CloseButton } from './CloseButton';
import styles from './WarningModal.module.css';

/** Present warnings or confirmations; owners supply copy, intent and callbacks. */
export default function WarningModal({
  title,
  message,
  closeLabel,
  onClose,
  confirm,
  layout = 'standard',
  busy = false,
}: {
  title: string;
  message: string;
  closeLabel: string;
  onClose: () => void;
  layout?: 'standard' | 'prompt';
  busy?: boolean;
  confirm?: {
    label: string;
    cancelLabel: string;
    onConfirm: () => void;
    variant?: 'primary' | 'danger' | 'success';
  };
}) {
  const id = useId();
  const cancel = useRef<HTMLButtonElement>(null);
  return (
    <Modal
      show
      centered
      scrollable
      onHide={() => {
        if (!busy) onClose();
      }}
      onEntered={(node: HTMLElement) => {
        // Strict-mode replay can move initial focus to the dialog; preserve any user focus.
        if (node.ownerDocument.activeElement === node) cancel.current?.focus();
      }}
      onKeyDown={(event: KeyboardEvent<HTMLElement>) => cycleDialogTab(event, event.currentTarget)}
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-message`}
      className={`${styles.dialog} ${layout === 'prompt' ? styles.prompt : ''}`}
      contentClassName={styles.content}
      backdropClassName={styles.backdrop}
    >
      {layout === 'prompt' && confirm && (
        <div className={styles.badge} data-variant={confirm.variant} aria-hidden="true">
          <Icon name="warning" />
        </div>
      )}
      <Modal.Header>
        <Modal.Title as="h2" id={`${id}-title`}>
          {confirm && layout === 'standard' && (
            <Icon
              name="warning"
              className={`${confirm.variant === 'danger' ? 'text-danger' : 'text-warning'} me-2`}
            />
          )}
          {title}
        </Modal.Title>
        <CloseButton
          className={styles.close}
          onClose={onClose}
          label={closeLabel}
          disabled={busy}
        />
      </Modal.Header>
      <Modal.Body>
        <p id={`${id}-message`}>{message}</p>
      </Modal.Body>
      <Modal.Footer>
        {confirm ? (
          <>
            <button
              type="button"
              ref={cancel}
              className={`btn btn-outline-secondary ${styles.action}`}
              onClick={onClose}
              autoFocus
              disabled={busy}
            >
              <Icon name="close" />
              {confirm.cancelLabel}
            </button>
            <button
              type="button"
              className={`btn btn-${confirm.variant ?? 'primary'} ${styles.action}`}
              onClick={confirm.onConfirm}
              disabled={busy}
              aria-busy={busy || undefined}
            >
              <Icon name="check" />
              {confirm.label}
            </button>
          </>
        ) : (
          <button type="button" className={styles.confirm} onClick={onClose}>
            {closeLabel}
          </button>
        )}
      </Modal.Footer>
    </Modal>
  );
}
