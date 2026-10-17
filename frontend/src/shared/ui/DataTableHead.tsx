import { type CSSProperties } from 'react';
import styles from './DataTable.module.css';
import { DataTableColumnMenu } from './DataTableColumnMenu';
import { HelpTooltip } from './HelpTooltip';
import { Icon } from './Icon';
import { TableCheckbox } from './TableCheckbox';
import type { DataTableModel } from './useDataTable';

/** Presentation only; the owning controller retains state and cancellation. */
export function DataTableHead<T>({ model }: { model: DataTableModel<T> }) {
  const {
    columns,
    rows,
    rowKey,
    sort,
    filters,
    onFiltersChange,
    loading,
    error,
    rowActions,
    selection,
    copy,
    choiceCache,
    visibleColumns,
    selectedKeys,
    allRowsSelected,
    changeSort,
    columnStyle,
  } = model;
  return (
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
                {column.help && (
                  <span className={styles.headerHelp}>
                    <HelpTooltip {...column.help} />
                  </span>
                )}
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
                            className={direction === target ? styles.sortSelected : undefined}
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
  );
}
