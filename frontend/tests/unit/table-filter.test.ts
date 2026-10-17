import { describe, expect, it } from 'vitest';
import {
  filterOperators,
  parseTableFilters,
  type DataTableFilterSpec,
} from '@/shared/lib/table-filter';
import { readTableQuery, writeTableQuery } from '@/shared/lib/table-query';

const fields: Record<string, DataTableFilterSpec> = {
  name: { type: 'text' },
  count: { type: 'number', integer: true },
  enabled: { type: 'boolean' },
  date: { type: 'date', nullable: true },
  category: { type: 'enum', options: [{ value: 'one', label: 'One' }] },
  role: { type: 'text', sets: true },
};
describe('portable table filter contracts', () => {
  it('offers capabilities by data type rather than cell renderer', () => {
    expect(filterOperators(fields.name!)).toHaveLength(8);
    expect(filterOperators(fields.enabled!)).toEqual(['equals', 'not_equals']);
    expect(filterOperators(fields.date!)).toContain('empty');
  });
  it('preserves false, zero, whole Unicode text and inclusive bounds', () => {
    const filters = [
      { field: 'enabled', operator: 'equals', value: false },
      { field: 'count', operator: 'equals', value: 0 },
      { field: 'name', operator: 'contains', value: '🌍'.repeat(200) },
      {
        field: 'date',
        operator: 'between',
        value: ['2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z'],
      },
    ];
    expect(parseTableFilters(filters, fields)).toEqual(filters);
  });
  it('accepts valid calendar dates and retains timestamp precision for existing API filters', () => {
    for (const value of [
      '2026-01-01',
      '2024-02-29',
      '0001-01-01',
      '9999-12-30',
      '2026-01-01T12:30:00Z',
    ])
      expect(
        parseTableFilters([{ field: 'date', operator: 'equals', value }], fields),
      ).not.toBeNull();
    for (const value of ['2026-02-29', '2026-02-30', '2026-13-01', '0000-01-01', '9999-12-31'])
      expect(parseTableFilters([{ field: 'date', operator: 'equals', value }], fields)).toBeNull();
    expect(
      parseTableFilters(
        [{ field: 'date', operator: 'between', value: ['2026-01-01', '2026-01-02'] }],
        fields,
      ),
    ).toBeNull();
    expect(filterOperators({ type: 'date' })).toContain('empty');
  });
  it('validates bounded multi-value predicates without treating an empty selection as no filter', () => {
    const filters = [
      { field: 'role', operator: 'in', value: [] },
      { field: 'name', operator: 'equals', value: 'Alice' },
    ];
    expect(parseTableFilters(filters, fields)).toEqual(filters);
    expect(
      parseTableFilters(
        [{ field: 'role', operator: 'not_in', value: ['editor', 'admin'] }],
        fields,
      ),
    ).not.toBeNull();
    for (const predicate of [
      { field: 'role', operator: 'in', value: ['Admin', 'admin'] },
      { field: 'role', operator: 'in', value: [1] },
      { field: 'role', operator: 'in', value: Array.from({ length: 101 }, (_, i) => String(i)) },
      { field: 'name', operator: 'in', value: ['Alice'] },
    ])
      expect(parseTableFilters([predicate], fields)).toBeNull();
  });
  it.each(
    [
      [{ field: 'missing', operator: 'equals', value: 1 }],
      [{ field: 'enabled', operator: 'contains', value: 'false' }],
      [{ field: 'enabled', operator: 'equals', value: 'false' }],
      [{ field: 'count', operator: 'equals', value: 0.5 }],
      [{ field: 'count', operator: 'between', value: [2, 1] }],
      [{ field: 'category', operator: 'equals', value: 'missing' }],
      [{ field: 'date', operator: 'equals', value: '2026-02-30T00:00:00Z' }],
      [{ field: 'name', operator: 'empty', value: 'ignored' }],
      [{ field: 'name', operator: 'contains', value: 'x'.repeat(201) }],
      [
        { field: 'name', operator: 'empty' },
        { field: 'name', operator: 'not_empty' },
      ],
    ].map((predicate) => ({ predicate })),
  )('rejects an invalid typed predicate %j', ({ predicate }) => {
    expect(parseTableFilters(predicate, fields)).toBeNull();
  });
  it('canonicalizes URL predicates, preserves empty sort and normalizes malformed bookmarks', () => {
    const state = {
      page: 3,
      size: 10,
      sort: [],
      filters: [
        { field: 'name', operator: 'contains' as const, value: '_rate%' },
        { field: 'enabled', operator: 'equals' as const, value: false },
      ],
    };
    const params = writeTableQuery(state);
    expect(params.get('sort')).toBe('');
    expect(readTableQuery(params, ['name', 'count'], fields)).toEqual({
      ...state,
      filters: [state.filters[1], state.filters[0]],
    });
    expect(
      readTableQuery(
        new URLSearchParams('page=-1&size=all&sort=secret:asc&filters=%7B'),
        ['name'],
        fields,
      ),
    ).toEqual({ page: 1, size: 6, sort: [], filters: [] });
  });
});
