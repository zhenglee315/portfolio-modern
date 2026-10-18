# record_request

保存 MonitorMiddleware 觀察到的已結束 HTTP 請求，已供 Monitor Overview 的每日 HTTP 流量彙總使用，逐筆歷史、延遲、錯誤率、節點與地區查詢可再擴充。正常完成、錯誤、取消及斷線均可保存；處理中的請求仍只在即時監控顯示。

## 流程

1. `MonitorMiddleware` 呼叫 `WorkerMonitor.end_request()`，暫存獨立事件。與前端最近 200 筆／60 秒明細分開。
2. Worker 背景回報預設每 0.5 秒，使用 lifespan 注入的共用 `RedisAsync(SYS)`，在同一 MULTI／EXEC 更新快照並 XADD JSON 到 `system:monitor:requests:queue`，**同為 Redis DB 0**。保留原本 Socket.IO 快照流程。
3. `SCHEDULER/JOBs/Sys/jobs_monitor.py > jobs_monitor_request` 每 60 秒呼叫 `module/module_monitor.py > MonitorRequestModule.flush()`。啟動後第一輪約在第 60 秒。
4. 取得跨節點 job 鎖後，先 XAUTOCLAIM 接手 pending，再 XREADGROUP 讀新事件；驗證 schema，透過共用 `SqlAlchemyExecAsync.transaction()` 寫入 SQL。
5. INSERT 使用 `ON CONFLICT(request_id) DO NOTHING`。**Commit 成功後**才原子執行 XACK／XDEL；失敗時留待下輪接手，允許重送但不重複落庫。
6. 格式或欄位不合法的事件原子移至 `<queue>:dead`，保留原始 payload、source_id 與原因，等待人工檢查；不阻擋其他合法事件。

## 欄位

| 欄位                  | 型別                | 用途                                                                                                     |
| --------------------- | ------------------- | -------------------------------------------------------------------------------------------------------- |
| `id`                  | BIGINT PK           | 自增流水號；SQLite 使用 INTEGER，支援其自增語意。                                                        |
| `request_id`          | VARCHAR(32), UNIQUE | Worker 產生的 UUID hex，事件去重與追蹤。                                                                 |
| `run_id`              | VARCHAR(128)        | API manager 本次啟動識別。                                                                               |
| `instance_id`         | VARCHAR(255)        | Pod／VM 實例識別。                                                                                       |
| `process_uid`         | VARCHAR(128)        | PID 加程序建立時間，辨識 PID 重用。                                                                      |
| `pid`                 | INTEGER             | 接受請求的 worker PID，大於 0。                                                                          |
| `method`              | VARCHAR(16)         | HTTP method。                                                                                            |
| `path`                | VARCHAR(2048)       | URL path，不含 query；沿用即時監控截斷長度。                                                             |
| `ip_address`          | VARCHAR(45), NULL   | 正規化 IPv4／IPv6，未知時為 NULL。                                                                       |
| `country_code`        | VARCHAR(2), NULL    | GeoIP 國別代碼。                                                                                         |
| `region`              | VARCHAR(128), NULL  | GeoIP 地區。                                                                                             |
| `city`                | VARCHAR(128), NULL  | GeoIP 城市。                                                                                             |
| `geo_status`          | VARCHAR(24)         | `unknown`／`resolved`／`not_found`／`non_public`／`unavailable`。不保存尚未查詢的 pending。              |
| `entered_at`          | TIMESTAMPTZ         | 請求進入時間，UTC。                                                                                      |
| `response_started_at` | TIMESTAMPTZ, NULL   | ASGI response.start 時間；尚未回應即失敗可為 NULL。                                                      |
| `left_at`             | TIMESTAMPTZ         | 最後 ASGI body／trailers 送出或錯誤結束的時間。                                                          |
| `duration_ms`         | FLOAT               | 單調時鐘計算的毫秒耗時，非負值。                                                                         |
| `http_status`         | INTEGER, NULL       | 已送出的 HTTP 狀態碼 100–599；未開始回應可為 NULL。                                                      |
| `status`              | VARCHAR(24)         | `completed`／`error`／`cancelled`／`disconnected`。HTTP 500 正常送完亦可為 completed，搭配 failed 判讀。 |
| `failed`              | BOOLEAN             | 目前 middleware 對 HTTP 4xx／5xx、錯誤或中止記 true；既有歷史列保留當時的定義，不回寫舊 4xx。            |
| `stored_at`           | TIMESTAMPTZ         | SQL 寫入時間，由資料庫產生；可與 left_at 比較處理延遲。                                                  |

