import { useTranslation } from 'react-i18next';
import { isProfileMonth } from '@/features/profile-content';
import { contactArtwork } from '@/features/site';
import { currentMonthUTC, workDuration } from '@/shared/lib/dates';
import { useProfileEditor } from '../model/editor-context';
import { EditorPanel } from './EditorFields';
import { Icon } from './ProfileIcon';
import styles from '../ProfilePage.module.css';

/** Share the same draft, name and work-duration projection between editor and presentation preview. */
export function IntroductionPreview() {
  const { t } = useTranslation();
  const { draft, contentLocale } = useProfileEditor();
  const copy = draft.profiles[contentLocale];
  const name =
    /^\p{Script=Han}+$/u.test(copy.firstName) && /^\p{Script=Han}+$/u.test(copy.familyName)
      ? `${copy.familyName}${copy.firstName}`
      : `${copy.firstName} ${copy.familyName}`.trim();
  const work = Object.values(draft.experiences).filter(
    (entry) =>
      entry.visible &&
      isProfileMonth(entry.startMonth) &&
      (!entry.endMonth || isProfileMonth(entry.endMonth)) &&
      (!entry.endMonth || entry.endMonth >= entry.startMonth) &&
      (entry.endMonth || entry.startMonth <= currentMonthUTC()),
  );
  const tenure = workDuration(
    work.map((entry) => ({
      type: entry.type,
      startMonth: entry.startMonth,
      endMonth: entry.endMonth || null,
    })),
    currentMonthUTC(),
  );
  return (
    <article
      className={`${styles.previewCard} ${styles.introPreview}`}
      data-profile-preview="overview"
      lang={contentLocale}
    >
      <div className={styles.socialPreview}>
        {(['linkedin', 'github', 'medium', 'email'] as const)
          .filter((key) => draft.social[key].trim())
          .map((key) => (
            <Icon key={key} name={key === 'email' ? 'envelope' : key} label={key} />
          ))}
      </div>
      <p className={styles.eyebrow}>{copy.intro}</p>
      <h3>
        <span>{t('ui.hello')}</span>
        <strong>{name || t('profileEditor.newName')}.</strong>
      </h3>
      <p className={styles.previewCopy}>{copy.content || '—'}</p>
      <span className={styles.accent}>
        {t('ui.exploreWork')} <Icon name="arrow" />
      </span>
      <div className={styles.introMeta}>
        <span>
          {t('ui.tenure', {
            years: tenure.years,
            months: tenure.months,
            yearUnit: t(tenure.years === 1 ? 'ui.year' : 'ui.years'),
            monthUnit: t(tenure.months === 1 ? 'ui.month' : 'ui.months'),
          })}
        </span>
        <span>{[copy.eduCode, copy.program].filter(Boolean).join(' · ')}</span>
      </div>
    </article>
  );
}

/** Footer and introduction artwork use the existing local assets in both preview contexts. */
export function IntroductionExtras() {
  const { t } = useTranslation();
  const { draft, contentLocale } = useProfileEditor();
  const copy = draft.profiles[contentLocale];
  const chatIcon = (['chat', 'robot', 'cupHot', 'briefcase'] as const).find(
    (icon) => icon === copy.chatIcon,
  );
  const artwork = contactArtwork(copy.chatIcon);
  return (
    <>
      <EditorPanel title={t('profileEditor.footerPreview')}>
        <p className={styles.previewWordmark}>
          {draft.brand?.title ?? ''} <small>{draft.brand?.titleSub ?? ''}</small>
        </p>
        <p className={styles.previewCopy}>{copy.footer}</p>
        <span className={styles.accent}>{t('ui.connect')} ↗</span>
      </EditorPanel>
      <EditorPanel title={t('profileEditor.bubblePreview')}>
        {artwork ? (
          <img src={artwork} alt={t('ui.mascot')} width="80" height="80" />
        ) : (
          <Icon name={chatIcon ?? 'chat'} />
        )}
        <h3 className={styles.accent}>{copy.chatTitle}</h3>
        <p className={styles.hint}>{copy.chatSubtitle}</p>
        <p className={styles.previewCopy}>{copy.chatContent}</p>
      </EditorPanel>
    </>
  );
}
