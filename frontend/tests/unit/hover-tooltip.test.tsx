import type { KeyboardEventHandler } from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useHoverTooltip } from '@/shared/hooks/useHoverTooltip';

function TooltipExample({ onEscape }: { onEscape?: KeyboardEventHandler<HTMLDivElement> }) {
  const tooltip = useHoverTooltip();
  return (
    <div onKeyDown={onEscape}>
      <button {...tooltip.triggerProps} type="button" onClick={tooltip.show}>
        Details
      </button>
      {tooltip.tooltipProps && (
        <div
          ref={tooltip.tooltipProps.panel}
          id={tooltip.tooltipProps.id}
          role="tooltip"
          onPointerEnter={tooltip.tooltipProps.onPointerEnter}
          onPointerLeave={tooltip.tooltipProps.onPointerLeave}
        >
          More details
        </div>
      )}
    </div>
  );
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('shared hover tooltip lifecycle', () => {
  it('bridges the pointer gap and remains visible while its panel is hovered', () => {
    const view = render(<TooltipExample />);
    const trigger = view.getByRole('button', { name: 'Details' });
    fireEvent.pointerEnter(trigger, { pointerType: 'mouse' });
    const panel = view.getByRole('tooltip');
    expect(trigger).toHaveAttribute('aria-describedby', panel.id);

    fireEvent.pointerLeave(trigger, { pointerType: 'mouse' });
    act(() => vi.advanceTimersByTime(100));
    expect(panel).toBeInTheDocument();

    fireEvent.pointerEnter(panel, { pointerType: 'mouse' });
    act(() => vi.advanceTimersByTime(1000));
    expect(view.getByRole('tooltip')).toBe(panel);

    fireEvent.pointerLeave(panel, { pointerType: 'mouse' });
    act(() => vi.advanceTimersByTime(1000));
    expect(view.queryByRole('tooltip')).toBeNull();
    expect(trigger).not.toHaveAttribute('aria-describedby');
  });

  it('consumes Escape while keeping keyboard focus, then releases Escape for its owner', () => {
    const onEscape = vi.fn();
    const view = render(<TooltipExample onEscape={onEscape} />);
    const trigger = view.getByRole('button', { name: 'Details' });
    act(() => trigger.focus());
    expect(view.getByRole('tooltip')).toBeInTheDocument();

    const dismiss = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    fireEvent(trigger, dismiss);
    expect(dismiss.defaultPrevented).toBe(true);
    expect(onEscape).not.toHaveBeenCalled();
    expect(trigger).toHaveFocus();
    expect(view.queryByRole('tooltip')).toBeNull();
    expect(trigger).not.toHaveAttribute('aria-describedby');

    const ownerEscape = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    fireEvent(trigger, ownerEscape);
    expect(ownerEscape.defaultPrevented).toBe(false);
    expect(onEscape).toHaveBeenCalledOnce();
  });

  it('releases a pending dismissal and all tooltip listeners when its owner unmounts', () => {
    const view = render(<TooltipExample />);
    const trigger = view.getByRole('button', { name: 'Details' });
    const documentAdd = vi.spyOn(document, 'addEventListener');
    const documentRemove = vi.spyOn(document, 'removeEventListener');
    const windowAdd = vi.spyOn(window, 'addEventListener');
    const windowRemove = vi.spyOn(window, 'removeEventListener');

    fireEvent.pointerEnter(trigger, { pointerType: 'mouse' });
    fireEvent.pointerLeave(trigger, { pointerType: 'mouse' });
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    const documentSubscriptions = documentAdd.mock.calls.filter(([type]) =>
      ['pointerdown', 'keydown', 'visibilitychange'].includes(type),
    );
    const windowSubscriptions = windowAdd.mock.calls.filter(([type]) =>
      ['blur', 'resize', 'scroll'].includes(type),
    );
    expect(documentSubscriptions.length).toBeGreaterThan(0);
    expect(windowSubscriptions.length).toBeGreaterThan(0);

    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
    for (const subscription of documentSubscriptions) {
      expect(documentRemove).toHaveBeenCalledWith(...subscription);
    }
    for (const subscription of windowSubscriptions) {
      expect(windowRemove).toHaveBeenCalledWith(...subscription);
    }
    const escape = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    fireEvent(document.body, escape);
    expect(escape.defaultPrevented).toBe(false);
  });
});
