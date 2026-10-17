import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useDataTableEditGroup } from '@/shared/hooks/useDataTableEditGroup';
import {
  changeEditDraft,
  editDraftChanges,
  editFieldOrder,
  validateEditDraft,
  type DataTableEditCopy,
  type DataTableEditGroup,
} from '@/shared/lib/data-table-edit';

type Address = { country: number | null; province: number | null; town: number | null };
type Row = Address & { id: number; account: string };
const row: Row = { id: 7, account: 'immutable@example.com', country: 1, province: 10, town: 100 };
const copy: DataTableEditCopy = {
  edit: (x) => `Edit ${x}`,
  clear: (x) => `Clear ${x}`,
  empty: 'Empty',
  required: 'Required',
  invalid: 'Invalid',
  incomplete: 'Complete this group',
  saving: 'Saving',
  failed: 'Failed',
  conflict: 'Conflict',
  retry: 'Retry',
  cancel: 'Discard',
  readonly: 'Read only',
};
function address(
  save = vi.fn().mockResolvedValue(undefined),
  townRequired = true,
): DataTableEditGroup<Row, Address> {
  return {
    fields: {
      // Deliberately reverse column order: cascading must be topological.
      town: {
        editor: (v) => ({
          type: 'select',
          nullable: true,
          options:
            v.province === 10
              ? [{ value: 100, label: 'Town A' }]
              : v.province === 20
                ? [{ value: 200, label: 'Town B' }]
                : [],
        }),
        required: townRequired,
        dependsOn: ['province'],
        clearValue: null,
      },
      province: {
        editor: (v) => ({
          type: 'select',
          nullable: true,
          options:
            v.country === 1
              ? [{ value: 10, label: 'Province A' }]
              : v.country === 2
                ? [{ value: 20, label: 'Province B' }]
                : [],
        }),
        required: true,
        dependsOn: ['country'],
        clearValue: null,
      },
      country: {
        editor: {
          type: 'select',
          nullable: true,
          options: [
            { value: 1, label: 'Country A' },
            { value: 2, label: 'Country B' },
          ],
        },
        required: true,
      },
    },
    read: (r) => ({ country: r.country, province: r.province, town: r.town }),
    save,
  };
}
function Fixture({
  group,
  record = row,
  scope = 'one',
}: {
  group: DataTableEditGroup<Row, Address>;
  record?: Row;
  scope?: string;
}) {
  const controller = useDataTableEditGroup({ group, scope, rowKey: (r) => r.id, copy });
  return (
    <div>
      {(['country', 'province', 'town'] as const).map((field) => (
        <section key={field}>{controller.column(field).render(record, field, record.id)}</section>
      ))}
    </div>
  );
}
function choose(field: string, index: string) {
  fireEvent.click(screen.getByRole('button', { name: `Edit ${field}` }));
  fireEvent.change(screen.getByRole('combobox', { name: field }), { target: { value: index } });
}

