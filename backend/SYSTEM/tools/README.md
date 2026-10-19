# 系統組裝工具 / System tools

本層組裝 FastAPI、Socket.IO、網路與監控；不引用 COMMON，不讀取業務 SESSION 欄位或自行建立資料庫。應用 lifespan／啟動器注入資源，負責 start／stop，再關閉借用的底層資源。一般使用 [公開入口](__init__.py)；監控相容入口為 [tools_monitor.py](tools_monitor.py)。

| 模組                                           | 介面                                                                                              | 用法與設計                                                                                                                                                                                                                                                         |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [tools_fastapi.py](tools_fastapi.py)           | `FastApiRouter`、`cbv`、`fastapi_include_routers`                                                 | 在既有 CBV 註冊路由；router 統一 response class。業務只組裝 schema／module，不再平行建立另一個 router 體系。                                                                                                                                                       |
| [tools_fastapi.py](tools_fastapi.py)           | `FastApiJSONResponse`、`FastApiLocalDocs`、`fastapi_cache_key_builder`                            | 共用 JSON 序列化、本機 Swagger／ReDoc 與明確 cache key；快取裝飾器的啟用政策由 COMMON 層擁有。                                                                                                                                                                     |
| [tools_socketio.py](tools_socketio.py)         | `socketio_init_app`、`socketio_include_events`                                                    | 注入既有 server、發現事件並組成 ASGI app；不在每個業務模組新建 server。                                                                                                                                                                                            |
| [tools_socketio.py](tools_socketio.py)         | `socketio_session_request`、`socketio_start_monitor`、`socketio_shutdown`                         | 將 Engine.IO environ 轉為既有 SESSION Request；授權由注入的 callback 執行。lifespan 啟動／停止監控及所有背景 task。                                                                                                                                                |
| [tools_net.py](tools_net.py)                   | `net_client_ip`、`net_primary_ip`、`net_wildcard_cidr`、`net_whitelist_ip`、`net_whitelist_check` | IP 解析、CIDR 與白名單共用入口；業務使用既有 Request 的 client IP，不信任 body 或自行解析 forwarded headers。                                                                                                                                                      |
| [tools_geoip.py](tools_geoip.py)               | `GeoIpReader`、`LoginLocation`、`LoginGeoStatus`                                                  | 每個 process 一個 reader，`open()`／`close()` 由 lifespan 擁有；`lookup(ip)` 回不可變快照，`record_values()` 供登入紀錄使用。可注入 `prepare_database`，缺檔降級，不存取外部服務。                                                                                 |
| [monitor_worker.py](monitor_worker.py)         | `WorkerMonitor`                                                                                   | 注入 Redis／transaction observer／GeoIP；`start()`、`stop()` 管理採樣，middleware 使用 `begin_request()`、`response_started()`、`end_request()`，`snapshot()`／`publish()` 提供有界觀測。`running`、`completed_transactions_total` 是狀態讀取，不是新的採樣 loop。 |
| [monitor_snapshot.py](monitor_snapshot.py)     | `read_snapshot(storage, ...)`                                                                     | 合併既有 Redis 快照；保留 process_uid，失效／缺資料呈現 unknown，不用卡片序號猜 worker 身分。                                                                                                                                                                      |
| [monitor_stream.py](monitor_stream.py)         | `MonitorStream`                                                                                   | `start()`／`stop()` 擁有串流 task；`connect()`／`disconnect()`、`subscribe()`／`unsubscribe()` 做授權訂閱；`room()`、`payload()`、`fingerprint()`、`tick()` 共用 topic、投影及變更偵測。重連 resync 不重播每個封包。                                               |
| [monitor_supervisor.py](monitor_supervisor.py) | `MonitorSupervisor`、`supervise`                                                                  | Uvicorn parent adapter，借用 `storage_factory`；`run()`、`init_processes()`、`keep_subprocess_alive()`、`restart_all()`、`handle_ttin()`／`handle_ttou()` 屬程序管理生命週期，`snapshot()` 讀 parent 狀態。應用仍由 manage.py 啟動，不另開監控服務。               |
| [monitor_contracts.py](monitor_contracts.py)   | `MonitorStorage`、`TransactionObserver`、`RequestMetrics`                                         | 注入協定；工具只依賴協定，COMMON 提供具體 adapter，避免 tools → COMMON → settings 的循環。                                                                                                                                                                         |

監控相容入口還匯出 `LOGGER`、`MONITOR_PREFIX`、`HEARTBEAT_SECONDS`、`RETENTION_SECONDS`、`MAX_REQUEST_DETAILS`、`UVICORN_VERSION`、`ENV_RUN`、`ENV_INSTANCE`、`ENV_PREFIX`、`ENV_WORKERS`。這些是共享界線／環境鍵，使用既有常數，不複製字串或在 view 重定義採樣週期。

`FastApiRouter.add_api_route()`／`include_router()` 保留 FastAPI 的註冊方式並補統一預設；`FastApiJSONResponse.default_dumps()`／`render()` 處理既有 JSON 值，業務回傳 schema，不直接呼叫序列化細節；`FastApiLocalDocs.load()` 在應用組裝時掛載本機文件資產。

`MonitorStorage` 只要求借用 adapter 的 `pipeline()`、`scan_iter()`、`mget()`、`eval()`、`zrem()`，不要求工具知道 Redis DB 或序列化設定。`TransactionObserver` 使用 `start/stop/snapshot`；`RequestMetrics.record(failed=...)` 累積 outcome，`flush()` 才發送，不能在 middleware 為每筆請求另建連線。

```python
from SYSTEM.tools import GeoIpReader

# lifespan 建立；實際應用由 COMMON 注入 prepare_database callback。
reader = GeoIpReader("SYSTEM/geoip/City.mmdb")
try:
    reader.open()
    snapshot = reader.lookup("127.0.0.1")
    values = snapshot.record_values()
finally:
    reader.close()
```

所有組裝範例以 [SYSTEM/lifespan.py](../lifespan.py)、[manage_fastapi.py](../../manage_fastapi.py) 為準；監控 topic／response／process_uid 契約見 [Monitor](../../APPs/Monitor/README.md)。CLI／連線診斷不是第二套服務啟動流程。
