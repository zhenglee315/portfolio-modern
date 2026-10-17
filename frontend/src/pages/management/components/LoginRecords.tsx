import { formatUtcTimestamp } from '@/shared/lib/timestamps';
import { useId, useMemo, useState, type KeyboardEvent } from 'react';
import Modal from 'react-bootstrap/Modal';
import { useTranslation } from 'react-i18next';
import type { Locale } from '@/i18n/config';
import { dataTableCopy, dataTableSearchCopy } from '@/i18n/table-copy';
import {
  managementFilterSpecs,
  managementSortFields,
  useManagementList,
  type LoginRecordRow,
  type ManagementListState,
} from '@/features/management';
import { cycleDialogTab } from '@/shared/lib/focus';
import { CloseButton } from '@/shared/ui/CloseButton';
import { DataTable, type DataTableColumn } from '@/shared/ui/DataTable';
import { Icon } from '@/shared/ui/Icon';
import { StatusIndicator } from '@/shared/ui/StatusIndicator';
import styles from '../ManagementPage.module.css';

/** Read one account's private audit history without changing the background table's URL state.
 * @author ZhengLee 2026.10.15
 */
export default function LoginRecords({
  userId,
  email,
  locale,
  accountId,
  enabled,
  onClose,
}: {
  userId: number;
  email: string;
  locale: Locale;
  accountId?: number;
  enabled: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const [state, setState] = useState<ManagementListState>({
    page: 1,
    size: 6,
    sort: [],
    filters: [],
  });
  const query = useManagementList('login-records', state, locale, enabled, accountId, userId);
  const update = (patch: Partial<ManagementListState>) =>
    setState((previous) => ({ ...previous, page: 1, ...patch }));
  const columns = useMemo<DataTableColumn<LoginRecordRow>[]>(
    () =>
      [...managementSortFields['login-records'], 'is_online'].map((field) => ({
        id: field,
        label: t(`management.loginHistory.fields.${field}`),
        value: (row) => row[field as keyof LoginRecordRow],
        sortable: field !== 'is_online',
        searchable: field !== 'is_online',
        initiallyHidden: ['user_id', 'email', 'geo_status'].includes(field),
        hideable: field !== 'id',
        truncate: field === 'email' || field === 'ip_address' ? false : undefined,
        filter:
          field === 'geo_status'
            ? {
                type: 'enum',
                options: ['unknown', 'resolved', 'not_found', 'non_public', 'unavailable'].map(
                  (value) => ({
                    value,
                    label: t(`management.loginHistory.statuses.${value}`),
                  }),
                ),
              }
            : managementFilterSpecs['login-records'][field],
        render:
          field === 'is_online'
            ? (row) => (
                <StatusIndicator
                  value={row.is_online}
                  copy={{
                    online: t('management.loginHistory.presence.online'),
                    offline: t('management.loginHistory.presence.offline'),
                    unknown: t('management.loginHistory.presence.unknown'),
                  }}
                />
              )
            : field === 'logintime'
              ? (row) => (
                  <time dateTime={row.logintime} title={`${row.logintime} UTC`}>
                    {formatUtcTimestamp(row.logintime)}
                  </time>
                )
              : field === 'geo_status'
                ? (row) => t(`management.loginHistory.statuses.${row.geo_status}`)
                : undefined,
      })),
    [t],
  );
  const title = t('management.loginHistory.title');
  return (
    <Modal
      show
      centered
      scrollable
      size="xl"
      onHide={onClose}
      className={styles.detail}
      contentClassName={styles.detailContent}
      aria-labelledby={id}
      onKeyDown={(event: KeyboardEvent<HTMLElement>) => cycleDialogTab(event, event.currentTarget)}
    >
      <Modal.Header>
        <Modal.Title as="h2" id={id}>
          <Icon name="activity" />
          {title}
        </Modal.Title>
        <CloseButton label={t('management.close')} onClose={onClose} />
      </Modal.Header>
      <Modal.Body>
        <p className={`${styles.description} mt-0 mb-3 text-break`}>
          {email}
          <br />
          {t('management.loginHistory.note')}
        </p>
        <DataTable
          columns={columns}
          rows={query.data?.items ?? []}
          rowKey={(row) => row.id}
          page={query.data ?? { ...state, total: 0, pages: 0 }}
          sort={state.sort}
          onSortChange={(sort) => update({ sort })}
          filters={state.filters}
          onFiltersChange={(filters) => update({ filters })}
          onPageChange={(page) => update({ page })}
          onSizeChange={(size) => update({ size })}
          loading={!enabled || query.isFetching}
          error={query.isError}
          onRetry={() => void query.refetch()}
          copy={dataTableCopy(t, title)}
          search={{
            value: state.search,
            onChange: (search) => update({ search }),
            copy: dataTableSearchCopy(t),
          }}
          toolbarStart={
            <button
              className="btn btn-sm btn-outline-secondary"
              type="button"
              aria-label={t('management.refresh')}
              title={t('management.refresh')}
              disabled={!enabled || query.isFetching}
              onClick={() => void query.refetch()}
            >
              <Icon name="restart" />
            </button>
          }
          export={{ filename: `login-records-${userId}` }}
        />
        <p className="small mt-3 mb-0">
          IP Geolocation by{' '}
          <a href="https://db-ip.com" target="_blank" rel="noopener noreferrer">
            DB-IP
          </a>{' '}
          · CC BY 4.0
        </p>
      </Modal.Body>
    </Modal>
  );
}
