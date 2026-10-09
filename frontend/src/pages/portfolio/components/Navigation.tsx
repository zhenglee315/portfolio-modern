import {
  useEffect,
  useId,
  useRef,
  useState,
  type MouseEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import Offcanvas from 'react-bootstrap/Offcanvas';
import { useTranslation } from 'react-i18next';
import { Brand, fullName, type Site } from '@/features/site';
import { Icon } from '@/shared/ui/Icon';
import { mobileQuery, useMediaQuery } from '@/shared/hooks/useMediaQuery';
import { useAnchoredPanel } from '@/shared/hooks/useAnchoredPanel';
import { cycleDialogTab } from '@/shared/lib/focus';
import { sections } from '../model/navigation';
import styles from './Navigation.module.css';
import { LoginEntry } from './LoginEntry';

type Props = {
  site?: Site;
  active: string;
  compact: boolean;
  onCompact: () => void;
  onNavigate: (id: string) => void;
  endpoints?: string;
  onContact?: (event: MouseEvent<HTMLButtonElement>) => void;
  contactOpen?: boolean;
  onOpen?: () => void;
  /** Open the page-owned sign-in surface after closing the mobile drawer. */
  onLogin?: () => void;
};

/** Share configured links and one viewport-clamped tooltip across rail states.
 * Compact tooltips live outside the scrollable rail and never replace link labels.
 */
function NavLinks({
  active,
  compact,
  onNavigate,
}: Pick<Props, 'active' | 'compact' | 'onNavigate'>) {
  const { t } = useTranslation();
  const tooltipId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<{ anchor: HTMLAnchorElement; label: string } | null>(null);
  const anchor = compact ? (tooltip?.anchor ?? null) : null;
  useAnchoredPanel(panel, anchor, undefined, undefined, 'side');
  useEffect(() => {
    if (!compact) {
      // Clearing after this commit avoids reviving a stale label on the next collapse.
      const frame = requestAnimationFrame(() => setTooltip(null));
      return () => cancelAnimationFrame(frame);
    }
  }, [compact]);
  useEffect(() => {
    if (!anchor) return;
    const rail = anchor.closest('aside');
    /** Dismiss only this optional description; keyboard focus remains on the owning link. */
    const hide = () => setTooltip(null);
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      hide();
    };
    document.addEventListener('keydown', escape, true);
    window.addEventListener('blur', hide);
    window.addEventListener('resize', hide);
    rail?.addEventListener('scroll', hide, { passive: true });
    return () => {
      document.removeEventListener('keydown', escape, true);
      window.removeEventListener('blur', hide);
      window.removeEventListener('resize', hide);
      rail?.removeEventListener('scroll', hide);
    };
  }, [anchor]);
  return (
    <>
      <nav className={styles.links} aria-label={t('ui.navigation')}>
        {sections.map((section, i) => (
          <a
            href={`#${section.id}`}
            key={section.id}
            className={active === section.id ? styles.active : ''}
            aria-current={active === section.id ? 'location' : undefined}
            aria-label={t(section.label)}
            aria-describedby={
              anchor && tooltip?.anchor.dataset.section === section.id ? tooltipId : undefined
            }
            data-section={section.id}
            onPointerEnter={(event) => {
              if (compact && event.pointerType !== 'touch')
                setTooltip({ anchor: event.currentTarget, label: section.label });
            }}
            onPointerLeave={(event) => {
              if (!event.currentTarget.matches(':focus-visible')) setTooltip(null);
            }}
            onFocus={(event) => {
              if (compact) setTooltip({ anchor: event.currentTarget, label: section.label });
            }}
            onBlur={() => setTooltip(null)}
            onClick={(event) => {
              if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
                return;
              event.preventDefault();
              setTooltip(null);
              onNavigate(section.id);
            }}
          >
            <Icon name={section.icon} />
            <span className={styles.label} data-nav-label>
              {t(section.label)}
            </span>
            <small>{String(i + 1).padStart(2, '0')}</small>
          </a>
        ))}
      </nav>
      {anchor &&
        tooltip &&
        createPortal(
          <div ref={panel} id={tooltipId} className={styles.tooltip} role="tooltip">
            {t(tooltip.label)}
          </div>,
          document.body,
        )}
    </>
  );
}

