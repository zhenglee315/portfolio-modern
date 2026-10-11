import { useTranslation } from 'react-i18next';
import { useHoverTooltip } from '@/shared/hooks/useHoverTooltip';
import { mobileQuery, useMediaQuery } from '@/shared/hooks/useMediaQuery';
import { Icon } from '@/shared/ui/Icon';
import { PixelTooltip } from '@/shared/ui/PixelTooltip';
import styles from './Navigation.module.css';

/**
 * Anchor each responsive account action to its localized tooltip.
 * The page owns session state and the shared pending action across desktop and mobile entries.
 */
export function LoginEntry({
  signedIn = false,
  busy = false,
  onLogin,
  onLogout,
}: {
  signedIn?: boolean;
  busy?: boolean;
  onLogin?: () => void;
  onLogout?: () => void;
}) {
  const { t } = useTranslation();
  const mobile = useMediaQuery(mobileQuery);
  const tooltip = useHoverTooltip();
  const action = signedIn ? onLogout : onLogin;
  return (
    <>
      <button
        {...tooltip.triggerProps}
        className={styles.login}
        type="button"
        aria-label={t(signedIn ? 'ui.signOut' : 'ui.signIn')}
        aria-disabled={busy || !action || undefined}
        aria-busy={busy || undefined}
        disabled={busy}
        data-login-trigger
        data-auth-action={signedIn ? 'sign-out' : 'sign-in'}
        onClick={() => {
          if (busy) return;
          if (action) {
            tooltip.close();
            action();
          } else tooltip.show();
        }}
      >
        <Icon name={signedIn ? 'boxArrowRight' : 'doorOpen'} highlight={!busy} />
      </button>
      {tooltip.tooltipProps && (
        <PixelTooltip
          {...tooltip.tooltipProps}
          text={t(signedIn ? 'ui.signOut' : 'ui.adminSignIn')}
          placement={mobile ? 'above' : 'side'}
          data-login-tooltip
        />
      )}
    </>
  );
}
