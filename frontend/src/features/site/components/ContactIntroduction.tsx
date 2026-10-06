import { lazy, Suspense, useEffect, type CSSProperties, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { SectionBoundary } from '@/shared/ui/SectionBoundary';
import { SectionState } from '@/shared/ui/SectionState';
import type { Site } from '../schemas/site';
import type { ContactDisclosure } from '../hooks/useContactDisclosure';
import { emailUrl } from '../model/profile';
import { contactTiming } from '../model/contact';
import styles from './ContactIntroduction.module.css';

const ContactBubble = lazy(() => import('./ContactBubble'));

/** Keep basic contact usable while loading; start its idle policy after a terminal chunk failure. */
function ContactFallback({
  site,
  disclosure,
  failed,
}: {
  site: Site;
  disclosure: ContactDisclosure;
  failed: boolean;
}) {
  const { t } = useTranslation();
  const email = emailUrl(site.social.email);
  const present = disclosure.present;
  useEffect(() => {
    if (failed) present(false);
  }, [failed, present]);
  return (
    <div
      className={styles.fallback}
      role="dialog"
      aria-label={site.chatme.title}
      data-contact-fallback={failed ? 'failed' : 'loading'}
      data-fading={disclosure.state.fading}
      style={{ '--contact-fade-duration': `${contactTiming.fadeMs}ms` } as CSSProperties}
      onPointerEnter={(event) => event.pointerType !== 'touch' && disclosure.hover(true)}
      onPointerLeave={(event) => event.pointerType !== 'touch' && disclosure.hover(false)}
    >
      <SectionState message={t(failed ? 'ui.unavailable' : 'ui.loading')} busy={!failed}>
        {email && <a href={email}>{t('ui.letsTalk')}</a>}
        {failed && (
          <button type="button" className="text-link" onClick={() => window.location.reload()}>
            {t('ui.reloadPage')}
          </button>
        )}
        <button type="button" className="text-link" onClick={() => disclosure.close()}>
          {t('ui.close')}
        </button>
      </SectionState>
    </div>
  );
}

/** Load the introduction and mascot only when open; retain basic contact on chunk failure. */
export function ContactIntroduction({
  site,
  disclosure,
  protectedControls,
}: {
  site?: Site;
  disclosure: ContactDisclosure;
  protectedControls?: RefObject<HTMLElement | null>;
}) {
  const { t } = useTranslation();
  if (!site || !disclosure.state.open || typeof document === 'undefined') return null;
  return createPortal(
    <SectionBoundary
      silent
      resetKey="contact"
      message={t('ui.unavailable')}
      retryLabel={t('ui.reloadPage')}
      reloadOnRetry
      fallback={<ContactFallback site={site} disclosure={disclosure} failed />}
    >
      <Suspense fallback={<ContactFallback site={site} disclosure={disclosure} failed={false} />}>
        <ContactBubble site={site} disclosure={disclosure} protectedControls={protectedControls} />
      </Suspense>
    </SectionBoundary>,
    document.body,
  );
}
