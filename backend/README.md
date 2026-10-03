# 後端架構與主要介面 / Backend Architecture and Main Interfaces

本目錄是**現代化的個人檔案系統**的後端，以 FastAPI、uv 與 SQLAlchemy 非同步 ORM 為核心，目標是輕量化、模組化與可維護性。目前優先完成後端，前端開發暫緩。整體產品介紹見[根目錄 README](../README.md)。

This directory contains the backend of the **Modern Personal Profile System**, centered on FastAPI, uv, and SQLAlchemy's asynchronous ORM. The goals are lightweight development, modularity, and maintainability. Backend development takes priority; frontend development is deferred. See the [root README](../README.md) for the product overview.

本文件區分目前可執行的後端基礎設施與尚未完成的業務功能。FastAPI 入口、單一非同步資料庫連線管理、Redis client、WEB cache、Socket.IO 組裝、heartbeat middleware 與本機 Swagger／ReDoc 已建立；業務 API、ORM 與 migration 尚待完成。

This document separates the runnable backend infrastructure from unfinished business features. The FastAPI entry point, one asynchronous database manager, Redis clients, WEB cache, Socket.IO assembly, heartbeat middleware, and local Swagger/ReDoc are present. Business APIs, ORM integration, and migrations remain unfinished.

## 1. 目前狀態 / Current State

目前可從 `backend/` 執行 `uv run manage_fastapi.py` 啟動 FastAPI，並開啟 `/swagger`、`/redoc` 與 `/openapi.json`。`APPs/` 尚無業務 router，因此這些頁面不代表業務 API 已完成。`src/backend/__init__.py` 的 `main()` 仍是 uv 範例，只會輸出訊息；它不是伺服器入口。

Run `uv run manage_fastapi.py` from `backend/` to start FastAPI and serve `/swagger`, `/redoc`, and `/openapi.json`. `APPs/` has no business routers yet, so the documentation pages do not imply that business APIs are ready. The generated `main()` in `src/backend/__init__.py` only prints a sample message; it is not the server entry point.

```text
backend/
├── APPs/
├── COMMON/
│   ├── decorator/
│   ├── exceptions/
│   ├── schema/
│   │   ├── help/
│   │   ├── parser/
│   │   ├── resp/
│   │   └── utils/
│   └── tools/
│       ├── storage/
│       │   └── redis/
│       ├── tools_enum.py
│       └── tools_yaml.py
├── SYSTEM/
│   ├── config.yaml                 # 本機配置，不提交 / local, ignored
│   ├── extension.py
│   ├── settings.py
│   ├── lifespan.py
│   ├── tools/
│   │   ├── tools_fastapi.py
│   │   ├── tools_net.py
│   │   └── tools_socketio.py
│   ├── constants/
│   │   ├── constant_storage.py
│   │   └── constants_cache.py
│   ├── database/
│   │   ├── database_core.py
│   │   ├── models/
│   │   └── migrations/
│   │       └── .gitkeep
│   ├── middleware/
│   └── static/                     # Swagger / ReDoc assets
├── .python-version
├── README.md
├── manage_fastapi.py
├── pyproject.toml
├── uv.lock
└── src/
    └── backend/
        └── __init__.py
```

上圖列出目前已整合的主要後端檔案，省略 package 標記、靜態資產細項與尚未整合的草稿。`SYSTEM/database/models/` 與 `migrations/` 是骨架；版本庫另有 `SYSTEM/models/`、`SYSTEM/database/orm/`、`alembic.ini` 等 ORM／Alembic 草稿，但啟動流程沒有載入它們。`APPs/` 的業務模組尚未建立。

The tree shows the main integrated backend files, omitting package markers, individual static assets, and unintegrated drafts. `SYSTEM/database/models/` and `migrations/` are scaffolds. The repository also contains ORM/Alembic drafts under `SYSTEM/models/`, `SYSTEM/database/orm/`, and `alembic.ini`, but startup does not load them. Business modules under `APPs/` have not been created.

本機產生的 `.venv/` 與作業系統檔案不屬於原始碼架構，未列入上圖。依賴宣告以 [pyproject.toml](pyproject.toml) 為準，解析後版本記錄於 [uv.lock](uv.lock)。

The locally generated `.venv/` and operating-system files are not part of the source architecture and are omitted above. Dependency declarations are maintained in [pyproject.toml](pyproject.toml), with resolved versions in [uv.lock](uv.lock).

| 類別 / Category | 目前宣告的套件 / Declared Packages | 用途 / Purpose |
| --- | --- | --- |
| API | `fastapi`, `uvicorn[standard]` | HTTP API 與 ASGI 執行環境 / HTTP APIs and ASGI runtime |
| 資料驗證 / Validation | `pydantic`, `pydantic-settings` | 資料與應用設定驗證 / Data and application settings validation |
| 資料庫 / Database | `sqlalchemy[asyncio]`, `asyncpg`, `alembic` | 非同步 ORM、PostgreSQL 驅動、結構遷移 / Async ORM, PostgreSQL driver, and schema migrations |
| 快取與即時功能 / Cache and Realtime | `redis`, `fastapi-cache2`, `python-socketio` | Redis client、WEB cache backend、Socket.IO 組裝；業務 API 的快取裝飾器尚未使用 / Redis clients, WEB cache backend, and Socket.IO assembly; business API caching is not used yet |
| 模板與 Session / Templates and Sessions | `jinja2`, `starsessions` | Jinja2 已宣告但目前文件頁不使用模板；session 工具保留但 middleware 未啟用 / Jinja2 is declared but the current docs pages use no templates; session utilities remain while their middleware is disabled |
| 開發依賴 / Development | `aiosqlite`, `black`, `pytest`, `httpx` | 本機 SQLite 驅動、排版與測試 / Local SQLite driver, formatting, and testing |

目前方向是本機以 SQLite 開發、部署時使用 PostgreSQL，皆透過 SQLAlchemy async ORM 存取。`aiosqlite` 目前位於 `dev` 群組，因此本機 SQLite 環境需要包含此群組；若未來正式環境也使用 SQLite，須重新調整依賴分類。Python 驅動的安裝不代表資料庫或 Redis 服務已安裝、啟動。

The current direction is SQLite for local development and PostgreSQL for deployment, accessed through SQLAlchemy's async ORM. `aiosqlite` is currently in the `dev` group, so local SQLite environments need that group. If SQLite is later used in production, its dependency classification must change. Installing Python drivers does not install or start database or Redis services.

Black 格式設定集中在 `pyproject.toml` 的 `[tool.black]`，`line-length = 120`，沿用 HolmesBase 的行長規範。在本目錄執行 `uv run black .` 格式化，或以 `uv run black --check .` 僅檢查。

Black formatting is configured in `[tool.black]` in `pyproject.toml`, with `line-length = 120` matching HolmesBase. From this directory, run `uv run black .` to format or `uv run black --check .` to check without modifying files.

### 本機啟動 / Local Startup

在 `backend/` 執行以下命令。`SYSTEM/config.yaml` 是本機私有檔案，已被 Git 忽略；啟動前至少須設定非空的 `SECURITY.secret_key`，以及 `DATABASE.META` 的 `type`、`is_async` 和 `name`。目前沒有可直接複製的公開設定範本。SQLite 使用的 `aiosqlite` 位於開發依賴，請使用預設的 `uv sync`。

Run these commands from `backend/`. `SYSTEM/config.yaml` is a private local file ignored by Git. Before startup, provide a nonempty `SECURITY.secret_key` and `DATABASE.META` values for `type`, `is_async`, and `name`. There is no public copyable configuration template yet. The SQLite driver `aiosqlite` is in the development dependencies, so use the default `uv sync`.

```bash
cd backend
uv sync
uv run manage_fastapi.py
```

啟動後開啟設定的文件路徑，預設為 `http://127.0.0.1:8080/swagger`。實際 host 與 port 取決於本機 `config.yaml`。啟動時註冊 Redis client 和 SQLAlchemy engine 不代表已成功連上 Redis 或資料庫；需要相應操作時才會使用連線。

Open the configured documentation path after startup; the default path is `http://127.0.0.1:8080/swagger`. The actual host and port depend on local `config.yaml`. Registering Redis clients and the SQLAlchemy engine at startup does not verify that either service is reachable; connections are used when operations require them.

## 2. 目標目錄結構 / Target Directory Structure

三個主要目錄直接位於 `backend/` 下，保留 `APPs`、`COMMON`、`SYSTEM` 的大小寫與既定命名方式。`<module>`、`<interface>`、`<function>`、`<topic>` 等為名稱佔位符，不是實際目錄名稱。下圖是完整目標結構，包含尚未建立的功能檔案；省略 Python package 的 `__init__.py`。

The three main directories sit directly under `backend/`, preserving the casing and naming conventions of `APPs`, `COMMON`, and `SYSTEM`. Names such as `<module>`, `<interface>`, `<function>`, and `<topic>` are placeholders. The full target structure below includes functionality files that do not exist yet; Python package `__init__.py` files are omitted.

