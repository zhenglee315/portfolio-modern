import { useRef, useState } from 'react';
import { Link, useNavigate, useNavigation } from 'react-router';
import { useTranslation } from 'react-i18next';
import Offcanvas from 'react-bootstrap/Offcanvas';
import type { Locale } from '@/i18n/config';
import { AccountMenu, managementNavigation } from '@/features/account-menu';
import { useAppearance } from '@/features/appearance';
import { useAccountSession, useAccessDeniedRedirect } from '@/features/auth/actions';
import { canManage } from '@/features/auth/permissions';
import type { ManagementResource } from '@/features/management';
import { Icon } from '@/shared/ui/Icon';
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
  const links = (
    <>
      <div className={styles.navCaption}>{t('management.workspace')}</div>
      {managementNavigation
        .filter((item) => canManage(session.data, item.resource))
        .map((item) => {
          const title = t(`accountMenu.${item.label}`);
          const content = (
            <>
              <Icon name={item.icon} />
              <span>{title}</span>
            </>
          );
          const className = `${styles.navLink} ${resource === item.resource ? styles.selected : ''}`;
          return item.resource === 'monitoring' ? (
            <button
              key={item.resource}
              type="button"
              className={className}
              title={title}
              onClick={() => setDrawer(false)}
            >
              {content}
            </button>
          ) : (
            <Link
              key={item.resource}
              to={`/${locale}/management/${item.resource}`}
              className={className}
              aria-current={resource === item.resource ? 'page' : undefined}
              title={title}
              onClick={() => setDrawer(false)}
            >
              {content}
            </Link>
          );
        })}
    </>
  );
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
      <aside className={styles.sidebar} data-entrance-navigation>
        <button
          className={`btn ${styles.collapse}`}
          type="button"
          onClick={() => setCompact(!compact)}
          aria-label={t(compact ? 'management.expandNavigation' : 'management.collapseNavigation')}
          aria-expanded={!compact}
        >
          <Icon name={compact ? 'list' : 'collapse'} />
        </button>
        <Link to={`/${locale}`} className={styles.brand} aria-label={t('management.backHome')}>
          <Icon name="dashboard" />
          <span>
            PORTFOLIO<small>{t('management.workspace')}</small>
          </span>
        </Link>
        <nav aria-label={t('management.navigation')}>{links}</nav>
        <Link
          to={`/${locale}`}
          className={`${styles.navLink} ${styles.backHome}`}
          title={t('management.backHome')}
        >
          <Icon name="home" />
          <span>{t('management.backHome')}</span>
        </Link>
      </aside>
      <div className={styles.main}>
        <main id="management-content" className={styles.content} data-entrance-content>
          <div className={styles.contextRow}>
            <button
              className={`btn ${styles.mobileToggle}`}
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
      <Offcanvas
        show={drawer && drawerNavigation}
        onHide={() => setDrawer(false)}
        id="management-navigation"
        className={styles.drawer}
        aria-labelledby="management-navigation-title"
      >
        <Offcanvas.Header closeButton closeLabel={t('management.close')}>
          <Offcanvas.Title id="management-navigation-title">
            {t('management.workspace')}
          </Offcanvas.Title>
        </Offcanvas.Header>
        <Offcanvas.Body>
          <nav aria-label={t('management.navigation')}>{links}</nav>
          <Link to={`/${locale}`} className={styles.navLink}>
            <Icon name="home" />
            {t('management.backHome')}
          </Link>
        </Offcanvas.Body>
      </Offcanvas>
    </div>
  );
}
