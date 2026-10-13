import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Dropdown from 'react-bootstrap/Dropdown';
import { Icon } from './Icon';
import { DataTableChoices } from './DataTableChoices';
import type { DataTableColumn, DataTableCopy, DataTableSort } from './DataTable';
import {
  filterOperators,
  parseTableFilters,
  type DataTableFilter,
  type TableFilterOperator,
} from '../lib/table-filter';
import styles from './DataTableColumnMenu.module.css';

export type DataTableFilterCopy = {
  condition: string;
  value: string;
  from: string;
  to: string;
  all: string;
  yes: string;
  no: string;
  clearAll: string;
  clear: string;
  invalid: string;
  timezone: string;
  search: string;
  values: string;
  select: string;
  deselect: string;
  selectHint: string;
  deselectHint: string;
  noOptions: string;
  more: string;
  textMode: string;
  valueMode: string;
  sortAscending: string;
  sortDescending: string;
  clearSort: string;
  typeLabels: Record<'text' | 'number' | 'date' | 'boolean' | 'enum', string>;
  operators: Record<TableFilterOperator, string>;
  dateOperators: Partial<Record<TableFilterOperator, string>>;
};

/** One typed column editor; its owner applies predicates to the complete dataset. */
export function DataTableColumnMenu<T>({
  column,
  menuLabel,
  filters,
  onFiltersChange,
  sort,
  onSort,
  loading,
  copy,
}: {
  column: DataTableColumn<T>;
  menuLabel: string;
  filters: DataTableFilter[];
  onFiltersChange: (filters: DataTableFilter[]) => void;
  sort: DataTableSort[];
  onSort: (field: string, direction: 'asc' | 'desc' | null) => void;
  loading: boolean;
  copy: DataTableCopy;
}) {
  const id = useId();
  const toggle = useRef<HTMLButtonElement>(null);
  const submitted = useRef<{ source: string; target: string } | null>(null);
  const [show, setShow] = useState(false);
  const [textMode, setTextMode] = useState(false);
  const [theme, setTheme] = useState<string>();
  const spec = column.filter!;
  const operators = filterOperators(spec).filter(
    (operator) =>
      operator !== 'in' &&
      operator !== 'not_in' &&
      (spec.type !== 'date' ||
        ['equals', 'not_equals', 'gt', 'lt', 'empty', 'not_empty'].includes(operator)),
  );
  const current = filters.find((filter) => filter.field === column.id);
  const source = JSON.stringify(current ?? null);
  const initial = () => {
    const values =
      current && 'value' in current && current.operator !== 'in' && current.operator !== 'not_in'
        ? Array.isArray(current.value)
          ? current.value
          : [current.value]
        : [];
    const inputValue = (value: unknown) =>
      value === undefined ? '' : spec.type === 'date' ? String(value).slice(0, 10) : String(value);
    return {
      source,
      dirty: false,
      operator: current && operators.includes(current.operator) ? current.operator : operators[0]!,
      value: inputValue(values[0]),
      end: inputValue(values[1]),
    };
  };
  const [draft, setDraft] = useState(initial);
  if (draft.source !== source) setDraft(initial());
  const edit = draft.source === source ? draft : initial();
  const noValue = edit.operator === 'empty' || edit.operator === 'not_empty';
  const scalar = (value: string) => {
    if (spec.type === 'boolean') return value === 'true';
    if (spec.type === 'number') return Number(value);
    return value;
  };
  const raw = noValue
    ? { field: column.id, operator: edit.operator }
    : {
        field: column.id,
        operator: edit.operator,
        value:
          edit.operator === 'between' ? [scalar(edit.value), scalar(edit.end)] : scalar(edit.value),
      };
  const cleared = !noValue && !edit.value && (edit.operator !== 'between' || !edit.end);
  const parsed =
    !noValue && (!edit.value || (edit.operator === 'between' && !edit.end))
      ? null
      : parseTableFilters([raw], { [column.id]: spec });
  const candidate = cleared ? null : parsed?.[0];
  const candidateKey = JSON.stringify(candidate);
  const apply = useCallback(() => {
    const target = candidate === null ? 'null' : candidateKey;
    if (
      !edit.dirty ||
      candidate === undefined ||
      target === source ||
      (submitted.current?.source === source && submitted.current.target === target)
    )
      return;
    submitted.current = { source, target: target! };
    onFiltersChange(
      candidate === null
        ? filters.filter((filter) => filter.field !== column.id)
        : [...filters.filter((filter) => filter.field !== column.id), candidate],
    );
  }, [edit.dirty, candidate, candidateKey, source, onFiltersChange, filters, column.id]);
  useEffect(() => {
    submitted.current = null;
  }, [source]);
  useEffect(() => {
    const timer = setTimeout(
      apply,
      !noValue && (spec.type === 'text' || spec.type === 'number' || spec.type === 'date')
        ? 300
        : 0,
    );
    return () => clearTimeout(timer);
  }, [apply, spec.type, noValue]);
  useEffect(() => {
    if (show)
      document
        .getElementById(`${id}-menu`)
        ?.querySelector<HTMLElement>('[data-filter-value], select')
        ?.focus();
  }, [show, id]);
  const close = () => {
    setShow(false);
    toggle.current?.focus();
  };
  const labels =
    spec.type === 'date'
      ? { ...copy.filter.operators, ...copy.filter.dateOperators }
      : copy.filter.operators;
  const direction = sort.find((item) => item.field === column.id)?.direction;
  const dropdownList = column.filterStyle === 'dropdown-list' && Boolean(column.choices);
  const choices =
    column.choices &&
    (dropdownList ||
      (!textMode && (!current || current.operator === 'in' || current.operator === 'not_in')));
  const invalid = !cleared && candidate === undefined;
  const input = (end = false) => {
    const label =
      edit.operator === 'between' ? (end ? copy.filter.to : copy.filter.from) : copy.filter.value;
    const value = end ? edit.end : edit.value;
    const onChange = (next: string) =>
      setDraft({ ...edit, dirty: true, [end ? 'end' : 'value']: next });
    const common = {
      'data-filter-value': '',
      'aria-label': `${column.label}: ${label}`,
      'aria-invalid': invalid || undefined,
      'aria-describedby': invalid ? `${id}-error` : undefined,
      value,
      onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
        onChange(event.target.value),
    };
    return spec.type === 'boolean' || spec.type === 'enum' ? (
      <select {...common} className="form-select form-select-sm">
        <option value="">{copy.filter.all}</option>
        {(spec.type === 'boolean'
          ? [
              { value: 'true', label: copy.filter.yes },
              { value: 'false', label: copy.filter.no },
            ]
          : spec.type === 'enum'
            ? spec.options
            : []
        ).map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    ) : spec.type === 'date' ? (
      <div className={styles.dateInput}>
        <input
          {...common}
          className="form-control form-control-sm"
          type="date"
          min="0001-01-01"
          max="9999-12-30"
          onClick={(event) => event.currentTarget.showPicker?.()}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              apply();
            }
          }}
        />
        <span className={styles.menuIcon} data-icon="calendar" aria-hidden="true" />
      </div>
    ) : (
      <input
        {...common}
        className="form-control form-control-sm"
        type={spec.type === 'number' ? 'number' : 'search'}
        step={spec.type === 'number' && !spec.integer ? 'any' : 1}
        maxLength={spec.type === 'text' ? 400 : undefined}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            apply();
          }
        }}
      />
    );
  };
  return (
    <Dropdown
      show={show}
      autoClose="outside"
      className={styles.root}
      onToggle={(next) => {
        if (next)
          setTheme(
            toggle.current?.closest('[data-bs-theme]')?.getAttribute('data-bs-theme') ?? undefined,
          );
        setShow(next);
      }}
    >
      <Dropdown.Toggle
        ref={toggle}
        id={`${id}-toggle`}
        variant="link"
        className={`${styles.toggle} ${current ? styles.active : ''}`}
        aria-label={copy.columnMenuLabel?.(menuLabel) ?? menuLabel}
        aria-controls={show ? `${id}-menu` : undefined}
      >
        <Icon name={current ? 'funnelFill' : 'funnel'} />
      </Dropdown.Toggle>
      {typeof document !== 'undefined' &&
        createPortal(
          <Dropdown.Menu
            id={`${id}-menu`}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && !event.defaultPrevented) {
                event.preventDefault();
                event.stopPropagation();
                close();
              }
            }}
            className={styles.menu}
            align="end"
            data-bs-theme={theme}
            aria-hidden={!show}
            popperConfig={{
              strategy: 'fixed',
              modifiers: [
                { name: 'preventOverflow', options: { padding: 8, altAxis: true, tether: false } },
                { name: 'flip', options: { padding: 8 } },
              ],
            }}
          >
            {column.choices && !dropdownList && (
              <div className={styles.modes}>
                <button
                  type="button"
                  aria-pressed={Boolean(choices)}
                  onClick={() => {
                    setTextMode(false);
                    if (current && current.operator !== 'in' && current.operator !== 'not_in')
                      onFiltersChange(filters.filter((filter) => filter.field !== column.id));
                  }}
                >
                  {copy.filter.valueMode}
                </button>
                <button type="button" aria-pressed={!choices} onClick={() => setTextMode(true)}>
                  {copy.filter.textMode}
                </button>
              </div>
            )}
            {choices ? (
              show && (
                <DataTableChoices
                  source={column.choices!}
                  field={column.id}
                  label={column.label}
                  spec={spec}
                  current={current}
                  dropdownList={dropdownList}
                  copy={copy}
                  onChange={(filter) =>
                    onFiltersChange([
                      ...filters.filter((item) => item.field !== column.id),
                      ...(filter ? [filter] : []),
                    ])
                  }
                />
              )
            ) : (
              <div className={styles.editor}>
                <label className={styles.controlRow}>
                  <span className={styles.menuIcon} data-icon="condition" aria-hidden="true" />
                  <select
                    className="form-select form-select-sm"
                    aria-label={`${column.label}: ${copy.filter.condition}`}
                    value={edit.operator}
                    onChange={(event) =>
                      setDraft({
                        ...edit,
                        dirty: true,
                        operator: event.target.value as TableFilterOperator,
                      })
                    }
                  >
                    {operators.map((operator) => (
                      <option key={operator} value={operator}>
                        {labels[operator]}
                      </option>
                    ))}
                  </select>
                </label>
                {!noValue && (
                  <div className={styles.inputs}>
                    <div className={styles.controlRow}>
                      <span className={styles.menuIcon} data-icon="search" aria-hidden="true" />
                      {input()}
                    </div>
                    {edit.operator === 'between' && (
                      <div className={styles.controlRow}>
                        <span className={styles.menuIcon} data-icon="search" aria-hidden="true" />
                        {input(true)}
                      </div>
                    )}
                  </div>
                )}
                {!noValue && spec.type === 'date' && <small>{copy.filter.timezone}</small>}
                {invalid && (
                  <small id={`${id}-error`} role="alert">
                    {copy.filter.invalid}
                  </small>
                )}
              </div>
            )}
            {!dropdownList && (
              <Dropdown.Item
                as="button"
                type="button"
                disabled={!current && cleared}
                onClick={() => {
                  setDraft({ ...initial(), value: '', end: '', operator: operators[0]! });
                  setTextMode(false);
                  onFiltersChange(filters.filter((filter) => filter.field !== column.id));
                }}
              >
                <Icon name="close" />
                {copy.filter.clear}
              </Dropdown.Item>
            )}
            {column.sortable && (
              <>
                <Dropdown.Divider />
                {(['asc', 'desc'] as const).map((target) => (
                  <Dropdown.Item
                    key={target}
                    as="button"
                    type="button"
                    disabled={loading || (!direction && sort.length >= 3)}
                    aria-label={copy.sortLabel(column.label, target)}
                    onClick={() => {
                      onSort(column.id, target);
                      close();
                    }}
                  >
                    <span className={styles.menuIcon} data-icon={target} aria-hidden="true" />
                    {target === 'asc' ? copy.filter.sortAscending : copy.filter.sortDescending}
                    {direction === target && <Icon name="check" />}
                  </Dropdown.Item>
                ))}
                <Dropdown.Item
                  as="button"
                  type="button"
                  disabled={loading || !direction}
                  aria-label={copy.sortLabel(column.label, 'none')}
                  onClick={() => {
                    onSort(column.id, null);
                    close();
                  }}
                >
                  <Icon name="close" />
                  {copy.filter.clearSort}
                </Dropdown.Item>
              </>
            )}
          </Dropdown.Menu>,
          document.body,
        )}
    </Dropdown>
  );
}
