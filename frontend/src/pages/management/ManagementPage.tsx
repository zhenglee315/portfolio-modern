import { lazy, Suspense, useRef, useState } from 'react';
import { useLocation, useNavigate, useNavigation } from 'react-router';
import { useTranslation } from 'react-i18next';
import type { Locale } from '@/i18n/config';
import {
  AccountMenu,
  managementNavigation,
  WorkspaceNavigation,
  WorkspaceNavigationToggle,
  useWorkspaceNavigation,
} from '@/features/account-menu';
import { AppearanceSettings, useAppearance } from '@/features/appearance';
import { LanguageOptions } from '@/features/language';
import { useAccountSession, useAccessDeniedRedirect } from '@/features/auth/actions';
import { canManage } from '@/features/auth/permissions';
import type { ManagementPermissionResource } from '@/features/auth/permissions';
import { Breadcrumb } from '@/shared/ui/Breadcrumb';
import { LoadingIndicator } from '@/shared/ui/LoadingIndicator';
import { useHydrated } from '@/shared/hooks/useHydrated';
import { usePageEntrance } from '@/shared/hooks/usePageEntrance';
import BackgroundField from '@/shared/ui/background-field/BackgroundField';
import { SectionBoundary } from '@/shared/ui/SectionBoundary';
import entranceStyles from '@/shared/ui/PageEntrance.module.css';
import { ManagementTable } from './components/ManagementTable';
import styles from './ManagementPage.module.css';

const MonitorWorkspace = lazy(() =>
  import('@/features/monitoring').then((module) => ({ default: module.MonitorWorkspace })),
);

/** Compose administrative navigation and browser identity; only the active resource table mounts. */
export function ManagementPage({
  locale,
  resource,
}: {
  locale: Locale;
  resource: ManagementPermissionResource;
}) {
  const { t } = useTranslation();
  const { settings, motionPaused, subscribeThemeTransition } = useAppearance();
  const root = useRef<HTMLDivElement>(null);
  const mounted = useHydrated();
  const navigate = useNavigate();
  const routeLocation = useLocation();
  const navigation = useNavigation();
  const { session, signOut, logout } = useAccountSession(() => void navigate(`/${locale}`));
  const workspace = useWorkspaceNavigation();
  const { compact } = workspace;
  const [monitorDenied, setMonitorDenied] = useState(false);
  const allowed = session.isSuccess && canManage(session.data, resource);
  const denied = session.isSuccess && session.data !== undefined && !allowed;
  usePageEntrance(root, {
    paused: motionPaused,
    subscribe: subscribeThemeTransition,
    enabled: allowed && !signOut.isPending,
  });
  useAccessDeniedRedirect({
    denied: denied || monitorDenied,
    destination: `/${locale}/access-denied`,
    // A pending route loader owns its target decision; intentional logout keeps its home flow.
    enabled: navigation.state === 'idle' && !signOut.isPending && !signOut.isSuccess,
  });
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
  const params = new URLSearchParams(routeLocation.search);
  const requestedView = params.get('monitorView');
  const monitorView =
    requestedView === 'requests' || requestedView === 'workers' ? requestedView : 'overview';
  const title =
    resource === 'monitoring'
      ? t(
          monitorView === 'overview'
            ? 'overview.title'
            : monitorView === 'workers'
              ? 'monitor.workers'
              : 'monitor.title',
        )
      : t(`accountMenu.${managementNavigation.find((item) => item.resource === resource)!.label}`);
  const active = managementNavigation.find(
    (item) =>
      item.resource === resource &&
      item.view ===
        (resource === 'monitoring' && monitorView !== 'overview' ? monitorView : undefined),
  )!.id;
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
      <WorkspaceNavigation
        controls={workspace}
        account={session.data!}
        locale={locale}
        active={active}
        monitorSearch={resource === 'monitoring' ? routeLocation.search : undefined}
      />
      <div className={styles.main}>
        <main id="management-content" className={styles.content} data-entrance-content>
          <div className={styles.contextRow}>
            <WorkspaceNavigationToggle controls={workspace} />
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
                onProfile={() => void navigate(`/${locale}/profile`)}
                onNavigate={(value, view) =>
                  void navigate(
                    `/${locale}/management/${value}${value === 'monitoring' && view ? `?monitorView=${view}` : ''}`,
                  )
                }
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
          {resource !== 'monitoring' && (
            <div className={styles.heading}>
              <div>
                <h1>{title}</h1>
                <p className={styles.description}>{t(`management.descriptions.${resource}`)}</p>
              </div>
            </div>
          )}
          {resource === 'monitoring' ? (
            <Suspense fallback={<LoadingIndicator label={t('ui.loading')} />}>
              <MonitorWorkspace
                onDenied={() => setMonitorDenied(true)}
                motionPaused={motionPaused}
                key={session.data?.id}
                locale={locale}
                accountId={session.data?.id}
                enabled={allowed && !signOut.isPending && navigation.state === 'idle'}
              />
            </Suspense>
          ) : (
            <ManagementTable
              key={`${locale}:${resource}:${session.data?.id ?? 'session'}`}
              locale={locale}
              resource={resource}
              title={title}
              enabled={allowed && !signOut.isPending && navigation.state === 'idle'}
              accountId={session.data?.id}
            />
          )}
        </main>
      </div>
    </div>
  );
}
