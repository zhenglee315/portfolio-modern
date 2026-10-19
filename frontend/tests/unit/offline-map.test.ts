import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { findOfflineCities, type OfflineAtlas } from '@/pages/profile/model/offline-map';

const atlas: OfflineAtlas = JSON.parse(
  readFileSync('src/assets/location-map/offline-atlas.json', 'utf8'),
);

describe('bundled world/city dataset', () => {
  it('ships complete versioned geometry and uniquely identified, finite city points', () => {
    expect(atlas.version).toBe(1);
    expect(atlas.countries.features).toHaveLength(242);
    expect(atlas.cities).toHaveLength(7342);
    expect(new Set(atlas.cities.map((city) => city.id)).size).toBe(atlas.cities.length);
    for (const city of atlas.cities) {
      expect(Number.isFinite(city.latitude) && Math.abs(city.latitude) <= 90).toBe(true);
      expect(Number.isFinite(city.longitude) && Math.abs(city.longitude) <= 180).toBe(true);
    }
    expect(atlas.countries.features.some((country) => country.properties.code === 'TW')).toBe(true);
  });

  it('distinguishes cities sharing a name with country codes and retains source coordinates', () => {
    expect(findOfflineCities(atlas.cities, 'London GB')[0]).toMatchObject({
      name: 'London',
      country: 'GB',
      latitude: 51.501941,
      longitude: -0.118668,
    });
    expect(
      findOfflineCities(atlas.cities, 'London GB').every((city) => city.country === 'GB'),
    ).toBe(true);
    expect(findOfflineCities(atlas.cities, 'London CA')[0]?.country).toBe('CA');
  });

  it('searches Chinese variants and accent-insensitive English locally, with bounded results', () => {
    expect(findOfflineCities(atlas.cities, '台北')[0]?.name).toBe('Taipei');
    expect(findOfflineCities(atlas.cities, '倫敦')[0]?.name).toBe('London');
    expect(findOfflineCities(atlas.cities, '伦敦')[0]?.name).toBe('London');
    expect(findOfflineCities(atlas.cities, 'sao paulo')[0]?.name).toBe('São Paulo');
    expect(findOfflineCities(atlas.cities, 'a').length).toBeLessThanOrEqual(8);
    expect(findOfflineCities(atlas.cities, '   ')).toEqual([]);
    expect(findOfflineCities(atlas.cities, 'no-city-123456')).toEqual([]);
  });
});

it('identifies the map country from bundled geometry without an external reverse geocoder', async () => {
  const { countryAtPoint } = await import('@/pages/profile/model/offline-map');
  expect(countryAtPoint(atlas, { latitude: 51.5, longitude: -0.1 })).toBe('GBR');
  expect(countryAtPoint(atlas, { latitude: 25.03, longitude: 121.56 })).toBe('TWN');
  expect(countryAtPoint(atlas, { latitude: 0, longitude: -140 })).toBeUndefined();
  expect(atlas.countries.features.every((item) => /^[A-Z]{3}$/.test(item.properties.code3))).toBe(
    true,
  );
});
