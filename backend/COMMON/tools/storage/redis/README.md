# Redis tools / Redis 工具

`RedisAsync` wraps asynchronous `redis-py` commands for the application's configured Redis clients. It lives in `tools_redis_async.py` and is exported by `__init__.py`. Use it after FastAPI's `lifespan` has called `CONN_MANAGER.init_cache()`. Registration creates clients and pools; it does not check whether the Redis server is reachable.

`RedisAsync` 封裝專案 Redis client 的非同步指令，實作位於 `tools_redis_async.py`，並由 `__init__.py` 匯出。請在 FastAPI 的 `lifespan` 呼叫 `CONN_MANAGER.init_cache()` 後使用。註冊 client 與連線池不代表已確認 Redis 伺服器可連線。

## Clients and ownership / Client 與生命週期

- `RedisAsync(key=EnumCache.SYS)` resolves the client from `CONN_MANAGER.get_cache(key)`. `redis=...` takes priority over `key` and must be a `redis.asyncio.Redis` instance. Construction does not ping Redis. / `key` 從連線管理器取得 client；若傳入 `redis=...`，它會優先於 `key`，且必須是 `redis.asyncio.Redis`。建立 `RedisAsync` 時不會執行 ping。
- `CONN_MANAGER` owns its configured clients and closes them at application shutdown. When injecting a client, the injecting caller owns its shutdown. `RedisAsync` does not close either client. / 管理器負責在應用程式關閉時關閉自己建立的 client；自行注入的 client 由注入者關閉，`RedisAsync` 不會替它關閉。
- [Settings](../../../../SYSTEM/settings.py) maps `EnumCache.SYS` to logical DB 0 and `EnumCache.WEB` to DB 1. The session store uses the raw `SYS` client; heartbeat middleware uses `RedisAsync(SYS)`; `FastAPICache` uses the raw `WEB` client. Session and FastAPICache values do not automatically use this wrapper's pickle format. Other configured roles are `SOCKET`, `WORKER`, `LOCKER`, and `SCHEDULER`. / 設定將 `SYS` 指向 Redis 邏輯資料庫 0、`WEB` 指向資料庫 1。session 儲存使用原始 `SYS` client；心跳 middleware 使用 `RedisAsync(SYS)`；`FastAPICache` 使用原始 `WEB` client。session 與 FastAPICache 的值不會自動使用此工具的 pickle 格式；另有 `SOCKET`、`WORKER`、`LOCKER`、`SCHEDULER` 等角色。

## Values and serialization / 值與序列化

`set()`, `hash_set()`, and `list_left_push()` pickle values by default. Their matching read methods unpickle by default. The configured Redis clients return bytes, which allows pickle decoding. **Only unpickle data from trusted producers:** loading an untrusted pickle can execute code. For externally written or ordinary Redis values, pass `deserialize=False`; for raw writes, pass `serialize=False`. Invalid pickle bytes are returned unchanged, but missing-class/import errors can still propagate.

`set()`、`hash_set()`、`list_left_push()` 預設以 pickle 儲存值；對應讀取方法預設反序列化。專案設定的 Redis client 回傳 bytes，因此可以解碼 pickle。**只對可信來源的資料使用 pickle 反序列化**，讀取不可信 pickle 可能執行程式碼。讀取外部寫入或一般 Redis 值時，傳入 `deserialize=False`；寫入原始值時，傳入 `serialize=False`。無效 pickle bytes 會原樣回傳，但找不到舊類別或模組時仍可能拋出錯誤。

`incr()` operates on a Redis integer string, so use a missing key or a raw value such as `await cache.set("counter", 0, serialize=False)`. A default pickled `set()` value cannot be incremented. The raw pipeline API also does **not** apply this wrapper's pickle conversion.

`incr()` 操作的是 Redis 整數字串；可直接對不存在的 key 呼叫，或先用 `await cache.set("counter", 0, serialize=False)`。預設 pickle 儲存的值無法遞增。原始 pipeline API 也**不會**套用此工具的 pickle 轉換。

## Commands / 方法

All commands below are asynchronous. / 以下方法均為非同步。

