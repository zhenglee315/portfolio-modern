import { useId } from 'react';
import type { DataTableEditCopy } from '../lib/data-table-edit';
import { BooleanCell } from './BooleanCell';
import { InlineField, type InlineFieldEditor, type InlineFieldValue } from './InlineField';
import styles from './DataTableEditCell.module.css';

/** Reuse scalar editors and table switch styling; the group controller owns all saving.
 * Text completes on blur/Enter, multiline on blur/Ctrl+Enter, discrete values on selection.
 * @author ZhengLee 2026.10.16
 */
export function DataTableEditCell({
  value,
  label,
  rowId,
  editor,
  required,
  disabled,
  busy,
  reason,
  issue,
  feedback,
  retry,
  cancel,
  change,
  complete,
  copy,
}: {
  value: InlineFieldValue;
  label: string;
  rowId: string | number;
  editor: InlineFieldEditor;
  required: boolean;
  disabled: boolean;
  busy: boolean;
  reason?: string;
  issue?: 'required' | 'invalid';
  feedback?: string;
  retry?: () => void;
  cancel?: () => void;
  change: (value: InlineFieldValue) => void;
  complete: () => void;
  copy: DataTableEditCopy;
}) {
  const id = useId();
  return (
    <div
      className={styles.root}
      data-invalid={issue ? '' : undefined}
      aria-busy={busy || undefined}
    >
      {editor.type === 'boolean' && value === null && disabled ? (
        <span>{copy.empty}</span>
      ) : editor.type === 'boolean' ? (
        <div className={styles.boolean}>
          <BooleanCell
            value={value === true}
            label={label}
            rowId={rowId}
            readonly={copy.readonly}
            checkbox={editor.checkbox}
            disabled={disabled}
            busy={busy}
            saving={copy.saving}
            unavailableReason={reason}
            onChange={(value) => {
              change(value);
              complete();
            }}
          />
          {value === null && <span>{copy.empty}</span>}
          {editor.nullable && value !== null && (
            <button
              type="button"
              className={styles.clear}
              disabled={disabled || busy}
              aria-label={copy.clear(label)}
              onClick={() => {
                change(null);
                complete();
              }}
            >
              ×
            </button>
          )}
        </div>
      ) : (
        <InlineField
          value={value}
          label={label}
          editor={{
            ...editor,
            validate: (current) =>
              current === value ? !issue : editor.validate?.(current) !== false,
          }}
          disabled={disabled || busy}
          required={required}
          onChange={change}
          onComplete={complete}
          onCancel={cancel}
          copy={{ ...copy, invalid: issue === 'required' ? copy.required : copy.invalid }}
        />
      )}
      {editor.type === 'boolean' && issue && <p className={styles.error}>{copy[issue]}</p>}
      {feedback && (
        <div className={busy ? 'visually-hidden' : styles.feedback} role="status" id={id}>
          <span>{feedback}</span>
          {retry && (
            <button type="button" disabled={disabled || busy} onClick={retry}>
              {copy.retry}
            </button>
          )}
          {cancel && (
            <button type="button" disabled={busy} onClick={cancel}>
              {copy.cancel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
