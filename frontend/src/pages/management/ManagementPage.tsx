import { useRef, useState } from 'react';
import { useLocation, useNavigate, useNavigation } from 'react-router';
import { useTranslation } from 'react-i18next';
import type { Locale } from '@/i18n/config';
import { AccountMenu, managementNavigation } from '@/features/account-menu';
import { AppearanceSettings, useAppearance } from '@/features/appearance';
import { LanguageOptions } from '@/features/language';
import { useAccountSession, useAccessDeniedRedirect } from '@/features/auth/actions';
import { canManage } from '@/features/auth/permissions';
import type { ManagementResource } from '@/features/management';
import { Icon } from '@/shared/ui/Icon';
import { SidebarRail, SidebarLinks, SidebarDrawer } from '@/shared/ui/SidebarNavigation';
import { Breadcrumb } from '@/shared/ui/Breadcrumb';
import { LoadingIndicator } from '@/shared/ui/LoadingIndicator';
import { useMediaQuery } from '@/shared/hooks/useMediaQuery';
import { useHydrated } from '@/shared/hooks/useHydrated';
import { usePageEntrance } from '@/shared/hooks/usePageEntrance';
import BackgroundField from '@/shared/ui/background-field/BackgroundField';
import { SectionBoundary } from '@/shared/ui/SectionBoundary';
import entranceStyles from '@/shared/ui/PageEntrance.module.css';
import { ManagementTable } from './components/ManagementTable';
import styles from './ManagementPage.module.css';

