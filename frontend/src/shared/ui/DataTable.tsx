import { BooleanCell } from './BooleanCell';
import styles from './DataTable.module.css';
import type { DataTableProps } from './DataTable.types';
import { DataTableFooter } from './DataTableFooter';
import { DataTableHead } from './DataTableHead';
import { DataTableToolbar } from './DataTableToolbar';
import { LoadingIndicator } from './LoadingIndicator';
import { TableCheckbox } from './TableCheckbox';
import { useDataTable } from './useDataTable';
export type {
  DataTableColumn,
  DataTableCopy,
  DataTableExport,
  DataTableSelection,
  DataTableSort,
} from './DataTable.types';

/** Present a controlled server page; the feature owns transport, query scope and records. */
export function DataTable<T>(props: DataTableProps<T>) {
  const model = useDataTable(props);
  const {
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
  } = model;
  return (
    <div className={styles.root}>
      <DataTableToolbar model={model} />
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
            <DataTableHead model={model} />
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
                    const editor = column.editing?.render(row, column.label, rowKey(row));
                    return (
                      <td key={column.id} className={styles.cell}>
                        {editor !== undefined ? (
                          editor
                        ) : column.render ? (
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
      <DataTableFooter model={model} />
    </div>
  );
}
