# SQLAlchemy tools / SQLAlchemy 工具

These helpers run asynchronous SQL and ORM operations against the project's single configured database. FastAPI's `lifespan` initializes `CONN_MANAGER` before requests use them. The manager currently creates async SQLite (`aiosqlite`) or PostgreSQL (`asyncpg`) connections.

這些工具透過專案設定的單一資料庫執行非同步 SQL 與 ORM 操作。FastAPI 的 `lifespan` 會先初始化 `CONN_MANAGER`，請在初始化完成後使用。連線管理器目前支援非同步 SQLite（`aiosqlite`）與 PostgreSQL（`asyncpg`）。

| File / 檔案 | Responsibility / 用途 |
| --- | --- |
| `tools_sqlalchemy_async.py` | `SqlAlchemyExecAsync`: SQL 查詢、寫入、ORM 執行與分頁；raw SQL queries, writes, ORM execution, and pagination. |
| `tools_sqlalchemy_wrapper.py` | `SqlAlchemyExecWrapper`: 將相同操作轉發給非同步 executor，並提供舊介面相容屬性；forwards async operations and exposes compatibility properties. |
| `tools_sqlalchemy_utils.py` | `BigParams` 與 `sqlalchemy_pagination_stmt`: 分頁參數與資料庫方言 SQL；pagination parameters and dialect-specific SQL. |

## Session and transaction ownership / Session 與交易歸屬

- `SqlAlchemyExecAsync()` and `SqlAlchemyExecWrapper()` need no `key` or `session`. Each operation gets a new session from `CONN_MANAGER.get_db()`, closes it after use, commits successful raw SQL/statement execution, and rolls back on exceptions. This default does **not** create one transaction across multiple method calls.
- 不傳 `key` 或 `session` 即可使用。每次操作都會由 `CONN_MANAGER.get_db()` 取得新 session，操作後關閉；成功執行 raw SQL／statement 會提交，發生例外會回滾。**多次方法呼叫不會共用同一筆交易**。
- `key="..."` is retained for old callers, but every value points to the same configured database. `session=...` takes precedence. With the default `manage_transaction=True`, the helper commits or rolls back and closes the injected session after each operation; do not expect to reuse it across calls.
- `key="..."` 保留舊呼叫方式，但任何值都使用同一顆設定中的資料庫。若傳入 `session=...`，會優先使用該 session。預設 `manage_transaction=True` 仍會在每次操作後提交／回滾並關閉傳入的 session，不能假設後續呼叫還能繼續使用。
- For a transaction spanning several operations, use `SqlAlchemyExecAsync(session=session, manage_transaction=False)`. The caller owns commit, rollback, and close. `execute_commit()` deliberately rejects this mode; use `session.add()` and `await session.flush()` instead.
- 若要跨多次操作共用交易，使用 `SqlAlchemyExecAsync(session=session, manage_transaction=False)`；提交、回滾及關閉都由呼叫端負責。此模式不能呼叫 `execute_commit()`；新增 ORM 物件請使用 `session.add()` 與 `await session.flush()`。
- Accessing `executor.session` without injecting one creates and pins a session for legacy direct access. The caller must close that pinned session. Do not share one `AsyncSession` across concurrent tasks.
- 未注入 session 卻直接讀取 `executor.session` 時，會建立並固定一個 session 以相容舊用法；呼叫端須自行關閉。不同並行任務不可共用同一個 `AsyncSession`。

## `SqlAlchemyExecAsync` API / 方法

Raw SQL uses SQLAlchemy `text()` and named parameters such as `:code`; pass values separately rather than formatting them into SQL. SQL-taking query methods validate that `sql` is non-empty. Return values and behavior are:

Raw SQL 由 SQLAlchemy `text()` 執行。參數請寫成 `:code` 並另外傳入值，不要直接拼進 SQL。各查詢方法會檢查 `sql` 非空字串。方法功能與回傳值如下：