/** Compose administrative navigation and browser identity; only the active resource table mounts. */
export function ManagementPage({
  locale,
  resource,
}: {
  locale: Locale;
  resource: ManagementResource;
}) {
  const { t } = useTranslation();
  const { settings, motionPaused, subscribeThemeTransition } = useAppearance();
  const root = useRef<HTMLDivElement>(null);
  const mounted = useHydrated();
  const navigate = useNavigate();
  const routeLocation = useLocation();
  const navigation = useNavigation();
  const { session, signOut, logout } = useAccountSession(() => void navigate(`/${locale}`));
  const [compact, setCompact] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const drawerNavigation = useMediaQuery('(max-width: 1024px)');
  const allowed = session.isSuccess && canManage(session.data, resource);
  const denied = session.isSuccess && session.data !== undefined && !allowed;
  usePageEntrance(root, {
    paused: motionPaused,
    subscribe: subscribeThemeTransition,
    enabled: allowed && !signOut.isPending,
  });
  useAccessDeniedRedirect({
    denied,
    destination: `/${locale}/access-denied`,
    // A pending route loader owns its target decision; intentional logout keeps its home flow.
    enabled: navigation.state === 'idle' && !signOut.isPending && !signOut.isSuccess,
  });
  // Dropping the drawer layout also drops its open state, so a later rotation stays on the page.
  if (drawer && !drawerNavigation) setDrawer(false);
  // Never keep a private shell, rows or open details visible while identity is unknown or errored.
  if (!allowed || signOut.isPending) {
    return (
      <main
        className={styles.gate}
        data-bs-theme={!mounted || settings.theme === 'mist' ? 'light' : 'dark'}
      >
        {session.isError ? (
          <>
            <p role="alert">{t('ui.unavailable')}</p>
            <button
              className="btn btn-outline-secondary"
              type="button"
              disabled={session.isFetching}
              onClick={() => void session.refetch()}
            >
              {t('ui.retry')}
            </button>
          </>
        ) : (
          <LoadingIndicator label={t('ui.loading')} />
        )}
      </main>
    );
  }
  const title = t(
    `accountMenu.${managementNavigation.find((item) => item.resource === resource)!.label}`,
  );
  const items = managementNavigation
    .filter((item) => canManage(session.data, item.resource))
    .map((item) => ({
      id: item.resource,
      label: t(`accountMenu.${item.label}`),
      icon: item.icon,
      to: item.resource === 'monitoring' ? undefined : `/${locale}/management/${item.resource}`,
      onSelect: () => setDrawer(false),
    }));
  const home = [
    {
      id: 'home',
      label: t('management.backHome'),
      icon: 'home' as const,
      to: `/${locale}`,
      onSelect: () => setDrawer(false),
    },
  ];
  return (
    <div
      ref={root}
      className={`${styles.shell} ${entranceStyles.frame} ${compact ? styles.compact : ''}`}
      data-management-resource={resource}
      data-bs-theme={!mounted || settings.theme === 'mist' ? 'light' : 'dark'}
    >
      <SectionBoundary
        silent
        resetKey="background"
        message={t('ui.unavailable')}
        retryLabel={t('ui.retry')}
      >
        <BackgroundField
          copy={{ unavailable: t('ui.unavailable'), retry: t('ui.retry') }}
          paused={motionPaused}
          speed={settings.speed}
          compact={compact}
        />
      </SectionBoundary>
      <a className="skip" href="#management-content">
        {t('ui.skip')}
      </a>
      <SidebarRail
        compact={compact}
        onCompact={() => setCompact((value) => !value)}
        collapseLabel={t('management.collapseNavigation')}
        expandLabel={t('management.expandNavigation')}
        drawerAt="tablet"
        brand={<span className={styles.brandText}>PORTFOLIO</span>}
        brandLink={{ to: `/${locale}`, label: t('management.backHome') }}
        leading={
          <span className={styles.brandIcon} aria-hidden>
            <Icon name="dashboard" />
          </span>
        }
        footer={
          <SidebarLinks
            items={home}
            label={t('management.backHome')}
            compact={compact && !drawerNavigation}
          />
        }
      >
        <SidebarLinks
          items={items}
          label={t('management.navigation')}
          active={resource}
          compact={compact && !drawerNavigation}
        />
      </SidebarRail>
      <div className={styles.main}>
        <main id="management-content" className={styles.content} data-entrance-content>
          <div className={styles.contextRow}>
            <button
              className={`icon-button ${styles.mobileToggle}`}
              type="button"
              onClick={() => setDrawer(true)}
              aria-label={t('management.openNavigation')}
              aria-controls="management-navigation"
              aria-expanded={drawer}
            >
              <Icon name="list" />
            </button>
            <div className={styles.breadcrumb}>
              <Breadcrumb
                label={t('breadcrumb.label')}
                items={[{ label: t('breadcrumb.settings') }, { label: title }]}
              />
            </div>
            <div className={styles.controls} data-management-controls>
              {session.data && (
                <div className={styles.identity}>
                  <strong title={session.data.user}>{session.data.user}</strong>
                  <span title={session.data.role}>{session.data.role}</span>
                </div>
              )}
              <AccountMenu
                account={session.data ?? null}
                busy={signOut.isPending || session.isFetching}
                onLogin={() => void navigate(`/${locale}?view=login`)}
                onLogout={logout}
                onNavigate={(value) => void navigate(`/${locale}/management/${value}`)}
                preferences={{
                  theme: <AppearanceSettings />,
                  language: (
                    <LanguageOptions
                      locale={locale}
                      busy={navigation.state !== 'idle'}
                      onChange={(value) => {
                        if (value === locale) return;
                        void navigate(
                          {
                            pathname: `/${value}/management/${resource}`,
                            search: routeLocation.search,
                            hash: routeLocation.hash,
                          },
                          { preventScrollReset: true },
                        );
                      }}
                    />
                  ),
                }}
              />
            </div>
          </div>
          <div className={styles.heading}>
            <div>
              <h1>{title}</h1>
              <p className={styles.description}>{t(`management.descriptions.${resource}`)}</p>
            </div>
            <span className={styles.readonly}>{t('management.readonly')}</span>
          </div>
          <ManagementTable
            key={`${locale}:${resource}:${session.data?.id ?? 'session'}`}
            locale={locale}
            resource={resource}
            title={title}
            enabled={allowed && !signOut.isPending && navigation.state === 'idle'}
            accountId={session.data?.id}
          />
        </main>
      </div>
      <SidebarDrawer
        id="management-navigation"
        open={drawer && drawerNavigation}
        onClose={() => setDrawer(false)}
        label={t('management.workspace')}
        closeLabel={t('management.close')}
        footer={<SidebarLinks items={home} label={t('management.backHome')} />}
      >
        <SidebarLinks items={items} label={t('management.navigation')} active={resource} />
      </SidebarDrawer>
    </div>
  );
}
