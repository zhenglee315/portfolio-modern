import { useId, useState, type KeyboardEvent } from 'react';
import Modal from 'react-bootstrap/Modal';
import { useTranslation } from 'react-i18next';
import { cycleDialogTab } from '@/shared/lib/focus';
import { CloseButton } from '@/shared/ui/CloseButton';
import { LoadingIndicator } from '@/shared/ui/LoadingIndicator';
import type { MapLocation } from '../model/location';
import { useLocationMap } from '../model/useLocationMap';
import { Icon } from './ProfileIcon';
import { OfflineCitySearch } from './OfflineCitySearch';
import editorStyles from '../ProfilePage.module.css';
import styles from './LocationPicker.module.css';

/** Local candidate coordinates are isolated from the career draft until the user confirms. */
export function LocationPickerModal({
  value,
  place,
  requireCountry = false,
  onConfirm,
  onClose,
}: {
  value: MapLocation | null;
  place: string;
  requireCountry?: boolean;
  onConfirm: (point: MapLocation) => void;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const id = useId();
  const [candidate, setCandidate] = useState(value);
  const {
    containerRef,
    status,
    cities,
    zoom,
    showWorld,
    recenter,
    selectCenter,
    selectCity,
    retry,
  } = useLocationMap(value, t('profileEditor.mapMarker'), setCandidate, i18n.language);
  const ready = status === 'ready';
  return (
    <Modal
      show
      centered
      scrollable
      onHide={onClose}
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-description`}
      className={styles.dialog}
      contentClassName={styles.content}
      backdropClassName={styles.backdrop}
      onKeyDown={(event: KeyboardEvent<HTMLElement>) => cycleDialogTab(event, event.currentTarget)}
    >
      <Modal.Header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>EXPERIENCE / LOCATION</p>
          <Modal.Title as="h2" id={`${id}-title`}>
            {t('profileEditor.pickLocation')}
          </Modal.Title>
          <p id={`${id}-description`} className={styles.help}>
            {t('profileEditor.mapHint')}
          </p>
        </div>
        <CloseButton label={t('profileEditor.closeMap')} onClose={onClose} />
      </Modal.Header>
      <Modal.Body className={styles.body}>
        <p className={styles.place}>
          <Icon name="pin" />
          {place}
        </p>
        {requireCountry && (
          <p className={editorStyles.hint}>{t('profileEditor.countrySelectionHint')}</p>
        )}
        <OfflineCitySearch cities={cities} disabled={!ready} onSelect={selectCity} />
        <div className={styles.stage}>
          <div
            ref={containerRef}
            className={styles.map}
            data-location-map
            data-map-status={status}
            role="region"
            tabIndex={0}
            aria-label={t('profileEditor.locationMap')}
            aria-describedby={`${id}-keyboard`}
          />
          <span className={styles.crosshair} aria-hidden="true" />
          <div className={styles.controls}>
            <button
              type="button"
              className={editorStyles.button}
              disabled={!ready}
              aria-label={t('profileEditor.mapZoomIn')}
              title={t('profileEditor.mapZoomIn')}
              onClick={() => zoom(1)}
            >
              <Icon name="plus" />
            </button>
            <button
              type="button"
              className={editorStyles.button}
              disabled={!ready}
              aria-label={t('profileEditor.mapZoomOut')}
              title={t('profileEditor.mapZoomOut')}
              onClick={() => zoom(-1)}
            >
              <Icon name="minus" />
            </button>
            <button
              type="button"
              className={editorStyles.button}
              disabled={!ready}
              aria-label={t('profileEditor.mapWorld')}
              title={t('profileEditor.mapWorld')}
              onClick={showWorld}
            >
              <Icon name="globe" />
            </button>
            <button
              type="button"
              className={editorStyles.button}
              disabled={!ready || !candidate}
              aria-label={t('profileEditor.mapRecenter')}
              title={t('profileEditor.mapRecenter')}
              onClick={recenter}
            >
              <Icon name="pin" />
            </button>
          </div>
          {status !== 'ready' && (
            <div className={styles.loading}>
              {status === 'loading' ? (
                <LoadingIndicator label={t('ui.loading')} />
              ) : (
                <>
                  <p role="alert">{t('profileEditor.mapUnavailable')}</p>
                  <button type="button" className={editorStyles.button} onClick={retry}>
                    {t('ui.retry')}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
        <div className={styles.mapActions}>
          <p id={`${id}-keyboard`} className={styles.help}>
            {t('profileEditor.mapKeyboard')}
          </p>
          <button
            type="button"
            className={editorStyles.button}
            disabled={!ready}
            onClick={selectCenter}
          >
            <Icon name="pin" />
            {t('profileEditor.mapUseCenter')}
          </button>
        </div>
        <div className={styles.coordinates} aria-live="polite" aria-atomic="true">
          {(['latitude', 'longitude'] as const).map((axis) => (
            <div key={axis}>
              <span>{t(`profileEditor.fields.${axis}`)}</span>
              <output data-location-coordinate={axis}>
                {candidate ? candidate[axis].toFixed(6) : '—'}
              </output>
            </div>
          ))}
        </div>
        <p className={styles.help}>{t('profileEditor.mapCoordinateHint')}</p>
      </Modal.Body>
      <Modal.Footer className={styles.footer}>
        <button type="button" className={editorStyles.button} onClick={onClose}>
          {t('profileEditor.mapCancel')}
        </button>
        <button
          type="button"
          className={`${editorStyles.button} ${editorStyles.primary}`}
          disabled={!candidate || !ready || (requireCountry && !candidate.countryCode)}
          onClick={() => {
            if (candidate && (!requireCountry || candidate.countryCode)) onConfirm(candidate);
          }}
        >
          <Icon name="check" />
          {t('profileEditor.confirmLocation')}
        </button>
      </Modal.Footer>
    </Modal>
  );
}
