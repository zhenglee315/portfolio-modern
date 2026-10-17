import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { useManagementEdit } from '@/pages/management/hooks/useManagementEdit';
import { ManagementDetails } from '@/pages/management/components/ManagementDetails';
import {
  managementDraftChanges,
  managementDraftIssue,
  managementFieldIssue,
  managementEditor,
} from '@/pages/management/model/management-edit';
import { managementSiteSchema } from '@/features/management/schemas/management';
import { type ManagementRow } from '@/features/management';
import { NotificationContext } from '@/shared/ui/NotificationProvider';
import { managementSiteFixtures } from '../unit-fixtures/management';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
afterEach(() => vi.unstubAllGlobals());
const row = managementSiteSchema.parse({
  ...managementSiteFixtures().find((row) => row.has_site),
  is_default: true,
  owner_is_active: true,
  is_published: true,
});
const copy = {
  title: 'Details',
  close: 'Close',
  field: {
    edit: (label: string) => `Edit ${label}`,
    clear: (label: string) => `Clear ${label}`,
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

function Quick({ value }: { value: ManagementRow }) {
  const edit = useManagementEdit('sites', 'en', 1, true);
  return <>{edit.columns.owner_is_active!.render(value, 'Active', value.id)}</>;
}

it('blocks the Default Active switch without sending a request and unlocks after Default changes', async () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = (value: ManagementRow) => (
    <QueryClientProvider client={client}>
      <NotificationContext.Provider value={{ notify: vi.fn(), dismiss: vi.fn() }}>
        <Quick value={value} />
      </NotificationContext.Provider>
    </QueryClientProvider>
  );
  const rendered = render(view(row));
  const active = screen.getByRole('switch');
  expect(active).toBeChecked();
  expect(active).toBeDisabled();
  expect(active.closest('label')).toHaveAttribute(
    'title',
    'management.write.defaultSiteActiveRequired',
  );
  await userEvent.click(active);
  expect(fetch).not.toHaveBeenCalled();
  rendered.rerender(view({ ...row, is_default: false }));
  expect(screen.getByRole('switch')).toBeEnabled();
  expect(fetch).not.toHaveBeenCalled();
  client.clear();
});

it('retains constrained Active in the detail draft and only enables it after explicitly clearing Default', async () => {
  const save = vi.fn().mockResolvedValue(undefined);
  const columns = ['owner_is_active', 'is_default'].map((field) => ({
    id: field,
    label: field === 'owner_is_active' ? 'Active' : 'Default',
    value: (value: typeof row) => value[field as 'owner_is_active' | 'is_default'],
    editor: (value: typeof row) => managementEditor('sites', field, value),
    editUnavailableReason: (value: typeof row) => managementFieldIssue('sites', field, value),
  }));
  render(
    <ManagementDetails
      row={row}
      columns={columns}
      icon="people"
      copy={copy}
      onClose={vi.fn()}
      onSave={save}
      changeDraft={(draft, field, value) => managementDraftChanges('sites', draft, field, value)}
      validate={(draft) => managementDraftIssue('sites', row, draft)}
    />,
  );
  const actor = userEvent.setup();
  expect(screen.getByRole('switch', { name: 'Edit Active' })).toBeDisabled();
  expect(screen.getByRole('switch', { name: 'Edit Active' })).toBeChecked();
  await actor.click(screen.getByRole('switch', { name: 'Edit Default' }));
  expect(screen.getByRole('switch', { name: 'Edit Active' })).toBeEnabled();
  await actor.click(screen.getByRole('switch', { name: 'Edit Active' }));
  await actor.click(screen.getByRole('button', { name: 'Save', exact: true }));
  await actor.click(screen.getByRole('button', { name: 'Confirm Save' }));
  expect(save).toHaveBeenCalledExactlyOnceWith({ owner_is_active: false, is_default: false });
});

it('rejects an inconsistent final draft and never silently removes Default through Active changes', () => {
  expect(managementDraftIssue('sites', row, { ...row, owner_is_active: false })).toBe(
    'defaultSiteActiveRequired',
  );
  expect(managementDraftChanges('sites', row, 'owner_is_active', false)).toEqual({
    owner_is_active: false,
  });
  expect(
    managementFieldIssue('sites', 'owner_is_active', { ...row, is_default: false }),
  ).toBeUndefined();
  expect(
    managementDraftIssue('sites', row, { ...row, is_default: false, owner_is_active: false }),
  ).toBeUndefined();
});
