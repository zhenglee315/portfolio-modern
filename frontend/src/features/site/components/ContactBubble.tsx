import { useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import mascot from '@/assets/icons/cow-engineer.svg?url';
import { mobileQuery, useMediaQuery } from '@/shared/hooks/useMediaQuery';
import { useAnchoredPanel } from '@/shared/hooks/useAnchoredPanel';
import { PixelBubble } from '@/shared/ui/PixelBubble';
import { Icon } from '@/shared/ui/Icon';
import type { Site } from '../schemas/site';
import { emailUrl } from '../model/profile';
import { contactTiming } from '../model/contact';
import type { ContactDisclosure } from '../hooks/useContactDisclosure';
import styles from './ContactBubble.module.css';

const trustedIcons = new Set([
  'src/assets/icons/cow-engineer.svg',
  'assets/icons/cow-engineer.svg',
  'assets/cow-engineer.svg',
  'cow-engineer.svg',
]);

/** Lazy contact introduction, never a chat transport; email survives optional image failure. */
export default function ContactBubble({
  site,
  disclosure,
  protectedControls,
}: {
  site: Site;
  disclosure: ContactDisclosure;
  protectedControls?: RefObject<HTMLElement | null>;
}) {
  const { t } = useTranslation();
  const mobile = useMediaQuery(mobileQuery);
  const present = disclosure.present;
  const root = useRef<HTMLDivElement>(null);
  const [imageFailed, setImageFailed] = useState(false);
  /** Anchor the mobile shell to its header; reserve interior space for overlapping profile controls. */
  const protectedTop = useMemo(() => {
    if (!mobile) return undefined;
    const header = { current: disclosure.anchor?.closest('header') ?? null };
    return protectedControls ? [header, protectedControls] : [header];
  }, [mobile, disclosure.anchor, protectedControls]);
  useAnchoredPanel(
    root,
    disclosure.anchor,
    undefined,
    undefined,
    mobile ? 'below-header' : 'side',
    protectedTop,
  );
  // Begin the finite disclosure lifecycle only after its lazy content has actually mounted.
  useEffect(() => present(), [present]);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !root.current?.contains(event.target) &&
        !disclosure.anchor?.contains(event.target)
      )
        disclosure.close(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        const active = document.activeElement;
        const otherPanel = active?.closest('.dropdown-menu, .modal, .offcanvas');
        disclosure.close(!otherPanel || !!root.current?.contains(active));
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [disclosure]);
  const email = emailUrl(site.social.email);
  // Backend line breaks describe separate paragraphs; render plain text with the original spacing.
  const paragraphs = site.chatme.content
    .split(/\r?\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  return (
    <PixelBubble
      ref={root}
      id="contact-introduction"
      role="dialog"
      aria-label={site.chatme.title}
      data-contact-bubble
      data-appearing={disclosure.state.appearing}
      data-fading={disclosure.state.fading}
      style={{ '--contact-fade-duration': `${contactTiming.fadeMs}ms` } as CSSProperties}
      className={styles.bubble}
      closeLabel={t('ui.closeChatme')}
      onClose={() => disclosure.close()}
      onPointerEnter={(event) => event.pointerType !== 'touch' && disclosure.hover(true)}
      onPointerLeave={(event) => event.pointerType !== 'touch' && disclosure.hover(false)}
    >
      <div className={styles.content} data-contact-content>
        <div>
          <p className={styles.eyebrow}>{site.chatme.titleSub}</p>
          <h2>{site.chatme.title}</h2>
          {paragraphs.map((paragraph, index) => (
            <p key={index} className="plain-text">
              {paragraph}
            </p>
          ))}
          {email && (
            <a href={email}>
              {t('ui.letsTalk')} <Icon name="arrow" />
            </a>
          )}
        </div>
        {!imageFailed && trustedIcons.has(site.chatme.icon) && (
          <img
            src={mascot}
            alt={t('ui.mascot')}
            width="104"
            height="104"
            loading="lazy"
            onError={() => setImageFailed(true)}
          />
        )}
      </div>
    </PixelBubble>
  );
}
