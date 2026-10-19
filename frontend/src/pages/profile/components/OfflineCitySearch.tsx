import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { findOfflineCities, type OfflineCity } from '../model/offline-map';
import { Icon } from './ProfileIcon';
import styles from './LocationPicker.module.css';

/** Search the shipped city catalog without geocoding or changing the career's city text. */
export function OfflineCitySearch({
  cities,
  disabled,
  onSelect,
}: {
  cities: OfflineCity[];
  disabled: boolean;
  onSelect: (city: OfflineCity) => void;
}) {
  const { t, i18n } = useTranslation();
  const id = useId();
  const [query, setQuery] = useState('');
  const matches = findOfflineCities(cities, query);
  const countryNames = new Intl.DisplayNames([i18n.language], { type: 'region' });
  return (
    <div className={styles.citySearch}>
      <label htmlFor={id}>{t('profileEditor.mapSearch')}</label>
      <input
        id={id}
        type="search"
        autoComplete="off"
        disabled={disabled}
        value={query}
        placeholder={t('profileEditor.mapSearchPlaceholder')}
        aria-describedby={`${id}-hint`}
        aria-controls={query.trim() ? `${id}-results` : undefined}
        onChange={(event) => setQuery(event.target.value)}
      />
      <p id={`${id}-hint`} className={styles.help}>
        {t('profileEditor.mapOfflineHint')}
      </p>
      {query.trim() && (
        <ul
          id={`${id}-results`}
          className={styles.cityResults}
          aria-label={t('profileEditor.mapSearchResults')}
        >
          {matches.map((city) => (
            <li key={city.id}>
              <button
                type="button"
                onClick={() => {
                  onSelect(city);
                  setQuery('');
                }}
              >
                <Icon name="pin" />
                <span>
                  <strong>
                    {i18n.language === 'zh-Hans'
                      ? city.zhHans
                      : i18n.language.startsWith('zh')
                        ? city.zh
                        : city.name}
                  </strong>
                  <small>
                    {[
                      city.name,
                      city.region,
                      /^[A-Z]{2}$/.test(city.country)
                        ? countryNames.of(city.country)
                        : city.country,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </small>
                </span>
              </button>
            </li>
          ))}
          {!matches.length && (
            <li role="status" className={styles.noCities}>
              {t('profileEditor.mapSearchEmpty')}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
