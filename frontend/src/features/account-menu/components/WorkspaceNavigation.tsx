import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMediaQuery } from '@/shared/hooks/useMediaQuery';
import { Icon, IconGroup } from '@/shared/ui/Icon';
import { SidebarDrawer, SidebarLinks, SidebarRail } from '@/shared/ui/SidebarNavigation';
import { workspaceNavigation } from '../model/workspace';
import styles from './WorkspaceNavigation.module.css';

/** Both private workspaces use the same tablet breakpoint and discard stale drawer state on resize. */
export function useWorkspaceNavigation() {
  const [compact, setCompact] = useState(false);
  const [open, setOpen] = useState(false);
  const tablet = useMediaQuery('(max-width: 1024px)');
  if (open && !tablet) setOpen(false);
  return {
    compact,
    open,
    tablet,
    toggleCompact: () => setCompact((value) => !value),
    openDrawer: () => setOpen(true),
    closeDrawer: () => setOpen(false),
  };
}
type Controls = ReturnType<typeof useWorkspaceNavigation>;

/** Keep one shared rail/drawer and brand; pages provide identity, active route and local section actions. */
export function WorkspaceNavigation({
  controls,
  active,
  disabled = false,
  ...options
}: Omit<Parameters<typeof workspaceNavigation>[0], 't' | 'onClose'> & {
  controls: Controls;
  active: string;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const items = workspaceNavigation({ ...options, t, onClose: controls.closeDrawer });
  const home = [
    {
      id: 'home',
      label: t('management.backHome'),
      icon: 'home' as const,
      to: `/${options.locale}`,
      onSelect: controls.closeDrawer,
    },
  ];
  const links = (compact = false) => (
    <div inert={disabled}>
      <SidebarLinks
        items={items}
        label={t('management.navigation')}
        active={active}
        compact={compact}
      />
    </div>
  );
  return (
    <>
      <SidebarRail
        compact={controls.compact}
        onCompact={controls.toggleCompact}
        collapseLabel={t('management.collapseNavigation')}
        expandLabel={t('management.expandNavigation')}
        drawerAt="tablet"
        brand={
          <IconGroup className={styles.brandText} pulse="chat">
            PORTFOLIO
          </IconGroup>
        }
        brandLink={{ to: `/${options.locale}`, label: t('management.backHome') }}
        leading={
          <span className={styles.brandIcon} aria-hidden>
            <Icon name="dashboard" pulse="chat" />
          </span>
        }
        footer={
          <SidebarLinks
            items={home}
            label={t('management.backHome')}
            compact={controls.compact && !controls.tablet}
          />
        }
      >
        {links(controls.compact && !controls.tablet)}
      </SidebarRail>
      <SidebarDrawer
        id="management-navigation"
        open={controls.open && controls.tablet}
        onClose={controls.closeDrawer}
        label={t('management.workspace')}
        closeLabel={t('management.close')}
        footer={<SidebarLinks items={home} label={t('management.backHome')} />}
      >
        {links()}
      </SidebarDrawer>
    </>
  );
}

/** The page places the same accessible menu trigger beside its breadcrumb, without a second header. */
export function WorkspaceNavigationToggle({
  controls,
  disabled = false,
}: {
  controls: Controls;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <button
      className={`${styles.mobileToggle} icon-button`}
      type="button"
      onClick={controls.openDrawer}
      disabled={disabled}
      aria-label={t('management.openNavigation')}
      aria-controls="management-navigation"
      aria-expanded={controls.open}
    >
      <Icon name="list" />
    </button>
  );
}
