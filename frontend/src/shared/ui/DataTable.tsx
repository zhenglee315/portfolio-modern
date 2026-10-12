import { useEffect, useId, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Dropdown from 'react-bootstrap/Dropdown';
import { Icon } from './Icon';
import { LoadingIndicator } from './LoadingIndicator';
import { tableCsv, tablePrintHtml, tableTsv, tableXlsx } from '../lib/table-export';
import styles from './DataTable.module.css';

export type DataTableSort = { field: string; direction: 'asc' | 'desc' };
export type DataTableExport<T> = {
  filename: string;
  /** Omit to export this page; owners may explicitly load the selected server result instead. */
  loadRows?: (signal: AbortSignal) => Promise<T[]>;
};

export type DataTableColumn<T> = {
  id: string;
  label: string;
  value: (row: T) => string | number | boolean | null;
  sortable?: boolean;
  initiallyHidden?: boolean;
  /** Required identity columns stay visible regardless of picker or initial visibility. */
  hideable?: boolean;
  render?: (row: T) => ReactNode;
  /** One owner-defined server choice; an empty value clears this column's filter. */
  filter?: {
    value: string;
    allLabel: string;
    options: { value: string; label: string }[];
    onChange: (value: string) => void;
  };
};

export type DataTableCopy = {
  caption: string;
  loading: string;
  empty: string;
  error: string;
  retry: string;
  rowsPerPage: string;
  pagination: string;
  previous: string;
  next: string;
  columns: string;
  sorting: string;
  clearSort: string;
  sortHint: string;
  multiSort: string;
  readonly: string;
  actions: string;
  direction: { asc: string; desc: string };
  range: (from: number, to: number, total: number) => string;
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
  sort: DataTableSort[];
  onSortChange: (sort: DataTableSort[]) => void;
  onPageChange: (page: number) => void;
  onSizeChange: (size: number) => void;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
  rowActions?: (row: T) => ReactNode;
  toolbar?: ReactNode;
  export?: DataTableExport<T>;
  copy: DataTableCopy;
};

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

/** Cycle one criterion or retain ordered Shift-click criteria without sorting the supplied rows. */
function nextSort(sort: DataTableSort[], field: string, append: boolean): DataTableSort[] {
  const current = sort.find((criterion) => criterion.field === field);
  const direction = current?.direction === 'asc' ? 'desc' : current ? null : 'asc';
  if (!append) return direction ? [{ field, direction }] : [];
  if (current) {
    return direction
      ? sort.map((criterion) => (criterion.field === field ? { field, direction } : criterion))
      : sort.filter((criterion) => criterion.field !== field);
  }
  return sort.length < 3 ? [...sort, { field, direction: 'asc' }] : sort;
}

/** Set an explicit menu criterion while respecting the same ordered three-column limit. */
function setSortDirection(
  sort: DataTableSort[],
  field: string,
  direction: 'asc' | 'desc' | null,
  append: boolean,
): DataTableSort[] {
  if (!direction) return sort.filter((criterion) => criterion.field !== field);
  if (!append) return [{ field, direction }];
  if (sort.some((criterion) => criterion.field === field))
    return sort.map((criterion) => (criterion.field === field ? { field, direction } : criterion));
  return sort.length < 3 ? [...sort, { field, direction }] : sort;
}

/** Keep column choices outside the horizontal viewport while their owner controls server state. */
function ColumnFilter<T>({
  column,
  sort,
  multiSort,
  onSortChange,
  loading,
  copy,
}: {
  column: DataTableColumn<T>;
  sort: DataTableSort[];
  multiSort: boolean;
  onSortChange: (sort: DataTableSort[]) => void;
  loading: boolean;
  copy: DataTableCopy;
}) {
  const id = useId();
  const toggle = useRef<HTMLButtonElement>(null);
  const [show, setShow] = useState(false);
  const [theme, setTheme] = useState<string>();
  const filter = column.filter!;
  const close = () => {
    setShow(false);
    toggle.current?.focus();
  };
  const chooseSort = (direction: 'asc' | 'desc' | null) => {
    if (loading) return;
    const next = setSortDirection(sort, column.id, direction, multiSort);
    if (next !== sort) onSortChange(next);
    close();
  };
  return (
    <Dropdown
      className={styles.columnFilter}
      show={show}
      autoClose="outside"
      focusFirstItemOnShow="keyboard"
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
        className={`${styles.filterToggle} ${filter.value ? styles.filterActive : ''}`}
        aria-label={copy.columnMenuLabel?.(column.label) ?? column.label}
        aria-controls={show ? `${id}-menu` : undefined}
      >
        <Icon name={filter.value ? 'funnelFill' : 'funnel'} />
      </Dropdown.Toggle>
      {typeof document !== 'undefined' &&
        createPortal(
          <Dropdown.Menu
            id={`${id}-menu`}
            className={styles.filterMenu}
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
            {column.sortable && (
              <>
                {(['asc', 'desc'] as const).map((direction) => (
                  <Dropdown.Item
                    key={direction}
                    as="button"
                    type="button"
                    disabled={loading}
                    onClick={() => chooseSort(direction)}
                  >
                    <Icon name={direction === 'asc' ? 'caretUpFill' : 'caretDownFill'} />
                    <span>{copy.sortLabel(column.label, direction)}</span>
                  </Dropdown.Item>
                ))}
                <Dropdown.Item
                  as="button"
                  type="button"
                  disabled={loading}
                  onClick={() => chooseSort(null)}
                >
                  {copy.sortLabel(column.label, 'none')}
                </Dropdown.Item>
                <Dropdown.Divider />
              </>
            )}
            <fieldset className={styles.filterChoices} disabled={loading}>
              <legend className="visually-hidden">{column.label}</legend>
              {[{ value: '', label: filter.allLabel }, ...filter.options].map((option) => (
                <label className={`form-check ${styles.filterChoice}`} key={option.value}>
                  <input
                    className="form-check-input"
                    type="radio"
                    name={`${id}-filter`}
                    value={option.value}
                    checked={filter.value === option.value}
                    onClick={() => {
                      if (!loading && filter.value === option.value) close();
                    }}
                    onChange={() => {
                      if (loading) return;
                      filter.onChange(option.value);
                      close();
                    }}
                  />
                  <span className="form-check-label">{option.label}</span>
                </label>
              ))}
            </fieldset>
          </Dropdown.Menu>,
          document.body,
        )}
    </Dropdown>
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
  onSortChange,
  onPageChange,
  onSizeChange,
  loading = false,
  error = false,
  onRetry,
  rowActions,
  toolbar,
  export: exportOptions,
  copy,
}: Props<T>) {
  const id = useId();
  const [visibility, setVisibility] = useState<Record<string, boolean>>({});
  const [multiSort, setMultiSort] = useState(false);
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
  const first = rows.length ? (page.page - 1) * page.size + 1 : 0;
  const last = rows.length ? Math.min(first + rows.length - 1, page.total) : 0;
  const sizeOptions = [...new Set([6, 10, 25, 50, 100, page.size])].sort((a, b) => a - b);
  const changeSort = (event: MouseEvent<HTMLButtonElement>, field: string) => {
    if (loading) return;
    const changed = nextSort(sort, field, event.shiftKey || multiSort);
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
  return (
    <div className={styles.root}>
      <div className={styles.toolbar}>
        <div className={styles.toolbarActions}>
          {exportOptions && copy.export && (
            <Dropdown className={styles.exportPicker}>
              <Dropdown.Toggle
                variant="outline-secondary"
                size="sm"
                disabled={
                  loading || error || exportBusy || (!rows.length && !exportOptions.loadRows)
                }
              >
                {exportBusy ? copy.export.busy : copy.export.label}
              </Dropdown.Toggle>
              <Dropdown.Menu className={styles.exportMenu}>
                <Dropdown.Header>{copy.export.scope}</Dropdown.Header>
                {(['copy', 'excel', 'csv', 'print'] as const).map((kind) => (
                  <Dropdown.Item
                    as="button"
                    type="button"
                    key={kind}
                    onClick={() => void exportRows(kind)}
                  >
                    {copy.export![kind]}
                  </Dropdown.Item>
                ))}
              </Dropdown.Menu>
            </Dropdown>
          )}
          <Dropdown autoClose="outside" className={styles.columnPicker}>
            <Dropdown.Toggle variant="outline-secondary" size="sm">
              {copy.columns}
            </Dropdown.Toggle>
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
              {columns.map((column) => {
                const checked =
                  column.hideable === false || (visibility[column.id] ?? !column.initiallyHidden);
                return (
                  <label key={column.id} className={`form-check ${styles.columnChoice}`}>
                    <input
                      className="form-check-input"
                      type="checkbox"
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
        </div>
        {toolbar && <div className={styles.toolbarSlot}>{toolbar}</div>}
        {exportStatus && copy.export && (
          <p className={styles.exportStatus} role={exportStatus === 'error' ? 'alert' : 'status'}>
            {copy.export[exportStatus]}
          </p>
        )}
      </div>
      <div className={styles.sortOptions}>
        <p id={`${id}-sort-hint`} className={styles.hint}>
          {copy.sortHint}
        </p>
        <label className={styles.multiSort}>
          <input
            type="checkbox"
            className="form-check-input"
            checked={multiSort}
            onChange={(event) => setMultiSort(event.target.checked)}
          />
          <span>{copy.multiSort}</span>
        </label>
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
      <div
        className={`table-responsive ${styles.scroll}`}
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
              {visibleColumns.map((column) => {
                const rank = sort.findIndex((criterion) => criterion.field === column.id);
                const direction = sort[rank]?.direction;
                const next = direction === 'asc' ? 'desc' : direction ? 'none' : 'asc';
                return (
                  <th
                    key={column.id}
                    scope="col"
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
                      {column.sortable ? (
                        <button
                          type="button"
                          className={styles.sortButton}
                          aria-label={copy.sortLabel(column.label, next)}
                          aria-describedby={`${id}-sort-hint`}
                          aria-disabled={loading}
                          onClick={(event) => changeSort(event, column.id)}
                        >
                          <span>{column.label}</span>
                          <span aria-hidden="true" className={styles.sortIcon}>
                            <Icon
                              name="caretUpFill"
                              className={direction === 'asc' ? styles.sortSelected : undefined}
                            />
                            <Icon
                              name="caretDownFill"
                              className={direction === 'desc' ? styles.sortSelected : undefined}
                            />
                          </span>
                          {direction && (
                            <span aria-hidden="true" className={`badge ${styles.rank}`}>
                              {rank + 1}
                            </span>
                          )}
                        </button>
                      ) : (
                        column.label
                      )}
                      {column.filter && (
                        <ColumnFilter
                          column={column}
                          sort={sort}
                          multiSort={multiSort}
                          onSortChange={onSortChange}
                          loading={loading}
                          copy={copy}
                        />
                      )}
                    </div>
                  </th>
                );
              })}
              {rowActions && <th scope="col">{copy.actions}</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={rowKey(row)} data-row-key={rowKey(row)}>
                {visibleColumns.map((column) => {
                  const value = column.value(row);
                  return (
                    <td key={column.id} className={styles.cell}>
                      {column.render ? (
                        column.render(row)
                      ) : typeof value === 'boolean' ? (
                        <div className={`form-check form-switch ${styles.switch}`}>
                          <input
                            className="form-check-input"
                            type="checkbox"
                            role="switch"
                            checked={value}
                            disabled
                            aria-label={`${column.label}: ${rowKey(row)}; ${copy.readonly}`}
                            title={copy.readonly}
                          />
                        </div>
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
      <div className={styles.feedback} aria-live="polite" aria-atomic="true">
        {loading ? (
          <LoadingIndicator label={copy.loading} />
        ) : error ? (
          <div role="alert" className={styles.failure}>
            <p>{copy.error}</p>
            {onRetry && (
              <button type="button" className="btn btn-sm btn-outline-secondary" onClick={onRetry}>
                {copy.retry}
              </button>
            )}
          </div>
        ) : rows.length === 0 ? (
          <p role="status">{copy.empty}</p>
        ) : null}
      </div>
      <div className={styles.footer}>
        <p className={styles.range}>{copy.range(first, last, page.total)}</p>
        <label className={styles.size}>
          <span>{copy.rowsPerPage}</span>
          <select
            className="form-select form-select-sm"
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
            <li className={`page-item ${page.page <= 1 || loading ? 'disabled' : ''}`}>
              <button
                type="button"
                className="page-link"
                aria-label={copy.previous}
                disabled={page.page <= 1 || loading}
                onClick={() => onPageChange(Math.max(page.page - 1, 1))}
              >
                ‹
              </button>
            </li>
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
            <li className={`page-item ${page.page >= page.pages || loading ? 'disabled' : ''}`}>
              <button
                type="button"
                className="page-link"
                aria-label={copy.next}
                disabled={page.page >= page.pages || loading}
                onClick={() => onPageChange(page.page + 1)}
              >
                ›
              </button>
            </li>
          </ul>
        </nav>
      </div>
    </div>
  );
}
