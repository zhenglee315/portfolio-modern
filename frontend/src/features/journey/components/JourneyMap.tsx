import { useCallback, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import planeArtwork from 'bootstrap-icons/icons/airplane-fill.svg?raw';
import { Icon } from '@/shared/ui/Icon';
import { useJourneyPlayback } from '../hooks/useJourneyPlayback';
import { playbackSnapshot, type PlaybackClock } from '../model/playback';
import type { Locale } from '@/i18n/config';
import type { JourneyStop } from '../schemas/journey';
import { projectPoint, routePath } from '../model/geometry';
import { useMapLabels } from '../hooks/useMapLabels';
import { StopCarousel } from './StopCarousel';
import { CityBubble } from './CityBubble';
import { JourneySummary } from './JourneySummary';
import { JourneyAtlas } from './JourneyAtlas';
import styles from './Journey.module.css';

/** Enhance Journey with a lazy atlas, measured labels and keyboard/touch destinations. */
export default function JourneyMap({
  items,
  selectedId,
  locale,
  onSelect,
  suspended = false,
}: {
  items: JourneyStop[];
  selectedId: number;
  locale: Locale;
  onSelect: (id: number) => void;
  suspended?: boolean;
}) {
  const { t } = useTranslation();
  const root = useRef<SVGSVGElement>(null);
  const plane = useRef<SVGGElement>(null);
  const activeRoute = useRef<SVGPathElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const caption = useRef<HTMLDivElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const [bubble, setBubble] = useState<{ id: number; anchor: Element }>();
  const ignoreFocus = useRef<number | undefined>(undefined);
  const tooltipId = useId();
  const selected = items.find((item) => item.id === selectedId) ?? items[0];
  const finalDestination = items.at(-1);
  const index = items.findIndex((item) => item.id === selected?.id);
  const paintedMarker = useRef<number | undefined>(undefined);
  const prioritizeLabel = useMapLabels(root, items, selectedId);
  const paint = useCallback(
    (clock: PlaybackClock) => {
      const snapshot = playbackSnapshot(clock, items.length);
      const highlightedId = items[snapshot.highlightedIndex]?.id;
      // Arrival paint changes only at chapter boundaries; user selection and ARIA stay stable.
      if (paintedMarker.current !== highlightedId) {
        paintedMarker.current = highlightedId;
        root.current?.querySelectorAll<SVGGElement>('[data-stop]').forEach((node) => {
          node.dataset.highlighted = String(Number(node.dataset.stop) === highlightedId);
        });
        if (highlightedId !== undefined) prioritizeLabel(highlightedId);
      }
      const route = root.current?.querySelector<SVGPathElement>(
        `[data-route="${items[clock.index]?.id}"]`,
      );
      if (!plane.current || !activeRoute.current) return;
      if (snapshot.last || !route) {
        plane.current.setAttribute('visibility', 'hidden');
        activeRoute.current.setAttribute('d', '');
        return;
      }
      const length = route.getTotalLength(),
        distance = length * snapshot.progress;
      const point = route.getPointAtLength(distance),
        before = route.getPointAtLength(Math.max(0, distance - 1)),
        after = route.getPointAtLength(Math.min(length, distance + 1));
      const angle = (Math.atan2(after.y - before.y, after.x - before.x) * 180) / Math.PI;
      plane.current.setAttribute('visibility', 'visible');
      plane.current.setAttribute('transform', `translate(${point.x} ${point.y}) rotate(${angle})`);
      activeRoute.current.setAttribute('d', route.getAttribute('d') ?? '');
      activeRoute.current.style.strokeDasharray = String(length);
      activeRoute.current.style.strokeDashoffset = String(length - distance);
    },
    [items, prioritizeLabel],
  );
  const playback = useJourneyPlayback(items, selectedId, onSelect, paint, suspended);
  const close = useCallback(
    (restore = false) => {
      ignoreFocus.current = restore ? bubble?.id : undefined;
      setBubble(undefined);
      if (
        restore &&
        (bubble?.anchor instanceof SVGElement || bubble?.anchor instanceof HTMLElement)
      )
        bubble.anchor.focus({ preventScroll: true });
    },
    [bubble],
  );
  /** Pause a manual chapter choice; pointer-strip clicks keep the atlas unobstructed. */
  const choose = (id: number, anchor?: Element, showDetail = true) => {
    playback.select(id);
    const element = anchor ?? root.current?.querySelector(`[data-stop="${id}"]`);
    if (showDetail && element) setBubble({ id, anchor: element });
    else setBubble(undefined);
  };
  const bubbleEntry = items.find((item) => item.id === bubble?.id);
  return (
    <>
      <div
        ref={panel}
        className={styles.panel}
        data-decoration
        data-playback-phase={playback.phase}
      >
        <div ref={caption} className={styles.caption}>
          <span className={styles.captionLabel}>
            <span className={styles.statusDot} aria-hidden="true" data-map-status-dot />
            {t('ui.careerJourney')}
            <span className={styles.loopLabel}>
              {t(playback.playing ? 'ui.looping' : 'ui.paused')}
            </span>
          </span>
          <div className={styles.playControls}>
            <button
              type="button"
              className={styles.step}
              aria-label={t('ui.restartJourney')}
              onClick={playback.restart}
            >
              <Icon name="restart" />
            </button>
            <button
              type="button"
              className={styles.playToggle}
              aria-label={t(playback.playing ? 'ui.pauseJourney' : 'ui.playJourney')}
              disabled={items.length < 2 || playback.reduced}
              title={playback.reduced ? t('ui.reducedMotionNote') : undefined}
              onClick={playback.toggle}
            >
              <Icon name={playback.playing ? 'pause' : 'play'} />
              <span>{t(playback.playing ? 'ui.pause' : 'ui.play')}</span>
            </button>
          </div>
        </div>
        <div className={styles.stage}>
          <svg
            ref={root}
            className={styles.map}
            viewBox="0 0 1080 490"
            role="group"
            aria-label={t('ui.mapLabel', { cities: items.map((item) => item.city).join(' → ') })}
          >
            <JourneyAtlas finalCountry={finalDestination?.countryCode} />
            {items.slice(0, -1).map((entry, i) => (
              <path
                className={styles.route}
                data-route={entry.id}
                key={entry.id}
                d={routePath(projectPoint(entry), projectPoint(items[i + 1]!))}
              />
            ))}
            <path ref={activeRoute} className={styles.activeRoute} d="" />
            {items.map((entry) => {
              const point = projectPoint(entry);
              return (
                <g
                  role="button"
                  tabIndex={0}
                  key={entry.id}
                  className={`${styles.city} ${entry.id === selectedId ? styles.selected : ''} ${entry.id === bubble?.id ? styles.bubbleActive : ''}`}
                  data-stop={entry.id}
                  data-x={point[0]}
                  data-y={point[1]}
                  transform={`translate(${point})`}
                  aria-label={t('ui.exploreCity', {
                    city: entry.city,
                    company: entry.organizationName,
                  })}
                  aria-pressed={entry.id === selectedId}
                  aria-describedby={bubble?.id === entry.id ? tooltipId : undefined}
                  onClick={(event) => choose(entry.id, event.currentTarget)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      choose(entry.id, event.currentTarget);
                    }
                  }}
                  onFocus={(event) => {
                    if (ignoreFocus.current === entry.id) {
                      ignoreFocus.current = undefined;
                      return;
                    }
                    setBubble({ id: entry.id, anchor: event.currentTarget });
                  }}
                  onPointerEnter={(event) => {
                    if (event.pointerType !== 'touch')
                      setBubble({ id: entry.id, anchor: event.currentTarget });
                  }}
                  onPointerLeave={(event) => {
                    if (
                      event.pointerType !== 'touch' &&
                      bubble?.id === entry.id &&
                      !event.currentTarget.matches(':focus-visible') &&
                      !(
                        event.relatedTarget instanceof Element &&
                        event.relatedTarget.closest('[data-city-bubble]')
                      )
                    )
                      close();
                  }}
                  onBlur={(event) => {
                    if (
                      bubble?.id === entry.id &&
                      !(
                        event.relatedTarget instanceof Element &&
                        event.relatedTarget.closest('[data-city-bubble]')
                      )
                    )
                      close();
                  }}
                >
                  <circle className={styles.halo} r="15" />
                  <path data-leader className={styles.leader} d="" />
                  <circle className={styles.core} r="4.5" />
                  <text className={styles.label} x="12" y="-12">
                    {entry.city.split(' · ')[0]?.toUpperCase()}
                  </text>
                </g>
              );
            })}
            <g ref={plane} className={styles.plane} visibility="hidden" aria-hidden="true">
              <g
                transform="rotate(90) scale(1.6) translate(-8 -8)"
                dangerouslySetInnerHTML={{ __html: planeArtwork }}
              />
            </g>
          </svg>
          {finalDestination && (
            <div className={styles.coordinates} data-map-coordinates>
              {[finalDestination.latitude, finalDestination.longitude]
                .map(
                  (value, i) =>
                    `${Math.abs(value).toFixed(4)}° ${i === 0 ? (value >= 0 ? 'N' : 'S') : value >= 0 ? 'E' : 'W'}`,
                )
                .join('   ')}
              <span>{t('ui.nextChapter', { city: finalDestination.city.toUpperCase() })}</span>
            </div>
          )}
          <span className={styles.compass} aria-hidden="true" data-map-compass>
            N
            <br />
            <Icon name="arrowUp" />
          </span>
        </div>
        {selected && (
          <JourneySummary
            entry={selected}
            locale={locale}
            index={index}
            count={items.length}
            nextCity={items[index + 1]?.city}
          />
        )}
        <div ref={bottom}>
          <StopCarousel
            items={items}
            selectedId={selectedId}
            locale={locale}
            onSelect={(id, showDetail) => choose(id, undefined, showDetail)}
            onBlur={() => close()}
          />
        </div>
        {bubble && bubbleEntry && (
          <CityBubble
            entry={bubbleEntry}
            locale={locale}
            anchor={bubble.anchor}
            container={panel}
            top={caption}
            bottom={bottom}
            id={tooltipId}
            onClose={close}
          />
        )}
      </div>
      <p className={styles.hint}>{t('ui.mapHint')}</p>
    </>
  );
}
