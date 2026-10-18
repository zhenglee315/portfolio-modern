# APScheduler

**文件責任：** 排程宣告與載入、跨節點互斥、執行／取消／關閉生命週期，以及 request queue 每分鐘落庫。設定依據為 `SYSTEM/settings.py`、`SCHEDULER/SYSTEM/settings.py` 及實際 job；資料表欄位另見 [record_request](../SYSTEM/models/README_record_request.md)，全後端操作見 [後端總覽](../README.md)。

`manage.py` 同時啟動 FastAPI 與 APScheduler。任一子程序意外退出便停止另一個並回傳失敗。SIGINT／SIGTERM 會通知兩個程序群組，包含 Uvicorn workers；等待關閉後，超過 `--shutdown-timeout` 才強制終止。

```sh
cd backend
uv run --locked manage.py
uv run --locked manage_apscheduler.py --list
uv run --locked manage_apscheduler.py --init
uv run --locked manage_apscheduler.py --run
```

`--list`／`--jobs`／單獨 `--init` 只載入並列出宣告，不連儲存服務、不執行任務。沒有選項時顯示說明。`--run --init` 相容舊指令；每次啟動本來就會載入目前程式中的完整宣告。`manage.py --node` 保留為相容選項，各節點行為相同，不清除共用 Redis 資料。

## 多實例與鎖

