import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useProfileEditor } from '../model/editor-context';
import { profileProjectReferences } from '@/features/profile-content';
import { Icon } from './ProfileIcon';
import { EditorPagination } from './EditorPagination';
import styles from '../ProfilePage.module.css';

/** Page normalized references locally; navigation never changes the draft or requests partial data. */
export function SkillUsageList({ skillId }: { skillId: string }) {
  const { t } = useTranslation();
  const { draft, contentLocale, openExperience, openProject } = useProfileEditor();
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(5);
  const uses = [
    ...draft.experienceOrder
      .filter((id) => draft.experiences[id]!.skillIds.includes(skillId))
      .map((id) => ({
        id,
        name: draft.experiences[id]!.translations[contentLocale].organization,
        section: 'experience' as const,
      })),
    ...profileProjectReferences(draft)
      .filter((item) => item.skillIds.includes(skillId))
      .map((item) => ({
        id: item.id,
        name: item.names?.[contentLocale] || t('profileEditor.newName'),
        section: 'projects' as const,
      })),
  ];
  const pages = Math.max(1, Math.ceil(uses.length / size));
  // Draft changes can remove references while this list is open; never leave an empty trailing page.
  const currentPage = Math.min(page, pages);
  const start = (currentPage - 1) * size;

  return (
    <div className={styles.skillUsageList} data-profile-skill-uses>
      {uses.slice(start, start + size).map((item) => (
        <div className={styles.fact} key={`${item.section}:${item.id}`}>
          <span>
            {item.name} · {t(`profileEditor.${item.section}`)}
          </span>
          <button
            type="button"
            className={styles.textButton}
            onClick={() =>
              item.section === 'experience' ? openExperience(item.id) : openProject(item.id)
            }
          >
            {t('profileEditor.edit')}
            <Icon name="arrowRight" />
          </button>
        </div>
      ))}
      {!uses.length ? (
        <p className={styles.hint}>{t('profileEditor.noUses')}</p>
      ) : (
        <EditorPagination
          page={currentPage}
          size={size}
          total={uses.length}
          defaultSize={5}
          range="skillUsageRange"
          label={t('profileEditor.skillUsagePagination')}
          onPageChange={setPage}
          onSizeChange={(next) => {
            setSize(next);
            setPage(1);
          }}
        />
      )}
    </div>
  );
}
