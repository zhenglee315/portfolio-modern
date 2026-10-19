import { useEffect, useRef, useState } from 'react';
import type { Map as LeafletMap, Marker } from 'leaflet';
import markerArtwork from 'bootstrap-icons/icons/geo-alt-fill.svg?raw';
import { selectedMapLocation, type MapLocation } from './location';
import {
  loadOfflineAtlas,
  countryAtPoint,
  type OfflineAtlas,
  type OfflineCity,
} from './offline-map';
import { addOfflineMapLayers } from './locationMapLayers';
import styles from '../components/LocationPicker.module.css';

// Fit populated latitudes into narrow screens without requiring a fixed zoom level.
const worldBounds: [[number, number], [number, number]] = [
  [-60, -180],
  [80, 180],
];
const worldOptions = { padding: [12, 12] as [number, number], animate: false };

/** Browser-only Leaflet, styles and world/city data all load from this deployment on opening. */
export function useLocationMap(
  initial: MapLocation | null,
  markerLabel: string,
  onSelect: (point: MapLocation) => void,
  language: string,
) {
  const latitude = initial?.latitude;
  const longitude = initial?.longitude;
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const atlasRef = useRef<OfflineAtlas | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const selectRef = useRef<
    ((point: { lat: number; lng: number; countryCode?: string }) => void) | null
  >(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [cities, setCities] = useState<OfflineCity[]>([]);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let disposed = false;
    let map: LeafletMap | undefined;
    let observer: ResizeObserver | undefined;
    const initialPoint =
      latitude !== undefined && longitude !== undefined ? { latitude, longitude } : null;
    void (async () => {
      try {
        const [L, , atlas] = await Promise.all([
          import('leaflet'),
          import('leaflet/dist/leaflet.css'),
          loadOfflineAtlas(),
        ]);
        if (disposed) return;
        map = L.map(container, {
          zoomControl: false,
          minZoom: 0,
          maxZoom: 10,
          maxBounds: [
            [-85.051129, -180],
            [85.051129, 180],
          ],
          maxBoundsViscosity: 1,
          zoomAnimation: false,
          fadeAnimation: false,
          markerZoomAnimation: false,
          inertia: false,
        }).setView(
          initialPoint ? [initialPoint.latitude, initialPoint.longitude] : [20, 0],
          initialPoint ? 7 : 2,
        );
        if (!initialPoint) map.fitBounds(worldBounds, worldOptions);
        mapRef.current = map;
        atlasRef.current = atlas;
        addOfflineMapLayers(L, map, atlas, language);
        setCities(atlas.cities);
        const icon = L.divIcon({
          className: styles.marker,
          html: markerArtwork,
          iconSize: [32, 40],
          iconAnchor: [16, 38],
        });
        const putMarker = (point: MapLocation) => {
          if (!map) return;
          const latlng = L.latLng(point.latitude, point.longitude);
          if (markerRef.current) markerRef.current.setLatLng(latlng);
          else {
            const marker = L.marker(latlng, {
              icon,
              draggable: true,
              autoPan: true,
              title: markerLabel,
              alt: markerLabel,
            }).addTo(map);
            marker.on('dragend', () => selectRef.current?.(marker.getLatLng()));
            marker.getElement()?.setAttribute('data-location-marker', '');
            markerRef.current = marker;
          }
        };
        selectRef.current = (latlng) => {
          const point = selectedMapLocation(latlng);
          putMarker(point);
          onSelect({ ...point, countryCode: latlng.countryCode ?? countryAtPoint(atlas, point) });
        };
        if (initialPoint) putMarker(initialPoint);
        map.on('click', (event: import('leaflet').LeafletMouseEvent) =>
          selectRef.current?.(event.latlng),
        );
        observer = new ResizeObserver(() => map?.invalidateSize({ animate: false }));
        observer.observe(container);
        setStatus('ready');
      } catch {
        if (!disposed) setStatus('error');
      }
    })();
    return () => {
      // Retire async imports, vector layers, resize observers and DOM handlers on every close.
      disposed = true;
      observer?.disconnect();
      map?.remove();
      mapRef.current = null;
      atlasRef.current = null;
      markerRef.current = null;
      selectRef.current = null;
    };
  }, [latitude, longitude, markerLabel, onSelect, language, attempt]);

  return {
    containerRef,
    status,
    cities,
    zoom: (delta: number) => mapRef.current?.setZoom(mapRef.current.getZoom() + delta),
    showWorld: () => mapRef.current?.fitBounds(worldBounds, worldOptions),
    recenter: () => {
      const marker = markerRef.current;
      if (marker)
        mapRef.current?.setView(marker.getLatLng(), Math.max(7, mapRef.current.getZoom()), {
          animate: false,
        });
    },
    selectCenter: () => {
      const center = mapRef.current?.getCenter();
      if (center) selectRef.current?.(center);
    },
    selectCity: (city: OfflineCity) => {
      selectRef.current?.({
        lat: city.latitude,
        lng: city.longitude,
        countryCode: atlasRef.current?.countries.features.find(
          (feature) => feature.properties.code === city.country,
        )?.properties.code3,
      });
      mapRef.current?.setView([city.latitude, city.longitude], 8, { animate: false });
      containerRef.current?.focus();
    },
    retry: () => {
      setStatus('loading');
      setAttempt((current) => current + 1);
    },
  };
}
