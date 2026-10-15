# Offline City data

`City.mmdb.gz`, `manifest.json` and `NOTICE.txt` are versioned together. A new Git
clone therefore includes the database used for login IP geolocation. No external
API, download, Git LFS or extra service is needed at runtime.

FastAPI startup verifies the archive and uncompressed SHA-256/size, validates the
City database, then atomically publishes `City.mmdb` with mode `0640`. This expanded
runtime cache and temporary files are ignored by Git. A matching cache is reused;
an updated manifest refreshes older data on worker restart. Failed updates retain
the existing file. Private credentials and login records are never stored here.

The API user needs directory write permission for first extraction or a data
update. For an existing read-only deployment, prepare the same cache in the normal
backend packaging step using `scripts/import_geoip.py`, then retain read access.
See [backend deployment instructions](../../README.md#封閉網段部署--isolated-network-deployment).

To update data, replace the gzip archive, its compressed/uncompressed checksums
and sizes in `manifest.json`, and the release/source attribution in `NOTICE.txt`.
Ship those files together and restart workers. Keep the provider's original data
unchanged and preserve its license and attribution.