每台 VM／Pod 各有 FastAPI 與 APScheduler 程序。每個 scheduler 使用自己的 **MemoryJobStore**，啟動時重新載入任務。APScheduler 3 不支援多程序共用持久化 job store，見 [官方 FAQ](https://apscheduler.readthedocs.io/en/3.x/faq.html#how-do-i-share-a-single-job-store-among-one-or-more-worker-processes)。

各實例必須使用同一 Redis、同一 DB（目前 `EnumCache.SCHEDULER`，DB 5）及同一 `SCHEDULER.lock_prefix`。預設 key：

```text
portfolio-modern:scheduler:lock:<job-id>
```

`scheduler.add_job()` 強制包裝 async／sync 任務；decorator 與 `scheduler_add()` 都走這條路。無法指定 `is_lock=False`、其他 executor/store 或 `max_instances > 1`。同 ID 重複註冊預設失敗，可明確使用 `replace_existing=True`。註冊回傳正常 APScheduler Job。

`extension.py` 提供 `RedisAsync` 工廠給 runner。tools 只使用傳入的儲存介面，不匯入 COMMON；SQL 健康檢查透過 `SqlAlchemyExecAsync`，資源仍由 `CONN_MANAGER` 管理。

- 每次呼叫建立獨立 token，由 redis-py 的 Lua 原子比較 token 後續期／釋放；舊 owner 無法刪除新 owner 的鎖。使用既有 `redis.asyncio`，移除不相容的 aioredlock。
- 取得鎖失敗表示其他實例正在執行，這次觸發直接略過；不同 job 可並行。
- Redis 無法取得鎖時不執行業務。續鎖失敗會取消 async 工作並拋出 `JobLockLost`。
- 預設 timeout 取自設定（300 秒），預設租約為 timeout + lock_buffer（10 秒）；每隔租約的三分之一續期。Redis 操作也有逾時。
- 業務例外、逾時與取消會保留並回報。反覆 misfire 會記錄警告，不會永久刪除週期任務。

此語意是「同一 job 執行期間互斥」。兩個節點的觸發時間不同，仍可能先後執行同一週期；沒有每週期只執行一次、持久化補跑或 exactly-once 保證。需要這些能力時，應另加業務執行紀錄與唯一鍵。

Redis 租約的互斥依賴共享 Redis 可用、租約有效及工作能及時停止；程序長時間停頓、Redis failover 遺失鎖或網路分區下，單靠租約不能提供絕對互斥。重要寫入仍需資料庫唯一約束／fencing。async job 不可阻塞 event loop 或吞掉取消，也不可把實際工作丟到未等待的背景 task。

同步函式會在 thread pool 執行；Python 無法強制終止執行緒。逾時／取消後會持續續鎖，等執行緒真正結束才釋鎖及關閉連線，因此逾時回報可能延後。同步外部 I/O 必須自行設定有限 timeout；需要可強制中止的工作應使用獨立程序／工作服務。同步工作失去 Redis 租約時也無法保證立即停止。

## 宣告

`manage_apscheduler.py` 依完整模組路徑、排序掃描 `SCHEDULER/JOBs/**/jobs_*.py`。支援 namespace package，不以 basename 作為 fallback；匯入錯誤會使啟動失敗。路徑以 backend 入口為準，不依賴啟動時 cwd。載入器重新載入已快取的 job 模組，讓同程序重啟可重新註冊。零任務視為設定錯誤並退出。

```python
from SCHEDULER.SYSTEM.decorator import scheduled_job_with_lock

@scheduled_job_with_lock("interval", id="catalog.refresh", seconds=60, timeout=30)
async def jobs_refresh_catalog():
    await refresh_catalog()
```

`refresh_catalog()` 是業務函式示意。請明確指定穩定的 job ID；多實例及滾動部署必須共用 ID、Redis 與 lock_prefix。需要將數個不同任務互斥時可共用 `lock_key`。預設 ID 是完整 module + qualname。

首次由舊版切換時須先停止舊 scheduler，再啟動新版；舊版使用不同鎖鍵與共用 RedisJobStore，不可與新版混跑。新版不會自動刪除舊版共用資料。

## 生命週期

啟動先註冊連線、確認排程 Redis 可用、載入宣告，再啟動排程。啟動失敗也會清理已註冊資源。

關閉時先 pause，不再接受新工作；自訂 asyncio executor 等待執行中的 job。超過 `SCHEDULER.shutdown_grace`（預設 30 秒）才取消並等待 finalizer／同步執行緒，之後停止 scheduler，最後關閉 SQL／Redis。不是依賴 APScheduler 3 無法實際等待 coroutine 清理的 `shutdown(wait=True)`。

`manage.py --shutdown-timeout` 預設 45 秒，部署的 termination grace 應更長。若調高 scheduler 的 shutdown_grace，需一起調高父程序與部署的關閉期限；強制終止後未釋放的鎖會等租約到期。

## Monitor job

HTTP／Socket 業務統一於 `APPs/Monitor/`。歷史流量與健康排程每 60 秒執行；即時 Worker 的 0.5 秒採樣與 SYS Redis 開機累計由 lifespan／middleware 負責，不等待分鐘排程。開機累計不從 `record_request` 回算，彙總 API 的 60 秒快取則使用 WEB Redis。

Monitor business logic lives in `APPs/Monitor/`. Minute jobs persist history; lifespan/middleware own live sampling and current-run SYS counters. Historical SQL, run totals and WEB response caching have separate lifetimes.

`system.monitor.health` 每 60 秒探測設定的 HTTP endpoint、Redis SYS ping 與 SQL `SELECT 1`，將各項結果寫入 `record_monitor_health`；缺少的分鐘保留未知。`system.monitor.request` 成功排空 queue 後更新 `record_monitor_coverage` 的流量水位。部署前須套用 migration `c6f37a92d104`。API 與統計定義見 [Monitor Overview](../APPs/Monitor/README.md)。

`system.monitor.request` 對應 `jobs_monitor.py > jobs_monitor_request`，每 60 秒呼叫 `module/module_monitor.py > MonitorRequestModule.flush()`。WorkerMonitor 在同一筆 Redis 交易內更新即時快照並將已結束的請求加入 **SYS DB 0** 的 `system:monitor:requests:queue` Stream；原本 Socket.IO 仍讀即時快照。

消費者先取回 pending，再讀新事件，透過共用 `SqlAlchemyExecAsync` 批次寫入 `record_request`，**SQL commit 成功後**才原子執行 XACK／XDEL。`request_id` 唯一鍵讓重送不會產生重複紀錄；SQL／ACK 失敗會留待下次重試。無法解析的事件移至 `<queue>:dead`，不阻擋其他合法事件。此 queue 只使用一個 consumer group，所有節點須共用 queue、group 與 scheduler lock prefix。

排程沿用 Redis DB 5 的分散式鎖，timeout 50 秒。每批 500 筆、每次最多 20 批；超過的 backlog 留給下分鐘。Queue 無 TTL／MAXLEN，與前端 60 秒／200 筆快照限制分開。設定、欄位、索引、migration 及可靠性限制見 [record_request 設計](../SYSTEM/models/README_record_request.md)。

## 驗證

`tests/test_scheduler.py` 包含註冊保護、錯誤／逾時／取消、續鎖、同步工作清理、模組碰撞、CLI 與 Redis 四程序競爭。`tests/test_manage.py` 驗證程序群組、訊號、非零退出、啟動部分失敗與強制關閉。`tests/scheduler_process_fixture.py` 只供測試，不是 job 模組。

`tests/test_request_history.py` 在獨立 Redis 與 SQLite／PostgreSQL 驗證 middleware 到 SQL、超過 UI 限制的事件、commit／ACK 故障、pending 接手、重送去重、異常資料隔離、關閉排空與新 migration 升降版。

```sh
# 指向獨立的測試 Redis；測試以隨機 prefix 清理自己建立的 key。
SCHEDULER_TEST_REDIS_URL=redis://127.0.0.1:16389/0 \
  uv run --locked python -m unittest tests.test_scheduler tests.test_manage -v
```
