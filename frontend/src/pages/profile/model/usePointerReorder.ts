import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';

type Placement = 'before' | 'after';
type DropTarget = { id: string; placement: Placement };
export type ReorderDrag = {
  id: string;
  label: string;
  x: number;
  y: number;
  target: DropTarget | null;
};
type Session = {
  id: string;
  label: string;
  pointerId: number;
  handle: HTMLButtonElement;
  startX: number;
  startY: number;
  x: number;
  y: number;
  active: boolean;
};

/** Resolve insertion edges inside this list only, including gaps between wrapped skill chips. */
function targetAt(list: HTMLDivElement | null, session: Session, axis: 'vertical' | 'horizontal') {
  if (!list) return null;
  const { x, y } = session;
  const bounds = list.getBoundingClientRect();
  if (x < bounds.left || x > bounds.right || y < bounds.top || y > bounds.bottom) return null;
  const nearest = [...list.querySelectorAll<HTMLElement>('[data-reorder-id]')]
    .map((node) => {
      const rect = node.getBoundingClientRect();
      const dx = Math.max(rect.left - x, 0, x - rect.right);
      const dy = Math.max(rect.top - y, 0, y - rect.bottom);
      return { id: node.dataset.reorderId!, rect, distance: dx * dx + dy * dy };
    })
    .sort((a, b) => a.distance - b.distance)[0];
  if (!nearest || nearest.id === session.id) return null;
  const after =
    axis === 'vertical'
      ? y >= nearest.rect.top + nearest.rect.height / 2
      : x >= nearest.rect.left + nearest.rect.width / 2;
  return { id: nearest.id, placement: after ? 'after' : 'before' } satisfies DropTarget;
}

/** Pointer capture supports mouse, pen and touch; drafts change only on a valid release. */
export function usePointerReorder(
  axis: 'vertical' | 'horizontal',
  onMove: (source: string, target: string, placement: Placement) => void,
) {
  const ref = useRef<HTMLDivElement>(null);
  const session = useRef<Session | null>(null);
  const frame = useRef(0);
  const [drag, setDrag] = useState<ReorderDrag | null>(null);
  const release = useCallback(() => {
    const current = session.current;
    session.current = null;
    cancelAnimationFrame(frame.current);
    frame.current = 0;
    if (current?.handle.hasPointerCapture(current.pointerId))
      current.handle.releasePointerCapture(current.pointerId);
  }, []);
  const cancel = useCallback(() => {
    release();
    setDrag(null);
  }, [release]);

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && session.current) {
        event.preventDefault();
        event.stopPropagation();
        cancel();
      }
    };
    window.addEventListener('keydown', key);
    window.addEventListener('blur', cancel);
    return () => {
      window.removeEventListener('keydown', key);
      window.removeEventListener('blur', cancel);
      release();
    };
  }, [cancel, release]);

  const publish = (current: Session) =>
    setDrag({
      id: current.id,
      label: current.label,
      x: current.x,
      y: current.y,
      target: targetAt(ref.current, current, axis),
    });
  const scroll = () => {
    const current = session.current;
    if (!current?.active) {
      frame.current = 0;
      return;
    }
    const edge = 72;
    const delta =
      current.y < edge
        ? -Math.min(16, (edge - current.y) / 4)
        : current.y > innerHeight - edge
          ? Math.min(16, (current.y - innerHeight + edge) / 4)
          : 0;
    if (delta) {
      const previous = scrollY;
      window.scrollBy({ top: delta, behavior: 'instant' });
      if (scrollY !== previous) publish(current);
    }
    frame.current = requestAnimationFrame(scroll);
  };
  const finish = (event: PointerEvent<HTMLButtonElement>) => {
    const current = session.current;
    if (!current || event.pointerId !== current.pointerId) return;
    current.x = event.clientX;
    current.y = event.clientY;
    const target = current.active ? targetAt(ref.current, current, axis) : null;
    release();
    setDrag(null);
    if (target) onMove(current.id, target.id, target.placement);
  };

  return {
    ref,
    drag,
    item: (id: string) => ({
      'data-reorder-id': id,
      'data-reorder-axis': axis,
      'data-dragging': drag?.id === id,
      'data-drop-position': drag?.target?.id === id ? drag.target.placement : undefined,
    }),
    handleProps: {
      onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
        if (!event.isPrimary || event.button !== 0 || session.current) return;
        const id = event.currentTarget.closest<HTMLElement>('[data-reorder-id]')?.dataset.reorderId;
        if (!id) return;
        const label = event.currentTarget.dataset.reorderLabel ?? id;
        event.preventDefault();
        event.currentTarget.focus({ preventScroll: true });
        event.currentTarget.setPointerCapture(event.pointerId);
        session.current = {
          id,
          label,
          pointerId: event.pointerId,
          handle: event.currentTarget,
          startX: event.clientX,
          startY: event.clientY,
          x: event.clientX,
          y: event.clientY,
          active: false,
        };
      },
      onPointerMove: (event: PointerEvent<HTMLButtonElement>) => {
        const current = session.current;
        if (!current || current.pointerId !== event.pointerId) return;
        current.x = event.clientX;
        current.y = event.clientY;
        if (
          !current.active &&
          Math.hypot(current.x - current.startX, current.y - current.startY) < 6
        )
          return;
        current.active = true;
        event.preventDefault();
        publish(current);
        if (!frame.current) frame.current = requestAnimationFrame(scroll);
      },
      onPointerUp: finish,
      onPointerCancel: cancel,
      onLostPointerCapture: () => {
        if (session.current) cancel();
      },
      onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => {
        const offset = ['ArrowUp', 'ArrowLeft'].includes(event.key)
          ? -1
          : ['ArrowDown', 'ArrowRight'].includes(event.key)
            ? 1
            : 0;
        if (!offset || session.current) return;
        event.preventDefault();
        const id = event.currentTarget.closest<HTMLElement>('[data-reorder-id]')?.dataset.reorderId;
        if (!id) return;
        const ids = [
          ...(ref.current?.querySelectorAll<HTMLElement>('[data-reorder-id]') ?? []),
        ].map((node) => node.dataset.reorderId!);
        const target = ids[ids.indexOf(id) + offset];
        if (target) onMove(id, target, offset < 0 ? 'before' : 'after');
      },
    },
  };
}
