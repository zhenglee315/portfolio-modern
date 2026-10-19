import { useTranslation } from 'react-i18next';
import { recordPageSizes } from '@/shared/schemas/records';
import styles from '../ProfilePage.module.css';
import paginationStyles from './EditorPagination.module.css';

/** One bounded footer serves local references and API pages; size changes reset only view state. */
export function EditorPagination({
  page,
  size,
  total,
  defaultSize = 6,
  range,
  label,
  disabled = false,
  onPageChange,
  onSizeChange,
}: {
  page: number;
  size: number;
  total: number;
  defaultSize?: number;
  range: 'projectRange' | 'skillUsageRange' | 'experienceRange';
  label: string;
  disabled?: boolean;
  onPageChange: (page: number) => void;
  onSizeChange: (size: number) => void;
}) {
  const { t } = useTranslation();
  const pages = Math.max(1, Math.ceil(total / size));
  const current = Math.min(page, pages);
  const first = Math.max(1, Math.min(current - 2, pages - 4));
  const numbers = Array.from({ length: Math.min(5, pages) }, (_, index) => first + index);
  const choices = [...new Set([...recordPageSizes, defaultSize, size])].sort((a, b) => a - b);
  return (
    <div className={paginationStyles.footer}>
      <p className={styles.hint} role="status">
        {t(`profileEditor.${range}`, {
          from: total ? (current - 1) * size + 1 : 0,
          to: Math.min(current * size, total),
          total,
        })}
      </p>
      <label className={paginationStyles.size}>
        <span>{t('management.rowsPerPage')}</span>
        <select
          className="form-select form-select-sm"
          value={size}
          disabled={disabled}
          onChange={(event) => onSizeChange(Number(event.target.value))}
        >
          {choices.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>
      {pages > 1 && (
        <nav className={paginationStyles.pages} aria-label={label}>
          {[current - 1, ...numbers, current + 1].map((number, index) => {
            const direction =
              index === 0 ? 'previous' : index === numbers.length + 1 ? 'next' : null;
            return (
              <button
                key={direction ?? number}
                type="button"
                className={styles.smallButton}
                aria-label={
                  direction
                    ? t(`management.${direction}`)
                    : t('management.pageLabel', { page: number })
                }
                aria-current={!direction && number === current ? 'page' : undefined}
                disabled={disabled || number < 1 || number > pages}
                onClick={() => onPageChange(number)}
              >
                {direction ? (direction === 'previous' ? '‹' : '›') : number}
              </button>
            );
          })}
        </nav>
      )}
    </div>
  );
}
