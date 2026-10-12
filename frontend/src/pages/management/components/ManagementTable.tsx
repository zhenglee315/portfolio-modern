import { useCallback, useEffect, useId, useMemo, useState, type KeyboardEvent } from 'react';
import { useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import Modal from 'react-bootstrap/Modal';
import type { Locale } from '@/i18n/config';
import { fullName } from '@/features/site';
import {
  managementFilterFields,
  managementSortFields,
  useManagementList,
  type ManagementListState,
  type ManagementResource,
  type ManagementRow,
} from '@/features/management';
import { DataTable, type DataTableColumn, type DataTableCopy } from '@/shared/ui/DataTable';
import { Icon } from '@/shared/ui/Icon';
import { cycleDialogTab } from '@/shared/lib/focus';
import { fields, visible, booleanFields, listState, rowValue } from '../model/management-view';
import styles from '../ManagementPage.module.css';

/** Own query controls and detail selection; server data stays only in the feature query cache. */
export function ManagementTable({
  locale,
  resource,
  title,
  enabled,
  accountId,
}: {
  locale: Locale;
  resource: ManagementResource;
  title: string;
  enabled: boolean;
  accountId?: number;
}) {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const state = useMemo(() => listState(resource, params), [resource, params]);
  const [draft, setDraft] = useState({ committed: state.search, value: state.search });
  // URL navigation resets the draft synchronously so Back cannot recommit an obsolete search.
  if (draft.committed !== state.search) setDraft({ committed: state.search, value: state.search });
  const search = draft.committed === state.search ? draft.value : state.search;
  const [selected, setSelected] = useState<ManagementRow | null>(null);
  const query = useManagementList(resource, state, locale, enabled, accountId);
  const searchInvalid = search.trim().split(/\s+/).filter(Boolean).length > 10;
  const id = useId();
  const update = useCallback(
    (changes: Partial<ManagementListState>, replace = false) => {
      const next = { ...state, ...changes };
      const values = new URLSearchParams({
        page: String(next.page),
        size: String(next.size),
        sort: next.sort.map((item) => `${item.field}:${item.direction}`).join(','),
      });
      if (next.search) values.set('search', next.search);
      Object.entries(next.filters).forEach(([key, value]) => {
        if (value) values.set(key, value);
      });
      void setParams(values, { replace, preventScrollReset: true });
    },
    [state, setParams],
  );
  useEffect(() => {
    if (searchInvalid || search.trim() === state.search) return;
    const timer = setTimeout(() => {
      const values = new URLSearchParams(params);
      values.set('page', '1');
      if (search.trim()) values.set('search', search.trim());
      else values.delete('search');
      void setParams(values, { replace: true, preventScrollReset: true });
    }, 300);
    return () => clearTimeout(timer);
  }, [search, searchInvalid, state.search, params, setParams]);
  const columns = useMemo<DataTableColumn<ManagementRow>[]>(
    () =>
      [
        ...visible[resource],
        ...fields[resource].filter((field) => !visible[resource].includes(field)),
      ]
        .sort(
          (left, right) =>
            Number(booleanFields[resource].includes(left)) -
            Number(booleanFields[resource].includes(right)),
        )
        .map((field) => ({
          id: field,
          label: t(
            `management.fields.${resource === 'sites' && field === 'email' ? 'contact_email' : resource === 'sites' && field === 'updatetime' ? 'account_updatetime' : resource === 'roles' && field === 'is_default' ? 'default_role' : field}`,
          ),
          value: (row) => {
            if (field !== 'profile_name' || !('has_translation' in row))
              return rowValue(row, field);
            if (!row.has_site) return t('management.noPortfolio');
            if (!row.has_translation) return t('management.noTranslation');
            return (
              fullName({
                firstName: (row.first_name ?? '').trim(),
                familyName: (row.family_name ?? '').trim(),
              }) ||
              row.nick_name?.trim() ||
              t('management.unnamedProfile')
            );
          },
          sortable: managementSortFields[resource].includes(field),
          initiallyHidden: !visible[resource].includes(field),
          hideable: field !== 'id',
          filter:
            managementFilterFields[resource].includes(field) && field !== 'role_id'
              ? {
                  value: state.filters[field] ?? '',
                  allLabel: t('management.all'),
                  options: [
                    { value: 'true', label: t('management.yes') },
                    { value: 'false', label: t('management.no') },
                  ],
                  onChange: (value: string) =>
                    update({ page: 1, filters: { ...state.filters, [field]: value } }),
                }
              : undefined,
          render: ['createtime', 'updatetime', 'last_login'].includes(field)
            ? (row) => {
                const value = rowValue(row, field);
                return typeof value === 'string' ? (
                  <time dateTime={value} title={`${value} UTC`}>
                    {new Intl.DateTimeFormat(locale, {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                      timeZone: 'UTC',
                    }).format(new Date(value))}
                  </time>
                ) : (
                  '—'
                );
              }
            : undefined,
        })),
    [resource, locale, t, state.filters, update],
  );
  const copy: DataTableCopy = {
    caption: title,
    loading: t('ui.loading'),
    empty: t('management.empty'),
    error: t('management.loadError'),
    retry: t('ui.retry'),
    rowsPerPage: t('management.rowsPerPage'),
    pagination: t('management.pagination'),
    previous: t('management.previous'),
    next: t('management.next'),
    columns: t('management.columns'),
    sorting: t('management.sorting'),
    clearSort: t('management.clearSort'),
    sortHint: t('management.sortHint'),
    multiSort: t('management.multiSort'),
    columnMenuLabel: (column) => t('management.columnMenu', { column }),
    export: {
      label: t('management.export.label'),
      copy: t('management.export.copy'),
      excel: t('management.export.excel'),
      csv: t('management.export.csv'),
      print: t('management.export.print'),
      scope: t('management.export.scope'),
      busy: t('management.export.busy'),
      error: t('management.export.error'),
      copied: t('management.export.copied'),
    },
    readonly: t('management.readonly'),
    actions: t('management.actions'),
    range: (from, to, total) => t('management.range', { from, to, total }),
    pageLabel: (page) => t('management.pageLabel', { page }),
    sortLabel: (column, direction) =>
      t(
        `management.${direction === 'none' ? 'removeSort' : direction === 'asc' ? 'sortAsc' : 'sortDesc'}`,
        { column },
      ),
    direction: { asc: t('management.ascending'), desc: t('management.descending') },
  };
  const toolbar = (
    <form
      className={styles.toolbar}
      onSubmit={(event) => {
        event.preventDefault();
        if (!searchInvalid) update({ page: 1, search: search.trim() });
      }}
    >
      <label className={styles.search} htmlFor={`${id}-search`}>
        <span className="visually-hidden">{t('management.search')}</span>
        <input
          id={`${id}-search`}
          type="search"
          className="form-control form-control-sm"
          placeholder={t('management.searchPlaceholder')}
          value={search}
          maxLength={200}
          aria-invalid={searchInvalid || undefined}
          aria-describedby={searchInvalid ? `${id}-search-error` : undefined}
          onChange={(event) => setDraft({ committed: state.search, value: event.target.value })}
        />
      </label>
      <button
        className={`btn btn-outline-secondary btn-sm ${styles.refresh}`}
        type="button"
        aria-label={t('management.refresh')}
        disabled={!enabled || query.isFetching}
        onClick={() => void query.refetch()}
      >
        <Icon name="restart" />
        <span>{t('management.refresh')}</span>
      </button>
      {searchInvalid && (
        <span id={`${id}-search-error`} className={styles.searchError} role="alert">
          {t('management.searchLimit')}
        </span>
      )}
    </form>
  );
  return (
    <section className={styles.tablePanel} aria-label={title}>
      <DataTable
        key={resource}
        columns={columns}
        rows={query.data?.items ?? []}
        rowKey={(row) => row.id}
        page={query.data ?? { ...state, total: 0, pages: 0 }}
        sort={state.sort}
        onSortChange={(sort) => update({ page: 1, sort })}
        onPageChange={(page) => update({ page })}
        onSizeChange={(size) => update({ page: 1, size })}
        loading={!enabled || query.isFetching}
        error={query.isError}
        onRetry={() => void query.refetch()}
        copy={copy}
        toolbar={toolbar}
        export={{ filename: `management-${resource}-${locale}` }}
        rowActions={(row) => (
          <button
            className={`btn btn-link btn-sm ${styles.view}`}
            type="button"
            aria-label={t('management.viewRow', {
              name: rowValue(row, resource === 'roles' ? 'role' : 'user'),
            })}
            onClick={() => setSelected(row)}
          >
            <Icon name="eye" />
          </button>
        )}
      />
      {selected && (
        <Modal
          show
          centered
          scrollable
          onHide={() => setSelected(null)}
          className={styles.detail}
          contentClassName={styles.detailContent}
          aria-labelledby={`${id}-detail-title`}
          onKeyDown={(event: KeyboardEvent<HTMLElement>) =>
            cycleDialogTab(event, event.currentTarget)
          }
        >
          <Modal.Header closeButton closeLabel={t('management.close')}>
            <Modal.Title id={`${id}-detail-title`}>
              {t('management.details')} ·{' '}
              {rowValue(selected, resource === 'roles' ? 'role' : 'user')}
            </Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <dl className={styles.details}>
              {columns.map((column) => {
                const value = column.value(selected);
                return (
                  <div key={column.id}>
                    <dt>{column.label}</dt>
                    <dd>
                      {typeof value === 'boolean' ? (
                        <span className="form-check form-switch">
                          <input
                            className="form-check-input"
                            type="checkbox"
                            role="switch"
                            checked={value}
                            disabled
                            readOnly
                            aria-label={`${column.label}: ${t(value ? 'management.yes' : 'management.no')}`}
                          />
                        </span>
                      ) : column.render ? (
                        column.render(selected)
                      ) : (
                        (value ?? '—')
                      )}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </Modal.Body>
          <Modal.Footer>
            <button className="btn btn-outline-secondary" onClick={() => setSelected(null)}>
              {t('management.close')}
            </button>
          </Modal.Footer>
        </Modal>
      )}
    </section>
  );
}
