# Offline location map

`offline-atlas.json` is shipped with the frontend and fetched from its own origin only when the Profile location picker opens. Runtime rendering uses local Leaflet/vector layers; there are no tile, geocoding, CDN, style, glyph or image requests to outside hosts. Builds do not download map data. Include the complete `build/client` directory when deploying.

The dataset contains 242 country/territory features from Natural Earth 1:50m Admin 0 Countries v5.1.1 and 7,342 city/town points from 1:10m Populated Places v5.1.2. City names include English and Chinese. Bundled country metadata also retains Natural Earth alpha-3/administrative codes, allowing a new career to save its map country without an online reverse geocoder. This is a world/city locator, without street/building details or address search. Boundaries retain the source dataset's representation.

Retrieved on 2026-10-18 from Natural Earth's official vector repository:

- Countries: https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson
  - SHA-256: `3e458fc036ad0a66411f2c1e6cac49c5d7bfb81cb1123bc513b22511a2b7fdeb`
- Cities: https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_populated_places.geojson
  - SHA-256: `9b8e3de09048ef00dfc70357dbb9fa324493f214b5e0ae4daf1aa79a8d10116b`
- Source pages: https://www.naturalearthdata.com/downloads/50m-cultural-vectors/50m-admin-0-countries-2/ and https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-populated-places/
- Public-domain terms: https://www.naturalearthdata.com/about/terms-of-use/

To update deliberately, download both source GeoJSON files in a network-enabled development environment, then run:

```sh
node scripts/prepare-offline-map.mjs /path/to/countries.geojson /path/to/populated-places.geojson
```

Update the versions, source hashes and retrieval date here, review the dataset diff, then run checks. The preparation script removes unused source fields, rounds country coordinates to three decimals and keeps source city coordinates. The minified generated file is excluded from Prettier. Its complete source-derived data is committed, so installations and builds do not require the upstream sources. Public-domain provenance and the Leaflet license are included in `public/licenses`.
