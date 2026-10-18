import { useId, useState } from 'react';
import Dropdown from 'react-bootstrap/Dropdown';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/shared/ui/Icon';
import { MonitorSelect } from './monitor-presentation';
import { MonitorGlyph } from './MonitorGlyph';
import { localDate, validPeriod } from './overview-model';
import type { MonitorOverviewModel } from './useMonitorOverview';
import styles from './MonitorOverview.module.css';

/** Apply an inclusive local-calendar range atomically; invalid drafts never reach an API.
 * @author ZhengLee 2026.10.18
 */
export function MonitorFilters({ model }: { model: MonitorOverviewModel }) {
  const { t } = useTranslation();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ start: model.filters.start, end: model.filters.end });
  const valid = validPeriod(draft.start, draft.end, localDate(model.now));
  const preset =
    model.params.has('start') || model.params.has('end')
      ? 'custom'
      : model.params.get('days') === '30'
        ? '30'
        : '7';
  const toggle = (next: boolean) => {
    if (next) setDraft({ start: model.filters.start, end: model.filters.end });
    setOpen(next);
  };
  return (
    <div className={styles.filters}>
      <Dropdown show={open} onToggle={toggle} autoClose="outside">
        <Dropdown.Toggle
          variant="outline-secondary"
          className={styles.dateToggle}
          aria-label={t('overview.dateRange')}
        >
          <MonitorGlyph name="calendar" />
          <span>
            {model.filters.start.replaceAll('-', '/')} –{' '}
            {model.filters.end.slice(5).replace('-', '/')}
          </span>
        </Dropdown.Toggle>
        <Dropdown.Menu className={styles.dateMenu}>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (valid) {
                model.update({ start: draft.start, end: draft.end, days: null });
                setOpen(false);
              }
            }}
          >
            <label htmlFor={`${id}-start`}>
              {t('overview.startDate')}
              <input
                id={`${id}-start`}
                type="date"
                required
                value={draft.start}
                max={localDate(model.now)}
                aria-describedby={`${id}-hint`}
                onChange={(event) => setDraft((value) => ({ ...value, start: event.target.value }))}
              />
            </label>
            <label htmlFor={`${id}-end`}>
              {t('overview.endDate')}
              <input
                id={`${id}-end`}
                type="date"
                required
                value={draft.end}
                max={localDate(model.now)}
                aria-describedby={`${id}-hint`}
                onChange={(event) => setDraft((value) => ({ ...value, end: event.target.value }))}
              />
            </label>
            <p id={`${id}-hint`} role={valid ? undefined : 'status'}>
              {t('overview.dateHint')}
            </p>
            <div>
              <button type="button" onClick={() => toggle(false)}>
                {t('overview.cancel')}
              </button>
              <button type="submit" disabled={!valid}>
                {t('overview.apply')}
              </button>
            </div>
          </form>
        </Dropdown.Menu>
      </Dropdown>
      <MonitorSelect
        label={t('overview.period')}
        value={preset}
        options={[
          { value: '7', label: t('overview.lastDays', { count: 7 }) },
          { value: '30', label: t('overview.lastDays', { count: 30 }) },
          { value: 'custom', label: t('overview.custom') },
        ]}
        onChange={(value) =>
          value === 'custom' ? toggle(true) : model.update({ days: value, start: null, end: null })
        }
      />
      <button
        type="button"
        className={styles.autoRefresh}
        aria-pressed={!model.paused}
        onClick={() => model.setPaused((value) => !value)}
      >
        <MonitorGlyph name="refresh" />
        {t(model.paused ? 'overview.updatesPaused' : 'overview.updateEvery', {
          seconds: model.services.data?.refresh_seconds ?? 30,
        })}
      </button>
      <button
        type="button"
        className={styles.refreshButton}
        aria-label={t('overview.refreshNow')}
        disabled={
          !model.valid ||
          model.traffic.isFetching ||
          model.logins.isFetching ||
          model.availability.isFetching
        }
        onClick={model.refresh}
      >
        <Icon name="restart" />
      </button>
    </div>
  );
}
