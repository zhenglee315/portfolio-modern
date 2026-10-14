import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { readTableQuery, writeTableQuery, type DataTableQueryState } from '../lib/table-query';
import type { DataTableFilter, DataTableFilterSpec } from '../lib/table-filter';
import type { DataTableSort } from '../ui/DataTable';
import type { DataTableSearchState } from '../lib/table-search';

/** Optional URL controller shared by management tables; data fetching remains with the owner. */
export function useDataTableQuery(
  sortable: readonly string[],
  fields: Record<string, DataTableFilterSpec>,
  initialSize = 6,
  searchable?: readonly string[],
) {
  const [params, setParams] = useSearchParams();
  const state = useMemo(
    () => readTableQuery(params, sortable, fields, initialSize, searchable),
    [params, sortable, fields, initialSize, searchable],
  );
  const update = useCallback(
    (patch: Partial<DataTableQueryState>) => {
      void setParams(writeTableQuery({ ...state, ...patch }), { preventScrollReset: true });
    },
    [state, setParams],
  );
  return {
    state,
    onPageChange: useCallback((page: number) => update({ page }), [update]),
    onSizeChange: useCallback((size: number) => update({ page: 1, size }), [update]),
    onSortChange: useCallback((sort: DataTableSort[]) => update({ page: 1, sort }), [update]),
    onFiltersChange: useCallback(
      (filters: DataTableFilter[]) => update({ page: 1, filters }),
      [update],
    ),
    onSearchChange: useCallback(
      (search: DataTableSearchState) => update({ page: 1, search }),
      [update],
    ),
  };
}

/** Select stable row keys within an owner-defined scope; navigation resets selection synchronously. */
export function useDataTableSelection(scope: string) {
  const [selection, setSelection] = useState({ scope, keys: [] as (string | number)[] });
  if (selection.scope !== scope) setSelection({ scope, keys: [] });
  return {
    keys: selection.scope === scope ? selection.keys : [],
    onChange: useCallback((keys: (string | number)[]) => setSelection({ scope, keys }), [scope]),
  };
}
