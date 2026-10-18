import { tableToolbarMenuPosition } from '@/shared/lib/menu-position';
import menuStyles from '@/shared/ui/DataTableMenu.module.css';
import { Icon, type IconName } from '@/shared/ui/Icon';
import { useId, type ReactNode } from 'react';
import Dropdown from 'react-bootstrap/Dropdown';
import { type MonitorWorker } from './monitor';
import styles from './MonitoringPanel.module.css';
export const metric = (value: number | null | undefined, suffix = '') =>
  value == null ? '—' : `${Math.round(value).toLocaleString()}${suffix}`;
export const workerLabel = (worker: MonitorWorker) =>
  `Worker ${String(worker.slot ?? worker.pid).padStart(2, '0')}`;

/** Compact single choice using the same menu surface and placement as DataTable controls. */
export function MonitorSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  const id = useId();
  const selected = options.find((option) => option.value === value);
  return (
    <Dropdown>
      <Dropdown.Toggle
        id={`${id}-toggle`}
        type="button"
        variant="outline-secondary"
        size="sm"
        className={styles.selectToggle}
        aria-label={`${label}: ${selected?.label ?? label}`}
        aria-controls={`${id}-options`}
        aria-haspopup="menu"
      >
        {selected?.label ?? label}
      </Dropdown.Toggle>
      <Dropdown.Menu
        id={`${id}-options`}
        role="menu"
        aria-labelledby={`${id}-toggle`}
        className={menuStyles.menu}
        popperConfig={tableToolbarMenuPosition}
      >
        {options.map((option) => (
          <Dropdown.Item
            key={option.value}
            as="button"
            type="button"
            role="menuitemradio"
            aria-checked={option.value === value}
            active={option.value === value}
            className={styles.selectOption}
            onClick={() => onChange(option.value)}
          >
            {option.label}
            {option.value === value && <Icon name="check" />}
          </Dropdown.Item>
        ))}
      </Dropdown.Menu>
    </Dropdown>
  );
}

/** Inline worker resource value; the icon keeps its readable label and hover detail. */
export function WorkerMetric({
  icon,
  label,
  value,
}: {
  icon: IconName;
  label: string;
  value: string;
}) {
  return (
    <div title={`${label}: ${value}`}>
      <dt>
        <Icon name={icon} label={label} />
      </dt>
      <dd>{value}</dd>
    </div>
  );
}

/** One summary card; values describe all retained events, independent of table filters. */
export function Stat({
  label,
  value,
  note,
  icon,
  graphic,
  children,
  className = '',
}: {
  label: string;
  value: string;
  note: ReactNode;
  icon: IconName;
  graphic?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`${styles.stat} ${className}`} aria-label={label}>
      <div>
        <span>{label}</span>
        {graphic ?? <Icon name={icon} />}
      </div>
      <strong>{value}</strong>
      {children}
      <small>{note}</small>
    </section>
  );
}