describe('dependent editing validation', () => {
  it('clears every descendant, whitelists changed fields and refuses a stale parent-child combination', () => {
    const g = address();
    const changed = changeEditDraft(g, row, row, 'country', 2);
    expect(changed).toMatchObject({ country: 2, province: null, town: null });
    expect(validateEditDraft(g, row, changed)).toEqual({
      valid: false,
      issues: { province: 'required', town: 'required' },
    });
    expect(validateEditDraft(g, row, { country: 2, province: 10, town: 100 }).valid).toBe(false);
    expect(editDraftChanges(g, row, changed)).toEqual({ country: 2, province: null, town: null });
  });
  it('rejects invalid dependency configurations before interaction', () => {
    const g = address();
    g.fields.country.dependsOn = ['town'];
    g.fields.country.clearValue = null;
    expect(() => editFieldOrder(g.fields)).toThrow('Cyclic');
    g.fields.country.dependsOn = ['unknown' as 'town'];
    expect(() => editFieldOrder(g.fields)).toThrow('Unknown');
    g.fields.country.dependsOn = [];
    g.fields.province.clearValue = undefined;
    expect(() => editFieldOrder(g.fields)).toThrow('clearValue');
  });
  it('accepts false and zero, distinguishes null, and rejects nonfinite numbers, unknown choices and excess text', () => {
    type Scalars = { active: boolean; count: number; name: string; optional: string | null };
    const g: DataTableEditGroup<Record<string, never>, Scalars> = {
      fields: {
        active: { editor: { type: 'boolean' }, required: true },
        count: { editor: { type: 'number' }, required: true },
        name: { editor: { type: 'text', maxLength: 4 }, required: true },
        optional: { editor: { type: 'text', nullable: true } },
      },
      read: () => null,
      save: vi.fn(),
    };
    const valid = { active: false, count: 0, name: 'Okay', optional: null };
    expect(validateEditDraft(g, {}, valid).valid).toBe(true);
    expect(validateEditDraft(g, {}, { ...valid, count: Infinity, name: '   ' }).issues).toEqual({
      count: 'invalid',
      name: 'required',
    });
    expect(validateEditDraft(g, {}, { ...valid, name: 'Excess' }).valid).toBe(false);
    g.validate = () => false;
    expect(validateEditDraft(g, {}, valid).valid).toBe(false);
    g.validate = () => {
      throw Error('private detail');
    };
    expect(validateEditDraft(g, {}, valid).valid).toBe(false);
  });
  it('waits for all required descendants before sending one atomic numeric PATCH', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    render(<Fixture group={address(save)} />);
    choose('country', '1');
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByText('Complete this group')).toBeInTheDocument();
    choose('province', '0');
    expect(save).not.toHaveBeenCalled();
    choose('town', '0');
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0][0].changes).toEqual({ country: 2, province: 20, town: 200 });
    expect(save.mock.calls[0][0].changes).not.toHaveProperty('account');
  });
  it('saves an optional cleared descendant as explicit null after required fields are complete', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    render(<Fixture group={address(save, false)} />);
    choose('country', '1');
    choose('province', '0');
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0][0].changes).toEqual({ country: 2, province: 20, town: null });
  });
  it('discards the whole unsaved group, including cleared descendants', () => {
    const save = vi.fn();
    render(<Fixture group={address(save)} />);
    choose('country', '1');
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(screen.getByText('Country A')).toBeInTheDocument();
    expect(screen.getByText('Province A')).toBeInTheDocument();
    expect(screen.getByText('Town A')).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });
});