| Method / 方法 | 繁體中文 | English |
| --- | --- | --- |
| `query_tables(schema=None)` | 列出指定／預設 schema 的資料表名稱。 | List table names in the specified/default schema. |
| `query_table_exists(table)` | 用 inspector 檢查預設 schema 是否有指定表。 | Check whether a literal table name exists in the default schema. |
| `query_schema(table_name, schema=None)` | 取得欄位資訊；將欄位型別轉成字串。表不存在時拋出 `NoSuchTableError`。 | Return column metadata with types converted to strings; a missing table raises `NoSuchTableError`. |
| `query(sql, params=None)` | 全部結果轉成 `list[list]`。 | Fetch all rows as lists. |
| `query_scalar(sql, params=None)` | 回傳第一列第一欄；無資料為 `None`。 | Return the first scalar, or `None` when no row exists. |
| `query_large(sql, params=None, mapping=False)` | 逐筆 `yield` 已緩衝的結果；`mapping=True` 產生 `RowMapping`。**並非資料庫串流**。 | Yield rows from an already buffered result; `mapping=True` yields `RowMapping`. **Not database streaming.** |
| `query_dict(sql, params=None)` | 全部結果轉成 `list[dict]`。 | Fetch all rows as dictionaries. |
| `query_list_idx(sql, params=None, index=0)` | 依欄位索引取值；多欄查詢索引超出範圍時，該列回傳 `None`。 | Extract one indexed value per row; for multi-column rows, an out-of-range index yields `None`. |
| `query_first(sql, params=None, index=0)` | 取第一列指定索引的值；無資料為 `None`，`0`、`False` 不會被當成無資料。 | Return the indexed value from the first row, or `None` if empty; keeps `0` and `False`. |
| `query_list_col(sql, params=None, column_name="N/A")` | 依欄名取值；欄名不存在時回傳空清單。 | Extract a named column; return an empty list if absent. |
| `exec(sql, param=None)` | 執行 INSERT／UPDATE／DELETE 等 raw SQL；成功回傳 `True`。 | Execute a raw SQL command and return `True` on success. |
| `execute_orm(stmt)` | 執行 SQLAlchemy statement，回傳已緩衝的 `Result`，可再呼叫 `.all()`、`.scalar()` 等。 | Execute a SQLAlchemy statement and return a buffered `Result` for `.all()`, `.scalar()`, etc. |
| `execute_commit(obj)` | `add` → `flush` → `refresh` → `commit`，回傳 ORM 物件；僅適用由工具管理的交易。 | Add, flush, refresh, and commit an ORM object; only in helper-managed mode. |
| `paginate_orm(stmt, page="all", size="all", subquery_count=True, unique=True)` | 對 `select(...)` 分頁並把結果轉成字典；預設取全部。`subquery_count`、`unique` 傳給 `fastapi-pagination`。 | Paginate a `select(...)` into dictionary items; fetches all by default. Passes `subquery_count` and `unique` to `fastapi-pagination`. |
| `paginate_query(sql, page=1, size=20, single_element=False, sql_params=None)` | raw SQL 分頁，`items` 是列清單；`single_element=True` 時每列只取第一個值。 | Paginate raw SQL into list rows; with `single_element=True`, each item is its first value. |
| `paginate_query_dict(sql, type_db=None, page=1, size=20, sql_params=None)` | raw SQL 分頁，`items` 是字典；省略 `type_db` 時自動使用目前連線的方言。 | Paginate raw SQL into dictionaries; detects the active dialect when `type_db` is omitted. |

All three pagination methods return `fastapi_pagination.default.Page` with `items`, `total`, `page`, `size`, and `pages`. If **either** `page` or `size` is `"all"` (case-insensitive), the method fetches all rows. Numeric page and size are clamped to at least 1; `BigParams` limits page size to 100,000.

三個分頁方法都回傳 `fastapi_pagination.default.Page`，包含 `items`、`total`、`page`、`size`、`pages`。只要 **任一個** `page` 或 `size` 為 `"all"`（不區分大小寫），就會取回全部資料。數字頁碼及每頁筆數至少為 1；`BigParams` 限制每頁最多 100,000 筆。

## `SqlAlchemyExecWrapper` API / 方法

`SqlAlchemyExecWrapper` forwards the executor's public callable methods through `__getattr__`, so the method table above also applies to the wrapper. Each forwarded call follows the same session policy. `query_large()` is special: **await the wrapper call first**, then iterate over the returned async iterator. Calling `query_large()` directly on `SqlAlchemyExecAsync` uses `async for` without an initial `await`.

`SqlAlchemyExecWrapper` 透過 `__getattr__` 轉發 executor 的公開方法，上表同樣適用，session 行為也相同。`query_large()` 是特例：**wrapper 呼叫要先 `await`**，再對取得的 async iterator 做 `async for`；直接呼叫 `SqlAlchemyExecAsync.query_large()` 則不需先 `await`。

| Member / 成員 | 繁體中文 | English |
| --- | --- | --- |
| `engine` | 取得傳入 session 的 bind 或管理器的 engine；不要自行 `dispose()` 管理器的 engine。 | Get an injected session's bind or the manager's engine; do not dispose the manager-owned engine. |
| `session_factory` | 取得管理器的 `async_sessionmaker`；自行建立的 session 由呼叫端管理。 | Get the manager's `async_sessionmaker`; direct sessions are caller-owned. |
| `__enter__` / `__exit__` | 支援 `with`，不開啟共用交易，也不處理 engine 關閉。 | Support `with` without opening a shared transaction or disposing the engine. |
| `__aenter__` / `__aexit__` | 支援 `async with`，同樣不建立共用交易。 | Support `async with`, also without creating a shared transaction. |

Internally, `_is_async` reports whether the current bind is async, and `_detect_async(url)` checks the URL dialect. These compatibility helpers do not turn the wrapper into a synchronous executor.

內部的 `_is_async` 判斷目前 bind 是否為非同步；`_detect_async(url)` 判斷 URL 方言。這些相容性輔助功能不會讓 wrapper 變成同步 executor。

## `tools_sqlalchemy_utils.py` / 分頁工具

