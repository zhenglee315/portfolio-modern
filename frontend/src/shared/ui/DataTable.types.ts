import { type CSSProperties, type ReactNode } from 'react';
import type { DataTableCellEditing } from '../lib/data-table-edit';
import type { DataTableFilter, DataTableFilterSpec } from '../lib/table-filter';
import type { DataTableChoicesSource } from './DataTableChoices';
import { type DataTableFilterCopy } from './DataTableColumnMenu';
import { type DataTableSearchProps } from './DataTableSearch';
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
  /** Optional localized explanation, independent of the title, query controls and export label. */
  help?: { label: string; text: string };
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
  /** Bind a typed edit group; omitted or inapplicable bindings keep the existing renderer. */
  editing?: DataTableCellEditing<T>;
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

export type DataTableProps<T> = {
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
