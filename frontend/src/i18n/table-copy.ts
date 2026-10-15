import type { TFunction } from 'i18next';
import type { DataTableCopy } from '@/shared/ui/DataTable';
import type { DataTableSearchCopy } from '@/shared/ui/DataTableSearch';

/** Share the search/field-picker vocabulary across full-page tables and history dialogs.
 * @author ZhengLee 2026.10.15
 */
export function dataTableSearchCopy(t: TFunction): DataTableSearchCopy {
  return {
    label: t('management.tableSearch.label'),
    submit: t('management.tableSearch.submit'),
    fields: t('management.tableSearch.fields'),
    all: t('management.all'),
    placeholder: t('management.tableSearch.placeholder'),
    selected: (count) => t('management.tableSearch.selected', { count }),
    remove: (label) => t('management.tableSearch.remove', { label }),
  };
}

/** Inject the complete table vocabulary once for all management consumers. */
export function dataTableCopy(t: TFunction, caption: string): DataTableCopy {
  return {
    caption,
    loading: t('ui.loading'),
    empty: t('management.empty'),
    error: t('management.loadError'),
    retry: t('ui.retry'),
    rowsPerPage: t('management.rowsPerPage'),
    pagination: t('management.pagination'),
    first: t('management.first'),
    previous: t('management.previous'),
    next: t('management.next'),
    last: t('management.last'),
    columns: t('management.columns'),
    allColumns: t('management.all'),
    sorting: t('management.sorting'),
    clearSort: t('management.clearSort'),
    filter: {
      condition: t('management.filter.condition'),
      value: t('management.filter.value'),
      from: t('management.filter.from'),
      to: t('management.filter.to'),
      all: t('management.all'),
      yes: t('management.yes'),
      no: t('management.no'),
      clearAll: t('management.filter.clearAll'),
      clear: t('management.filter.clear'),
      invalid: t('management.filter.invalid'),
      timezone: t('management.filter.timezone'),
      search: t('management.filter.search'),
      values: t('management.filter.values'),
      select: t('management.filter.select'),
      deselect: t('management.filter.deselect'),
      selectHint: t('management.filter.selectHint'),
      deselectHint: t('management.filter.deselectHint'),
      noOptions: t('management.filter.noOptions'),
      more: t('management.filter.more'),
      textMode: t('management.filter.textMode'),
      valueMode: t('management.filter.valueMode'),
      sortAscending: t('management.filter.sortAscending'),
      sortDescending: t('management.filter.sortDescending'),
      clearSort: t('management.filter.clearSort'),
      typeLabels: {
        text: t('management.filter.types.text'),
        number: t('management.filter.types.number'),
        date: t('management.filter.types.date'),
        boolean: t('management.filter.types.boolean'),
        enum: t('management.filter.types.enum'),
      },
      operators: Object.fromEntries(
        [
          'contains',
          'not_contains',
          'equals',
          'not_equals',
          'starts',
          'ends',
          'empty',
          'not_empty',
          'gt',
          'gte',
          'lt',
          'lte',
          'between',
          'in',
          'not_in',
        ].map((operator) => [operator, t(`management.filter.operators.${operator}`)]),
      ) as DataTableCopy['filter']['operators'],
      dateOperators: {
        equals: t('management.filter.operators.equals'),
        not_equals: t('management.filter.operators.not_equals'),
        gt: t('management.filter.after'),
        lt: t('management.filter.before'),
      },
    },
    columnMenuLabel: (column) => t('management.columnMenu', { column }),
    export: {
      label: t('management.export.label'),
      copy: t('management.export.copy'),
      excel: t('management.export.excel'),
      csv: t('management.export.csv'),
      print: t('management.export.print'),
      scope: t('management.export.scope'),
      busy: t('management.export.busy'),
      error: t('management.export.error'),
      copied: t('management.export.copied'),
    },
    readonly: t('management.readonly'),
    actions: t('management.actions'),
    range: (from, to, total, selected) =>
      t('management.range', { from, to, total }) +
      (selected
        ? t(selected === 1 ? 'management.selectedRow' : 'management.selectedRows', {
            count: selected,
          })
        : ''),
    pageLabel: (page) => t('management.pageLabel', { page }),
    sortLabel: (column, direction) =>
      t(
        `management.${direction === 'none' ? 'removeSort' : direction === 'asc' ? 'sortAsc' : 'sortDesc'}`,
        { column },
      ),
    direction: { asc: t('management.ascending'), desc: t('management.descending') },
  };
}
