# Monitor Overview

路由在 `views_monitor.py`，HTTP／Socket 業務在 `module/module_monitor.py`，參數及事件 payload 在 `schema/parser/parser_monitor.py`，HTTP 返回體在 `schema/resp/resp_monitor.py`。`SYSTEM/urls.py` 定義 `PreFix.Monitor`、`Tags.Monitor`、`RouteMonitor`。事件只從 `APPs.Monitor.events_monitor` 載入。

正式業務透過 `COMMON/tools/storage/sqlalchemy` 的 `SqlAlchemyExecAsync` 執行 ORM／SQL 與交易，Redis 操作透過 `COMMON/tools/storage/redis` 的 `RedisAsync`，不另建 engine、session factory 或連線池。Socket.IO 的 session adapter 僅借用 Redis wrapper 已選定的 client。

| API                           | 用途                                                                     |
| ----------------------------- | ------------------------------------------------------------------------ |
| `GET /monitor/traffic`        | 請求總量、日均、每日序列、前期比較及歷史覆蓋狀況                         |
| `GET /monitor/logins`         | 期間及每日去重登入帳號、前期比較、最後登入國別排行、未知地區人數         |
| `GET /monitor/availability`   | 每分鐘 HTTP／Redis／SQL 採樣成功率、覆蓋率、每日序列、SLO 及目前健康狀態 |
| `GET /monitor/request-totals` | SYS Redis 本次伺服器開機的請求總數、成功與失敗累計                       |
| `GET /monitor/services`       | 單一邏輯服務、部署資訊、實際 FastAPI／Uvicorn／Python 版本及更新週期     |
| `GET /monitor/health`         | 公開的最小 HTTP 存活探測；只返回 `{"status":"ok"}`，不代表依賴已通過檢查 |

五支私有 API 均要求目前有效帳號／角色的 `is_monitor=true`，沿用伺服器 SESSION 身份驗證，不接受前端自報權限。成功、參數錯誤、拒絕及儲存失敗回應均為 `private, no-store`，依 Cookie 分流。登入 API 只提供彙總，不揭露帳號或 IP。

## 參數及統計

`traffic`、`logins`、`availability` 共用 `start=YYYY-MM-DD`、`end=YYYY-MM-DD`、`timezone=Asia/Taipei`（預設 UTC，接受 IANA 時區）、可選 `service_id`。日期含首尾，轉換為 `[start, end+1day)` 的 UTC 區間。最多 93 天，不接受未來日期；未提供日期時預設為該時區已結束的最近七天。比較期是前一段相同日數的本地日曆日期，包含日光節約時間差異。未知或重複參數回 400，未知服務回 404。

三支彙總 API 沿用 Portfolio 的 `@cache(expire=CacheExpiry.MIN, namespace=EnumCacheNamespace.MONITOR)` 與 `COMMON.schema.parser.parser_caching`。`is_caching=true` 使用 WEB Redis 中最多 60 秒的快取，省略或 false 直接查詢；資料寫入不自動清除此快取。日期及服務範圍先在 parser 解出，預設日期跨日後不會誤用前一天的快取。權限與參數檢查每次都在快取查找之前執行，HTTP 回應（含 HIT／MISS／304／驗證錯誤）仍維持 `private, no-store`，不允許瀏覽器共享快取。

流量與健康歷史每分鐘保存；登入事件是成功登入時同步保存，Overview 可選擇接受最多 60 秒的快取延遲。`generated_at` 表示快照時間，快取命中時不更新；`latest`／`current_status` 亦為該快照的觀測，啟用快取可能多延遲一分鐘。即時 Worker、`services` 與 HTTP 健康探測不套用這個彙總快取。

`traffic` 額外接受 `scope=http`（預設，應用 HTTP 請求）或 `scope=portfolio`（限 `/portfolio/*`）。這不是頁面瀏覽量或獨立訪客。`/monitor` 與其子路徑在採集及彙總均排除，避免監控輪詢灌流量。

登入總數為整段期間 `COUNT(DISTINCT user_id)`，不以每日人數相加。地圖依每人「期間內最後一次」登入決定國別，同一時間以較大的紀錄 ID 決勝；最後一次位置未知時不回退到較舊國別。`local_users` 表示最後位置為 `geo_status=non_public` 的帳號，包含 localhost／私有網路；這些帳號不算國家，也不放入 `unknown_users`。國家占比分母包含 Localhost 與未知地區人數，因此已知國家占比總和可能不到 100%。這是期間去重登入帳號，並非在線人數；國別座標由前端提供。

目前服務清單只包含設定的一個邏輯服務，所有登入資料的範圍為共享資料庫。尚未建立任意多服務／多網站登入歸屬模型，不會根據主機或當前帳號假定歷史登入屬於某服務。

