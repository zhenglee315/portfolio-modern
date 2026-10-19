import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { moveProfileItem, newProfileId } from '@/features/profile-content';
import { Icon } from './ProfileIcon';
import { useProfileEditor } from '../model/editor-context';
import { EditorField, EditorNotice, EditorPanel, EditorToggle } from './EditorFields';
import { ReorderGhost } from './ReorderGhost';
import { ReorderHandle } from './ReorderHandle';
import { AddContentTile } from './AddContentTile';
import { SkillUsageList } from './SkillUsageList';
import { SkillRenameInput } from './SkillRenameInput';
import { InlineNameInput } from './InlineNameInput';
import { ProfileHelp } from './ProfileHelp';
import { SkillsPreview } from './SkillsPreview';
import { SwipeReveal } from './SwipeReveal';
import { usePointerReorder } from '../model/usePointerReorder';
import styles from '../ProfilePage.module.css';

/** Category membership is separate from the skill library; renaming propagates through ID references. */
export function SkillsEditor() {
  const { t } = useTranslation();
  const { draft, update, contentLocale, confirm, canCreate, canDelete } = useProfileEditor();
  const [selected, setSelected] = useState(() => draft.categoryOrder[0] ?? '');
  const [skill, setSkill] = useState(
    () => draft.categories[draft.categoryOrder[0] ?? '']?.skillIds[0] ?? '',
  );
  const [newSkill, setNewSkill] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const [openCategory, setOpenCategory] = useState<string | null>(null);
  const sortHelp = useId();
  const categoryName = useRef<HTMLInputElement>(null);
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
  // Pointer drops and handle arrow keys update the same normalized ID orders.
  const reorderCategories = (source: string, target: string, placement?: 'before' | 'after') => {
    const next = moveProfileItem(draft.categoryOrder, source, target, placement);
    if (next === draft.categoryOrder) return;
    setOpenCategory(null);
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
    listStyle: categoryListStyle,
    drag: categoryDrag,
    item: categoryItem,
    handleProps: categoryHandleProps,
  } = usePointerReorder('vertical', reorderCategories);
  const {
    ref: skillListRef,
    listStyle: skillListStyle,
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
  /** Remove the requested category only; shared skills and their other references stay intact. */
  const deleteCategory = (id: string) =>
    confirm(() => {
      setOpenCategory(null);
      update((current) => {
        const categories = { ...current.categories };
        delete categories[id];
        return {
          ...current,
          categories,
          categoryOrder: current.categoryOrder.filter((key) => key !== id),
        };
      });
    });
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
    setNewSkill('');
  };
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
        <AddContentTile
          onClick={addCategory}
          disabled={!canCreate}
          label={t('profileEditor.newCategory')}
        />
        <div
          ref={categoryListRef}
          style={categoryListStyle}
          className={styles.categoryList}
          data-reorder-list="categories"
        >
          {draft.categoryOrder.map((id) => {
            const item = draft.categories[id]!;
            const name = item.names[contentLocale] || t('profileEditor.newName');
            return (
              <SwipeReveal
                className={`${styles.reorderCard} ${styles.reorderItem}`}
                key={id}
                data-selected={category?.id === id}
                {...categoryItem(id)}
                open={openCategory === id && !categoryDrag}
                onOpenChange={(open) => setOpenCategory(open ? id : null)}
                label={t('profileEditor.categoryActions', { name })}
                triggerIcon="threeDotsVertical"
                edit={{
                  label: `${t('profileEditor.edit')} ${name}`,
                  onClick: () => {
                    setSelected(id);
                    // React commits the selected category before focusing its existing name field.
                    requestAnimationFrame(() => {
                      categoryName.current?.focus({ preventScroll: true });
                      categoryName.current?.scrollIntoView({
                        block: 'nearest',
                        behavior: 'instant',
                      });
                    });
                  },
                }}
                action={
                  <button
                    type="button"
                    aria-label={`${t('profileEditor.deleteCategory')}: ${name}`}
                    disabled={!canDelete}
                    onClick={() => deleteCategory(id)}
                  >
                    <Icon name="trash" />
                    <span>{t('management.confirmDelete')}</span>
                  </button>
                }
              >
                <ReorderHandle
                  name={name}
                  description={sortHelp}
                  handlers={categoryHandleProps}
                  onStart={() => {
                    setAnnouncement('');
                    setOpenCategory(null);
                  }}
                />
                <button
                  type="button"
                  className={styles.categoryChoice}
                  aria-pressed={category?.id === id}
                  onClick={() => {
                    setSelected(id);
                  }}
                >
                  <span>{name}</span>
                  <small>{item.skillIds.length}</small>
                </button>
              </SwipeReveal>
            );
          })}
        </div>
      </EditorPanel>
      <div className={styles.stack}>
        {category ? (
          <>
            <EditorPanel>
              <div className={`${styles.panelHeading} ${styles.categoryEditorHeading}`}>
                <h2>
                  {t('profileEditor.fields.categoryName')} <span aria-hidden="true">*</span>
                </h2>
                <InlineNameInput
                  inputRef={categoryName}
                  label={t('profileEditor.fields.categoryName')}
                  required
                  maxLength={255}
                  field={`categories.${category.id}`}
                  value={category.names[contentLocale]}
                  error={
                    !category.names[contentLocale].trim()
                      ? t('profileEditor.errorRequired')
                      : undefined
                  }
                  onChange={(value) =>
                    patchCategory({ names: { ...category.names, [contentLocale]: value } })
                  }
                />
                <EditorToggle
                  label={t('profileEditor.visible')}
                  checked={category.visible}
                  onChange={(visible) => patchCategory({ visible })}
                />
              </div>
              <div className={styles.skillSectionHeading}>
                <h3 className={styles.fieldTitle}>{t('profileEditor.categorySkills')}</h3>
                <ProfileHelp topic="skillSorting" />
              </div>
              <div
                ref={skillListRef}
                style={skillListStyle}
                className={styles.skillAssignments}
                data-reorder-list="skills"
              >
                {category.skillIds.map((id) => {
                  const item = draft.skills[id]!;
                  return (
                    <div
                      className={`${styles.skillAssignment} ${styles.reorderItem}`}
                      key={id}
                      data-selected={selectedSkill === id}
                      {...skillItem(id)}
                    >
                      <ReorderHandle
                        name={item.label}
                        description={sortHelp}
                        handlers={skillHandleProps}
                        onStart={() => setAnnouncement('')}
                      />
                      <button
                        type="button"
                        className={styles.skillChoice}
                        aria-pressed={selectedSkill === id}
                        onClick={() => {
                          setSkill(id);
                        }}
                      >
                        {item.label}
                      </button>
                      <button
                        type="button"
                        className={styles.smallButton}
                        aria-label={t('profileEditor.removeSkill', { name: item.label })}
                        onClick={() => {
                          patchCategory({
                            skillIds: category.skillIds.filter((key) => key !== id),
                          });
                        }}
                      >
                        <Icon name="close" />
                      </button>
                    </div>
                  );
                })}
              </div>
              <div className={styles.addSkill}>
                <ProfileHelp topic="skillLibrary" />
                <EditorField
                  label={t('profileEditor.addSkill')}
                  hideLabel
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
            </EditorPanel>
            {activeSkill && (
              <EditorPanel
                className={styles.skillUsagePanel}
                title={t('profileEditor.skillUses')}
                action={
                  <div className={styles.skillUsageActions}>
                    <SkillRenameInput
                      skillId={activeSkill.id}
                      value={activeSkill.label}
                      onChange={(value) => {
                        // Shared references preview each edit; persistence belongs to the page action.
                        update((current) => ({
                          ...current,
                          skills: {
                            ...current.skills,
                            [activeSkill.id]: {
                              ...current.skills[activeSkill.id]!,
                              label: value,
                              ...(current.skills[activeSkill.id]!.labels
                                ? {
                                    labels: {
                                      ...current.skills[activeSkill.id]!.labels!,
                                      [contentLocale]: value,
                                    },
                                  }
                                : {}),
                            },
                          },
                        }));
                      }}
                    />
                    <SkillsPreview category={category} />
                  </div>
                }
              >
                {/* A different skill starts on page one; renaming the same skill preserves its page. */}
                <SkillUsageList key={activeSkill.id} skillId={activeSkill.id} />
              </EditorPanel>
            )}
          </>
        ) : (
          <EditorPanel>
            <EditorNotice>{t('profileEditor.empty')}</EditorNotice>
          </EditorPanel>
        )}
      </div>
    </div>
  );
}
