import { useTranslation } from 'react-i18next';
import { currentMonthUTC } from '@/shared/lib/dates';
import type { ProfileExperience } from '@/features/profile-content';
import { EditorField } from './EditorFields';
import styles from '../ProfilePage.module.css';

type Period = Pick<ProfileExperience, 'startMonth' | 'endMonth' | 'endDay' | 'expected'>;

/** One date policy for career/project forms; ongoing periods never retain an expected end day. */
export function PeriodFields({
  value,
  onChange,
  prefix,
  exactDay = true,
  allowExpected = true,
}: {
  value: Period;
  onChange: (patch: Partial<Period>) => void;
  prefix: string;
  exactDay?: boolean;
  allowExpected?: boolean;
}) {
  const { t } = useTranslation();
  const ongoing = !value.endMonth;
  return (
    <>
      <div className={styles.fields}>
        <EditorField
          label={t('profileEditor.fields.startMonth')}
          field={`${prefix}.startMonth`}
          type="month"
          value={value.startMonth}
          required
          onChange={(startMonth) => onChange({ startMonth })}
        />
        <EditorField
          label={t('profileEditor.fields.endMonth')}
          field={`${prefix}.endMonth`}
          type="month"
          value={value.endMonth}
          disabled={ongoing}
          onChange={(endMonth) => onChange({ endMonth, endDay: '' })}
        />
      </div>
      <div className={styles.checkRow}>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={ongoing}
            onChange={(event) =>
              onChange(
                event.currentTarget.checked
                  ? { endMonth: '', endDay: '', expected: false }
                  : { endMonth: value.startMonth || currentMonthUTC() },
              )
            }
          />
          {t('profileEditor.ongoing')}
        </label>
        {allowExpected && (
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={value.expected}
              onChange={(event) =>
                onChange({
                  expected: event.currentTarget.checked,
                  ...(ongoing && event.currentTarget.checked
                    ? { endMonth: value.startMonth || currentMonthUTC() }
                    : {}),
                })
              }
            />
            {t('profileEditor.expected')}
          </label>
        )}
      </div>
      {exactDay && (
        <EditorField
          label={t('profileEditor.fields.endDay')}
          field={`${prefix}.endDay`}
          value={value.endDay}
          inputMode="numeric"
          maxLength={2}
          disabled={ongoing}
          onChange={(endDay) => onChange({ endDay })}
          help={t('profileEditor.dateHint')}
        />
      )}
    </>
  );
}
