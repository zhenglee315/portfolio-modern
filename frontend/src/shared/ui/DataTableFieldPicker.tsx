import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import Dropdown from 'react-bootstrap/Dropdown';
import { tableToolbarMenuPosition } from '../lib/menu-position';
import styles from './DataTableMenu.module.css';

/** Shared checkbox disclosure; callers own visibility/search rules and selection constraints. */
export function DataTableFieldPicker({
  label,
  title = label,
  allLabel,
  options,
  allDisabled = false,
  onAllChange,
  onChange,
  className,
  toggleClassName,
  children,
}: {
  label: string;
  title?: string;
  allLabel: string;
  options: { id: string; label: string; checked: boolean; disabled?: boolean }[];
  allDisabled?: boolean;
  onAllChange: (checked: boolean) => void;
  onChange: (id: string, checked: boolean) => void;
  className?: string;
  toggleClassName?: string;
  children?: ReactNode;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  const focusFirst = useRef(false);
  const all = options.length > 0 && options.every((option) => option.checked);
  const mixed = !all && options.some((option) => option.checked);
  useEffect(() => {
    if (open && focusFirst.current) {
      menu.current?.querySelector<HTMLInputElement>('input:not(:disabled)')?.focus();
      focusFirst.current = false;
    }
  }, [open]);
  return (
    <Dropdown
      autoClose="outside"
      className={className}
      show={open}
      focusFirstItemOnShow={false}
      onToggle={(show, metadata) => {
        focusFirst.current = show && metadata.originalEvent?.type === 'keydown';
        setOpen(show);
      }}
    >
      <Dropdown.Toggle
        id={`${id}-toggle`}
        variant="outline-secondary"
        size="sm"
        type="button"
        className={toggleClassName}
        aria-label={label}
        aria-controls={`${id}-options`}
        title={title}
        disabled={!options.length}
      >
        {children}
      </Dropdown.Toggle>
      <Dropdown.Menu
        ref={menu}
        id={`${id}-options`}
        role="group"
        aria-labelledby={`${id}-toggle`}
        align="start"
        className={styles.menu}
        popperConfig={tableToolbarMenuPosition}
        onKeyDown={(event) => {
          // Space/Tab remain native; arrows move among enabled choices without toggling them.
          if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
          event.preventDefault();
          const inputs = Array.from(
            event.currentTarget.querySelectorAll<HTMLInputElement>('input:not(:disabled)'),
          );
          const index = inputs.indexOf(event.target as HTMLInputElement);
          const next = index + (event.key === 'ArrowDown' ? 1 : -1);
          inputs[Math.max(0, Math.min(inputs.length - 1, next))]?.focus();
        }}
      >
        <label className={`form-check ${styles.choice} ${styles.all}`}>
          <input
            className="form-check-input"
            type="checkbox"
            checked={all}
            disabled={allDisabled || !options.length || options.every((option) => option.disabled)}
            ref={(input) => {
              if (input) input.indeterminate = mixed;
            }}
            onChange={(event) => onAllChange(event.target.checked)}
          />
          <span className="form-check-label">{allLabel}</span>
        </label>
        {options.map((option) => (
          <label key={option.id} className={`form-check ${styles.choice}`}>
            <input
              className="form-check-input"
              type="checkbox"
              checked={option.checked}
              disabled={option.disabled}
              onChange={(event) => onChange(option.id, event.target.checked)}
            />
            <span className="form-check-label">{option.label}</span>
          </label>
        ))}
      </Dropdown.Menu>
    </Dropdown>
  );
}
