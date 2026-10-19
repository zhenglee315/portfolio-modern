import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  newProfileProject,
  moveProfileItem,
  type ProfileProject,
} from '@/features/profile-content';
import { Icon } from './ProfileIcon';
import { useProfileEditor } from '../model/editor-context';
import { editorPeriod } from '../model/presentation';
import {
  EditorArea,
  EditorField,
  EditorNotice,
  EditorPanel,
  EditorSelect,
  EditorToggle,
  OrderButtons,
  SkillPicker,
} from './EditorFields';
import { PreviewHeading, ProjectPreview } from './ProfilePreview';
import { PeriodFields } from './PeriodFields';
import styles from '../ProfilePage.module.css';

/** Projects use the same list/editor pattern as career entries and retain linked experience IDs. */
export function ProjectList() {
  const { t } = useTranslation();
  const { draft, contentLocale, update, openProject, canCreate } = useProfileEditor();
  const [selected, setSelected] = useState(() => draft.projectOrder[0] ?? '');
  const entries = draft.projectOrder.map((id) => draft.projects[id]!);
  const project = draft.projects[selected] ?? entries[0];
  return (
    <div className={styles.columns}>
      <div className={styles.stack}>
        <div className={styles.listToolbar}>
          <p className={styles.hint}>{t('profileEditor.projectHint')}</p>
          <button
            type="button"
            className={`${styles.button} ${styles.primary}`}
            disabled={!canCreate}
            onClick={() => {
              const item = newProfileProject(draft.experienceOrder[0] ?? null);
              update((current) => ({
                ...current,
                projects: { ...current.projects, [item.id]: item },
                projectOrder: [item.id, ...current.projectOrder],
              }));
              openProject(item.id);
            }}
          >
            <Icon name="plus" />
            {t('profileEditor.addProject')}
          </button>
        </div>
        {entries.map((item, index) => {
          const copy = item.translations[contentLocale];
          const name = copy.name || t('profileEditor.newName');
          return (
            <EditorPanel key={item.id} className={styles.projectRow}>
              <button
                type="button"
                className={styles.rowSummary}
                onClick={() => setSelected(item.id)}
                aria-pressed={project?.id === item.id}
              >
                <span className={styles.eyebrow}>{copy.title || 'PROJECT'}</span>
                <strong className={styles.projectTitle}>{name}</strong>
                <span>{copy.intro}</span>
                <small>{editorPeriod(item, contentLocale, t)}</small>
              </button>
              <div className={styles.listToolbar}>
                <EditorToggle
                  label={t('profileEditor.visible')}
                  checked={item.visible}
                  onChange={(visible) =>
                    update((current) => ({
                      ...current,
                      projects: {
                        ...current.projects,
                        [item.id]: { ...current.projects[item.id]!, visible },
                      },
                    }))
                  }
                />
                <div className={styles.actions}>
                  <OrderButtons
                    name={name}
                    index={index}
                    total={entries.length}
                    onMove={(offset) =>
                      update((current) => ({
                        ...current,
                        projectOrder: moveProfileItem(
                          current.projectOrder,
                          item.id,
                          current.projectOrder[index + offset]!,
                        ),
                      }))
                    }
                  />
                  <button
                    type="button"
                    className={styles.textButton}
                    onClick={() => openProject(item.id)}
                  >
                    {t('profileEditor.edit')}
                    <Icon name="arrowRight" />
                  </button>
                </div>
              </div>
            </EditorPanel>
          );
        })}
        {!entries.length && <EditorNotice>{t('profileEditor.empty')}</EditorNotice>}
      </div>
      <aside className={styles.preview}>
        <PreviewHeading section="Projects" />
        <ProjectPreview project={project} />
      </aside>
    </div>
  );
}

