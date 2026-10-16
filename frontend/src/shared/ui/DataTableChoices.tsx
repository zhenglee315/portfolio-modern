import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import type { DataTableCopy } from './DataTable';
import type { TableChoiceColor } from '../lib/table-choice-color';
import { ChoiceChip } from './ChoiceChip';
import {
  parseTableFilters,
  type DataTableFilter,
  type DataTableFilterSpec,
} from '../lib/table-filter';
import styles from './DataTableColumnMenu.module.css';

export type DataTableChoice = {
  value: string;
  label: string;
  color?: TableChoiceColor;
};
export type DataTableChoicePage = {
  items: DataTableChoice[];
  page: number;
  pages: number;
  total: number;
};
/** Static choices or an owner-supplied, cancellable source; colors are optional. */
export type DataTableChoicesSource = { colored?: boolean } & (
  | { options: DataTableChoice[] }
  | { load: (search: string, page: number, signal: AbortSignal) => Promise<DataTableChoicePage> }
);

/** Search changes the available choices; only selecting values changes the table query. */
export function DataTableChoices({
  source,
  field,
  label,
  spec,
  current,
  dropdownList = false,
  onChange,
  copy,
}: {
  source: DataTableChoicesSource;
  field: string;
  label: string;
  spec: DataTableFilterSpec;
  current?: DataTableFilter;
  /** Explicit selections; no selection clears the predicate and restores the table. */
  dropdownList?: boolean;
  onChange: (filter: DataTableFilter | null) => void;
  copy: DataTableCopy;
}) {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [retry, setRetry] = useState(0);
  const [response, setResponse] = useState<{
    source: DataTableChoicesSource;
    key: string;
    failed: boolean;
    result: DataTableChoicePage;
  }>({
    source,
    key: '',
    failed: false,
    result: { items: [], page: 1, pages: 0, total: 0 },
  });
  const key = JSON.stringify([query, page, retry]);
  const pending = 'load' in source && (response.source !== source || response.key !== key);
  const failed = !pending && response.failed;
  const staticItems =
    'options' in source
      ? source.options.filter((option) => option.label.toLowerCase().includes(query.toLowerCase()))
      : null;
  const result: DataTableChoicePage = staticItems
    ? { items: staticItems, page: 1, pages: staticItems.length ? 1 : 0, total: staticItems.length }
    : pending && page === 1
      ? { items: [], page: 1, pages: 0, total: 0 }
      : response.result;
  const [invalid, setInvalid] = useState(false);
  const currentKey = JSON.stringify(current ?? null);
  const [selection, setSelection] = useState({ source: currentKey, filter: current });
  if (selection.source !== currentKey) setSelection({ source: currentKey, filter: current });
  const active = selection.source === currentKey ? selection.filter : current;
  const list = useRef<HTMLDivElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search);
      setPage(1);
      if (list.current) list.current.scrollTop = 0;
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    if ('options' in source) return;
    const controller = new AbortController();
    void source.load(query, page, controller.signal).then(
      (next) => {
        if (controller.signal.aborted) return;
        setResponse((previous) => ({
          source,
          key,
          failed: false,
          result: {
            ...next,
            items:
              page === 1
                ? next.items
                : [
                    ...previous.result.items,
                    ...next.items.filter(
                      (item) => !previous.result.items.some((old) => old.value === item.value),
                    ),
                  ],
          },
        }));
      },
      () => {
        if (controller.signal.aborted) return;
        setResponse((previous) => ({
          source,
          key,
          failed: true,
          result: page === 1 ? { items: [], page: 1, pages: 0, total: 0 } : previous.result,
        }));
      },
    );
    return () => controller.abort();
  }, [source, query, page, retry, key]);
  const normalize = (value: string) => (spec.type === 'text' ? value.toLowerCase() : value);
  const values =
    active && 'value' in active && Array.isArray(active.value)
      ? active.value.map((value) => normalize(String(value)))
      : [];
  const excluded = (!dropdownList && !active) || active?.operator === 'not_in';
  const selected = (value: string) =>
    excluded ? !values.includes(normalize(value)) : values.includes(normalize(value));
  const selectedCount = result.items.filter((option) => selected(option.value)).length;
  const deselectCount = dropdownList && !query && !excluded ? values.length : selectedCount;
  const update = (targets: string[], checked: boolean, reset = false) => {
    const complete = !query && result.items.length === result.total && !pending && !failed;
    let candidate: DataTableFilter | null;
    if (reset) candidate = null;
    else if (!dropdownList && complete && targets.length === result.total)
      candidate = checked ? null : { field, operator: 'in', value: [] };
    else {
      const next = new Set(values);
      for (const value of targets) {
        if (checked !== excluded) next.add(normalize(value));
        else next.delete(normalize(value));
      }
      candidate =
        next.size === 0 && (excluded || dropdownList)
          ? null
          : { field, operator: excluded ? 'not_in' : 'in', value: [...next].sort() };
    }
    if (candidate && !parseTableFilters([candidate], { [field]: spec })) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setSelection({ source: currentKey, filter: candidate ?? undefined });
    onChange(candidate);
  };
  const busy = pending || search !== query;
  const updateDisplayed = (checked: boolean) => {
    update(
      result.items.map((option) => option.value),
      checked,
      dropdownList && !checked && !query,
    );
    // Bulk actions may disable themselves; keep keyboard dismissal in the open menu.
    searchInput.current?.focus();
  };
  return (
    <div className={styles.choices} data-filter-style={dropdownList ? 'dropdown-list' : undefined}>
      <div className={styles.choiceActions}>
        <button
          type="button"
          disabled={busy || !result.items.length || selectedCount === result.items.length}
          onClick={() => updateDisplayed(true)}
          title={copy.filter.selectHint}
        >
          {copy.filter.select}
          {dropdownList ? '' : ' '}(
          {dropdownList ? result.items.length : result.items.length - selectedCount})
        </button>
        <button
          type="button"
          disabled={busy || (!deselectCount && !(dropdownList && active && !query))}
          onClick={() => updateDisplayed(false)}
          title={copy.filter.deselectHint}
        >
          {copy.filter.deselect}
          {dropdownList ? '' : ' '}({deselectCount})
        </button>
      </div>
      <label className={dropdownList ? styles.inputs : styles.controlRow}>
        {!dropdownList && (
          <span className={styles.menuIcon} data-icon="search" aria-hidden="true" />
        )}
        <input
          ref={searchInput}
          data-filter-value
          className="form-control form-control-sm"
          type="search"
          aria-label={`${label}: ${copy.filter.search}`}
          placeholder={copy.filter.search}
          maxLength={200}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </label>
      <div
        ref={list}
        className={styles.choiceList}
        role="group"
        aria-label={`${label}: ${copy.filter.values}`}
        aria-busy={busy}
      >
        {result.items.map((option) => (
          <label
            key={option.value}
            className={styles.choice}
            data-checked={selected(option.value) || undefined}
          >
            <input
              type="checkbox"
              checked={selected(option.value)}
              disabled={busy}
              aria-label={option.label}
              onChange={(event) => update([option.value], event.target.checked)}
            />
            {source.colored ? (
              <ChoiceChip label={option.label} color={option.color} />
            ) : (
              <span className={styles.choiceLabel} title={option.label}>
                {option.label}
              </span>
            )}
            {selected(option.value) && <Icon name="check" />}
          </label>
        ))}
        {pending && <p role="status">{copy.loading}</p>}
        {failed && (
          <div role="alert">
            {copy.error}
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm"
              onClick={() => setRetry((value) => value + 1)}
            >
              {copy.retry}
            </button>
          </div>
        )}
        {!pending && !failed && !result.items.length && <p>{copy.filter.noOptions}</p>}
        {!pending && !failed && result.page < result.pages && (
          <button
            type="button"
            className="btn btn-outline-secondary btn-sm"
            onClick={() => setPage(result.page + 1)}
          >
            {copy.filter.more}
          </button>
        )}
      </div>
      {invalid && <small role="alert">{copy.filter.invalid}</small>}
    </div>
  );
}
