import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';
import {
  reorderLayout,
  reorderFlowLayout,
  type ReorderTarget,
  type ReorderRect,
  type ReorderFlow,
} from './reorder-layout';

export type ReorderDrag = {
  id: string;
  label: string;
  x: number;
  y: number;
  target: ReorderTarget | null;
  overDelete: boolean;
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
  preview: HTMLElement;
  positions: Record<string, { x: number; y: number }> | null;
  listHeight: number;
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
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
  preview: HTMLElement;
  items: ReorderRect[];
  scrollX: number;
  scrollY: number;
  columns: number;
  gap: number;
  flow: ReorderFlow;
  directionY: number;
};

/** Resolve insertion edges inside this list only, including gaps between wrapped skill chips. */
function targetAt(list: HTMLDivElement | null, session: Session, axis: 'vertical' | 'horizontal') {
  if (!list) return null;
  const { x, y } = session;
  const bounds = list.getBoundingClientRect();
  if (x < bounds.left || x > bounds.right || y < bounds.top || y > bounds.bottom) return null;
  // Hit-test the original slots; animated neighboring cards must not bounce the target back and forth.
  const nearest = session.items
    .map((item) => {
      const rect = {
        ...item,
        left: item.left - (scrollX - session.scrollX),
        right: item.left + item.width - (scrollX - session.scrollX),
        top: item.top - (scrollY - session.scrollY),
        bottom: item.top + item.height - (scrollY - session.scrollY),
      };
      const dx = Math.max(rect.left - x, 0, x - rect.right);
      const dy = Math.max(rect.top - y, 0, y - rect.bottom);
      return { id: item.id, rect, distance: dx * dx + dy * dy };
    })
    .sort((a, b) => a.distance - b.distance)[0];
  if (!nearest || nearest.id === session.id) return null;
  const after =
    axis === 'vertical'
      ? y >= nearest.rect.top + nearest.rect.height / 2
      : x >= nearest.rect.left + nearest.rect.width / 2;
  return { id: nearest.id, placement: after ? 'after' : 'before' } satisfies ReorderTarget;
}

