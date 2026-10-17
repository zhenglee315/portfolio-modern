import { StrictMode } from 'react';
import { cleanup, render, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import WarningModal from '../../src/shared/ui/WarningModal';

afterEach(cleanup);

describe('WarningModal', () => {
  it('keeps the existing acknowledgement mode and close callback', async () => {
    const onClose = vi.fn();
    const view = render(
      <WarningModal
        title="Account warning"
        message="Already registered."
        closeLabel="Close"
        onClose={onClose}
      />,
    );
    expect(view.getByRole('dialog', { name: 'Account warning' })).toHaveAccessibleDescription(
      'Already registered.',
    );
    expect(view.queryByRole('alertdialog')).not.toBeInTheDocument();
    await userEvent.click(view.getAllByRole('button', { name: 'Close' }).at(-1)!);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('cancels without confirming and presents an accessible warning question', async () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();
    const view = render(
      <WarningModal
        title="Delete?"
        message="Selected records: 2"
        closeLabel="Close"
        onClose={onClose}
        confirm={{ label: 'Delete', cancelLabel: 'Cancel', variant: 'danger', onConfirm }}
      />,
      { wrapper: StrictMode },
    );
    const dialog = view.getByRole('dialog', { name: 'Delete?' });
    expect(dialog).toHaveAccessibleDescription('Selected records: 2');
    expect(dialog.querySelector('svg.bi-exclamation-triangle-fill')).toBeInTheDocument();
    await waitFor(() => expect(view.getByRole('button', { name: 'Cancel' })).toHaveFocus());
    await userEvent.click(view.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('emits confirmation only to the owner and never treats it as cancellation', async () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();
    const view = render(
      <WarningModal
        title="Delete?"
        message="Selected record: example"
        closeLabel="Close"
        onClose={onClose}
        confirm={{ label: 'Delete', cancelLabel: 'Cancel', variant: 'danger', onConfirm }}
      />,
    );
    await userEvent.click(view.getByRole('button', { name: 'Delete' }));
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();
    expect(view.getByRole('dialog')).toBeInTheDocument();
  });
});
