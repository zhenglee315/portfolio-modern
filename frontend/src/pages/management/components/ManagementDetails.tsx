import { useId, useRef, useState, type KeyboardEvent } from 'react';
import Modal from 'react-bootstrap/Modal';
import type { DataTableColumn } from '@/shared/ui/DataTable';
import { Icon, type IconName } from '@/shared/ui/Icon';
import WarningModal from '@/shared/ui/WarningModal';
import {
  InlineField,
  type InlineFieldCopy,
  type InlineFieldEditor,
  type InlineFieldValue,
} from '@/shared/ui/InlineField';
import { cycleDialogTab } from '@/shared/lib/focus';
import styles from '../ManagementPage.module.css';

export type ManagementDetailColumn<T> = DataTableColumn<T> & {
  editor?: (row: T) => InlineFieldEditor | undefined;
};

/** Keep editable drafts inside one dialog; query-owned records and backend data remain untouched. */
export function ManagementDetails<T extends object>({
  row,
  columns,
  icon,
  copy,
  onClose,
}: {
  row: T;
  columns: ManagementDetailColumn<T>[];
  icon: IconName;
  copy: {
    title: string;
    close: string;
    field: InlineFieldCopy;
    save: { title: string; message: string; confirm: string; cancel: string };
  };
  onClose: () => void;
}) {
  const id = useId();
  const initial = () =>
    Object.fromEntries(
      columns
        .filter((column) => column.editor?.(row))
        .map((column) => [column.id, column.value(row)]),
    ) as Record<string, InlineFieldValue>;
  const [draft, setDraft] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [confirmSave, setConfirmSave] = useState(false);
  const body = useRef<HTMLDivElement>(null);
  const saveButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const resume = useRef<{ scrollTop: number } | null>(null);
  const preview = { ...row, ...draft };
  const dirty = Object.keys(draft).some((field) => !Object.is(draft[field], saved[field]));
  const invalid = columns.some(
    (column) => column.editor?.(preview)?.validate?.(column.value(preview)) === false,
  );
  if (confirmSave)
    return (
      <WarningModal
        layout="prompt"
        title={copy.save.title}
        message={copy.save.message}
        closeLabel={copy.close}
        onClose={() => setConfirmSave(false)}
        confirm={{
          label: copy.save.confirm,
          cancelLabel: copy.save.cancel,
          variant: 'success',
          onConfirm: () => {
            setSaved(draft);
            setConfirmSave(false);
          },
        }}
      />
    );
  return (
    <Modal
      show
      centered
      scrollable
      onHide={onClose}
      onEntered={() => {
        if (!resume.current) return;
        if (body.current) body.current.scrollTop = resume.current.scrollTop;
        const focus = saveButton.current?.disabled ? closeButton.current : saveButton.current;
        focus?.focus({ preventScroll: true });
        resume.current = null;
      }}
      className={styles.detail}
      contentClassName={styles.detailContent}
      aria-labelledby={`${id}-detail-title`}
      data-dirty={dirty}
      onKeyDown={(event: KeyboardEvent<HTMLElement>) => cycleDialogTab(event, event.currentTarget)}
    >
      <Modal.Header closeButton closeLabel={copy.close}>
        <Modal.Title id={`${id}-detail-title`}>
          <Icon name={icon} />
          {copy.title}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body ref={body}>
        <dl className={styles.details}>
          {columns.map((column) => {
            const editor = column.editor?.(preview);
            return (
              <div key={column.id} data-editor={editor?.type}>
                <dt>{column.label}</dt>
                <dd>
                  {editor ? (
                    <InlineField
                      label={column.label}
                      value={column.value(preview)}
                      editor={editor}
                      copy={copy.field}
                      onChange={(value) =>
                        setDraft((previous) => ({ ...previous, [column.id]: value }))
                      }
                    />
                  ) : column.render ? (
                    column.render(preview)
                  ) : (
                    (column.value(preview) ?? '—')
                  )}
                </dd>
              </div>
            );
          })}
        </dl>
      </Modal.Body>
      <Modal.Footer>
        <button
          className={`btn ${dirty ? 'btn-outline-danger' : 'btn-outline-secondary'} ${styles.tableAction} ${styles.detailAction} ${styles.closeAction}`}
          type="button"
          ref={closeButton}
          onClick={onClose}
        >
          <Icon name="close" />
          {copy.close}
        </button>
        <button
          className={`btn ${dirty ? 'btn-success' : 'btn-outline-secondary'} ${styles.tableAction} ${styles.detailAction} ${styles.saveAction}`}
          type="button"
          ref={saveButton}
          value="save"
          disabled={!dirty || invalid}
          onClick={() => {
            resume.current = { scrollTop: body.current?.scrollTop ?? 0 };
            setConfirmSave(true);
          }}
        >
          Save
        </button>
      </Modal.Footer>
    </Modal>
  );
}
