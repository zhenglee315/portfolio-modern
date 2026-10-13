import styles from './DataTable.module.css';

/** Present server boolean values without implying that the read-only list can update them. */
export function BooleanCell({
  value,
  label,
  rowId,
  readonly,
  checkbox,
  unavailableReason,
}: {
  value: boolean | null;
  label: string;
  rowId: string | number;
  readonly: string;
  checkbox?: boolean;
  unavailableReason?: string;
}) {
  if (value === null) return '—';
  const description = unavailableReason ?? readonly;
  return (
    <span
      className={`form-check ${checkbox ? '' : 'form-switch'} ${styles.boolean}`}
      data-unavailable={unavailableReason ? '' : undefined}
      title={description}
    >
      <input
        className="form-check-input"
        type="checkbox"
        role={checkbox ? undefined : 'switch'}
        checked={value}
        disabled
        aria-label={`${label}: ${rowId}; ${description}`}
      />
    </span>
  );
}
