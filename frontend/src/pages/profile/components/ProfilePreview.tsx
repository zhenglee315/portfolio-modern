import { useTranslation } from 'react-i18next';
import type { ProfileExperience, ProfileProject } from '@/features/profile-content';
import { Icon } from './ProfileIcon';
import { useProfileEditor } from '../model/editor-context';
import { editorPeriod } from '../model/presentation';
import { EditorNotice } from './EditorFields';
import styles from '../ProfilePage.module.css';

/** Render only referenced skills; missing IDs never become empty preview tags. */
export function PreviewSkills({ ids }: { ids: string[] }) {
  const { draft } = useProfileEditor();
  return (
    <div className={styles.tags}>
      {ids.map(
        (id) =>
          draft.skills[id] && (
            <span className={styles.tag} key={id}>
              {draft.skills[id]!.label}
            </span>
          ),
      )}
    </div>
  );
}

export function PreviewHeading({ section }: { section: string }) {
  const { t } = useTranslation();
  return (
    <div className={styles.previewHeading}>
      <Icon name="eye" />
      <h2>{t('profileEditor.preview')}</h2>
      <span>{section}</span>
    </div>
  );
}

/** A semantic live card previews the working copy in the reviewed Figma composition. */
export function ExperiencePreview({ entry }: { entry?: ProfileExperience }) {
  const { t } = useTranslation();
  const { contentLocale } = useProfileEditor();
  if (!entry) return <EditorNotice>{t('profileEditor.empty')}</EditorNotice>;
  const copy = entry.translations[contentLocale];
  return (
    <article className={styles.previewCard} data-profile-preview="experience" lang={contentLocale}>
      <p className={styles.eyebrow}>02 / THE EXPERIENCE</p>
      {!entry.visible && <span className={styles.badge}>{t('profileEditor.hiddenPreview')}</span>}
      <p className={styles.period}>{editorPeriod(entry, contentLocale, t)}</p>
      <h3>
        <Icon name={entry.type === 'education' ? 'education' : 'building'} />
        {copy.organization || t('profileEditor.newName')}
      </h3>
      <p className={styles.previewRole}>{copy.title || '—'}</p>
      <p className={styles.period}>
        {[copy.city, copy.country].filter(Boolean).join(' · ') || '—'}
      </p>
      <p className={styles.previewCopy}>{copy.content || '—'}</p>
      {entry.detail && copy.detail && (
        <p className={styles.detailCopy}>
          {copy.detail} ·{' '}
          {editorPeriod({ ...entry.detail, endDay: '', expected: false }, contentLocale, t)}
        </p>
      )}
      <PreviewSkills ids={entry.skillIds} />
    </article>
  );
}

export function ProjectPreview({ project }: { project?: ProfileProject }) {
  const { t } = useTranslation();
  const { draft, contentLocale } = useProfileEditor();
  if (!project) return <EditorNotice>{t('profileEditor.empty')}</EditorNotice>;
  const copy = project.translations[contentLocale];
  const experience = project.experienceId ? draft.experiences[project.experienceId] : undefined;
  return (
    <article className={styles.previewCard} data-profile-preview="project" lang={contentLocale}>
      <p className={styles.eyebrow}>03 / SELECTED WORK</p>
      {!project.visible && <span className={styles.badge}>{t('profileEditor.hiddenPreview')}</span>}
      <p className={styles.period}>{copy.title}</p>
      <h3>{copy.name || t('profileEditor.newName')}</h3>
      {(experience || copy.organization) && (
        <p className={styles.previewRole}>
          {experience?.translations[contentLocale].organization ?? copy.organization}
        </p>
      )}
      <p className={styles.period}>{editorPeriod(project, contentLocale, t)}</p>
      <p className={styles.previewCopy}>{copy.intro || '—'}</p>
      {(['workflow', 'technical', 'contribution', 'outcome'] as const).map(
        (field) =>
          (copy[field].trim() || (field === 'workflow' && copy.flow.some(Boolean))) && (
            <section className={styles.previewDetail} key={field}>
              <h4>{t(`profileEditor.fields.${field}`)}</h4>
              <p className={styles.previewCopy}>{copy[field]}</p>
              {field === 'workflow' && copy.flow.some(Boolean) && (
                <ol className={styles.flowPreview}>
                  {copy.flow.filter(Boolean).map((step, index) => (
                    <li key={index}>{step}</li>
                  ))}
                </ol>
              )}
            </section>
          ),
      )}
      <PreviewSkills ids={project.skillIds} />
    </article>
  );
}
