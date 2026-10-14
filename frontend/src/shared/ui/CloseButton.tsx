import type { Ref } from 'react';
import { Icon } from './Icon';

/**
 * Dismiss an owning dialog with one translated accessible label and a 44px hit target.
 * The owner handles confirmation, focus restoration and dismissal; this control owns no state.
 * A native button preserves Enter/Space and disabled behavior. The ref exposes that same button
 * for iframe focus handoff; className is a placement slot, not a replacement for shared styling.
 * CloseButton.css is loaded once by the app root so lazy routes share one stylesheet.
 */
export function CloseButton({
  label,
  onClose,
  className = '',
  disabled = false,
  ref,
}: {
  label: string;
  onClose: () => void;
  className?: string;
  disabled?: boolean;
  ref?: Ref<HTMLButtonElement>;
}) {
  return (
    <button
      ref={ref}
      type="button"
      className={`shared-close-button ${className}`}
      aria-label={label}
      onClick={onClose}
      disabled={disabled}
    >
      <Icon name="close" />
    </button>
  );
}