```text
backend/
├── APPs/
│   └── <module>/
│       ├── views_<interface>.py
│       ├── module/
│       │   └── <function>/
│       │       └── module_<function>.py
│       └── schema/
│           ├── body/
│           │   └── body_<interface>.py
│           ├── parser/
│           │   └── parser_<interface>.py
│           └── resp/
│               └── resp_<interface>.py
├── COMMON/
│   ├── decorator/
│   │   └── deco_<purpose>.py
│   ├── exceptions/
│   │   ├── base.py
│   │   └── exceptions.py
│   ├── schema/
│   │   ├── help/
│   │   │   └── help_<topic>.py
│   │   ├── parser/
│   │   │   └── parser_<topic>.py
│   │   ├── resp/
│   │   │   └── resp_<topic>.py
│   │   └── utils/
│   │       ├── utils_type.py
│   │       └── utils_validate.py
│   └── tools/
│       └── tools_<module>.py
├── SYSTEM/
│   ├── config.yaml
│   ├── config.example.yaml
│   ├── settings.py
│   ├── tools/
│   │   └── tools_net.py
│   ├── urls.py
│   ├── lifespan.py
│   ├── constants/
│   │   ├── constant_storage.py
│   │   ├── constants_cache.py
│   │   └── constant_<topic>.py
│   ├── database/
│   │   ├── database_core.py
│   │   ├── models/
│   │   │   └── models_<domain>.py
│   │   └── migrations/
│   └── security/
│       └── middleware/
│           └── middleware_<purpose>.py
├── manage_fastapi.py
├── .python-version
├── README.md
├── pyproject.toml
└── uv.lock
```

`config.example.yaml` 尚未建立。`constants/` 已有 `constants_cache.py` 與 `constant_storage.py`；共用 schema 子目錄目前僅有 package 標記。ORM 與 migration 待後續整合。現在使用的 HTTP middleware 位於 `SYSTEM/middleware/`。

`config.example.yaml` has not been created. `constants/` contains `constants_cache.py` and `constant_storage.py`; shared schema directories currently contain only package markers. ORM and migrations still require integration. Active HTTP middleware lives in `SYSTEM/middleware/`.

**套件布局待調整：**目前 `uv_build` 使用 `src/backend` 布局，且命令入口是 `backend:main`。落實上述目錄時，必須一併檢查套件收錄、import 路徑與啟動入口；不能只新增根層目錄便視為已完成整合。現有 `src/backend` 範例尚未移除。

**Package layout transition is pending:** `uv_build` currently uses the `src/backend` layout, with the command entry point `backend:main`. Implementing the target layout requires reviewing package inclusion, import paths, and the startup entry point together. Adding root-level directories alone does not complete the integration. The existing `src/backend` sample remains in place.

## 3. APPs：介面與業務 / Interfaces and Business Logic

| 位置 / Location | 職責 | Responsibility |
| --- | --- | --- |
| `views_<interface>.py` | 定義路由、接收已驗證的輸入、取得依賴、呼叫業務方法並回傳結果 | Define routes, receive validated inputs, obtain dependencies, invoke business operations, and return results |
| `module/<function>/module_<function>.py` | 實作該模組的業務規則、操作流程與 ORM 查詢 | Implement module-specific rules, operations, and ORM queries |
| `schema/body/` | 定義請求主體的資料模型 | Define request body models |
| `schema/parser/` | 解析與驗證 query、path 等介面參數，組合必要的依賴 | Parse and validate query/path parameters and compose required dependencies |
| `schema/resp/` | 定義該介面的輸出契約 | Define response contracts for the interface |

業務方法接收明確的資料、使用者上下文與 Session 等參數，避免全面依賴 FastAPI `Request`。通用方法放入 COMMON；個人介紹、經歷、旅程與技能等領域規則留在所屬業務模組。ORM models 描述資料表；schema 描述 API 輸入與輸出，兩者分工不同。

Business methods receive explicit data, user context, and resources such as a Session instead of broadly depending on FastAPI's `Request`. Shared operations belong in COMMON; domain rules for profiles, experience, journeys, and skills stay in their business modules. ORM models describe database tables, while schemas describe API inputs and outputs.

API 契約沿用根目錄文件記錄的範圍；實際模組名稱與分組尚待確認，不將每一支 API 自動視為獨立模組。

The API scope follows the root document. Module names and grouping remain to be finalized; each endpoint does not automatically require a separate module.

## 4. COMMON：跨模組共用能力 / Shared Capabilities

COMMON 集中可重用的規則與操作，讓各模組使用一致的參數、欄位說明、回應格式、例外語意與工具介面。抽取共用能力前，先檢查現有方法與套件功能；只有重複的責任相同時才合併，避免各模組重寫相同流程，也避免將不同業務規則強行通用化。

COMMON centralizes reusable rules and operations so modules share parameter conventions, field documentation, response formats, error semantics, and utility interfaces. Check existing helpers and library capabilities before adding another abstraction. Extract logic when the responsibility is genuinely shared, avoiding both duplicated workflows and forced generalization of distinct business rules.

| 位置 / Location | 職責與邊界 | Responsibility and Boundary |
| --- | --- | --- |
| `decorator/` | 有重用需求的函式包裝；保留原函式資訊，清楚區分同步、非同步與 generator 行為。權限與快取機制按實際需求加入 | Reusable function wrappers; preserve function metadata and distinguish sync, async, and generator behavior. Add authorization or caching only when required |
| `exceptions/` | 共用例外基底與錯誤語意；由系統層統一轉成 HTTP 回應及記錄日誌 | Shared exception bases and error semantics; the system layer handles HTTP translation and logging |
| `schema/help/` | 重用欄位的 title、description、example 等文件資訊，避免不同 API 的說明漂移 | Reuse field documentation such as titles, descriptions, and examples to keep APIs consistent |
| `schema/parser/` | 跨 API 的參數解析，例如分頁與語言選擇；端點專屬參數留在 APPs | Parse shared API parameters, such as pagination and language selection; endpoint-specific parameters stay in APPs |
| `schema/resp/` | 確實共用的輸出結構，例如分頁結果；業務欄位由各模組 schema 定義 | Define shared response structures such as paginated results; module schemas own business fields |
| `schema/utils/` | 共用 schema 型別、欄位限制與驗證器，不查資料庫或執行業務流程 | Shared schema types, constraints, and validators; no database access or business workflows |
| `tools/` | 以 `tools_<module>.py` 封裝跨模組的操作、轉換與輔助方法；目前 Redis helper 會從 SYSTEM manager 取得 client | Shared operations and helpers in `tools_<module>.py`; the current Redis helper resolves its client from the SYSTEM manager |

`tools_yaml.py` 與 `storage/redis/tools_redis_async.py` 已建立。版本庫中的 `storage/sqlalchemy/` 目前是草稿，尚未與單一資料庫 manager 整合；其他工具依實際需求新增。一般資料轉換放在 tools；與 schema 欄位直接相關的限制與驗證放在 schema。

`tools_yaml.py` and `storage/redis/tools_redis_async.py` are present. The versioned `storage/sqlalchemy/` directory is a draft that is not integrated with the single-database manager; add further helpers when needed. General transformations belong in tools, while field constraints and schema-specific validation belong in schema.

COMMON 的使用規則如下：

Rules for COMMON:

1. **依賴方向：**COMMON 不載入 APPs 業務模組。純工具優先以參數接收資源；目前 `RedisAsync` 是一個例外，未注入 client 時會向 SYSTEM manager 取得已註冊的 client。避免在模組匯入時建立它，以免早於 lifespan 初始化。
   **Dependency direction:** COMMON does not import APPs business modules. Pure helpers should receive resources as parameters. `RedisAsync` is a current exception: without an injected client it resolves one from the SYSTEM manager. Do not construct it at module import time before lifespan initializes the clients.
2. **交易邊界：**一般查詢工具不擅自 commit、rollback 或關閉呼叫端傳入的 Session。由一個明確的業務操作或工作單元管理交易，使多筆操作能一起成功或回滾。
   **Transaction boundary:** General query helpers must not implicitly commit, roll back, or close a caller-owned Session. A clearly defined business operation or unit of work owns the transaction so related changes succeed or roll back together.
3. **ORM 可攜性：**共用查詢優先使用 SQLAlchemy 表達式與綁定參數；需要動態欄位時，透過明確允許的 ORM 欄位映射處理。資料庫專屬能力集中隔離，不把原生 SQL 字串拼接或關鍵字檢查當作跨資料庫抽象。
   **ORM portability:** Prefer SQLAlchemy expressions and bound parameters. Map dynamic field choices to explicitly allowed ORM attributes. Isolate database-specific capabilities rather than treating SQL string construction or keyword checks as a cross-database abstraction.
