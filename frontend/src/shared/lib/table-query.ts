import { parseTableFilters, type DataTableFilter, type DataTableFilterSpec } from './table-filter';
import type { DataTableSort } from '../ui/DataTable';
import { parseTableSearch, type DataTableSearchState } from './table-search';

export type DataTableQueryState = {
  page: number;
  size: number;
  sort: DataTableSort[];
  filters: DataTableFilter[];
  search?: DataTableSearchState;
};

/** Normalize bookmark/history controls against owner-supplied field capabilities. */
export function readTableQuery(
  params: URLSearchParams,
  sortable: readonly string[],
  fields: Record<string, DataTableFilterSpec>,
  initialSize = 6,
  searchable: readonly string[] = Object.keys(fields),
): DataTableQueryState {
  const integer = (key: string, fallback: number, maximum: number) => {
    const value = Number(params.get(key));
    return Number.isSafeInteger(value) && value >= 1 && value <= maximum ? value : fallback;
  };
  const sort = (params.get('sort') ?? '')
    .split(',')
    .flatMap<DataTableSort>((pair) => {
      const [field, direction] = pair.split(':');
      return field && sortable.includes(field) && (direction === 'asc' || direction === 'desc')
        ? [{ field, direction }]
        : [];
    })
    .filter(
      (entry, index, array) => array.findIndex((item) => item.field === entry.field) === index,
    )
    .slice(0, 3);
  let filters: DataTableFilter[] = [];
  try {
    const raw = params.get('filters') ?? '[]';
    if (raw.length <= 16384) filters = parseTableFilters(JSON.parse(raw), fields) ?? [];
  } catch {
    /* Invalid bookmarks normalize; transport validates programmatic state strictly. */
  }
  let search: DataTableSearchState | undefined;
  if (params.has('search') || params.has('search_fields')) {
    try {
      const raw = params.get('search_fields');
      if (!raw || raw.length <= 4096)
        search = parseTableSearch(
          {
            term: params.get('search') ?? '',
            fields: raw ? JSON.parse(raw) : searchable,
          },
          searchable,
        );
    } catch {
      /* Invalid search bookmarks normalize without weakening transport validation. */
    }
  }
  return {
    page: integer('page', 1, Number.MAX_SAFE_INTEGER),
    size: integer('size', initialSize, 100),
    sort,
    filters,
    ...(search ? { search } : {}),
  };
}

/** Encode one canonical query; presentation state and business data never enter the URL. */
export function writeTableQuery(state: DataTableQueryState): URLSearchParams {
  const params = new URLSearchParams({
    page: String(state.page),
    size: String(state.size),
    sort: state.sort.map((item) => `${item.field}:${item.direction}`).join(','),
  });
  if (state.filters.length)
    params.set(
      'filters',
      JSON.stringify([...state.filters].sort((a, b) => a.field.localeCompare(b.field))),
    );
  if (state.search) {
    const term = state.search.term.trim();
    if (term) params.set('search', term);
    params.set('search_fields', JSON.stringify([...state.search.fields].sort()));
  }
  return params;
}
