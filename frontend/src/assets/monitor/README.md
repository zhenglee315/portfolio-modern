# Monitor assets

`world.svg` and `icons/*.svg` are the original SVG assets exported by Figma design file `4zwapEpb2X2OyNVWYBWeN4`, Monitor Overview node `4:4763`, retrieved on 2026-10-18. Assets retain their original SVG contents and dimensions; the screenshot and illustrative chart/bubble values are not runtime assets. `MonitorGlyph` and `MonitorLoginMap` reference these local files, with no expiring Figma URLs.

`country-points.json` contains ISO alpha-2 country keys with `[longitude, latitude]` label positions, extracted from Natural Earth's `ISO_A2_EH`, `LABEL_X` and `LABEL_Y` fields. It is a country-level display aid, independent of user IPs and any exact login location.

- Source: https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_10m_admin_0_countries.geojson
- License: public domain, https://www.naturalearthdata.com/about/terms-of-use/
- Retrieved: 2026-10-18

The map is a stylized design atlas. Marker positions are approximate; unrecognized country codes remain in the ranking and are reported as unpositioned instead of being placed at arbitrary coordinates.

The lower-right Localhost Robot is rendered by the shared `Icon` component, not a country-position asset. Its center dot/ripple represents stored local/private-network sign-ins and has no fabricated longitude/latitude. Tooltip transitions follow the application motion policy. Documentation screenshots live separately in [`docs/images/`](../../../../docs/images/README.md) and are regenerated with `npm run docs:monitor`; they are not imported into runtime bundles.
