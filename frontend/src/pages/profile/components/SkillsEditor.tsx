import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { moveProfileItem, newProfileId } from '@/features/profile-content';
import { Icon } from './ProfileIcon';
import { useProfileEditor } from '../model/editor-context';
import { EditorField, EditorNotice, EditorPanel, EditorToggle, OrderButtons } from './EditorFields';
import { PreviewSkills } from './ProfilePreview';
import { ReorderGhost } from './ReorderGhost';
import { usePointerReorder } from '../model/usePointerReorder';
import styles from '../ProfilePage.module.css';

/** Category membership is separate from the skill library; renaming propagates through ID references. */
export function SkillsEditor() {
  const { t } = useTranslation();
  const {
    draft,
    update,
    contentLocale,
    confirm,
    openExperience,
    openProject,
    canCreate,
    canDelete,
  } = useProfileEditor();
  const [selected, setSelected] = useState(() => draft.categoryOrder[0] ?? '');
  const [skill, setSkill] = useState(
    () => draft.categories[draft.categoryOrder[0] ?? '']?.skillIds[0] ?? '',
  );
  const [newSkill, setNewSkill] = useState('');
  const [rename, setRename] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const sortHelp = useId();
  const category = draft.categories[selected] ?? draft.categories[draft.categoryOrder[0] ?? ''];
  const activeSkill = category?.skillIds.includes(skill)
    ? draft.skills[skill]
    : draft.skills[category?.skillIds[0] ?? ''];
  const selectedSkill = activeSkill?.id;
  const patchCategory = (values: Partial<NonNullable<typeof category>>) => {
    if (!category) return;
    update((current) => ({
      ...current,
      categories: {
        ...current.categories,
        [category.id]: { ...current.categories[category.id]!, ...values },
      },
    }));
  };
  // Pointer drops, handle arrow keys and step buttons all update the same normalized ID orders.
  const reorderCategories = (source: string, target: string, placement?: 'before' | 'after') => {
    const next = moveProfileItem(draft.categoryOrder, source, target, placement);
    if (next === draft.categoryOrder) return;
    update((current) => ({
      ...current,
      categoryOrder: moveProfileItem(current.categoryOrder, source, target, placement),
    }));
    setAnnouncement(
      t('profileEditor.reordered', {
        name: draft.categories[source]!.names[contentLocale],
        position: next.indexOf(source) + 1,
        total: next.length,
      }),
    );
  };
  const reorderSkills = (source: string, target: string, placement?: 'before' | 'after') => {
    if (!category) return;
    const next = moveProfileItem(category.skillIds, source, target, placement);
    if (next === category.skillIds) return;
    update((current) => {
      const item = current.categories[category.id];
      if (!item) return current;
      return {
        ...current,
        categories: {
          ...current.categories,
          [item.id]: {
            ...item,
            skillIds: moveProfileItem(item.skillIds, source, target, placement),
          },
        },
      };
    });
    setAnnouncement(
      t('profileEditor.reordered', {
        name: draft.skills[source]!.label,
        position: next.indexOf(source) + 1,
        total: next.length,
      }),
    );
  };
  const {
    ref: categoryListRef,
    drag: categoryDrag,
    item: categoryItem,
    handleProps: categoryHandleProps,
  } = usePointerReorder('vertical', reorderCategories);
  const {
    ref: skillListRef,
    drag: skillDrag,
    item: skillItem,
    handleProps: skillHandleProps,
  } = usePointerReorder('horizontal', reorderSkills);
  const dragging = categoryDrag ?? skillDrag;
  const addCategory = () => {
    const id = newProfileId('category');
    update((current) => ({
      ...current,
      categoryOrder: [...current.categoryOrder, id],
      categories: {
        ...current.categories,
        [id]: {
          id,
          visible: true,
          names: { en: 'New category', 'zh-Hant': '新增分類', 'zh-Hans': '新增分类' },
          skillIds: [],
        },
      },
    }));
    setSelected(id);
  };
  const addSkill = () => {
    if (!category || !newSkill.trim()) return;
    const label = newSkill.trim();
    const existing = Object.values(draft.skills).find(
      (item) => item.label.toLocaleLowerCase() === label.toLocaleLowerCase(),
    );
    const id = existing?.id ?? newProfileId('skill');
    update((current) => {
      const item = current.categories[category.id]!;
      return {
        ...current,
        skills: existing ? current.skills : { ...current.skills, [id]: { id, label } },
        categories: {
          ...current.categories,
          [item.id]: {
            ...item,
            skillIds: item.skillIds.includes(id) ? item.skillIds : [...item.skillIds, id],
          },
        },
      };
    });
    setSkill(id);
    setRename(null);
    setNewSkill('');
  };
  const uses = selectedSkill
    ? [
        ...draft.experienceOrder
          .filter((id) => draft.experiences[id]!.skillIds.includes(selectedSkill))
          .map((id) => ({
            id,
            name: draft.experiences[id]!.translations[contentLocale].organization,
            section: 'experience' as const,
          })),
        ...draft.projectOrder
          .filter((id) => draft.projects[id]!.skillIds.includes(selectedSkill))
          .map((id) => ({
            id,
            name: draft.projects[id]!.translations[contentLocale].name,
            section: 'projects' as const,
          })),
      ]
    : [];
  return (
    <div className={styles.skillColumns}>
      <span id={sortHelp} className="visually-hidden">
        {t('profileEditor.reorderHint')}
      </span>
      <span role="status" aria-live="polite" aria-atomic="true" className="visually-hidden">
        {dragging ? t('profileEditor.dragging', { name: dragging.label }) : announcement}
      </span>
      <ReorderGhost drag={dragging} />
      <EditorPanel
        title={t('profileEditor.categoryTitle')}
        description={t('profileEditor.categoryHint')}
      >
        <div ref={categoryListRef} className={styles.categoryList} data-reorder-list="categories">
          {draft.categoryOrder.map((id, index) => {
            const item = draft.categories[id]!;
            const name = item.names[contentLocale] || t('profileEditor.newName');
            return (
              <div
                className={styles.categoryRow}
                key={id}
                data-selected={category?.id === id}
                {...categoryItem(id)}
              >
                <div className={styles.categoryHeader}>
                  <button
                    type="button"
                    className={styles.reorderHandle}
                    aria-label={t('profileEditor.drag', { name })}
                    aria-describedby={sortHelp}
                    title={t('profileEditor.drag', { name })}
                    data-reorder-label={name}
                    {...categoryHandleProps}
                    onPointerDownCapture={() => setAnnouncement('')}
                  >
                    <Icon name="grip" />
                  </button>
                  <button
                    type="button"
                    className={styles.categoryChoice}
                    aria-pressed={category?.id === id}
                    onClick={() => {
                      setSelected(id);
                      setRename(null);
                    }}
                  >
                    <span>{name}</span>
                    <small>{item.skillIds.length}</small>
                  </button>
                </div>
                <OrderButtons
                  name={name}
                  index={index}
                  total={draft.categoryOrder.length}
                  onMove={(offset) => reorderCategories(id, draft.categoryOrder[index + offset]!)}
                />
              </div>
            );
          })}
        </div>
        <button type="button" className={styles.button} onClick={addCategory} disabled={!canCreate}>
          <Icon name="plus" />
          {t('profileEditor.newCategory')}
        </button>
      </EditorPanel>
      <div className={styles.stack}>
        {category ? (
          <>
            <EditorPanel
              title={category.names[contentLocale] || t('profileEditor.newName')}
              action={
                <EditorToggle
                  label={t('profileEditor.visible')}
                  checked={category.visible}
                  onChange={(visible) => patchCategory({ visible })}
                />
              }
            >
              <EditorField
                label={t('profileEditor.fields.categoryName')}
                required
                field={`categories.${category.id}`}
                value={category.names[contentLocale]}
                onChange={(value) =>
                  patchCategory({ names: { ...category.names, [contentLocale]: value } })
                }
              />
              <h3 className={styles.fieldTitle}>{t('profileEditor.categorySkills')}</h3>
              <p className={styles.hint}>{t('profileEditor.skillsSortHint')}</p>
              <div
                ref={skillListRef}
                className={styles.skillAssignments}
                data-reorder-list="skills"
              >
                {category.skillIds.map((id, index) => {
                  const item = draft.skills[id]!;
                  return (
                    <div
                      className={styles.skillAssignment}
                      key={id}
                      data-selected={selectedSkill === id}
                      {...skillItem(id)}
                    >
                      <button
                        type="button"
                        className={styles.reorderHandle}
                        aria-label={t('profileEditor.drag', { name: item.label })}
                        aria-describedby={sortHelp}
                        title={t('profileEditor.drag', { name: item.label })}
                        data-reorder-label={item.label}
                        {...skillHandleProps}
                        onPointerDownCapture={() => setAnnouncement('')}
                      >
                        <Icon name="grip" />
                      </button>
                      <button
                        type="button"
                        className={styles.skillChoice}
                        aria-pressed={selectedSkill === id}
                        onClick={() => {
                          setSkill(id);
                          setRename(null);
                        }}
                      >
                        {item.label}
                      </button>
                      <OrderButtons
                        name={item.label}
                        index={index}
                        total={category.skillIds.length}
                        onMove={(offset) => reorderSkills(id, category.skillIds[index + offset]!)}
                      />
                      <button
                        type="button"
                        className={styles.smallButton}
                        aria-label={t('profileEditor.removeSkill', { name: item.label })}
                        onClick={() => {
                          patchCategory({
                            skillIds: category.skillIds.filter((key) => key !== id),
                          });
                          setRename(null);
                        }}
                      >
                        <Icon name="close" />
                      </button>
                    </div>
                  );
                })}
              </div>
              <div className={styles.addSkill}>
                <EditorField
                  label={t('profileEditor.addSkill')}
                  value={newSkill}
                  placeholder={t('profileEditor.skillPlaceholder')}
                  maxLength={80}
                  onChange={setNewSkill}
                  list="profile-skill-library"
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      addSkill();
                    }
                  }}
                />
                <datalist id="profile-skill-library">
                  {Object.values(draft.skills).map((item) => (
                    <option key={item.id} value={item.label} />
                  ))}
                </datalist>
                <button
                  type="button"
                  className={`${styles.button} ${styles.primary}`}
                  disabled={
                    !newSkill.trim() ||
                    (!canCreate &&
                      !Object.values(draft.skills).some(
                        (item) =>
                          item.label.toLocaleLowerCase() === newSkill.trim().toLocaleLowerCase(),
                      ))
                  }
                  onClick={addSkill}
                >
                  <Icon name="plus" />
                  {t('profileEditor.addSkill')}
                </button>
              </div>
              <EditorNotice>{t('profileEditor.skillLibraryHint')}</EditorNotice>
            </EditorPanel>
            {activeSkill && (
              <EditorPanel title={`${activeSkill.label} · ${t('profileEditor.skillUses')}`}>
                <div className={styles.addSkill}>
                  <EditorField
                    label={t('profileEditor.fields.skillName')}
                    value={rename ?? activeSkill.label}
                    maxLength={80}
                    onChange={setRename}
                  />
                  <button
                    type="button"
                    className={styles.button}
                    disabled={
                      !rename?.trim() ||
                      Object.values(draft.skills).some(
                        (item) =>
                          item.id !== activeSkill.id &&
                          item.label.toLocaleLowerCase() === rename?.trim().toLocaleLowerCase(),
                      )
                    }
                    onClick={() => {
                      update((current) => ({
                        ...current,
                        skills: {
                          ...current.skills,
                          [activeSkill.id]: {
                            ...current.skills[activeSkill.id]!,
                            label: rename!.trim(),
                            ...(current.skills[activeSkill.id]!.labels
                              ? {
                                  labels: {
                                    ...current.skills[activeSkill.id]!.labels!,
                                    [contentLocale]: rename!.trim(),
                                  },
                                }
                              : {}),
                          },
                        },
                      }));
                      setRename(null);
                    }}
                  >
                    {t('profileEditor.renameSkill')}
                  </button>
                </div>
                {uses.map((item) => (
                  <div className={styles.fact} key={`${item.section}:${item.id}`}>
                    <span>
                      {item.name} · {t(`profileEditor.${item.section}`)}
                    </span>
                    <button
                      type="button"
                      className={styles.textButton}
                      onClick={() =>
                        item.section === 'experience'
                          ? openExperience(item.id)
                          : openProject(item.id)
                      }
                    >
                      {t('profileEditor.edit')}
                      <Icon name="arrowRight" />
                    </button>
                  </div>
                ))}
                {!uses.length && <p className={styles.hint}>{t('profileEditor.noUses')}</p>}
              </EditorPanel>
            )}
            <article
              className={styles.previewCard}
              data-profile-preview="skills"
              lang={contentLocale}
            >
              <p className={styles.eyebrow}>04 / ENGINEERING SKILLS</p>
              <h3>{category.names[contentLocale]}</h3>
              {!category.visible && (
                <span className={styles.badge}>{t('profileEditor.hiddenPreview')}</span>
              )}
              <PreviewSkills ids={category.skillIds} />
            </article>
            <button
              type="button"
              className={`${styles.textButton} ${styles.danger}`}
              disabled={!canDelete}
              onClick={() =>
                confirm(() => {
                  update((current) => {
                    const categories = { ...current.categories };
                    delete categories[category.id];
                    return {
                      ...current,
                      categories,
                      categoryOrder: current.categoryOrder.filter((id) => id !== category.id),
                    };
                  });
                })
              }
            >
              <Icon name="trash" />
              {t('profileEditor.deleteCategory')}
            </button>
          </>
        ) : (
          <EditorPanel>
            <EditorNotice>{t('profileEditor.empty')}</EditorNotice>
            <button type="button" className={styles.button} onClick={addCategory}>
              {t('profileEditor.newCategory')}
            </button>
          </EditorPanel>
        )}
      </div>
    </div>
  );
}