| Method / 方法 | 繁體中文 | English |
| --- | --- | --- |
| `set(key, value, ex=None, serialize=True)` | 寫入字串 key；`ex` 是有效秒數，預設無期限；成功回傳 `True`。覆蓋 key 也會重設原有 TTL。 | Write a string key with optional expiry seconds; return `True` on success. Replacement resets its TTL. |
| `get(key, deserialize=True)` | 讀取字串；不存在回傳 `None`。 | Read a string value; return `None` if missing. |
| `get_by_key(key, method, deserialize=True)` | 讀取 `<key>:<method>` 組合 key；`method` 是後綴，不是 Redis 指令。 | Read the composite `<key>:<method>` key; `method` is a suffix, not a Redis command. |
| `delete(*keys)` | 刪除多個 key；回傳實際刪除數，沒有傳 key 時回傳 `0`。 | Delete keys and return the number removed; return `0` for no keys. |
| `hash_set(name, key, value, serialize=True)` | 寫入一個 hash 欄位；新增回傳 `1`，覆蓋回傳 `0`。 | Write one hash field; return `1` if new or `0` if replaced. |
| `hash_get(name, key, deserialize=True)` | 讀取單一 hash 欄位；不存在回傳 `None`。 | Read one hash field; return `None` if missing. |
| `hash_del(name, key)` | 刪除 hash 欄位；回傳刪除數 `0` 或 `1`。 | Delete one hash field; return `0` or `1`. |
| `hash_mget(name, keys, deserialize=True)` | 依欄位順序回傳清單，缺少欄位為 `None`；空清單回傳 `[]`。 | Return values in field order, using `None` for missing fields; return `[]` for no fields. |
| `list_left_push(key, value, max_length=100, serialize=True)` | 在單一 Redis 交易中移除相同儲存 bytes、加入串列開頭並裁切長度；`max_length` 必須為正數。 | In one Redis transaction, remove matching stored bytes, push to the head, and trim to a positive maximum length. |
| `list_left_pop(key, count=1, deserialize=True)` | 從開頭取出最多 `count` 項，回傳清單；`count <= 0` 回傳 `[]`。舊版 Redis 的 `LPOP COUNT` 不支援時會使用交易式替代流程。 | Remove up to `count` head items and return a list; nonpositive counts return `[]`. Older Redis without `LPOP COUNT` uses a transactional fallback. |
| `list_range(key, start=0, end=-1, deserialize=True)` | 讀取串列範圍，不移除元素；`end` 為含尾索引，`-1` 表示最後一項。 | Read a list range without removal; `end` is inclusive and `-1` means the final item. |
| `list_first(key, deserialize=True)` | 讀取串列第一項，不移除；不存在回傳 `None`。 | Read the first item without removal; return `None` if absent. |
| `incr(key, amount=1)` | 對原始整數字串做原子遞增；回傳更新後整數。 | Atomically increment a raw integer string; return the updated integer. |
| `type(key)` | 回傳 `string`、`list`、`none` 等 Redis 類型名稱。 | Return a Redis type name such as `string`, `list`, or `none`. |
| `ttl(key)` | 回傳剩餘秒數；`-1` 表示無期限，`-2` 表示不存在。 | Return remaining seconds; `-1` means no expiry and `-2` means missing. |
| `expire(key, ex)` | 設定有效秒數；key 不存在回傳 `False`，`ex <= 0` 會刪除既有 key。 | Set expiry seconds; return `False` if missing. Nonpositive `ex` deletes an existing key. |
| `exists(key)` | 檢查單一 key 是否存在，回傳布林值。 | Check whether one key exists; return a boolean. |
| `scan_iter(match="*", count=100)` | 透過 SCAN 收集所有符合 pattern 的 key，回傳清單；`count` 是每次掃描提示，非結果上限。 | Collect matching keys through SCAN into a list; `count` is a work hint, not a result cap. |
| `exists_scan(match="*")` | 搜尋第一個符合 `*<match>*` 的 key；是包含式 pattern，並非精確比對。 | Check the first key matching `*<match>*`; this is a contains pattern, not exact matching. |
| `keys(pattern="*")` | 透過 Redis `KEYS` 一次取回所有符合的 key。 | Fetch all matching keys using Redis `KEYS`. |
| `flush()` | 執行 `FLUSHDB`，清除該 client 所選邏輯資料庫的**所有 key**，回傳 Redis 結果。 | Run `FLUSHDB` and remove **every key** in the client's selected logical database; return the Redis result. |
| `pipeline()` | 取得 Redis 交易式 pipeline；須自行呼叫 `execute()`。 | Get a transactional Redis pipeline; the caller must call `execute()`. |
| `expire_stat(match="*")` | 掃描 key、逐一讀取 TTL；回傳 `avg`、`max`、`min` 及 `overview`。沒有具期限的 key 時統計值為 `None`。 | Scan keys and query each TTL; return `avg`, `max`, `min`, and `overview`. Aggregate values are `None` if no timed keys exist. |
| `heartbeat_client(identifier, expire=60, set_key="online_clients", key_prefix="online")` | 將識別值加入 roster set，並更新 `<key_prefix>:<identifier>` 的 TTL；回傳 `employee_id` 與預估 `expiry`。識別值不可空，`expire` 須為正數。 | Add an identifier to a roster set and refresh its TTL key; return `employee_id` and estimated `expiry`. Identifier must be nonempty and expiry positive. |
| `heartbeat_total(set_key="online_clients", key_prefix="online")` | 檢查 roster 中仍有心跳 key 的識別值數量，並清理已過期項目。 | Count roster identifiers whose heartbeat keys still exist, and prune expired entries. |