4. **錯誤與輸出：**共用例外不直接組裝整個 HTTP 回應。SYSTEM 統一處理狀態碼與對外訊息，內部 traceback、檔案位置及敏感內容不回傳給用戶端。共用回應外層格式須配合 API 契約確認，不直接沿用參考專案的欄位。
   **Errors and responses:** Shared exceptions do not construct the entire HTTP response. SYSTEM maps status codes and public messages; internal tracebacks, file locations, and sensitive values stay out of client responses. A shared response envelope must follow the agreed API contract instead of inheriting fields from a reference project.
5. **輕量化：**純資料處理依需要使用同步函式；涉及非同步 I/O 時再使用 async。不為普通 JSON、時間或分頁操作預先引入資料分析、機器學習、訊息佇列等大型依賴，也不為單純轉呼叫而包裝每個套件方法。
   **Lightweight implementation:** Use synchronous functions where appropriate for pure data processing and async functions for asynchronous I/O. Ordinary JSON, time, or pagination helpers should not introduce analytics, machine-learning, or messaging dependencies. Avoid wrappers that only forward library calls without adding a shared policy.

## 5. SYSTEM：設定、資源與應用組裝 / Configuration, Resources, and Assembly

| 位置 / Location | 職責 | Responsibility |
| --- | --- | --- |
| `config.yaml` | 實際執行環境的 server 與部署配置，包含服務選項、資料庫選擇及必要功能開關；真實配置不提交 | Runtime server and deployment configuration, including service options, database selection, and required feature flags; actual configuration is not committed |
| `config.example.yaml` | 可提交的無機密配置範本，只放欄位、說明及安全示例 | A versioned template containing fields, explanations, and safe examples without secrets |
| `settings.py` | 統一讀取、驗證及整理設定，提供程式使用的設定介面 | Load, validate, and normalize settings behind a single application interface |
| `constants/` | 固定 Enum、識別碼與協定常數；不放每天變動的時間結果或部署開關快照 | Fixed enums, identifiers, and protocol constants; no daily time snapshots or deployment-flag snapshots |
| `tools/tools_fastapi.py` | 動態探索 APPs router、掛載本機 Swagger／ReDoc，並提供回應與快取 key 工具 | Discover APPs routers, mount local Swagger/ReDoc, and provide response and cache-key helpers |
| `lifespan.py` | 控制應用資源的建立與釋放，處理啟動中途失敗時的清理 | Own application resource startup and shutdown, including cleanup after partial startup failures |
| `database/database_core.py` | 管理一個 async SQLAlchemy engine、session factory 與依設定建立的 async Redis client | Manage one async SQLAlchemy engine, its session factory, and configured async Redis clients |
| `database/models/`、`database/migrations/` | 尚未整合的 ORM 與 migration 骨架 | ORM and migration scaffolds awaiting integration |
| `middleware/` | 啟用 CORS 與 Redis heartbeat；session 程式保留但未掛載 | Enable CORS and Redis heartbeat; session utilities remain but are not mounted |
| `static/` | 本機 Swagger／ReDoc 靜態資產 | Local Swagger/ReDoc assets |
| `manage_fastapi.py` | 組裝 FastAPI、路由、文件與 Socket.IO，並由 Uvicorn 啟動 | Assemble FastAPI, routers, docs, and Socket.IO, then start Uvicorn |

YAML 是目前的本機配置入口；`settings.py` 讀取並整理設定，`SECURITY.secret_key` 必須為非空字串。`manage_fastapi.py` 組裝的應用已可啟動，但目前沒有通用的環境變數覆寫或配置範本。不要在公開日誌輸出整份配置或含憑證的連線資訊。

YAML is the current local configuration entry point. `settings.py` loads and organizes settings, and `SECURITY.secret_key` must be a nonempty string. The application assembled by `manage_fastapi.py` starts, but there is no general environment-variable override or configuration template yet. Do not log the complete configuration or credential-bearing connection details publicly.

設定在模組匯入時載入；修改 YAML 不會自動更新已建立的 engine、router 或其他物件。`FastApiServer.start()` 會探索 `APPs/` 下檔名含 `views` 的 Python 模組並註冊其 `router`；目前尚無業務 router。

Configuration is loaded when modules are imported. Editing YAML does not automatically update existing engines, routers, or other objects. `FastApiServer.start()` discovers Python modules under `APPs/` whose filenames contain `views` and registers their `router`; there are no business routers yet.

### 時間規範 / Time Policy

後端固定使用 UTC，不在 `SYSTEM/config.yaml` 提供 `time_zone` 選項。`settings.py` 的 `TIME_ZONE` 固定為 `UTC`，以 `datetime.now(UTC)` 取得帶時區的時間，不依賴 Mac 或伺服器的系統時區。`TIME_WORK` 所代表的每日區間起點也以 UTC 解讀；`TIME_FORMAT` 預設含 `%z` 偏移量，`TIME_START`、`TIME_END` 字串亦包含偏移量。

The backend always uses UTC; `SYSTEM/config.yaml` does not expose a `time_zone` option. `TIME_ZONE` in `settings.py` is fixed to `UTC`, and `datetime.now(UTC)` produces an aware timestamp independently of the Mac or server time zone. The daily interval start represented by `TIME_WORK` is also interpreted in UTC. `TIME_FORMAT` includes `%z` by default, and `TIME_START` / `TIME_END` include the offset.

目前 `TIME_DATETIME`、`TIME_UTC` 及衍生日期／區間值是在 import 時建立的快照，不會隨時間更新。未來建立資料、修改資料或記錄事件時，須在該操作當下呼叫 `datetime.now(UTC)`，不可將這些設定快照當成即時時鐘。

`TIME_DATETIME`, `TIME_UTC`, and derived date/interval values are currently import-time snapshots and do not advance with time. Future record creation, updates, and event logging must call `datetime.now(UTC)` at the time of the operation instead of treating these settings snapshots as a live clock.

資料庫與 API 的時間點統一採 UTC；API 輸出使用帶 `Z` 或 `+00:00` 的 ISO 8601 字串，可由 aware datetime 的 `isoformat()` 產生。前端再按使用者設定或瀏覽器時區顯示。生日等純日期不作時區轉換；依當地時間執行的排程另行保留時區。這些是後續功能的實作規範，目前尚未建立相應 ORM 或 API 功能。本次未修改作業系統時區。

Database and API instants must use UTC; API output should use ISO 8601 with `Z` or `+00:00`, for example through an aware datetime's `isoformat()`. The frontend converts timestamps using the user's preferred or browser time zone. Date-only values such as birthdays are not converted; local-time schedules retain their own time zone. These requirements apply to future ORM and API functionality, which is not implemented yet. This change does not modify the operating system time zone.

初期只管理所需的主資料庫與已確認用途的資源。Engine 與連線池由 SYSTEM 管理；每個請求或工作單元取得自己的 Session，不共用一個全域 Session。SQLite 與 PostgreSQL 的驅動、連線參數與必要差異集中於資料庫層；ORM 不保證兩者行為完全相同，部署前須驗證 migration、查詢、約束與交易。切換連線不會自動搬遷資料。

Initially, manage only the primary database and resources with confirmed purposes. SYSTEM owns engines and pools; each request or unit of work obtains its own Session rather than sharing one global Session. Database drivers, connection options, and required SQLite/PostgreSQL differences belong in the database layer. ORM usage does not guarantee identical behavior: validate migrations, queries, constraints, and transactions before deployment. Switching connections does not migrate existing data.

## 6. 執行與依賴流程 / Execution and Dependency Flow

目前的啟動與 HTTP 請求流程如下；業務處理鏈尚未建立：

The current startup and HTTP request flow is shown below; the business request chain is not implemented yet:

```text
Startup
config.yaml -> settings import -> FastApiServer.start()
                        -> router discovery + local docs + Socket.IO wrapper
                        -> lifespan: init_cache -> FastAPICache.init -> init_db

Request
HTTP -> CORS -> heartbeat -> FastAPI route or local docs
                         -> business routes are not implemented yet

Shared capabilities
APPs -----> COMMON
SYSTEM ---> COMMON
Caller ---> passes settings / Session / client to shared helpers

Shutdown
lifespan -> FastAPICache.reset -> close SQL engine and Redis clients
```

`ConnectionManager.init_cache()` 建立 lazy Redis client，不執行 ping；`init_db()` 建立 SQLAlchemy engine，不驗證資料庫可達性。正常結束與啟動中途失敗都會進入 lifespan 的清理流程。Heartbeat 的 Redis 連線或逾時錯誤會略過當次在線人數紀錄，讓 HTTP 請求繼續。

`ConnectionManager.init_cache()` creates lazy Redis clients without pinging; `init_db()` builds a SQLAlchemy engine without checking database reachability. Normal shutdown and partial startup failures enter the lifespan cleanup path. Redis connection or timeout errors in the heartbeat skip that online-count update and allow the HTTP request to continue.