/** Supply responsive navigation with focus-managed Bootstrap drawer and desktop collapse.
 * The single 760px media contract matches CSS; the drawer restores its trigger focus.
 */
export function Navigation({
  site,
  active,
  compact,
  onCompact,
  onNavigate,
  endpoints,
  onContact,
  contactOpen,
  onOpen,
  onLogin,
}: Props) {
  const { t } = useTranslation();
  const mobile = useMediaQuery(mobileQuery);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!mobile) {
      const frame = requestAnimationFrame(() => setOpen(false));
      return () => cancelAnimationFrame(frame);
    }
  }, [mobile]);
  const homeLabel = site
    ? t('ui.home', { name: fullName(site.profile), nickName: site.profile.nickName })
    : t('ui.overview');
  const contact = onContact && (
    <button
      className={styles.contact}
      type="button"
      aria-label={t(contactOpen ? 'ui.hideChatme' : 'ui.showChatme')}
      aria-expanded={contactOpen}
      aria-controls="contact-introduction"
      data-contact-trigger
      onClick={onContact}
    >
      <Icon name="chat" pulse="chat" />
    </button>
  );
  const move = (id: string) => {
    setOpen(false);
    onNavigate(id);
  };
  const foot = (
    <div className={styles.foot} data-nav-footer>
      <div className={styles.footCopy}>
        <p className="mono">{endpoints}</p>
        <p>
          {t('ui.sidebarLine1')}
          <br />
          {t('ui.sidebarLine2')}
        </p>
      </div>
      <div className={styles.footerRow}>
        {site && (
          <small className={styles.copyright}>
            © {site.brand.copyrightYear} {fullName(site.profile)}
          </small>
        )}
        <LoginEntry
          onLogin={
            onLogin
              ? () => {
                  setOpen(false);
                  onLogin();
                }
              : undefined
          }
        />
      </div>
    </div>
  );
  return (
    <>
      <aside
        className={`${styles.sidebar} ${compact ? styles.compact : ''}`}
        data-entrance-navigation
      >
        <button
          type="button"
          className={styles.collapse}
          aria-label={t(compact ? 'ui.expandSidebar' : 'ui.collapseSidebar')}
          aria-expanded={!compact}
          onClick={onCompact}
        >
          <Icon name="collapse" />
        </button>
        <div className={styles.brand}>
          <span inert={compact} data-nav-brand>
            <Brand site={site} onHome={() => move('overview')} label={homeLabel} />
          </span>
          {contact}
        </div>
        <NavLinks active={active} compact={compact && !mobile} onNavigate={move} />
        {foot}
      </aside>
      <header className={styles.mobile} data-entrance-navigation>
        <Brand site={site} onHome={() => move('overview')} label={homeLabel} />
        {contact}
        <button
          type="button"
          className="icon-button"
          aria-label={t(open && mobile ? 'ui.closeNav' : 'ui.openNav')}
          aria-expanded={open && mobile}
          aria-controls="mobile-navigation"
          onClick={() => {
            if (!open) onOpen?.();
            setOpen((value) => !value);
          }}
        >
          <Icon name={open && mobile ? 'close' : 'list'} />
        </button>
      </header>
      <Offcanvas
        id="mobile-navigation"
        show={mobile && open}
        onHide={() => setOpen(false)}
        className={styles.drawer}
        backdropClassName={styles.drawerBackdrop}
        placement="start"
        aria-label={t('ui.navigation')}
        onKeyDown={(event: ReactKeyboardEvent<HTMLDivElement>) =>
          cycleDialogTab(event, event.currentTarget)
        }
      >
        <Offcanvas.Header>
          <Offcanvas.Title className="visually-hidden">{t('ui.navigation')}</Offcanvas.Title>
          <button
            type="button"
            className={`icon-button ${styles.drawerClose}`}
            aria-label={t('ui.closeNav')}
            onClick={() => setOpen(false)}
          >
            <Icon name="close" />
          </button>
        </Offcanvas.Header>
        <Offcanvas.Body>
          <NavLinks active={active} compact={false} onNavigate={move} />
          {foot}
        </Offcanvas.Body>
      </Offcanvas>
    </>
  );
}
