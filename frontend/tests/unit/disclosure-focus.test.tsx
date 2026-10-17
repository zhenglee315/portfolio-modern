import { act, render, screen, cleanup } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { useDisclosureFocus } from '../../src/shared/hooks/useDisclosureFocus';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function Disclosure({ open, onClose }: { open: boolean; onClose: () => void }) {
  const surface = useRef<HTMLDivElement>(null);
  const initial = useRef<HTMLButtonElement>(null);
  useDisclosureFocus(open, surface, initial, onClose);
  return (
    <div ref={surface}>
      <button>Trigger</button>
      <button ref={initial}>First</button>
      <button>Last</button>
    </div>
  );
}

it('preserves a user-selected item before the initial focus frame runs', () => {
  let frame: FrameRequestCallback | undefined;
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    frame = callback;
    return 1;
  });
  const onClose = vi.fn();
  const { rerender } = render(<Disclosure open={false} onClose={onClose} />);
  screen.getByRole('button', { name: 'Trigger' }).focus();
  rerender(<Disclosure open onClose={onClose} />);
  const selected = screen.getByRole('button', { name: 'Last' });
  selected.focus();
  act(() => frame?.(16));
  expect(selected).toHaveFocus();
  expect(onClose).not.toHaveBeenCalled();
});

it('focuses the initial item when the user has not moved focus', () => {
  let frame: FrameRequestCallback | undefined;
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    frame = callback;
    return 1;
  });
  const onClose = vi.fn();
  const { rerender } = render(<Disclosure open={false} onClose={onClose} />);
  screen.getByRole('button', { name: 'Trigger' }).focus();
  rerender(<Disclosure open onClose={onClose} />);
  act(() => frame?.(16));
  expect(screen.getByRole('button', { name: 'First' })).toHaveFocus();
});
