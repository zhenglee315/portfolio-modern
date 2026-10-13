import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { trimPortfolioCache } from '@/app/query-client';
import { useTranslation } from 'react-i18next';
import type { Locale } from '@/i18n/config';
import { AppearanceMenu, useAppearance } from '@/features/appearance';
import { AccountMenu } from '@/features/account-menu';
import { LanguageMenu } from '@/features/language';
import { useAccountSession } from '@/features/auth/actions';
import { OnlineVisitors, useOnlineVisitors } from '@/features/online-visitors';
import { useLocaleSwitch } from './hooks/useLocaleSwitch';
import { SkillsSection } from '@/features/skills';
import { ProjectsSection } from '@/features/projects';
import { ExperiencesSection } from '@/features/experiences';
import { JourneySection, useJourney } from '@/features/journey';
import { careerYearRange, workDuration } from '@/shared/lib/dates';
import {
  ContactIntroduction,
  useContactDisclosure,
  ProfileOverview,
  SiteFooter,
  useSite,
  type Site,
} from '@/features/site';
import { PortfolioProvider, usePortfolioContext } from '@/shared/context/portfolio';
import { ApiError } from '@/shared/api/http';
import {
  cancelPortfolioQueries,
  portfolioIdentity,
  type PortfolioSiteSelector,
} from '@/shared/api/portfolio';
import { useSectionDemand } from '@/shared/hooks/useSectionDemand';
import { SectionBoundary } from '@/shared/ui/SectionBoundary';
import { SectionState } from '@/shared/ui/SectionState';
import { Breadcrumb } from '@/shared/ui/Breadcrumb';
import { Navigation } from './components/Navigation';
import { useSectionNavigation } from './hooks/useSectionNavigation';
import styles from './PortfolioPage.module.css';
import entranceStyles from '@/shared/ui/PageEntrance.module.css';
import { useEntrance } from './hooks/useEntrance';
import BackgroundField from '@/shared/ui/background-field/BackgroundField';
import { useAuthTransition } from './hooks/useAuthTransition';
import { useAuthNavigation } from './hooks/useAuthNavigation';

// Public browsing does not download the account form or its cow controls until requested.
const AuthPanel = lazy(() =>
  import('@/features/auth').then((module) => ({ default: module.ConnectedAuthPanel })),
);

/** Resolve public ownership once before rendering any independently loaded portfolio sections. */
export function PortfolioPage({
  locale,
  nowMonth,
  selector,
  site: initialSite,
}: {
  locale: Locale;
  nowMonth: string;
  selector: PortfolioSiteSelector;
  site?: Site;
}) {
  const client = useQueryClient();
  const { t } = useTranslation();
  const site = useSite(locale, selector, initialSite);
  const siteId = site.data?.site_id;
  useEffect(() => {
    trimPortfolioCache(client, [
      portfolioIdentity(selector),
      ...(siteId !== undefined ? [portfolioIdentity({ site_id: siteId })] : []),
    ]);
    return () => {
      void cancelPortfolioQueries(client, locale, selector, siteId);
    };
  }, [client, locale, selector, siteId]);
  if (site.error instanceof ApiError && site.error.status === 404)
    return <SectionState message={t('ui.unavailable')} />;
  return (
    <PortfolioProvider selector={selector} site={site.data}>
      <PortfolioContent
        key={`${portfolioIdentity(selector)}:${siteId ?? 'pending'}`}
        locale={locale}
        nowMonth={nowMonth}
      />
    </PortfolioProvider>
  );
}

