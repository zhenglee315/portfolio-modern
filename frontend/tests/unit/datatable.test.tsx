import { act, fireEvent, render, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { dataTableCopy } from '@/i18n/table-copy';
import { createI18n } from '@/i18n/config';
import type { DataTableFilter } from '@/shared/lib/table-filter';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  DataTable,
  type DataTableColumn,
  type DataTableCopy,
  type DataTableSort,
  type DataTableSelection,
} from '@/shared/ui/DataTable';

type Item = { id: number; name: string; active: boolean; note: string | null };
const rows: Item[] = [
  { id: 7, name: 'Zulu', active: true, note: null },
  { id: 2, name: '<b>Alpha</b>', active: false, note: 'Kept as text' },
];
const columns: DataTableColumn<Item>[] = [
  { id: 'id', label: 'ID', value: (row) => row.id, sortable: true },
  { id: 'name', label: 'Name', value: (row) => row.name, sortable: true },
  { id: 'active', label: 'Active', value: (row) => row.active, sortable: true },
  { id: 'note', label: 'Note', value: (row) => row.note, sortable: true },
];
const copy: DataTableCopy = {
  caption: 'Accounts',
  loading: 'Loading accounts',
  empty: 'No accounts',
  error: 'Unable to read accounts',
  retry: 'Retry',
  rowsPerPage: 'Rows per page',
  pagination: 'Account pages',
  first: 'First page',
  previous: 'Previous page',
  next: 'Next page',
  last: 'Last page',
  columns: 'Choose columns',
  allColumns: 'All',
  sorting: 'Sort order',
  clearSort: 'Clear sorting',
  filter: dataTableCopy(createI18n('en').t, 'Accounts').filter,
  readonly: 'Read only',
  actions: 'Actions',
  direction: { asc: 'Ascending', desc: 'Descending' },
  range: dataTableCopy(createI18n('en').t, 'Accounts').range,
  pageLabel: (page) => `Page ${page}`,
  sortLabel: (column, next) => `${column}: ${next}`,
};
const exportCopy = {
  label: 'Export',
  copy: 'Copy',
  excel: 'Excel',
  csv: 'CSV',
  print: 'Print',
  scope: 'Current page · visible columns',
  busy: 'Preparing export',
  error: 'Export failed',
  copied: 'Copied to clipboard',
};

/** Give sorting a real controlled owner while observing all emitted server-query intentions. */
function ControlledTable({ changed }: { changed: (sort: DataTableSort[]) => void }) {
  const [sort, setSort] = useState<DataTableSort[]>([]);
  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(row) => row.id}
      page={{ page: 1, size: 6, total: 2, pages: 1 }}
      sort={sort}
      onSortChange={(next) => {
        changed(next);
        setSort(next);
      }}
      onPageChange={vi.fn()}
      onSizeChange={vi.fn()}
      copy={copy}
    />
  );
}

function tableProps() {
  return {
    columns,
    rows,
    rowKey: (row: Item) => row.id,
    page: { page: 1, size: 6, total: 24, pages: 4 },
    sort: [] as DataTableSort[],
    onSortChange: vi.fn(),
    onPageChange: vi.fn(),
    onSizeChange: vi.fn(),
    copy,
  };
}

/** Supply a complete controlled table without any management resource dependency. */
function ControlledFilterTable({
  filtered,
  sorted,
}: {
  filtered: (filters: DataTableFilter[]) => void;
  sorted: (sort: DataTableSort[]) => void;
}) {
  const [filters, setFilters] = useState<DataTableFilter[]>([]);
  const [sort, setSort] = useState<DataTableSort[]>([]);
  return (
    <div data-bs-theme="dark">
      <DataTable
        {...tableProps()}
        filters={filters}
        onFiltersChange={(next) => {
          filtered(next);
          setFilters(next);
        }}
        sort={sort}
        onSortChange={(next) => {
          sorted(next);
          setSort(next);
        }}
        copy={{ ...copy, columnMenuLabel: (label) => `Options for ${label}` }}
        columns={columns.map((column) => ({
          ...column,
          filter:
            column.id === 'active'
              ? { type: 'boolean' }
              : column.id === 'id'
                ? { type: 'number', integer: true }
                : { type: 'text', nullable: true },
        }))}
      />
    </div>
  );
}