PostgreSQL 使用 timezone-aware timestamp；SQLite 原生無 TIMESTAMPTZ，寫入 UTC 值，讀出時間按 UTC 解讀。事件無使用者外鍵，後續帳號／網站刪除不會連帶刪掉請求歷史。不記錄 body、query、cookie 或授權標頭；IP 為經受信代理設定處理後的 ASGI client。

## 索引

- `request_id` 唯一鍵：重送去重。
- `(entered_at DESC, id DESC)`：依時間查詢與游標分頁。
- `(instance_id, entered_at)`：節點流量。
- `(http_status, entered_at)`：HTTP 狀態與錯誤統計。
- `(country_code, entered_at)`：地區流量。

不對 2048 字元 path 直接建立 B-tree，避免 PostgreSQL 的索引列大小限制。後續 endpoint 可視化若需要大量路徑聚合，再依查詢需求加入路由樣板或摘要表。

## 設定

設定集中於 `SYSTEM/config.yaml > MONITOR`，由 `SYSTEM/settings.py` 匯出。共用 SYS cache／DB 由既有 CONN_MANAGER 提供，不新增獨立連線池；`SYSTEM/tools` 不引用 COMMON，仍透過 lifespan 傳入工具。

| 設定                  | 預設                            | 用途                                                     |
| --------------------- | ------------------------------- | -------------------------------------------------------- |
| `request_queue`       | `system:monitor:requests:queue` | SYS DB 0 的 Stream key。                                 |
| `request_group`       | `record_request`                | 唯一 consumer group。                                    |
| `request_batch`       | 500                             | Worker 每輪入列上限及 SQL 每批上限，1–1000。             |
| `request_buffer`      | 10000                           | 每個 worker 尚未成功入列的記憶體上限，須大於等於 batch。 |
| `request_max_batches` | 20                              | 每分鐘最多處理批數，預設至多 10000 個事件。              |

同一專案所有 Pod 使用相同 queue、group 與 `SCHEDULER.lock_prefix`。queue 的 ACK／XDEL 語意只適用單一 group。Job timeout 50 秒，沿用 Redis DB 5 的分散式鎖、續鎖與取消機制；`MonitorRequestModule.flush()` 須在此 job 鎖保護下呼叫。`XAUTOCLAIM` 需要 Redis 6.2+，專案其他既有指令已要求 Redis 7.0+。

## 可靠性

成功入列後，以至少一次投遞與 SQL 唯一鍵達成重試去重。Queue 不設 TTL／MAXLEN，SQL 失敗不移除正常事件；超過單輪時間／數量的 backlog 留待下分鐘。異常事件 queue 不自動刪除。Redis 重啟後是否保留事件仍取決於 Redis AOF／RDB 與 eviction 設定，本次不變更伺服器設定。

HTTP 執行路徑只更新記憶體，不等待 Redis。**Worker 在下一次背景回報前崩潰，尚未入列的事件可能遺失**；Redis 長時間不可用或寫入追不上流量，10000 筆記憶體滿後會丟棄新事件並增加 `history_dropped_total`、寫入 ERROR log。原始 worker 快照同時提供 `history_pending_requests`、`history_enqueued_total`。正常關閉會嘗試排空多批事件，最多額外 5 秒，無法保證強制中止或 Redis 故障時排空。因此此設計供觀測與可視化，沒有完整審計保證。

沿用 middleware 排除的健康檢查、文件端點、Socket.IO 與 WebSocket，不將這些工作寫入此表。請求離開時間表示 ASGI 送出結果，不代表客戶端已確認接收。

## Migration

`8e2b9c4f6a10_add_request_history.py` 接在 `71bc8f24d903` 後，只新增本表、約束與索引，downgrade 只移除此表。部署新 scheduler 前，先在 backend 執行：

```sh
uv run --locked python -m alembic upgrade head
```

新增 revision 已獨立驗證 SQLite／PostgreSQL 升降版；既有歷史 migrations 仍有 PostgreSQL 專用 ALTER TYPE，不能據此宣稱整條 migration chain 可從空 SQLite 執行。

## Overview 與開機累計

`GET /monitor/traffic` 透過共用 SQLAlchemy 工具依本地日曆分桶查詢本表；`/monitor` 路徑在新增採集及彙總中排除。`record_monitor_coverage` 保存保守起點與成功排空 queue 後的水位，缺樣保持未知。獨立的 `record_monitor_health` 保存每分鐘 HTTP／Redis／SQL 探測；migration `c6f37a92d104` 加入這兩張表，不修改既有 request 或 login 紀錄。

`GET /monitor/request-totals` 直接讀 SYS Redis 的 server-run metrics，並非本表歷史 SUM；各 Worker 的 Requests／Failed 也是程序累計。API、日期／快取與覆蓋率定義見 [Monitor](../../APPs/Monitor/README.md)。
