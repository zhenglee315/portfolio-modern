import { useTranslation } from 'react-i18next';
import { removeProfileExperience, type ProfileExperience } from '@/features/profile-content';
import { useProfileEditor } from '../model/editor-context';
import {
  EditorArea,
  EditorField,
  EditorNotice,
  EditorPanel,
  EditorToggle,
  SkillPicker,
} from './EditorFields';
import { ExperiencePreview, PreviewHeading } from './ProfilePreview';
import { PeriodFields } from './PeriodFields';
import { ExperienceLocation } from './ExperienceLocation';
import { JourneyPreview } from './JourneyPreview';
import styles from '../ProfilePage.module.css';

/** Career fields update one normalized record; its city/date changes immediately reach Journey. */
export function ExperienceEditor({ entry }: { entry: ProfileExperience }) {
  const { t } = useTranslation();
  const { update, contentLocale, openExperience, confirm, canDelete } = useProfileEditor();
  const copy = entry.translations[contentLocale];
  const prefix = `experiences.${entry.id}`;
  const patch = (value: Partial<ProfileExperience>) =>
    update((draft) => ({
      ...draft,
      experiences: {
        ...draft.experiences,
        [entry.id]: { ...draft.experiences[entry.id]!, ...value },
      },
    }));
  const translate = (value: Partial<typeof copy>) =>
    update((draft) => {
      const current = draft.experiences[entry.id]!;
      return {
        ...draft,
        experiences: {
          ...draft.experiences,
          [entry.id]: {
            ...current,
            translations: {
              ...current.translations,
              [contentLocale]: { ...current.translations[contentLocale], ...value },
            },
          },
        },
      };
    });
  return (
    <div className={styles.columns}>
      <div className={styles.stack}>
        <EditorPanel title={t('profileEditor.basic')} description={t('profileEditor.basicHint')}>
          <div className={styles.typeRow}>
            <fieldset className={styles.typeOptions}>
              <legend className="visually-hidden">{t('profileEditor.experience')}</legend>
              {(['work', 'education'] as const).map((type) => (
                <label key={type} data-selected={entry.type === type}>
                  <input
                    type="radio"
                    name={`career-type-${entry.id}`}
                    checked={entry.type === type}
                    onChange={() => patch({ type })}
                  />
                  {t(`profileEditor.${type}`)}
                </label>
              ))}
            </fieldset>
            <span className={styles.hint}>{t('profileEditor.requiredHint')}</span>
          </div>
          <EditorField
            label={t('profileEditor.fields.organization')}
            value={copy.organization}
            field={`${prefix}.organization`}
            required
            maxLength={200}
            onChange={(organization) => translate({ organization })}
          />
          <EditorField
            label={t('profileEditor.fields.careerTitle')}
            value={copy.title}
            field={`${prefix}.title`}
            required
            maxLength={200}
            onChange={(title) => translate({ title })}
          />
          <PeriodFields value={entry} prefix={prefix} onChange={patch} />
        </EditorPanel>
        <ExperienceLocation entry={entry} onChange={patch} onTranslate={translate} />
        <EditorPanel
          title={t('profileEditor.experienceContent')}
          description={t('profileEditor.experienceContentHint')}
        >
          <EditorArea
            label={t('profileEditor.fields.careerContent')}
            value={copy.content}
            field={`${prefix}.content`}
            onChange={(content) => translate({ content })}
            required
            help={t('profileEditor.bioHint')}
          />
          <div>
            <h3 className={styles.fieldTitle}>{t('profileEditor.skills')}</h3>
            <p className={styles.hint}>{t('profileEditor.skillsHint')}</p>
          </div>
          <SkillPicker selected={entry.skillIds} onChange={(skillIds) => patch({ skillIds })} />
        </EditorPanel>
        <EditorPanel title={t('profileEditor.detail')} description={t('profileEditor.detailHint')}>
          {entry.detail ? (
            <>
              <EditorField
                label={t('profileEditor.fields.detailContent')}
                value={copy.detail}
                onChange={(detail) => translate({ detail })}
              />
              <PeriodFields
                prefix={`${prefix}.detail`}
                value={{ ...entry.detail, endDay: '', expected: false }}
                exactDay={false}
                allowExpected={false}
                onChange={(value) =>
                  patch({
                    detail: {
                      startMonth: value.startMonth ?? entry.detail!.startMonth,
                      endMonth: value.endMonth ?? entry.detail!.endMonth,
                    },
                  })
                }
              />
              <button
                type="button"
                className={`${styles.textButton} ${styles.danger}`}
                disabled={!canDelete}
                onClick={() => patch({ detail: null })}
              >
                {t('profileEditor.removeDetail')}
              </button>
            </>
          ) : (
            <button
              type="button"
              className={styles.button}
              onClick={() =>
                patch({ detail: { startMonth: entry.startMonth, endMonth: entry.endMonth } })
              }
            >
              {t('profileEditor.addDetail')}
            </button>
          )}
        </EditorPanel>
      </div>
      <aside className={styles.preview} aria-label={t('profileEditor.livePreview')}>
        <PreviewHeading section="Experience" />
        <ExperiencePreview entry={entry} />
        <EditorPanel title={t('profileEditor.displaySettings')}>
          <EditorToggle
            label={t('profileEditor.visible')}
            checked={entry.visible}
            onChange={(visible) => patch({ visible })}
          />
          <p className={styles.hint}>{t('profileEditor.careerDisplayHint')}</p>
          <div className={styles.fact}>
            <span>{t('profileEditor.label')}</span>
            <strong>Experience · Journey</strong>
          </div>
        </EditorPanel>
        <JourneyPreview selectedId={entry.id} />
        <EditorNotice>{t('profileEditor.previewHint')}</EditorNotice>
        <EditorPanel title={t('profileEditor.manageExperience')}>
          <p className={styles.hint}>{t('profileEditor.hideHint')}</p>
          <button
            type="button"
            className={`${styles.textButton} ${styles.danger}`}
            disabled={!canDelete}
            onClick={() =>
              confirm(() => {
                update((draft) => removeProfileExperience(draft, entry.id));
                openExperience();
              })
            }
          >
            {t('profileEditor.deleteExperience')}
          </button>
        </EditorPanel>
      </aside>
    </div>
  );
}
