import { formatUtcTimestamp } from '@/shared/lib/timestamps';
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Locale } from '@/i18n/config';
import { fullName } from '@/features/site';
import { managementNavigation } from '@/features/account-menu';
import {
  managementFilterSpecs,
  managementSortFields,
  useManagementList,
  rolePermissionFields,
  type ManagementResource,
  type ManagementRow,
} from '@/features/management';
import { DataTable } from '@/shared/ui/DataTable';
import { Icon } from '@/shared/ui/Icon';
import { ManagementDetails, type ManagementDetailColumn } from './ManagementDetails';
import PortfolioPreview from './PortfolioPreview';
import {
  managementEditor,
  managementDraftIssue,
  managementDraftChanges,
  managementFieldIssue,
} from '../model/management-edit';
import { useManagementEdit } from '../hooks/useManagementEdit';
import { useManagementDelete } from '../hooks/useManagementDelete';
import {
  fields,
  visible,
  booleanFields,
  columnLabels,
  detailLabels,
  rowValue,
} from '../model/management-view';
import { useDataTableQuery, useDataTableSelection } from '@/shared/hooks/useDataTableQuery';
import { dataTableCopy, dataTableSearchCopy } from '@/i18n/table-copy';
import { BooleanCell } from '@/shared/ui/BooleanCell';
import WarningModal from '@/shared/ui/WarningModal';
import styles from '../ManagementPage.module.css';

