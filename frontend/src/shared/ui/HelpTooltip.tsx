import { createPortal } from 'react-dom';
import { useAnchoredPanel } from '../hooks/useAnchoredPanel';
import { useHoverTooltip } from '../hooks/useHoverTooltip';
import styles from './HelpTooltip.module.css';
import { Icon } from './Icon';

type PanelProps = NonNullable<ReturnType<typeof useHoverTooltip>['tooltipProps']> & {
  text: string;
};

function HelpPanel({ anchor, panel, id, text, ...events }: PanelProps) {
  useAnchoredPanel(panel, anchor);
  return createPortal(
    <div {...events} ref={panel} id={id} role="tooltip" className={styles.tooltip}>
      {text}
    </div>,
    anchor.closest('.modal') ?? document.body,
  );
}

/** Conventional, compact help for data-heavy interfaces; callers supply localized plain text.
 * Reuse hover/focus/touch disclosure and dismissal without the public site's pixel-art shell.
 * Shared anchored positioning keeps the portal within the viewport and outside table clipping.
 * @author ZhengLee 2026.10.16
 */
export function HelpTooltip({ label, text }: { label: string; text: string }) {
  const { triggerProps, tooltipProps, show } = useHoverTooltip();
  return (
    <>
      <button
        {...triggerProps}
        type="button"
        className={styles.trigger}
        aria-label={label}
        onClick={show}
      >
        <Icon name="questionCircle" />
      </button>
      {tooltipProps && <HelpPanel {...tooltipProps} text={text} />}
    </>
  );
}
