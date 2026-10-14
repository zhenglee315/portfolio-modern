import { useEffect, useState, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Brand, fullName, type Site } from '@/features/site';
import { Icon } from '@/shared/ui/Icon';
import { mobileQuery, useMediaQuery } from '@/shared/hooks/useMediaQuery';
import { SidebarRail, SidebarLinks, SidebarDrawer } from '@/shared/ui/SidebarNavigation';
import { sections } from '../model/navigation';
import styles from './Navigation.module.css';

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
};

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
  const items = sections.map((section, index) => ({
    id: section.id,
    label: t(section.label),
    icon: section.icon,
    href: `#${section.id}`,
    current: 'location' as const,
    ordinal: String(index + 1).padStart(2, '0'),
    onSelect: () => move(section.id),
  }));
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
      </div>
    </div>
  );
  return (
    <>
      <SidebarRail
        compact={compact}
        onCompact={onCompact}
        collapseLabel={t('ui.collapseSidebar')}
        expandLabel={t('ui.expandSidebar')}
        brand={<Brand site={site} onHome={() => move('overview')} label={homeLabel} />}
        trailing={contact}
        footer={foot}
      >
        <SidebarLinks
          items={items}
          label={t('ui.navigation')}
          active={active}
          compact={compact && !mobile}
        />
      </SidebarRail>
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
      <SidebarDrawer
        id="mobile-navigation"
        open={mobile && open}
        onClose={() => setOpen(false)}
        label={t('ui.navigation')}
        closeLabel={t('ui.closeNav')}
        headerOffset={64}
        footer={foot}
      >
        <SidebarLinks items={items} label={t('ui.navigation')} active={active} />
      </SidebarDrawer>
    </>
  );
}