type TextRow = { id: number; name: string };
function TextFixture({
  save,
  multiline = false,
}: {
  save: ReturnType<typeof vi.fn>;
  multiline?: boolean;
}) {
  const group: DataTableEditGroup<TextRow, { name: string }> = {
    fields: {
      name: { editor: { type: multiline ? 'multiline' : 'text', maxLength: 20 }, required: true },
    },
    read: (r) => ({ name: r.name }),
    save,
  };
  const edit = useDataTableEditGroup({ group, scope: 'text', rowKey: (r) => r.id, copy });
  return <>{edit.column('name').render({ id: 1, name: 'Before' }, 'Name', 1)}</>;
}
const textInput = () => {
  fireEvent.click(screen.getByRole('button', { name: 'Edit Name' }));
  return screen.getByRole('textbox', { name: 'Name' });
};
it('saves completed text, never each keystroke, and Enter plus blur cannot duplicate a write', async () => {
  let finish!: () => void;
  const save = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  render(<TextFixture save={save} />);
  const input = textInput();
  fireEvent.change(input, { target: { value: 'After' } });
  expect(save).not.toHaveBeenCalled();
  fireEvent.keyDown(input, { key: 'Enter' });
  fireEvent.blur(input);
  expect(save).toHaveBeenCalledTimes(1);
  expect(save.mock.calls[0][0].changes).toEqual({ name: 'After' });
  expect(screen.getByRole('button', { name: 'Edit Name' })).toBeDisabled();
  await act(async () => finish());
});
it('does not save empty required text; Escape restores the draft', () => {
  const save = vi.fn();
  render(<TextFixture save={save} />);
  const input = textInput();
  fireEvent.change(input, { target: { value: '  ' } });
  fireEvent.blur(input);
  expect(save).not.toHaveBeenCalled();
  const again = textInput();
  fireEvent.keyDown(again, { key: 'Escape' });
  expect(screen.getByRole('button', { name: 'Edit Name' })).toHaveTextContent('Before');
});
it('waits for composition to finish after blur before saving the final text', async () => {
  const save = vi.fn().mockResolvedValue(undefined);
  render(<TextFixture save={save} />);
  const input = textInput();
  fireEvent.compositionStart(input);
  fireEvent.change(input, { target: { value: '中' } });
  fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
  fireEvent.blur(input);
  expect(save).not.toHaveBeenCalled();
  fireEvent.compositionEnd(input, { data: '中文', target: { value: '中文' } });
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  expect(save.mock.calls[0][0].changes).toEqual({ name: '中文' });
});
it('multiline Enter inserts a line; Ctrl+Enter saves', () => {
  const save = vi.fn().mockResolvedValue(undefined);
  render(<TextFixture save={save} multiline />);
  const input = textInput();
  fireEvent.change(input, { target: { value: 'First\nSecond' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(save).not.toHaveBeenCalled();
  fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true });
  expect(save).toHaveBeenCalledTimes(1);
});
it('retains failed drafts without implicit replay and offers explicit retry', async () => {
  const save = vi.fn().mockRejectedValueOnce(Error('secret response')).mockResolvedValue(undefined);
  render(<TextFixture save={save} />);
  let input = textInput();
  fireEvent.change(input, { target: { value: 'After' } });
  fireEvent.blur(input);
  await screen.findByText('Failed');
  input = textInput();
  fireEvent.blur(input);
  expect(save).toHaveBeenCalledTimes(1);
  expect(screen.queryByText('secret response')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
});
it('detects a visible base change before saving rather than overwriting it', async () => {
  const save = vi.fn();
  const group = address(save);
  const view = render(<Fixture group={group} />);
  choose('country', '1');
  view.rerender(<Fixture group={group} record={{ ...row, province: null }} />);
  choose('province', '0');
  choose('town', '0');
  expect(save).not.toHaveBeenCalled();
  expect(screen.getByText('Conflict')).toBeInTheDocument();
});
it('does not let a late submission response delete drafts in another scope', async () => {
  let resolve!: () => void;
  const save = vi.fn(
    () =>
      new Promise<void>((r) => {
        resolve = r;
      }),
  );
  const group = address(save, false);
  const { result, rerender } = renderHook(
    ({ scope }) => useDataTableEditGroup({ group, scope, rowKey: (r) => r.id, copy }),
    { initialProps: { scope: 'first' } },
  );
  act(() => {
    result.current.change(row, 'country', 2);
    result.current.change(row, 'province', 20);
    void result.current.complete(row, 'province');
  });
  expect(result.current.busy).toBe(true);
  rerender({ scope: 'second' });
  act(() => result.current.change(row, 'country', 2));
  expect(result.current.dirty).toBe(true);
  expect(result.current.busy).toBe(false);
  await act(async () => resolve());
  expect(result.current.dirty).toBe(true);
  expect(result.current.busy).toBe(false);
});
it('evaluates conditional required rules against the complete new group', () => {
  const group = address(vi.fn(), false);
  group.fields.town.required = (values) => values.country === 2;
  expect(validateEditDraft(group, row, { country: 1, province: 10, town: null }).valid).toBe(true);
  expect(validateEditDraft(group, row, { country: 2, province: 20, town: null })).toEqual({
    valid: false,
    issues: { town: 'required' },
  });
});
it('resets a shared descendant once after both of its parents have been cleared', () => {
  type V = { parent: number; left: number | null; right: number | null; child: number | null };
  const reset = vi.fn((values) => (values.left === null && values.right === null ? null : 99));
  const group: DataTableEditGroup<Record<string, never>, V> = {
    read: () => null,
    save: vi.fn(),
    fields: {
      child: {
        editor: { type: 'number', nullable: true },
        dependsOn: ['left', 'right'],
        clearValue: reset,
      },
      right: {
        editor: { type: 'number', nullable: true },
        dependsOn: ['parent'],
        clearValue: null,
      },
      left: { editor: { type: 'number', nullable: true }, dependsOn: ['parent'], clearValue: null },
      parent: { editor: { type: 'number' } },
    },
  };
  expect(
    changeEditDraft(group, {}, { parent: 1, left: 2, right: 3, child: 4 }, 'parent', 5),
  ).toEqual({ parent: 5, left: null, right: null, child: null });
  expect(reset).toHaveBeenCalledTimes(1);
});
