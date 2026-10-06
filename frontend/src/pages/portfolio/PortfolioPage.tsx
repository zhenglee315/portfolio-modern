import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Locale } from '@/i18n/config';
import { AppearanceMenu, useAppearance } from '@/features/appearance';
import { LanguageMenu } from '@/features/language';
import { useLocaleSwitch } from './hooks/useLocaleSwitch';
import { SectionState } from '@/shared/ui/SectionState';
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
} from '@/features/site';
import { SectionBoundary } from '@/shared/ui/SectionBoundary';
import { Navigation } from './components/Navigation';
import { useSectionNavigation } from './hooks/useSectionNavigation';
import styles from './PortfolioPage.module.css';
import { useEntrance } from './hooks/useEntrance';
import BackgroundField from './components/BackgroundField';

/** Compose independent feature boundaries; the page owns cross-domain coordination. */
export function PortfolioPage({ locale, nowMonth }: { locale: Locale; nowMonth: string }) {
  const { t } = useTranslation();
  const root = useRef<HTMLDivElement>(null);
  // Both site surfaces share the actual controls bounds instead of guessing responsive row heights.
  const profileControls = useRef<HTMLDivElement>(null);
  const appearance = useAppearance();
  const contact = useContactDisclosure();
  const language = useLocaleSwitch(locale);
  const localeControl = (
    <LanguageMenu
      locale={locale}
      busy={language.busy}
      onChange={(value) => void language.change(value)}
      onOpen={contact.dismiss}
    />
  );
  const site = useSite(locale);
  useEntrance(
    root,
    !!site.data,
    contact.reveal,
    appearance.motionPaused,
    appearance.subscribeThemeTransition,
  );
  const journey = useJourney(locale);
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
  const navigation = useSectionNavigation(locale);
  return (
    <div ref={root} className={`${styles.frame} ${compact ? styles.compact : ''}`}>
      <SectionBoundary
        silent
        resetKey="background"
        message={t('ui.unavailable')}
        retryLabel={t('ui.retry')}
      >
        <BackgroundField
          paused={appearance.motionPaused}
          speed={appearance.settings.speed}
          compact={compact}
        />
      </SectionBoundary>
      <a className="skip" href="#overview">
        {t('ui.skip')}
      </a>
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
      <main aria-busy={language.busy} className={styles.main} id="main-content">
        {language.failed && <SectionState message={t('ui.languageFailed')} />}
        <section id="overview" tabIndex={-1} aria-label={t('ui.overview')}>
          <SectionBoundary
            resetKey={locale}
            message={t('ui.unavailable')}
            retryLabel={t('ui.retry')}
          >
            <ProfileOverview
              locale={locale}
              controlsRef={profileControls}
              tenure={tenure}
              controls={
                <>
                  {localeControl}
                  <AppearanceMenu onOpen={contact.dismiss} />
                </>
              }
              onExplore={() => navigation.navigate('projects')}
            />
          </SectionBoundary>
        </section>
        <section id="journey" className={styles.section} aria-label={t('ui.journey')}>
          <SectionBoundary
            resetKey={locale}
            message={t('ui.unavailable')}
            retryLabel={t('ui.retry')}
          >
            <JourneySection locale={locale} />
          </SectionBoundary>
        </section>
        <section id="experience" className={styles.section} aria-label={t('ui.experience')}>
          <SectionBoundary
            resetKey={locale}
            message={t('ui.unavailable')}
            retryLabel={t('ui.retry')}
          >
            <ExperiencesSection locale={locale} locked={language.busy} yearRange={yearRange} />
          </SectionBoundary>
        </section>
        <section id="projects" className={styles.section} aria-label={t('ui.projects')}>
          <SectionBoundary
            resetKey={locale}
            message={t('ui.unavailable')}
            retryLabel={t('ui.retry')}
          >
            <ProjectsSection locale={locale} locked={language.busy} localeControl={localeControl} />
          </SectionBoundary>
        </section>
        <section id="skills" className={styles.section} aria-label={t('ui.skills')}>
          <SectionBoundary
            resetKey={locale}
            message={t('ui.unavailable')}
            retryLabel={t('ui.retry')}
          >
            <SkillsSection locale={locale} locked={language.busy} />
          </SectionBoundary>
        </section>
        <SiteFooter
          site={site.data}
          location={final ? { city: final.city, country: final.countryName } : undefined}
        />
      </main>
      <ContactIntroduction
        site={site.data}
        disclosure={contact}
        protectedControls={profileControls}
      />
    </div>
  );
}
