/** Applied substring search over owner-allowlisted data columns; empty text clears the predicate. */
export type DataTableSearchState = { term: string; fields: string[] };

export const tableSearchMaxLength = 200;

/** Validate search scope without interpreting field names as expressions or modifying column filters. */
export function parseTableSearch(
  value: unknown,
  allowed: readonly string[],
): DataTableSearchState | undefined {
  if (!value || typeof value !== 'object') return;
  const search = value as Partial<DataTableSearchState>;
  if (
    typeof search.term !== 'string' ||
    search.term.length > tableSearchMaxLength ||
    !Array.isArray(search.fields) ||
    !search.fields.length ||
    search.fields.length > allowed.length ||
    search.fields.some((field) => typeof field !== 'string' || !allowed.includes(field)) ||
    new Set(search.fields).size !== search.fields.length
  )
    return;
  return { term: search.term.trim(), fields: [...search.fields].sort() };
}
