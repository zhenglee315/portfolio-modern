import {
  useId,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Icon, type IconName } from './ProfileIcon';
import { useProfileEditor } from '../model/editor-context';
import styles from '../ProfilePage.module.css';

/** Shared editor field shell owns label association, help and localized error relationships. */
function FieldShell({
  label,
  help,
  field,
  required,
  children,
}: {
  label: string;
  help?: string;
  field?: string;
  required?: boolean;
  children: (props: {
    id: string;
    'aria-invalid'?: true;
    'aria-describedby'?: string;
  }) => ReactNode;
}) {
  const id = useId();
  const { t } = useTranslation();
  const { issues } = useProfileEditor();
  const issue = issues.find((issue) => issue.field === field);
  const description = [help && `${id}-help`, issue && `${id}-error`].filter(Boolean).join(' ');
  return (
    <div className={styles.field} data-editor-field={field}>
      <label htmlFor={id}>
        {label}
        {required && <span aria-hidden="true"> ＊</span>}
      </label>
      {children({
        id,
        'aria-invalid': issue ? true : undefined,
        'aria-describedby': description || undefined,
      })}
      {help && <small id={`${id}-help`}>{help}</small>}
      {issue && (
        <small className={styles.error} id={`${id}-error`}>
          {t(`profileEditor.error${issue.reason[0]!.toUpperCase()}${issue.reason.slice(1)}`)}
        </small>
      )}
    </div>
  );
}

/** Controlled native inputs keep browser keyboard, date and autofill semantics intact. */
export function EditorField({
  label,
  help,
  field,
  onChange,
  maxLength = 12000,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> & {
  label: string;
  help?: string;
  field?: string;
  onChange: (value: string) => void;
}) {
  return (
    <FieldShell label={label} help={help} field={field} required={props.required}>
      {(accessibility) => (
        <input
          {...props}
          {...accessibility}
          maxLength={maxLength}
          className={styles.input}
          onChange={(event) => onChange(event.currentTarget.value)}
        />
      )}
    </FieldShell>
  );
}

export function EditorArea({
  label,
  help,
  field,
  value,
  onChange,
  required = false,
  rows = 4,
}: {
  label: string;
  help?: string;
  field?: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  rows?: number;
}) {
  return (
    <FieldShell label={label} help={help} field={field} required={required}>
      {(accessibility) => (
        <textarea
          {...accessibility}
          value={value}
          rows={rows}
          required={required}
          maxLength={12000}
          className={styles.input}
          onChange={(event) => onChange(event.currentTarget.value)}
        />
      )}
    </FieldShell>
  );
}

export function EditorSelect({
  label,
  field,
  onChange,
  children,
  ...props
}: Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange'> & {
  label: string;
  field?: string;
  onChange: (value: string) => void;
}) {
  return (
    <FieldShell label={label} field={field} required={props.required}>
      {(accessibility) => (
        <select
          {...props}
          {...accessibility}
          className={styles.input}
          onChange={(event) => onChange(event.currentTarget.value)}
        >
          {children}
        </select>
      )}
    </FieldShell>
  );
}

/** Visual grouping is page-local; the shared application tokens still own color and geometry. */
export function EditorPanel({
  title,
  description,
  children,
  action,
  className = '',
}: {
  title?: string;
  description?: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`${styles.panel} ${className}`}>
      {title && (
        <div className={styles.panelHeading}>
          <div>
            <h2>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function EditorNotice({
  children,
  icon = 'questionCircle',
}: {
  children: ReactNode;
  icon?: IconName;
}) {
  return (
    <div className={styles.notice}>
      <Icon name={icon} />
      <span>{children}</span>
    </div>
  );
}

export function EditorToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className={`${styles.toggle} form-check form-switch`}>
      <input
        type="checkbox"
        role="switch"
        className="form-check-input"
        checked={checked}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
      <span>{label}</span>
    </label>
  );
}

/** Reordering always has keyboard/touch buttons, even when drag handles are available. */
export function OrderButtons({
  name,
  index,
  total,
  onMove,
}: {
  name: string;
  index: number;
  total: number;
  onMove: (offset: number) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className={styles.orderButtons}>
      <button
        type="button"
        className={styles.smallButton}
        aria-label={t('profileEditor.moveUp', { name })}
        disabled={!index}
        onClick={() => onMove(-1)}
      >
        <Icon name="arrowUp" />
      </button>
      <button
        type="button"
        className={styles.smallButton}
        aria-label={t('profileEditor.moveDown', { name })}
        disabled={index === total - 1}
        onClick={() => onMove(1)}
      >
        <Icon name="arrowDown" />
      </button>
    </div>
  );
}

/** Skill assignment references the shared library; adding a label does not duplicate a skill record. */
export function SkillPicker({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const { t } = useTranslation();
  const { draft } = useProfileEditor();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const panelId = useId();
  const options = Object.values(draft.skills).filter((skill) =>
    skill.label.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
  );
  return (
    <div className={styles.stackSmall}>
      <div className={styles.tags}>
        {selected.map(
          (id) =>
            draft.skills[id] && (
              <span className={styles.tag} key={id}>
                {draft.skills[id]!.label}
                <button
                  type="button"
                  aria-label={t('profileEditor.removeSkill', { name: draft.skills[id]!.label })}
                  onClick={() => onChange(selected.filter((key) => key !== id))}
                >
                  <Icon name="close" />
                </button>
              </span>
            ),
        )}
      </div>
      <button
        type="button"
        className={styles.button}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <Icon name="plus" />
        {t('profileEditor.selectSkills')}
      </button>
      {open && (
        <div id={panelId} className={styles.skillPicker}>
          <EditorField
            label={t('profileEditor.searchSkills')}
            type="search"
            value={search}
            onChange={setSearch}
          />
          <div className={styles.skillOptions}>
            {options.map((skill) => (
              <label className={styles.check} key={skill.id}>
                <input
                  type="checkbox"
                  checked={selected.includes(skill.id)}
                  onChange={(event) =>
                    onChange(
                      event.currentTarget.checked
                        ? [...selected, skill.id]
                        : selected.filter((id) => id !== skill.id),
                    )
                  }
                />
                {skill.label}
              </label>
            ))}
          </div>
          {!options.length && <p className={styles.muted}>{t('profileEditor.noResults')}</p>}
        </div>
      )}
    </div>
  );
}
