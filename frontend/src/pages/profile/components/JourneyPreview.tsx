import { useTranslation } from 'react-i18next';
import { profileJourney } from '@/features/profile-content';
import { useProfileEditor } from '../model/editor-context';
import { editorPeriod } from '../model/presentation';
import { EditorPanel } from './EditorFields';
import styles from '../ProfilePage.module.css';

/** A derived route preview stays next to the career form, with direct access to each same record. */
export function JourneyPreview({ selectedId }: { selectedId?: string }) {
  const { t } = useTranslation();
  const { draft, contentLocale, openExperience } = useProfileEditor();
  const entries = profileJourney(draft);
  return (
    <EditorPanel title={t('profileEditor.routePreview')} description={t('profileEditor.stopsHint')}>
      <ol className={styles.journeyTimeline} data-profile-preview="journey">
        {entries.map((entry, index) => {
          const copy = entry.translations[contentLocale];
          return (
            <li key={entry.id} data-selected={selectedId === entry.id}>
              <button
                type="button"
                aria-current={selectedId === entry.id ? 'step' : undefined}
                aria-label={t('profileEditor.editStop', {
                  name: copy.organization || t('profileEditor.newName'),
                })}
                onClick={() => openExperience(entry.id)}
              >
                <span className={styles.stopNumber}>{String(index + 1).padStart(2, '0')}</span>
                <span>
                  <strong>{copy.city || '—'}</strong>
                  <span>
                    {copy.organization || '—'} · {copy.title || '—'}
                  </span>
                  <small>{editorPeriod(entry, contentLocale, t)}</small>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      {!entries.length && <p className={styles.hint}>{t('profileEditor.noRoute')}</p>}
    </EditorPanel>
  );
}
