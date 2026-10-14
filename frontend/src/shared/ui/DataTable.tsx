import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';
import Dropdown from 'react-bootstrap/Dropdown';
import { Icon } from './Icon';
import { LoadingIndicator } from './LoadingIndicator';
import { BooleanCell } from './BooleanCell';
import { DataTableSearch, type DataTableSearchProps } from './DataTableSearch';
import { DataTableColumnMenu, type DataTableFilterCopy } from './DataTableColumnMenu';
import type { DataTableChoice, DataTableChoicesSource } from './DataTableChoices';
import type { DataTableFilter, DataTableFilterSpec } from '../lib/table-filter';
import { tableCsv, tablePrintHtml, tableTsv, tableXlsx } from '../lib/table-export';
import styles from './DataTable.module.css';

export type DataTableSort = { field: string; direction: 'asc' | 'desc' };
/** Controlled selection of the supplied page; owners clear keys when the query scope changes. */
export type DataTableSelection<T> = {
  keys: readonly (string | number)[];
  onChange: (keys: (string | number)[]) => void;
  allLabel: string;
  rowLabel: (row: T) => string;
};
export type DataTableExport<T> = {
  filename: string;
  /** Omit to export this page; owners may explicitly load the selected server result instead. */
  loadRows?: (signal: AbortSignal) => Promise<T[]>;
};

export type DataTableColumn<T> = {
  id: string;
  label: string;
  /** Optional accessible menu name for otherwise ambiguous headings. */
  menuLabel?: string;
  /** Strings use one-line ellipsis by default; renderers and export values remain untouched. */
  truncate?: boolean;
  textWidth?: number;
  value: (row: T) => string | number | boolean | null;
  sortable?: boolean;
  initiallyHidden?: boolean;
  /** Required identity columns stay visible regardless of picker or initial visibility. */
  hideable?: boolean;
  render?: (row: T) => ReactNode;
  /** Declared query capabilities, independent of value/render. */
  filter?: DataTableFilterSpec;
  /** Opt out of the optional toolbar search when a computed column has no server search mapping. */
  searchable?: boolean;
  /** Dropdown list filter derives colored options from rows seen by this mounted table. Requires sets. */
  filterStyle?: 'dropdown-list';
  /** Optional owner-supplied choices; overrides the dropdown list's loaded-row source. */
  choices?: DataTableChoicesSource;
};

export type DataTableCopy = {
  caption: string;
  loading: string;
  empty: string;
  error: string;
  retry: string;
  rowsPerPage: string;
  pagination: string;
  first: string;
  previous: string;
  next: string;
  last: string;
  columns: string;
  allColumns: string;
  sorting: string;
  clearSort: string;
  filter: DataTableFilterCopy;
  readonly: string;
  actions: string;
  direction: { asc: string; desc: string };
  range: (from: number, to: number, total: number, selected: number) => string;
  pageLabel: (page: number) => string;
  sortLabel: (column: string, next: 'asc' | 'desc' | 'none') => string;
  columnMenuLabel?: (column: string) => string;
  export?: {
    label: string;
    copy: string;
    excel: string;
    csv: string;
    print: string;
    scope: string;
    busy: string;
    error: string;
    copied: string;
  };
};

type Props<T> = {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  page: { page: number; size: number; total: number; pages: number };
  filters?: DataTableFilter[];
  onFiltersChange?: (filters: DataTableFilter[]) => void;
  sort: DataTableSort[];
  onSortChange: (sort: DataTableSort[]) => void;
  onPageChange: (page: number) => void;
  onSizeChange: (size: number) => void;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
  rowActions?: (row: T) => ReactNode;
  selection?: DataTableSelection<T>;
  toolbar?: ReactNode;
  /** Extra leading controls follow Export/Columns, before the optional search form. */
  toolbarStart?: ReactNode;
  search?: DataTableSearchProps;
  /** Natural row height by default; constrain only tables that need an internal vertical viewport. */
  maxHeight?: CSSProperties['maxHeight'];
  export?: DataTableExport<T>;
  copy: DataTableCopy;
};

