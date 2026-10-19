import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  moveProfileItem,
  newProfileProject,
  removeProfileProjects,
} from '@/features/profile-content';
import { useProfileEditor } from '../model/editor-context';
import { editorPeriod } from '../model/presentation';
import { usePointerReorder } from '../model/usePointerReorder';
import { AddContentTile } from './AddContentTile';
import { EditorNotice } from './EditorFields';
import { Icon } from './ProfileIcon';
import { PreviewHeading, ProjectPreview } from './ProfilePreview';
import { ProjectPagination } from './ProjectPagination';
import { ProjectPageStatus } from './ProjectPageStatus';
import { ReorderGhost } from './ReorderGhost';
import { EditorCard } from './EditorCard';
import { SelectionToolbar } from './SelectionToolbar';
import styles from '../ProfilePage.module.css';
import listStyles from './EditorCard.module.css';

/** Render one API-sized page; ID selection survives paging, and all deletion remains an explicit draft edit. */
export function ProjectList() {
  const { t } = useTranslation();
  const {
    draft,
    contentLocale,
    update,
    openProject,
    confirm,
    canCreate,
    canDelete,
    canUpdate,
    projectPage,
    projectSize,
    projectLoading,
    projectError,
    openProjectPage,
  } = useProfileEditor();
  const [selected, setSelected] = useState('');
  const [checked, setChecked] = useState<string[]>([]);
  const [announcement, setAnnouncement] = useState('');
  const [openActions, setOpenActions] = useState<string | null>(null);
  const sortHelp = useId();
  const pendingFocus = useRef<string | null>(null);
  const pageIds = draft.projectOrder.slice(
    (projectPage - 1) * projectSize,
    projectPage * projectSize,
  );
  const entries = pageIds.flatMap((id) => (draft.projects[id] ? [draft.projects[id]!] : []));
  const project = entries.find((item) => item.id === selected) ?? entries[0];
  const selectedIds = checked.filter((id) => draft.projectOrder.includes(id));
  const unavailable = projectLoading || projectError;
  const reorder = (source: string, target: string, placement: 'before' | 'after') => {
    const next = moveProfileItem(draft.projectOrder, source, target, placement);
    if (next === draft.projectOrder) return;
    // Only the normalized global order changes; unvisited project records remain on the server.
    update((current) => ({
      ...current,
      projectOrder: moveProfileItem(current.projectOrder, source, target, placement),
    }));
    const destinationPage = Math.floor(next.indexOf(source) / projectSize) + 1;
    if (destinationPage !== projectPage) {
      // Keyboard moves follow their card onto the next page and restore its handle after hydration.
      pendingFocus.current = source;
      openProjectPage(destinationPage);
    }
    setAnnouncement(
      t('profileEditor.reordered', {
        name: draft.projects[source]!.translations[contentLocale].name,
        position: next.indexOf(source) + 1,
        total: next.length,
      }),
    );
  };
  const remove = (ids: string[]) =>
    confirm(
      () => {
        setOpenActions(null);
        update((current) => removeProfileProjects(current, ids));
        setChecked((current) => current.filter((id) => !ids.includes(id)));
      },
      'delete',
      t('profileEditor.deleteProjectsHint', { count: ids.length }),
    );
  const {
    ref,
    drag,
    listStyle,
    item: reorderItem,
    handleProps,
    deleteTarget,
  } = usePointerReorder('vertical', reorder, draft.projectOrder, {
    onDrop: (id) => remove([id]),
    disabled: !canDelete || !canUpdate || !!unavailable,
  });
  useEffect(() => {
    if (projectLoading || projectError || !pendingFocus.current) return;
    const row = [...(ref.current?.querySelectorAll<HTMLElement>('[data-reorder-id]') ?? [])].find(
      (node) => node.dataset.reorderId === pendingFocus.current,
    );
    const handle = row?.querySelector<HTMLButtonElement>('[data-reorder-label]');
    if (handle) {
      handle.focus();
      pendingFocus.current = null;
    }
  }, [projectLoading, projectError, projectPage, draft.projectOrder, ref]);
  return (
    <div className={styles.columns}>
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
        <p className={styles.hint}>{t('profileEditor.projectHint')}</p>
        <SelectionToolbar
          ids={pageIds}
          checked={selectedIds}
          deleteTarget={deleteTarget}
          onChange={setChecked}
          disabled={!canDelete || !canUpdate || !!unavailable}
          onDelete={() => remove(selectedIds)}
        />
        <AddContentTile
          label={t('profileEditor.addProject')}
          disabled={!canCreate || !canUpdate}
          onClick={() => {
            const item = newProfileProject(draft.experienceOrder[0] ?? null);
            update((current) => ({
              ...current,
              projects: { ...current.projects, [item.id]: item },
              projectOrder: [item.id, ...current.projectOrder],
            }));
            openProject(item.id);
          }}
        />
        {unavailable ? (
          <ProjectPageStatus />
        ) : (
          <div ref={ref} style={listStyle} className={listStyles.rows} data-reorder-list="projects">
            {entries.map((item) => {
              const copy = item.translations[contentLocale];
              const name = copy.name || t('profileEditor.newName');
              return (
                <EditorCard
                  key={item.id}
                  data-project-editor-row={item.id}
                  data-selected={selectedIds.includes(item.id)}
                  {...reorderItem(item.id)}
                  open={openActions === item.id && !drag}
                  onOpenChange={(open) => setOpenActions(open ? item.id : null)}
                  label={t('profileEditor.projectActions', { name })}
                  eyebrow={copy.title || 'PROJECT'}
                  selection={{
                    'aria-label': t('profileEditor.selectProject', { name }),
                    checked: selectedIds.includes(item.id),
                    disabled: !canDelete || !canUpdate,
                    onChange: (event) => {
                      const value = event.currentTarget.checked;
                      setChecked((current) =>
                        value ? [...current, item.id] : current.filter((id) => id !== item.id),
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
                    checked: item.visible,
                    disabled: !canUpdate,
                    onChange: (visible) =>
                      update((current) => ({
                        ...current,
                        projects: {
                          ...current.projects,
                          [item.id]: { ...current.projects[item.id]!, visible },
                        },
                      })),
                  }}
                  editLabel={t('profileEditor.edit')}
                  onEdit={() => openProject(item.id)}
                  action={
                    <button
                      type="button"
                      aria-label={`${t('profileEditor.deleteProject')}: ${name}`}
                      disabled={!canDelete || !canUpdate}
                      onClick={() => remove([item.id])}
                    >
                      <Icon name="trash" />
                      <span>{t('management.confirmDelete')}</span>
                    </button>
                  }
                >
                  <button
                    type="button"
                    className={styles.rowSummary}
                    aria-pressed={project?.id === item.id}
                    onClick={() => setSelected(item.id)}
                  >
                    <strong className={styles.projectTitle}>{name}</strong>
                    <span>{copy.intro}</span>
                    <small>{editorPeriod(item, contentLocale, t)}</small>
                  </button>
                </EditorCard>
              );
            })}
          </div>
        )}
        {!draft.projectOrder.length && <EditorNotice>{t('profileEditor.empty')}</EditorNotice>}
        <ProjectPagination />
      </div>
      <aside className={styles.preview}>
        <PreviewHeading section="Projects" />
        {unavailable ? (
          <p className={styles.hint}>{t('ui.loading')}</p>
        ) : (
          <ProjectPreview project={project} />
        )}
      </aside>
    </div>
  );
}