describe('controlled reusable data table', () => {
  it('opens a date-only calendar with the six requested conditions and emits whole-day values', async () => {
    const filtered = vi.fn();
    function DateOwner() {
      const [filters, setFilters] = useState<DataTableFilter[]>([
        { field: 'updated', operator: 'equals', value: '2026-10-13T12:30:00Z' },
      ]);
      return (
        <DataTable
          {...tableProps()}
          columns={[
            {
              id: 'updated',
              label: 'Updated',
              value: () => '2026-10-13T12:30:00Z',
              filter: { type: 'date' },
            },
          ]}
          filters={filters}
          onFiltersChange={(next) => {
            filtered(next);
            setFilters(next);
          }}
        />
      );
    }
    const view = render(<DateOwner />);
    const user = userEvent.setup();
    await user.click(view.getByRole('button', { name: 'Updated' }));
    const condition = view.getByRole('combobox', { name: 'Updated: Condition' });
    expect(
      within(condition)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Equals', 'Does not equal', 'After', 'Before', 'Empty', 'Not empty']);
    const input = view.getByLabelText('Updated: Value') as HTMLInputElement;
    expect(input).toHaveAttribute('type', 'date');
    expect(input).toHaveValue('2026-10-13');
    expect(filtered).not.toHaveBeenCalled();
    input.showPicker = vi.fn();
    await user.click(input);
    expect(input.showPicker).toHaveBeenCalledOnce();
    fireEvent.change(input, { target: { value: '2026-09-15' } });
    await waitFor(() =>
      expect(filtered).toHaveBeenLastCalledWith([
        { field: 'updated', operator: 'equals', value: '2026-09-15' },
      ]),
    );
    await user.selectOptions(condition, 'gt');
    await waitFor(() =>
      expect(filtered).toHaveBeenLastCalledWith([
        { field: 'updated', operator: 'gt', value: '2026-09-15' },
      ]),
    );
    await user.selectOptions(condition, 'empty');
    await waitFor(() =>
      expect(filtered).toHaveBeenLastCalledWith([{ field: 'updated', operator: 'empty' }]),
    );
    expect(view.queryByLabelText('Updated: Value')).toBeNull();
  });

  it('selects individual rows and the current page with a mixed header, independently of queries', async () => {
    const props = tableProps();
    const changed = vi.fn();
    function SelectableTable() {
      const [keys, setKeys] = useState<(string | number)[]>([]);
      return (
        <DataTable
          {...props}
          selection={{
            keys,
            onChange: (next) => {
              changed(next);
              setKeys(next);
            },
            allLabel: 'Select this page',
            rowLabel: (row) => `Select ${row.name}`,
          }}
        />
      );
    }
    const view = render(<SelectableTable />);
    const user = userEvent.setup();
    const all = view.getByRole('checkbox', { name: 'Select this page' });
    const first = view.getByRole('checkbox', { name: 'Select Zulu' });
    const second = view.getByRole('checkbox', { name: 'Select <b>Alpha</b>' });
    expect(all).not.toBeChecked();
    expect(view.getByText('Showing 1 to 2 of 24 rows, Total: 24')).toBeVisible();
    await user.click(first);
    expect(changed).toHaveBeenLastCalledWith([7]);
    expect(all).toBePartiallyChecked();
    expect(view.getByText('Showing 1 to 2 of 24 rows, Total: 24, 1 row selected')).toBeVisible();
    all.focus();
    await user.keyboard(' ');
    expect(changed).toHaveBeenLastCalledWith([7, 2]);
    expect(all).toBeChecked();
    expect(view.getByText('Showing 1 to 2 of 24 rows, Total: 24, 2 rows selected')).toBeVisible();
    expect(second).toBeChecked();
    await user.click(second);
    expect(all).toBePartiallyChecked();
    await user.click(all);
    await user.click(all);
    expect(changed).toHaveBeenLastCalledWith([]);
    expect(first).not.toBeChecked();
    expect(second).not.toBeChecked();
    expect(view.getByText('Showing 1 to 2 of 24 rows, Total: 24')).toBeVisible();
    expect(props.onSortChange).not.toHaveBeenCalled();
    expect(props.onPageChange).not.toHaveBeenCalled();
    expect(props.onSizeChange).not.toHaveBeenCalled();
  });

  it('ignores off-page keys and disables selection for pending, failed or empty pages', () => {
    const props = tableProps();
    const selection: DataTableSelection<Item> = {
      keys: [7, 99],
      onChange: vi.fn(),
      allLabel: 'Select this page',
      rowLabel: (row) => `Select ${row.id}`,
    };
    const view = render(<DataTable {...props} selection={selection} />);
    const all = view.getByRole('checkbox', { name: 'Select this page' });
    expect(all).toBePartiallyChecked();
    expect(view.getByText('Showing 1 to 2 of 24 rows, Total: 24, 1 row selected')).toBeVisible();
    fireEvent.click(all);
    expect(selection.onChange).toHaveBeenLastCalledWith([7, 2]);
    fireEvent.click(view.getByRole('checkbox', { name: 'Select 2' }));
    expect(selection.onChange).toHaveBeenLastCalledWith([7, 2]);
    view.rerender(<DataTable {...props} selection={selection} loading />);
    expect(all).toBeDisabled();
    expect(view.getByLabelText('Select 7')).toBeDisabled();
    view.rerender(<DataTable {...props} selection={selection} error />);
    expect(all).toBeDisabled();
    view.rerender(<DataTable {...props} rows={[]} selection={selection} />);
    expect(all).toBeDisabled();
    expect(all).not.toBeChecked();
    expect(all).not.toBePartiallyChecked();
  });

  it('renders the server order, literal text, nulls and accurate read-only boolean switches', () => {
    const view = render(<DataTable {...tableProps()} />);
    const bodyRows = within(view.getByRole('table', { name: 'Accounts' })).getAllByRole('row');
    expect(bodyRows[1]).toHaveTextContent('Zulu');
    expect(bodyRows[2]).toHaveTextContent('<b>Alpha</b>');
    expect(view.container.querySelector('b')).toBeNull();
    expect(within(bodyRows[1]!).getByText('—')).toBeVisible();
    const active = view.getByRole('switch', { name: 'Active: 7; Read only' });
    const inactive = view.getByRole('switch', { name: 'Active: 2; Read only' });
    expect(active).toBeChecked();
    expect(inactive).not.toBeChecked();
    expect(active).toBeDisabled();
    expect(inactive).toBeDisabled();
    expect(view.getByRole('region', { name: 'Accounts' })).toHaveAttribute('tabindex', '0');
  });

  it('toggles keyboard directions independently without sorting local rows', async () => {
    const changed = vi.fn();
    const view = render(<ControlledTable changed={changed} />);
    const user = userEvent.setup();
    view.getByRole('button', { name: 'Name: asc' }).focus();
    await user.keyboard('{Enter}');
    expect(changed).toHaveBeenLastCalledWith([{ field: 'name', direction: 'asc' }]);
    expect(view.getByRole('columnheader', { name: /Name/ })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
    await user.keyboard('{Enter}');
    expect(changed).toHaveBeenLastCalledWith([]);
    view.getByRole('button', { name: 'Name: desc' }).focus();
    await user.keyboard('{Enter}');
    expect(changed).toHaveBeenLastCalledWith([{ field: 'name', direction: 'desc' }]);
    await user.keyboard('{Enter}');
    expect(changed).toHaveBeenLastCalledWith([]);
    expect(within(view.getByRole('table')).getAllByRole('row')[1]).toHaveTextContent('Zulu');
  });

  it('keeps both direction carets and highlights only the selected direction', () => {
    const props = tableProps();
    const view = render(<DataTable {...props} />);
    const carets = () => {
      const heading = view.getByRole('columnheader', { name: /Name/ });
      return Array.from(heading.querySelector('[class*="sortIcon"]')!.querySelectorAll('.icon'));
    };
    expect(carets()).toHaveLength(2);
    expect(carets().every((caret) => !caret.className.includes('sortSelected'))).toBe(true);
    view.rerender(<DataTable {...props} sort={[{ field: 'name', direction: 'asc' }]} />);
    expect(carets()[0]!.className).toContain('sortSelected');
    expect(carets()[1]!.className).not.toContain('sortSelected');
    view.rerender(<DataTable {...props} sort={[{ field: 'name', direction: 'desc' }]} />);
    expect(carets()[0]!.className).not.toContain('sortSelected');
    expect(carets()[1]!.className).toContain('sortSelected');
  });

  it('retains click-order criteria, enforces three fields and cancels individual directions', () => {
    const changed = vi.fn();
    const view = render(<ControlledTable changed={changed} />);
    fireEvent.click(view.getByRole('button', { name: 'Name: asc' }));
    fireEvent.click(view.getByRole('button', { name: 'Active: asc' }));
    fireEvent.click(view.getByRole('button', { name: 'ID: asc' }));
    expect(changed).toHaveBeenLastCalledWith([
      { field: 'name', direction: 'asc' },
      { field: 'active', direction: 'asc' },
      { field: 'id', direction: 'asc' },
    ]);
    expect(view.getByRole('columnheader', { name: /Name/ })).toHaveAttribute('aria-sort', 'other');
    const calls = changed.mock.calls.length;
    fireEvent.click(view.getByRole('button', { name: 'Note: asc' }));
    expect(changed).toHaveBeenCalledTimes(calls);
    fireEvent.click(view.getByRole('button', { name: 'Active: desc' }));
    fireEvent.click(view.getByRole('button', { name: 'Active: desc' }));
    expect(changed).toHaveBeenLastCalledWith([
      { field: 'name', direction: 'asc' },
      { field: 'id', direction: 'asc' },
    ]);
    fireEvent.click(view.getByRole('button', { name: 'Note: asc' }));
    expect(changed).toHaveBeenLastCalledWith([
      { field: 'name', direction: 'asc' },
      { field: 'id', direction: 'asc' },
      { field: 'note', direction: 'asc' },
    ]);
    fireEvent.click(view.getByRole('button', { name: 'Clear sorting' }));
    expect(changed).toHaveBeenLastCalledWith([]);
  });

  it('allows direct descending selection and preserves other fields without a mode checkbox', async () => {
    const changed = vi.fn();
    const view = render(<ControlledTable changed={changed} />);
    const user = userEvent.setup();
    expect(view.queryByRole('checkbox', { name: 'Multi-column sorting' })).toBeNull();
    await user.click(view.getByRole('button', { name: 'Name: desc' }));
    await user.click(view.getByRole('button', { name: 'Active: asc' }));
    expect(changed).toHaveBeenLastCalledWith([
      { field: 'name', direction: 'desc' },
      { field: 'active', direction: 'asc' },
    ]);
    await user.click(view.getByRole('button', { name: 'Name: asc' }));
    expect(changed).toHaveBeenLastCalledWith([
      { field: 'name', direction: 'asc' },
      { field: 'active', direction: 'asc' },
    ]);
    expect(view.getByRole('button', { name: 'Name: asc' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(view.getByRole('button', { name: 'Name: asc' }));
    expect(changed).toHaveBeenLastCalledWith([{ field: 'active', direction: 'asc' }]);
    expect(within(view.getByRole('table')).getAllByRole('row')[1]).toHaveTextContent('Zulu');
  });

  it('emits controlled page and size changes and bounds navigation for huge totals', () => {
    const props = tableProps();
    const view = render(
      <DataTable {...props} page={{ page: 5000, size: 6, total: 60000, pages: 10000 }} />,
    );
    const pages = within(view.getByRole('navigation', { name: 'Account pages' }));
    expect(pages.getAllByRole('button').length).toBeLessThanOrEqual(11);
    expect(pages.getByRole('button', { name: 'Page 5000' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    fireEvent.click(pages.getByRole('button', { name: 'Next page' }));
    expect(props.onPageChange).toHaveBeenLastCalledWith(5001);
    fireEvent.click(pages.getByRole('button', { name: 'Page 10000' }));
    expect(props.onPageChange).toHaveBeenLastCalledWith(10000);
    fireEvent.click(pages.getByRole('button', { name: 'First page' }));
    expect(props.onPageChange).toHaveBeenLastCalledWith(1);
    fireEvent.click(pages.getByRole('button', { name: 'Last page' }));
    expect(props.onPageChange).toHaveBeenLastCalledWith(10000);
    fireEvent.change(view.getByRole('combobox', { name: 'Rows per page' }), {
      target: { value: '25' },
    });
    expect(props.onSizeChange).toHaveBeenLastCalledWith(25);
    expect(view.getByText('Showing 29995 to 29996 of 60000 rows, Total: 60000')).toBeVisible();
  });

  it('keeps column visibility local, sorted hidden fields described and one visible column', () => {
    const props = tableProps();
    const view = render(
      <DataTable
        {...props}
        columns={columns.map((column) => ({ ...column, initiallyHidden: column.id === 'note' }))}
        sort={[{ field: 'name', direction: 'asc' }]}
      />,
    );
    expect(view.queryByRole('columnheader', { name: /Note/ })).toBeNull();
    fireEvent.click(view.getByRole('button', { name: 'Choose columns' }));
    fireEvent.click(view.getByRole('checkbox', { name: 'Name' }));
    expect(view.queryByRole('columnheader', { name: /Name/ })).toBeNull();
    expect(view.getByText('1. Name Ascending')).toBeVisible();
    fireEvent.click(view.getByRole('checkbox', { name: 'Active' }));
    expect(view.getByRole('checkbox', { name: 'ID' })).toBeDisabled();
    fireEvent.click(view.getByRole('checkbox', { name: 'Note' }));
    expect(view.getByRole('columnheader', { name: /Note/ })).toBeVisible();
    expect(props.onSortChange).not.toHaveBeenCalled();
    expect(props.onPageChange).not.toHaveBeenCalled();
  });

  it('selects every column with All and clears back to required identity without changing queries', () => {
    const props = tableProps();
    const view = render(
      <DataTable
        {...props}
        columns={columns.map((column) => ({
          ...column,
          hideable: column.id !== 'id',
          initiallyHidden: column.id === 'note',
        }))}
        sort={[{ field: 'name', direction: 'asc' }]}
      />,
    );
    fireEvent.click(view.getByRole('button', { name: 'Choose columns' }));
    const all = view.getByRole('checkbox', { name: 'All' });
    expect(all).toBePartiallyChecked();
    fireEvent.click(all);
    expect(all).toBeChecked();
    expect(all).not.toBePartiallyChecked();
    expect(view.getAllByRole('columnheader')).toHaveLength(4);
    fireEvent.click(view.getByRole('checkbox', { name: 'Name' }));
    expect(all).toBePartiallyChecked();
    fireEvent.click(all);
    expect(view.getAllByRole('columnheader')).toHaveLength(4);
    fireEvent.click(all);
    expect(view.getAllByRole('columnheader')).toHaveLength(1);
    expect(view.getByRole('checkbox', { name: 'ID' })).toBeChecked();
    expect(view.getByRole('checkbox', { name: 'ID' })).toBeDisabled();
    expect(all).toBePartiallyChecked();
    expect(view.getByText('1. Name Ascending')).toBeVisible();
    expect(props.onSortChange).not.toHaveBeenCalled();
    expect(props.onPageChange).not.toHaveBeenCalled();
  });

  it('retains a visible fallback column when All clears a table with no required columns', () => {
    const view = render(<DataTable {...tableProps()} />);
    fireEvent.click(view.getByRole('button', { name: 'Choose columns' }));
    fireEvent.click(view.getByRole('checkbox', { name: 'All' }));
    expect(view.getAllByRole('columnheader')).toHaveLength(1);
    expect(view.getByRole('checkbox', { name: 'ID' })).toBeChecked();
  });

  it('keeps required columns visible and disables their chooser independently of their field name', () => {
    const view = render(
      <DataTable
        {...tableProps()}
        columns={columns.map((column) => ({
          ...column,
          initiallyHidden: column.id === 'name',
          hideable: column.id !== 'name',
        }))}
      />,
    );
    expect(view.getByRole('columnheader', { name: /Name/ })).toBeVisible();
    fireEvent.click(view.getByRole('button', { name: 'Choose columns' }));
    expect(view.getByRole('checkbox', { name: 'Name' })).toBeChecked();
    expect(view.getByRole('checkbox', { name: 'Name' })).toBeDisabled();
    expect(view.getByRole('checkbox', { name: 'ID' })).not.toBeDisabled();
  });

  it('portals typed boolean filters without changing supplied rows and preserves selected values', async () => {
    const filtered = vi.fn();
    const view = render(<ControlledFilterTable filtered={filtered} sorted={vi.fn()} />);
    const user = userEvent.setup();
    const toggle = view.getByRole('button', { name: 'Options for Active' });
    await user.click(toggle);
    const menu = document.getElementById(toggle.getAttribute('aria-controls')!)!;
    expect(menu.parentElement).toBe(document.body);
    expect(menu).toHaveAttribute('data-bs-theme', 'dark');
    expect(view.getByRole('table')).not.toContainElement(menu);
    const choice = within(menu).getByRole('combobox', { name: 'Active: Value' });
    await user.selectOptions(choice, 'false');
    await waitFor(() =>
      expect(filtered).toHaveBeenLastCalledWith([
        { field: 'active', operator: 'equals', value: false },
      ]),
    );
    expect(toggle.className).toContain('active');
    expect(within(view.getByRole('table')).getAllByRole('row')).toHaveLength(3);
    await user.keyboard('{Escape}');
    expect(toggle).toHaveFocus();
    await user.click(toggle);
    expect(within(menu).getByRole('combobox', { name: 'Active: Value' })).toHaveValue('false');
    await user.selectOptions(choice, '');
    await waitFor(() => expect(filtered).toHaveBeenLastCalledWith([]));
  });

  it('renders configured enum choices with equality and inequality independently of any page', async () => {
    const filtered = vi.fn();
    function EnumOwner() {
      const [filters, setFilters] = useState<DataTableFilter[]>([]);
      return (
        <DataTable
          {...tableProps()}
          columns={[
            {
              ...columns[1]!,
              filter: {
                type: 'enum',
                options: [
                  { value: 'a', label: 'Alpha' },
                  { value: 'z', label: 'Zulu' },
                ],
              },
            },
          ]}
          filters={filters}
          copy={{ ...copy, columnMenuLabel: (label) => `Options for ${label}` }}
          onFiltersChange={(next) => {
            filtered(next);
            setFilters(next);
          }}
        />
      );
    }
    const view = render(<EnumOwner />);
    const user = userEvent.setup();
    await user.click(view.getByRole('button', { name: 'Options for Name' }));
    await user.selectOptions(view.getByRole('combobox', { name: 'Name: Value' }), 'z');
    await waitFor(() =>
      expect(filtered).toHaveBeenLastCalledWith([
        { field: 'name', operator: 'equals', value: 'z' },
      ]),
    );
    await user.selectOptions(view.getByRole('combobox', { name: 'Name: Condition' }), 'not_equals');
    await waitFor(() =>
      expect(filtered).toHaveBeenLastCalledWith([
        { field: 'name', operator: 'not_equals', value: 'z' },
      ]),
    );
  });

  it('submits a boolean edit once while its asynchronous owner commits the query', async () => {
    const filtered = vi.fn();
    function PendingOwner() {
      const [filters, setFilters] = useState<DataTableFilter[]>([]);
      const [loading, setLoading] = useState(false);
      return (
        <DataTable
          {...tableProps()}
          columns={[{ ...columns[2]!, filter: { type: 'boolean' } }]}
          filters={filters}
          loading={loading}
          copy={{ ...copy, columnMenuLabel: (label) => `Options for ${label}` }}
          onFiltersChange={(next) => {
            filtered(next);
            setLoading(true);
            setTimeout(() => {
              setFilters(next);
              setLoading(false);
            }, 50);
          }}
        />
      );
    }
    const view = render(<PendingOwner />);
    const user = userEvent.setup();
    await user.click(view.getByRole('button', { name: 'Options for Active' }));
    await user.selectOptions(view.getByRole('combobox', { name: 'Active: Value' }), 'false');
    await waitFor(() => expect(view.getByRole('table')).toHaveAttribute('aria-busy', 'true'));
    await waitFor(() => expect(view.getByRole('table')).toHaveAttribute('aria-busy', 'false'));
    expect(filtered).toHaveBeenCalledExactlyOnceWith([
      { field: 'active', operator: 'equals', value: false },
    ]);
  });

  it('debounces whole literal text and applies Empty without requiring a value', async () => {
    const filtered = vi.fn();
    const view = render(<ControlledFilterTable filtered={filtered} sorted={vi.fn()} />);
    const user = userEvent.setup();
    await user.click(view.getByRole('button', { name: 'Options for Name' }));
    const search = view.getByRole('searchbox', { name: 'Name: Value' });
    await user.type(search, 'rate%_ reviewer');
    expect(filtered).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(filtered).toHaveBeenLastCalledWith([
        { field: 'name', operator: 'contains', value: 'rate%_ reviewer' },
      ]),
    );
    expect(search).toHaveFocus();
    await user.selectOptions(
      view.getByRole('combobox', { name: 'Name: Condition' }),
      'not_contains',
    );
    await user.keyboard('{Enter}');
    await waitFor(() =>
      expect(filtered).toHaveBeenLastCalledWith([
        { field: 'name', operator: 'not_contains', value: 'rate%_ reviewer' },
      ]),
    );
    await user.selectOptions(view.getByRole('combobox', { name: 'Name: Condition' }), 'empty');
    await waitFor(() =>
      expect(filtered).toHaveBeenLastCalledWith([{ field: 'name', operator: 'empty' }]),
    );
    expect(view.queryByRole('searchbox')).toBeNull();
    await user.click(view.getByRole('button', { name: 'Clear filter' }));
    expect(filtered).toHaveBeenLastCalledWith([]);
  });

  it('uses the same ordered sorting from menus and arrows and blocks a fourth field', async () => {
    const sorted = vi.fn();
    const view = render(<ControlledFilterTable filtered={vi.fn()} sorted={sorted} />);
    const user = userEvent.setup();
    await user.click(view.getByRole('button', { name: 'Name: asc' }));
    const choose = async (column: string, direction: string) => {
      const toggle = view.getByRole('button', { name: `Options for ${column}` });
      await user.click(toggle);
      await user.click(
        within(document.getElementById(toggle.getAttribute('aria-controls')!)!).getByRole(
          'button',
          { name: `${column}: ${direction}` },
        ),
      );
    };
    await choose('Active', 'asc');
    await user.click(view.getByRole('button', { name: 'ID: asc' }));
    expect(sorted).toHaveBeenLastCalledWith([
      { field: 'name', direction: 'asc' },
      { field: 'active', direction: 'asc' },
      { field: 'id', direction: 'asc' },
    ]);
    const calls = sorted.mock.calls.length;
    await choose('Note', 'asc');
    expect(sorted).toHaveBeenCalledTimes(calls);
    await choose('Active', 'none');
    expect(sorted).toHaveBeenLastCalledWith([
      { field: 'name', direction: 'asc' },
      { field: 'id', direction: 'asc' },
    ]);
  });

  it('derives distinct dropdown choices only from loaded rows and retains them after filtering', async () => {
    const filtered = vi.fn();
    const props = {
      ...tableProps(),
      columns: [
        {
          id: 'note',
          label: 'Note',
          value: (row: Item) => row.note,
          sortable: true,
          filter: { type: 'text' as const, sets: true },
          filterStyle: 'dropdown-list' as const,
        },
      ],
      rows: [
        { ...rows[0]!, note: 'Editor' },
        { ...rows[1]!, note: 'editor' },
        { ...rows[0]!, id: 3, note: 'Viewer' },
        { ...rows[0]!, id: 4, note: null },
        { ...rows[0]!, id: 5, note: '' },
      ],
      filters: [] as DataTableFilter[],
      onFiltersChange: filtered,
    };
    const view = render(<DataTable {...props} />);
    const user = userEvent.setup();
    const toggle = view.getByRole('button', { name: 'Note' });
    await user.click(toggle);
    const menu = within(document.getElementById(toggle.getAttribute('aria-controls')!)!);
    expect(menu.getAllByRole('checkbox')).toHaveLength(2);
    expect(menu.queryByRole('combobox')).toBeNull();
    expect(menu.queryByRole('button', { name: 'Condition' })).toBeNull();
    const color = menu.getByText('Editor').getAttribute('data-color');
    expect(menu.getByText('Viewer').getAttribute('data-color')).not.toBe(color);
    await user.click(menu.getByRole('checkbox', { name: 'Editor' }));
    expect(filtered).toHaveBeenLastCalledWith([
      { field: 'note', operator: 'in', value: ['editor'] },
    ]);
    view.rerender(
      <DataTable {...props} rows={[props.rows[0]!]} filters={filtered.mock.calls.at(-1)![0]} />,
    );
    expect(menu.getAllByRole('checkbox')).toHaveLength(2);
    expect(menu.getByRole('checkbox', { name: 'Editor' })).toBeChecked();
    await user.click(menu.getByRole('button', { name: 'Deselect(1)' }));
    expect(filtered).toHaveBeenLastCalledWith([]);
    view.rerender(<DataTable {...props} rows={[{ ...rows[0]!, note: 'Admin' }]} />);
    expect(menu.getAllByRole('checkbox')).toHaveLength(3);
    expect(menu.getByText('Editor')).toHaveAttribute('data-color', color);
    await user.click(menu.getByRole('button', { name: 'Note: desc' }));
    expect(props.onSortChange).toHaveBeenLastCalledWith([{ field: 'note', direction: 'desc' }]);
    expect(toggle).toHaveFocus();
    view.unmount();
    const fresh = render(<DataTable {...props} rows={[{ ...rows[0]!, note: 'Fresh' }]} />);
    await user.click(fresh.getByRole('button', { name: 'Note' }));
    expect(fresh.getAllByRole('checkbox')).toHaveLength(1);
    expect(fresh.getByRole('checkbox', { name: 'Fresh' })).not.toBeChecked();
  });

  it('keeps filter inputs editable while a pending read disables menu sorting', async () => {
    const filtered = vi.fn();
    const props = {
      ...tableProps(),
      columns: columns.map((column) => ({ ...column, filter: { type: 'text' as const } })),
      filters: [],
      onFiltersChange: filtered,
    };
    const view = render(<DataTable {...props} />);
    const user = userEvent.setup();
    const toggle = view.getByRole('button', { name: 'Name' });
    await user.click(toggle);
    view.rerender(<DataTable {...props} loading />);
    const menu = document.getElementById(toggle.getAttribute('aria-controls')!)!;
    expect(within(menu).getByRole('button', { name: 'Name: desc' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await user.type(within(menu).getByRole('searchbox', { name: 'Name: Value' }), 'replacement');
    await waitFor(() =>
      expect(filtered).toHaveBeenLastCalledWith([
        { field: 'name', operator: 'contains', value: 'replacement' },
      ]),
    );
    expect(props.onSortChange).not.toHaveBeenCalled();
    await user.keyboard('{Escape}');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveFocus();
  });

  it('shows distinct loading, failure/retry and empty feedback without manufacturing rows', () => {
    const props = tableProps();
    const retry = vi.fn();
    const view = render(<DataTable {...props} rows={[]} loading />);
    expect(view.getByRole('status')).toHaveTextContent(copy.loading);
    expect(view.getByRole('button', { name: 'Name: asc' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(view.getByRole('combobox')).toBeDisabled();
    expect(view.getByRole('table')).toHaveAttribute('aria-busy', 'true');
    view.rerender(<DataTable {...props} rows={[]} error onRetry={retry} />);
    expect(view.getByRole('alert')).toHaveTextContent(copy.error);
    fireEvent.click(view.getByRole('button', { name: 'Retry' }));
    expect(retry).toHaveBeenCalledOnce();
    view.rerender(
      <DataTable {...props} rows={[]} page={{ page: 1, size: 6, total: 0, pages: 0 }} />,
    );
    expect(view.getByRole('status')).toHaveTextContent(copy.empty);
    expect(view.getByText('Showing 0 to 0 of 0 rows, Total: 0')).toBeVisible();
    expect(view.getByRole('button', { name: 'Previous page' })).toBeDisabled();
    expect(view.getByRole('button', { name: 'Next page' })).toBeDisabled();
    expect(view.getByRole('button', { name: 'First page' })).toBeDisabled();
    expect(view.getByRole('button', { name: 'Last page' })).toBeDisabled();
    expect(within(view.getByRole('table')).getAllByRole('row')).toHaveLength(1);
  });

  it('preserves keyboard focus through loading while blocking premature sorting intents', async () => {
    const props = tableProps();
    const view = render(<DataTable {...props} />);
    const header = view.getByRole('button', { name: 'Name: asc' });
    const user = userEvent.setup();
    header.focus();
    view.rerender(<DataTable {...props} loading />);
    expect(header).toHaveFocus();
    expect(header).toHaveAttribute('aria-disabled', 'true');
    await user.keyboard('{Enter}');
    expect(props.onSortChange).not.toHaveBeenCalled();
    view.rerender(<DataTable {...props} />);
    expect(header).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(props.onSortChange).toHaveBeenLastCalledWith([{ field: 'name', direction: 'asc' }]);
  });

  it('permits custom cells and real row action callbacks while retaining query failure feedback', () => {
    const action = vi.fn();
    const submitted = vi.fn();
    const view = render(
      <DataTable
        {...tableProps()}
        columns={[
          {
            id: 'name',
            label: 'Name',
            value: (row) => row.name,
            render: (row) => <strong>{row.name}</strong>,
          },
        ]}
        rowActions={(row) => (
          <button type="button" onClick={() => action(row.id)}>
            Inspect {row.id}
          </button>
        )}
        toolbar={
          <form
            aria-label="Account search"
            onSubmit={(event) => {
              event.preventDefault();
              submitted();
            }}
          >
            <input aria-label="Find an account" />
            <button type="submit">Search accounts</button>
          </form>
        }
        error
      />,
    );
    expect(view.getByRole('columnheader', { name: 'Actions' })).toBeVisible();
    expect(view.getByText('Zulu').tagName).toBe('STRONG');
    fireEvent.click(view.getByRole('button', { name: 'Inspect 7' }));
    expect(action).toHaveBeenCalledWith(7);
    fireEvent.change(view.getByRole('textbox', { name: 'Find an account' }), {
      target: { value: 'Zulu' },
    });
    fireEvent.click(view.getByRole('button', { name: 'Search accounts' }));
    expect(submitted).toHaveBeenCalledOnce();
    expect(view.getByRole('alert')).toHaveTextContent(copy.error);
  });

  it('exports the current page and visible column values only when an action is chosen', async () => {
    const user = userEvent.setup();
    const clipboard = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    const view = render(
      <DataTable
        {...tableProps()}
        columns={columns.map((column) => ({ ...column, initiallyHidden: column.id === 'note' }))}
        export={{ filename: 'accounts' }}
        selection={{
          keys: [7],
          onChange: vi.fn(),
          allLabel: 'Select this page',
          rowLabel: (row) => `Select ${row.name}`,
        }}
        copy={{ ...copy, export: exportCopy }}
        rowActions={(row) => <button type="button">Inspect {row.id}</button>}
      />,
    );
    try {
      expect(clipboard).not.toHaveBeenCalled();
      await user.click(view.getByRole('button', { name: 'Export' }));
      expect(view.getByText(exportCopy.scope)).toBeVisible();
      expect(clipboard).not.toHaveBeenCalled();
      await user.click(view.getByRole('button', { name: 'Copy' }));
      expect(clipboard).toHaveBeenCalledWith(
        'ID\tName\tActive\r\n7\tZulu\ttrue\r\n2\t<b>Alpha</b>\tfalse',
      );
      expect(view.getByRole('status')).toHaveTextContent(exportCopy.copied);
      expect(within(view.getByRole('table')).getAllByRole('row')).toHaveLength(3);
    } finally {
      clipboard.mockRestore();
    }
  });

  it('uses an explicitly supplied loader for export without fetching on render or opening the menu', async () => {
    const user = userEvent.setup();
    const clipboard = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    const loaded = [...rows, { id: 12, name: 'Outside this page', active: true, note: null }];
    const loader = vi.fn(async (signal: AbortSignal) => {
      expect(signal.aborted).toBe(false);
      return loaded;
    });
    const view = render(
      <DataTable
        {...tableProps()}
        export={{ filename: 'accounts', loadRows: loader }}
        copy={{ ...copy, export: { ...exportCopy, scope: 'Selected result · visible columns' } }}
      />,
    );
    try {
      expect(loader).not.toHaveBeenCalled();
      await user.click(view.getByRole('button', { name: 'Export' }));
      expect(loader).not.toHaveBeenCalled();
      await user.click(view.getByRole('button', { name: 'Copy' }));
      expect(loader).toHaveBeenCalledOnce();
      expect(clipboard.mock.calls[0]![0]).toContain('Outside this page');
      expect(within(view.getByRole('table')).getAllByRole('row')).toHaveLength(3);
    } finally {
      clipboard.mockRestore();
    }
  });

  it('aborts pending export on unmount and never writes a late result to the clipboard', async () => {
    const user = userEvent.setup();
    const clipboard = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    let signal: AbortSignal;
    let complete: (items: Item[]) => void;
    const loader = vi.fn(
      (current: AbortSignal) =>
        new Promise<Item[]>((resolve) => {
          signal = current;
          complete = resolve;
        }),
    );
    const view = render(
      <DataTable
        {...tableProps()}
        export={{ filename: 'accounts', loadRows: loader }}
        copy={{ ...copy, export: exportCopy }}
      />,
    );
    try {
      await user.click(view.getByRole('button', { name: 'Export' }));
      const action = view.getByRole('button', { name: 'Copy' });
      await user.click(action);
      expect(view.getByRole('button', { name: 'Preparing export' })).toBeDisabled();
      fireEvent.click(action);
      expect(loader).toHaveBeenCalledOnce();
      view.unmount();
      expect(signal!.aborted).toBe(true);
      await act(async () => complete!(rows));
      expect(clipboard).not.toHaveBeenCalled();
    } finally {
      clipboard.mockRestore();
    }
  });

  it('downloads actual CSV and XLSX formats with explicit names instead of renaming a text file', async () => {
    const user = userEvent.setup();
    const create = vi.fn<(blob: Blob) => string>(() => 'blob:table-export-test');
    const revoke = vi.fn();
    const OriginalUrl = URL;
    vi.stubGlobal(
      'URL',
      class extends OriginalUrl {
        static createObjectURL = create;
        static revokeObjectURL = revoke;
      },
    );
    const links: string[] = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      links.push(this.download);
    });
    const view = render(
      <DataTable
        {...tableProps()}
        export={{ filename: 'accounts' }}
        copy={{ ...copy, export: exportCopy }}
      />,
    );
    try {
      await user.click(view.getByRole('button', { name: 'Export' }));
      await user.click(view.getByRole('button', { name: 'CSV' }));
      await user.click(view.getByRole('button', { name: 'Export' }));
      await user.click(view.getByRole('button', { name: 'Excel' }));
      expect(links).toEqual(['accounts.csv', 'accounts.xlsx']);
      expect(create.mock.calls[0]![0].type).toBe('text/csv;charset=utf-8');
      expect(create.mock.calls[1]![0].type).toBe(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      expect(create.mock.calls[1]![0].size).toBeGreaterThan(1000);
      expect(document.querySelector('a[download]')).toBeNull();
    } finally {
      click.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it('reports export failures and permits retry without changing the query controls', async () => {
    const user = userEvent.setup();
    const clipboard = vi
      .spyOn(navigator.clipboard, 'writeText')
      .mockRejectedValueOnce(new Error('Unavailable'));
    const props = tableProps();
    const view = render(
      <DataTable
        {...props}
        export={{ filename: 'accounts' }}
        copy={{ ...copy, export: exportCopy }}
      />,
    );
    try {
      await user.click(view.getByRole('button', { name: 'Export' }));
      await user.click(view.getByRole('button', { name: 'Copy' }));
      expect(view.getByRole('alert')).toHaveTextContent(exportCopy.error);
      clipboard.mockResolvedValue();
      await user.click(view.getByRole('button', { name: 'Export' }));
      await user.click(view.getByRole('button', { name: 'Copy' }));
      expect(view.queryByRole('alert')).toBeNull();
      expect(view.getByRole('status')).toHaveTextContent(exportCopy.copied);
      expect(props.onPageChange).not.toHaveBeenCalled();
      expect(props.onSortChange).not.toHaveBeenCalled();
    } finally {
      clipboard.mockRestore();
    }
  });

  it('prints escaped values in a temporary frame and removes it after the native dialog closes', async () => {
    const user = userEvent.setup();
    const nativePrint = vi.fn();
    const append = document.body.append.bind(document.body);
    let frame: HTMLIFrameElement;
    const appendSpy = vi.spyOn(document.body, 'append').mockImplementation((...nodes) => {
      append(...nodes);
      const target = nodes.find((node) => node instanceof HTMLIFrameElement);
      if (target instanceof HTMLIFrameElement) {
        frame = target;
        frame.contentWindow!.focus = vi.fn();
        frame.contentWindow!.print = nativePrint;
        frame.dispatchEvent(new Event('load'));
      }
    });
    const view = render(
      <DataTable
        {...tableProps()}
        export={{ filename: 'accounts' }}
        copy={{ ...copy, export: exportCopy }}
      />,
    );
    try {
      await user.click(view.getByRole('button', { name: 'Export' }));
      await user.click(view.getByRole('button', { name: 'Print' }));
      expect(nativePrint).toHaveBeenCalledOnce();
      expect(frame!.srcdoc).toContain('&lt;b&gt;Alpha&lt;/b&gt;');
      expect(frame!.srcdoc).not.toContain('<b>Alpha</b>');
      expect(frame!).toHaveAttribute('aria-hidden', 'true');
      frame!.contentWindow!.dispatchEvent(new Event('afterprint'));
      expect(frame!.parentElement).toBeNull();
      expect(view.queryByRole('alert')).toBeNull();
    } finally {
      appendSpy.mockRestore();
    }
  });
});