// Load the audit dialog only when requested; it never prefetches another account's history.
//                                                                                 ZhengLee 2026.10.15
const LoginRecords = lazy(() => import('./LoginRecords'));

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
  const { state, onPageChange, onSizeChange, onSortChange, onFiltersChange, onSearchChange } =
    useDataTableQuery(
      managementSortFields[resource],
      managementFilterSpecs[resource],
      undefined,
      visible[resource],
    );
  const scope = `${resource}/${accountId}/${locale}?${JSON.stringify(state)}`;
  const [editing, setEditing] = useState<{
    scope: string;
    row: ManagementRow;
  } | null>(null);
  if (editing && editing.scope !== scope) setEditing(null);
  const [preview, setPreview] = useState<{ scope: string; siteId: number; user: string } | null>(
    null,
  );
  if (preview && preview.scope !== scope) setPreview(null);
  const [history, setHistory] = useState<{ scope: string; id: number; email: string } | null>(null);
  if (history && history.scope !== scope) setHistory(null);
  const selection = useDataTableSelection(scope);
  const [deletion, setDeletion] = useState<{ scope: string; rows: ManagementRow[] } | null>(null);
  if (deletion && deletion.scope !== scope) setDeletion(null);
  const query = useManagementList(resource, state, locale, enabled, accountId);
  const completedDelete = useRef<string | null>(null);
  const { remove: deleteRecords, busy: deleting } = useManagementDelete(
    resource,
    accountId,
    enabled && !query.isFetching && !query.isError,
  );
  useEffect(() => {
    if (completedDelete.current !== scope || deleting || query.isFetching || !query.data) return;
    completedDelete.current = null;
    // A has_site filter can remove the last matching row on a page even though its account survives.
    //                                                                            ZhengLee 2026.10.16
    if (state.page > Math.max(1, query.data.pages)) onPageChange(Math.max(1, query.data.pages));
  }, [scope, deleting, query.isFetching, query.data, state.page, onPageChange]);
  const {
    columns: quickColumns,
    busy: quickBusy,
    save: saveRecord,
    roleEditor,
  } = useManagementEdit(
    resource,
    locale,
    accountId,
    enabled && !query.isFetching && !query.isError && !deleting,
  );
  const nameField = resource === 'roles' ? 'role' : resource === 'users' ? 'email' : 'owner_email';
  const actionsUnavailable = !enabled || query.isFetching || query.isError || quickBusy || deleting;
  const deletionCopy =
    resource === 'sites' ? 'deletion' : resource === 'roles' ? 'roleDeletion' : 'userDeletion';
  const deleteReason = (row: ManagementRow) =>
    resource === 'roles' && 'user_count' in row
      ? row.is_default
        ? t('management.deletion.defaultRole')
        : row.user_count > 0
          ? t('management.deletion.roleInUse')
          : undefined
      : resource === 'sites' && 'owner_email' in row
        ? !row.has_site
          ? t('management.deletion.noSite')
          : row.is_default
            ? t('management.deletion.default')
            : undefined
        : undefined;
  const selectedRows = (query.data?.items ?? []).filter((row) => selection.keys.includes(row.id));
  const openDelete = (rows: ManagementRow[]) => {
    if (!actionsUnavailable && rows.length && !rows.some((row) => deleteReason(row))) {
      setEditing(null);
      setPreview(null);
      setHistory(null);
      setDeletion({ scope, rows });
    }
  };
  const openEdit = (row: ManagementRow) => {
    if (!actionsUnavailable) {
      setDeletion(null);
      setPreview(null);
      setHistory(null);
      setEditing({ scope, row });
    }
  };
  const { columns, detailColumns } = useMemo(() => {
    const makeColumn = (
      field: string,
      override?: string,
      inline = false,
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
        help:
          resource === 'roles' && rolePermissionFields.some((permission) => permission === field)
            ? {
                label: t('management.permissionHelpLabel', { label }),
                text: t(`management.permissionHelp.${field}`),
              }
            : undefined,
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
        truncate:
          field === 'owner_email' || (resource === 'users' && field === 'email')
            ? false
            : undefined,
        filter: managementFilterSpecs[resource][field],
        editor: (row) =>
          resource === 'users' && field === 'role'
            ? roleEditor(row)
            : managementEditor(resource, field, row),
        editUnavailableReason: (row) => {
          const issue = managementFieldIssue(resource, field, row);
          return issue ? t(`management.write.${issue}`) : undefined;
        },
        assignment:
          resource === 'users' && field === 'role'
            ? {
                field: 'role_id',
                value: (row) => ('login_count' in row ? row.role_id : null),
                project: (option) => ({ role: option.label, role_is_active: true }),
              }
            : undefined,
        filterStyle:
          (resource === 'roles' || resource === 'users') && field === 'role'
            ? 'dropdown-list'
            : undefined,
        editing: inline
          ? quickColumns[resource === 'users' && field === 'role' ? 'role_id' : field]
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
                    ['has_site', 'has_profile', 'is_published', 'has_translation'].includes(field)
                  }
                  unavailableReason={
                    field === 'is_default' &&
                    'owner_is_active' in row &&
                    row.is_default !== true &&
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
                    {formatUtcTimestamp(value)}
                  </time>
                ) : (
                  '—'
                );
              }
            : undefined,
      };
    };
    return {
      columns: visible[resource].map((field) => makeColumn(field, undefined, true)),
      detailColumns: fields[resource].map((field) =>
        makeColumn(field, detailLabels[resource][field]),
      ),
    };
  }, [resource, t, quickColumns, roleEditor]);
  const copy = {
    ...dataTableCopy(t, title),
    actions: columnLabels[resource].actions ?? t('management.actions'),
  };
  const toolbar = (
    <div className={styles.tableActions}>
      <button
        className={`btn btn-outline-secondary btn-sm ${styles.tableAction}`}
        type="button"
        value="add"
        aria-label="Add"
        title="Add"
      >
        Add
      </button>
      <button
        className={`btn btn-outline-secondary btn-sm ${styles.tableAction}`}
        type="button"
        value="delete"
        aria-label="Delete"
        title={selectedRows.map(deleteReason).find(Boolean) ?? 'Delete'}
        disabled={
          actionsUnavailable ||
          !selectedRows.length ||
          selectedRows.some((row) => !!deleteReason(row))
        }
        onClick={() => openDelete(selectedRows)}
      >
        Del
      </button>
    </div>
  );
  const reload = (
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
          onChange: (keys) => {
            if (!deleting) selection.onChange(keys);
          },
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
        toolbarStart={reload}
        search={{
          value: state.search,
          onChange: onSearchChange,
          copy: dataTableSearchCopy(t),
        }}
        export={{ filename: `management-${resource}-${locale}` }}
        rowActions={(row) => (
          <div className={styles.rowActions}>
            {resource === 'users' && 'login_count' in row && (
              <button
                className={`btn btn-link btn-sm ${styles.editRow}`}
                type="button"
                aria-label={t('management.loginHistory.open', { name: row.email })}
                title={t('management.loginHistory.open', { name: row.email })}
                disabled={actionsUnavailable}
                onClick={() => {
                  setEditing(null);
                  setDeletion(null);
                  setHistory({ scope, id: row.id, email: row.email });
                }}
              >
                <Icon name="activity" />
              </button>
            )}
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
              disabled={actionsUnavailable || !!deleteReason(row)}
              onClick={() => openDelete([row])}
              aria-label={t('management.deleteRow', {
                name: rowValue(row, nameField),
              })}
              title={
                deleteReason(row) ??
                t('management.deleteRow', {
                  name: rowValue(row, nameField),
                })
              }
            />
          </div>
        )}
      />
      {history?.scope === scope && (
        <Suspense fallback={null}>
          <LoginRecords
            key={`${accountId}/${locale}/${history.id}`}
            userId={history.id}
            email={history.email}
            locale={locale}
            accountId={accountId}
            enabled={enabled}
            onClose={() => setHistory(null)}
          />
        </Suspense>
      )}
      {preview?.scope === scope && (
        <PortfolioPreview
          locale={locale}
          siteId={preview.siteId}
          user={preview.user}
          onClose={() => setPreview(null)}
        />
      )}
      {editing?.scope === scope && (
        <ManagementDetails
          key={editing.row.id}
          row={query.data?.items.find((row) => row.id === editing.row.id) ?? editing.row}
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
              conflict: t('management.write.detailConflict'),
            },
          }}
          busy={quickBusy}
          validate={(draft) => {
            const issue = managementDraftIssue(resource, editing.row, draft);
            return issue ? t(`management.write.${issue}`) : undefined;
          }}
          changeDraft={(draft, field, value) =>
            managementDraftChanges(resource, draft, field, value)
          }
          onSave={async (changes) => {
            await saveRecord(editing.row, changes);
            setEditing(null);
          }}
          onClose={() => {
            if (!quickBusy) setEditing(null);
          }}
        />
      )}
      {deletion?.scope === scope && (
        <WarningModal
          layout="prompt"
          busy={deleting}
          title={t('management.deleteConfirmation')}
          message={
            deletion.rows.length === 1
              ? t(`management.${deletionCopy}.target`, {
                  name: rowValue(deletion.rows[0]!, nameField),
                })
              : t(`management.${deletionCopy}.targets`, { count: deletion.rows.length })
          }
          closeLabel={t('management.close')}
          onClose={() => {
            if (!deleting) setDeletion(null);
          }}
          confirm={{
            label: t(deleting ? 'management.deletion.deleting' : 'management.confirmDelete'),
            cancelLabel: t('management.cancel'),
            variant: 'danger',
            // All resources share one coordinator; each original business class owns its delete rules.
            //                                                                            ZhengLee 2026.10.16
            onConfirm: () => {
              if (actionsUnavailable) return;
              void deleteRecords(deletion.rows).then(() => {
                completedDelete.current = scope;
                selection.onChange([]);
                setDeletion(null);
              });
            },
          }}
        />
      )}
    </section>
  );
}
