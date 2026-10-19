import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { ManagementDetails } from '@/pages/management/components/ManagementDetails';
import {
  managementDraftChanges,
  managementDraftIssue,
  managementEditor,
} from '@/pages/management/model/management-edit';
import {
  managementRoleFixtures,
  managementUserFixtures,
  managementSiteFixtures,
} from '../unit-fixtures/management';
const copy = {
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
const row = { id: 1, name: 'Before', active: true };
const columns = [
  { id: 'name', label: 'Name', value: (r) => r.name, editor: () => ({ type: 'text' as const }) },
  {
    id: 'active',
    label: 'Active',
    value: (r) => r.active,
    editor: () => ({ type: 'boolean' as const }),
  },
];
function setup(save = vi.fn().mockResolvedValue(undefined)) {
  return {
    save,
    ...render(
      <ManagementDetails
        row={row}
        columns={columns}
        icon="people"
        copy={copy}
        onClose={vi.fn()}
        onSave={save}
      />,
    ),
  };
}
function change() {
  fireEvent.click(screen.getByRole('button', { name: 'Edit Name' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'Changed' } });
  fireEvent.blur(screen.getByRole('textbox', { name: 'Name' }));
}
it('submits only changed fields after confirmation and locks the form until persistence completes', async () => {
  let finish!: () => void;
  const save = vi.fn(
    () =>
      new Promise<void>((r) => {
        finish = r;
      }),
  );
  setup(save);
  change();
  expect(save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Save', exact: true }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm Save' }));
  expect(save).toHaveBeenCalledWith({ name: 'Changed' });
  expect(screen.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Edit Name' })).toBeDisabled();
  await act(async () => finish());
});
it('retains a failed draft and keeps cancellation free of writes', async () => {
  const save = vi.fn().mockRejectedValue(Error('private error'));
  setup(save);
  change();
  fireEvent.click(screen.getByRole('button', { name: 'Save', exact: true }));
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Save', exact: true }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm Save' }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Save', exact: true })).toBeEnabled(),
  );
  expect(screen.getByRole('button', { name: 'Edit Name' })).toHaveTextContent('Changed');
  expect(screen.queryByText('private error')).toBeNull();
});
it('blocks stale details if a fresh server row changes the baseline', () => {
  const view = setup();
  change();
  view.rerender(
    <ManagementDetails
      row={{ ...row, name: 'Another admin' }}
      columns={columns}
      icon="people"
      copy={copy}
      onClose={vi.fn()}
      onSave={view.save}
    />,
  );
  expect(screen.getByRole('alert')).toHaveTextContent('Conflict');
  expect(screen.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
  expect(view.save).not.toHaveBeenCalled();
});
it('keeps user roles immutable and validates registration-default final state', () => {
  const user = managementUserFixtures[0];
  expect(managementEditor('users', 'role', user)).toBeUndefined();
  const role = {
    ...managementRoleFixtures[0],
    is_default: true,
    is_active: true,
    is_manage_roles: false,
    is_manage_users: false,
    is_monitor: false,
    is_manage_sites: false,
  };
  expect(managementDraftIssue('roles', role, { ...role, is_active: false })).toBe(
    'defaultRoleEligible',
  );
  expect(managementDraftIssue('roles', role, { ...role, is_default: false })).toBe(
    'defaultRoleRequired',
  );
});
it('keeps Default on activation edits and clears it only on unpublish', () => {
  const site = managementSiteFixtures().find((r) => r.has_site)!;
  expect(managementDraftChanges('sites', site, 'owner_is_active', false)).toEqual({
    owner_is_active: false,
  });
  expect(managementDraftChanges('sites', site, 'is_published', false)).toEqual({
    is_published: false,
    is_default: false,
  });
});
it('publishes with an unchanged Profile icon, but rejects invalid changes to that icon', () => {
  const save = vi.fn().mockResolvedValue(undefined);
  const site = {
    ...managementSiteFixtures().find((value) => value.has_site)!,
    chat_icon: 'chat',
    is_published: false,
    is_default: false,
  };
  render(
    <ManagementDetails
      row={site}
      columns={(['chat_icon', 'is_published'] as const).map((field) => ({
        id: field,
        label: field,
        value: (value) => value[field],
        editor: (value) => managementEditor('sites', field, value),
      }))}
      icon="window"
      copy={copy}
      onClose={vi.fn()}
      onSave={save}
    />,
  );
  fireEvent.click(screen.getByRole('checkbox', { name: 'Edit is_published' }));
  const button = screen.getByRole('button', { name: 'Save', exact: true });
  expect(button).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'Edit chat_icon' }));
  const input = screen.getByRole('textbox', { name: 'chat_icon' });
  fireEvent.change(input, { target: { value: 'https://example.test/unknown.svg' } });
  expect(button).toBeDisabled();
  fireEvent.change(input, { target: { value: 'chat' } });
  fireEvent.blur(input);
  expect(button).toBeEnabled();
  fireEvent.click(button);
  fireEvent.click(screen.getByRole('button', { name: 'Confirm Save' }));
  expect(save).toHaveBeenCalledWith({ is_published: true });
});
it('represents clearing an optional description as null rather than an empty string', () => {
  const save = vi.fn().mockResolvedValue(undefined);
  render(
    <ManagementDetails
      row={{ id: 1, description: 'Original' }}
      columns={[
        {
          id: 'description',
          label: 'Description',
          value: (r) => r.description,
          editor: () => ({ type: 'multiline', nullable: true }),
        },
      ]}
      icon="people"
      copy={copy}
      onClose={vi.fn()}
      onSave={save}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Clear Description' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save', exact: true }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm Save' }));
  expect(save).toHaveBeenCalledWith({ description: null });
});
