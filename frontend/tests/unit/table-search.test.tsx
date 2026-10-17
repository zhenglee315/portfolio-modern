import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DataTableSearch } from '@/shared/ui/DataTableSearch';
import { parseTableSearch } from '@/shared/lib/table-search';
import { readTableQuery, writeTableQuery } from '@/shared/lib/table-query';
import { managementListParams } from '@/features/management/api/management';

const columns = [
  { id: 'id', label: 'ID' },
  { id: 'email', label: 'Email' },
];
const copy = {
  label: 'Search records',
  submit: 'Search',
  fields: 'Search column',
  all: 'All',
  placeholder: 'Search...',
  selected: (n: number) => `${n} columns`,
  remove: (label: string) => `Remove ${label} from search`,
};

describe('table search interaction and query contract', () => {
  it('supports All, partial selection, multiple independent fields and an empty draft', () => {
    const onChange = vi.fn();
    const view = render(
      <DataTableSearch
        columns={[...columns, { id: 'role', label: 'Role' }]}
        copy={copy}
        onChange={onChange}
      />,
    );
    fireEvent.click(view.getByRole('button', { name: 'Search column: All' }));
    const all = view.getByRole('checkbox', { name: 'All', exact: true });
    fireEvent.click(all);
    expect(view.getByRole('button', { name: 'Search', exact: true })).toBeDisabled();
    fireEvent.submit(view.getByRole('search'));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(view.getByRole('checkbox', { name: 'Email', exact: true }));
    fireEvent.click(view.getByRole('checkbox', { name: 'Role', exact: true }));
    expect(all).toBePartiallyChecked();
    expect(view.getByRole('button', { name: 'Search column: 2 columns' })).toBeVisible();
    fireEvent.submit(view.getByRole('search'));
    expect(onChange).toHaveBeenLastCalledWith({ term: '', fields: ['email', 'role'] });
    fireEvent.click(all);
    expect(all).toBeChecked();
    expect(view.getByRole('checkbox', { name: 'ID', exact: true })).toBeChecked();
    expect(view.getByRole('checkbox', { name: 'Email', exact: true })).toBeChecked();
    expect(view.getByRole('checkbox', { name: 'Role', exact: true })).toBeChecked();
  });

  it('shows removable field tags only for a partial selection and keeps removal local', () => {
    const onChange = vi.fn();
    const view = render(
      <DataTableSearch
        columns={[...columns, { id: 'role', label: 'Role' }]}
        copy={copy}
        onChange={onChange}
      />,
    );
    expect(view.queryByRole('button', { name: /Remove/ })).toBeNull();
    fireEvent.click(view.getByRole('button', { name: 'Search column: All' }));
    fireEvent.click(view.getByRole('checkbox', { name: 'All', exact: true }));
    fireEvent.click(view.getByRole('checkbox', { name: 'Email', exact: true }));
    fireEvent.click(view.getByRole('checkbox', { name: 'Role', exact: true }));
    expect(view.getByRole('button', { name: 'Remove Email from search' })).toBeVisible();
    fireEvent.click(view.getByRole('button', { name: 'Remove Role from search' }));
    expect(view.queryByRole('button', { name: 'Remove Role from search' })).toBeNull();
    expect(view.getByRole('searchbox')).toHaveFocus();
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.submit(view.getByRole('search'));
    expect(onChange).toHaveBeenLastCalledWith({ term: '', fields: ['email'] });
    fireEvent.click(view.getByRole('button', { name: 'Remove Email from search' }));
    expect(view.getByRole('button', { name: 'Search', exact: true })).toBeDisabled();
  });

  it('submits all or one field only on explicit button/Enter, without filtering local data', () => {
    const onChange = vi.fn();
    const view = render(<DataTableSearch columns={columns} copy={copy} onChange={onChange} />);
    const input = view.getByRole('searchbox');
    fireEvent.change(input, { target: { value: '  someone  ' } });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.submit(view.getByRole('search'));
    expect(onChange).toHaveBeenLastCalledWith({ term: 'someone', fields: ['id', 'email'] });
    fireEvent.click(view.getByRole('button', { name: 'Search column: All' }));
    fireEvent.click(view.getByRole('checkbox', { name: 'All', exact: true }));
    fireEvent.click(view.getByRole('checkbox', { name: 'Email', exact: true }));
    expect(view.getByRole('checkbox', { name: 'All', exact: true })).toBePartiallyChecked();
    expect(onChange).toHaveBeenCalledTimes(1);
    fireEvent.click(view.getByRole('button', { name: 'Search' }));
    expect(onChange).toHaveBeenLastCalledWith({ term: 'someone', fields: ['email'] });
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.submit(view.getByRole('search'));
    expect(onChange).toHaveBeenLastCalledWith({ term: '', fields: ['email'] });
    expect(
      [...view.container.querySelector('[data-table-search-controls]')!.children].map(
        (node) => node.tagName,
      ),
    ).toEqual(['INPUT', 'DIV', 'BUTTON']);
  });

  it('restores submitted URL/history values without losing drafts on ordinary row-loading renders', () => {
    const onChange = vi.fn();
    const view = render(
      <DataTableSearch
        columns={columns}
        copy={copy}
        onChange={onChange}
        value={{ term: 'old', fields: ['email'] }}
      />,
    );
    fireEvent.change(view.getByRole('searchbox'), { target: { value: 'draft' } });
    view.rerender(
      <DataTableSearch
        columns={[...columns]}
        copy={copy}
        onChange={onChange}
        value={{ term: 'old', fields: ['email'] }}
      />,
    );
    expect(view.getByRole('searchbox')).toHaveValue('draft');
    view.rerender(
      <DataTableSearch
        columns={columns}
        copy={copy}
        onChange={onChange}
        value={{ term: 'restored', fields: ['id'] }}
      />,
    );
    expect(view.getByRole('searchbox')).toHaveValue('restored');
    expect(view.getByRole('button', { name: 'Search column: 1 columns' })).toBeVisible();
  });

  it('preserves column filters and sorts in canonical URLs and serializes applied search for the server', () => {
    const state = {
      page: 1,
      size: 6,
      sort: [{ field: 'id', direction: 'desc' as const }],
      filters: [{ field: 'is_active', operator: 'equals' as const, value: true }],
      search: { term: '%_', fields: ['email'] },
    };
    const params = writeTableQuery(state);
    expect(
      readTableQuery(params, ['id'], { email: { type: 'text' }, is_active: { type: 'boolean' } }),
    ).toEqual(state);
    const api = managementListParams('users', state, 'en');
    expect(api.get('search')).toBe('%_');
    expect(JSON.parse(api.get('search_fields')!)).toEqual(['email']);
    expect(api.get('filters')).toContain('is_active');
    expect(api.get('sort')).toBe('id:desc');
    expect(
      managementListParams(
        'users',
        { ...state, search: { term: '  ', fields: ['email'] } },
        'en',
      ).has('search'),
    ).toBe(false);
  });

  it.each([
    { term: 'x', fields: ['password'] },
    { term: 'x', fields: ['email', 'email'] },
    { term: 'x', fields: [] },
    { term: 'x'.repeat(201), fields: ['email'] },
    { term: 1, fields: ['email'] },
  ])('rejects malformed programmatic search %j', (value) => {
    expect(parseTableSearch(value, ['email'])).toBeUndefined();
  });
});
