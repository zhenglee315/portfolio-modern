import type * as Leaflet from 'leaflet';
import type { OfflineAtlas } from './offline-map';
import styles from '../components/LocationPicker.module.css';

/** Render bundled vectors directly: there is deliberately no raster tile layer or remote URL. */
export function addOfflineMapLayers(
  L: typeof Leaflet,
  map: Leaflet.Map,
  data: OfflineAtlas,
  language: string,
) {
  L.geoJSON(data.countries, {
    interactive: false,
    style: { className: styles.country, weight: 0.8, fillOpacity: 1 },
  }).addTo(map);
  for (let longitude = -180; longitude <= 180; longitude += 30)
    L.polyline(
      [
        [-85, longitude],
        [85, longitude],
      ],
      { className: styles.grid, weight: 1, interactive: false },
    ).addTo(map);
  for (const latitude of [-60, -30, 0, 30, 60])
    L.polyline(
      [
        [latitude, -180],
        [latitude, 180],
      ],
      { className: styles.grid, weight: 1, interactive: false },
    ).addTo(map);

  const labels = L.layerGroup().addTo(map);
  const chinese = language.startsWith('zh');
  const simplified = language === 'zh-Hans';
  const redrawLabels = () => {
    labels.clearLayers();
    const zoom = map.getZoom();
    const bounds = map.getBounds();
    const occupied: { x: number; y: number; width: number }[] = [];
    const label = (latitude: number, longitude: number, text: string, city: boolean) => {
      if (!bounds.contains([latitude, longitude]) || occupied.length >= 45) return;
      const position = map.latLngToContainerPoint([latitude, longitude]);
      const width = Math.min(180, Math.max(36, [...text].length * (chinese ? 12 : 7)));
      if (
        occupied.some(
          (box) =>
            Math.abs(box.y - position.y) < 25 &&
            position.x < box.x + box.width + 16 &&
            position.x + width + 16 > box.x,
        )
      )
        return;
      occupied.push({ x: position.x, y: position.y, width });
      // Labels are text nodes from the local dataset, never interpreted as HTML.
      const textNode = document.createElement('span');
      textNode.textContent = text;
      L.marker([latitude, longitude], {
        icon: L.divIcon({
          className: city ? styles.cityLabel : styles.countryLabel,
          html: textNode,
          iconSize: [width + 16, 24],
          iconAnchor: [0, 12],
        }),
        interactive: false,
        keyboard: false,
        zIndexOffset: -1000,
      }).addTo(labels);
    };
    // City ranks and screen collisions keep both world and regional views readable.
    for (const city of data.cities) {
      const maximumRank = zoom <= 3 ? 2 : zoom === 4 ? 5 : zoom === 5 ? 7 : 10;
      if (city.rank <= maximumRank)
        label(
          city.latitude,
          city.longitude,
          chinese ? (simplified ? city.zhHans : city.zh) : city.name,
          true,
        );
    }
    if (zoom <= 5)
      for (const { properties: p } of data.countries.features)
        if (p.rank <= zoom + 1)
          label(p.point[0], p.point[1], chinese ? (simplified ? p.zhHans : p.zh) : p.name, false);
  };
  map.on('moveend zoomend resize', redrawLabels);
  redrawLabels();
  map.attributionControl.setPrefix(false);
  map.attributionControl.addAttribution('Natural Earth · Public domain');
  L.control.scale({ imperial: false, maxWidth: 100 }).addTo(map);
}
