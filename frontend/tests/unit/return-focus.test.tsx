import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useReturnFocus } from '@/shared/hooks/useReturnFocus';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function Surface({ open }: { open: boolean }) {
  const remember = useReturnFocus(open);
  return (
    <>
      <button onClick={(event) => remember(event.currentTarget)}>Trigger</button>
      <button>Closing control</button>
      <button>Other control</button>
    </>
  );
}

/** Pause the browser frame so focus changes during modal teardown are deterministic. */
function closing() {
  let callback: FrameRequestCallback | undefined;
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((value) => {
    callback = value;
    return 1;
  });
  const focused = vi.spyOn(document, 'hasFocus').mockReturnValue(true);
  const { rerender } = render(<Surface open />);
  const trigger = screen.getByRole('button', { name: 'Trigger' });
  fireEvent.click(trigger);
  const control = screen.getByRole('button', { name: 'Closing control' });
  control.focus();
  rerender(<Surface open={false} />);
  return { trigger, control, focused, finish: () => act(() => callback?.(16)) };
}

it('restores the activating control after modal cleanup when focus is unchanged', () => {
  const view = closing();
  view.finish();
  expect(view.trigger).toHaveFocus();
});

it('preserves a different control chosen before the restoration frame', () => {
  const view = closing();
  const selected = screen.getByRole('button', { name: 'Other control' });
  selected.focus();
  view.finish();
  expect(selected).toHaveFocus();
});

it('does not reactivate an iframe after focus moves to its parent document', () => {
  const view = closing();
  const focus = vi.spyOn(view.trigger, 'focus');
  view.focused.mockReturnValue(false);
  view.finish();
  expect(focus).not.toHaveBeenCalled();
});

it('does not focus twice when Bootstrap already restored the trigger', () => {
  const view = closing();
  view.trigger.focus();
  const focus = vi.spyOn(view.trigger, 'focus');
  view.finish();
  expect(view.trigger).toHaveFocus();
  expect(focus).not.toHaveBeenCalled();
});
