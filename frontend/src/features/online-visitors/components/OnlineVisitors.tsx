import { useTranslation } from 'react-i18next';
import { Icon, IconGroup } from '@/shared/ui/Icon';
import { PixelTooltip } from '@/shared/ui/PixelTooltip';
import { useHoverTooltip } from '@/shared/hooks/useHoverTooltip';
import type { OnlineVisitors as OnlineVisitorsData } from '../schemas/online-visitors';
import styles from './OnlineVisitors.module.css';

/** Present a compact silhouette/count in the profile's social toolbar.
 * Requests remain with the composing page; shared tooltip behavior owns disclosure.
 * Failed refreshes preserve the count and describe it as stale in accessible and visible copy.
 */
export function OnlineVisitors({ data, failed }: { data?: OnlineVisitorsData; failed: boolean }) {
  const { t } = useTranslation();
  const tooltip = useHoverTooltip();
  const label = data
    ? t(failed ? 'ui.onlineVisitorsStale' : 'ui.onlineVisitors', { count: data.online })
    : t(failed ? 'ui.onlineVisitorsUnavailable' : 'ui.onlineVisitorsLoading');
  const text = data && !failed ? t('ui.onlineVisitorsNow', { count: data.online }) : label;

  return (
    <>
      <button
        {...tooltip.triggerProps}
        type="button"
        className={styles.indicator}
        aria-label={label}
        data-online-visitors
        onClick={tooltip.show}
      >
        <IconGroup className={styles.content} pulse="chat">
          <Icon name="personHearts" />
          <span className={styles.count} data-online-count>
            {data?.online ?? '—'}
          </span>
        </IconGroup>
      </button>
      {tooltip.tooltipProps && (
        <PixelTooltip
          {...tooltip.tooltipProps}
          text={text}
          placement="side-left"
          data-online-tooltip
        />
      )}
    </>
  );
}
