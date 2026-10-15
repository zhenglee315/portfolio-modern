import { useRef, useState } from 'react';
import { tableSearchMaxLength, type DataTableSearchState } from '../lib/table-search';
import { tableChoiceColor } from '../lib/table-choice-color';
import { DataTableFieldPicker } from './DataTableFieldPicker';
import { Icon } from './Icon';
import chipStyles from './DataTableColumnMenu.module.css';
import styles from './DataTableSearch.module.css';

export type DataTableSearchCopy = {
  label: string;
  submit: string;
  fields: string;
  all: string;
  placeholder: string;
  selected: (count: number) => string;
  remove: (label: string) => string;
};
export type DataTableSearchProps = {
  value?: DataTableSearchState;
  onChange: (search: DataTableSearchState) => void;
  copy: DataTableSearchCopy;
};

/** Draft fields become removable tags; only explicit search submits the server query. */
export function DataTableSearch({
  value,
  onChange,
  copy,
  columns,
  busy = false,
}: DataTableSearchProps & {
  columns: { id: string; label: string }[];
  busy?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const fields = columns.map((column) => column.id);
  const signature = JSON.stringify([value, fields]);
  const initial = () => ({
    signature,
    term: value?.term ?? '',
    fields: value?.fields.filter((field) => fields.includes(field)) ?? fields,
  });
  const [draft, setDraft] = useState(initial);
  // URL history and changing definitions replace drafts; ordinary row loads preserve them.
  if (draft.signature !== signature) setDraft(initial());
  const all = fields.length > 0 && fields.every((field) => draft.fields.includes(field));
  const selected = all ? [] : columns.filter((column) => draft.fields.includes(column.id));
  const selectionLabel = all ? copy.all : copy.selected(draft.fields.length);
  return (
    <form
      className={styles.root}
      role="search"
      aria-label={copy.label}
      aria-busy={busy}
      data-table-search
      data-search-selection={selected.length ? '' : undefined}
      onSubmit={(event) => {
        event.preventDefault();
        if (!busy && draft.fields.length)
          onChange({ term: draft.term.trim(), fields: [...draft.fields] });
      }}
    >
      <div className={styles.controls} data-table-search-controls>
        <input
          ref={input}
          className={`form-control ${styles.input}`}
          type="search"
          aria-label={copy.placeholder}
          placeholder={copy.placeholder}
          maxLength={tableSearchMaxLength}
          value={draft.term}
          onChange={(event) => setDraft((previous) => ({ ...previous, term: event.target.value }))}
        />
        <DataTableFieldPicker
          className={styles.fields}
          toggleClassName={styles.fieldToggle}
          label={`${copy.fields}: ${selectionLabel}`}
          title={all ? copy.all : copy.fields}
          allLabel={copy.all}
          options={columns.map((column) => ({
            ...column,
            checked: draft.fields.includes(column.id),
          }))}
          onAllChange={(checked) =>
            setDraft((previous) => ({ ...previous, fields: checked ? fields : [] }))
          }
          onChange={(id, checked) =>
            setDraft((previous) => ({
              ...previous,
              fields: fields.filter((field) =>
                field === id ? checked : previous.fields.includes(field),
              ),
            }))
          }
        >
          {all ? copy.all : <Icon name={selected.length ? 'funnelFill' : 'funnel'} />}
        </DataTableFieldPicker>
        <button
          className={`btn btn-outline-secondary ${styles.submit}`}
          type="submit"
          aria-label={copy.submit}
          title={copy.submit}
          disabled={busy || !draft.fields.length}
        />
      </div>
      {selected.length > 0 && (
        <ul className={styles.tags} aria-label={copy.fields} tabIndex={0}>
          {selected.map((column) => (
            <li key={column.id}>
              <button
                type="button"
                className={`${chipStyles.chip} ${styles.tag}`}
                data-color={tableChoiceColor(column.id)}
                aria-label={copy.remove(column.label)}
                title={copy.remove(column.label)}
                onClick={() => {
                  setDraft((previous) => ({
                    ...previous,
                    fields: previous.fields.filter((field) => field !== column.id),
                  }));
                  // A removed tag must not strand keyboard focus on the document body.
                  input.current?.focus();
                }}
              >
                <span>{column.label}</span>
                <span className={styles.tagClose} aria-hidden="true">
                  ×
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