## 7. 主要介面與工具參考 / Main Interfaces and Helper Reference

以下記錄目前的主要入口、連線管理與共用工具。同步與非同步方法依各表標示；尚未整合的 ORM／SQLAlchemy 草稿不列為可用介面。完整簽名以原始碼與 docstring 為準。

The following sections describe current entry points, connection management, and shared helpers. Tables distinguish synchronous and asynchronous methods. Unintegrated ORM/SQLAlchemy drafts are not presented as available APIs. Source code and docstrings remain the authority for complete signatures.

| 項目 / Item | 說明 / Description |
| --- | --- |
| 檔案 / File | [src/backend/__init__.py](src/backend/__init__.py) |
| 名稱與簽名 / Name and Signature | `main() -> None` |
| 狀態 / Status | uv 初始化範例；尚非 API 啟動入口 / Generated uv sample; not an API startup entry point |
| 用途 / Purpose | 輸出 `Hello from backend!` / Print `Hello from backend!` |
| 參數 / Parameters | 無 / None |
| 回傳 / Return | `None` |
| 執行方式 / Execution | 同步 / Synchronous |
| 副作用 / Side Effects | 寫入標準輸出，不建立資料庫或網路資源 / Writes to standard output; creates no database or network resources |
| 例外 / Exceptions | 未定義自訂例外處理；標準輸出失敗會向上傳遞 / No custom exception handling; output failures propagate |
| 命令映射 / Command Mapping | `pyproject.toml` 的 `backend = "backend:main"` / `backend = "backend:main"` in `pyproject.toml` |

### YAML 讀取 / YAML Reader

檔案 / File: [COMMON/tools/tools_yaml.py](COMMON/tools/tools_yaml.py)。以下描述既有行為，本次未修改此工具。 / The following describes existing behavior; this tool was not changed in this review.

| 簽名 / Signature | 參數、用途與回傳 / Parameters, Purpose, and Return |
| --- | --- |
| `YamlConfig.__init__(self, file: str, mode: str = 'r', encoding: str = 'utf-8') -> None` | `file` 為檔案路徑，必要時補 `.yaml`；`mode`、`encoding` 傳给 `open()`；讀檔並快取，回傳 None。 / Load and cache the file, appending `.yaml` when absent; pass mode/encoding to `open()`; return None. |
| `YamlConfig.__repr__(self) -> str` | 無額外參數；回傳包含路徑與完整資料的字串，不適合記錄敏感設定。 / No extra arguments; return the path and all cached data, unsuitable for logging sensitive configuration. |
| `YamlConfig._load(self) -> Dict[str, Any]` | 無額外參數；讀 YAML，缺檔或 falsy 值回傳 `{}`；實作尚未驗證根節點為 mapping。 / Read YAML; return `{}` for missing files or falsy values; mapping validation is not implemented. |
| `YamlConfig.get(self, section: str, option: Optional[str] = None, fallback: Any = None) -> Any` | `section` 為頂層 key，`option` 為子 key；省略 option 回傳整個區段，缺值時使用 fallback，明確 null 的子值仍為 None。 / Retrieve a section or nested option; use fallback for missing values, preserving an explicitly null option. |
| `YamlConfig.reload(self) -> None` | 無額外參數；重新讀檔更新快取，失敗時保留舊值；缺檔清空快取。 / Reload and replace the cache; retain previous data on failure, clear it for a missing file; return None. |

建構、`_load()` 與 `reload()` 會讀取檔案，YAML 解析錯誤轉為 `ValueError`，其他檔案錯誤可向上傳遞；非 mapping 根節點可能使 `get()` 發生 `AttributeError`。 / Construction, `_load()`, and `reload()` perform file I/O. YAML parse failures become `ValueError`; other file errors can propagate. A non-mapping root can cause `get()` to raise `AttributeError`.

### Enum 工具與快取常數 / Enum Helpers and Cache Constants

工具檔案 / Helper file: [COMMON/tools/tools_enum.py](COMMON/tools/tools_enum.py)。共用行為放在 `_EnumValuesMixin`，由 `EnumUtils`（字串）與 `IntEnumUtils`（整數）繼承；兩者分別使用標準庫 `StrEnum` 與 `IntEnum`。 / `_EnumValuesMixin` shares behavior between the string-based `EnumUtils` and integer-based `IntEnumUtils`, built on standard-library `StrEnum` and `IntEnum` respectively.

| 簽名 / Signature | 參數、用途與回傳 / Parameters, Purpose, and Return |
| --- | --- |
| `_EnumValuesMixin.__repr__(self) -> str` | 無額外參數；回傳底層值的 repr，字串含引號、整數顯示數字。只控制診斷顯示，不決定型別、比較或序列化。 / No extra arguments; return the raw value's representation, quoting strings and displaying integers numerically. This controls diagnostic display, not type, equality, or serialization. |
| `_EnumValuesMixin.values(cls) -> list[str ∣ int]` | classmethod，無額外參數；依宣告順序回傳非別名成員的底層值，每次建立新 list。字串子類實際回傳字串值，整數子類回傳整數值；空基底回傳空 list。 / Class method with no extra arguments; return a fresh list of canonical raw values in definition order, excluding aliases. String subclasses return strings, integer subclasses return integers, and empty bases return empty lists. |

