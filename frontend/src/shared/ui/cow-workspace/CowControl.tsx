import { useHoverTooltip } from '@/shared/hooks/useHoverTooltip';
import { Icon, type IconName } from '@/shared/ui/Icon';
import { PixelTooltip } from '@/shared/ui/PixelTooltip';
import styles from './CowControl.module.css';

/** Share circular cow controls and pixel tips; clicking closes the tip before its action. */
export function CowControl({
  icon,
  label,
  text,
  pressed,
  onClick,
}: {
  icon: IconName;
  label: string;
  text: string;
  pressed?: boolean;
  onClick: () => void;
}) {
  const tooltip = useHoverTooltip();
  return (
    <>
      <button
        {...tooltip.triggerProps}
        type="button"
        className={`icon-button ${styles.control}`}
        aria-label={label}
        aria-pressed={pressed}
        onClick={() => {
          tooltip.close();
          onClick();
        }}
      >
        <Icon name={icon} />
      </button>
      {tooltip.tooltipProps && (
        <PixelTooltip {...tooltip.tooltipProps} text={text} placement="above" />
      )}
    </>
  );
}
