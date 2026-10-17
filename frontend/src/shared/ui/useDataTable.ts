import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { tableCsv, tablePrintHtml, tableTsv, tableXlsx } from '../lib/table-export';
import type { DataTableColumn, DataTableProps, DataTableSort } from './DataTable.types';
import type { DataTableChoice } from './DataTableChoices';
import { downloadTable, printTable } from './data-table-export';
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
        });
      }
      return [[column.id, options]];
    }),
  );
}

/** Own local choices/visibility and cancellable export work for a controlled server page.
 * Query scope, row selection and persistence remain with the calling feature.
 */
export function useDataTable<T>({
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
}: DataTableProps<T>) {
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
      '--table-header-help': column.help ? 'var(--table-help-width, 20px)' : '0px',
      '--table-header-tools': widths.length
        ? `calc(${widths.join(' + ')} + ${widths.length + 1}px)`
        : '0px',
    } as CSSProperties;
  };

  return {
    columns,
    rows,
    rowKey,
    sort,
    onSortChange,
    loading,
    error,
    onRetry,
    rowActions,
    selection,
    maxHeight,
    copy,
    visibleColumns,
    selectedKeys,
    pendingRows,
    filters,
    onFiltersChange,
    choiceCache,
    allRowsSelected,
    changeSort,
    columnStyle,
    toolbar,
    toolbarStart,
    search,
    exportOptions,
    visibility,
    setVisibility,
    exportBusy,
    exportStatus,
    exportRows,
    page,
    onPageChange,
    onSizeChange,
    first,
    last,
    sizeOptions,
  };
}
export type DataTableModel<T> = ReturnType<typeof useDataTable<T>>;