/** Keep native checked/mixed state consistent across row and column selectors. */
function TableCheckbox({
  mixed = false,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { mixed?: boolean }) {
  return (
    <input
      {...props}
      type="checkbox"
      className="form-check-input"
      ref={(input) => {
        if (input) input.indeterminate = mixed;
      }}
    />
  );
}

/** Download one generated document without opening an application or retaining its Blob URL. */
function downloadTable(blob: Blob, filename: string) {
  const objectUrls = URL;
  const url = objectUrls.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  try {
    link.click();
  } finally {
    link.remove();
    window.setTimeout(() => objectUrls.revokeObjectURL(url), 1000);
  }
}

/** Print escaped standalone markup in a temporary frame through the browser's native dialog. */
function printTable(html: string, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const frame = document.createElement('iframe');
    frame.className = styles.printFrame ?? '';
    frame.tabIndex = -1;
    frame.setAttribute('aria-hidden', 'true');
    const remove = () => {
      frame.remove();
      signal.removeEventListener('abort', cancel);
    };
    const cancel = () => {
      remove();
      reject(new DOMException('Export aborted', 'AbortError'));
    };
    signal.addEventListener('abort', cancel, { once: true });
    frame.onload = () => {
      frame.onload = null;
      if (signal.aborted) return cancel();
      const target = frame.contentWindow;
      if (!target) {
        remove();
        reject(new Error('Print frame unavailable'));
        return;
      }
      target.addEventListener('afterprint', remove, { once: true });
      try {
        target.focus();
        target.print();
        resolve();
      } catch (error) {
        remove();
        reject(error);
      }
    };
    frame.srcdoc = html;
    document.body.append(frame);
  });
}

/** Bound navigation to the first, last and neighboring pages, even for very large totals. */
function pageButtons(page: number, pages: number): (number | 'gap-start' | 'gap-end')[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, index) => index + 1);
  const center = Math.min(Math.max(page, 1), pages);
  const first = Math.max(2, Math.min(center - 1, pages - 3));
  const last = Math.min(pages - 1, Math.max(center + 1, 4));
  return [
    1,
    ...(first > 2 ? (['gap-start'] as const) : []),
    ...Array.from({ length: last - first + 1 }, (_, index) => first + index),
    ...(last < pages - 1 ? (['gap-end'] as const) : []),
    pages,
  ];
}

/** Toggle one direction while preserving other fields and the ordered three-column limit. */
function setSortDirection(
  sort: DataTableSort[],
  field: string,
  direction: 'asc' | 'desc' | null,
): DataTableSort[] {
  const current = sort.find((criterion) => criterion.field === field);
  if (!direction || current?.direction === direction)
    return current ? sort.filter((criterion) => criterion.field !== field) : sort;
  if (current)
    return sort.map((criterion) => (criterion.field === field ? { field, direction } : criterion));
  return sort.length < 3 ? [...sort, { field, direction }] : sort;
}

/** Remember only loaded values so filtering cannot remove the choices needed to restore rows. */
function loadedChoices<T>(
  columns: DataTableColumn<T>[],
  rows: T[],
  previous: Record<string, DataTableChoice[]>,
): Record<string, DataTableChoice[]> {
  const colors = ['pink', 'cyan', 'violet', 'green', 'orange', 'red', 'blue'] as const;
  return Object.fromEntries(
    columns.flatMap((column) => {
      const spec = column.filter;
      if (
        column.filterStyle !== 'dropdown-list' ||
        column.choices ||
        !spec ||
        (spec.type !== 'text' && spec.type !== 'enum') ||
        !spec.sets
      )
        return [];
      const options = [...(previous[column.id] ?? [])];
      const normalize = (value: string) => (spec.type === 'text' ? value.toLowerCase() : value);
      const seen = new Set(options.map((option) => normalize(option.value)));
      for (const row of rows) {
        const value = column.value(row);
        if (typeof value !== 'string' || !value || seen.has(normalize(value))) continue;
        seen.add(normalize(value));
        options.push({
          value,
          label:
            spec.type === 'enum'
              ? (spec.options.find((item) => item.value === value)?.label ?? value)
              : value,
          color: colors[options.length % colors.length],
        });
      }
      return [[column.id, options]];
    }),
  );
}