`record_monitor_coverage` 在 migration 當下記錄保守的採集起點；更早資料仍可查詢，但不宣稱完整。流量排程成功排空 queue 後才推進水位；失敗／backlog 不推進。`coverage.complete`、每日 `complete` 表示這個採集區間的覆蓋狀態，不是無遺漏審計保證；Worker 尚未發布即崩潰、buffer 溢出及 Redis 資料遺失仍沿用 request history 的限制。前期分母為零或任一期間不完整時，`change_percent=null`。

## 開機累計與 Worker

`request-totals` 不接受 query，不使用 `@cache`，直接透過 `RedisAsync(EnumCache.SYS)` 讀取 `system:monitor:metrics:requests:<instance/run hash>`。`total = successful + failed`；HTTP 2xx／3xx 完整回應為成功，4xx／5xx、異常、取消與斷線為失敗。監控路徑不計數。Middleware 在最後 ASGI body／trailers 或中斷時登記，既有採樣週期發布至 Redis；Lua 以每個 process 的 checkpoint 原子累加差額，避免重試與亂序重複計數。

Worker 替換保留本 run 累計，完整伺服器重啟使用新 run 歸零；閒置每 30 秒續期、最後發布後 24 小時過期。Redis 故障回 503，不以 SQL 歷史補值或偽造零。回應包含 `run_id`、`instance_id`、`basis=server_run`、`total`、`successful`、`failed`、`started_at`、`sampled_at`。

Socket 的 `workers` topic 額外提供每個程序的 `completed_requests_total`／`failed_requests_total`，從該 Worker 啟動累計；服務 run 與程序生命週期不能混用。HTTP／Socket 業務統一位於本目錄，基礎採樣與 streaming 留在 SYSTEM；共用採樣週期為 0.5 秒。

## 可用率採集

`system.monitor.health` 每 60 秒獨立探測設定的 HTTP endpoint、SYS Redis ping 及 SQL `SELECT 1`，將結果寫入 `record_monitor_health`。HTTP timeout 3 秒，依賴 timeout 各 2 秒。`(service_id, checked_at)` 唯一識別分鐘，重複執行保留第一筆觀測。資料庫故障使結果無法保存時，該分鐘保持未知，不補成成功。健康探測路徑不刷新訪客在線心跳，也不寫入 HTTP 訪問歷史。

`availability_percent` 是已觀測探測的成功比例；`coverage_percent` 是已觀測分鐘／應觀測分鐘。只有已結束且每分鐘皆有觀測的完整查詢期間才計算 `slo_met`，其餘為 null。每日長度由時區決定；查詢當天只計已結束的分鐘。這是採樣指標，不是連續時間的對外可用性保證。`latest` 是不受查詢日期限制的最新服務觀測，超過 120 秒時 `current_status=unknown`。

可在 `SYSTEM/config.yaml` 的 `MONITOR` 設定 `service_id`（預設 api）、`service_name`（Core API）、`environment`、`region`（未設定為 null）、`probe_url`（預設本機 `/monitor/health`）、`slo_percent`（99.9）。多實例共用同一服務識別、DB、scheduler 鎖；如需衡量對外入口，將 probe_url 指向部署的穩定入口。目標 URL 不能包含帳密、query 或 fragment，不由 API 呼叫者指定。

## 部署

先從 `backend/` 執行 `uv run --locked python -m alembic upgrade head`，新增 revision `c6f37a92d104`，不修改既有登入或請求資料。接著以 `uv run --locked manage.py` 同時啟動 FastAPI 與 APScheduler。第一筆健康觀測／流量水位在排程首次執行後產生；歷史可用率無法回填。

Socket.IO 仍使用 `/monitor` namespace，既有 `monitor_subscribe`、`monitor_resync`、`monitor_unsubscribe`、`monitor_test` 與輸出事件及 `workers`／`requests` topic 保持相容。

## 驗證

在 `backend/` 執行 `uv run --locked pytest tests/test_monitor_overview.py tests/test_monitor.py tests/test_socketio.py tests/test_storage_reuse.py`。一般測試使用隔離資源；外部 PostgreSQL／Redis 整合案例需明確提供測試用 URL，不能指向正式資料。前端契約與截圖見 [Monitor workspace](../../../frontend/src/features/monitoring/README.md)。

## 獨立監控權限

`AuthRole.is_monitor` 控制全部五支私有 HTTP API 與 `/monitor` Socket 握手、訂閱及每輪重新授權，網站管理權限不再授予監控存取。`EnumSess.IS_MONITOR`、登入／SESSION DTO 與 Role GET／PATCH 共用此欄；Role 支援其搜尋、排序、篩選及 expected 原值衝突檢查。註冊 Default 可以啟用 Monitor，仍不能有三項管理權限。

Migration `d7a24e91b630` 接在 `c6f37a92d104` 後，新增非空 boolean，依需求將所有既有角色（包含停用及 Default）設為 true；之後新角色預設 false。帳號、其他權限與歷史資料保留。部署前執行 `uv run --locked python -m alembic upgrade head`，以 `uv run --locked manage.py` 同時啟動服務。
