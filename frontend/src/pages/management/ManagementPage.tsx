import { useState } from 'react';
import { Link, useNavigate, useNavigation } from 'react-router';
import { useTranslation } from 'react-i18next';
import Offcanvas from 'react-bootstrap/Offcanvas';
import type { Locale } from '@/i18n/config';
import { AccountMenu } from '@/features/account-menu';
import { AppearanceMenu, useAppearance } from '@/features/appearance';
import { LanguageMenu } from '@/features/language';
import { useAccountSession, useAccessDeniedRedirect } from '@/features/auth/actions';
import { canManage } from '@/features/auth/permissions';
import type { ManagementResource } from '@/features/management';
import { Icon } from '@/shared/ui/Icon';
import { LoadingIndicator } from '@/shared/ui/LoadingIndicator';
import { useMediaQuery } from '@/shared/hooks/useMediaQuery';
import { useHydrated } from '@/shared/hooks/useHydrated';
import { resources } from './model/management-view';
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
  const { settings } = useAppearance();
  const mounted = useHydrated();
  const navigate = useNavigate();
  const navigation = useNavigation();
  const { session, signOut, logout } = useAccountSession(() => void navigate(`/${locale}`));
  const [compact, setCompact] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const drawerNavigation = useMediaQuery('(max-width: 1024px)');
  const allowed = session.isSuccess && canManage(session.data, resource);
  const denied = session.isSuccess && session.data !== undefined && !allowed;
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
  const title = t(`accountMenu.${resources.find((item) => item.resource === resource)!.label}`);
  const links = (
    <>
      <div className={styles.navCaption}>{t('management.workspace')}</div>
      {resources
        .filter((item) => canManage(session.data, item.resource))
        .map((item) => (
          <Link
            key={item.resource}
            to={`/${locale}/management/${item.resource}`}
            className={`${styles.navLink} ${resource === item.resource ? styles.selected : ''}`}
            aria-current={resource === item.resource ? 'page' : undefined}
            title={t(`accountMenu.${item.label}`)}
            onClick={() => setDrawer(false)}
          >
            <Icon name={item.icon} />
            <span>{t(`accountMenu.${item.label}`)}</span>
          </Link>
        ))}
    </>
  );
  return (
    <div
      className={`${styles.shell} ${compact ? styles.compact : ''}`}
      data-management-resource={resource}
      data-bs-theme={!mounted || settings.theme === 'mist' ? 'light' : 'dark'}
    >
      <a className="skip" href="#management-content">
        {t('ui.skip')}
      </a>
      <aside className={styles.sidebar}>
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
        <header className={styles.header}>
          <button
            className={`btn ${styles.collapse}`}
            type="button"
            onClick={() => setCompact(!compact)}
            aria-label={t(
              compact ? 'management.expandNavigation' : 'management.collapseNavigation',
            )}
            aria-expanded={!compact}
          >
            <Icon name={compact ? 'list' : 'collapse'} />
          </button>
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
          <span className={styles.headerLabel}>{t('management.workspace')}</span>
          <div className={styles.controls}>
            <AppearanceMenu />
            <LanguageMenu
              locale={locale}
              busy={false}
              onChange={(value) => void navigate(`/${value}/management/${resource}`)}
            />
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
        </header>
        <main id="management-content" className={styles.content}>
          <div className={styles.heading}>
            <div>
              <p className={styles.eyebrow}>{t('management.manage')}</p>
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
