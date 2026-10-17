import { fireEvent, render, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { createI18n } from '@/i18n/config';
import { dataTableCopy } from '@/i18n/table-copy';
import {
  DataTableChoices,
  type DataTableChoicesSource,
  type DataTableChoicePage,
} from '@/shared/ui/DataTableChoices';
import type { DataTableFilter } from '@/shared/lib/table-filter';

const copy = dataTableCopy(createI18n('en').t, 'Roles');
const spec = { type: 'text', sets: true } as const;
function Controlled({
  source,
  changed,
  dropdownList,
}: {
  source: DataTableChoicesSource;
  changed: (filter: DataTableFilter | null) => void;
  dropdownList?: boolean;
}) {
  const [current, setCurrent] = useState<DataTableFilter>();
  return (
    <DataTableChoices
      source={source}
      dropdownList={dropdownList}
      field="role"
      label="Role"
      spec={spec}
      copy={copy}
      current={current}
      onChange={(filter) => {
        changed(filter);
        setCurrent(filter ?? undefined);
      }}
    />
  );
}

describe('reusable choice filters', () => {
  it('can clear a bookmarked selection even when no matching rows have been loaded', async () => {
    const changed = vi.fn();
    const view = render(
      <DataTableChoices
        source={{ options: [], colored: true }}
        dropdownList
        field="role"
        label="Role"
        spec={spec}
        copy={copy}
        current={{ field: 'role', operator: 'in', value: ['deleted-role'] }}
        onChange={changed}
      />,
    );
    const user = userEvent.setup();
    expect(view.queryByRole('checkbox')).toBeNull();
    await user.click(view.getByRole('button', { name: 'Deselect(1)' }));
    expect(changed).toHaveBeenLastCalledWith(null);
    expect(view.getByRole('searchbox')).toHaveFocus();
  });

  it('uses explicit dropdown selections, restores all rows on reset, and preserves searched-out values', async () => {
    const changed = vi.fn();
    const options = [
      { value: 'Admin', label: 'Administrator' },
      { value: 'viewer', label: 'Viewer' },
      { value: 'editor', label: 'Editor' },
    ];
    const view = render(
      <Controlled source={{ options, colored: true }} dropdownList changed={changed} />,
    );
    const user = userEvent.setup();
    expect(
      view.getAllByRole('checkbox').every((checkbox) => !(checkbox as HTMLInputElement).checked),
    ).toBe(true);
    expect(view.getByRole('button', { name: 'Select(3)' })).toBeEnabled();
    expect(view.getByRole('button', { name: 'Deselect(0)' })).toBeDisabled();
    await user.click(view.getByRole('checkbox', { name: 'Administrator' }));
    expect(changed).toHaveBeenLastCalledWith({ field: 'role', operator: 'in', value: ['admin'] });
    await user.type(view.getByRole('searchbox'), 'view');
    await waitFor(() => expect(view.getAllByRole('checkbox')).toHaveLength(1));
    expect(changed).toHaveBeenCalledTimes(1);
    await user.click(view.getByRole('button', { name: 'Select(1)' }));
    expect(changed).toHaveBeenLastCalledWith({
      field: 'role',
      operator: 'in',
      value: ['admin', 'viewer'],
    });
    await user.click(view.getByRole('button', { name: 'Deselect(1)' }));
    expect(changed).toHaveBeenLastCalledWith({ field: 'role', operator: 'in', value: ['admin'] });
    await user.clear(view.getByRole('searchbox'));
    await waitFor(() => expect(view.getAllByRole('checkbox')).toHaveLength(3));
    await user.click(view.getByRole('button', { name: 'Deselect(1)' }));
    expect(changed).toHaveBeenLastCalledWith(null);
    expect(view.getByRole('searchbox')).toHaveFocus();
    await user.click(view.getByRole('button', { name: 'Select(3)' }));
    expect(changed).toHaveBeenLastCalledWith({
      field: 'role',
      operator: 'in',
      value: ['admin', 'editor', 'viewer'],
    });
    expect(view.getByRole('searchbox')).toHaveFocus();
  });

  it('shows native checkbox changes immediately while the owner commits asynchronously', async () => {
    const source = { options: [{ value: 'admin', label: 'Administrator' }] };
    const changed = vi.fn();
    const props = { source, field: 'role', label: 'Role', spec, copy, onChange: changed };
    const view = render(
      <DataTableChoices {...props} current={{ field: 'role', operator: 'in', value: [] }} />,
    );
    const user = userEvent.setup();
    const checkbox = view.getByRole('checkbox', { name: 'Administrator' });
    checkbox.focus();
    await user.keyboard(' ');
    expect(checkbox).toBeChecked();
    expect(changed).toHaveBeenLastCalledWith(null);
    view.rerender(<DataTableChoices {...props} />);
    expect(checkbox).toBeChecked();
    view.rerender(
      <DataTableChoices {...props} current={{ field: 'role', operator: 'in', value: [] }} />,
    );
    expect(checkbox).not.toBeChecked();
  });
  it('uses supplied choices, keeps searching independent, and preserves hidden selections', async () => {
    const changed = vi.fn();
    const options = [
      { value: 'Admin', label: 'Administrator' },
      { value: 'viewer', label: 'Viewer' },
      { value: 'editor', label: 'Editor' },
    ];
    const view = render(<Controlled source={{ options, colored: true }} changed={changed} />);
    const user = userEvent.setup();
    expect(view.getAllByRole('checkbox')).toHaveLength(3);
    expect(view.getByText('Administrator')).toHaveAttribute('data-color');
    await user.click(view.getByRole('checkbox', { name: 'Administrator' }));
    expect(changed).toHaveBeenLastCalledWith({
      field: 'role',
      operator: 'not_in',
      value: ['admin'],
    });
    await user.type(view.getByRole('searchbox'), 'view');
    await waitFor(() => expect(view.getAllByRole('checkbox')).toHaveLength(1));
    expect(changed).toHaveBeenCalledTimes(1);
    await user.click(view.getByRole('button', { name: 'Deselect (1)' }));
    expect(changed).toHaveBeenLastCalledWith({
      field: 'role',
      operator: 'not_in',
      value: ['admin', 'viewer'],
    });
    await user.clear(view.getByRole('searchbox'));
    await waitFor(() => expect(view.getAllByRole('checkbox')).toHaveLength(3));
    expect(view.getByRole('checkbox', { name: 'Editor' })).toBeChecked();
    expect(view.getByRole('checkbox', { name: 'Administrator' })).not.toBeChecked();
    await user.click(view.getByRole('button', { name: 'Deselect (1)' }));
    expect(changed).toHaveBeenLastCalledWith({ field: 'role', operator: 'in', value: [] });
    await user.click(view.getByRole('checkbox', { name: 'Administrator' }));
    expect(changed).toHaveBeenLastCalledWith({ field: 'role', operator: 'in', value: ['admin'] });
    await user.click(view.getByRole('button', { name: 'Select (2)' }));
    expect(changed).toHaveBeenLastCalledWith(null);
  });

  it('loads choices by page, supports retry, and cancels obsolete or closed sources', async () => {
    const calls: { search: string; page: number; signal: AbortSignal }[] = [];
    const load = vi.fn(
      async (search: string, page: number, signal: AbortSignal): Promise<DataTableChoicePage> => {
        calls.push({ search, page, signal });
        if (calls.length === 1) throw new Error('offline');
        if (search === 'waiting') return new Promise(() => {});
        return {
          items: [{ value: `role-${page}`, label: `Role ${page}` }],
          page,
          pages: 2,
          total: 2,
        };
      },
    );
    const changed = vi.fn();
    const view = render(<Controlled source={{ load }} changed={changed} />);
    const user = userEvent.setup();
    await waitFor(() => expect(view.getByRole('alert')).toBeVisible());
    await user.click(view.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(view.getByRole('checkbox', { name: 'Role 1' })).toBeVisible());
    await user.click(view.getByRole('button', { name: 'More' }));
    await waitFor(() => expect(view.getAllByRole('checkbox')).toHaveLength(2));
    expect(calls.at(-1)?.page).toBe(2);
    expect(changed).not.toHaveBeenCalled();
    fireEvent.change(view.getByRole('searchbox'), { target: { value: 'waiting' } });
    await waitFor(() => expect(calls.at(-1)?.search).toBe('waiting'));
    const pending = calls.at(-1)!;
    view.unmount();
    expect(pending.signal.aborted).toBe(true);
  });
});