`EnumUtils` 與 `IntEnumUtils` 共用上述兩個方法，不另外重寫 `__new__()` 或 `__str__()`。`EnumUtils` 的明確成員值必須是字串，錯誤型別會在定義時觸發 `TypeError`；`IntEnumUtils` 遵循標準 `IntEnum` 的整數行為，運算結果為一般整數。值查找失敗會產生 `ValueError`，名稱查找失敗會產生 `KeyError`。工具無檔案或網路 I/O。 / Both helpers inherit the two methods above without custom `__new__()` or `__str__()` implementations. Explicit string member values must be strings or class creation raises `TypeError`. The integer helper follows standard `IntEnum` behavior, with arithmetic returning ordinary integers. Invalid value lookups raise `ValueError`; missing name lookups raise `KeyError`. These helpers perform no file or network I/O. [Python enum documentation](https://docs.python.org/3.13/library/enum.html)

常數檔案 / Constants file: [SYSTEM/constants/constants_cache.py](SYSTEM/constants/constants_cache.py)。以下類別均繼承 `values()` 與原值顯示方式，未新增自有方法。 / These classes inherit `values()` and raw-value display without defining additional methods.

| 類別 / Class | 基底與用途 / Base and Purpose |
| --- | --- |
| `EnumCache` | `EnumUtils`；`SYS`、`WEB`、`SOCKET`、`WORKER`、`LOCKER`、`SCHEDULER` 為快取角色字串，保留既有值。不是 Redis Cluster hash slot。 / String identifiers for cache roles; existing values are preserved. These are not Redis Cluster hash slots. |
| `CacheIdx` | `IntEnumUtils`；`INDEX_0` 至 `INDEX_5` 為整數 DB 索引 0 至 5。定義常數不會建立資料庫。 / Integer logical database indexes 0–5; defining them does not create databases. |
| `CacheRedisRange` | `IntEnumUtils`；保留 `DEFAULT = 1`，用途及區間邊界由呼叫端定義。 / Preserve `DEFAULT = 1`; the consuming operation defines its meaning and boundaries. |
| `CacheExpiry` | `IntEnumUtils`；所有值為整數秒。`MONTH` 固定 31 天、`YEAR` 固定 365 天，並非曆月／曆年運算。 / Integer expiration seconds; `MONTH` is exactly 31 days and `YEAR` exactly 365 days, not calendar intervals. |

`CacheIdx`、`CacheRedisRange`、`CacheExpiry` 成員現在是整數型別，不再是底層值為整數的字串物件；JSON 值會輸出數字。既有 `int(CacheIdx.INDEX_0)` 仍可使用；需要文字時使用 `str(member)`。`CacheExpiry.YEAR` 已由錯誤的 `MONTH * 365` 修正為 `DAY * 365`（31,536,000 秒）。 / Numeric members now behave as integers instead of string objects carrying integer values, and JSON values serialize as numbers. Existing explicit `int(...)` calls remain valid; use `str(member)` when text is needed. `CacheExpiry.YEAR` is corrected from `MONTH * 365` to `DAY * 365` (31,536,000 seconds).

### 儲存配置與識別碼 / Storage Configuration and Identifiers

檔案 / File: [SYSTEM/constants/constant_storage.py](SYSTEM/constants/constant_storage.py)。此檔在 import 時擷取配置區塊並定義字串 Enum；未在此建立服務連線。 / This module extracts configuration sections at import time and defines string enums; it does not create service connections itself.

| 名稱 / Name | 用途 / Purpose |
| --- | --- |
| `DB_CONF` | `SYS_CONF` 的 DATABASE 區塊。 / The DATABASE section from `SYS_CONF`. |
| `DB_OPTIONS` | DATABASE 下的 OPTIONS 區塊。 / OPTIONS within DATABASE. |
| `DB_POOL` | OPTIONS 下的 POOL 區塊。 / POOL within OPTIONS. |
| `DB_META` | DATABASE 下的 META 區塊，供 `settings.DB_CONF` 整理單一資料庫設定。 / META within DATABASE, used to build the single-database `settings.DB_CONF`. |
| `DB_KEEP_ALIVE` | OPTIONS 下的 KEEP_ALIVE 區塊。 / KEEP_ALIVE within OPTIONS. |
| `EnumDBType` | 目前支援 `SQLLite` 與 `POSTGRESQL`，分別選擇 async SQLite 與 PostgreSQL URL。 / Currently contains `SQLLite` and `POSTGRESQL` for async SQLite and PostgreSQL URLs. |

`EnumDBType` 繼承 `EnumUtils` 的 `values()`。巢狀配置預期為 mapping；此常數檔本身不驗證整份 YAML。 / `EnumDBType` inherits `values()` from `EnumUtils`. Nested configuration is expected to be a mapping; this constants module does not validate the entire YAML document.

### 網路工具 / Network Utilities

檔案 / File: [SYSTEM/tools/tools_net.py](SYSTEM/tools/tools_net.py)。本次修正維持五個公開函式名稱；內部方法不作為應用程式介面。 / This revision preserves the five public function names; private helpers are not application interfaces.

| 簽名 / Signature | 參數、用途與回傳 / Parameters, Purpose, and Return |
| --- | --- |
| `_net_parse_ip(value: str) -> IPv4Address ∣ IPv6Address ∣ None` | `value` 為 IP 字串；去除外側空白並驗證，回傳 IP 物件，無效或帶 scope 時回傳 None。 / Strip and validate the IP string; return an address object or None for invalid/scoped input. |
| `net_client_ip(request: Request ∣ None = None) -> str` | `request` 存在時驗證 ASGI client；省略時查詢公開 IP，失敗改查本機 hostname；回傳標準 IP 或未知值 `0.0.0.0`。 / Validate the ASGI client, or detect the host address through a public service and hostname fallback; return an IP or the unknown sentinel `0.0.0.0`. |
| `net_primary_ip(destination: str = "8.8.8.8") -> str` | `destination` 為目的 IP 或 hostname；依 IPv4/IPv6 候選路由取得本機來源位址，失敗改查本機 hostname；回傳 IP 或 `0.0.0.0`。 / Resolve destination candidates and select a local source address; fall back to hostname resolution, then `0.0.0.0`. |
| `net_wildcard_cidr(ip_rule: str) -> str ∣ None` | `ip_rule` 為 IP、CIDR 或尾端 IPv4 萬用字元規則；回傳標準 CIDR，無效則 None；CIDR 的 host bits 會歸零。 / Normalize an IP, CIDR, or trailing IPv4 wildcard rule; return CIDR or None, clearing CIDR host bits. |
| `_net_whitelist_cached(whitelist_key: tuple[str, ...]) -> tuple[tuple[IPv4Network, ...], tuple[IPv6Network, ...]]` | `whitelist_key` 為已驗證字串 tuple；忽略無效規則、去重並回傳兩組 network tuple，LRU 最多 128 組規則。 / Compile a validated string tuple, skip invalid rules, deduplicate, and return network tuples; cache up to 128 rule sets. |
| `net_whitelist_ip(whitelist_key: tuple[str, ...]) -> tuple[list[IPv4Network], list[IPv6Network]]` | 接收規則 tuple（亦接受 list），回傳 IPv4/IPv6 列表及 network 的獨立副本；容器型別錯誤回傳空列表。 / Accept a rule tuple or list; return separate copies of IPv4/IPv6 lists and network objects, or empty lists for invalid containers. |
| `net_whitelist_check(client_ip: str, whitelist: list[str]) -> bool` | `client_ip` 為 IP，`whitelist` 為規則 list 或 tuple；同 IP family 比對，命中回傳 True，其餘 False；拒絕未知位址與單一字串白名單。 / Match the client against same-family rules; return True on a match, otherwise False; reject unspecified addresses and bare-string whitelists. |

安全與執行行為 / Security and Execution:

- `net_client_ip(request)` 使用 ASGI 提供的 client 位址；它本身不解析轉送標頭。目前 `manage_fastapi.py` 啟用 Uvicorn proxy headers，並設定 `forwarded_allow_ips="*"`；若服務直接對外開放，部署前須重新確認可信代理範圍。 / `net_client_ip(request)` reads the ASGI client address and does not parse forwarded headers itself. `manage_fastapi.py` currently enables Uvicorn proxy headers with `forwarded_allow_ips="*"`; review trusted proxy scope before direct public exposure. [Uvicorn settings](https://www.uvicorn.org/settings/#http)
- 無 request 時保留同步公開 IP 查詢，以標準庫取代開發依賴 HTTPX；網路或無效回應會退回本機解析。1 秒 socket timeout 不等於整體截止時間，不應直接在 async 請求路徑呼叫。 / Without a request, public-IP detection remains synchronous and uses the standard library instead of development-only HTTPX. Failed or invalid responses fall back to hostname resolution. The one-second socket timeout is not a total deadline; avoid calling this mode directly on an async request path.
- `net_primary_ip()` 不傳送應用資料，但 hostname 解析可能產生 DNS 流量，所得位址不保證是 NAT 外部的公開 IP，也不代表目的地可達。 / Route probing sends no application payload, but hostname resolution may cause DNS traffic. The result need not be the public address beyond NAT and does not establish destination reachability.
- 萬用字元只支援 IPv4；IPv6 scope 不接受，IPv4-mapped IPv6 保持 IPv6 比對。網路錯誤採既定 fallback；無效白名單輸入不放行。 / Wildcards are IPv4-only; scoped IPv6 is rejected, and IPv4-mapped IPv6 remains IPv6. Network errors use the documented fallbacks; invalid whitelist input never grants access.

### FastAPI 回傳與文件工具 / Response and Documentation Helpers

檔案 / File: [SYSTEM/tools/tools_fastapi.py](SYSTEM/tools/tools_fastapi.py)。保留 JSON dump、正常回應 envelope、串流、router 與 docs tags 去重、platform / GATEWAY 選擇、動態路由載入、離線 docs 及快取 key。移除的是自訂 exception 類別，以及將後端例外內容轉為 HTTP／串流錯誤資料的邏輯；`COMMON/exceptions/` 暫留空 package。 / JSON serialization, success envelopes, streaming, router tag deduplication, platform/GATEWAY selection, router discovery, offline docs, and cache keys are retained. Custom exception classes and conversion of backend exceptions into HTTP or streaming error payloads are removed; `COMMON/exceptions/` remains an empty package.

| 簽名 / Signature | 參數、用途與回傳 / Parameters, Purpose, and Return |
| --- | --- |
| `FastApiJSONResponse.default_dumps(obj: Any) -> Any` | 轉換 set、日期、UTF-8 bytes、UUID、Enum、Pydantic model、SQLAlchemy Row / RowMapping 與 Mapping；未知型別拋出 TypeError。 / Convert supported Python, model, and database values; unsupported values raise TypeError. |
| `FastApiJSONResponse.render(self, content: Any) -> bytes` | 保留原本 dump 契約：資料編碼成 UTF-8 JSON，字串視為已編碼 JSON 直接輸出。 / Preserve the original dump contract: encode data as UTF-8 JSON and pass pre-serialized strings through. |
| `FastApiResponseRoute.get_route_handler(self)` | 回傳 async request handler，保留成功 JSON envelope；不捕捉例外並轉成自訂錯誤 response。 / Return an async handler retaining success envelopes without converting exceptions into custom error responses. |
| `custom_route_handler(request: Request) -> Response` | `get_route_handler` 內部方法；成功 JSON 包裝為 state / message / detail / data，保留 headers、cookies、background；空本文、串流與其他回應直接傳遞。 / Nested handler: wrap successful JSON while preserving headers, cookies, and background tasks; pass empty-body, streaming, and other responses through. |
| `FastApiStreamingResponse.__init__(self, content: Union[Generator, AsyncGenerator, Callable], status_code: int = 200, media_type: Optional[str] = "application/json", headers: Optional[Dict[str, str]] = None, **kwargs)` | 接收 sync/async generator 或產生 generator 的 callable；設定 status、media type、headers，建立 JSON line stream。 / Accept a sync/async generator or generator factory and configure the JSON-line response. |
| `FastApiStreamingResponse._json_chunk_generator(content)` | 回傳 sync/async generator，每個 chunk 保留成功 envelope；來源例外向上傳遞，不輸出錯誤 chunk。 / Return a sync/async generator of success envelopes; source exceptions propagate without an error chunk. |
| `dump_success(chunk)` | `_json_chunk_generator` 內部方法；使用共用 dump 規則回傳單筆 JSON envelope 與換行。 / Nested serializer: return one JSON envelope and newline using shared conversion rules. |
| `async_generator()` / `sync_generator()` | `_json_chunk_generator` 內部 async/sync generator；遍歷來源並 yield JSON line，例外不轉成資料。 / Nested async/sync generators: iterate the source and yield JSON lines without serializing errors. |
| `FastApiRouter.__init__(self, *, prefix: str \| bool \| None = None, tags: str \| Enum \| dict \| Sequence[str \| Enum \| dict] \| None = None, include_in_schema: bool \| Enum = True, platform: bool \| Enum \| str \| None = None, **kwargs: Any) -> None` | prefix 預設取呼叫端資料夾，False 或空字串停用；tags 預設取 prefix。platform 保留 PLATFORM 設定判斷；GATEWAY 使用原生 APIRoute，其餘預設 FastApiResponseRoute。kwargs 可覆寫 route/response class。 / Resolve prefix/tags and platform configuration; use native APIRoute for GATEWAY and FastApiResponseRoute otherwise, with kwargs overrides. |
| `FastApiRouter._tag_name(tag: str \| Enum \| dict) -> str` | 解析字串、Enum 值或字典 name，缺少 name 拋出 KeyError。 / Resolve a string, Enum value, or dictionary name; missing names raise KeyError. |
| `FastApiRouter.add_api_route(self, path: str, endpoint: Callable[..., Any], *, tags: Sequence[str \| Enum \| dict] \| None = None, **kwargs: Any) -> None` | 保留 docs 修正；每條路由獨立去重 router 與 endpoint tags，避免後續 API 遺失標籤。 / Retain the docs fix by deduplicating router/endpoint tags independently per route. |
| `fastapi_include_routers(app: FastAPI, app_dir: str, file_pattern: str = "views") -> None` | 遞迴執行檔名含 pattern 的 Python 模組並註冊 router；platform 缺省為啟用，false 略過。載入／註冊例外向上傳遞。 / Recursively execute matching modules and register routers; missing platform flags default to enabled, false flags skip registration, and import/registration errors propagate. |
| `FastApiLocalDocs.__init__(self, app: FastAPI, dir_path: str \| Path, dir_static: str = "static", docs_url: str = "/docs", redoc_url: str = "/redoc") -> None` | 設定本機資產與文件網址；app 應停用內建 docs_url / redoc_url。 / Configure local assets and documentation paths on an app with built-in docs disabled. |
| `FastApiLocalDocs.load(self) -> None` | 啟動前呼叫一次，掛載靜態檔並註冊文件路由。 / Mount assets and register documentation routes once before startup. |
| `FastApiLocalDocs._mount_static(self) -> None` | 掛載本機 static 目錄，缺目錄拋出 FileNotFoundError。 / Mount the local static directory; a missing directory raises FileNotFoundError. |
| `FastApiLocalDocs._register_docs(self) -> None` | 註冊 Swagger、ReDoc、OAuth2 redirect 及根目錄 redirect，均不列入 OpenAPI。 / Register Swagger, ReDoc, OAuth2, and root redirects outside the OpenAPI schema. |
| `_swagger_ui() -> HTMLResponse` / `_swagger_redirect() -> HTMLResponse` / `_redoc() -> HTMLResponse` / `default_redirect() -> RedirectResponse` | `_register_docs` 內部 async handlers；回傳本機資產版本文件頁、OAuth2 頁及根路徑導向。 / Nested async handlers returning local-asset documentation pages, the OAuth2 page, and root redirect. |
| `fastapi_cache_key_builder(func: Callable[..., Any], namespace: str = "", request: Optional[Request] = None, *_, **kwargs)` | 保留原本 key 算法：函式身分、path/query、排序後的基本 kwargs 形成 MD5；排除 self，忽略 host/port/scheme，回傳 namespace:digest。 / Preserve the original MD5 identity based on function, path/query, and sorted basic kwargs, excluding self and host/port/scheme; return namespace:digest. |
| `is_basic_serializable(val)` | cache builder 內部方法；僅檢查頂層型別是否為基本 scalar、tuple、list 或 dict，回傳 bool。 / Nested cache predicate checking only the top-level scalar/container type; returns bool. |

HTTPException 與輸入驗證沿用 FastAPI 原生處理。一般後端例外不再包含自訂的 message、檔案位置或 traceback；部署時仍需停用 FastAPI debug，避免框架本身輸出除錯內容。串流開始後發生例外會中止，不補送錯誤 envelope。 / HTTPException and request validation retain native handling. Backend exceptions are no longer serialized into custom messages, file locations, or tracebacks; FastAPI debug must remain disabled in deployment to suppress framework debug output. Exceptions after streaming starts terminate the stream without an error envelope.

`include_router(..., tags=...)` 額外加入的標籤由 FastAPI 合併，應避免重複指定路由已有的標籤。快取 key 保留既有行為，巢狀容器不會遞迴驗證或正規化。 / FastAPI merges tags supplied to include_router; avoid repeating existing route tags. Cache keys retain their original behavior without recursive validation or normalization of nested containers.

### 單一資料庫與快取連線 / Single Database and Cache Connections

目前的 [ConnectionManager](SYSTEM/database/database_core.py) 管理一個非同步 SQLAlchemy engine、一個 session factory，以及 `CACHE_CONF` 指定的非同步 Redis client。沒有多資料庫 key、同步 SQL session、repository registry 或 managed transaction API。`init_db()` 依 `DB_CONF` 建立 SQLite（`sqlite+aiosqlite`）或 PostgreSQL（`postgresql+asyncpg`）engine；建立 engine 本身不會檢查實際連線。SQLite 記憶體資料庫採用與檔案資料庫不同的 pool 設定。

The current [ConnectionManager](SYSTEM/database/database_core.py) owns one async SQLAlchemy engine, one session factory, and the async Redis clients specified by `CACHE_CONF`. It has no multi-database keys, synchronous SQL sessions, repository registry, or managed transaction API. `init_db()` creates a SQLite (`sqlite+aiosqlite`) or PostgreSQL (`postgresql+asyncpg`) engine from `DB_CONF`; engine creation alone does not verify connectivity. In-memory SQLite uses different pool options from file-backed SQLite.

| 介面 / Interface | 目前行為 / Current Behavior |
| --- | --- |
| `ConnectionManager.__init__()` | 複製 DB、engine 與 cache 設定，不建立連線。 / Copy DB, engine, and cache settings without opening connections. |
| `ConnectionManager.__url()` | 依設定建立 async SQLAlchemy URL；缺少必要值或不支援的 DB 類型會報錯。 / Build an async SQLAlchemy URL and reject missing or unsupported configuration. |
| `ConnectionManager.init_cache()` | 依 `CACHE_CONF` 註冊 lazy Redis client；不執行 ping。 / Register lazy Redis clients from `CACHE_CONF` without pinging them. |
| `ConnectionManager.init_db()` | 建立一個 async engine 與 session factory；重複初始化會報錯。 / Build one async engine and session factory; duplicate initialization raises an error. |
| `ConnectionManager.get_db()` | 每次回傳新的 `AsyncSession`；呼叫端負責 commit、rollback 與 close。 / Return a new `AsyncSession`; the caller owns commit, rollback, and close. |
| `ConnectionManager.get_cache(key)` | 回傳指定的 Redis client；未註冊的 key 會報 `KeyError`。 / Return the selected Redis client; an unknown key raises `KeyError`. |
| `await ConnectionManager.shutdown_all_connections()` | Dispose engine 並關閉 Redis client；關閉失敗以 `ExceptionGroup` 回報。 / Dispose the engine and close Redis clients; report close failures with `ExceptionGroup`. |

使用 SQL session 時，請以 `async with CONN_MANAGER.get_db() as session:` 限定生命週期。`get_db()` 不會替業務操作自動提交交易。`COMMON/tools/storage/sqlalchemy/` 的既有草稿尚未接上這個單一資料庫 manager，不應把舊版 executor 範例當作目前可用 API。

Scope SQL sessions with `async with CONN_MANAGER.get_db() as session:`. `get_db()` does not automatically commit business operations. Local drafts under `COMMON/tools/storage/sqlalchemy/` are not integrated with this single-database manager; older executor examples are not current APIs.

### 應用生命週期與 Middleware / Application Lifespan and Middleware

檔案 / Files: [SYSTEM/lifespan.py](SYSTEM/lifespan.py), [SYSTEM/middleware/middlewares.py](SYSTEM/middleware/middlewares.py), [SYSTEM/middleware/utils/middleware_heartbeat.py](SYSTEM/middleware/utils/middleware_heartbeat.py)

| 介面 / Interface | 目前行為 / Current Behavior |
| --- | --- |
| `lifespan(app)` | 啟動時依序 `init_cache()`、`FastAPICache.init(RedisBackend(WEB))`、`init_db()`；結束或啟動失敗時 reset cache 並關閉資源。 / Initialize Redis clients, the WEB cache backend, and the DB engine; reset and close them at shutdown or after a startup failure. |
| `MIDDLEWARES` | 目前掛載 CORS 和 `HeartbeatMiddleware`；session middleware 未啟用。 / Mount CORS and `HeartbeatMiddleware`; session middleware is inactive. |
| `HeartbeatMiddleware.dispatch(request, call_next)` | 以 client IP 更新 SYS heartbeat；Redis 連線／逾時錯誤會略過這次紀錄，繼續處理請求。 / Refresh the SYS heartbeat by client IP; skip the update and continue on Redis connection or timeout errors. |

WEB cache 使用 `EnumCache.WEB`，在線人數 heartbeat 使用 `EnumCache.SYS`。目前沒有業務 API 使用 `@cache`。Session helper 程式碼仍在 `SYSTEM/middleware/utils/middleware_session.py`，但沒有加入 `MIDDLEWARES`。日後啟用 session 時，須先處理它在模組匯入階段取得 Redis client 的初始化順序。

WEB cache uses `EnumCache.WEB`; the online-count heartbeat uses `EnumCache.SYS`. No business API uses `@cache` yet. The session helper remains in `SYSTEM/middleware/utils/middleware_session.py` but is not mounted in `MIDDLEWARES`. Before enabling it, resolve the import-time Redis client lookup against lifespan initialization order.

### 伺服器與文件入口 / Server and Documentation Entry Point

檔案 / File: [manage_fastapi.py](manage_fastapi.py)

`FastApiServer` 建立 FastAPI app、搜尋 `APPs/` 的 `views` router、掛載本機 Swagger／ReDoc 資產及路由，最後以 Socket.IO ASGI wrapper 包住 FastAPI。執行 `uv run manage_fastapi.py` 才會呼叫 Uvicorn。`backend` console script 目前仍指向 uv 範例 `backend:main`，不會啟動 API。現在的 Uvicorn 呼叫傳入 app 物件，設定多個 worker 前須改成可匯入的 app 路徑或 factory。

`FastApiServer` creates the FastAPI app, discovers `views` routers under `APPs/`, mounts local Swagger/ReDoc assets and routes, and wraps FastAPI with Socket.IO ASGI. Run `uv run manage_fastapi.py` to launch Uvicorn. The `backend` console script still points to the generated `backend:main` example and does not start the API. Uvicorn currently receives an app object; multiple workers require an importable app path or factory.

### Redis 非同步工具 / Async Redis Helpers

檔案 / File: [COMMON/tools/storage/redis/tools_redis_async.py](COMMON/tools/storage/redis/tools_redis_async.py)

| 完整簽名 / Signature | 用途 / Purpose | 參數 / Parameters | 回傳 / Returns |
| --- | --- | --- | --- |
| `class RedisAsync` | 共享 async Redis client 的指令、序列化、pipeline 與 heartbeat 工具。 / Wrap async pooled Redis commands with serialization and heartbeat helpers. | — | — |
| `RedisAsync.__init__(self, key: Optional[str]=None, redis: Redis=None)` | 初始化物件及其資源／模式設定。 / Select an injected async Redis client or resolve one by its manager key. | key: Cache identifier used only when redis is not supplied.; redis: Optional redis.asyncio.Redis; the injecting caller owns its shutdown. | :return: None; this constructor does not borrow a connection or ping the server. |
| `RedisAsync._serialize(value: Any, serialize: bool=True) -> Any` | 依旗標 pickle 序列化資料。 / Pickle a trusted Python value unless serialization is disabled. | value: Value to encode; raw values must be accepted by redis-py.; serialize: If False, return value unchanged. | :return: Pickle bytes or the original value. |
| `RedisAsync._deserialize(value: Any, deserialize: bool=True) -> Any` | 依旗標反序列化可信的 pickle bytes。 / Decode pickle bytes; leave None, non-bytes, and disabled decoding unchanged. | value: Cached value, normally bytes when decode_responses=False.; deserialize: Whether to attempt pickle decoding for bytes. | :return: Decoded object, or the original value when decoding is skipped. |
| `async RedisAsync._execute(self, func: Callable[..., Awaitable[Any]], *args, **kwargs) -> Any` | 透過目前 Redis client 執行一個非同步命令。 / Execute one bound Redis command through its client's normal pool handling. | func: Bound awaitable command on the selected Redis client.; args: Positional command arguments.; kwargs: Keyword command arguments. | :return: Original command result; no unrelated single-client connection is acquired. |
| `async RedisAsync.set(self, key: str, value: Any, ex: Optional[int]=None, serialize: bool=True) -> bool` | 設定值與選用 TTL。 / Set a Redis string value, optionally pickled, with an expiry in seconds. | key: Redis key to create or replace.; value: Python value to pickle, or a Redis-compatible raw value.; ex: Positive expiry seconds; None writes without an expiry.; serialize: Whether to pickle value before storing it. | :return: True on successful SET. Replacing a key also replaces its previous TTL. |
| `async RedisAsync.get(self, key: str, deserialize: bool=True) -> Any` | 讀取值並選擇反序列化。 / Read a Redis string and optionally decode its pickle payload. | key: Redis key.; deserialize: Enable only for trusted pickle data; raw bytes may fail decoding. | :return: Decoded/raw value, or None when the key does not exist. |
| `async RedisAsync.get_by_key(self, key: str, method: str, deserialize: bool=True) -> Any` | 按指定命令讀取值。 / Read a Redis string stored under the composite key '<key>:<method>'. | key: Base Redis key.; method: Suffix appended after a colon; not a Redis command name.; deserialize: Whether to decode a trusted pickle payload. | :return: Decoded/raw value, or None when the composite key does not exist. |
| `async RedisAsync.delete(self, *keys: str) -> int` | 刪除一個或多個 key。 / Delete one or more Redis keys. | keys: One or more keys; an empty argument list is not handled locally. | :return: Number of keys actually removed, excluding missing keys. |
| `async RedisAsync.hash_set(self, name: str, key: str, value: Any, serialize: bool=True) -> int` | 寫入 hash 欄位。 / Create or replace a single Redis hash field. | name: Redis hash key.; key: Field name within the hash.; value: Python value to pickle or a Redis-compatible raw value.; serialize: Whether to pickle the field value. | :return: 1 for a newly added field; 0 for an existing field, even when changed. |
| `async RedisAsync.hash_get(self, name: str, key: str, deserialize: bool=True) -> Any` | 讀取 hash 欄位。 / Read one Redis hash field, optionally decoding its pickle payload. | name: Redis hash key.; key: Field name within the hash.; deserialize: Whether to decode trusted pickle bytes. | :return: Decoded/raw field value, or None for a missing field/hash. |
| `async RedisAsync.hash_del(self, name: str, key: str) -> int` | 刪除 hash 欄位。 / Delete one field from a Redis hash. | name: Redis hash key.; key: Field name to remove. | :return: 1 when removed, or 0 when the field does not exist. |
| `async RedisAsync.hash_mget(self, name: str, keys: list, deserialize: bool=True) -> list` | 批次讀取 hash 欄位。 / Read multiple hash fields in the requested order. | name: Redis hash key.; keys: Non-empty list of field names; empty input is not handled locally.; deserialize: Whether to decode trusted pickle bytes per field. | :return: Ordered list of values, with None for each missing field. |
| `async RedisAsync.list_left_push(self, key: str, value: Any, max_length: int=100, serialize: bool=True) -> bool` | 左側推入並限制 list 長度。 / Move a serialized value to the list head and trim in one transaction. | key: Redis list key.; value: Value to remove from existing positions and push to the head.; max_length: Intended positive maximum number of retained elements.; serialize: Whether to pickle value before matching and storing it. | :return: True after successful execution of LREM, LPUSH, and LTRIM. |
| `async RedisAsync.list_left_pop(self, key: str, count: int=1, deserialize: bool=True) -> list` | 取出指定數量的 list 項目。 / Remove up to count values from the left of a Redis list. | key: Redis list key.; count: Maximum number of values to remove.; deserialize: Whether to decode trusted pickle bytes after removal. | :return: List of removed values, or [] when no values are available. |
| `async RedisAsync.list_range(self, key: str, start: int=0, end: int=-1, deserialize: bool=True) -> list` | 讀取 list 區段。 / Read a Redis list range without removing its values. | key: Redis list key.; start: Inclusive start index; negative indexes count from the tail.; end: Inclusive end index; -1 includes the last element.; deserialize: Whether to decode trusted pickle bytes. | :return: List of values, or [] for a missing key or empty range. |
| `async RedisAsync.list_first(self, key: str, deserialize: bool=True) -> Any` | 讀取第一個 list 值。 / Read the first list element without removing it. | key: Redis list key.; deserialize: Whether to decode trusted pickle bytes. | :return: First decoded/raw value, or None when the list is absent. |
| `async RedisAsync.incr(self, key: str, amount: int=1) -> int` | 遞增整數值。 / Atomically add an integer amount to a Redis integer string. | key: Key containing an unpickled integer string; missing keys start at zero.; amount: Signed integer increment. | :return: Updated integer value. |
| `async RedisAsync.type(self, key: str) -> str` | 取得 key 類型。 / Read the Redis storage type for a key. | key: Redis key. | :return: Type name such as 'string', 'list', or 'none' for a missing key. |
| `async RedisAsync.ttl(self, key: str) -> int` | 取得 key 的剩餘秒數。 / Read a key's remaining expiry in seconds. | key: Redis key. | :return: Nonnegative remaining seconds, -1 for no expiry, or -2 for a missing key. |
| `async RedisAsync.scan_iter(self, match: str='*', count: int=100) -> list` | 掃描並收集符合 pattern 的 key。 / Collect a complete SCAN iteration into memory as decoded key names. | match: Redis glob pattern passed through unchanged.; count: Work hint for each SCAN call. | :return: List of all yielded key names; duplicates are not removed. |
| `async RedisAsync.exists(self, key: str) -> bool` | 檢查 key 是否存在。 / Check whether a single Redis key exists at the time of the command. | key: Redis key. | :return: True when the key exists, otherwise False. |
| `async RedisAsync.exists_scan(self, match: str='*') -> bool` | 檢查是否有符合 pattern 的 key。 / Check the first SCAN result using the expanded pattern '*<match>*'. | match: Redis glob fragment, wrapped in leading and trailing '*'. | :return: Boolean value of the first returned key, or False when no key is yielded. |
| `async RedisAsync.keys(self, pattern: str='*') -> list` | 保留 KEYS 介面與原回傳。 / Fetch every key matching a Redis glob pattern with KEYS. | pattern: Redis glob pattern passed through unchanged. | :return: List of UTF-8-decoded key names; assumes keys contain UTF-8 text. |
| `async RedisAsync.flush(self) -> bool` | 保留目前 DB 的 flush 功能。 / Delete every key in the selected logical Redis database using FLUSHDB. | — | :return: True when Redis accepts FLUSHDB. |
| `async RedisAsync.pipeline(self)` | 建立 pipeline；呼叫端必須 execute／釋放。 / Create a transactional pipeline; the caller must execute queued commands. | — | :return: redis.asyncio Pipeline with the client's default transaction=True. |
| `async RedisAsync.expire(self, key: str, ex: int) -> bool` | 設定 key 到期秒數。 / Assign an expiry in seconds to an existing Redis key. | key: Redis key.; ex: Expiry seconds; zero or a negative value deletes an existing key. | :return: True when applied, or False when the key does not exist. |
| `async RedisAsync.expire_stat(self, match: str='*') -> dict` | 整理 TTL 觀測結果與統計。 / Collect TTL observations and summarize nonnegative remaining lifetimes. | match: Redis glob pattern forwarded to scan_iter. | :return: Dict with avg/max/min (None without timed keys) and per-key overview. |
| `async RedisAsync.heartbeat_client(self, identifier: str, expire: int=60, set_key: str='online_clients', key_prefix: str='online') -> dict` | 保留 heartbeat 寫入與 expiry 回傳。 / Refresh a heartbeat TTL key and add its identifier to the roster set. | identifier: Nonempty identifier; converted to str after the truthiness check.; expire: Intended positive TTL seconds for the heartbeat key.; set_key: Redis set holding identifiers; stale entries do not expire automatically.; key_prefix: Prefix of '<key_prefix>:<identifier>' heartbeat keys. | :return: employee_id and estimated expiry in TIME_ZONE without a UTC offset. |
| `async RedisAsync.heartbeat_total(self, set_key: str='online_clients', key_prefix: str='online') -> int` | 保留 heartbeat 計數與過期 roster 清理。 / Count observed heartbeat keys and remove roster entries observed as absent. | set_key: Redis set containing heartbeat identifiers.; key_prefix: Prefix used when checking each identifier's heartbeat key. | :return: Number of heartbeat keys observed as present, or zero for an empty roster. |

### SQL 輸入檢查 / SQL Input Validation

檔案 / File: [COMMON/decorator/__init__.py](COMMON/decorator/__init__.py)

| 完整簽名 / Signature | 用途 / Purpose | 參數 / Parameters | 回傳 / Returns |
| --- | --- | --- | --- |
| `sql_validate(func)` | 驗證 SQL 文字，保留方法原回傳類型。 / Validate SQL text while preserving the coroutine or iterator returned by func. | func: SQL executor method accepting an argument named sql. | :return: Wrapped callable; this decorator does not manage transactions. |
| `sql_validate.wrapper(*args, **kwargs)` | 驗證綁定參數後轉交原方法。 / Check positional or keyword SQL before forwarding the original arguments. | args: Positional executor arguments.; kwargs: Keyword executor arguments. | :return: Original coroutine, async iterator, or synchronous result. |

### 驗證與目前界線 / Verification and Current Limits

本機曾以 FastAPI `TestClient` 模擬 Redis heartbeat 連線失敗：`/swagger` 回應 200、WEB cache 在 lifespan 內註冊，且同一 app 連續啟停兩次後資源均正常清理。另以模擬 `init_db()` 啟動錯誤確認 cache client 與 `FastAPICache` 狀態會清理。這些檢查未連線外部 Redis 或 PostgreSQL，也不驗證業務 API。

A local FastAPI `TestClient` smoke check simulated a Redis heartbeat connection error: `/swagger` returned 200, WEB cache was registered in lifespan, and resources were cleaned up across two consecutive app lifecycles. A simulated `init_db()` startup error also confirmed cleanup of cache clients and `FastAPICache` state. These checks did not connect to external Redis or PostgreSQL or verify business APIs.

版本庫中的 `tests/test_database_core.py` 其 fixture 與斷言仍針對舊版多資料庫管理器；目前執行時 41 個案例在 setup 階段出錯，不可當作現行程式已通過的測試。ORM／Alembic 草稿尚未整合，也不會在伺服器啟動時自動建表或執行 migration。

The versioned `tests/test_database_core.py` still targets the former multi-database manager. At present, all 41 cases fail during setup, so it must not be presented as a passing current suite. ORM/Alembic drafts are not integrated; server startup does not automatically create tables or run migrations.

## 8. 工程與文件規則 / Engineering and Documentation Rules

- **正規化、模組化、標準化：**資料模型與關聯以正規化為原則；目錄、命名、型別與契約保持一致；業務與基礎設施職責清楚。
- **工程架構與可維護性：**明確定義依賴、交易與生命週期，避免循環依賴、巨型模組與 import 時建立外部資源。
- **重用與輕量化：**先檢查共用方法，再增加程式；不預先移植未需要的背景工作、外部服務或大型工具庫。
- **英文程式註解：**使用英文註解與 docstrings 說明必要的行為和設計理由。
- **中英文件同步：**本 README 維護後端結構、啟動流程與主要介面；完整方法簽名以原始碼與 docstring 為準。根目錄 README 維護整體產品介紹與進度。
- **公開資料邊界：**公開文件不包含真實伺服器規格、識別資訊、連線位置、登入資料或密鑰。`SYSTEM/config.yaml` 已由根目錄 `.gitignore` 排除，僅保留於本機。`SECURITY.secret_key` 必須提供非空字串，缺少時設定載入會報錯；可選的 `SECURITY.cookie_domain` 也由本機配置讀取，程式不保存部署網域或預設簽章金鑰。
- **工作筆記：**助理的暫存檔、研究筆記與私有紀錄一律放在根目錄 `agent/`，該目錄已由 Git 忽略；不放入後端原始碼目錄。
- **授權：**本專案採 MIT License。

- **Normalization, modularity, and standardization:** Normalize data models and relationships, keep naming/types/contracts consistent, and separate business and infrastructure responsibilities.
- **Architecture and maintainability:** Make dependencies, transactions, and lifecycles explicit. Avoid circular imports, oversized modules, and external resource initialization at import time.
- **Reuse and lightweight development:** Check shared helpers before adding code. Do not preemptively port background jobs, external services, or large utility libraries.
- **English code comments:** Use English comments and docstrings to explain relevant behavior and design decisions.
- **Bilingual documentation:** Keep Chinese and English documentation aligned. This README covers backend structure, startup flow, and main interfaces; source code and docstrings own full signatures. The root README covers product overview and progress.
- **Public information boundary:** Public documentation excludes actual server specifications, identifiers, connection locations, login details, and secrets. `SYSTEM/config.yaml` is excluded by the root `.gitignore` and stays local. `SECURITY.secret_key` must be a non-empty string or settings loading raises an error. The optional `SECURITY.cookie_domain` is also read from local configuration; code contains neither a deployment domain nor a default signing key.
- **Working notes:** Assistant temporary files, research notes, and private records belong exclusively in the root `agent/` directory, which Git already ignores, rather than backend source directories.
- **License:** This project uses the MIT License.
