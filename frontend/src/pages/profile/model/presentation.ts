import type { TFunction } from 'i18next';
import type { Locale } from '@/i18n/config';
import { dateCopy } from '@/i18n/date-copy';
import { periodLabels } from '@/shared/lib/dates';
import {
  isProfileMonth,
  type ProfileExperience,
  type ProfileProject,
} from '@/features/profile-content';

/** Incomplete form dates render a neutral placeholder; validated dates reuse the public formatter. */
export function editorPeriod(
  entry: Pick<
    ProfileExperience | ProfileProject,
    'startMonth' | 'endMonth' | 'endDay' | 'expected'
  >,
  locale: Locale,
  t: TFunction,
) {
  if (!isProfileMonth(entry.startMonth) || (entry.endMonth && !isProfileMonth(entry.endMonth)))
    return '—';
  return periodLabels(
    {
      ...entry,
      endMonth: entry.endMonth || null,
      endDay: /^\d{1,2}$/.test(entry.endDay) ? Number(entry.endDay) : null,
    },
    locale,
    dateCopy(t),
  ).date;
}

/** City presets are explicit local choices, keeping location selection independent of geocoding APIs. */
export const profileCityPresets = [
  {
    city: 'New Taipei',
    country: 'Taiwan',
    code: 'TWN',
    latitude: '25.0338',
    longitude: '121.4322',
  },
  { city: 'Shenzhen', country: 'China', code: 'CHN', latitude: '22.5431', longitude: '114.0579' },
  { city: 'Chengdu', country: 'China', code: 'CHN', latitude: '30.5728', longitude: '104.0668' },
  {
    city: 'Suzhou · Wujiang',
    country: 'China',
    code: 'CHN',
    latitude: '31.1433',
    longitude: '120.6458',
  },
  { city: 'Taoyuan', country: 'Taiwan', code: 'TWN', latitude: '24.9937', longitude: '121.3010' },
  {
    city: 'London',
    country: 'United Kingdom',
    code: 'GBR',
    latitude: '51.5246',
    longitude: '-0.1340',
  },
] as const;
