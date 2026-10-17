import Dropdown from 'react-bootstrap/Dropdown';
import { tableToolbarMenuPosition } from '../lib/menu-position';
import styles from './DataTable.module.css';
import { DataTableFieldPicker } from './DataTableFieldPicker';
import menuStyles from './DataTableMenu.module.css';
import { DataTableSearch } from './DataTableSearch';
import type { DataTableModel } from './useDataTable';

/** Presentation only; the owning controller retains state and cancellation. */
export function DataTableToolbar<T>({ model }: { model: DataTableModel<T> }) {
  const {
    columns,
    rows,
    filters,
    onFiltersChange,
    loading,
    error,
    toolbar,
    toolbarStart,
    search,
    exportOptions,
    copy,
    visibility,
    setVisibility,
    exportBusy,
    exportStatus,
    visibleColumns,
    exportRows,
  } = model;
  return (
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
              disabled={loading || error || exportBusy || (!rows.length && !exportOptions.loadRows)}
            />
            <Dropdown.Menu
              align="start"
              className={`${menuStyles.menu} ${styles.exportMenu}`}
              popperConfig={tableToolbarMenuPosition}
            >
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
        <DataTableFieldPicker
          className={styles.columnPicker}
          label={copy.columns}
          allLabel={copy.allColumns}
          allDisabled={columns.length <= 1}
          options={columns.map((column) => {
            const checked =
              column.hideable === false || (visibility[column.id] ?? !column.initiallyHidden);
            return {
              id: column.id,
              label: column.label,
              checked,
              disabled: column.hideable === false || (checked && visibleColumns.length === 1),
            };
          })}
          onAllChange={(checked) => {
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
          onChange={(id, checked) => setVisibility((previous) => ({ ...previous, [id]: checked }))}
        />
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
  );
}
