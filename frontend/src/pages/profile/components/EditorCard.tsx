import type { ComponentProps, ReactNode } from 'react';
import { TableCheckbox } from '@/shared/ui/TableCheckbox';
import { EditorPanel, EditorToggle } from './EditorFields';
import { ReorderHandle } from './ReorderHandle';
import { SwipeReveal } from './SwipeReveal';
import styles from '../ProfilePage.module.css';
import cardStyles from './EditorCard.module.css';

/** One compact card owns selection, drag exclusion, icon actions and swipe geometry across editor lists. */
export function EditorCard({
  eyebrow,
  selection,
  reorder,
  visibility,
  editLabel,
  onEdit,
  children,
  className = '',
  ...swipe
}: Omit<ComponentProps<typeof SwipeReveal>, 'children' | 'triggerIcon' | 'edit'> & {
  eyebrow: string;
  selection: ComponentProps<typeof TableCheckbox>;
  reorder: ComponentProps<typeof ReorderHandle>;
  visibility: ComponentProps<typeof EditorToggle>;
  editLabel: string;
  onEdit: () => void;
  children: ReactNode;
}) {
  return (
    <SwipeReveal
      {...swipe}
      edit={{ label: editLabel, onClick: onEdit }}
      triggerIcon="threeDotsVertical"
      className={`${styles.reorderCard} ${cardStyles.card} ${styles.reorderItem} ${className}`}
    >
      {(actionTrigger) => (
        <EditorPanel>
          {/* Only controls opt out of horizontal swiping; the caption and summary remain swipe targets. */}
          <div className={`${styles.controls} ${cardStyles.controls}`}>
            <TableCheckbox {...selection} data-swipe-ignore />
            <ReorderHandle {...reorder} />
            <span
              className={`${styles.eyebrow} ${cardStyles.title}`}
              data-editor-eyebrow
              title={eyebrow}
            >
              {eyebrow}
            </span>
            <div className={`${styles.controls} ${cardStyles.actions}`} data-swipe-ignore>
              <EditorToggle {...visibility} />
              {actionTrigger}
            </div>
          </div>
          {children}
        </EditorPanel>
      )}
    </SwipeReveal>
  );
}