/** Compose independent feature boundaries; the page owns cross-domain coordination. */
function PortfolioContent({ locale, nowMonth }: { locale: Locale; nowMonth: string }) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { session, signOut, logout } = useAccountSession();
  const root = useRef<HTMLDivElement>(null);
  // Both site surfaces share the actual controls bounds instead of guessing responsive row heights.
  const profileControls = useRef<HTMLDivElement>(null);
  const appearance = useAppearance();
  const contact = useContactDisclosure();
  const auth = useAuthTransition(appearance.reducedMotion);
  const authVisible = auth.phase === 'reveal' || auth.phase === 'auth';
  const authNavigation = useAuthNavigation({
    locale,
    active: auth.isAuth,
    visible: authVisible,
    open: auth.open,
    back: auth.back,
    dismissContact: contact.dismiss,
  });
  const context = usePortfolioContext();
  const identity = `${context?.site?.site_id ?? 'pending'}:${locale}`;
  const language = useLocaleSwitch(locale, context?.selector, context?.site?.site_id);
  const localeControl = (
    <LanguageMenu
      locale={locale}
      busy={language.busy}
      onChange={(value) => void language.change(value)}
      onOpen={contact.dismiss}
    />
  );
  const site = useSite(locale);
  const onlineVisitors = useOnlineVisitors();
  useEntrance(
    root,
    !!site.data,
    contact.reveal,
    appearance.motionPaused,
    appearance.subscribeThemeTransition,
    !auth.isAuth,
  );
  const navigation = useSectionNavigation(identity, !auth.isAuth);
  const journeyEnabled = useSectionDemand(
    'journey',
    identity,
    !auth.isAuth,
    navigation.active === 'journey',
  );
  const experienceEnabled = useSectionDemand(
    'experience',
    identity,
    !auth.isAuth,
    navigation.active === 'experience',
  );
  const projectsEnabled = useSectionDemand(
    'projects',
    identity,
    !auth.isAuth,
    navigation.active === 'projects',
  );
  const skillsEnabled = useSectionDemand(
    'skills',
    identity,
    !auth.isAuth,
    navigation.active === 'skills',
  );
  const journey = useJourney(locale, journeyEnabled);
  const stops = journey.data;
  const final = stops?.at(-1);
  let tenure: string | undefined;
  let yearRange: string | undefined;
  if (stops?.length) {
    try {
      yearRange = careerYearRange(stops, nowMonth);
      const duration = workDuration(stops, nowMonth);
      tenure = t('ui.tenure', {
        ...duration,
        yearUnit: t(duration.years === 1 ? 'ui.year' : 'ui.years'),
        monthUnit: t(duration.months === 1 ? 'ui.month' : 'ui.months'),
      });
    } catch {
      /* An unusable ongoing period hides only the derived summary. */
    }
  }
  const [compact, setCompact] = useState(false);
  return (
    <div
      ref={root}
      className={`${styles.frame} ${entranceStyles.frame} ${compact ? styles.compact : ''}`}
      data-auth-phase={auth.phase}
      data-auth-view={auth.isAuth}
      data-portfolio-user={context?.site?.user}
      data-portfolio-site={context?.site?.site_id}
      style={auth.style}
    >
      <SectionBoundary
        silent
        resetKey="background"
        message={t('ui.unavailable')}
        retryLabel={t('ui.retry')}
      >
        <BackgroundField
          copy={{ unavailable: t('ui.unavailable'), retry: t('ui.retry') }}
          paused={appearance.motionPaused}
          speed={appearance.settings.speed}
          compact={compact}
        />
      </SectionBoundary>
      <a
        className="skip"
        href="#overview"
        inert={auth.isAuth}
        aria-hidden={auth.isAuth || undefined}
      >
        {t('ui.skip')}
      </a>
      <div className={styles.navSurface} inert={auth.isAuth} aria-hidden={auth.isAuth || undefined}>
        <Navigation
          endpoints={stops?.length ? `${stops[0]?.city} → ${final?.city}` : undefined}
          site={site.data}
          onContact={site.data ? contact.toggle : undefined}
          contactOpen={contact.state.open}
          onOpen={contact.dismiss}
          active={navigation.active}
          compact={compact}
          onCompact={() => setCompact((value) => !value)}
          onNavigate={navigation.navigate}
        />
      </div>
      <main
        data-entrance-content
        aria-busy={language.busy}
        className={styles.main}
        id="main-content"
        inert={auth.isAuth}
        aria-hidden={auth.isAuth || undefined}
      >
        <section id="overview" tabIndex={-1} aria-label={t('ui.overview')}>
          <SectionBoundary
            resetKey={identity}
            message={t('ui.unavailable')}
            retryLabel={t('ui.retry')}
          >
            <ProfileOverview
              locale={locale}
              breadcrumb={
                site.data && (
                  <Breadcrumb
                    label={t('breadcrumb.label')}
                    items={[
                      { label: t('breadcrumb.home'), href: `/${locale}#overview`, icon: 'home' },
                      { label: site.data.user, href: '#overview' },
                      { label: t('breadcrumb.overview') },
                    ]}
                  />
                )
              }
              controlsRef={profileControls}
              tenure={tenure}
              summaryPending={journey.data === undefined}
              leadingControls={
                <OnlineVisitors data={onlineVisitors.data} failed={onlineVisitors.isError} />
              }
              controls={
                <AccountMenu
                  account={session.data ?? null}
                  onOpen={contact.dismiss}
                  busy={signOut.isPending || (session.data === undefined && session.isFetching)}
                  onLogin={authNavigation.enter}
                  onLogout={logout}
                  onNavigate={(resource) => void navigate(`/${locale}/management/${resource}`)}
                />
              }
              onExplore={() => navigation.navigate('projects')}
            />
          </SectionBoundary>
        </section>
        <section id="journey" className={styles.section} aria-label={t('ui.journey')}>
          <SectionBoundary
            resetKey={identity}
            message={t('ui.unavailable')}
            retryLabel={t('ui.retry')}
          >
            <JourneySection locale={locale} suspended={auth.isAuth} enabled={journeyEnabled} />
          </SectionBoundary>
        </section>
        <section id="experience" className={styles.section} aria-label={t('ui.experience')}>
          <SectionBoundary
            resetKey={identity}
            message={t('ui.unavailable')}
            retryLabel={t('ui.retry')}
          >
            <ExperiencesSection
              locale={locale}
              locked={language.busy}
              yearRange={yearRange}
              enabled={experienceEnabled}
            />
          </SectionBoundary>
        </section>
        <section id="projects" className={styles.section} aria-label={t('ui.projects')}>
          <SectionBoundary
            resetKey={identity}
            message={t('ui.unavailable')}
            retryLabel={t('ui.retry')}
          >
            <ProjectsSection
              locale={locale}
              locked={language.busy}
              localeControl={localeControl}
              enabled={projectsEnabled}
            />
          </SectionBoundary>
        </section>
        <section id="skills" className={styles.section} aria-label={t('ui.skills')}>
          <SectionBoundary
            resetKey={identity}
            message={t('ui.unavailable')}
            retryLabel={t('ui.retry')}
          >
            <SkillsSection locale={locale} locked={language.busy} enabled={skillsEnabled} />
          </SectionBoundary>
        </section>
        <SiteFooter
          site={site.data}
          location={final ? { city: final.city, country: final.countryName } : undefined}
        />
      </main>
      {auth.isAuth && (
        <div
          className={styles.authSurface}
          inert={!authVisible}
          aria-hidden={!authVisible || undefined}
        >
          <SectionBoundary
            resetKey={`auth:${locale}`}
            message={t('ui.unavailable')}
            retryLabel={t('ui.reloadPage')}
            reloadOnRetry
          >
            <Suspense fallback={<SectionState busy message={t('ui.loading')} />}>
              <AuthPanel
                initialFocus={auth.phase === 'auth'}
                animationActive={authVisible}
                onBack={authNavigation.leave}
                onSuccess={authNavigation.leave}
                controls={
                  <>
                    {localeControl}
                    <AppearanceMenu />
                  </>
                }
              />
            </Suspense>
          </SectionBoundary>
        </div>
      )}
      <ContactIntroduction
        site={site.data}
        disclosure={contact}
        protectedControls={profileControls}
      />
    </div>
  );
}
