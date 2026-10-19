import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import atlasUrl from '@/assets/location-map/offline-atlas.json?url';
import type { MapLocation } from './location';

export type OfflineCity = MapLocation & {
  id: number;
  name: string;
  zh: string;
  zhHans: string;
  country: string;
  region: string;
  rank: number;
  population: number;
};
export type OfflineAtlas = {
  version: 1;
  countries: FeatureCollection<
    Polygon | MultiPolygon,
    {
      code: string;
      code3: string;
      name: string;
      zh: string;
      zhHans: string;
      point: [number, number];
      rank: number;
    }
  >;
  cities: OfflineCity[];
};
let pending: Promise<OfflineAtlas> | undefined;

/** Local, content-hashed data is shared by picker openings; failed loads remain retryable.
 * No geocoder, CDN, font service, tile provider or build-time download participates here.
 */
export function loadOfflineAtlas(): Promise<OfflineAtlas> {
  pending ??= fetch(atlasUrl)
    .then(async (response) => {
      if (!response.ok) throw new Error('Local map asset unavailable.');
      const data = (await response.json()) as OfflineAtlas;
      if (
        data.version !== 1 ||
        data.countries?.type !== 'FeatureCollection' ||
        !Array.isArray(data.countries.features) ||
        !Array.isArray(data.cities)
      )
        throw new Error('Invalid local map asset.');
      return data;
    })
    .catch((error: unknown) => {
      pending = undefined;
      throw error;
    });
  return pending;
}

/** Offline city lookup accepts English, Chinese, regional names and ISO country codes. */
export function findOfflineCities(cities: OfflineCity[], query: string): OfflineCity[] {
  const normalize = (text: string) =>
    text
      .normalize('NFKD')
      .replace(/\p{Diacritic}/gu, '')
      .replaceAll('臺', '台')
      .toLowerCase();
  const terms = normalize(query).trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const suffix = terms.at(-1)!;
  const country =
    /^[a-z]{2}$/.test(suffix) && cities.some((city) => city.country.toLowerCase() === suffix)
      ? suffix
      : undefined;
  if (country) terms.pop();
  return cities
    .filter((city) => {
      if (country && city.country.toLowerCase() !== country) return false;
      const text = normalize(
        `${city.name} ${city.zh} ${city.zhHans} ${city.region} ${city.country}`,
      );
      return terms.every((term) => text.includes(term));
    })
    .slice(0, 8);
}

/** Resolve country metadata from bundled polygons, including holes; never call a reverse geocoder. */
export function countryAtPoint(data: OfflineAtlas, point: MapLocation): string | undefined {
  const inside = (ring: number[][]) => {
    let hit = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [x, y] = ring[i]!;
      const [oldX, oldY] = ring[j]!;
      if (
        y! > point.latitude !== oldY! > point.latitude &&
        point.longitude < ((oldX! - x!) * (point.latitude - y!)) / (oldY! - y!) + x!
      )
        hit = !hit;
    }
    return hit;
  };
  for (const feature of data.countries.features) {
    const polygons =
      feature.geometry.type === 'Polygon'
        ? [feature.geometry.coordinates]
        : feature.geometry.coordinates;
    if (
      polygons.some((polygon) => polygon[0] && inside(polygon[0]) && !polygon.slice(1).some(inside))
    )
      return /^[A-Z]{3}$/.test(feature.properties.code3) ? feature.properties.code3 : undefined;
  }
  return undefined;
}
