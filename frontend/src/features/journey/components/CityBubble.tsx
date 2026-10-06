import { useEffect, useRef, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import type { Locale } from '@/i18n/config';
import { dateCopy } from '@/i18n/date-copy';
import { periodLabels } from '@/shared/lib/dates';
import { useAnchoredPanel } from '@/shared/hooks/useAnchoredPanel';
import { PixelBubble } from '@/shared/ui/PixelBubble';
import { Icon } from '@/shared/ui/Icon';
import type { JourneyStop } from '../schemas/journey';
import styles from './Journey.module.css';

/** Present stable career detail between the map caption and destination controls.
 * Long copy scrolls within the available shell height instead of covering playback controls.
 */
export function CityBubble({
  entry,
  locale,
  anchor,
  container,
  top,
  bottom,
  id,
  onClose,
}: {
  entry: JourneyStop;
  locale: Locale;
  anchor: Element | null;
  container: RefObject<HTMLDivElement | null>;
  top: RefObject<HTMLDivElement | null>;
  bottom: RefObject<HTMLDivElement | null>;
  id: string;
  onClose: (restore?: boolean) => void;
}) {
  const { t } = useTranslation();
  const root = useRef<HTMLDivElement>(null);
  useAnchoredPanel(root, anchor, container, bottom, 'above', top);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !root.current?.contains(event.target) &&
        !anchor?.contains(event.target)
      )
        onClose();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        onClose(
          !!root.current?.contains(document.activeElement) || anchor === document.activeElement,
        );
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [anchor, onClose]);
  return (
    <PixelBubble
      ref={root}
      className={styles.bubble}
      data-city-bubble
      closeLabel={t('ui.closeCity')}
      onClose={() => onClose(true)}
      onPointerLeave={(event) => {
        if (
          event.pointerType !== 'touch' &&
          !root.current?.contains(document.activeElement) &&
          !(event.relatedTarget instanceof Node && anchor?.contains(event.relatedTarget))
        )
          onClose();
      }}
      onBlur={(event) => {
        if (
          !event.currentTarget.contains(event.relatedTarget) &&
          !(event.relatedTarget instanceof Node && anchor?.contains(event.relatedTarget))
        )
          onClose();
      }}
    >
      <div role="tooltip" id={id} tabIndex={0} className={styles.bubbleContent}>
        <h3>
          {entry.city} <span>/ {entry.countryName}</span>
        </h3>
        <p className={styles.bubbleDate}>{periodLabels(entry, locale, dateCopy(t)).date}</p>
        <strong>
          <Icon
            name={entry.type === 'work' ? 'building' : 'education'}
            label={t(`ui.${entry.type}`)}
          />{' '}
          {entry.organizationName}
        </strong>
        <p>{entry.organizationTitle}</p>
        {entry.detail && (
          <div className={styles.detail}>
            <strong>{entry.detail.content}</strong>
            <p>{periodLabels(entry.detail, locale, dateCopy(t)).date}</p>
          </div>
        )}
      </div>
    </PixelBubble>
  );
}
