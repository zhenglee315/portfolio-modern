import { type CSSProperties } from 'react';
import styles from './DataTable.module.css';
import type { DataTableModel } from './useDataTable';
/** Bound navigation to the first, last and neighboring pages, even for very large totals. */
function pageButtons(page: number, pages: number): (number | 'gap-start' | 'gap-end')[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, index) => index + 1);
  const center = Math.min(Math.max(page, 1), pages);
  const first = Math.max(2, Math.min(center - 1, pages - 3));
  const last = Math.min(pages - 1, Math.max(center + 1, 4));
  return [
    1,
    ...(first > 2 ? (['gap-start'] as const) : []),
    ...Array.from({ length: last - first + 1 }, (_, index) => first + index),
    ...(last < pages - 1 ? (['gap-end'] as const) : []),
    pages,
  ];
}

/** Presentation only; the owning controller retains state and cancellation. */
export function DataTableFooter<T>({ model }: { model: DataTableModel<T> }) {
  const {
    page,
    onPageChange,
    onSizeChange,
    loading,
    copy,
    selectedKeys,
    first,
    last,
    sizeOptions,
  } = model;
  const navigationButton = (
    direction: 'first' | 'previous' | 'next' | 'last',
    target: number,
    unavailable: boolean,
  ) => (
    <li className={`page-item ${unavailable || loading ? 'disabled' : ''}`}>
      <button
        type="button"
        className="page-link"
        value={direction}
        aria-label={copy[direction]}
        title={copy[direction]}
        disabled={unavailable || loading}
        onClick={() => onPageChange(target)}
      />
    </li>
  );

  return (
    <div className={styles.footer}>
      <p className={styles.range}>{copy.range(first, last, page.total, selectedKeys.length)}</p>
      <label className={styles.size}>
        <span>{copy.rowsPerPage}</span>
        <select
          className="form-select form-select-sm"
          style={{ '--table-size-digits': String(page.size).length } as CSSProperties}
          value={page.size}
          disabled={loading}
          onChange={(event) => onSizeChange(Number(event.target.value))}
        >
          {sizeOptions.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </label>
      <nav aria-label={copy.pagination}>
        <ul className={`pagination pagination-sm ${styles.pagination}`}>
          {navigationButton('first', 1, page.page <= 1)}
          {navigationButton('previous', Math.max(page.page - 1, 1), page.page <= 1)}
          {pageButtons(page.page, page.pages).map((item) => (
            <li
              key={item}
              className={`page-item ${typeof item !== 'number' ? 'disabled' : item === page.page ? 'active' : ''}`}
            >
              {typeof item !== 'number' ? (
                <span className="page-link" aria-hidden="true">
                  …
                </span>
              ) : (
                <button
                  type="button"
                  className="page-link"
                  aria-label={copy.pageLabel(item)}
                  aria-current={item === page.page ? 'page' : undefined}
                  disabled={loading || item === page.page}
                  onClick={() => onPageChange(item)}
                >
                  {item}
                </button>
              )}
            </li>
          ))}
          {navigationButton('next', page.page + 1, page.page >= page.pages)}
          {navigationButton(
            'last',
            Math.max(page.pages, 1),
            !page.pages || page.page === page.pages,
          )}
        </ul>
      </nav>
    </div>
  );
}
