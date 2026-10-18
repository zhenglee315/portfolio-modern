# Offline City data

**文件責任：** 離線 GeoIP 資料包、manifest／雜湊驗證、runtime MMDB 重建、資料更新與來源授權；登入及 request 記錄的 SQL／HTTP 契約由 [後端總覽](../../README.md) 與 [record_request](../models/README_record_request.md) 說明。

The lifespan injects `GeoIpDatabaseImporter.prepare_bundle` into `GeoIpReader`; infrastructure tools consume that dependency without importing COMMON. The same per-worker reader enriches successful login history and monitored requests.

Monitor 登入地圖使用儲存的最後登入地區；`geo_status=non_public` 分入 `local_users`（localhost／私有網路），未知位置保持未知，不以舊國別或任意地點補值。前端 Robot 只是非地理分類的標記，與 MMDB 國別座標無關；見 [Monitor 統計](../../APPs/Monitor/README.md)。

The monitoring map aggregates stored login classifications. Local/private networks form a separate non-geographic category, while unresolved locations remain unknown.

`City.mmdb.gz`, `manifest.json` and `NOTICE.txt` are versioned together. A new Git
clone therefore includes the database used for login and request IP geolocation. No external
API, download, Git LFS or extra service is needed at runtime.

FastAPI startup verifies the archive and uncompressed SHA-256/size, validates the
City database, then atomically publishes `City.mmdb` with mode `0640`. This expanded
runtime cache and temporary files are ignored by Git. A matching cache is reused;
an updated manifest refreshes older data on worker restart. Failed updates retain
the existing file. Private credentials and login records are never stored here.

The API user needs directory write permission for first extraction or a data
update. Read-only deployments must include a validated, expanded `City.mmdb`
prepared during backend packaging, retain read access and rebuild for data updates.
See [backend deployment instructions](../../README.md#封閉網段部署--isolated-network-deployment).

To update data, replace the gzip archive, its compressed/uncompressed checksums
and sizes in `manifest.json`, and the release/source attribution in `NOTICE.txt`.
Ship those files together and restart workers. Keep the provider's original data
unchanged and preserve its license and attribution.
