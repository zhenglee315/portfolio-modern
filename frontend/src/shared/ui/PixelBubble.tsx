import type { HTMLAttributes, ReactNode, Ref } from 'react';
import { Icon } from './Icon';
import styles from './PixelBubble.module.css';

type Props = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  closeLabel: string;
  onClose: () => void;
  ref?: Ref<HTMLDivElement>;
};

/** Reuse the legacy stepped shell for map information and contact introductions.
 * Positioning, content and interaction lifecycles remain with the owning feature.
 */
export function PixelBubble({
  children,
  closeLabel,
  onClose,
  ref,
  className = '',
  ...props
}: Props) {
  return (
    <div {...props} ref={ref} className={`${styles.bubble} ${className}`}>
      <div className={styles.shell}>
        <div className={styles.content}>{children}</div>
        <button type="button" className={styles.close} aria-label={closeLabel} onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>
      <span className={styles.tail} aria-hidden="true" />
    </div>
  );
}