- `BigParams` extends `fastapi_pagination.Params` and permits `size` from 1 to 100,000 (default 200). / `BigParams` 擴充 `fastapi_pagination.Params`，允許 `size` 介於 1 到 100,000（預設 200）。
- `sqlalchemy_pagination_stmt(sql, page, size, type_db)` strips one trailing semicolon, validates a non-empty SQL string and positive page/size, then appends the dialect's pagination SQL. SQLite, PostgreSQL, MySQL, and MariaDB use `LIMIT ... OFFSET ...`; Oracle uses `ROWNUM`; MSSQL uses `OFFSET ... FETCH`. Unsupported dialects raise `ValueError`. Only SQLite and PostgreSQL are currently configured by this project's connection manager; the other branches are compatibility code, not verified connections.
- `sqlalchemy_pagination_stmt(...)` 會移除結尾的一個分號，檢查 SQL 非空及頁碼／筆數為正整數，再依資料庫方言附加分頁語法。SQLite、PostgreSQL、MySQL、MariaDB 使用 `LIMIT ... OFFSET ...`；Oracle 使用 `ROWNUM`；MSSQL 使用 `OFFSET ... FETCH`。不支援的方言拋出 `ValueError`。目前專案連線管理器只設定 SQLite 與 PostgreSQL；其他分支是相容性程式碼，並未驗證實際連線。

## Usage / 使用方式

The following examples run inside an async function after application startup. / 以下範例在應用程式啟動後的 async function 中執行。

```python
from sqlalchemy import select

from COMMON.tools.storage.sqlalchemy import SqlAlchemyExecAsync, SqlAlchemyExecWrapper
from SYSTEM.database import CONN_MANAGER
from SYSTEM.models.models_portfolio import PortfolioLocale

# One call, one helper-owned session. / 單次呼叫由工具管理 session。
db = SqlAlchemyExecAsync()
locale = await db.query_dict(
    "SELECT code, name FROM portfolio_locale WHERE code = :code",
    {"code": "en"},
)
page = await db.paginate_orm(
    select(PortfolioLocale).order_by(PortfolioLocale.code), page=1, size=20
)
raw_page = await db.paginate_query_dict(
    "SELECT code, name FROM portfolio_locale ORDER BY code", page=1, size=20
)

# One transaction across several calls. / 多次呼叫共用同一筆交易。
async with CONN_MANAGER.get_db() as session:
    db = SqlAlchemyExecAsync(session=session, manage_transaction=False)
    await db.exec(
        "UPDATE portfolio_locale SET is_active = :active WHERE code = :code",
        {"active": True, "code": "en"},
    )
    count = await db.query_scalar("SELECT COUNT(*) FROM portfolio_locale")
    await session.commit()

# Wrapper forwards the same operations. / Wrapper 轉發相同操作。
wrapper = SqlAlchemyExecWrapper()
rows = await wrapper.query("SELECT code FROM portfolio_locale ORDER BY code")
iterator = await wrapper.query_large("SELECT code FROM portfolio_locale")
async for row in iterator:
    print(row[0])
```

## Practical limits / 使用限制

- Default calls close their sessions before returning. `execute_orm()` returns buffered results, but returned ORM instances are detached: lazy relationships and unloaded/deferred attributes may fail on later access. Load needed data while using a caller-owned session or select the columns you need. `paginate_orm()` also converts model columns after its paginated session scope; deferred attributes can fail there.
- 預設呼叫會在回傳前關閉 session。`execute_orm()` 雖回傳已緩衝結果，ORM 物件仍會脫離 session，之後讀取惰性關聯或尚未載入的欄位可能失敗。需要這些資料時請在自行管理的 session 內載入，或直接選取所需欄位。`paginate_orm()` 的一般分頁模式也在 session scope 結束後轉換欄位，延遲載入欄位可能失敗。
- `paginate_orm(page="all")` does not call `unique()` before iterating. Queries with collection `joinedload(...)` may raise a SQLAlchemy unique-result error. `unique=True` only affects the paginated `apaginate` branch.
- `paginate_orm(page="all")` 在遍歷結果前沒有呼叫 `unique()`；搭配集合關聯的 `joinedload(...)` 可能出現 SQLAlchemy 的 unique-result 錯誤。`unique=True` 只作用於 `apaginate` 的一般分頁路徑。
- `query_large()` is buffered, and all `"all"` pagination modes materialize the entire result. Even `"all"` still uses `BigParams`, so results over 100,000 rows exceed its size limit. For stable page boundaries, add an explicit `ORDER BY`. Raw SQL pagination expects a single query that can be counted and extended with pagination clauses. Use distinct column aliases for dictionary results when joining tables.
- `query_large()` 會先緩衝結果，`"all"` 分頁也會將全部資料載入記憶體。`"all"` 仍使用 `BigParams`，超過 100,000 筆會超出其筆數上限。分頁查詢請加上明確的 `ORDER BY` 以維持穩定順序。raw SQL 分頁應使用可包成計數子查詢並附加分頁語法的單一查詢。JOIN 後轉成字典時，重複欄名請使用不同別名。
- The focused CRUD tests cover the SQLite path. PostgreSQL operation and the compatibility dialect branches have not been exercised by those tests.
- 目前 CRUD 專用測試涵蓋 SQLite 路徑；尚未透過這些測試驗證 PostgreSQL 實際操作及其他相容方言分支。
