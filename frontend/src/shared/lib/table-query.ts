import { parseTableFilters, type DataTableFilter, type DataTableFilterSpec } from './table-filter';
import type { DataTableSort } from '../ui/DataTable';

export type DataTableQueryState = {
  page: number;
  size: number;
  sort: DataTableSort[];
  filters: DataTableFilter[];
};

/** Normalize bookmark/history controls against owner-supplied field capabilities. */
export function readTableQuery(
  params: URLSearchParams,
  sortable: readonly string[],
  fields: Record<string, DataTableFilterSpec>,
  initialSize = 6,
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
  return {
    page: integer('page', 1, Number.MAX_SAFE_INTEGER),
    size: integer('size', initialSize, 100),
    sort,
    filters,
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
  return params;
}
