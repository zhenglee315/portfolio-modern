import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { useState } from 'react';
import { SearchableSelect, type SelectSource, type SelectPage } from '@/shared/ui/SearchableSelect';
import { StatusIndicator } from '@/shared/ui/StatusIndicator';
import { ManagementDetails } from '@/pages/management/components/ManagementDetails';
import { validateEditDraft } from '@/shared/lib/data-table-edit';
const copy = {
  search: 'Search',
  empty: 'Empty',
  loading: 'Loading',
  error: 'Unavailable',
  retry: 'Retry',
  more: 'More',
};
const staticSource = {
  options: [
    { value: 1, label: 'admin' },
    { value: 2, label: 'editor' },
    { value: 3, label: 'inactive', disabled: true, reason: 'Inactive role' },
  ],
};
it('accepts numeric searchable assignments for autosave and rejects disabled or invalid choices', () => {
  const group = {
    fields: {
      role_id: {
        required: true,
        editor: { type: 'searchable-select' as const, selection: { source: staticSource, copy } },
      },
    },
    read: () => ({ role_id: 1 }),
    save: vi.fn(),
  };
  expect(validateEditDraft(group, {}, { role_id: 2 }).valid).toBe(true);
  for (const role_id of [3, 999, '2', null])
    expect(validateEditDraft(group, {}, { role_id }).valid).toBe(false);
});
function Picker({
  source = staticSource,
  onChange = vi.fn(),
  onCancel = vi.fn(),
}: {
  source?: SelectSource;
  onChange?: (value: string | number) => void;
  onCancel?: () => void;
}) {
  const [value, setValue] = useState<string | number>(1);
  return (
    <SearchableSelect
      value={value}
      selected={{ value: 1, label: 'admin' }}
      source={source}
      label="Role"
      copy={copy}
      colored
      onCancel={onCancel}
      onChange={(v) => {
        setValue(v);
        onChange(v);
      }}
    />
  );
}
it('keeps numeric identities, disables ineligible roles, searches labels and restores trigger focus', async () => {
  const changed = vi.fn();
  render(<Picker onChange={changed} />);
  const button = screen.getByRole('button', { name: 'Role' });
  fireEvent.click(button);
  expect(screen.getByRole('option', { name: /inactive/ })).toBeDisabled();
  expect(
    screen.getByRole('option', { name: 'admin' }).querySelector('[data-color]'),
  ).not.toBeNull();
  const input = screen.getByRole('searchbox');
  fireEvent.change(input, { target: { value: 'EDITOR' } });
  await waitFor(() => expect(screen.queryByRole('option', { name: 'admin' })).toBeNull());
  fireEvent.click(screen.getByRole('option', { name: 'editor' }));
  expect(changed).toHaveBeenCalledExactlyOnceWith(2);
  expect(button).toHaveTextContent('editor');
  expect(button).toHaveFocus();
  expect(screen.queryByRole('listbox')).toBeNull();
});
it('dismisses without writing and consumes Escape inside a dialog', () => {
  const changed = vi.fn(),
    cancel = vi.fn(),
    outer = vi.fn();
  render(
    <div onKeyDown={outer}>
      <Picker onChange={changed} onCancel={cancel} />
    </div>,
  );
  const button = screen.getByRole('button', { name: 'Role' });
  fireEvent.click(button);
  fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'Escape' });
  expect(cancel).toHaveBeenCalledOnce();
  expect(changed).not.toHaveBeenCalled();
  expect(outer).not.toHaveBeenCalled();
  expect(button).toHaveFocus();
});
it('wraps keyboard focus and skips disabled options', () => {
  render(<Picker />);
  fireEvent.click(screen.getByRole('button', { name: 'Role' }));
  fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'ArrowUp' });
  expect(screen.getByRole('option', { name: 'editor' })).toHaveFocus();
  fireEvent.keyDown(screen.getByRole('option', { name: 'editor' }), { key: 'ArrowDown' });
  expect(screen.getByRole('option', { name: 'admin' })).toHaveFocus();
});
it('cancels superseded requests and ignores late responses', async () => {
  const calls: { query: string; signal: AbortSignal; resolve: (value: SelectPage) => void }[] = [];
  const source = {
    load: vi.fn(
      (query: string, _page: number, signal: AbortSignal) =>
        new Promise<SelectPage>((resolve) => calls.push({ query, signal, resolve })),
    ),
  };
  render(<Picker source={source} />);
  fireEvent.click(screen.getByRole('button', { name: 'Role' }));
  await waitFor(() => expect(calls).toHaveLength(1));
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'editor' } });
  await waitFor(() => expect(calls).toHaveLength(2));
  expect(calls[0].signal.aborted).toBe(true);
  await act(async () =>
    calls[1].resolve({ items: [{ value: 2, label: 'editor' }], page: 1, pages: 1 }),
  );
  await act(async () =>
    calls[0].resolve({ items: [{ value: 8, label: 'stale' }], page: 1, pages: 1 }),
  );
  expect(screen.queryByText('stale')).toBeNull();
  expect(screen.getByRole('option', { name: 'editor' })).toBeEnabled();
});
it('retries failures and accumulates unique paged options', async () => {
  const load = vi
    .fn()
    .mockRejectedValueOnce(Error('private'))
    .mockResolvedValueOnce({ items: [{ value: 1, label: 'admin' }], page: 1, pages: 2 })
    .mockResolvedValueOnce({
      items: [
        { value: 1, label: 'admin' },
        { value: 2, label: 'editor' },
      ],
      page: 2,
      pages: 2,
    });
  render(<Picker source={{ load }} />);
  fireEvent.click(screen.getByRole('button', { name: 'Role' }));
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Unavailable'));
  expect(screen.queryByText('private')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await waitFor(() => expect(screen.getByRole('option', { name: 'admin' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'More' }));
  await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(2));
});
it('submits only the assigned FK after full-details confirmation, preserving the projected label', async () => {
  const save = vi.fn().mockResolvedValue(undefined);
  const details = {
    title: 'Details',
    close: 'Close',
    field: {
      edit: (v: string) => `Edit ${v}`,
      clear: (v: string) => `Clear ${v}`,
      invalid: 'Invalid',
      empty: 'Empty',
    },
    save: {
      title: 'Confirm',
      message: 'Save?',
      confirm: 'Confirm Save',
      cancel: 'Cancel',
      conflict: 'Conflict',
    },
  };
  render(
    <ManagementDetails
      row={{ id: 1, role_id: 1, role: 'admin' }}
      icon="people"
      copy={details}
      onClose={vi.fn()}
      onSave={save}
      columns={[
        {
          id: 'role',
          label: 'Role',
          value: (r) => r.role,
          assignment: {
            field: 'role_id',
            value: (r) => r.role_id,
            project: (option) => ({ role: option.label }),
          },
          editor: (r) => ({
            type: 'searchable-select',
            selection: {
              source: staticSource,
              copy,
              selected: { value: r.role_id, label: r.role },
            },
          }),
        },
      ]}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Edit Role' }));
  fireEvent.click(screen.getByRole('option', { name: 'editor' }));
  expect(save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Save', exact: true }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm Save' }));
  await waitFor(() => expect(save).toHaveBeenCalledExactlyOnceWith({ role_id: 2 }));
});
it.each([
  [true, 'Online', 'online'],
  [false, 'Offline', 'offline'],
  [null, 'Unknown', 'unknown'],
] as const)('renders accessible presence %s with its distinct state', (value, label, state) => {
  render(
    <StatusIndicator
      value={value}
      copy={{ online: 'Online', offline: 'Offline', unknown: 'Unknown' }}
    />,
  );
  expect(screen.getByRole('img', { name: label })).toHaveAttribute('data-status', state);
});
it('preserves a nullable assignment baseline when an edited selection is cleared', () => {
  const details = {
    title: 'Details',
    close: 'Close',
    field: {
      edit: (v: string) => `Edit ${v}`,
      clear: (v: string) => `Clear ${v}`,
      invalid: 'Invalid',
      empty: 'Empty',
    },
    save: {
      title: 'Confirm',
      message: 'Save?',
      confirm: 'Confirm Save',
      cancel: 'Cancel',
      conflict: 'Conflict',
    },
  };
  render(
    <ManagementDetails
      row={{ id: 1, role_id: null as number | null, role: 'Display only' }}
      icon="people"
      copy={details}
      onClose={vi.fn()}
      onSave={vi.fn()}
      columns={[
        {
          id: 'role',
          label: 'Role',
          value: (r) => r.role,
          assignment: { field: 'role_id', value: (r) => r.role_id },
          editor: () => ({
            type: 'searchable-select',
            nullable: true,
            selection: { source: staticSource, copy },
          }),
        },
      ]}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Edit Role' }));
  fireEvent.click(screen.getByRole('option', { name: 'editor' }));
  expect(screen.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'Clear Role' }));
  expect(screen.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
});
