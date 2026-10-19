# 排程工具 / Scheduler tools

本層不引用 COMMON。啟動器注入 `redis_provider`；鎖與 scheduler 封裝共用，JOBs 只登記自己的工作，不另寫 Redis 鎖、續鎖 loop 或另一個 scheduler。

| 模組                                         | 介面                                                                                        | 用法與設計                                                                                                                                                      |
| -------------------------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [tools_apscheduler.py](tools_apscheduler.py) | `AsyncIOSchedulerLock`                                                                      | 透過注入 runner 包裝 `add_job()`，保留 job ID／timeout／max_instances／coalesce；啟動／關閉政策由既有排程入口擁有。                                             |
| [tools_apscheduler.py](tools_apscheduler.py) | `apscheduler_include_jobs`、`apscheduler_list_jobs`、`apscheduler_jobs_listener`            | 共用工作發現、清單及結果事件；JOBs 不自行再次掃描或建立 event loop。                                                                                            |
| [tools_apscheduler.py](tools_apscheduler.py) | `DrainingAsyncIOExecutor`                                                                   | 內部 executor adapter，用來等待工作退出；透過 scheduler 設定使用，不直接呼叫執行器啟動任務。                                                                    |
| [tools_lock.py](tools_lock.py)               | `LockedJobRunner(redis_provider, timeout=300, prefix=..., io_timeout=5)`、`wrap(func, ...)` | 每次執行使用獨立 token lease；未取得鎖即略過，續鎖失敗或 timeout 取消工作；`closing` 阻止關閉期間的新工作。非同步工作可取消，同步工作在線程內必須自行支援停止。 |
| [tools_lock.py](tools_lock.py)               | `JobLockLost`、`finish_cleanup(task)`                                                       | 失去 lease 的明確例外；清理任務即使再次收到 cancellation 也會完成，之後保留取消語意。不是忽略例外的重試器。                                                     |

```python
from COMMON.tools.storage.redis import RedisAsync
from SYSTEM.constants import EnumCache
from SCHEDULER.SYSTEM.tools.tools_lock import LockedJobRunner
from SCHEDULER.SYSTEM.tools import AsyncIOSchedulerLock

# 這段屬於啟動／extension 層；不要搬進工具實作造成反向依賴。
runner = LockedJobRunner(lambda: RedisAsync(key=EnumCache.SCHEDULER))
scheduler = AsyncIOSchedulerLock(runner=runner, timezone="UTC")
```

完整 job 宣告、`add_job` 參數、token 續鎖與 graceful shutdown 限制見 [Scheduler 指南](../../README.md)。整個應用由 `backend/` 的 `uv run --locked manage.py` 啟動；工具文件不另提供只啟動單一 child 的日常流程。

`start(paused=False)` 清除 runner 的 closing 狀態；`stop(grace=30)` 先 pause 再呼叫 executor 的 `drain(grace)`。`add_jobstore()` 僅接受單一 default MemoryJobStore，`add_executor()` 僅接受 default DrainingAsyncIOExecutor；`modify_job()` 不能替換 func／executor 或放寬 max_instances。`scheduler_add()` 是既有 `add_job()` 的相容入口，新增工作直接沿用標準方法。
