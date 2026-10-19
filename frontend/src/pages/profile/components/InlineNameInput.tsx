import { useId, type Ref } from 'react';
import { Icon } from './ProfileIcon';
import styles from './InlineNameInput.module.css';

/** One compact, labeled control for live draft names; persistence stays with the page action. */
export function InlineNameInput({
  label,
  value,
  onChange,
  field,
  error,
  required = false,
  maxLength = 80,
  inputRef,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  field: string;
  error?: string;
  required?: boolean;
  maxLength?: number;
  inputRef?: Ref<HTMLInputElement>;
}) {
  const id = useId();
  return (
    <div className={styles.rename} data-editor-field={field}>
      <label htmlFor={id} className="visually-hidden">
        {label}
      </label>
      <div className={styles.field}>
        <Icon name="pencil" />
        <input
          ref={inputRef}
          id={id}
          type="text"
          value={value}
          maxLength={maxLength}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(event) => onChange(event.currentTarget.value)}
          onBlur={(event) => {
            const value = event.currentTarget.value;
            if (value !== value.trim()) onChange(value.trim());
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
              event.preventDefault();
              event.currentTarget.blur();
            }
          }}
        />
      </div>
      {error && (
        <small id={`${id}-error`} className={styles.error}>
          {error}
        </small>
      )}
    </div>
  );
}
