import { useTranslation } from 'react-i18next';
import { useHoverTooltip } from '@/shared/hooks/useHoverTooltip';
import { mobileQuery, useMediaQuery } from '@/shared/hooks/useMediaQuery';
import { Icon } from '@/shared/ui/Icon';
import { PixelTooltip } from '@/shared/ui/PixelTooltip';
import styles from './Navigation.module.css';

/**
 * Anchor each responsive sign-in entry to its localized tooltip.
 * onLogin delegates navigation to the page after closing the tip; absent it, clicks show the tip.
 */
export function LoginEntry({ onLogin }: { onLogin?: () => void }) {
  const { t } = useTranslation();
  const mobile = useMediaQuery(mobileQuery);
  const tooltip = useHoverTooltip();
  return (
    <>
      <button
        {...tooltip.triggerProps}
        className={styles.login}
        type="button"
        aria-label={t('ui.signIn')}
        aria-disabled={!onLogin || undefined}
        data-login-trigger
        onClick={() => {
          if (onLogin) {
            tooltip.close();
            onLogin();
          } else tooltip.show();
        }}
      >
        <Icon name="doorOpen" highlight />
      </button>
      {tooltip.tooltipProps && (
        <PixelTooltip
          {...tooltip.tooltipProps}
          text={t('ui.adminSignIn')}
          placement={mobile ? 'above' : 'side'}
          data-login-tooltip
        />
      )}
    </>
  );
}
