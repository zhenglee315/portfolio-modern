import { useId, useRef, useState, type KeyboardEvent } from 'react';
import Modal from 'react-bootstrap/Modal';
import type { DataTableColumn } from '@/shared/ui/DataTable';
import { Icon, type IconName } from '@/shared/ui/Icon';
import { CloseButton } from '@/shared/ui/CloseButton';
import WarningModal from '@/shared/ui/WarningModal';
import {
  InlineField,
  type InlineFieldCopy,
  type InlineFieldEditor,
  type InlineFieldValue,
} from '@/shared/ui/InlineField';
import { cycleDialogTab } from '@/shared/lib/focus';
import styles from '../ManagementPage.module.css';
import type { SelectOption } from '@/shared/ui/SearchableSelect';

export type ManagementDetailColumn<T> = DataTableColumn<T> & {
  editor?: (row: T) => InlineFieldEditor | undefined;
  /** Keep constrained fields in the draft while disabling edits for the current dependent values. */
  editUnavailableReason?: (row: T) => string | undefined;
  /** Projected display columns may edit a separate validated assignment, without sending the label. */
  assignment?: {
    field: string;
    value: (row: T) => InlineFieldValue;
    project?: (option: SelectOption) => Record<string, InlineFieldValue>;
  };
};

/** Display labels and write values remain separate, including nullable relation assignments. */
function assignmentValue<T>(column: ManagementDetailColumn<T>, row: T) {
  return column.assignment ? column.assignment.value(row) : column.value(row);
}

function assignmentField<T>(column: ManagementDetailColumn<T>) {
  return column.assignment?.field ?? column.id;
}

/** Keep unsaved drafts inside one dialog; the page persists confirmed changes. */
export function ManagementDetails<T extends object>({
  row,
  columns,
  icon,
  copy,
  onClose,
  onSave,
  busy = false,
  validate,
  changeDraft,
}: {
  row: T;
  columns: ManagementDetailColumn<T>[];
  icon: IconName;
  copy: {
    title: string;
    close: string;
    field: InlineFieldCopy;
    save: { title: string; message: string; confirm: string; cancel: string; conflict: string };
  };
  onClose: () => void;
  onSave: (changes: Record<string, InlineFieldValue>) => Promise<void>;
  busy?: boolean;
  validate?: (draft: T) => string | undefined;
  changeDraft?: (
    draft: T,
    field: string,
    value: InlineFieldValue,
  ) => Record<string, InlineFieldValue>;
}) {
  const id = useId();
  const initial = () =>
    Object.fromEntries(
      columns
        .filter((column) => column.editor?.(row))
        .map((column) => [assignmentField(column), assignmentValue(column, row)]),
    ) as Record<string, InlineFieldValue>;
  const [draft, setDraft] = useState(initial);
  const [saved] = useState(initial);
  const [confirmSave, setConfirmSave] = useState(false);
  const [saving, setSaving] = useState(false);
  const pending = busy || saving;
  const submitting = useRef(false);
  const body = useRef<HTMLDivElement>(null);
  const saveButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const resume = useRef<{ scrollTop: number } | null>(null);
  const preview = { ...row, ...draft };
  const dirty = Object.keys(saved).some((field) => !Object.is(draft[field], saved[field]));
  const issue = validate?.(preview);
  const invalid =
    !!issue ||
    columns.some(
      (column) => column.editor?.(preview)?.validate?.(assignmentValue(column, preview)) === false,
    );
  const currentValues = Object.fromEntries(
    columns.map((column) => [assignmentField(column), assignmentValue(column, row)]),
  );
  const conflict =
    !pending && Object.keys(saved).some((field) => !Object.is(saved[field], currentValues[field]));
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
            if (submitting.current) return;
            submitting.current = true;
            setConfirmSave(false);
            setSaving(true);
            const changes = Object.fromEntries(
              Object.keys(saved)
                .filter((field) => !Object.is(draft[field], saved[field]))
                .map((field) => [field, draft[field]!]),
            );
            void onSave(changes)
              .catch(() => undefined)
              .finally(() => {
                submitting.current = false;
                setSaving(false);
              });
          },
        }}
      />
    );
  return (
    <Modal
      show
      centered
      scrollable
      onHide={() => {
        if (!pending) onClose();
      }}
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
      <Modal.Header>
        <Modal.Title id={`${id}-detail-title`}>
          <Icon name={icon} />
          {copy.title}
        </Modal.Title>
        <CloseButton
          label={copy.close}
          onClose={() => {
            if (!pending) onClose();
          }}
        />
      </Modal.Header>
      <Modal.Body ref={body}>
        {conflict && <p role="alert">{copy.save.conflict}</p>}
        {issue && <p role="alert">{issue}</p>}
        <dl className={styles.details}>
          {columns.map((column) => {
            const editor = column.editor?.(preview);
            const unavailableReason = column.editUnavailableReason?.(preview);
            return (
              <div key={column.id} data-editor={editor?.type}>
                <dt>{column.label}</dt>
                <dd title={unavailableReason}>
                  {editor ? (
                    <InlineField
                      label={column.label}
                      value={assignmentValue(column, preview)}
                      editor={editor}
                      copy={copy.field}
                      disabled={pending || conflict || !!unavailableReason}
                      onChange={(value, option) =>
                        setDraft((previous) => ({
                          ...previous,
                          ...(changeDraft?.(preview, assignmentField(column), value) ?? {
                            [assignmentField(column)]: value,
                          }),
                          ...(option && column.assignment?.project?.(option)),
                        }))
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
          disabled={pending}
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
          disabled={!dirty || invalid || pending || conflict}
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
