import { useMemo, useRef, useState, type ReactNode } from 'react';
import { I18nextProvider, useTranslation } from 'react-i18next';
import { createI18n } from '@/i18n/config';
import { ExperiencesView } from '@/features/experiences';
import { JourneyView } from '@/features/journey';
import { ProjectsView } from '@/features/projects';
import { SkillCategoryContent, SkillsView } from '@/features/skills';
import {
  ContactIntroduction,
  ProfileOverviewContent,
  SiteFooter,
  useContactDisclosure,
} from '@/features/site';
import { careerYearRange, currentMonthUTC, workDuration } from '@/shared/lib/dates';
import { pageSize } from '@/shared/schemas/records';
import { LoadMoreControl } from '@/shared/ui/LoadMoreControl';
import { Icon } from '@/shared/ui/Icon';
import { useProfileEditor } from '../model/editor-context';
import { showcaseProjection } from '../model/showcase';
import { ProjectPagination } from './ProjectPagination';
import { ProjectPageStatus } from './ProjectPageStatus';
import styles from './ShowcasePreview.module.css';
import pageStyles from '@/pages/portfolio/PortfolioPage.module.css';
import editorStyles from '../ProfilePage.module.css';

/** Keep editor controls in the interface language; the homepage body follows its content language. */
export function ShowcasePreview() {
  const { t, i18n } = useTranslation();
  const { draft, contentLocale, projectPage, projectSize } = useProfileEditor();
  const model = useMemo(
    () => showcaseProjection(draft, contentLocale, projectPage, projectSize),
    [draft, contentLocale, projectPage, projectSize],
  );
  const messages = useMemo(() => createI18n(contentLocale), [contentLocale]);
  return (
    <div data-profile-preview="showcase" lang={contentLocale}>
      {!!model.omitted && (
        <p role="status" className={editorStyles.hint}>
          {t('profileEditor.previewIncomplete')}
        </p>
      )}
      <I18nextProvider i18n={messages}>
        <HomepageDraft
          key={contentLocale}
          model={model}
          chatLabel={t('profileEditor.bubblePreview')}
          pagination={
            <I18nextProvider i18n={i18n}>
              <ProjectPagination />
            </I18nextProvider>
          }
          projectStatus={
            <I18nextProvider i18n={i18n}>
              <ProjectPageStatus />
            </I18nextProvider>
          }
        />
      </I18nextProvider>
    </div>
  );
}

/** Render the actual public feature views, styles, map and modals using only the unsaved projection. */
function HomepageDraft({
  model,
  chatLabel,
  pagination,
  projectStatus,
}: {
  model: ReturnType<typeof showcaseProjection>;
  chatLabel: string;
  pagination: ReactNode;
  projectStatus: ReactNode;
}) {
  const { t } = useTranslation();
  const { contentLocale, projectLoading, projectError } = useProfileEditor();
  const [surface, setSurface] = useState<HTMLDivElement | null>(null);
  const controls = useRef<HTMLDivElement>(null);
  const contact = useContactDisclosure();
  const [categoryLimit, setCategoryLimit] = useState(pageSize);
  const now = currentMonthUTC();
  let tenure: string | undefined;
  try {
    const duration = workDuration(model.journey, now);
    tenure = t('ui.tenure', {
      ...duration,
      yearUnit: t(duration.years === 1 ? 'ui.year' : 'ui.years'),
      monthUnit: t(duration.months === 1 ? 'ui.month' : 'ui.months'),
    });
  } catch {
    /* Future ongoing careers leave the derived summary unknown, matching the public page. */
  }
  const last = model.journey.at(-1);
  return (
    <div ref={setSurface} className={styles.homepage} data-homepage-draft>
      <DraftSection section="overview">
        <ProfileOverviewContent
          locale={contentLocale}
          site={model.site}
          tenure={tenure}
          controlsRef={controls}
          leadingControls={
            <button
              type="button"
              className="icon-button"
              aria-label={chatLabel}
              data-draft-contact-trigger
              onClick={contact.toggle}
            >
              <Icon name="chat" />
            </button>
          }
          onExplore={() =>
            surface
              ?.querySelector('[data-draft-section="projects"]')
              ?.scrollIntoView({ block: 'start', behavior: 'instant' })
          }
        />
      </DraftSection>
      <DraftSection section="journey">
        <JourneyView locale={contentLocale} items={model.journey} />
      </DraftSection>
      <DraftSection section="experience">
        <ExperiencesView
          locale={contentLocale}
          records={model.experiences}
          yearRange={careerYearRange(model.journey, now)}
        />
      </DraftSection>
      <DraftSection section="projects">
        <ProjectsView
          locale={contentLocale}
          records={projectLoading || projectError ? [] : model.projects}
          status={projectLoading || projectError ? projectStatus : undefined}
        />
        {pagination}
      </DraftSection>
      <DraftSection section="skills">
        <SkillsView
          footer={
            categoryLimit < model.categories.length && (
              <LoadMoreControl
                label={t('ui.moreCategories')}
                busyLabel={t('ui.loading')}
                busy={false}
                onLoad={() => setCategoryLimit((count) => count + pageSize)}
              />
            )
          }
        >
          {model.categories.slice(0, categoryLimit).map((category) => (
            <SkillCategoryContent key={category.id} {...category} />
          ))}
        </SkillsView>
      </DraftSection>
      <SiteFooter
        site={model.site}
        location={last ? { city: last.city, country: last.countryName } : undefined}
      />
      <ContactIntroduction
        site={model.site}
        disclosure={contact}
        protectedControls={controls}
        portalContainer={surface ?? undefined}
      />
    </div>
  );
}

/** Preserve homepage section spacing inside the modal without adding editor navigation. */
function DraftSection({
  section,
  children,
}: {
  section: 'overview' | 'journey' | 'experience' | 'projects' | 'skills';
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <section
      className={`${section === 'overview' ? '' : pageStyles.section} ${styles.section}`}
      data-draft-section={section}
      aria-label={t(`ui.${section}`)}
    >
      {children}
    </section>
  );
}