## Usage / 使用方式

Run after application startup, inside an async function. / 以下範例在應用程式啟動後的 async function 中執行。

```python
from COMMON.tools.storage.redis import RedisAsync
from SYSTEM.constants import EnumCache

cache = RedisAsync(key=EnumCache.SYS)

# Pickled Python value / 儲存 Python 物件
await cache.set("profile:1", {"name": "Lee"}, ex=300)
profile = await cache.get("profile:1")

# Composite key, hash, and bounded list / 組合 key、hash 與限制長度的 list
await cache.set("device:1:status", "ready")
status = await cache.get_by_key("device:1", "status")
await cache.hash_set("profile:1:fields", "name", "Lee")
names = await cache.hash_mget("profile:1:fields", ["name"])
await cache.list_left_push("recent:visits", "profile:1", max_length=20)
recent = await cache.list_range("recent:visits")

# Raw integer for INCR / INCR 使用原始整數
await cache.set("visits", 0, serialize=False)
visits = await cache.incr("visits")

# Pipeline uses redis-py commands directly / Pipeline 直接使用 redis-py 指令
async with (await cache.pipeline()) as pipe:
    pipe.set("status", "ready")
    pipe.expire("status", 60)
    results = await pipe.execute()

# Heartbeat's identifier is currently a client IP / 目前心跳識別值是訪客 IP
await cache.heartbeat_client(identifier="192.0.2.10")
active_ips = await cache.heartbeat_total()
```

## Operational limits / 使用限制

- `HeartbeatMiddleware` refreshes a heartbeat when an HTTP request arrives, using the observed client IP (`0.0.0.0` if no valid address is available). `heartbeat_total()` is an approximate count of **active IP identifiers**, not people or open sessions. NAT can combine visitors and one visitor can use several IPs. The roster set itself has no TTL; `heartbeat_total()` removes stale entries when called. Its read/check/remove steps are not an atomic snapshot, so a concurrent renewal can affect the result. The return field remains named `employee_id` for compatibility even when the identifier is an IP. / `HeartbeatMiddleware` 在收到 HTTP 請求時，以觀察到的訪客 IP 更新心跳；無有效位址時會使用 `0.0.0.0`。`heartbeat_total()` 估計的是**活躍 IP 識別值**，不是人數或開啟的 session 數。共用 IP 會合併訪客，一人也可能使用多個 IP。roster set 本身沒有 TTL；呼叫 `heartbeat_total()` 才清除過期項目。讀取、檢查與刪除不是同一個原子快照，並行更新可能影響結果。即使識別值是 IP，回傳欄位仍為相容舊介面的 `employee_id`。
- `scan_iter()` and `expire_stat()` accumulate all matches in memory; SCAN may return duplicates and is not a consistent snapshot. `expire_stat()` also performs TTL reads one by one. `keys()` uses one server-side `KEYS` command that can block Redis on a large database. / `scan_iter()` 與 `expire_stat()` 會將符合的 key 收集至記憶體；SCAN 可能重複回傳 key，也不是一致性快照。`expire_stat()` 還會逐一查 TTL。`keys()` 使用單次 `KEYS` 指令，資料量大時可能阻塞 Redis。
- `flush()` clears the **entire selected logical database**, including session or cache keys belonging to other components. Redis transactions group commands, but execution-time errors do not undo earlier commands in the same transaction. `list_left_pop()` removes items before Python deserialization; a decoding error cannot restore them. / `flush()` 會清除**整個所選邏輯資料庫**，包含其他元件的 session 或快取 key。Redis 交易會集中執行指令，但執行期間的錯誤不會回滾先前成功的指令。`list_left_pop()` 先移除元素再做 Python 解碼；解碼失敗時不會還原元素。
