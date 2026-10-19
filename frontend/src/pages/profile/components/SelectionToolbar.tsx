import { useTranslation } from 'react-i18next';
import { TableCheckbox } from '@/shared/ui/TableCheckbox';
import { Icon } from './ProfileIcon';
import styles from '../ProfilePage.module.css';

/** Select only the current visible page while retaining selections across filters and pages. */
export function SelectionToolbar({
  ids,
  checked,
  onChange,
  onDelete,
  disabled = false,
  deleteTarget,
}: {
  ids: readonly string[];
  checked: readonly string[];
  onChange: (ids: string[]) => void;
  onDelete: () => void;
  disabled?: boolean;
  deleteTarget?: { ref: Ref<HTMLButtonElement>; active: boolean; over: boolean };
}) {
  const { t } = useTranslation();
  const count = ids.filter((id) => checked.includes(id)).length;
  return (
    <div className={styles.listToolbar}>
      <label className={styles.check}>
        <TableCheckbox
          checked={ids.length > 0 && count === ids.length}
          mixed={count > 0 && count < ids.length}
          disabled={disabled || !ids.length}
          onChange={(event) => {
            const next = new Set(checked);
            for (const id of ids) {
              if (event.currentTarget.checked) next.add(id);
              else next.delete(id);
            }
            onChange([...next]);
          }}
        />
        {t('profileEditor.selectPage')}
      </label>
      <div className={styles.actions}>
        <span className={styles.hint} role="status">
          {t('profileEditor.selectedItems', { count: checked.length })}
        </span>
        {!!checked.length && (
          <button type="button" className={styles.textButton} onClick={() => onChange([])}>
            {t('profileEditor.clearSelection')}
          </button>
        )}
        <button
          ref={deleteTarget?.ref}
          type="button"
          className={`${styles.button} ${styles.danger} ${styles.deleteDrop}`}
          data-delete-drop-active={deleteTarget?.active || undefined}
          data-delete-drop-over={deleteTarget?.over || undefined}
          disabled={disabled || (!checked.length && !deleteTarget?.active)}
          onClick={() => {
            // A drag enables this target without changing checkbox selection or bulk-delete scope.
            if (checked.length) onDelete();
          }}
        >
          <Icon name="trash" />
          {t('profileEditor.deleteSelected')}
        </button>
      </div>
    </div>
  );
}
import type { Ref } from 'react';
