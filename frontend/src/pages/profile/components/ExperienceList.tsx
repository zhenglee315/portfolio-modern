import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { moveProfileItem, newProfileExperience } from '@/features/profile-content';
import { Icon } from './ProfileIcon';
import { useProfileEditor } from '../model/editor-context';
import { editorPeriod } from '../model/presentation';
import { EditorNotice, EditorPanel, EditorToggle, OrderButtons } from './EditorFields';
import { ExperiencePreview, PreviewHeading } from './ProfilePreview';
import { JourneyPreview } from './JourneyPreview';
import styles from '../ProfilePage.module.css';

/** Career management keeps display order separate from Journey's chronological view. */
export function ExperienceList() {
  const { t } = useTranslation();
  const { draft, contentLocale, update, openExperience, canCreate } = useProfileEditor();
  const [filter, setFilter] = useState<'all' | 'work' | 'education'>('all');
  const [sorting, setSorting] = useState(false);
  const [selected, setSelected] = useState(() => draft.experienceOrder[0] ?? '');
  const [dragged, setDragged] = useState<string | null>(null);
  const entries = draft.experienceOrder.map((id) => draft.experiences[id]!);
  const filtered = entries.filter((entry) => filter === 'all' || entry.type === filter);
  const preview = filtered.find((entry) => entry.id === selected) ?? filtered[0];
  const reorder = (source: string, target: string) =>
    update((current) => ({
      ...current,
      experienceOrder: moveProfileItem(current.experienceOrder, source, target),
    }));
  return (
    <div className={`${styles.columns} ${styles.listColumns}`}>
      <div className={styles.stack}>
        <div className={styles.listToolbar}>
          <div className={styles.filters} aria-label={t('profileEditor.experience')}>
            {(['all', 'work', 'education'] as const).map((kind) => (
              <button
                key={kind}
                type="button"
                aria-pressed={filter === kind}
                onClick={() => setFilter(kind)}
              >
                {t(`profileEditor.${kind}`)}{' '}
                <span>
                  {entries.filter((entry) => kind === 'all' || entry.type === kind).length}
                </span>
              </button>
            ))}
          </div>
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.button}
              aria-pressed={sorting}
              onClick={() => {
                setSorting((value) => !value);
                setFilter('all');
              }}
            >
              {t(`profileEditor.${sorting ? 'sortDone' : 'sort'}`)}
            </button>
            <button
              type="button"
              className={`${styles.button} ${styles.primary}`}
              disabled={!canCreate}
              onClick={() => {
                const entry = newProfileExperience();
                update((current) => ({
                  ...current,
                  experiences: { ...current.experiences, [entry.id]: entry },
                  experienceOrder: [entry.id, ...current.experienceOrder],
                }));
                openExperience(entry.id);
              }}
            >
              <Icon name="plus" />
              {t('profileEditor.addExperience')}
            </button>
          </div>
        </div>
        <p className={styles.hint}>{t('profileEditor.sortHint')}</p>
        <div className={styles.experienceList}>
          {filtered.map((entry) => {
            const copy = entry.translations[contentLocale];
            const index = draft.experienceOrder.indexOf(entry.id);
            const name = copy.organization || t('profileEditor.newName');
            return (
              <article
                key={entry.id}
                className={styles.experienceRow}
                data-selected={preview?.id === entry.id}
                data-visible={entry.visible}
                data-dragging={dragged === entry.id}
                data-experience-editor-row={entry.id}
                onDragOver={(event) => {
                  if (sorting) event.preventDefault();
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  if (sorting && dragged) reorder(dragged, entry.id);
                  setDragged(null);
                }}
              >
                <div className={styles.ordinal}>
                  {sorting ? (
                    <button
                      type="button"
                      draggable
                      className={styles.dragHandle}
                      aria-label={t('profileEditor.drag', { name })}
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = 'move';
                        event.dataTransfer.setData('text/plain', entry.id);
                        setDragged(entry.id);
                      }}
                      onDragEnd={() => setDragged(null)}
                    >
                      <Icon name="grip" />
                    </button>
                  ) : (
                    <Icon name={entry.type === 'education' ? 'education' : 'building'} />
                  )}
                  <span>{String(index + 1).padStart(2, '0')}</span>
                </div>
                <button
                  type="button"
                  className={styles.rowSummary}
                  onClick={() => setSelected(entry.id)}
                  aria-pressed={preview?.id === entry.id}
                >
                  <span className={styles.rowTitle}>
                    <strong>{name}</strong>
                    <span className={styles.badge}>{t(`profileEditor.${entry.type}`)}</span>
                  </span>
                  <span>{copy.title || '—'}</span>
                  <small>
                    {editorPeriod(entry, contentLocale, t)}
                    {copy.city && ` · ${copy.city}`}
                  </small>
                </button>
                <div className={styles.rowActions}>
                  <EditorToggle
                    label={t('profileEditor.visible')}
                    checked={entry.visible}
                    onChange={(visible) =>
                      update((current) => ({
                        ...current,
                        experiences: {
                          ...current.experiences,
                          [entry.id]: { ...current.experiences[entry.id]!, visible },
                        },
                      }))
                    }
                  />
                  {sorting ? (
                    <OrderButtons
                      name={name}
                      index={index}
                      total={entries.length}
                      onMove={(offset) => reorder(entry.id, draft.experienceOrder[index + offset]!)}
                    />
                  ) : (
                    <button
                      type="button"
                      className={styles.textButton}
                      onClick={() => openExperience(entry.id)}
                      aria-label={`${t('profileEditor.edit')} ${name}`}
                    >
                      {t('profileEditor.edit')}
                      <Icon name="arrowRight" />
                    </button>
                  )}
                </div>
              </article>
            );
          })}
          {!filtered.length && <EditorNotice>{t('profileEditor.empty')}</EditorNotice>}
        </div>
        <p className={styles.hint}>
          <Icon name="check" />
          {t('profileEditor.localNotice')}
        </p>
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
