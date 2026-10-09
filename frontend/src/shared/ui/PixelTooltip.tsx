import type { HTMLAttributes, RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useAnchoredPanel } from '@/shared/hooks/useAnchoredPanel';
import { PixelBubble } from './PixelBubble';
import styles from './PixelTooltip.module.css';

type Props = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  anchor: HTMLButtonElement;
  panel: RefObject<HTMLDivElement | null>;
  text: string;
  placement?: Parameters<typeof useAnchoredPanel>[4];
};

/**
 * Portal a caller-owned tooltip to the body using shared pixel geometry and viewport placement.
 * The caller mounts it only while open and supplies its text and anchor.
 * useAnchoredPanel owns positioning subscriptions and cleanup.
 */
export function PixelTooltip({ anchor, panel, text, placement, className = '', ...props }: Props) {
  useAnchoredPanel(panel, anchor, undefined, undefined, placement);
  return createPortal(
    <PixelBubble {...props} ref={panel} role="tooltip" className={`${styles.tooltip} ${className}`}>
      {text}
    </PixelBubble>,
    document.body,
  );
}
