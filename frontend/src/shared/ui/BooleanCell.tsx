import { useEffect, useRef } from 'react';
import styles from './DataTable.module.css';

/** Share table boolean styling; only an explicit callback enables immediate editing.
 * Pending values and business eligibility belong to the page, never this presentational cell.
 * @author ZhengLee 2026.10.16
 */
export function BooleanCell({
  value,
  label,
  rowId,
  readonly,
  checkbox,
  unavailableReason,
  onChange,
  disabled = false,
  busy = false,
  saving,
}: {
  value: boolean | null;
  label: string;
  rowId: string | number;
  readonly: string;
  checkbox?: boolean;
  unavailableReason?: string;
  onChange?: (value: boolean) => void;
  disabled?: boolean;
  busy?: boolean;
  saving?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const restoreFocus = useRef(false);
  const editable = !!onChange;
  useEffect(() => {
    if (busy || disabled || !restoreFocus.current) return;
    restoreFocus.current = false;
    // Disabling a pending switch can blur it. Preserve keyboard position after saving,
    // while leaving any other control the user has focused alone.
    //                                                                     ZhengLee 2026.10.16
    if (editable && !unavailableReason && document.activeElement === document.body)
      input.current?.focus({ preventScroll: true });
  }, [busy, disabled, editable, unavailableReason, value]);
  if (value === null) return '—';
  const description = busy
    ? (saving ?? readonly)
    : (unavailableReason ?? (onChange ? undefined : readonly));
  const Container = onChange ? 'label' : 'span';
  return (
    <Container
      className={`form-check ${checkbox ? '' : 'form-switch'} ${styles.boolean}`}
      data-unavailable={unavailableReason ? '' : undefined}
      data-editable={onChange ? '' : undefined}
      data-busy={busy ? '' : undefined}
      title={description}
    >
      <input
        ref={input}
        className="form-check-input"
        type="checkbox"
        role={checkbox ? undefined : 'switch'}
        checked={value}
        disabled={!onChange || disabled || busy || !!unavailableReason}
        aria-busy={busy || undefined}
        onChange={
          onChange
            ? (event) => {
                restoreFocus.current = document.activeElement === event.currentTarget;
                onChange(event.currentTarget.checked);
              }
            : undefined
        }
        aria-label={`${label}: ${rowId}${description ? `; ${description}` : ''}`}
      />
    </Container>
  );
}
