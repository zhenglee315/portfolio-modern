import { createPortal } from 'react-dom';
import type { ReorderDrag } from '../model/usePointerReorder';
import { Icon } from './ProfileIcon';
import styles from '../ProfilePage.module.css';

/** A non-interactive overlay follows the pointer without covering drop targets or shifting layout. */
export function ReorderGhost({ drag }: { drag: ReorderDrag | null }) {
  if (!drag) return null;
  return createPortal(
    <div
      className={styles.reorderGhost}
      aria-hidden="true"
      data-reorder-ghost
      style={{
        left: `clamp(12px, ${drag.x + 14}px, calc(100vw - 252px))`,
        top: `clamp(12px, ${drag.y + 14}px, calc(100dvh - 64px))`,
      }}
    >
      <Icon name="grip" />
      <span>{drag.label}</span>
    </div>,
    document.body,
  );
}
