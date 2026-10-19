import { useTranslation } from 'react-i18next';
import type { ProfileIntroduction } from '@/features/profile-content';
import { useProfileEditor } from '../model/editor-context';
import { EditorArea, EditorField, EditorNotice, EditorPanel, EditorSelect } from './EditorFields';
import { PreviewHeading } from './ProfilePreview';
import { IntroductionPreview, IntroductionExtras } from './IntroductionPreview';
import styles from '../ProfilePage.module.css';

const chatIcons = ['chat', 'robot', 'cupHot', 'briefcase'] as const;

/** Introduction translations stay separate from language-independent contact URLs. */
export function IntroductionEditor() {
  const { t } = useTranslation();
  const { draft, update, contentLocale } = useProfileEditor();
  const copy = draft.profiles[contentLocale];
  const chatIcon = chatIcons.find((icon) => icon === copy.chatIcon);
  const patch = (value: Partial<ProfileIntroduction>) =>
    update((current) => ({
      ...current,
      profiles: {
        ...current.profiles,
        [contentLocale]: { ...current.profiles[contentLocale], ...value },
      },
    }));
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
        <IntroductionPreview />
        <IntroductionExtras />
        <EditorNotice>{t('profileEditor.introPreviewHint')}</EditorNotice>
      </aside>
    </div>
  );
}
