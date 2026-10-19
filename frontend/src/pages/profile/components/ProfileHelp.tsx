import { useId } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { languageNames } from '@/features/language';
import { useAnchoredPanel } from '@/shared/hooks/useAnchoredPanel';
import { useProfileEditor } from '../model/editor-context';
import { useProfileHelp } from '../model/useProfileHelp';
import { Icon } from './ProfileIcon';
import styles from './ProfileHelp.module.css';

const topics = {
  editing: {
    cookie: 'portfolio-profile-help-v1',
    title: 'helpTitle',
    icon: 'translate',
    description: 'languageHint',
  },
  skillSorting: {
    cookie: 'portfolio-profile-skill-sorting-help-v1',
    title: 'skillsSortHelpTitle',
    icon: 'grip',
    description: 'skillsSortHint',
  },
  skillLibrary: {
    cookie: 'portfolio-profile-skill-library-help-v1',
    title: 'skillLibraryHelpTitle',
    icon: 'braces',
    description: 'skillLibraryHint',
  },
} as const;

/** Interactive, nonmodal help stays available after opting out of automatic reminders. */
export function ProfileHelp({ topic = 'editing' }: { topic?: keyof typeof topics }) {
  const { t } = useTranslation();
  const { contentLocale } = useProfileEditor();
  const config = topics[topic];
  const title = t(`profileEditor.${config.title}`);
  const {
    trigger,
    panel,
    anchor,
    open,
    acknowledged,
    show,
    close,
    leave,
    acknowledge,
    focusPanel,
  } = useProfileHelp(config.cookie);
  const id = useId();
  useAnchoredPanel(panel, anchor);

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={styles.trigger}
        aria-label={title}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={anchor ? id : undefined}
        onPointerEnter={(event) => {
          if (event.pointerType !== 'touch') show();
        }}
        onPointerLeave={(event) => {
          if (event.pointerType !== 'touch') leave();
        }}
        onFocus={(event) => {
          if (
            !panel.current?.contains(event.relatedTarget) &&
            event.currentTarget.matches(':focus-visible')
          )
            show();
        }}
        onBlur={leave}
        onClick={(event) => {
          if (event.detail === 0) focusPanel();
          else if (open) close();
          else show();
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            focusPanel();
          }
        }}
      >
        <Icon name="patchQuestionFill" />
      </button>
      {anchor &&
        createPortal(
          <div
            ref={panel}
            id={id}
            role="dialog"
            aria-modal="false"
            aria-labelledby={`${id}-title`}
            aria-hidden={!open}
            inert={!open}
            className={styles.panel}
            data-open={open}
            data-profile-help={topic}
            onPointerEnter={(event) => {
              if (event.pointerType !== 'touch') show();
            }}
            onPointerLeave={(event) => {
              if (event.pointerType !== 'touch') leave();
            }}
            onFocus={show}
            onBlur={leave}
          >
            <div className={styles.copy}>
              <Icon name={config.icon} />
              <div>
                <h2 id={`${id}-title`}>{title}</h2>
                <p>
                  {t(`profileEditor.${config.description}`, {
                    language: languageNames[contentLocale],
                  })}
                </p>
                {topic === 'editing' && (
                  <p className={styles.note}>{t('profileEditor.localNotice')}</p>
                )}
              </div>
            </div>
            <label className={styles.acknowledge}>
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(event) => acknowledge(event.currentTarget.checked)}
              />
              <span>{t('profileEditor.helpAcknowledged')}</span>
            </label>
          </div>,
          document.body,
        )}
    </>
  );
}
