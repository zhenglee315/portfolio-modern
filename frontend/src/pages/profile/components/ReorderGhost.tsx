import { createPortal } from 'react-dom';
import { useLayoutEffect, useRef } from 'react';
import type { ReorderDrag } from '../model/usePointerReorder';
import styles from '../ProfilePage.module.css';

/** Lift the complete card at its original grab point; its inert snapshot cannot intercept input. */
export function ReorderGhost({ drag }: { drag: ReorderDrag | null }) {
  const surface = useRef<HTMLDivElement>(null);
  const preview = drag?.preview;
  useLayoutEffect(() => {
    if (!preview || !surface.current) return;
    const snapshot = preview.cloneNode(true) as HTMLElement;
    // A decorative snapshot never duplicates document IDs or participates in the accessibility tree.
    snapshot.removeAttribute('id');
    snapshot.querySelectorAll('[id]').forEach((node) => node.removeAttribute('id'));
    surface.current.replaceChildren(snapshot);
  }, [preview]);
  if (!drag) return null;
  return createPortal(
    <div className={styles.reorderLayer} aria-hidden="true" inert>
      <div
        className={styles.reorderGhost}
        data-reorder-ghost
        data-delete-target={drag.overDelete || undefined}
        style={{
          width: drag.width,
          height: drag.height,
          transform: `translate3d(${drag.x - drag.offsetX}px, ${drag.y - drag.offsetY}px, 0)`,
        }}
        ref={surface}
      />
    </div>,
    document.body,
  );
}
