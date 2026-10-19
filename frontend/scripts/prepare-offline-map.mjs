import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';

/** Compile downloaded Natural Earth GeoJSON into one versioned, same-origin map asset.
 * This explicit maintenance command never runs during builds or in the browser.
 * Usage: node scripts/prepare-offline-map.mjs <countries.geojson> <populated-places.geojson>
 */
const [countriesPath, citiesPath] = process.argv.slice(2);
if (!countriesPath || !citiesPath) throw new Error('Provide both downloaded GeoJSON paths.');
const countriesSource = await readFile(countriesPath);
const citiesSource = await readFile(citiesPath);
const countries = JSON.parse(countriesSource).features;
const cities = JSON.parse(citiesSource).features;

/** Keep country geometry at roughly 100 m precision without changing polygon topology. */
function roundCoordinates(value) {
  return Array.isArray(value) ? value.map(roundCoordinates) : Number(Number(value).toFixed(3));
}
const data = {
  version: 1,
  countries: {
    type: 'FeatureCollection',
    features: countries.map(({ properties: p, geometry }) => ({
      type: 'Feature',
      properties: {
        code: p.ISO_A2_EH,
        code3: /^[A-Z]{3}$/.test(p.ISO_A3_EH) ? p.ISO_A3_EH : p.ADM0_A3,
        name: p.NAME_EN || p.NAME,
        zh: p.NAME_ZHT || p.NAME_ZH || p.NAME,
        zhHans: p.NAME_ZH || p.NAME_ZHT || p.NAME,
        point: [p.LABEL_Y, p.LABEL_X],
        rank: p.LABELRANK,
      },
      geometry: { type: geometry.type, coordinates: roundCoordinates(geometry.coordinates) },
    })),
  },
  cities: cities
    .map(({ properties: p, geometry }) => ({
      id: p.NE_ID,
      name: p.NAME_EN || p.NAME,
      zh: p.NAME_ZHT || p.NAME_ZH || p.NAME,
      zhHans: p.NAME_ZH || p.NAME_ZHT || p.NAME,
      country: p.ISO_A2,
      region: p.ADM1NAME || '',
      latitude: geometry.coordinates[1],
      longitude: geometry.coordinates[0],
      rank: p.SCALERANK,
      population: p.POP_MAX,
    }))
    .sort((a, b) => a.rank - b.rank || b.population - a.population || a.id - b.id),
};
if (data.countries.features.length < 200 || data.cities.length < 7000)
  throw new Error('Unexpectedly incomplete Natural Earth source data.');
const output = new URL('../src/assets/location-map/', import.meta.url);
await mkdir(output, { recursive: true });
await writeFile(new URL('offline-atlas.json', output), `${JSON.stringify(data)}\n`);
console.log({
  countries: data.countries.features.length,
  cities: data.cities.length,
  sourceSha256: [countriesSource, citiesSource].map((bytes) =>
    createHash('sha256').update(bytes).digest('hex'),
  ),
});
