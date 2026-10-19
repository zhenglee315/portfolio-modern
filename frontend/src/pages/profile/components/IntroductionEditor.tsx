import { useTranslation } from 'react-i18next';
import { isProfileMonth, type ProfileIntroduction } from '@/features/profile-content';
import { contactArtwork } from '@/features/site';
import { Icon } from './ProfileIcon';
import { currentMonthUTC, workDuration } from '@/shared/lib/dates';
import { useProfileEditor } from '../model/editor-context';
import { EditorArea, EditorField, EditorNotice, EditorPanel, EditorSelect } from './EditorFields';
import { PreviewHeading } from './ProfilePreview';
import styles from '../ProfilePage.module.css';

const chatIcons = ['chat', 'robot', 'cupHot', 'briefcase'] as const;

/** Introduction translations stay separate from language-independent contact URLs. */
export function IntroductionEditor() {
  const { t } = useTranslation();
  const { draft, update, contentLocale } = useProfileEditor();
  const copy = draft.profiles[contentLocale];
  const chatIcon = chatIcons.find((icon) => icon === copy.chatIcon);
  const artwork = contactArtwork(copy.chatIcon);
  const patch = (value: Partial<ProfileIntroduction>) =>
    update((current) => ({
      ...current,
      profiles: {
        ...current.profiles,
        [contentLocale]: { ...current.profiles[contentLocale], ...value },
      },
    }));
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
  const field = (
    key: keyof ProfileIntroduction,
    options?: { required?: boolean; help?: string },
  ) => (
    <EditorField
      label={t(`profileEditor.fields.${key}`)}
      value={copy[key]}
      field={`profile.${key}`}
      onChange={(value) => patch({ [key]: value })}
      {...options}
    />
  );
  return (
    <div className={styles.columns}>
      <div className={styles.stack}>
        <EditorPanel title={t('profileEditor.overview')} description={t('profileEditor.introHint')}>
          <div className={styles.fields}>
            {field('firstName', { required: true })}
            {field('familyName')}
          </div>
          {field('nickName')}
          {field('intro', { help: t('profileEditor.introTagHint') })}
          <EditorArea
            label={t('profileEditor.fields.content')}
            value={copy.content}
            field="profile.content"
            required
            rows={6}
            onChange={(content) => patch({ content })}
            help={t('profileEditor.bioHint')}
          />
          <div className={styles.fields}>
            {field('eduCode')}
            {field('program')}
          </div>
          <EditorNotice icon="clock">{t('profileEditor.tenureHint')}</EditorNotice>
        </EditorPanel>
        <EditorPanel
          title={t('profileEditor.socialTitle')}
          description={t('profileEditor.socialHint')}
        >
          <div className={styles.fields}>
            {(['linkedin', 'github', 'medium', 'email'] as const).map((key) => (
              <EditorField
                key={key}
                label={
                  key === 'linkedin'
                    ? 'LinkedIn'
                    : key === 'github'
                      ? 'GitHub'
                      : key === 'medium'
                        ? 'Medium'
                        : 'Email'
                }
                type={key === 'email' ? 'email' : 'url'}
                value={draft.social[key]}
                field={`social.${key}`}
                onChange={(value) =>
                  update((current) => ({ ...current, social: { ...current.social, [key]: value } }))
                }
              />
            ))}
          </div>
        </EditorPanel>
        <EditorPanel
          title={t('profileEditor.otherContent')}
          description={t('profileEditor.otherHint')}
        >
          <EditorArea
            label={t('profileEditor.fields.footer')}
            value={copy.footer}
            rows={3}
            onChange={(footer) => patch({ footer })}
          />
          <div className={styles.fields}>
            {field('chatTitle')}
            {field('chatSubtitle')}
          </div>
          <EditorArea
            label={t('profileEditor.fields.chatContent')}
            value={copy.chatContent}
            onChange={(chatContent) => patch({ chatContent })}
            rows={3}
          />
          <EditorSelect
            label={t('profileEditor.fields.chatIcon')}
            value={copy.chatIcon}
            onChange={(chatIcon) =>
              update((current) => ({
                ...current,
                profiles: Object.fromEntries(
                  Object.entries(current.profiles).map(([language, value]) => [
                    language,
                    { ...value, chatIcon },
                  ]),
                ) as typeof current.profiles,
              }))
            }
          >
            {!chatIcon && (
              <option value={copy.chatIcon}>{t('profileEditor.currentChatIcon')}</option>
            )}
            {chatIcons.map((icon) => (
              <option value={icon} key={icon}>
                {icon}
              </option>
            ))}
          </EditorSelect>
        </EditorPanel>
      </div>
      <aside className={styles.preview} aria-label={t('profileEditor.preview')}>
        <PreviewHeading section="Overview" />
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
        <EditorNotice>{t('profileEditor.introPreviewHint')}</EditorNotice>
      </aside>
    </div>
  );
}
