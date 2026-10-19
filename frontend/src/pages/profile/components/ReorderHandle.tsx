import { useTranslation } from 'react-i18next';
import type { usePointerReorder } from '../model/usePointerReorder';
import { Icon } from './ProfileIcon';
import styles from '../ProfilePage.module.css';

/** Keep pointer capture, keyboard sorting and accessible instructions identical across lists. */
export function ReorderHandle({
  name,
  description,
  handlers,
  onStart,
  disabled = false,
}: {
  name: string;
  description: string;
  handlers: ReturnType<typeof usePointerReorder>['handleProps'];
  onStart?: () => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      className={styles.reorderHandle}
      aria-label={t('profileEditor.drag', { name })}
      aria-describedby={description}
      title={t('profileEditor.drag', { name })}
      data-reorder-label={name}
      data-swipe-ignore
      disabled={disabled}
      {...handlers}
      onPointerDownCapture={onStart}
    >
      <Icon name="grip" />
    </button>
  );
}
