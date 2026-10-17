import { render, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { InlineField, type InlineFieldValue } from '@/shared/ui/InlineField';
import {
  ManagementDetails,
  type ManagementDetailColumn,
} from '@/pages/management/components/ManagementDetails';
import { managementEditor } from '@/pages/management/model/management-edit';
import {
  managementRoleSchema,
  managementUserSchema,
  managementSiteSchema,
} from '@/features/management/schemas/management';
import {
  managementRoleFixtures,
  managementUserFixtures,
  managementSiteFixtures,
} from '../unit-fixtures/management';
const copy = {
  title: 'Details',
  close: 'Close',
  save: {
    title: 'Save changes?',
    message: 'Confirm changes.',
    confirm: 'Confirm Save',
    cancel: 'Cancel',
    conflict: 'Conflict',
  },
  field: {
    edit: (label: string) => `Edit ${label}`,
    clear: (label: string) => `Clear ${label}`,
    invalid: 'Invalid value',
    empty: '—',
  },
};
const role = managementRoleSchema.parse(managementRoleFixtures.at(-1));
const account = managementUserSchema.parse(managementUserFixtures.at(-1));
const site = managementSiteSchema.parse(managementSiteFixtures().at(-1));
afterEach(() => vi.unstubAllGlobals());

describe('management editor configuration', () => {
  it.each([
    'id',
    'email',
    'role_id',
    'site_id',
    'createtime',
    'updatetime',
    'last_login',
    'login_count',
    'role_is_active',
    'has_site',
  ])('%s stays read-only on user records', (field) => {
    expect(managementEditor('users', field, account)).toBeUndefined();
  });
  it.each(['user_count', 'createtime', 'id'])('%s stays read-only on role records', (field) => {
    expect(managementEditor('roles', field, role)).toBeUndefined();
  });
  it.each([
    'user',
    'owner_email',
    'profile_name',
    'locale',
    'has_translation',
    'has_site',
    'has_profile',
    'site_id',
    'updatetime',
  ])('%s stays read-only on platform records', (field) => {
    expect(managementEditor('sites', field, site)).toBeUndefined();
  });
  it('keeps absent site and translation projections read-only instead of creating fake data', () => {
    expect(
      managementEditor('sites', 'email', { ...site, has_site: false, site_id: null }),
    ).toBeUndefined();
    expect(
      managementEditor('sites', 'first_name', { ...site, has_translation: false }),
    ).toBeUndefined();
    expect(managementEditor('sites', 'owner_email', { ...site, has_site: false })).toBeUndefined();
  });
  it('checks contact email contracts, copyright bounds and Default eligibility', () => {
    expect(managementEditor('sites', 'email', site)!.validate!('bad')).toBe(false);
    expect(managementEditor('sites', 'email', site)!.validate!('valid@example.com')).toBe(true);
    expect(managementEditor('users', 'email', account)).toBeUndefined();
    expect(managementEditor('sites', 'user', site)).toBeUndefined();
    const year = managementEditor('sites', 'copyright_year', site)!;
    expect(year.nullable).toBe(false);
    expect(year.validate!(null)).toBe(false);
    expect(year.validate!(1899)).toBe(false);
    expect(year.validate!(1900)).toBe(true);
    expect(year.validate!(9999)).toBe(true);
    expect(year.validate!(10000)).toBe(false);
    expect(
      managementEditor('sites', 'is_default', { ...site, is_published: false })!.validate!(true),
    ).toBe(false);
    expect(
      managementEditor('sites', 'is_default', {
        ...site,
        is_published: true,
        owner_is_active: true,
      })!.validate!(true),
    ).toBe(true);
    expect(managementEditor('sites', 'is_published', site)!.nullable).toBe(false);
  });
});

it('keeps invalid edits from being confirmed and treats returning to the original value as clean', async () => {
  const actor = await userEvent.setup();
  const columns: ManagementDetailColumn<typeof role>[] = [
    {
      id: 'role',
      label: 'Role',
      value: (r) => r.role,
      editor: (r) => managementEditor('roles', 'role', r),
    },
  ];
  const view = render(
    <ManagementDetails
      row={role}
      columns={columns}
      icon="shieldLock"
      copy={copy}
      onSave={vi.fn().mockResolvedValue(undefined)}
      onClose={() => {}}
    />,
  );
  await actor.click(view.getByRole('button', { name: 'Edit Role', exact: true }));
  const input = view.getByRole('textbox', { name: 'Role', exact: true });
  await actor.clear(input);
  expect(view.getByRole('button', { name: 'Save' })).toBeDisabled();
  expect(input).toHaveAttribute('aria-invalid', 'true');
  await actor.type(input, role.role);
  expect(view.getByRole('button', { name: 'Save' })).toBeDisabled();
  expect(input).not.toHaveAttribute('aria-invalid', 'true');
});

it('preserves multiline text, numeric zero and null while handling keyboard completion', async () => {
  const actor = await userEvent.setup();
  const changed = vi.fn();
  function Owner() {
    const [value, setValue] = useState<InlineFieldValue>(null);
    return (
      <InlineField
        label="Description"
        value={value}
        editor={{ type: 'multiline', nullable: true }}
        copy={copy.field}
        onChange={(v) => {
          changed(v);
          setValue(v);
        }}
      />
    );
  }
  const view = render(<Owner />);
  await actor.click(view.getByRole('button', { name: 'Edit Description' }));
  const input = view.getByRole('textbox', { name: 'Description' });
  await actor.type(input, 'line 1{Enter}line 2');
  expect(changed).toHaveBeenLastCalledWith('line 1\nline 2');
  fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
  expect(view.getByRole('textbox', { name: 'Description' })).toBeInTheDocument();
  await actor.keyboard('{Control>}{Enter}{/Control}');
  expect(view.queryByRole('textbox', { name: 'Description' })).toBeNull();
  expect(view.getByRole('button', { name: 'Edit Description' })).toHaveFocus();
  view.unmount();
  function NumberOwner() {
    const [value, setValue] = useState<InlineFieldValue>(5);
    return (
      <InlineField
        label="Count"
        value={value}
        editor={{ type: 'number', validate: (v) => typeof v === 'number' && Number.isInteger(v) }}
        copy={copy.field}
        onChange={(v) => {
          changed(v);
          setValue(v);
        }}
      />
    );
  }
  const number = render(<NumberOwner />);
  await actor.click(number.getByRole('button', { name: 'Edit Count' }));
  const numberInput = number.getByRole('textbox', { name: 'Count' });
  await actor.clear(numberInput);
  await actor.type(numberInput, '0');
  expect(changed).toHaveBeenLastCalledWith(0);
  await actor.keyboard('{Enter}');
  await waitFor(() =>
    expect(number.getByRole('button', { name: 'Edit Count' })).toHaveTextContent('0'),
  );
});
