import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Icon } from './Icon';
import {
  SearchableSelect,
  type SelectSource,
  type SelectCopy,
  type SelectOption,
} from './SearchableSelect';
import styles from './InlineField.module.css';

export type InlineFieldValue = string | number | boolean | null;
export type InlineFieldEditor = {
  type:
    'text' | 'email' | 'url' | 'number' | 'multiline' | 'boolean' | 'select' | 'searchable-select';
  selection?: {
    source: SelectSource;
    copy: SelectCopy;
    selected?: SelectOption;
    colored?: boolean;
  };
  nullable?: boolean;
  checkbox?: boolean;
  maxLength?: number;
  validate?: (value: InlineFieldValue) => boolean;
  options?: readonly { value: string | number; label: string }[];
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
  disabled = false,
  required = false,
  onComplete,
  onCancel,
}: {
  value: InlineFieldValue;
  label: string;
  editor: InlineFieldEditor;
  onChange: (value: InlineFieldValue, option?: SelectOption) => void;
  copy: InlineFieldCopy;
  disabled?: boolean;
  required?: boolean;
  /** Optional completion boundary for autosave owners; typing alone never submits. */
  onComplete?: () => void;
  /** Group editors restore the entire unsaved group on Escape. */
  onCancel?: () => void;
}) {
  const errorId = `inline-field-${useId()}`;
  const valueId = `${errorId}-value`;
  const [editing, setEditing] = useState<{ start: InlineFieldValue; text: string } | null>(null);
  const input = useRef<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(null);
  const restoreFocus = useRef(false);
  const skipBlur = useRef(false);
  const composing = useRef(false);
  const compositionBlur = useRef(false);
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
  const finish = (
    event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    if (event.nativeEvent.isComposing) {
      if (event.key === 'Escape') event.stopPropagation();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (onCancel) onCancel();
      else onChange(editing!.start);
    } else if (
      event.key !== 'Enter' ||
      (editor.type === 'multiline' && !event.ctrlKey && !event.metaKey)
    )
      return;
    else event.preventDefault();
    skipBlur.current = true;
    restoreFocus.current = true;
    setEditing(null);
    if (event.key !== 'Escape') onComplete?.();
  };
  const inputProps = {
    className: styles.input,
    value: editing?.text ?? '',
    'aria-label': label,
    'aria-invalid': invalid || undefined,
    'aria-describedby': invalid ? errorId : undefined,
    maxLength: editor.maxLength,
    disabled,
    'aria-required': required || undefined,
    autoComplete: 'off',
    autoCapitalize: 'none',
    onChange: (event: { currentTarget: { value: string } }) =>
      changeText(event.currentTarget.value),
    onBlur: () => {
      if (skipBlur.current) {
        skipBlur.current = false;
        return;
      }
      if (composing.current) {
        compositionBlur.current = true;
        return;
      }
      setEditing(null);
      onComplete?.();
    },
    onCompositionStart: () => {
      composing.current = true;
    },
    onCompositionEnd: (event: { currentTarget: { value: string } }) => {
      composing.current = false;
      if (compositionBlur.current) {
        compositionBlur.current = false;
        changeText(event.currentTarget.value);
        setEditing(null);
        onComplete?.();
      }
    },
    onKeyDown: finish,
  };

  return (
    <div className={styles.root} data-invalid={invalid || undefined}>
      {editor.type === 'searchable-select' && editor.selection ? (
        <SearchableSelect
          {...editor.selection}
          value={typeof value === 'boolean' ? null : value}
          label={copy.edit(label)}
          disabled={disabled}
          onCancel={onCancel}
          onChange={(next, option) => {
            onChange(next, option);
            onComplete?.();
          }}
        />
      ) : editor.type === 'boolean' ? (
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
              disabled={disabled}
              onChange={(event) => {
                onChange(event.currentTarget.checked);
                onComplete?.();
              }}
            />
          </label>
          {value === null && <span className={styles.empty}>{copy.empty}</span>}
          {editor.nullable && value !== null && (
            <button
              className={styles.clear}
              type="button"
              aria-label={copy.clear(label)}
              title={copy.clear(label)}
              disabled={disabled}
              onClick={() => {
                onChange(null);
                onComplete?.();
              }}
            >
              <Icon name="close" />
            </button>
          )}
        </div>
      ) : active ? (
        editor.type === 'select' ? (
          <select
            className={styles.input}
            value={
              value === null
                ? ''
                : String(
                    editor.options?.findIndex((option) => Object.is(option.value, value)) ?? -1,
                  )
            }
            aria-label={label}
            aria-required={required || undefined}
            aria-invalid={invalid || undefined}
            aria-describedby={invalid ? errorId : undefined}
            disabled={disabled}
            ref={(node) => {
              input.current = node;
            }}
            onBlur={inputProps.onBlur}
            onKeyDown={(event) => {
              // Keep native Enter/arrow selection; Escape abandons the unsaved group.
              if (event.key === 'Escape') finish(event);
            }}
            onChange={(event) => {
              const index = event.currentTarget.value;
              const option = editor.options?.[Number(index)];
              if (index !== '' && !option) return;
              onChange(index === '' ? null : option!.value);
              if (onComplete) {
                skipBlur.current = true;
                restoreFocus.current = true;
                setEditing(null);
                onComplete();
              }
            }}
          >
            <option value="">{copy.empty}</option>
            {editor.options?.map((option, index) => (
              <option key={index} value={index}>
                {option.label}
              </option>
            ))}
          </select>
        ) : editor.type === 'multiline' ? (
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
          disabled={disabled}
          ref={(node) => {
            if (node && !disabled && restoreFocus.current) {
              restoreFocus.current = false;
              if (document.activeElement === document.body) node.focus();
            }
          }}
          onClick={() => {
            skipBlur.current = false;
            setEditing({ start: value, text: value === null ? '' : String(value) });
          }}
        >
          {value === null || value === '' ? (
            <span className={styles.empty}>{copy.empty}</span>
          ) : editor.type === 'select' ? (
            (editor.options?.find((option) => Object.is(option.value, value))?.label ??
            String(value))
          ) : (
            String(value)
          )}
        </button>
      )}
      {editor.type !== 'boolean' && editor.nullable && value !== null && (
        <button
          type="button"
          className={styles.clear}
          disabled={disabled}
          aria-label={copy.clear(label)}
          title={copy.clear(label)}
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => {
            skipBlur.current = true;
            onChange(null);
            setEditing(null);
            onComplete?.();
          }}
        >
          <Icon name="close" />
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
