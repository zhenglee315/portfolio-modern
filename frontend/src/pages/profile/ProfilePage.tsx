import { useEffect, useMemo, useRef, useState } from 'react';
import { useBlocker, useLocation, useNavigate, useSearchParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@/shared/api/http';
import { I18nextProvider, useTranslation } from 'react-i18next';
import { localeSchema, supportedLocales, type Locale } from '@/i18n/config';
import { createProfileI18n } from '@/i18n/profile-copy';
import { AccountMenu } from '@/features/account-menu';
import { AppearanceSettings, useAppearance } from '@/features/appearance';
import { LanguageOptions } from '@/features/language';
import { useAccessDeniedRedirect, useAccountSession } from '@/features/auth/actions';
import type { AuthUser } from '@/features/auth/session';
import { ContactIntroduction, useContactDisclosure, type Site } from '@/features/site';
import {
  profileDraftIssues,
  saveProfileContent,
  profileJourney,
  useProfileDraft,
  type DraftIssue,
  type ProfileSection,
  type ProfileDraft,
} from '@/features/profile-content';
import { Breadcrumb } from '@/shared/ui/Breadcrumb';
import { Icon, type IconName } from '@/shared/ui/Icon';
import { LoadingIndicator } from '@/shared/ui/LoadingIndicator';
import WarningModal from '@/shared/ui/WarningModal';
import { useNotifications } from '@/shared/ui/NotificationProvider';
import BackgroundField from '@/shared/ui/background-field/BackgroundField';
import { usePageEntrance } from '@/shared/hooks/usePageEntrance';
import entranceStyles from '@/shared/ui/PageEntrance.module.css';
import { Navigation } from '../portfolio/components/Navigation';
import { ProfileEditorContext } from './model/editor-context';
import { useProfileViewFade } from './model/useProfileViewFade';
import { useProfileContent } from './model/useProfileContent';
import { loadProfileContent } from './model/loadProfileContent';
import { ProfileActions } from './components/ProfileActions';
import { ProfileSourceNotice } from './components/ProfileSourceNotice';
import { ExperienceList } from './components/ExperienceList';
import { ExperienceEditor } from './components/ExperienceEditor';
import { IntroductionEditor } from './components/IntroductionEditor';
import { ProjectEditor, ProjectList } from './components/ProjectEditor';
import { SkillsEditor } from './components/SkillsEditor';
import styles from './ProfilePage.module.css';

const sections: readonly { id: ProfileSection; caption: string; icon: IconName }[] = [
  { id: 'overview', caption: 'OVERVIEW', icon: 'home' },
  { id: 'experience', caption: 'EXPERIENCE', icon: 'briefcase' },
  { id: 'projects', caption: 'PROJECTS', icon: 'award' },
  { id: 'skills', caption: 'SKILLS', icon: 'braces' },
];
const languageNames: Record<Locale, string> = {
  en: 'English',
  'zh-Hant': '繁體中文',
  'zh-Hans': '简体中文',
};

/** Rail destinations and tab actions preserve the same content-language and query state. */
function profileSectionParams(current: URLSearchParams, section: ProfileSection, edit?: string) {
  const next = new URLSearchParams(current);
  next.set('section', section);
  if (edit) next.set('edit', edit);
  else next.delete('edit');
  return next;
}

/** Route-scoped copy loads with the editor, preserving public first-view asset budgets. */
export function ProfilePage({ locale }: { locale: Locale }) {
  const i18n = useMemo(() => createProfileI18n(locale), [locale]);
  return (
    <I18nextProvider i18n={i18n}>
      <ProfileAccessGate locale={locale} />
    </I18nextProvider>
  );
}

/** Reuse current authentication while keeping this frontend-only editor available to every account. */
function ProfileAccessGate({ locale }: { locale: Locale }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { session, signOut, logout } = useAccountSession(() => void navigate(`/${locale}`));
  useAccessDeniedRedirect({
    denied: session.isSuccess && session.data === null,
    destination: `/${locale}?view=login`,
    enabled: !signOut.isPending && !signOut.isSuccess,
  });
  if (!session.data || signOut.isPending)
    return (
      <main className={styles.gate}>
        {session.isError ? (
          <>
            <p role="alert">{t('ui.unavailable')}</p>
            <button type="button" className={styles.button} onClick={() => void session.refetch()}>
              {t('ui.retry')}
            </button>
          </>
        ) : (
          <LoadingIndicator label={t('ui.loading')} />
        )}
      </main>
    );
  return (
    <ProfileSourceGate
      key={session.data.id}
      locale={locale}
      account={session.data}
      logout={logout}
    />
  );
}

/** Never substitute invented content when the owner's API is loading or unavailable. */
function ProfileSourceGate({
  locale,
  account,
  logout,
}: {
  locale: Locale;
  account: AuthUser;
  logout: () => void;
}) {
  const { t } = useTranslation();
  const source = useProfileContent(account.id, account.user);
  if (!source.data)
    return (
      <main className={styles.gate}>
        {source.isError ? (
          <>
            <p role="alert">{t('profileEditor.sourceError')}</p>
            <button type="button" className={styles.button} onClick={() => void source.refetch()}>
              {t('ui.retry')}
            </button>
          </>
        ) : (
          <LoadingIndicator label={t('profileEditor.sourceLoading')} />
        )}
      </main>
    );
  return (
    <ProfileWorkspace locale={locale} account={account} logout={logout} source={source.data} />
  );
}

/** Compose the original shell around editable API copies; saves remain strictly browser-local. */
function ProfileWorkspace({
  locale,
  account,
  logout,
  source,
}: {
  locale: Locale;
  account: AuthUser;
  logout: () => void;
  source: ProfileDraft;
}) {
  const { t } = useTranslation();
  const { notify } = useNotifications();
  const client = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const saveLock = useRef(false);

  const { settings, motionPaused, subscribeThemeTransition } = useAppearance();
  const root = useRef<HTMLDivElement>(null);
  const controls = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const [compact, setCompact] = useState(false);
  const [issues, setIssues] = useState<DraftIssue[]>([]);
  const [confirmation, setConfirmation] = useState<{
    action: () => void;
    kind: 'delete' | 'discard' | 'import';
  } | null>(null);
  const editor = useProfileDraft(account.id, source);
  const { draft, update, dirty, hasSaved } = editor;
  const contact = useContactDisclosure();
  usePageEntrance(root, { paused: motionPaused, subscribe: subscribeThemeTransition });
  const requestedSection = params.get('section');
  useEffect(() => {
    // Keep saved Journey links working after merging its location controls into the career form.
    if (requestedSection !== 'journey') return;
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.set('section', 'experience');
        return next;
      },
      { replace: true, preventScrollReset: true },
    );
  }, [requestedSection, setParams]);
  const selectedSection = sections.find((item) => item.id === requestedSection)?.id ?? 'experience';
  const {
    section,
    editing,
    fading,
    style: fadeStyle,
  } = useProfileViewFade(selectedSection, params.get('edit'));
  const requestedLocale = localeSchema.safeParse(params.get('contentLocale') ?? 'en');
  const contentLocale = requestedLocale.success ? requestedLocale.data : 'en';
  // Localized labels are a view projection; saved skill identities remain shared across all references.
  const viewDraft = useMemo(
    () => ({
      ...draft,
      skills: Object.fromEntries(
        Object.entries(draft.skills).map(([id, skill]) => [
          id,
          { ...skill, label: skill.labels?.[contentLocale] || skill.label },
        ]),
      ),
    }),
    [draft, contentLocale],
  );
  const experience = section === 'experience' && editing ? draft.experiences[editing] : undefined;
  const project = section === 'projects' && editing ? draft.projects[editing] : undefined;
  const isEditing = !!experience || !!project;
  const blocker = useBlocker(
    ({ nextLocation }) =>
      dirty && !/^\/(en|zh-Hant|zh-Hans)\/profile\/?$/.test(nextLocation.pathname),
  );
  const confirm = (action: () => void, kind: 'delete' | 'discard' | 'import' = 'delete') =>
    setConfirmation({ action, kind });
  const select = (next: ProfileSection, edit?: string) => {
    contact.dismiss();
    setParams((current) => profileSectionParams(current, next, edit), { preventScrollReset: true });
    // Opening a long editor from a list restores its heading for keyboard and mobile users.
    requestAnimationFrame(() => {
      heading.current?.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: 'instant' });
    });
  };
  const openExperience = (id?: string) => select('experience', id);
  const openProject = (id?: string) => select('projects', id);
  const save = async () => {
    if (saveLock.current || !account.is_update) return;
    const nextIssues = profileDraftIssues(draft, contentLocale);
    setIssues(nextIssues);
    const first = nextIssues[0];
    if (first) {
      if (first.field.startsWith('experiences.')) openExperience(first.field.split('.')[1]);
      else if (first.field.startsWith('projects.')) openProject(first.field.split('.')[1]);
      else select(first.field.startsWith('categories.') ? 'skills' : 'overview');
      notify({ kind: 'warning', message: t('profileEditor.validationTitle') });
      return;
    }
    if (editor.savedRevision === undefined) return;
    saveLock.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      const next = await saveProfileContent(draft, editor.savedRevision);
      editor.acceptSaved(next);
      // Keep the editor URL aligned when the database replaces a new draft ID.
      const order = section === 'experience' ? 'experienceOrder' : 'projectOrder';
      if (editing && (section === 'experience' || section === 'projects')) {
        const index = draft[order].indexOf(editing);
        const canonical = next[order][index];
        if (canonical && canonical !== editing)
          setParams((current) => profileSectionParams(current, section, canonical), {
            replace: true,
            preventScrollReset: true,
          });
      }

      client.setQueryData(['profile-content-source', account.id, account.user], next);
      await client.invalidateQueries({ queryKey: ['portfolio'] });
      notify({ kind: 'success', message: t('profileEditor.saved') });
    } catch (error) {
      const key =
        error instanceof ApiError && error.status === 409
          ? 'saveConflict'
          : error instanceof ApiError && error.status === 403
            ? 'saveForbidden'
            : error instanceof ApiError &&
                error.code === 'PORTFOLIO_UPDATE_COMMITTED_CACHE_UNAVAILABLE'
              ? 'saveCommitted'
              : error instanceof ApiError &&
                  ['network', 'timeout', 'contract', 'parse'].includes(error.kind)
                ? 'saveUnknown'
                : 'saveError';
      setSaveError(key);
      notify({ kind: 'error', message: t(`profileEditor.${key}`) });
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  };
  const reloadServer = async () => {
    if (saveLock.current) return;
    saveLock.current = true;
    setSaving(true);
    try {
      const next = await loadProfileContent(account.user, new AbortController().signal);
      editor.acceptSaved(next);
      client.setQueryData(['profile-content-source', account.id, account.user], next);
      setSaveError(null);
      setIssues([]);
      select(section);
    } catch {
      notify({ kind: 'error', message: t('profileEditor.sourceError') });
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  };

  const cancel = () => {
    if (dirty)
      confirm(() => {
        editor.cancel();
        setIssues([]);
        select(section);
      }, 'discard');
  };
  // The same shared Navigation/Brand/Bubble components retain existing rail and mobile behavior.
  const intro = draft.profiles[contentLocale];
  const site: Site = {
    site_id: draft.source?.siteId ?? 1,
    user: account.user,
    brand: draft.brand ?? {
      title: account.user,
      titleSub: '',
      copyrightYear: new Date().getFullYear(),
    },
    profile: {
      firstName: intro.firstName,
      familyName: intro.familyName,
      nickName: intro.nickName,
      content: intro.content,
      eduCode: intro.eduCode,
      program: intro.program,
      introContent: intro.intro,
      footerContent: intro.footer,
    },
    social: draft.social,
    chatme: {
      title: intro.chatTitle,
      titleSub: intro.chatSubtitle,
      content: intro.chatContent,
      icon: intro.chatIcon,
    },
  };
  const journey = profileJourney(draft);
  const endpoints = [journey[0], journey.at(-1)]
    .filter(Boolean)
    .map((item) => item!.translations[contentLocale].city)
    .filter(Boolean)
    .join(' → ');
  const title = experience
    ? t('profileEditor.editExperience')
    : project
      ? t('profileEditor.editProject')
      : t(`profileEditor.title${section[0]!.toUpperCase()}${section.slice(1)}`);
  const publicHref = `/${locale}/${account.user}`;
  const changeInterfaceLanguage = (language: Locale) =>
    void navigate(
      { pathname: `/${language}/profile`, search: location.search },
      { preventScrollReset: true },
    );

  return (
    <ProfileEditorContext.Provider
      value={{
        draft: viewDraft,
        update: (change) => {
          if (!saveLock.current && account.is_update) update(change);
        },
        busy: saving,
        canCreate: account.is_create,
        canDelete: account.is_delete,
        canUpdate: account.is_update,
        dirty,
        hasSaved,
        issues,
        contentLocale,
        uiLocale: locale,
        section,
        save,
        cancel,
        openExperience,
        openProject,
        openSection: select,
        confirm: (action, kind) => {
          if (!saveLock.current) confirm(action, kind);
        },
      }}
    >
      <div
        ref={root}
        className={`${styles.shell} ${entranceStyles.frame} ${compact ? styles.compact : ''}`}
        data-profile-editor
        data-bs-theme={settings.theme === 'mist' ? 'light' : 'dark'}
      >
        <BackgroundField
          paused={motionPaused}
          speed={settings.speed}
          compact={compact}
          copy={{ unavailable: t('ui.unavailable'), retry: t('ui.retry') }}
        />
        <a className="skip" href="#profile-content">
          {t('ui.skip')}
        </a>
        <Navigation
          site={site}
          active={selectedSection}
          items={sections.map((item, index) => ({
            id: item.id,
            label: t(`profileEditor.${item.id}`),
            icon: item.icon,
            href: `${location.pathname}?${profileSectionParams(params, item.id)}`,
            current: 'page',
            ordinal: String(index + 1).padStart(2, '0'),
          }))}
          compact={compact}
          onCompact={() => setCompact((value) => !value)}
          endpoints={endpoints}
          onNavigate={(id) => {
            const target = sections.find((item) => item.id === id);
            if (target) select(target.id);
          }}
          onContact={contact.toggle}
          contactOpen={contact.state.open}
          onOpen={contact.dismiss}
        />
        <main id="profile-content" className={styles.main} data-entrance-content>
          <div className={styles.contextRow}>
            <Breadcrumb
              label={t('breadcrumb.label')}
              items={[
                { label: t('ui.overview'), href: publicHref, icon: 'home' },
                { label: account.user },
                { label: t('profileEditor.label') },
              ]}
            />
            <div ref={controls} className={styles.controls}>
              <AccountMenu
                account={account}
                onOpen={contact.dismiss}
                onLogout={logout}
                onProfile={() => select('experience')}
                onNavigate={(resource, view) =>
                  void navigate(
                    `/${locale}/management/${resource}${view ? `?monitorView=${view}` : ''}`,
                  )
                }
                preferences={{
                  theme: <AppearanceSettings />,
                  language: (
                    <LanguageOptions
                      locale={locale}
                      busy={false}
                      onChange={changeInterfaceLanguage}
                    />
                  ),
                }}
              />
            </div>
          </div>
          <header className={styles.heading}>
            <div className={styles.viewFade} style={fadeStyle} data-fading={fading}>
              <p className={styles.eyebrow}>{t('profileEditor.eyebrow')}</p>
              <h1 ref={heading} tabIndex={-1}>
                {title}
              </h1>
              <p>
                {isEditing
                  ? (experience?.translations[contentLocale].organization ??
                    project?.translations[contentLocale].name)
                  : t(`profileEditor.description${section[0]!.toUpperCase()}${section.slice(1)}`)}
              </p>
            </div>
            <ProfileActions publicHref={publicHref} />
          </header>
          <div className={styles.tabsRow}>
            <nav className={styles.sectionTabs} aria-label={t('profileEditor.eyebrow')}>
              {sections.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-current={selectedSection === item.id ? 'page' : undefined}
                  disabled={saving}
                  onClick={() => select(item.id)}
                >
                  <span>{t(`profileEditor.${item.id}`)}</span>
                  <small>{item.caption}</small>
                </button>
              ))}
            </nav>
            <label className={styles.contentLocale}>
              <Icon name="translate" />
              <span className="visually-hidden">{t('profileEditor.contentLanguage')}</span>
              <select
                aria-label={t('profileEditor.contentLanguage')}
                value={contentLocale}
                disabled={saving}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setIssues([]);
                  setParams(
                    (current) => {
                      const next = new URLSearchParams(current);
                      next.set('contentLocale', value);
                      return next;
                    },
                    { preventScrollReset: true },
                  );
                }}
              >
                {supportedLocales.map((language) => (
                  <option value={language} key={language}>
                    {languageNames[language]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className={styles.draftNotice}>
            <Icon name="translate" />
            <p>
              {t('profileEditor.languageHint', { language: languageNames[contentLocale] })}
              <small>{t('profileEditor.localNotice')}</small>
            </p>
          </div>
          {saveError && (
            <div className={styles.validationSummary}>
              <p role="alert">{t(`profileEditor.${saveError}`)}</p>
              <button
                type="button"
                className={styles.button}
                disabled={saving}
                onClick={() =>
                  confirm(() => {
                    void reloadServer();
                  }, 'import')
                }
              >
                {t('profileEditor.reloadServer')}
              </button>
            </div>
          )}
          {!account.is_update && (
            <p role="status" className={styles.hint}>
              {t('profileEditor.readOnly')}
            </p>
          )}
          <ProfileSourceNotice
            source={source}
            current={draft}
            hasSaved={hasSaved}
            disabled={saving}
            onLoad={() => confirm(() => editor.useSource(source), 'import')}
          />
          <div
            className={styles.viewFade}
            style={fadeStyle}
            data-profile-section={section}
            data-fading={fading}
            aria-busy={fading}
            inert={fading}
          >
            {isEditing && (
              <div className={styles.editorBack}>
                <button type="button" className={styles.textButton} onClick={() => select(section)}>
                  <Icon name="arrowRight" />
                  {t('profileEditor.back')}
                </button>
                <span>{languageNames[contentLocale]}</span>
              </div>
            )}
            {!!issues.length && (
              <div role="alert" className={styles.validationSummary}>
                {t('profileEditor.validationTitle')}
              </div>
            )}
            <form
              id="profile-editor-form"
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                void save();
              }}
            >
              <fieldset className={styles.editorFieldset} disabled={saving || !account.is_update}>
                {section === 'overview' && <IntroductionEditor />}
                {section === 'experience' &&
                  (experience ? (
                    <ExperienceEditor key={experience.id} entry={experience} />
                  ) : (
                    <ExperienceList />
                  ))}
                {section === 'projects' &&
                  (project ? (
                    <ProjectEditor key={project.id} project={project} />
                  ) : (
                    <ProjectList />
                  ))}
                {section === 'skills' && <SkillsEditor />}
              </fieldset>
            </form>
          </div>
        </main>
        <ContactIntroduction site={site} disclosure={contact} protectedControls={controls} />
        {confirmation && (
          <WarningModal
            title={t(
              `profileEditor.${confirmation.kind === 'import' ? 'importTitle' : confirmation.kind === 'delete' ? 'deleteTitle' : 'discardTitle'}`,
            )}
            message={t(
              `profileEditor.${confirmation.kind === 'import' ? 'importHint' : confirmation.kind === 'delete' ? 'deleteHint' : 'discardHint'}`,
            )}
            closeLabel={t('profileEditor.keepEditing')}
            onClose={() => setConfirmation(null)}
            confirm={{
              label: t(
                confirmation.kind === 'import'
                  ? 'profileEditor.loadSource'
                  : confirmation.kind === 'delete'
                    ? 'management.confirmDelete'
                    : 'profileEditor.discard',
              ),
              cancelLabel: t('profileEditor.keepEditing'),
              variant: confirmation.kind === 'import' ? 'primary' : 'danger',
              onConfirm: () => {
                confirmation.action();
                setConfirmation(null);
              },
            }}
          />
        )}
        {blocker.state === 'blocked' && (
          <WarningModal
            title={t('profileEditor.discardTitle')}
            message={t('profileEditor.discardHint')}
            closeLabel={t('profileEditor.keepEditing')}
            onClose={() => blocker.reset()}
            confirm={{
              label: t('profileEditor.discard'),
              cancelLabel: t('profileEditor.keepEditing'),
              variant: 'danger',
              onConfirm: () => blocker.proceed(),
            }}
          />
        )}
      </div>
    </ProfileEditorContext.Provider>
  );
}