/** Present a controlled server page with Bootstrap tables, sorting and numbered navigation.
 * Features own validated rows, query state, transport and cancellation. This component emits
 * intent only; column visibility is local presentation state and never changes server records.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  page,
  sort,
  filters = [],
  onFiltersChange,
  onSortChange,
  onPageChange,
  onSizeChange,
  loading = false,
  error = false,
  onRetry,
  rowActions,
  selection,
  toolbar,
  toolbarStart,
  search,
  maxHeight,
  export: exportOptions,
  copy,
}: Props<T>) {
  const [choiceCache, setChoiceCache] = useState(() => ({
    rows,
    columns,
    options: loadedChoices(columns, rows, {}),
  }));
  if (choiceCache.rows !== rows || choiceCache.columns !== columns)
    setChoiceCache({ rows, columns, options: loadedChoices(columns, rows, choiceCache.options) });
  const [visibility, setVisibility] = useState<Record<string, boolean>>({});
  const [exportBusy, setExportBusy] = useState(false);
  const [exportStatus, setExportStatus] = useState<'copied' | 'error' | null>(null);
  const exportController = useRef<AbortController | null>(null);
  const printController = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      exportController.current?.abort();
      printController.current?.abort();
    },
    [],
  );
  const visibleColumns = columns.filter(
    (column) => column.hideable === false || (visibility[column.id] ?? !column.initiallyHidden),
  );
  const allColumnsVisible = columns.length > 0 && visibleColumns.length === columns.length;
  const selectedKeys = rows.map(rowKey).filter((key) => selection?.keys.includes(key));
  const allRowsSelected = rows.length > 0 && selectedKeys.length === rows.length;
  const first = rows.length ? (page.page - 1) * page.size + 1 : 0;
  const last = rows.length ? Math.min(first + rows.length - 1, page.total) : 0;
  const pendingRows = loading && rows.length > 0;
  const sizeOptions = [...new Set([6, 10, 25, 50, 100, page.size])].sort((a, b) => a - b);
  const changeSort = (field: string, direction: 'asc' | 'desc' | null) => {
    if (loading) return;
    const changed = setSortDirection(sort, field, direction);
    if (changed !== sort) onSortChange(changed);
  };
  const exportRows = async (kind: 'copy' | 'excel' | 'csv' | 'print') => {
    if (!exportOptions || !copy.export || loading || error || exportController.current) return;
    const controller = new AbortController();
    exportController.current = controller;
    setExportBusy(true);
    setExportStatus(null);
    try {
      const source = exportOptions.loadRows
        ? await exportOptions.loadRows(controller.signal)
        : rows;
      if (controller.signal.aborted) return;
      const matrix = [
        visibleColumns.map((column) => column.label),
        ...source.map((row) => visibleColumns.map((column) => column.value(row))),
      ];
      const filename =
        exportOptions.filename
          .replace(/[\\/:*?"<>|]/g, '_')
          .replace(/\p{Cc}/gu, '_')
          .trim() || 'table';
      if (kind === 'copy') {
        await navigator.clipboard.writeText(tableTsv(matrix));
        if (!controller.signal.aborted) setExportStatus('copied');
      } else if (kind === 'csv') {
        downloadTable(
          new Blob(['\uFEFF', tableCsv(matrix)], { type: 'text/csv;charset=utf-8' }),
          `${filename}.csv`,
        );
      } else if (kind === 'excel') {
        downloadTable(
          new Blob([new Uint8Array(tableXlsx(matrix)).buffer], {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          }),
          `${filename}.xlsx`,
        );
      } else {
        printController.current?.abort();
        printController.current = controller;
        await printTable(tablePrintHtml(copy.caption, matrix), controller.signal);
      }
    } catch {
      if (!controller.signal.aborted) setExportStatus('error');
    } finally {
      if (!controller.signal.aborted) {
        exportController.current = null;
        setExportBusy(false);
      }
    }
  };
  const columnStyle = (column: DataTableColumn<T>): CSSProperties => {
    const widths = [
      ...(column.sortable ? ['var(--table-sort-width)'] : []),
      ...(sort.some((item) => item.field === column.id) ? ['var(--table-rank-width)'] : []),
      ...(column.filter && onFiltersChange ? ['var(--table-filter-width)'] : []),
    ];
    return {
      '--table-header-tools': widths.length
        ? `calc(${widths.join(' + ')} + ${widths.length + 1}px)`
        : '0px',
    } as CSSProperties;
  };
  const navigationButton = (
    direction: 'first' | 'previous' | 'next' | 'last',
    target: number,
    unavailable: boolean,
  ) => (
    <li className={`page-item ${unavailable || loading ? 'disabled' : ''}`}>
      <button
        type="button"
        className="page-link"
        value={direction}
        aria-label={copy[direction]}
        title={copy[direction]}
        disabled={unavailable || loading}
        onClick={() => onPageChange(target)}
      />
    </li>
  );
  return (
    <div className={styles.root}>
      <div className={styles.toolbar}>
        <div className={styles.toolbarActions}>
          {exportOptions && copy.export && (
            <Dropdown className={styles.exportPicker}>
              <Dropdown.Toggle
                variant="outline-secondary"
                size="sm"
                aria-label={exportBusy ? copy.export.busy : copy.export.label}
                title={exportBusy ? copy.export.busy : copy.export.label}
                aria-busy={exportBusy || undefined}
                disabled={
                  loading || error || exportBusy || (!rows.length && !exportOptions.loadRows)
                }
              />
              <Dropdown.Menu className={styles.exportMenu}>
                <Dropdown.Header>{copy.export.scope}</Dropdown.Header>
                {(['copy', 'excel', 'csv', 'print'] as const).map((kind) => (
                  <Dropdown.Item
                    as="button"
                    type="button"
                    key={kind}
                    value={kind}
                    onClick={() => void exportRows(kind)}
                  >
                    {copy.export![kind]}
                  </Dropdown.Item>
                ))}
              </Dropdown.Menu>
            </Dropdown>
          )}
          <Dropdown autoClose="outside" className={styles.columnPicker}>
            <Dropdown.Toggle
              variant="outline-secondary"
              size="sm"
              aria-label={copy.columns}
              title={copy.columns}
            />
            <Dropdown.Menu
              align="end"
              className={styles.columnMenu}
              popperConfig={{
                modifiers: [
                  {
                    name: 'preventOverflow',
                    options: { padding: 8, altAxis: true, tether: false },
                  },
                  { name: 'flip', options: { padding: 8 } },
                ],
              }}
            >
              <label className={`form-check ${styles.columnChoice} ${styles.allColumns}`}>
                <TableCheckbox
                  checked={allColumnsVisible}
                  mixed={visibleColumns.length > 0 && !allColumnsVisible}
                  disabled={
                    columns.length <= 1 || columns.every((column) => column.hideable === false)
                  }
                  onChange={(event) => {
                    const checked = event.target.checked;
                    const retained =
                      columns.find((column) => column.hideable === false)?.id ??
                      visibleColumns[0]?.id ??
                      columns[0]?.id;
                    setVisibility(
                      Object.fromEntries(
                        columns.map((column) => [
                          column.id,
                          checked || column.hideable === false || column.id === retained,
                        ]),
                      ),
                    );
                  }}
                />
                <span className="form-check-label">{copy.allColumns}</span>
              </label>
              {columns.map((column) => {
                const checked =
                  column.hideable === false || (visibility[column.id] ?? !column.initiallyHidden);
                return (
                  <label key={column.id} className={`form-check ${styles.columnChoice}`}>
                    <TableCheckbox
                      checked={checked}
                      disabled={
                        column.hideable === false || (checked && visibleColumns.length === 1)
                      }
                      onChange={(event) =>
                        setVisibility((previous) => ({
                          ...previous,
                          [column.id]: event.target.checked,
                        }))
                      }
                    />
                    <span className="form-check-label">{column.label}</span>
                  </label>
                );
              })}
            </Dropdown.Menu>
          </Dropdown>
          {toolbarStart}
        </div>
        {search && (
          <DataTableSearch
            {...search}
            columns={columns.filter((column) => column.searchable !== false)}
            busy={loading}
          />
        )}
        {onFiltersChange && filters.length > 0 && (
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            onClick={() => onFiltersChange([])}
          >
            {copy.filter.clearAll}
          </button>
        )}
        {toolbar && <div className={styles.toolbarSlot}>{toolbar}</div>}
        {exportStatus && copy.export && (
          <p className={styles.exportStatus} role={exportStatus === 'error' ? 'alert' : 'status'}>
            {copy.export[exportStatus]}
          </p>
        )}
      </div>
      {sort.length > 0 && (
        <div className={styles.sorting}>
          <span>{copy.sorting}</span>
          {sort.map((criterion, index) => (
            <span key={criterion.field} className={`badge ${styles.sortBadge}`}>
              {index + 1}.{' '}
              {columns.find((column) => column.id === criterion.field)?.label ?? criterion.field}{' '}
              {copy.direction[criterion.direction]}
            </span>
          ))}
          <button
            type="button"
            className={`btn btn-sm btn-outline-secondary ${styles.clearSort}`}
            disabled={loading}
            onClick={() => onSortChange([])}
          >
            {copy.clearSort}
          </button>
        </div>
      )}
      <div className={styles.viewport} data-pending={pendingRows} data-ready={!loading && !error}>
        <div className={`${styles.feedback} ${pendingRows ? styles.loadingOverlay : ''}`}>
          {loading ? <LoadingIndicator label={copy.loading} /> : null}
        </div>
        <div
          className={`table-responsive ${styles.scroll}`}
          style={{ maxHeight }}
          role="region"
          aria-label={copy.caption}
          tabIndex={0}
        >
          <table
            className={`table table-striped table-hover align-middle ${styles.table}`}
            aria-busy={loading}
          >
            <caption className="visually-hidden">{copy.caption}</caption>
            <thead>
              <tr>
                {selection && (
                  <th scope="col" data-selection className={styles.selectionCell}>
                    <label className={styles.selectionControl}>
                      <TableCheckbox
                        aria-label={selection.allLabel}
                        checked={allRowsSelected}
                        mixed={selectedKeys.length > 0 && !allRowsSelected}
                        disabled={loading || error || !rows.length}
                        onChange={(event) =>
                          selection.onChange(event.target.checked ? rows.map(rowKey) : [])
                        }
                      />
                    </label>
                  </th>
                )}
                {visibleColumns.map((column) => {
                  const rank = sort.findIndex((criterion) => criterion.field === column.id);
                  const direction = sort[rank]?.direction;
                  return (
                    <th
                      key={column.id}
                      scope="col"
                      className={column.filter && onFiltersChange ? styles.menuHeader : undefined}
                      style={columnStyle(column)}
                      aria-sort={
                        !direction
                          ? 'none'
                          : sort.length > 1
                            ? 'other'
                            : direction === 'asc'
                              ? 'ascending'
                              : 'descending'
                      }
                    >
                      <div className={styles.headerContent}>
                        <span data-column-title>{column.label}</span>
                        <span className={styles.headerControls}>
                          {column.sortable && (
                            <span className={styles.sortIcon}>
                              {(['asc', 'desc'] as const).map((target) => (
                                <button
                                  key={target}
                                  type="button"
                                  className={styles.sortButton}
                                  aria-label={copy.sortLabel(column.label, target)}
                                  aria-pressed={direction === target}
                                  aria-disabled={loading || (!direction && sort.length >= 3)}
                                  title={copy.sortLabel(
                                    column.label,
                                    direction === target ? 'none' : target,
                                  )}
                                  onClick={() => changeSort(column.id, target)}
                                >
                                  <Icon
                                    name={target === 'asc' ? 'caretUpFill' : 'caretDownFill'}
                                    className={
                                      direction === target ? styles.sortSelected : undefined
                                    }
                                  />
                                </button>
                              ))}
                            </span>
                          )}
                          {direction && (
                            <span aria-hidden="true" className={`badge ${styles.rank}`}>
                              {rank + 1}
                            </span>
                          )}
                          {column.filter && onFiltersChange && (
                            <DataTableColumnMenu
                              column={
                                choiceCache.options[column.id]
                                  ? {
                                      ...column,
                                      choices: {
                                        options: choiceCache.options[column.id]!,
                                        colored: true,
                                      },
                                    }
                                  : column
                              }
                              menuLabel={
                                column.menuLabel ??
                                (columns.some(
                                  (other) => other.id !== column.id && other.label === column.label,
                                )
                                  ? `${column.label} (${copy.filter.typeLabels[column.filter.type]})`
                                  : column.label)
                              }
                              sort={sort}
                              filters={filters}
                              onFiltersChange={onFiltersChange}
                              onSort={changeSort}
                              loading={loading}
                              copy={copy}
                            />
                          )}
                        </span>
                      </div>
                    </th>
                  );
                })}
                {rowActions && (
                  <th scope="col" style={{ '--table-header-tools': '0px' } as CSSProperties}>
                    <div className={styles.headerContent}>
                      <span data-column-title>{copy.actions}</span>
                      <span className={styles.headerControls} />
                    </div>
                  </th>
                )}
              </tr>
            </thead>
            <tbody aria-hidden={loading || undefined} inert={loading}>
              {rows.map((row) => (
                <tr key={rowKey(row)} data-row-key={rowKey(row)}>
                  {selection && (
                    <td data-selection className={styles.selectionCell}>
                      <label className={styles.selectionControl}>
                        <TableCheckbox
                          aria-label={selection.rowLabel(row)}
                          checked={selectedKeys.includes(rowKey(row))}
                          disabled={loading || error}
                          onChange={(event) =>
                            selection.onChange(
                              event.target.checked
                                ? [...selectedKeys, rowKey(row)]
                                : selectedKeys.filter((key) => key !== rowKey(row)),
                            )
                          }
                        />
                      </label>
                    </td>
                  )}
                  {visibleColumns.map((column) => {
                    const value = column.value(row);
                    return (
                      <td key={column.id} className={styles.cell}>
                        {column.render ? (
                          column.render(row)
                        ) : typeof value === 'boolean' ? (
                          <BooleanCell
                            value={value}
                            label={column.label}
                            rowId={rowKey(row)}
                            readonly={copy.readonly}
                          />
                        ) : typeof value === 'string' && column.truncate !== false ? (
                          <span
                            className={styles.textCell}
                            title={value}
                            style={{ maxWidth: column.textWidth ?? 180 }}
                          >
                            {value}
                          </span>
                        ) : (
                          (value ?? '—')
                        )}
                      </td>
                    );
                  })}
                  {rowActions && <td className={styles.actions}>{rowActions(row)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className={styles.feedback} aria-live="polite" aria-atomic="true">
        {!loading &&
          (error ? (
            <div role="alert" className={styles.failure}>
              <p>{copy.error}</p>
              {onRetry && (
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary"
                  onClick={onRetry}
                >
                  {copy.retry}
                </button>
              )}
            </div>
          ) : rows.length === 0 ? (
            <p role="status">{copy.empty}</p>
          ) : null)}
      </div>
      <div className={styles.footer}>
        <p className={styles.range}>{copy.range(first, last, page.total, selectedKeys.length)}</p>
        <label className={styles.size}>
          <span>{copy.rowsPerPage}</span>
          <select
            className="form-select form-select-sm"
            style={{ '--table-size-digits': String(page.size).length } as CSSProperties}
            value={page.size}
            disabled={loading}
            onChange={(event) => onSizeChange(Number(event.target.value))}
          >
            {sizeOptions.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
        <nav aria-label={copy.pagination}>
          <ul className={`pagination pagination-sm ${styles.pagination}`}>
            {navigationButton('first', 1, page.page <= 1)}
            {navigationButton('previous', Math.max(page.page - 1, 1), page.page <= 1)}
            {pageButtons(page.page, page.pages).map((item) => (
              <li
                key={item}
                className={`page-item ${typeof item !== 'number' ? 'disabled' : item === page.page ? 'active' : ''}`}
              >
                {typeof item !== 'number' ? (
                  <span className="page-link" aria-hidden="true">
                    …
                  </span>
                ) : (
                  <button
                    type="button"
                    className="page-link"
                    aria-label={copy.pageLabel(item)}
                    aria-current={item === page.page ? 'page' : undefined}
                    disabled={loading || item === page.page}
                    onClick={() => onPageChange(item)}
                  >
                    {item}
                  </button>
                )}
              </li>
            ))}
            {navigationButton('next', page.page + 1, page.page >= page.pages)}
            {navigationButton(
              'last',
              Math.max(page.pages, 1),
              !page.pages || page.page === page.pages,
            )}
          </ul>
        </nav>
      </div>
    </div>
  );
}
