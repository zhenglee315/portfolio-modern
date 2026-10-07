import type { HTMLAttributes, ReactNode, Ref } from 'react';
import { Icon } from './Icon';
import styles from './PixelBubble.module.css';

type Props = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  ref?: Ref<HTMLDivElement>;
} & ({ closeLabel: string; onClose: () => void } | { closeLabel?: never; onClose?: never });

/** Reuse the stepped shell for map details, contact introductions and passive tooltips.
 * @param props Content and HTML attributes; provide both close props for a dismissible panel.
 * @returns The themed shell and tail, with no interactive control for passive tooltips.
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
        {onClose && (
          <button type="button" className={styles.close} aria-label={closeLabel} onClick={onClose}>
            <Icon name="close" />
          </button>
        )}
      </div>
      <span className={styles.tail} aria-hidden="true" />
    </div>
  );
}
