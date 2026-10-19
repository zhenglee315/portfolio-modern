import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  moveProfileItem,
  newProfileExperience,
  removeProfileExperiences,
} from '@/features/profile-content';
import { Icon } from './ProfileIcon';
import { useProfileEditor } from '../model/editor-context';
import { editorPeriod } from '../model/presentation';
import { usePointerReorder } from '../model/usePointerReorder';
import { EditorNotice, EditorPanel } from './EditorFields';
import { ExperiencePreview, PreviewHeading } from './ProfilePreview';
import { JourneyPreview } from './JourneyPreview';
import { AddContentTile } from './AddContentTile';
import { EditorCard } from './EditorCard';
import { EditorPagination } from './EditorPagination';
import { SelectionToolbar } from './SelectionToolbar';
import { ReorderGhost } from './ReorderGhost';
import styles from '../ProfilePage.module.css';
import cardStyles from './EditorCard.module.css';

/** Career cards reuse project gestures and selection; Journey retains its independent chronological order. */
export function ExperienceList() {
  const { t } = useTranslation();
  const { draft, contentLocale, update, openExperience, confirm, canCreate, canUpdate, canDelete } =
    useProfileEditor();
  const [filter, setFilter] = useState<'all' | 'work' | 'education'>('all');
  const [selected, setSelected] = useState(() => draft.experienceOrder[0] ?? '');
  const [checked, setChecked] = useState<string[]>([]);
  const [openActions, setOpenActions] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(6);
  const [announcement, setAnnouncement] = useState('');
  const sortHelp = useId();
  const entries = draft.experienceOrder.map((id) => draft.experiences[id]!);
  const filtered = entries.filter((entry) => filter === 'all' || entry.type === filter);
  const current = Math.min(page, Math.max(1, Math.ceil(filtered.length / size)));
  const visible = filtered.slice((current - 1) * size, current * size);
  const selectedIds = checked.filter((id) => draft.experienceOrder.includes(id));
  const preview = visible.find((entry) => entry.id === selected) ?? visible[0];
  const reorder = (source: string, target: string, placement: 'before' | 'after') => {
    update((current) => ({
      ...current,
      experienceOrder: moveProfileItem(current.experienceOrder, source, target, placement),
    }));
    setAnnouncement(
      t('profileEditor.reordered', {
        name: draft.experiences[source]!.translations[contentLocale].organization,
        position:
          moveProfileItem(draft.experienceOrder, source, target, placement).indexOf(source) + 1,
        total: entries.length,
      }),
    );
  };
  const remove = (ids: string[]) =>
    confirm(
      () => {
        setOpenActions(null);
        update((current) => removeProfileExperiences(current, ids));
        setChecked((current) => current.filter((id) => !ids.includes(id)));
      },
      'delete',
      t('profileEditor.deleteExperiencesHint', { count: ids.length }),
    );
  const { ref, drag, listStyle, item, handleProps, deleteTarget } = usePointerReorder(
    'vertical',
    reorder,
    undefined,
    { onDrop: (id) => remove([id]), disabled: !canDelete || !canUpdate },
  );
  return (
    <div className={`${styles.columns} ${styles.listColumns}`}>
      <span id={sortHelp} className="visually-hidden">
        {t('profileEditor.reorderHint')}
      </span>
      <span role="status" aria-live="polite" aria-atomic="true" className="visually-hidden">
        {drag
          ? t(drag.overDelete ? 'profileEditor.dropToDelete' : 'profileEditor.dragging', {
              name: drag.label,
            })
          : announcement}
      </span>
      <ReorderGhost drag={drag} />
      <div className={styles.stack}>
        <div className={styles.filters} aria-label={t('profileEditor.experience')}>
          {(['all', 'work', 'education'] as const).map((kind) => (
            <button
              key={kind}
              type="button"
              aria-pressed={filter === kind}
              onClick={() => {
                setFilter(kind);
                setPage(1);
                setOpenActions(null);
              }}
            >
              {t(`profileEditor.${kind}`)}{' '}
              <span>{entries.filter((entry) => kind === 'all' || entry.type === kind).length}</span>
            </button>
          ))}
        </div>
        <p className={styles.hint}>{t('profileEditor.reorderHint')}</p>
        <SelectionToolbar
          ids={visible.map((entry) => entry.id)}
          checked={selectedIds}
          deleteTarget={deleteTarget}
          onChange={setChecked}
          disabled={!canDelete || !canUpdate}
          onDelete={() => remove(selectedIds)}
        />
        <AddContentTile
          label={t('profileEditor.addExperience')}
          disabled={!canCreate || !canUpdate}
          onClick={() => {
            const entry = newProfileExperience();
            update((current) => ({
              ...current,
              experiences: { ...current.experiences, [entry.id]: entry },
              experienceOrder: [entry.id, ...current.experienceOrder],
            }));
            openExperience(entry.id);
          }}
        />
        <div
          ref={ref}
          style={listStyle}
          className={cardStyles.rows}
          data-reorder-list="experiences"
        >
          {visible.map((entry) => {
            const copy = entry.translations[contentLocale];
            const name = copy.organization || t('profileEditor.newName');
            return (
              <EditorCard
                key={entry.id}
                data-experience-editor-row={entry.id}
                data-selected={selectedIds.includes(entry.id) || preview?.id === entry.id}
                {...item(entry.id)}
                open={openActions === entry.id && !drag}
                onOpenChange={(open) => setOpenActions(open ? entry.id : null)}
                label={t('profileEditor.experienceActions', { name })}
                eyebrow={`${String(draft.experienceOrder.indexOf(entry.id) + 1).padStart(2, '0')} / ${t(`profileEditor.${entry.type}`)}`}
                selection={{
                  'aria-label': t('profileEditor.selectExperience', { name }),
                  checked: selectedIds.includes(entry.id),
                  disabled: !canDelete || !canUpdate,
                  onChange: (event) => {
                    const value = event.currentTarget.checked;
                    setChecked((current) =>
                      value ? [...current, entry.id] : current.filter((id) => id !== entry.id),
                    );
                  },
                }}
                reorder={{
                  name,
                  description: sortHelp,
                  handlers: handleProps,
                  disabled: !canUpdate,
                  onStart: () => {
                    setAnnouncement('');
                    setOpenActions(null);
                  },
                }}
                visibility={{
                  label: t('profileEditor.visible'),
                  checked: entry.visible,
                  disabled: !canUpdate,
                  onChange: (visible) =>
                    update((current) => ({
                      ...current,
                      experiences: {
                        ...current.experiences,
                        [entry.id]: { ...current.experiences[entry.id]!, visible },
                      },
                    })),
                }}
                editLabel={`${t('profileEditor.edit')} ${name}`}
                onEdit={() => openExperience(entry.id)}
                action={
                  <button
                    type="button"
                    aria-label={`${t('profileEditor.deleteExperience')}: ${name}`}
                    disabled={!canDelete || !canUpdate}
                    onClick={() => remove([entry.id])}
                  >
                    <Icon name="trash" />
                    <span>{t('management.confirmDelete')}</span>
                  </button>
                }
              >
                <button
                  type="button"
                  className={styles.rowSummary}
                  onClick={() => setSelected(entry.id)}
                  aria-pressed={preview?.id === entry.id}
                >
                  <strong className={styles.projectTitle}>{name}</strong>
                  <span>{copy.title || '—'}</span>
                  <small>
                    {editorPeriod(entry, contentLocale, t)}
                    {copy.city && ` · ${copy.city}`}
                  </small>
                </button>
              </EditorCard>
            );
          })}
          {!visible.length && <EditorNotice>{t('profileEditor.empty')}</EditorNotice>}
        </div>
        <EditorPagination
          page={current}
          size={size}
          total={filtered.length}
          range="experienceRange"
          label={t('profileEditor.experiencePagination')}
          onPageChange={(page) => {
            setPage(page);
            setOpenActions(null);
          }}
          onSizeChange={(size) => {
            setSize(size);
            setPage(1);
            setOpenActions(null);
          }}
        />
      </div>
      <aside className={styles.preview} aria-label={t('profileEditor.preview')}>
        <PreviewHeading section="Experience" />
        <ExperiencePreview entry={preview} />
        <EditorPanel title={t('profileEditor.displayOrder')}>
          <div className={styles.fact}>
            <span>{t('profileEditor.homepageOrder')}</span>
            <strong>{t('profileEditor.manualOrder')}</strong>
          </div>
          <div className={styles.fact}>
            <span>{t('profileEditor.routeOrder')}</span>
            <strong>{t('profileEditor.chronological')}</strong>
          </div>
        </EditorPanel>
        <JourneyPreview selectedId={preview?.id} />
        <EditorNotice icon="clock">{t('profileEditor.tenureHint')}</EditorNotice>
      </aside>
    </div>
  );
}
