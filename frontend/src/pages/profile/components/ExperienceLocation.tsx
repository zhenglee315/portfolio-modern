import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ProfileExperience } from '@/features/profile-content';
import { useProfileEditor } from '../model/editor-context';
import { readMapLocation } from '../model/location';
import { profileCityPresets } from '../model/presentation';
import { EditorField, EditorNotice, EditorPanel, EditorSelect } from './EditorFields';
import { Icon } from './ProfileIcon';
import { LocationPickerModal } from './LocationPickerModal';
import styles from '../ProfilePage.module.css';

/** One career form owns its translated place text and shared coordinates; the map stages a candidate. */
export function ExperienceLocation({
  entry,
  onChange,
  onTranslate,
}: {
  entry: ProfileExperience;
  onChange: (value: Partial<ProfileExperience>) => void;
  onTranslate: (value: Partial<ProfileExperience['translations']['en']>) => void;
}) {
  const { t } = useTranslation();
  const { contentLocale } = useProfileEditor();
  const [mapOpen, setMapOpen] = useState(false);
  const copy = entry.translations[contentLocale];
  const prefix = `experiences.${entry.id}`;
  return (
    <EditorPanel
      title={t('profileEditor.locationTitle')}
      description={t('profileEditor.locationHint')}
    >
      <div className={styles.fields}>
        <EditorField
          label={t('profileEditor.fields.country')}
          value={copy.country}
          field={`${prefix}.country`}
          required
          onChange={(country) => onTranslate({ country })}
        />
        <EditorField
          label={t('profileEditor.fields.city')}
          value={copy.city}
          field={`${prefix}.city`}
          required
          onChange={(city) => onTranslate({ city })}
        />
      </div>
      <EditorSelect
        label={t('profileEditor.findCity')}
        value=""
        onChange={(value) => {
          const place = profileCityPresets.find((place) => place.city === value);
          if (!place) return;
          onChange({
            latitude: place.latitude,
            longitude: place.longitude,
            countryCode: place.code,
            translations: {
              ...entry.translations,
              [contentLocale]: { ...copy, city: place.city, country: place.country },
            },
          });
        }}
      >
        <option value="">{t('profileEditor.findCity')}</option>
        {profileCityPresets.map((place) => (
          <option key={place.city} value={place.city}>
            {place.city} · {place.country}
          </option>
        ))}
      </EditorSelect>
      <div className={styles.fields}>
        {(['latitude', 'longitude'] as const).map((axis) => (
          <EditorField
            key={axis}
            label={t(`profileEditor.fields.${axis}`)}
            value={entry[axis]}
            field={`${prefix}.${axis}`}
            readOnly
            aria-haspopup="dialog"
            placeholder={t('profileEditor.pickLocation')}
            onClick={() => setMapOpen(true)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                setMapOpen(true);
              }
            }}
            onChange={() => setMapOpen(true)}
          />
        ))}
      </div>
      <button
        type="button"
        className={styles.button}
        aria-haspopup="dialog"
        onClick={() => setMapOpen(true)}
      >
        <Icon name="pin" />
        {t('profileEditor.pickLocation')}
      </button>
      <EditorNotice icon="pin">{t('profileEditor.coordinatesHint')}</EditorNotice>
      {mapOpen && (
        <LocationPickerModal
          requireCountry={!entry.countryCode}
          value={readMapLocation(entry.latitude, entry.longitude)}
          place={[copy.city, copy.country].filter(Boolean).join(' · ')}
          onClose={() => setMapOpen(false)}
          onConfirm={(point) => {
            onChange({
              ...(point.countryCode ? { countryCode: point.countryCode } : {}),
              latitude: point.latitude.toFixed(6),
              longitude: point.longitude.toFixed(6),
            });
            setMapOpen(false);
          }}
        />
      )}
    </EditorPanel>
  );
}
