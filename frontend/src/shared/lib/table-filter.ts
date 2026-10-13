/** Column capabilities and predicates stay independent of cell rendering and transport. */
export type TableFilterOperator =
  | 'contains'
  | 'not_contains'
  | 'equals'
  | 'not_equals'
  | 'starts'
  | 'ends'
  | 'empty'
  | 'not_empty'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'between'
  | 'in'
  | 'not_in';
export type DataTableFilter =
  | { field: string; operator: 'empty' | 'not_empty' }
  | {
      field: string;
      operator: Exclude<TableFilterOperator, 'empty' | 'not_empty' | 'between' | 'in' | 'not_in'>;
      value: string | number | boolean;
    }
  | { field: string; operator: 'between'; value: [string | number, string | number] }
  | { field: string; operator: 'in' | 'not_in'; value: string[] };
export type DataTableFilterSpec =
  | { type: 'text'; nullable?: boolean; sets?: boolean }
  | { type: 'date' | 'boolean'; nullable?: boolean }
  | { type: 'number'; nullable?: boolean; integer?: boolean; minimum?: number; maximum?: number }
  | {
      type: 'enum';
      nullable?: boolean;
      sets?: boolean;
      options: { value: string; label: string }[];
    };

export const tableFilterMaxValues = 100;

/** Offer only operators meaningful for the declared field type and nullability. */
export function filterOperators(spec: DataTableFilterSpec): TableFilterOperator[] {
  if (spec.type === 'text')
    return [
      'contains',
      'not_contains',
      'equals',
      'not_equals',
      'starts',
      'ends',
      'empty',
      'not_empty',
      ...(spec.sets ? (['in', 'not_in'] as const) : []),
    ];
  const result: TableFilterOperator[] =
    spec.type === 'number' || spec.type === 'date'
      ? ['equals', 'not_equals', 'gt', 'gte', 'lt', 'lte', 'between']
      : ['equals', 'not_equals'];
  if (spec.type === 'enum' && spec.sets) result.push('in', 'not_in');
  return spec.nullable || spec.type === 'date' ? [...result, 'empty', 'not_empty'] : result;
}

/** Validate untrusted URL predicates; callers choose normalization or a transport error. */
export function parseTableFilters(
  raw: unknown,
  fields: Record<string, DataTableFilterSpec>,
): DataTableFilter[] | null {
  if (!Array.isArray(raw) || raw.length > Object.keys(fields).length) return null;
  const seen = new Set<string>();
  const result: DataTableFilter[] = [];
  for (const item of raw) {
    if (
      !item ||
      typeof item !== 'object' ||
      Array.isArray(item) ||
      Object.keys(item).some((key) => !['field', 'operator', 'value'].includes(key))
    )
      return null;
    const { field, operator, value } = item as Record<string, unknown>;
    if (typeof field !== 'string' || !Object.hasOwn(fields, field) || seen.has(field)) return null;
    const spec = fields[field]!;
    if (
      typeof operator !== 'string' ||
      !filterOperators(spec).includes(operator as TableFilterOperator)
    )
      return null;
    seen.add(field);
    if (operator === 'empty' || operator === 'not_empty') {
      if (value !== undefined && value !== null) return null;
      result.push({ field, operator });
      continue;
    }
    const valid = (part: unknown) => {
      if (spec.type === 'boolean') return typeof part === 'boolean';
      if (spec.type === 'number')
        return (
          typeof part === 'number' &&
          Number.isFinite(part) &&
          Math.abs(part) <= Number.MAX_SAFE_INTEGER &&
          (!spec.integer || Number.isInteger(part)) &&
          part >= (spec.minimum ?? -Number.MAX_SAFE_INTEGER) &&
          part <= (spec.maximum ?? Number.MAX_SAFE_INTEGER)
        );
      if (typeof part !== 'string' || !part || Array.from(part).length > 200) return false;
      if (spec.type === 'enum') return spec.options.some((option) => option.value === part);
      if (spec.type !== 'date') return true;
      if (part.startsWith('0000-')) return false;
      if (/^\d{4}-\d\d-\d\d$/.test(part))
        return (
          operator !== 'between' &&
          part <= '9999-12-30' &&
          Number.isFinite(Date.parse(`${part}T00:00:00Z`)) &&
          new Date(`${part}T00:00:00Z`).toISOString().slice(0, 10) === part
        );
      return (
        /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(part) &&
        Number.isFinite(Date.parse(part)) &&
        new Date(part).toISOString().slice(0, 19) === part.slice(0, 19)
      );
    };
    if (operator === 'in' || operator === 'not_in') {
      if (
        !Array.isArray(value) ||
        value.length > tableFilterMaxValues ||
        !value.every(valid) ||
        new Set(value.map((part) => (spec.type === 'text' ? String(part).toLowerCase() : part)))
          .size !== value.length
      )
        return null;
    } else if (operator === 'between') {
      if (!Array.isArray(value) || value.length !== 2 || !value.every(valid)) return null;
      if (
        spec.type === 'date'
          ? Date.parse(String(value[0])) > Date.parse(String(value[1]))
          : value[0] > value[1]
      )
        return null;
    } else if (!valid(value)) return null;
    result.push({ field, operator, value } as DataTableFilter);
  }
  return result;
}
