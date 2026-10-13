import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Locale } from '@/i18n/config';
import { fullName } from '@/features/site';
import { managementNavigation } from '@/features/account-menu';
import {
  managementFilterSpecs,
  managementSortFields,
  useManagementList,
  type ManagementResource,
  type ManagementRow,
} from '@/features/management';
import { DataTable } from '@/shared/ui/DataTable';
import { Icon } from '@/shared/ui/Icon';
import { ManagementDetails, type ManagementDetailColumn } from './ManagementDetails';
import PortfolioPreview from './PortfolioPreview';
import { managementEditor } from '../model/management-edit';
import {
  fields,
  visible,
  booleanFields,
  columnLabels,
  detailLabels,
  rowValue,
} from '../model/management-view';
import { useDataTableQuery, useDataTableSelection } from '@/shared/hooks/useDataTableQuery';
import { dataTableCopy } from '@/i18n/table-copy';
import { BooleanCell } from '@/shared/ui/BooleanCell';
import WarningModal from '@/shared/ui/WarningModal';
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
  const { state, onPageChange, onSizeChange, onSortChange, onFiltersChange } = useDataTableQuery(
    managementSortFields[resource],
    managementFilterSpecs[resource],
  );
  const scope = `${resource}/${accountId}/${locale}?${JSON.stringify(state)}`;
  const [editing, setEditing] = useState<{
    scope: string;
    row: ManagementRow;
    confirmed: boolean;
  } | null>(null);
  if (editing && editing.scope !== scope) setEditing(null);
  const [preview, setPreview] = useState<{ scope: string; siteId: number; user: string } | null>(
    null,
  );
  if (preview && preview.scope !== scope) setPreview(null);
  const selection = useDataTableSelection(scope);
  const [deletion, setDeletion] = useState<{ scope: string; rows: ManagementRow[] } | null>(null);
  if (deletion && deletion.scope !== scope) setDeletion(null);
  const query = useManagementList(resource, state, locale, enabled, accountId);
  const nameField = resource === 'roles' ? 'role' : resource === 'users' ? 'email' : 'user';
  const actionsUnavailable = !enabled || query.isFetching || query.isError;
  const selectedRows = (query.data?.items ?? []).filter((row) => selection.keys.includes(row.id));
  const openDelete = (rows: ManagementRow[]) => {
    if (!actionsUnavailable && rows.length) {
      setEditing(null);
      setPreview(null);
      setDeletion({ scope, rows });
    }
  };
  const openEdit = (row: ManagementRow) => {
    if (!actionsUnavailable) {
      setDeletion(null);
      setPreview(null);
      setEditing({ scope, row, confirmed: false });
    }
  };
  const { columns, detailColumns } = useMemo(() => {
    const makeColumn = (
      field: string,
      override?: string,
    ): ManagementDetailColumn<ManagementRow> => {
      const label =
        override ||
        columnLabels[resource][field] ||
        t(
          `management.fields.${resource === 'sites' && field === 'email' ? 'contact_email' : resource === 'roles' && field === 'is_default' ? 'default_role' : field}`,
        );
      return {
        id: field,
        label,
        value: (row) => {
          if (field !== 'profile_name' || !('has_translation' in row)) return rowValue(row, field);
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
        truncate: resource === 'users' && field === 'email' ? false : undefined,
        filter: managementFilterSpecs[resource][field],
        editor: (row) => managementEditor(resource, field, row),
        filterStyle:
          (resource === 'roles' || resource === 'users') && field === 'role'
            ? 'dropdown-list'
            : undefined,
        render: booleanFields[resource].includes(field)
          ? (row) => {
              return (
                <BooleanCell
                  value={rowValue(row, field) as boolean | null}
                  label={label}
                  rowId={row.id}
                  readonly={t('management.readonly')}
                  checkbox={
                    resource === 'sites' &&
                    ['has_site', 'is_published', 'has_translation'].includes(field)
                  }
                  unavailableReason={
                    field === 'is_default' &&
                    'owner_is_active' in row &&
                    !(row.owner_is_active && row.has_site && row.is_published)
                      ? t('management.defaultRequires')
                      : undefined
                  }
                />
              );
            }
          : ['createtime', 'updatetime', 'last_login'].includes(field)
            ? (row) => {
                const value = rowValue(row, field);
                return typeof value === 'string' ? (
                  <time dateTime={value} title={`${value} UTC`}>
                    {new Date(value)
                      .toISOString()
                      .slice(0, 19)
                      .replaceAll('-', '.')
                      .replace('T', ' ')}
                  </time>
                ) : (
                  '—'
                );
              }
            : undefined,
      };
    };
    return {
      columns: visible[resource].map((field) => makeColumn(field)),
      detailColumns: fields[resource].map((field) =>
        makeColumn(field, detailLabels[resource][field]),
      ),
    };
  }, [resource, t]);
  const copy = {
    ...dataTableCopy(t, title),
    actions: columnLabels[resource].actions ?? t('management.actions'),
  };
  const toolbar = (
    <div className={styles.toolbar}>
      <button
        className={`btn btn-outline-secondary btn-sm ${styles.refresh}`}
        type="button"
        aria-label={t('management.refresh')}
        title={t('management.refresh')}
        disabled={!enabled || query.isFetching}
        onClick={() => void query.refetch()}
      >
        <Icon name="restart" />
      </button>
      <div className={styles.tableActions}>
        <button
          className={`btn btn-outline-secondary btn-sm ${styles.tableAction}`}
          type="button"
          value="add"
        >
          Add
        </button>
        <button
          className={`btn btn-outline-secondary btn-sm ${styles.tableAction}`}
          type="button"
          value="delete"
          aria-label="Delete"
          title="Delete"
          disabled={actionsUnavailable || !selectedRows.length}
          onClick={() => openDelete(selectedRows)}
        >
          Del
        </button>
      </div>
    </div>
  );
  return (
    <section className={styles.tablePanel} aria-label={title}>
      <DataTable
        key={`${resource}/${accountId}/${locale}`}
        columns={columns}
        rows={query.data?.items ?? []}
        rowKey={(row) => row.id}
        selection={{
          ...selection,
          allLabel: t('management.selectAll'),
          rowLabel: (row) =>
            t('management.selectRow', {
              name: rowValue(row, nameField),
            }),
        }}
        page={query.data ?? { ...state, total: 0, pages: 0 }}
        filters={state.filters}
        onFiltersChange={onFiltersChange}
        sort={state.sort}
        onSortChange={onSortChange}
        onPageChange={onPageChange}
        onSizeChange={onSizeChange}
        loading={!enabled || query.isFetching}
        error={query.isError}
        onRetry={() => void query.refetch()}
        copy={copy}
        toolbar={toolbar}
        export={{ filename: `management-${resource}-${locale}` }}
        rowActions={(row) => (
          <div className={styles.rowActions}>
            {resource === 'sites' && (
              <button
                className={`btn btn-link btn-sm ${styles.editRow}`}
                type="button"
                value="preview"
                aria-label={t('management.previewRow', { name: rowValue(row, nameField) })}
                title={t('management.previewRow', { name: rowValue(row, nameField) })}
                disabled={
                  actionsUnavailable || !('has_translation' in row && row.has_site && row.site_id)
                }
                onClick={() => {
                  if (
                    !actionsUnavailable &&
                    'has_translation' in row &&
                    row.has_site &&
                    row.site_id
                  ) {
                    setEditing(null);
                    setDeletion(null);
                    setPreview({ scope, siteId: row.site_id, user: row.user });
                  }
                }}
              >
                <Icon name="eye" />
              </button>
            )}
            <button
              className={`btn btn-link btn-sm ${styles.tableAction} ${styles.editRow}`}
              type="button"
              value="edit"
              disabled={actionsUnavailable}
              aria-label={t('management.editRow', {
                name: rowValue(row, nameField),
              })}
              title={t('management.editRow', { name: rowValue(row, nameField) })}
              onClick={() => openEdit(row)}
            />
            <button
              className={`btn btn-link btn-sm ${styles.tableAction} ${styles.deleteRow}`}
              type="button"
              value="delete"
              disabled={actionsUnavailable}
              onClick={() => openDelete([row])}
              aria-label={t('management.deleteRow', {
                name: rowValue(row, nameField),
              })}
              title={t('management.deleteRow', {
                name: rowValue(row, nameField),
              })}
            />
          </div>
        )}
      />
      {preview?.scope === scope && (
        <PortfolioPreview
          locale={locale}
          siteId={preview.siteId}
          user={preview.user}
          onClose={() => setPreview(null)}
        />
      )}
      {editing?.scope === scope && !editing.confirmed && (
        <WarningModal
          layout="prompt"
          title={t('management.editConfirmation')}
          message={t('management.editTarget', { name: rowValue(editing.row, nameField) })}
          closeLabel={t('management.close')}
          onClose={() => setEditing(null)}
          confirm={{
            label: t('management.confirmEdit'),
            cancelLabel: t('management.cancel'),
            onConfirm: () =>
              setEditing((previous) =>
                previous?.scope === scope ? { ...previous, confirmed: true } : null,
              ),
          }}
        />
      )}
      {editing?.scope === scope && editing.confirmed && (
        <ManagementDetails
          key={editing.row.id}
          row={editing.row}
          columns={detailColumns}
          icon={managementNavigation.find((item) => item.resource === resource)!.icon}
          copy={{
            title: t('management.details'),
            close: t('management.close'),
            field: {
              edit: (label) => t('management.editField', { label }),
              clear: (label) => t('management.clearField', { label }),
              invalid: t('management.invalidField'),
              empty: '—',
            },
            save: {
              title: t('management.saveConfirmation'),
              message: t('management.saveTarget', { name: rowValue(editing.row, nameField) }),
              confirm: t('management.confirmSave'),
              cancel: t('management.cancel'),
            },
          }}
          onClose={() => setEditing(null)}
        />
      )}
      {deletion?.scope === scope && (
        <WarningModal
          title={t('management.deleteConfirmation')}
          message={
            deletion.rows.length === 1
              ? t('management.deleteTarget', {
                  name: rowValue(deletion.rows[0]!, nameField),
                })
              : t('management.deleteTargets', { count: deletion.rows.length })
          }
          closeLabel={t('management.close')}
          onClose={() => setDeletion(null)}
          confirm={{
            label: t('management.confirmDelete'),
            cancelLabel: t('management.cancel'),
            variant: 'danger',
            // UI preview only: the future mutation belongs here, never in WarningModal.
            onConfirm: () => setDeletion(null),
          }}
        />
      )}
    </section>
  );
}
