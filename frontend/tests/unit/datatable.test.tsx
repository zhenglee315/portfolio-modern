import { act, fireEvent, render, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  DataTable,
  type DataTableColumn,
  type DataTableCopy,
  type DataTableSort,
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
  previous: 'Previous page',
  next: 'Next page',
  columns: 'Choose columns',
  sorting: 'Sort order',
  clearSort: 'Clear sorting',
  sortHint: 'Hold Shift to sort by up to three columns',
  multiSort: 'Multi-column sorting',
  readonly: 'Read only',
  actions: 'Actions',
  direction: { asc: 'Ascending', desc: 'Descending' },
  range: (from, to, total) => `${from}–${to} of ${total}`,
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

/** Own a selected server filter without filtering or manufacturing the supplied page. */
function ControlledFilterTable({
  filtered,
  sorted,
}: {
  filtered: (value: string) => void;
  sorted: (sort: DataTableSort[]) => void;
}) {
  const [filter, setFilter] = useState('');
  const [sort, setSort] = useState<DataTableSort[]>([]);
  return (
    <div data-bs-theme="dark">
      <DataTable
        {...tableProps()}
        sort={sort}
        onSortChange={(next) => {
          sorted(next);
          setSort(next);
        }}
        copy={{ ...copy, columnMenuLabel: (label) => `Options for ${label}` }}
        columns={columns.map((column) => ({
          ...column,
          ...(column.id === 'active' || column.id === 'note'
            ? {
                filter: {
                  value: filter,
                  allLabel: 'All',
                  options: [
                    { value: 'true', label: 'Yes' },
                    { value: 'false', label: 'No' },
                  ],
                  onChange: (value: string) => {
                    filtered(value);
                    setFilter(value);
                  },
                },
              }
            : {}),
        }))}
      />
    </div>
  );
}

describe('controlled reusable data table', () => {
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

  it('cycles keyboard sorting through ascending, descending and removal without sorting local rows', async () => {
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
      return Array.from(heading.querySelector('[class*="sortIcon"]')!.children);
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

  it('retains ordered Shift criteria, enforces three fields and removes individual criteria', () => {
    const changed = vi.fn();
    const view = render(<ControlledTable changed={changed} />);
    fireEvent.click(view.getByRole('button', { name: 'Name: asc' }));
    fireEvent.click(view.getByRole('button', { name: 'Active: asc' }), { shiftKey: true });
    fireEvent.click(view.getByRole('button', { name: 'ID: asc' }), { shiftKey: true });
    expect(changed).toHaveBeenLastCalledWith([
      { field: 'name', direction: 'asc' },
      { field: 'active', direction: 'asc' },
      { field: 'id', direction: 'asc' },
    ]);
    expect(view.getByRole('columnheader', { name: /Name/ })).toHaveAttribute('aria-sort', 'other');
    const calls = changed.mock.calls.length;
    fireEvent.click(view.getByRole('button', { name: 'Note: asc' }), { shiftKey: true });
    expect(changed).toHaveBeenCalledTimes(calls);
    fireEvent.click(view.getByRole('button', { name: 'Active: desc' }), { shiftKey: true });
    fireEvent.click(view.getByRole('button', { name: 'Active: none' }), { shiftKey: true });
    expect(changed).toHaveBeenLastCalledWith([
      { field: 'name', direction: 'asc' },
      { field: 'id', direction: 'asc' },
    ]);
    fireEvent.click(view.getByRole('button', { name: 'Note: asc' }));
    expect(changed).toHaveBeenLastCalledWith([{ field: 'note', direction: 'asc' }]);
    fireEvent.click(view.getByRole('button', { name: 'Clear sorting' }));
    expect(changed).toHaveBeenLastCalledWith([]);
  });

  it('allows touch and keyboard users to retain ordered criteria without a Shift key', async () => {
    const changed = vi.fn();
    const view = render(<ControlledTable changed={changed} />);
    const user = userEvent.setup();
    await user.click(view.getByRole('checkbox', { name: 'Multi-column sorting' }));
    await user.click(view.getByRole('button', { name: 'Name: asc' }));
    await user.click(view.getByRole('button', { name: 'Active: asc' }));
    expect(changed).toHaveBeenLastCalledWith([
      { field: 'name', direction: 'asc' },
      { field: 'active', direction: 'asc' },
    ]);
    await user.click(view.getByRole('checkbox', { name: 'Multi-column sorting' }));
    await user.click(view.getByRole('button', { name: 'ID: asc' }));
    expect(changed).toHaveBeenLastCalledWith([{ field: 'id', direction: 'asc' }]);
    expect(within(view.getByRole('table')).getAllByRole('row')[1]).toHaveTextContent('Zulu');
  });

  it('emits controlled page and size changes and bounds navigation for huge totals', () => {
    const props = tableProps();
    const view = render(
      <DataTable {...props} page={{ page: 5000, size: 6, total: 60000, pages: 10000 }} />,
    );
    const pages = within(view.getByRole('navigation', { name: 'Account pages' }));
    expect(pages.getAllByRole('button').length).toBeLessThanOrEqual(9);
    expect(pages.getByRole('button', { name: 'Page 5000' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    fireEvent.click(pages.getByRole('button', { name: 'Next page' }));
    expect(props.onPageChange).toHaveBeenLastCalledWith(5001);
    fireEvent.click(pages.getByRole('button', { name: 'Page 10000' }));
    expect(props.onPageChange).toHaveBeenLastCalledWith(10000);
    fireEvent.change(view.getByRole('combobox', { name: 'Rows per page' }), {
      target: { value: '25' },
    });
    expect(props.onSizeChange).toHaveBeenLastCalledWith(25);
    expect(view.getByText('29995–29996 of 60000')).toBeVisible();
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

  it('portals controlled All/single-choice filters outside the table and preserves every server row', async () => {
    const filtered = vi.fn();
    const sorted = vi.fn();
    const view = render(<ControlledFilterTable filtered={filtered} sorted={sorted} />);
    const user = userEvent.setup();
    const toggle = view.getByRole('button', { name: 'Options for Active' });
    await user.click(toggle);
    const group = view.getByRole('group', { name: 'Active' });
    const menu = document.getElementById(toggle.getAttribute('aria-controls')!)!;
    expect(menu.parentElement).toBe(document.body);
    expect(menu).toHaveAttribute('data-bs-theme', 'dark');
    expect(view.getByRole('table')).not.toContainElement(menu);
    expect(within(group).getByRole('radio', { name: 'All' })).toBeChecked();
    await user.click(within(group).getByRole('radio', { name: 'No' }));
    expect(filtered).toHaveBeenLastCalledWith('false');
    expect(toggle).toHaveFocus();
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle.className).toContain('filterActive');
    expect(view.queryByRole('radio', { name: 'All' })).toBeNull();
    expect(within(view.getByRole('table')).getAllByRole('row')).toHaveLength(3);
    await user.click(toggle);
    const reopened = view.getByRole('group', { name: 'Active' });
    expect(within(reopened).getByRole('radio', { name: 'No' })).toBeChecked();
    expect(within(reopened).getByRole('radio', { name: 'Yes' })).not.toBeChecked();
    expect(within(reopened).getByRole('radio', { name: 'All' })).not.toBeChecked();
    await user.click(within(reopened).getByRole('radio', { name: 'All' }));
    expect(filtered).toHaveBeenLastCalledWith('');
    expect(sorted).not.toHaveBeenCalled();
    expect(within(view.getByRole('table')).getAllByRole('row')[1]).toHaveTextContent('Zulu');
  });

  it('uses explicit menu sorting with ordered multi-sort limits and removes only its own criterion', async () => {
    const sorted = vi.fn();
    const view = render(<ControlledFilterTable filtered={vi.fn()} sorted={sorted} />);
    const user = userEvent.setup();
    await user.click(view.getByRole('button', { name: 'Name: asc' }));
    await user.click(view.getByRole('checkbox', { name: 'Multi-column sorting' }));
    const choose = async (column: string, direction: string) => {
      const toggle = view.getByRole('button', { name: `Options for ${column}` });
      await user.click(toggle);
      const menu = document.getElementById(toggle.getAttribute('aria-controls')!)!;
      await user.click(within(menu).getByRole('button', { name: `${column}: ${direction}` }));
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
    await choose('Active', 'desc');
    expect(sorted).toHaveBeenLastCalledWith([
      { field: 'name', direction: 'asc' },
      { field: 'active', direction: 'desc' },
      { field: 'id', direction: 'asc' },
    ]);
    await choose('Active', 'none');
    expect(sorted).toHaveBeenLastCalledWith([
      { field: 'name', direction: 'asc' },
      { field: 'id', direction: 'asc' },
    ]);
    await user.click(view.getByRole('checkbox', { name: 'Multi-column sorting' }));
    await choose('Active', 'desc');
    expect(sorted).toHaveBeenLastCalledWith([{ field: 'active', direction: 'desc' }]);
  });

  it('returns keyboard focus to the funnel when Escape dismisses its radio choices', async () => {
    const view = render(<ControlledFilterTable filtered={vi.fn()} sorted={vi.fn()} />);
    const user = userEvent.setup();
    const toggle = view.getByRole('button', { name: 'Options for Active' });
    toggle.focus();
    await user.keyboard('{Enter}');
    view.getByRole('radio', { name: 'All' }).focus();
    await user.keyboard('{Escape}');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveFocus();
  });

  it('guards menu sorting and filtering throughout a pending server request', async () => {
    const props = tableProps();
    const filtered = vi.fn();
    const filteredColumns = columns.map((column) => ({
      ...column,
      ...(column.id === 'active'
        ? {
            filter: {
              value: '',
              allLabel: 'All',
              options: [{ value: 'false', label: 'No' }],
              onChange: filtered,
            },
          }
        : {}),
    }));
    const owner = { ...props, columns: filteredColumns };
    const view = render(<DataTable {...owner} />);
    const user = userEvent.setup();
    const toggle = view.getByRole('button', { name: 'Active' });
    await user.click(toggle);
    view.rerender(<DataTable {...owner} loading />);
    const menu = document.getElementById(toggle.getAttribute('aria-controls')!)!;
    const choice = within(menu).getByRole('radio', { name: 'No' });
    expect(choice).toBeDisabled();
    fireEvent.click(choice);
    const sortButton = within(menu).getByRole('button', { name: 'Active: desc' });
    expect(sortButton).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(sortButton);
    expect(filtered).not.toHaveBeenCalled();
    expect(props.onSortChange).not.toHaveBeenCalled();
    view.rerender(<DataTable {...owner} />);
    await user.click(sortButton);
    expect(props.onSortChange).toHaveBeenLastCalledWith([{ field: 'active', direction: 'desc' }]);
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
    expect(view.getByText('0–0 of 0')).toBeVisible();
    expect(view.getByRole('button', { name: 'Previous page' })).toBeDisabled();
    expect(view.getByRole('button', { name: 'Next page' })).toBeDisabled();
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
