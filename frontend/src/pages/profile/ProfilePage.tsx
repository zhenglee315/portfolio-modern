import { useEffect, useMemo, useRef, useState } from 'react';
import { useBlocker, useLocation, useNavigate, useSearchParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@/shared/api/http';
import { I18nextProvider, useTranslation } from 'react-i18next';
import { localeSchema, type Locale } from '@/i18n/config';
import { useProfileI18n } from '@/i18n/useProfileI18n';
import {
  AccountMenu,
  WorkspaceNavigation,
  WorkspaceNavigationToggle,
  useWorkspaceNavigation,
  profileSections as sections,
  profileSectionParams,
} from '@/features/account-menu';
import { AppearanceSettings, useAppearance } from '@/features/appearance';
import { LanguageMenu, LanguageOptions, languageNames } from '@/features/language';
import { useAccessDeniedRedirect, useAccountSession } from '@/features/auth/actions';
import type { AuthUser } from '@/features/auth/session';
import {
  profileDraftIssues,
  saveProfileContent,
  useProfileDraft,
  type DraftIssue,
  type ProfileSection,
  type ProfileDraft,
} from '@/features/profile-content';
import { Breadcrumb } from '@/shared/ui/Breadcrumb';
import { Icon } from '@/shared/ui/Icon';
import { LoadingIndicator } from '@/shared/ui/LoadingIndicator';
import WarningModal from '@/shared/ui/WarningModal';
import { useNotifications } from '@/shared/ui/NotificationProvider';
import BackgroundField from '@/shared/ui/background-field/BackgroundField';
import { usePageEntrance } from '@/shared/hooks/usePageEntrance';
import entranceStyles from '@/shared/ui/PageEntrance.module.css';
import { ProfileEditorContext } from './model/editor-context';
import { useProfileViewFade } from './model/useProfileViewFade';
import { useProfileContent } from './model/useProfileContent';
import {
  useProfileProjects,
  projectPageNumber,
  projectSizeNumber,
} from './model/useProfileProjects';
import { loadProfileContent } from './model/loadProfileContent';
import { ProfileActions } from './components/ProfileActions';
import { ProfileSourceNotice } from './components/ProfileSourceNotice';
import { ExperienceList } from './components/ExperienceList';
import { ExperienceEditor } from './components/ExperienceEditor';
import { IntroductionEditor } from './components/IntroductionEditor';
import { ProjectEditor } from './components/ProjectEditor';
import { ProjectList } from './components/ProjectList';
import { ProjectPageStatus } from './components/ProjectPageStatus';
import { SkillsEditor } from './components/SkillsEditor';
import { ProfilePreviewModal } from './components/ProfilePreviewModal';
import { ProfileHelp } from './components/ProfileHelp';
import styles from './ProfilePage.module.css';

/** Route-scoped copy loads with the editor, preserving public first-view asset budgets. */
export function ProfilePage({ locale }: { locale: Locale }) {
  const i18n = useProfileI18n(locale);
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

/** Compose the original shell around owner content and a single explicit API save. */
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
  const heading = useRef<HTMLHeadingElement>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const [previewPage, setPreviewPage] = useState<number | null>(() =>
    params.get('section') === 'showcase' ? 1 : null,
  );
  const workspace = useWorkspaceNavigation();
  const { compact } = workspace;
  const [previewSize, setPreviewSize] = useState(6);
  const [issues, setIssues] = useState<DraftIssue[]>([]);
  const [confirmation, setConfirmation] = useState<{
    action: () => void;
    kind: 'delete' | 'discard' | 'import';
    message?: string;
  } | null>(null);
  const editor = useProfileDraft(account.id, source);
  const { draft, update, dirty, hasSaved } = editor;
  usePageEntrance(root, { paused: motionPaused, subscribe: subscribeThemeTransition });
  const requestedSection = params.get('section');
  useEffect(() => {
    // Normalize former Journey/preview entry URLs while retaining the same working copy.
    if (requestedSection !== 'journey' && requestedSection !== 'showcase') return;
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
  const projectSize = projectSizeNumber(params.get('projectSize'));
  const projectPage = projectPageNumber(
    params.get('projectPage'),
    draft.projectOrder.length,
    projectSize,
  );
  const modalProjectPage = projectPageNumber(
    String(previewPage ?? 1),
    draft.projectOrder.length,
    previewSize,
  );
  const pageProjects = draft.projectOrder.slice(
    (projectPage - 1) * projectSize,
    projectPage * projectSize,
  );
  const requiredProjects =
    previewPage !== null
      ? draft.projectOrder.slice(
          (modalProjectPage - 1) * previewSize,
          modalProjectPage * previewSize,
        )
      : section === 'projects' && editing
        ? draft.projectOrder.filter((id) => id === editing)
        : section === 'projects'
          ? pageProjects
          : [];
  const projectContent = useProfileProjects(
    draft,
    requiredProjects,
    editor.hydrateProjects,
    previewPage !== null ? previewSize : projectSize,
  );
  const isEditing = !!experience || !!project;
  const blocker = useBlocker(
    ({ nextLocation }) =>
      dirty && !/^\/(en|zh-Hant|zh-Hans)\/profile\/?$/.test(nextLocation.pathname),
  );
  const confirm = (
    action: () => void,
    kind: 'delete' | 'discard' | 'import' = 'delete',
    message?: string,
  ) => setConfirmation({ action, kind, message });
  const select = (next: ProfileSection, edit?: string) => {
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
      else select(/^(categories|skills)\./.test(first.field) ? 'skills' : 'overview');
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
        projectPage,
        projectSize,
        projectLoading: projectContent.loading,
        projectError: projectContent.error,
        retryProjects: projectContent.retry,
        reloadContent: () =>
          confirm(() => {
            void reloadServer();
          }, 'import'),
        openProjectPage: (page) =>
          setParams(
            (current) => {
              const next = new URLSearchParams(current);
              next.set('projectPage', String(page));
              return next;
            },
            { preventScrollReset: true },
          ),
        openProjectSize: (size) =>
          setParams(
            (current) => {
              const next = new URLSearchParams(current);
              next.set('projectSize', String(size));
              next.set('projectPage', '1');
              return next;
            },
            { preventScrollReset: true },
          ),
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
        confirm: (action, kind, message) => {
          if (!saveLock.current) confirm(action, kind, message);
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
        <WorkspaceNavigation
          controls={workspace}
          account={account}
          locale={locale}
          active={selectedSection}
          disabled={saving}
          profile={{ params, onSelect: select }}
        />
        <main id="profile-content" className={styles.main} data-entrance-content>
          <div className={styles.contextRow}>
            <WorkspaceNavigationToggle controls={workspace} disabled={saving} />
            <Breadcrumb
              label={t('breadcrumb.label')}
              items={[
                { label: t('ui.overview'), href: publicHref, icon: 'home' },
                { label: account.user },
                { label: t('profileEditor.label') },
                { label: t(`profileEditor.${selectedSection}`) },
              ]}
            />
            <div className={styles.controls}>
              <AccountMenu
                account={account}
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
            <ProfileActions
              publicHref={publicHref}
              onPreview={() => {
                setPreviewPage(1);
              }}
            />
          </header>
          <div className={styles.editorTools}>
            <div className={styles.localeTools}>
              <div className={styles.contentLocale}>
                <LanguageMenu
                  locale={contentLocale}
                  busy={saving}
                  disabled={saving}
                  variant="text"
                  label={t('profileEditor.contentLanguage')}
                  onChange={(value) => {
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
                />
              </div>
              <ProfileHelp />
            </div>
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
              <fieldset
                className={styles.editorFieldset}
                disabled={saving || (!account.is_update && section !== 'projects')}
              >
                {section === 'overview' && <IntroductionEditor />}
                {section === 'experience' &&
                  (experience ? (
                    <ExperienceEditor key={experience.id} entry={experience} />
                  ) : (
                    <ExperienceList />
                  ))}
                {section === 'projects' &&
                  (editing && (projectContent.loading || projectContent.error) ? (
                    <ProjectPageStatus />
                  ) : project ? (
                    <fieldset className={styles.editorFieldset} disabled={!account.is_update}>
                      <ProjectEditor key={project.id} project={project} />
                    </fieldset>
                  ) : (
                    <ProjectList />
                  ))}
                {section === 'skills' && <SkillsEditor />}
              </fieldset>
            </form>
          </div>
        </main>
        {previewPage !== null && (
          <ProfilePreviewModal
            page={modalProjectPage}
            size={previewSize}
            onSizeChange={(size) => {
              setPreviewSize(size);
              setPreviewPage(1);
            }}
            onPageChange={setPreviewPage}
            onClose={() => setPreviewPage(null)}
          />
        )}
        {confirmation && (
          <WarningModal
            title={t(
              `profileEditor.${confirmation.kind === 'import' ? 'importTitle' : confirmation.kind === 'delete' ? 'deleteTitle' : 'discardTitle'}`,
            )}
            message={
              confirmation.message ??
              t(
                `profileEditor.${confirmation.kind === 'import' ? 'importHint' : confirmation.kind === 'delete' ? 'deleteHint' : 'discardHint'}`,
              )
            }
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
