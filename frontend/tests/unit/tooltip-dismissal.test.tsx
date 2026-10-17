import { useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { act, fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useTooltipDismissal } from '@/shared/hooks/useTooltipDismissal';
import { CloseButton } from '@/shared/ui/CloseButton';

function MultiAnchor({ dismissed }: { dismissed: () => void }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const close = useCallback(() => {
    dismissed();
    setAnchor(null);
  }, [dismissed]);
  useTooltipDismissal(anchor, panel, close);
  return (
    <div onKeyDown={dismissed}>
      <div data-testid="scroll-container">
        {['First', 'Second'].map((label) => (
          <button key={label} onClick={(event) => setAnchor(event.currentTarget)}>
            {label}
          </button>
        ))}
      </div>
      {anchor &&
        createPortal(
          <div ref={panel} role="tooltip">
            <button>Panel action</button>
            {anchor.textContent}
          </div>,
          document.body,
        )}
    </div>
  );
}

describe('shared dismissal across multiple anchors and a portal', () => {
  it('protects the current anchor/panel and replaces the former protected anchor', () => {
    const dismissed = vi.fn();
    const view = render(<MultiAnchor dismissed={dismissed} />);
    const first = view.getByRole('button', { name: 'First' });
    const second = view.getByRole('button', { name: 'Second' });
    fireEvent.click(first);
    fireEvent.pointerDown(first);
    fireEvent.pointerDown(view.getByRole('button', { name: 'Panel action' }));
    expect(dismissed).not.toHaveBeenCalled();
    fireEvent.click(second);
    fireEvent.pointerDown(second);
    expect(dismissed).not.toHaveBeenCalled();
    fireEvent.pointerDown(first);
    expect(dismissed).toHaveBeenCalledOnce();
    expect(view.queryByRole('tooltip')).toBeNull();
  });

  it('dismisses nested scroll, resize, blur and hiding, then releases closed/unmounted listeners', () => {
    const dismissed = vi.fn();
    const view = render(<MultiAnchor dismissed={dismissed} />);
    const trigger = view.getByRole('button', { name: 'First' });
    for (const event of [
      () => fireEvent.scroll(view.getByTestId('scroll-container')),
      () => fireEvent.resize(window),
      () => fireEvent.blur(window),
    ]) {
      fireEvent.click(trigger);
      event();
      expect(view.queryByRole('tooltip')).toBeNull();
    }
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    fireEvent.click(trigger);
    fireEvent(document, new Event('visibilitychange'));
    expect(view.queryByRole('tooltip')).toBeNull();
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    expect(dismissed).toHaveBeenCalledTimes(4);
    fireEvent.resize(window);
    expect(dismissed).toHaveBeenCalledTimes(4);
    fireEvent.click(trigger);
    view.unmount();
    fireEvent.resize(window);
    fireEvent.pointerDown(document.body);
    expect(dismissed).toHaveBeenCalledTimes(4);
  });

  it('respects an already handled Escape and consumes a fresh Escape without moving focus', () => {
    const dismissed = vi.fn();
    const view = render(<MultiAnchor dismissed={dismissed} />);
    const trigger = view.getByRole('button', { name: 'First' });
    fireEvent.click(trigger);
    act(() => trigger.focus());
    const handled = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    handled.preventDefault();
    fireEvent(trigger, handled);
    expect(view.getByRole('tooltip')).toBeInTheDocument();
    // The test owner's bubbling handler sees an already handled event; the shared hook ignores it.
    dismissed.mockClear();
    const fresh = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    fireEvent(trigger, fresh);
    expect(fresh.defaultPrevented).toBe(true);
    expect(dismissed).toHaveBeenCalledOnce();
    expect(trigger).toHaveFocus();
    expect(view.queryByRole('tooltip')).toBeNull();
  });
});

it('exposes the native CloseButton ref for preview handoff and honors disabled dismissal', () => {
  const onClose = vi.fn();
  const ref = { current: null as HTMLButtonElement | null };
  const view = render(<CloseButton label="關閉預覽" onClose={onClose} ref={ref} />);
  const button = view.getByRole('button', { name: '關閉預覽' });
  expect(ref.current).toBe(button);
  act(() => ref.current?.focus());
  expect(button).toHaveFocus();
  fireEvent.click(button);
  expect(onClose).toHaveBeenCalledOnce();
  view.rerender(<CloseButton label="關閉預覽" onClose={onClose} ref={ref} disabled />);
  fireEvent.click(button);
  expect(onClose).toHaveBeenCalledOnce();
  expect(button).toBeDisabled();
  view.unmount();
  expect(ref.current).toBeNull();
});