/** Structured detail fields map directly to the existing public project's content sections. */
export function ProjectEditor({ project }: { project: ProfileProject }) {
  const { t } = useTranslation();
  const { draft, update, contentLocale, confirm, openProject, canDelete } = useProfileEditor();
  const copy = project.translations[contentLocale];
  const prefix = `projects.${project.id}`;
  const patch = (value: Partial<ProfileProject>) =>
    update((current) => ({
      ...current,
      projects: {
        ...current.projects,
        [project.id]: { ...current.projects[project.id]!, ...value },
      },
    }));
  const translate = (value: Partial<typeof copy>) =>
    update((current) => {
      const item = current.projects[project.id]!;
      return {
        ...current,
        projects: {
          ...current.projects,
          [project.id]: {
            ...item,
            translations: {
              ...item.translations,
              [contentLocale]: { ...item.translations[contentLocale], ...value },
            },
          },
        },
      };
    });
  return (
    <div className={styles.columns}>
      <div className={styles.stack}>
        <EditorPanel title={t('profileEditor.basic')} description={t('profileEditor.projectHint')}>
          <EditorField
            label={t('profileEditor.fields.projectName')}
            value={copy.name}
            required
            field={`${prefix}.name`}
            onChange={(name) => translate({ name })}
          />
          <EditorField
            label={t('profileEditor.fields.projectTitle')}
            value={copy.title}
            onChange={(title) => translate({ title })}
          />
          <EditorSelect
            label={t('profileEditor.fields.experienceId')}
            value={project.experienceId ?? ''}
            onChange={(experienceId) => patch({ experienceId: experienceId || null })}
          >
            <option value="">{t('profileEditor.noCareer')}</option>
            {draft.experienceOrder.map((id) => (
              <option value={id} key={id}>
                {draft.experiences[id]!.translations[contentLocale].organization} ·{' '}
                {draft.experiences[id]!.translations[contentLocale].title}
              </option>
            ))}
          </EditorSelect>
          {!project.experienceId && (
            <>
              <EditorField
                label={t('profileEditor.fields.projectOrganization')}
                value={copy.organization ?? ''}
                onChange={(organization) => translate({ organization })}
              />
              <div className={styles.fields}>
                <EditorField
                  label={t('profileEditor.fields.organizationCode')}
                  value={copy.organizationCode ?? ''}
                  onChange={(organizationCode) => translate({ organizationCode })}
                />
                <EditorField
                  label={t('profileEditor.fields.organizationTitle')}
                  value={copy.organizationTitle ?? ''}
                  onChange={(organizationTitle) => translate({ organizationTitle })}
                />
              </div>
            </>
          )}
          <PeriodFields value={project} prefix={prefix} onChange={patch} />
          <EditorArea
            label={t('profileEditor.fields.projectIntro')}
            value={copy.intro}
            field={`${prefix}.intro`}
            required
            onChange={(intro) => translate({ intro })}
          />
        </EditorPanel>
        <EditorPanel
          title={t('profileEditor.projectDetails')}
          description={t('profileEditor.projectDetailsHint')}
        >
          <EditorArea
            label={t('profileEditor.fields.workflow')}
            value={copy.workflow}
            onChange={(workflow) => translate({ workflow })}
          />
          <div className={styles.stackSmall}>
            <h3 className={styles.fieldTitle}>{t('profileEditor.fields.flow')}</h3>
            {copy.flow.map((step, index) => (
              <div className={styles.stepRow} key={index}>
                <EditorField
                  label={t('profileEditor.step', { number: index + 1 })}
                  value={step}
                  onChange={(value) =>
                    translate({ flow: copy.flow.map((item, i) => (i === index ? value : item)) })
                  }
                />
                <button
                  type="button"
                  className={styles.smallButton}
                  aria-label={t('profileEditor.removeSkill', {
                    name: t('profileEditor.step', { number: index + 1 }),
                  })}
                  onClick={() => translate({ flow: copy.flow.filter((_, i) => i !== index) })}
                >
                  <Icon name="close" />
                </button>
              </div>
            ))}
            <button
              type="button"
              className={styles.button}
              disabled={copy.flow.length >= 30}
              onClick={() => translate({ flow: [...copy.flow, ''] })}
            >
              <Icon name="plus" />
              {t('profileEditor.addStep')}
            </button>
          </div>
          {(['technical', 'contribution', 'outcome'] as const).map((field) => (
            <EditorArea
              key={field}
              label={t(`profileEditor.fields.${field}`)}
              value={copy[field]}
              onChange={(value) => translate({ [field]: value })}
            />
          ))}
          <div>
            <h3 className={styles.fieldTitle}>{t('profileEditor.skills')}</h3>
            <p className={styles.hint}>{t('profileEditor.skillsHint')}</p>
          </div>
          <SkillPicker selected={project.skillIds} onChange={(skillIds) => patch({ skillIds })} />
        </EditorPanel>
      </div>
      <aside className={styles.preview}>
        <PreviewHeading section="Projects" />
        <ProjectPreview project={project} />
        <EditorPanel title={t('profileEditor.displaySettings')}>
          <EditorToggle
            label={t('profileEditor.visible')}
            checked={project.visible}
            onChange={(visible) => patch({ visible })}
          />
          <p className={styles.hint}>{t('profileEditor.hideHint')}</p>
        </EditorPanel>
        <EditorNotice>{t('profileEditor.previewHint')}</EditorNotice>
        <EditorPanel>
          <button
            type="button"
            className={`${styles.textButton} ${styles.danger}`}
            disabled={!canDelete}
            onClick={() =>
              confirm(() => {
                update((current) => {
                  const projects = { ...current.projects };
                  delete projects[project.id];
                  return {
                    ...current,
                    projects,
                    projectOrder: current.projectOrder.filter((id) => id !== project.id),
                  };
                });
                openProject();
              })
            }
          >
            <Icon name="trash" />
            {t('profileEditor.deleteProject')}
          </button>
        </EditorPanel>
      </aside>
    </div>
  );
}
