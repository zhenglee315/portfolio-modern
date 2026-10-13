import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Icon } from './Icon';
import styles from './InlineField.module.css';

export type InlineFieldValue = string | number | boolean | null;
export type InlineFieldEditor = {
  type: 'text' | 'email' | 'url' | 'number' | 'multiline' | 'boolean';
  nullable?: boolean;
  checkbox?: boolean;
  maxLength?: number;
  validate?: (value: InlineFieldValue) => boolean;
};
export type InlineFieldCopy = {
  edit: (label: string) => string;
  clear: (label: string) => string;
  invalid: string;
  empty: string;
};

/** Edit a controlled scalar in place; the owner owns drafts, validation rules and persistence. */
export function InlineField({
  value,
  label,
  editor,
  onChange,
  copy,
}: {
  value: InlineFieldValue;
  label: string;
  editor: InlineFieldEditor;
  onChange: (value: InlineFieldValue) => void;
  copy: InlineFieldCopy;
}) {
  const errorId = `inline-field-${useId()}`;
  const valueId = `${errorId}-value`;
  const [editing, setEditing] = useState<{ start: InlineFieldValue; text: string } | null>(null);
  const input = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const restoreFocus = useRef(false);
  const active = editing !== null;
  const invalid = editor.validate?.(value) === false;
  useEffect(() => {
    if (active) input.current?.focus();
  }, [active]);

  const changeText = (text: string) => {
    setEditing((previous) => previous && { ...previous, text });
    const empty =
      text === '' && editor.nullable && (editor.type === 'number' || editing?.start === null);
    const number = text.trim() === '' ? NaN : Number(text);
    onChange(empty ? null : editor.type === 'number' && Number.isFinite(number) ? number : text);
  };
  const finish = (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing) {
      if (event.key === 'Escape') event.stopPropagation();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onChange(editing!.start);
    } else if (
      event.key !== 'Enter' ||
      (editor.type === 'multiline' && !event.ctrlKey && !event.metaKey)
    )
      return;
    else event.preventDefault();
    restoreFocus.current = true;
    setEditing(null);
  };
  const inputProps = {
    className: styles.input,
    value: editing?.text ?? '',
    'aria-label': label,
    'aria-invalid': invalid || undefined,
    'aria-describedby': invalid ? errorId : undefined,
    maxLength: editor.maxLength,
    autoComplete: 'off',
    autoCapitalize: 'none',
    onChange: (event: { currentTarget: { value: string } }) =>
      changeText(event.currentTarget.value),
    onBlur: () => setEditing(null),
    onKeyDown: finish,
  };

  return (
    <div className={styles.root} data-invalid={invalid || undefined}>
      {editor.type === 'boolean' ? (
        <div className={styles.boolean}>
          <label className={`form-check ${editor.checkbox ? '' : 'form-switch'}`}>
            <input
              className="form-check-input"
              type="checkbox"
              role={editor.checkbox ? undefined : 'switch'}
              aria-label={copy.edit(label)}
              aria-invalid={invalid || undefined}
              aria-describedby={invalid ? errorId : undefined}
              checked={value === true}
              onChange={(event) => onChange(event.currentTarget.checked)}
            />
          </label>
          {value === null && <span className={styles.empty}>{copy.empty}</span>}
          {editor.nullable && value !== null && (
            <button
              className={styles.clear}
              type="button"
              aria-label={copy.clear(label)}
              title={copy.clear(label)}
              onClick={() => onChange(null)}
            >
              <Icon name="close" />
            </button>
          )}
        </div>
      ) : active ? (
        editor.type === 'multiline' ? (
          <textarea
            {...inputProps}
            rows={4}
            ref={(node) => {
              input.current = node;
            }}
          />
        ) : (
          <input
            {...inputProps}
            type={editor.type === 'number' ? 'text' : editor.type}
            inputMode={editor.type === 'number' ? 'numeric' : undefined}
            ref={(node) => {
              input.current = node;
            }}
          />
        )
      ) : (
        <button
          className={styles.value}
          type="button"
          aria-label={copy.edit(label)}
          aria-describedby={invalid ? `${valueId} ${errorId}` : valueId}
          ref={(node) => {
            if (node && restoreFocus.current) {
              restoreFocus.current = false;
              node.focus();
            }
          }}
          onClick={() => setEditing({ start: value, text: value === null ? '' : String(value) })}
        >
          {value === null || value === '' ? (
            <span className={styles.empty}>{copy.empty}</span>
          ) : (
            String(value)
          )}
        </button>
      )}
      {editor.type !== 'boolean' && (
        <span className="visually-hidden" id={valueId}>
          {value === null || value === '' ? copy.empty : String(value)}
        </span>
      )}
      {invalid && (
        <p className={styles.error} id={errorId}>
          {copy.invalid}
        </p>
      )}
    </div>
  );
}
