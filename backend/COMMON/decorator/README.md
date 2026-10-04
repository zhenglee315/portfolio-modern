# Cache decorator / 快取裝飾器

`deco_cache.py` defines `cache(control_key="is_caching", **cache_kwargs)`, an opt-in wrapper around `fastapi-cache2` for async FastAPI GET handlers, including class-based views (CBV). This folder exports both `cache` and the existing `sql_validate` decorator. `COMMON.tools.search_recursive` searches nested parser results for the cache flag.

`deco_cache.py` 定義 `cache(control_key="is_caching", **cache_kwargs)`，讓非同步 FastAPI GET handler（包含 CBV）依請求選擇是否使用 `fastapi-cache2`。本資料夾同時匯出 `cache` 和既有的 `sql_validate`；`COMMON.tools.search_recursive` 負責從巢狀解析結果尋找快取旗標。

## Why the project has its own wrapper / 為何自行包裝

The default `fastapi-cache2` key builder uses the endpoint's arguments. In a CBV, `self` can represent a new view instance for each request; putting its object representation into the key can prevent identical requests from sharing a cache entry. This project's [`fastapi_cache_key_builder`](../../SYSTEM/tools/tools_fastapi.py) excludes `self`. `deco_cache.cache` serves a separate purpose: it reads `is_caching` and chooses the cached or direct execution path.

`fastapi-cache2` 的預設 key builder 會使用 endpoint 參數。CBV 每次請求可能建立新的 view 實例；若把 `self` 的物件表示放進 key，相同請求可能無法命中同一筆快取。專案的 [`fastapi_cache_key_builder`](../../SYSTEM/tools/tools_fastapi.py) 會排除 `self`。`deco_cache.cache` 則負責另一件事：讀取 `is_caching`，決定走快取或直接執行。

## Request flow / 請求流程

1. At decoration time, `cache()` calls `fastapi_cache(**cache_kwargs)(func)` once and exposes its injected `Request` and `Response` parameters to FastAPI. The handler does not need to declare them. / 定義路由時，`cache()` 只建立一次套件的快取包裝，並讓 FastAPI 注入套件需要的 `Request`、`Response`；handler 不必自行宣告。
2. On each request, the outer wrapper looks for a `Request` in positional arguments, then in top-level keyword values. If found, it reads `control_key` from the URL query. Otherwise it tries `await search_recursive(kwargs, control_key)` so a parser or dependency dictionary can supply the flag. / 每次請求先從位置參數、再從最外層關鍵字參數尋找 `Request`；找到後從 URL query 讀取控制值。找不到時，嘗試以 `await search_recursive(kwargs, control_key)` 從解析器或依賴注入的字典中尋找。
3. Only `true`, `1`, or `yes` (case-insensitive) calls the cached function. Missing and other values call the original handler directly. / 只有 `true`、`1` 或 `yes`（不區分大小寫）會呼叫快取函式；缺少或其他值直接執行原 handler。
4. A cache hit returns the saved response without running the handler body. A miss runs the handler and stores its response for the configured TTL. `is_caching=false` removes the injected arguments before calling the handler directly; it does not read, refresh, or delete an earlier cache entry. / 命中時直接回傳既有結果，不執行 handler 內文；未命中時執行並依設定的 TTL 儲存。`is_caching=false` 會先移除注入參數再直接呼叫 handler，不讀取、更新或刪除既有快取。

## Key and Redis configuration / Key 與 Redis 設定

FastAPI's [`lifespan`](../../SYSTEM/lifespan.py) initializes `FastAPICache` with the `EnumCache.WEB` Redis client, the `fastapi-cache` prefix, and `fastapi_cache_key_builder`. The builder hashes the function's module and qualified name, the request path and raw query string when `Request` is available, and sorted top-level keyword values of basic types (`str`, `int`, `float`, `bool`, `None`, `tuple`, `list`, `dict`). It omits `self`, host, scheme, and port; the resulting MD5 digest is prefixed by the cache namespace.

FastAPI 的 [`lifespan`](../../SYSTEM/lifespan.py) 以 `EnumCache.WEB` Redis client、`fastapi-cache` prefix 及 `fastapi_cache_key_builder` 初始化 `FastAPICache`。builder 會把函式模組與限定名稱、可取得 `Request` 時的路徑與原始 query string，以及排序後的最外層基本型別關鍵字參數（`str`、`int`、`float`、`bool`、`None`、`tuple`、`list`、`dict`）組成內容並計算 MD5；`self`、host、scheme 和 port 不參與。結果前面還會加上快取 namespace。

## Intended usage / 預期用法

The following illustrates the decorator order and API. Place `@cache` between the FastAPI route decorator and the async CBV method. `parser_caching` validates and documents the query parameter; the decorator reads it from the injected request.

以下示範裝飾器順序與介面。`@cache` 應放在 FastAPI 路由裝飾器與非同步 CBV 方法之間。`parser_caching` 負責驗證與顯示查詢參數，裝飾器會從注入的 request 讀取控制值。

```python
from fastapi import APIRouter, Depends
from fastapi_utils.cbv import cbv
from COMMON.decorator import cache
from COMMON.schema.parser import parser_caching
from SYSTEM.constants import CacheExpiry

router = APIRouter()

@cbv(router)
class SysHeartbeat:
    @router.get("/heartbeat")
    @cache(expire=CacheExpiry.SEC_30)
    async def get_online(self, _=Depends(parser_caching)):
        return {"online": 3}

# GET /heartbeat?is_caching=true  -> use the cache
# GET /heartbeat?is_caching=false -> execute the handler directly
```

Choose a TTL with `expire=...`; writes to the underlying data do not automatically invalidate cached GET responses.

請用 `expire=...` 決定有效時間；底層資料寫入後，不會自動清除既有 GET 快取。

## Current limits / 目前限制

- FastAPI supplies `Request` and `Response` to the wrapper even when the method does not declare them. Direct Python calls outside FastAPI do not receive these objects automatically. / 即使方法沒有宣告 `Request`、`Response`，FastAPI 仍會注入給裝飾器；直接從 Python 呼叫方法時不會自動取得這些物件。
- The key does not automatically include a logged-in user or session identity. A hit skips checks inside the handler. Use this design only when the response is safe to share for the same key; authentication and authorization must not depend solely on code that a cache hit bypasses. / key 不會自動包含登入使用者或 session 身分；命中時也會略過 handler 內的檢查。只有同 key 的回應可共用時才適用；驗證與授權不能只依賴快取命中時不會執行的 handler 內程式。
- Raw query order and equivalent flag spellings such as `true` and `1` produce different keys. The key builder omits positional arguments and non-basic top-level keyword values. / 原始 query 順序不同，以及 `true`、`1` 等等價寫法，仍會產生不同 key；key builder 會略過位置參數及最外層非基本型別關鍵字參數。
- Cache invalidation is TTL-based unless the caller explicitly clears relevant entries. Avoid caching data whose validity depends on checks inside the handler, such as a token-expiry check. / 除非呼叫端明確清除相關項目，否則快取依 TTL 失效。若資料有效性依賴 handler 內檢查（例如 token 到期），不宜直接快取。
