import { useId, useRef, useState } from 'react';
import Fade from 'react-bootstrap/Fade';
import { useTranslation } from 'react-i18next';
import world from '@/assets/monitor/world.svg';
import coordinates from '@/assets/monitor/country-points.json';
import { Icon } from '@/shared/ui/Icon';
import type { MonitorLogins } from './overview-api';
import { countryName, overviewNumber } from './overview-model';
import { MonitorGlyph } from './MonitorGlyph';
import styles from './MonitorOverview.module.css';

const points: Record<string, number[]> = coordinates;
const project = (code: string) => {
  const point = points[code];
  return point ? { x: 40 + ((point[0]! + 180) / 360) * 792, y: 187 - point[1]! * 2.2 } : undefined;
};

/** Place countries on the atlas and local sign-ins on a fixed Robot marker; unknowns stay unplotted.
 * Keyboard selection, touch disclosure, bounded panning and zoom share the country ranking state.
 * @author ZhengLee 2026.10.18
 */
export function MonitorLoginMap({ data, locale }: { data: MonitorLogins; locale: string }) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<string>();
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const svg = useRef<SVGSVGElement>(null);
  const dragging = useRef<{ x: number; y: number; panX: number; panY: number } | undefined>(
    undefined,
  );
  const tooltipId = useId();
  const country = data.countries.find((item) => item.country_code === selected);
  const location = country && project(country.country_code);
  const max = Math.max(1, ...data.countries.map((item) => item.users));
  const localPercent = data.total ? (data.local_users / data.total) * 100 : 0;
  const show = (code: string) => {
    setSelected(code);
    setTooltipOpen(true);
  };
  const hide = () => setTooltipOpen(false);
  const leave = (event: { pointerType: string }) => {
    if (event.pointerType !== 'touch') hide();
  };
  const choose = (code: string) => {
    show(code);
    if (zoom > 1) {
      const point = project(code);
      if (point) setPan({ x: (450 - point.x) * zoom, y: (155 - point.y) * zoom });
    }
  };
  const changeZoom = (value: number) => {
    setZoom(value);
    if (value === 1) setPan({ x: 0, y: 0 });
  };
  const unmapped = data.countries
    .filter((item) => !project(item.country_code))
    .reduce((total, item) => total + item.users, 0);
  return (
    <div
      className={styles.geoBody}
      onKeyDown={(event) => {
        if (event.key === 'Escape') hide();
      }}
    >
      <div className={styles.mapColumn}>
        <div className={styles.mapStage}>
          <svg
            ref={svg}
            viewBox="0 0 900 310"
            role="group"
            aria-label={t('overview.mapLabel')}
            data-monitor-map
            onPointerDown={(event) => {
              if (
                zoom === 1 ||
                event.button !== 0 ||
                (event.target as Element).closest('[role="button"]')
              )
                return;
              dragging.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y };
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              const drag = dragging.current;
              if (!drag) return;
              const ratio = 900 / Math.max(1, svg.current?.getBoundingClientRect().width ?? 900);
              setPan({
                x: Math.max(
                  -450 * (zoom - 1),
                  Math.min(450 * (zoom - 1), drag.panX + (event.clientX - drag.x) * ratio),
                ),
                y: Math.max(
                  -155 * (zoom - 1),
                  Math.min(155 * (zoom - 1), drag.panY + (event.clientY - drag.y) * ratio),
                ),
              });
            }}
            onPointerUp={() => {
              dragging.current = undefined;
            }}
            onPointerCancel={() => {
              dragging.current = undefined;
            }}
          >
            <g className={styles.mapGrid}>
              {[80, 212, 344, 476, 608, 740, 872].map((x) => (
                <line key={x} x1={x} x2={x} y1="0" y2="300" />
              ))}
              {[55, 121, 187, 253].map((y) => (
                <line key={y} x1="12" x2="894" y1={y} y2={y} />
              ))}
            </g>
            <g
              transform={`translate(${450 + pan.x} ${155 + pan.y}) scale(${zoom}) translate(-450 -155)`}
            >
              <image href={world} x="40" y="0" width="792" height="310" aria-hidden="true" />
              {data.countries.map((item) => {
                const position = project(item.country_code);
                if (!position) return null;
                const radius = Math.max(3, Math.sqrt(item.users / max) * 16);
                return (
                  <g
                    key={item.country_code}
                    transform={`translate(${position.x} ${position.y})`}
                    role="button"
                    tabIndex={0}
                    className={styles.mapMarker}
                    data-selected={tooltipOpen && selected === item.country_code}
                    aria-label={`${countryName(item.country_code, locale)}: ${overviewNumber(item.users, locale)} (${overviewNumber(item.percent, locale, 1)}%)`}
                    aria-describedby={
                      tooltipOpen && selected === item.country_code ? tooltipId : undefined
                    }
                    onFocus={() => show(item.country_code)}
                    onBlur={hide}
                    onClick={() => choose(item.country_code)}
                    onPointerEnter={(event) => {
                      if (event.pointerType !== 'touch') show(item.country_code);
                    }}
                    onPointerLeave={leave}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        choose(item.country_code);
                      }
                    }}
                  >
                    <circle r={radius + 5} className={styles.markerHalo} />
                    <circle r={radius} />
                    <circle r="2.7" className={styles.markerCore} />
                    {data.countries.length <= 10 && (
                      <text y={position.y < 60 ? radius + 20 : -radius - 9} textAnchor="middle">
                        {countryName(item.country_code, locale)} ·{' '}
                        {overviewNumber(item.users, locale)}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          </svg>
          {country && location && (
            <Fade in={tooltipOpen} mountOnEnter unmountOnExit>
              <div
                id={tooltipId}
                role="tooltip"
                className={styles.mapTooltip}
                style={{
                  left: `${Math.max(2, Math.min(76, ((location.x - 450) * zoom + 450 + pan.x) / 9))}%`,
                  top: `${Math.max(2, Math.min(65, ((location.y - 155) * zoom + 155 + pan.y) / 3.1))}%`,
                }}
              >
                <span>
                  <i />
                  {countryName(country.country_code, locale)} <code>{country.country_code}</code>
                </span>
                <strong>
                  {overviewNumber(country.users, locale)}{' '}
                  <small>
                    {t('overview.usersUnit')} · {overviewNumber(country.percent, locale, 1)}%
                  </small>
                </strong>
                <small>{t('overview.periodLogins')}</small>
              </div>
            </Fade>
          )}
          <button
            type="button"
            className={styles.localMarker}
            data-monitor-local
            data-active={data.local_users > 0}
            aria-label={`${t('overview.localNetwork')}: ${overviewNumber(data.local_users, locale)} (${overviewNumber(localPercent, locale, 1)}%)`}
            aria-pressed={tooltipOpen && selected === 'local'}
            aria-describedby={tooltipOpen && selected === 'local' ? tooltipId : undefined}
            onFocus={() => show('local')}
            onBlur={hide}
            onClick={() => choose('local')}
            onPointerEnter={(event) => {
              if (event.pointerType !== 'touch') show('local');
            }}
            onPointerLeave={leave}
          >
            <Icon name="robot" />
            {data.local_users > 0 && (
              <span
                className={styles.localPresence}
                data-monitor-local-presence
                data-decoration
                aria-hidden="true"
              />
            )}
          </button>
          {selected === 'local' && (
            <Fade in={tooltipOpen} mountOnEnter unmountOnExit>
              <div
                id={tooltipId}
                role="tooltip"
                className={`${styles.mapTooltip} ${styles.localTooltip}`}
              >
                <span>
                  <i />
                  {t('overview.localhost')} <code>LOCAL</code>
                </span>
                <strong>
                  {overviewNumber(data.local_users, locale)}{' '}
                  <small>
                    {t('overview.usersUnit')} · {overviewNumber(localPercent, locale, 1)}%
                  </small>
                </strong>
                <small>{t('overview.localNetwork')}</small>
                <small>{t('overview.periodLogins')}</small>
              </div>
            </Fade>
          )}
          <div className={styles.mapTools} role="group" aria-label={t('overview.mapTools')}>
            <button
              type="button"
              aria-label={t('overview.zoomIn')}
              disabled={zoom >= 3}
              onClick={() => changeZoom(Math.min(3, zoom + 0.5))}
            >
              <MonitorGlyph name="plus" />
            </button>
            <button
              type="button"
              aria-label={t('overview.zoomOut')}
              disabled={zoom <= 1}
              onClick={() => changeZoom(Math.max(1, zoom - 0.5))}
            >
              <MonitorGlyph name="minus" />
            </button>
          </div>
          {!data.countries.length && !data.local_users && (
            <p className={styles.mapEmpty}>
              {t(
                data.total
                  ? 'overview.noKnownLocations'
                  : data.coverage.complete
                    ? 'overview.noLogins'
                    : 'overview.noCompleteData',
              )}
            </p>
          )}
        </div>
        <div className={styles.mapLegend}>
          <span>
            <i />
            {t('overview.bubbleLegend')} <b />
            <b />
            <b />
          </span>
          <span>{t('overview.approximate')}</span>
        </div>
        {!!unmapped && (
          <p className={styles.coverageNote}>{t('overview.unmapped', { count: unmapped })}</p>
        )}
      </div>
      <div className={styles.ranking}>
        <div className={styles.rankHeading}>
          <span>{t('overview.region')}</span>
          <span>{t('overview.peopleShare')}</span>
        </div>
        <ol>
          {data.countries.map((item, index) => (
            <li key={item.country_code}>
              <button
                type="button"
                aria-pressed={tooltipOpen && selected === item.country_code}
                onBlur={hide}
                onPointerLeave={leave}
                onClick={() => choose(item.country_code)}
              >
                <span className={styles.rankIndex}>{String(index + 1).padStart(2, '0')}</span>
                <span className={styles.rankName}>
                  {countryName(item.country_code, locale)} <code>{item.country_code}</code>
                  <span className={styles.rankTrack}>
                    <span style={{ width: `${item.percent}%` }} />
                  </span>
                </span>
                <span className={styles.rankCount}>{overviewNumber(item.users, locale)}</span>
                <small>{overviewNumber(item.percent, locale, 1)}%</small>
              </button>
            </li>
          ))}
          {!!data.local_users && (
            <li>
              <button
                type="button"
                aria-pressed={tooltipOpen && selected === 'local'}
                onBlur={hide}
                onPointerLeave={leave}
                onClick={() => choose('local')}
              >
                <span className={styles.rankIndex}>
                  <Icon name="robot" />
                </span>
                <span className={styles.rankName}>
                  {t('overview.localhost')} <code>LOCAL</code>
                  <span className={styles.rankTrack}>
                    <span style={{ width: `${localPercent}%` }} />
                  </span>
                </span>
                <span className={styles.rankCount}>{overviewNumber(data.local_users, locale)}</span>
                <small>{overviewNumber(localPercent, locale, 1)}%</small>
              </button>
            </li>
          )}
        </ol>
        {!!data.unknown_users && (
          <div className={styles.rankUnknown}>
            <span>{t('overview.unknownRegion')}</span>
            <strong>{overviewNumber(data.unknown_users, locale)}</strong>
          </div>
        )}
        <div className={styles.rankTotal}>
          <span>{t('overview.loginTotal')}</span>
          <strong>
            {overviewNumber(data.total, locale)} <small>{t('overview.usersUnit')}</small>
          </strong>
        </div>
      </div>
    </div>
  );
}
