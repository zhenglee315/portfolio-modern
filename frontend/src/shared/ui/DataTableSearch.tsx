import { useId, useState } from 'react';
import { tableSearchMaxLength, type DataTableSearchState } from '../lib/table-search';
import styles from './DataTableSearch.module.css';

export type DataTableSearchCopy = {
  label: string;
  submit: string;
  fields: string;
  all: string;
  placeholder: string;
  selected: (count: number) => string;
};
export type DataTableSearchProps = {
  value?: DataTableSearchState;
  onChange: (search: DataTableSearchState) => void;
  copy: DataTableSearchCopy;
};

/** Keep input drafts local; submitting emits an explicit all-column or single-column search. */
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
  const id = useId();
  const fields = columns.map((column) => column.id);
  const signature = JSON.stringify([value, fields]);
  const initial = () => ({
    signature,
    term: value?.term ?? '',
    fields: value?.fields.filter((field) => fields.includes(field)) ?? fields,
  });
  const [draft, setDraft] = useState(initial);
  // URL history and changing column definitions replace drafts; ordinary row loads do not.
  if (draft.signature !== signature) setDraft(initial());
  const all = fields.length > 0 && fields.every((field) => draft.fields.includes(field));
  const selected = all ? '' : draft.fields.length === 1 ? draft.fields[0] : '*';
  return (
    <form
      className={styles.root}
      role="search"
      aria-label={copy.label}
      aria-busy={busy}
      data-table-search
      onSubmit={(event) => {
        event.preventDefault();
        if (!busy && draft.fields.length)
          onChange({ term: draft.term.trim(), fields: [...draft.fields] });
      }}
    >
      <input
        className={`form-control ${styles.input}`}
        type="search"
        aria-label={copy.placeholder}
        placeholder={copy.placeholder}
        maxLength={tableSearchMaxLength}
        value={draft.term}
        onChange={(event) => setDraft((previous) => ({ ...previous, term: event.target.value }))}
      />
      <select
        id={`${id}-fields`}
        className={`form-select ${styles.fields}`}
        aria-label={copy.fields}
        title={
          all
            ? copy.all
            : (columns.find((column) => column.id === selected)?.label ??
              copy.selected(draft.fields.length))
        }
        value={selected}
        disabled={!fields.length}
        onChange={(event) =>
          setDraft((previous) => ({
            ...previous,
            fields: event.target.value ? [event.target.value] : fields,
          }))
        }
      >
        <option value="">{copy.all}</option>
        {selected === '*' && (
          <option value="*" disabled>
            {copy.selected(draft.fields.length)}
          </option>
        )}
        {columns.map((column) => (
          <option key={column.id} value={column.id}>
            {column.label}
          </option>
        ))}
      </select>
      <button
        className={`btn btn-outline-secondary ${styles.submit}`}
        type="submit"
        aria-label={copy.submit}
        title={copy.submit}
        disabled={busy || !draft.fields.length}
      />
    </form>
  );
}
