import type { TFunction } from 'i18next';
import type { DateCopy } from '@/shared/lib/dates';

/** Inject localized date vocabulary into shared pure date policies. */
export function dateCopy(t: TFunction): DateCopy {
  return {
    present: t('ui.present'),
    expected: t('ui.expected'),
    month: t('ui.month'),
    months: t('ui.months'),
  };
}