/** Pointer capture supports mouse, pen and touch; drafts change only on a valid release. */
export function usePointerReorder(
  axis: 'vertical' | 'horizontal',
  onMove: (source: string, target: string, placement: 'before' | 'after') => void,
  keyboardOrder?: readonly string[],
  deletion?: { onDrop: (id: string) => void; disabled?: boolean },
) {
  const ref = useRef<HTMLDivElement>(null);
  const deleteRef = useRef<HTMLButtonElement>(null);
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
    window.addEventListener('resize', cancel);
    return () => {
      window.removeEventListener('keydown', key);
      window.removeEventListener('blur', cancel);
      window.removeEventListener('resize', cancel);
      release();
    };
  }, [cancel, release]);

  const overDelete = (current: Session) => {
    if (!deletion || deletion.disabled || !deleteRef.current) return false;
    const target = deleteRef.current.getBoundingClientRect();
    const left = current.x - current.offsetX;
    const top = current.y - current.offsetY;
    // The full lifted card touches the visible target, even when the grip is on the opposite edge.
    return (
      target.width > 0 &&
      target.height > 0 &&
      target.right > 0 &&
      target.left < innerWidth &&
      target.bottom > 0 &&
      target.top < innerHeight &&
      left < target.right &&
      left + current.width > target.left &&
      top < target.bottom &&
      top + current.height > target.top
    );
  };
  const publish = (current: Session) => {
    const deleting = overDelete(current);
    const target = deleting ? null : targetAt(ref.current, current, axis);
    const positions =
      axis === 'vertical'
        ? reorderLayout(current.items, current.id, target, current.columns, current.gap)
        : reorderFlowLayout(current.items, current.id, target, current.flow);
    setDrag({
      id: current.id,
      label: current.label,
      x: current.x,
      y: current.y,
      target,
      overDelete: deleting,
      width: current.width,
      height: current.height,
      offsetX: current.offsetX,
      offsetY: current.offsetY,
      preview: current.preview,
      positions,
      // Wrapped rows can grow or shrink; reserve their actual height so the add field stays below.
      listHeight: Math.max(
        0,
        ...current.items.map(
          (item) => item.top + positions[item.id]!.y + item.height - current.flow.top,
        ),
      ),
    });
  };
  const scroll = () => {
    const current = session.current;
    if (!current?.active) {
      frame.current = 0;
      return;
    }
    const edge = 72;
    const delta = overDelete(current)
      ? 0
      : current.y < edge && current.directionY < 0
        ? -Math.min(16, (edge - current.y) / 4)
        : current.y > innerHeight - edge && current.directionY > 0
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
    // Recheck bounds and permission at release; a previous red highlight never authorizes a drop.
    const deleting = current.active && overDelete(current);
    const target = current.active && !deleting ? targetAt(ref.current, current, axis) : null;
    release();
    setDrag(null);
    if (deleting) deletion?.onDrop(current.id);
    else if (target) onMove(current.id, target.id, target.placement);
  };

  return {
    ref,
    drag,
    deleteTarget: {
      ref: deleteRef,
      active: !!drag && !!deletion && !deletion.disabled,
      over: !!drag?.overDelete && !deletion?.disabled,
    },
    listStyle: drag ? { height: drag.listHeight } : undefined,
    item: (id: string) => ({
      'data-reorder-id': id,
      'data-reorder-axis': axis,
      'data-dragging': drag?.id === id,
      'data-reorder-placeholder': drag?.positions && drag.id === id ? true : undefined,
      'data-drop-position': drag?.target?.id === id ? drag.target.placement : undefined,
      'data-reordering': Boolean(drag?.positions),
      style: drag?.positions?.[id]
        ? {
            transform: `translate3d(${drag.positions[id]!.x}px, ${drag.positions[id]!.y}px, 0)`,
          }
        : undefined,
    }),
    handleProps: {
      onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
        if (!event.isPrimary || event.button !== 0 || session.current) return;
        const source = event.currentTarget.closest<HTMLElement>('[data-reorder-id]');
        const id = source?.dataset.reorderId;
        if (!id || !source || !ref.current) return;
        const bounds = source.getBoundingClientRect();
        const items = [...ref.current.querySelectorAll<HTMLElement>('[data-reorder-id]')].map(
          (node) => {
            const rect = node.getBoundingClientRect();
            return {
              id: node.dataset.reorderId!,
              left: rect.left,
              top: rect.top,
              width: rect.width,
              height: rect.height,
            };
          },
        );
        const label = event.currentTarget.dataset.reorderLabel ?? id;
        const listBounds = ref.current.getBoundingClientRect();
        const listStyle = getComputedStyle(ref.current);
        const preview = source.cloneNode(true) as HTMLElement;
        // An open swipe action closes before sorting; the lifted copy always shows the full face.
        preview.querySelectorAll<HTMLElement>('[data-swipe-surface]').forEach((node) => {
          node.style.transform = 'translateX(0)';
        });
        preview.setAttribute('data-swipe-open', 'false');
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
          width: bounds.width,
          height: bounds.height,
          offsetX: event.clientX - bounds.left,
          offsetY: event.clientY - bounds.top,
          // Clone trusted rendered content once, before dragging hides the source's children.
          preview,
          items,
          scrollX,
          scrollY,
          columns: items.filter((item) => Math.abs(item.top - items[0]!.top) < 1).length,
          gap: Number.parseFloat(listStyle.rowGap) || 0,
          flow: {
            left: listBounds.left,
            top: listBounds.top,
            width: listBounds.width,
            rowGap: Number.parseFloat(listStyle.rowGap) || 0,
            columnGap: Number.parseFloat(listStyle.columnGap) || 0,
          },
          directionY: 0,
        };
      },
      onPointerMove: (event: PointerEvent<HTMLButtonElement>) => {
        const current = session.current;
        if (!current || current.pointerId !== event.pointerId) return;
        // Starting near an edge must not scroll against a gesture moving away from that edge.
        const dy = event.clientY - current.y;
        if (Math.abs(dy) >= 1) current.directionY = Math.sign(dy);
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
        // Paged lists can sort across page boundaries without loading off-page card bodies.
        const ids =
          keyboardOrder ??
          [...(ref.current?.querySelectorAll<HTMLElement>('[data-reorder-id]') ?? [])].map(
            (node) => node.dataset.reorderId!,
          );
        const target = ids[ids.indexOf(id) + offset];
        if (target) onMove(id, target, offset < 0 ? 'before' : 'after');
      },
    },
  };
}
