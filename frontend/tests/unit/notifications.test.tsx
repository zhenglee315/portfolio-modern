import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  NotificationProvider,
  notificationDurationMs,
  useNotifications,
} from '@/shared/ui/NotificationProvider';

const copy = {
  close: 'Close notification',
  labels: { success: 'Success', warning: 'Warning', error: 'Error', bug: 'Bug' },
  defaults: {
    success: 'Completed successfully.',
    warning: 'Please try again.',
    error: 'The request failed.',
    bug: 'Something unexpected happened.',
  },
};

function Controls() {
  const { notify, dismiss } = useNotifications();
  return (
    <>
      <input aria-label="Keep working" />
      {(['success', 'warning', 'error', 'bug'] as const).map((kind) => (
        <button key={kind} type="button" onClick={() => notify({ kind })}>
          {kind}
        </button>
      ))}
      <button type="button" onClick={() => notify({ kind: 'success', message: 'First result' })}>
        First
      </button>
      <button type="button" onClick={() => notify({ kind: 'warning', message: 'Second result' })}>
        Second
      </button>
      <button
        type="button"
        onClick={() => notify({ kind: 'warning', message: 'Repeated warning', id: 'connection' })}
      >
        Repeat
      </button>
      <button
        type="button"
        onClick={() => notify({ kind: 'error', message: '<img src=x onerror=alert(1)>' })}
      >
        Plain text
      </button>
      <button type="button" onClick={dismiss}>
        Dismiss externally
      </button>
    </>
  );
}

function renderNotifications() {
  return render(
    <NotificationProvider copy={copy}>
      <Controls />
    </NotificationProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('shared notifications', () => {
  it.each(['success', 'warning', 'error', 'bug'] as const)(
    'shows the %s label and fallback message in a polite live region',
    (kind) => {
      const view = renderNotifications();
      fireEvent.click(view.getByRole('button', { name: kind }));
      const status = view.getByRole('status');
      expect(status).toHaveAttribute('aria-live', 'polite');
      expect(status).toHaveAttribute('aria-atomic', 'true');
      expect(status).toHaveTextContent(copy.labels[kind]);
      expect(status).toHaveTextContent(copy.defaults[kind]);
      expect(view.container.querySelector('[data-notification-kind]')).toHaveAttribute(
        'data-notification-kind',
        kind,
      );
      expect(view.queryByRole('dialog')).toBeNull();
      expect(view.queryByRole('alertdialog')).toBeNull();
    },
  );

  it('dismisses a notification after exactly three seconds', () => {
    vi.useFakeTimers();
    expect(notificationDurationMs).toBe(3000);
    const view = renderNotifications();
    fireEvent.click(view.getByRole('button', { name: 'First' }));
    act(() => vi.advanceTimersByTime(2999));
    expect(view.getByText('First result')).toBeVisible();
    act(() => vi.advanceTimersByTime(1));
    expect(view.queryByText('First result')).toBeNull();
    expect(view.container.querySelector('[data-notification-kind]')).toBeNull();
  });

  it('replaces the current message and gives its replacement a full three seconds', () => {
    vi.useFakeTimers();
    const view = renderNotifications();
    fireEvent.click(view.getByRole('button', { name: 'First' }));
    act(() => vi.advanceTimersByTime(2500));
    fireEvent.click(view.getByRole('button', { name: 'Second' }));
    expect(view.queryByText('First result')).toBeNull();
    expect(view.getByText('Second result')).toBeVisible();
    expect(view.container.querySelectorAll('[data-notification-kind]')).toHaveLength(1);
    act(() => vi.advanceTimersByTime(500));
    expect(view.getByText('Second result')).toBeVisible();
    act(() => vi.advanceTimersByTime(2499));
    expect(view.getByText('Second result')).toBeVisible();
    act(() => vi.advanceTimersByTime(1));
    expect(view.queryByText('Second result')).toBeNull();
  });

  it('renders notification messages as text rather than interpreting markup', () => {
    const view = renderNotifications();
    fireEvent.click(view.getByRole('button', { name: 'Plain text' }));
    expect(view.getByRole('status')).toHaveTextContent('<img src=x onerror=alert(1)>');
    expect(view.getByRole('status').querySelector('img')).toBeNull();
  });

  it('does not keep a repeated warning with the same identity open indefinitely', () => {
    vi.useFakeTimers();
    const view = renderNotifications();
    const repeat = view.getByRole('button', { name: 'Repeat' });
    fireEvent.click(repeat);
    act(() => vi.advanceTimersByTime(2500));
    fireEvent.click(repeat);
    expect(view.getByText('Repeated warning')).toBeVisible();
    act(() => vi.advanceTimersByTime(500));
    expect(view.queryByText('Repeated warning')).toBeNull();
  });

  it('leaves focus on the active control and keeps the page interactive', () => {
    const view = renderNotifications();
    const input = view.getByRole('textbox', { name: 'Keep working' });
    input.focus();
    fireEvent.click(view.getByRole('button', { name: 'First' }));
    expect(input).toHaveFocus();
    fireEvent.change(input, { target: { value: 'Continue typing' } });
    expect(input).toHaveValue('Continue typing');
    expect(view.getByText('First result')).toBeVisible();
  });

  it('supports an accessible close button and external dismissal without stale timers', () => {
    vi.useFakeTimers();
    const view = renderNotifications();
    fireEvent.click(view.getByRole('button', { name: 'First' }));
    fireEvent.click(view.getByRole('button', { name: copy.close }));
    expect(view.queryByText('First result')).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    fireEvent.click(view.getByRole('button', { name: 'Second' }));
    fireEvent.click(view.getByRole('button', { name: 'Dismiss externally' }));
    expect(view.queryByText('Second result')).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cleans up the pending dismissal when its provider unmounts', () => {
    vi.useFakeTimers();
    const view = renderNotifications();
    fireEvent.click(view.getByRole('button', { name: 'First' }));
    expect(vi.getTimerCount()).toBe(1);
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
