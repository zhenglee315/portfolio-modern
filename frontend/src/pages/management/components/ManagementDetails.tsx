import { useId, useState, type KeyboardEvent } from 'react';
import Modal from 'react-bootstrap/Modal';
import type { DataTableColumn } from '@/shared/ui/DataTable';
import { Icon } from '@/shared/ui/Icon';
import { cycleDialogTab } from '@/shared/lib/focus';
import styles from '../ManagementPage.module.css';

/** Render configured record details; button preview state ends when the dialog closes. */
export function ManagementDetails<T>({
  row,
  columns,
  name,
  copy,
  onClose,
}: {
  row: T;
  columns: DataTableColumn<T>[];
  name: string;
  copy: { title: string; close: string };
  onClose: () => void;
}) {
  const id = useId();
  const [editing, setEditing] = useState(false);
  return (
    <Modal
      show
      centered
      scrollable
      onHide={onClose}
      className={styles.detail}
      contentClassName={styles.detailContent}
      aria-labelledby={`${id}-detail-title`}
      onKeyDown={(event: KeyboardEvent<HTMLElement>) => cycleDialogTab(event, event.currentTarget)}
    >
      <Modal.Header closeButton closeLabel={copy.close}>
        <Modal.Title id={`${id}-detail-title`}>
          {copy.title} · {name}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <dl className={styles.details}>
          {columns.map((column) => (
            <div key={column.id}>
              <dt>{column.label}</dt>
              <dd>{column.render ? column.render(row) : (column.value(row) ?? '—')}</dd>
            </div>
          ))}
        </dl>
      </Modal.Body>
      <Modal.Footer>
        <button
          className={`btn btn-outline-secondary ${styles.tableAction} ${styles.detailAction}`}
          type="button"
          onClick={onClose}
        >
          <Icon name="close" />
          {copy.close}
        </button>
        <button
          className={`btn ${editing ? 'btn-success' : 'btn-outline-secondary'} ${styles.tableAction} ${styles.detailAction}`}
          type="button"
          value={editing ? 'submit' : 'edit'}
          onClick={editing ? undefined : () => setEditing(true)}
        >
          {editing ? 'Submit' : 'Edit'}
        </button>
      </Modal.Footer>
    </Modal>
  );
}
