# 後端總覽 / Backend Overview

本目錄是個人檔案系統的 FastAPI 後端。`APPs` 放業務 API，`COMMON` 放共用工具，`SYSTEM` 負責設定、模型、資料庫、middleware 與應用生命週期。整體產品方向見[專案 README](../README.md)。

This directory contains the FastAPI backend for the personal profile system. `APPs` holds business APIs, `COMMON` holds shared tools, and `SYSTEM` owns configuration, models, the database, middleware, and the application lifecycle. See the [project README](../README.md) for the product overview.

目前已完成六支 Portfolio 讀取 API、線上人數診斷 API、SQLite／PostgreSQL 非同步資料庫架構、Redis 快取與 session、Socket.IO 組裝、ORM 模型及初版 Alembic migration。登入、管理後台與寫入 API 尚未實作。

Six Portfolio read APIs and an online-count diagnostic API are implemented alongside the async SQLite/PostgreSQL infrastructure, Redis cache and sessions, Socket.IO assembly, ORM models, and an initial Alembic migration. Login, administration, and write APIs are not implemented yet.

## 目錄結構 / Directory Layout

下列是目前的主要檔案與資料夾；省略 package 標記、靜態資產細項與虛擬環境。

The tree shows the main files and directories currently present; package markers, individual static assets, and the virtual environment are omitted.

```text
backend/
├── APPs/
│   ├── Portfolio/
│   │   ├── views_portfolio.py    # Six public CBV GET routes
│   │   ├── module/               # ORM-backed business queries
│   │   └── schema/               # Query parsers and response models
│   └── Sys/                      # Online-count diagnostic route and module
├── COMMON/
│   ├── decorator/                # 共用 decorator / shared decorators
│   ├── schema/                   # Shared help text, parsers, responses
│   └── tools/
│       ├── storage/
│       │   ├── redis/            # Redis helpers and guide
│       │   └── sqlalchemy/       # SQLAlchemy CRUD helpers and guide
│       ├── tools_enum.py
│       └── tools_yaml.py
├── SYSTEM/
│   ├── config.yaml               # 本機設定，Git 忽略 / local, Git-ignored
│   ├── extension.py              # 載入設定與建立 Socket.IO server
│   ├── settings.py               # 整理應用設定 / derived settings
│   ├── lifespan.py               # 啟動與關閉資源 / resource lifecycle
│   ├── constants/
│   ├── database/
│   │   ├── database_core.py      # 單一 async DB 與 Redis client manager
│   │   └── orm/                  # 共用 ORM Base
│   ├── middleware/               # CORS、heartbeat、session
│   ├── models/                   # Portfolio and auth ORM models
│   │   └── migrations/           # Alembic 環境與版本 / Alembic revisions
│   ├── static/                   # 本機 Swagger／ReDoc 資產
│   └── tools/                    # FastAPI、網路與 Socket.IO 組裝工具
├── tests/                        # 測試 / tests
├── alembic.ini                   # migration 入口 / migration configuration
├── manage_fastapi.py            # API 啟動入口 / server entry point
├── test.py                      # 三語 mock 資料匯入工具 / mock importer
├── pyproject.toml                # 依賴宣告 / dependency declarations
├── uv.lock                       # 解析後版本 / resolved dependency versions
└── src/backend/                  # 尚存的 uv 範例入口 / remaining uv sample
```

新增工具時，詳細方法、參數與用法寫在該工具資料夾的 README。現有文件：[SQLAlchemy 工具](COMMON/tools/storage/sqlalchemy/README.md)、[Redis 工具](COMMON/tools/storage/redis/README.md)、[快取裝飾器](COMMON/decorator/README.md)。這份 README 維護後端架構、API 總覽與操作入口。

When adding a tool, document its methods, parameters, and usage in that tool folder's README. See the [SQLAlchemy](COMMON/tools/storage/sqlalchemy/README.md), [Redis](COMMON/tools/storage/redis/README.md), and [cache decorator](COMMON/decorator/README.md) guides. This README covers backend architecture, API scope, and operational entry points.

## 請求與資料流 / Request and Data Flow

公開內容的處理順序如下；`APPs/Portfolio` 的六支 GET 共用一個 `FastApiRouter`，以 CBV 組織路由。`views` 只負責 HTTP 介面，業務查詢集中在 `module`，資料庫操作使用 `COMMON/tools/storage/sqlalchemy` 的非同步 ORM 工具。

Public content follows the flow below. The Portfolio CBV routes share one `FastApiRouter`: `views` defines HTTP behavior, `module` assembles business data, and the async ORM helper in `COMMON/tools/storage/sqlalchemy` executes database queries.

```text
HTTP request
  → SYSTEM/middleware
  → APPs/{Portfolio,Sys}/views
  → schema/parser → module → ORM or Redis helper
  → SYSTEM/database/ConnectionManager → SQLite/PostgreSQL or Redis
  → schema/resp → JSON response
```

Portfolio 的 `site`、`journey` 直接回傳物件或陣列；四種集合 `experiences`、`projects`、`skill-categories`、`skills` 共用五欄位頁碼分頁。沒有統一的外層 `data/meta/revision` 包裝。`is_caching=true` 才會使用 `EnumCache.WEB` 的回應快取；session 與心跳使用 `EnumCache.SYS`。目前所有內容屬於單份 Portfolio，多作者歸屬與隔離尚待資料模型擴充。

`site` and `journey` return a direct object or array; all four collections use the same five-field numbered pagination. There is no universal `data/meta/revision` envelope. `is_caching=true` opts into the `EnumCache.WEB` response cache; sessions and heartbeats use `EnumCache.SYS`. The current data belongs to one Portfolio, with multi-author ownership and isolation still to be modeled.

## 啟動與生命週期 / Startup and Lifespan

1. 匯入 `SYSTEM/extension.py` 時，從本機 `SYSTEM/config.yaml` 載入設定；`SYSTEM/settings.py` 整理 server、security、Redis 與資料庫設定。設定於模組匯入時讀取，修改 YAML 後須重啟程式。
   Importing `SYSTEM/extension.py` loads local `SYSTEM/config.yaml`; `SYSTEM/settings.py` derives server, security, Redis, and database settings. Configuration is read at import time, so changes to YAML require a restart.
2. `manage_fastapi.py` 建立 FastAPI、掛載 middleware、搜尋 `APPs/` 中的 `views` router、註冊本機 Swagger／ReDoc 與 Socket.IO 事件，最後以 Socket.IO ASGI wrapper 交給 Uvicorn。
   `manage_fastapi.py` builds FastAPI, mounts middleware, discovers `views` routers under `APPs/`, registers local Swagger/ReDoc and Socket.IO events, then passes a Socket.IO ASGI wrapper to Uvicorn.
3. FastAPI lifespan 依序註冊 async Redis clients、將 `EnumCache.WEB` 設為 FastAPICache backend，並建立單一 async SQLAlchemy engine。建立 client 或 engine 不會立即驗證 Redis／資料庫連線。
   The FastAPI lifespan registers async Redis clients, configures `EnumCache.WEB` as the FastAPICache backend, and creates one async SQLAlchemy engine, in that order. Client and engine construction do not verify service connectivity immediately.
4. HTTP 請求經過 CORS、heartbeat 與 session middleware，再進入文件頁、Portfolio 或 Sys 路由。`EnumCache.SYS` 用於 heartbeat 與 Redis session；Portfolio 的可選回應快取使用 `EnumCache.WEB`。
   HTTP requests pass through CORS, heartbeat, and session middleware before reaching docs, Portfolio, or Sys routes. `EnumCache.SYS` serves heartbeats and Redis sessions; optional Portfolio response caching uses `EnumCache.WEB`.
5. 正常關閉或啟動中途失敗時，lifespan 會 reset FastAPICache，並關閉資料庫 engine 與 Redis clients。啟動流程**不會**自動建立資料表或執行 migration。
   On normal shutdown or a startup failure, the lifespan resets FastAPICache and closes the database engine and Redis clients. Startup **does not** create tables or run migrations automatically.

## 目前的 GET API / Available GET APIs

六支 Portfolio API 都接受 `locale=en|zh-Hans|zh-Hant`（預設 `en`），以及 `is_caching`（預設 `false`）；設為 `true` 時可使用最多 60 秒的 Redis 回應快取。所有文字與技能標籤直接使用指定語言。

All six Portfolio APIs accept `locale=en|zh-Hans|zh-Hant` (default `en`) and `is_caching` (default `false`). Setting `is_caching=true` allows a Redis response cache for up to 60 seconds. Text and skill labels are returned directly in the selected language.

| Endpoint | 用途 / Purpose | 額外查詢參數 / Additional query | 回應 / Response |
| --- | --- | --- | --- |
| `GET /portfolio/site` | 品牌、個人介紹、社群連結與聯絡入口 / Site branding, profile, social links, and contact entry | 無 / None | `{brand, profile, social, chatme}` |
| `GET /portfolio/journey` | 供地圖與時間線使用的完整旅程，依儲存順序排列 / Complete ordered journey for the map and timeline | 無 / None | `JourneyItem[]` |
| `GET /portfolio/experiences` | 學經歷、內容、詳情及完整技能清單 / Work and education records with details and skills | `page=1`, `size=6`（固定 / fixed） | `{total, pages, page, size, items}` |
| `GET /portfolio/projects` | 專案介紹、完整詳情及技能 / Projects with introductions, full details, and skills | `page=1`, `size=6`（固定 / fixed） | `{total, pages, page, size, items}` |
| `GET /portfolio/skill-categories` | 技能分類；每類最多預覽 6 個技能 / Categories with up to six skill previews each | `page=1`, `size=6`（固定 / fixed） | `{items, total, pages, page, size}` |
| `GET /portfolio/skills` | 取得指定分類中的技能，亦可接續分類預覽 / Ordered skills in one category, including preview continuation | `ownerType=category`（預設 / default）, `ownerId`（必填 / required）, `page=1`, `size=6`（固定 / fixed） | `{items, total, pages, page, size}` |
| `GET /system/heartbeat` | 依近期心跳估算在線人數 / Estimated online count from recent heartbeats | `is_caching=false` | `{online: number}` |

`/site` 是單一物件，缺少站點內容回 404；`/journey` 一次回傳地圖需要的資料，沒有資料時回 `[]`。`/experiences` 與 `/projects` 每頁固定 6 筆，超過最後一頁時 `items` 為空；前者每筆提供完整技能字串陣列，後者包含完整專案詳情與技能。

`/site` is one object and returns 404 when site content is missing. `/journey` returns the full map dataset or `[]` when empty. `/experiences` and `/projects` use fixed six-item pages and return empty `items` beyond the last page; experience items include their complete skill labels, and project items include full details and skills.

所有分頁都繼承 `COMMON/schema/resp/resp_common.py` 的 `RespRecords[T]`，使用 `from_records(items, total=..., page=..., size=...)` 計算 `pages=ceil(total/size)`。回應固定為 `{items,total,pages,page,size}`；空集合 total=0、pages=0、items=[]，超頁保留請求頁碼與真實總數。公開 API 每頁固定 6 筆。

All paginated responses inherit `RespRecords[T]` from `COMMON/schema/resp/resp_common.py`. Use `from_records()` to compute pages consistently. The response is `{items,total,pages,page,size}`; empty collections use total=0 and pages=0, while out-of-range requests keep the requested page and actual totals. Public endpoints use size=6.

分類每項提供 `{id,label,skills}`，內層 skills 也使用同一五欄位模型，為該分類的第 1 頁技能預覽。`skills.items` 直接提供指定語言的 `{id,label}`，最多 6 筆；`skills.total` 與 `skills.pages` 描述完整技能集合。展開時以相同 locale、ownerId 呼叫 `/portfolio/skills?page=2&size=6`，之後逐頁續取。分類預覽使用視窗函式批次查詢，避免每類各查一次。

Each category contains `{id,label,skills}`. Its nested skills response uses the same five fields and represents page 1 of that category, with up to six localized `{id,label}` records. Continue through `/portfolio/skills?page=2&size=6` with the same locale and ownerId. Window functions batch preview queries across categories instead of querying each category separately.

`/system/heartbeat` 回傳近期心跳對應的估算人數，並非登入帳號或瀏覽器分頁數；設 `is_caching=true` 時最多快取 30 秒。語言、頁碼、size 或 owner 參數錯誤由 API 回傳對應 400；省略 `/skills` 必填的 `ownerId` 由 FastAPI 驗證回 422，找不到分類回 404。完整欄位與範例可在 `/swagger` 查看。

`/system/heartbeat` estimates recent visitors from heartbeats; it does not count logged-in accounts or browser tabs. `is_caching=true` allows up to 30 seconds of caching. Invalid language, page, size, or owner values return the relevant 400 response; an omitted required `/skills` `ownerId` returns FastAPI 422, and an unknown category returns 404. `/swagger` documents fields and examples.

前端的 React 重構規劃見[前端 README](../frontend/README.md)。正式串接時以本後端的 `/portfolio` 路徑、直接回應格式與 OpenAPI 為契約依據；參考前端與舊文件須核對實際版本，不能沿用過時的回應包裝或 `revision` 假設。

See the [frontend README](../frontend/README.md) for the React migration plan. Integration must follow this backend's `/portfolio` paths, direct response shapes, and OpenAPI contract. Check reference code and older documentation against their actual versions rather than assuming obsolete envelopes or `revision` checks.

## 設定與依賴 / Configuration and Dependencies

| 位置 / Location | 用途 / Purpose |
| --- | --- |
| `SYSTEM/config.yaml` | 本機執行設定；由 Git 忽略，不提交實際金鑰或連線資訊。 / Local runtime configuration, ignored by Git; do not commit secrets or connection details. |
| `SYSTEM/extension.py`、`SYSTEM/settings.py` | 載入 YAML 並整理應用設定。 / Load YAML and derive application settings. |
| `alembic.ini`、`SYSTEM/models/migrations/` | 指向 migration 環境與版本；Alembic 使用目前資料庫設定及 `SYSTEM/models` metadata。 / Migration location and revisions; Alembic uses the configured database and model metadata. |
| `pyproject.toml`、`uv.lock` | 宣告依賴與鎖定解析後版本。 / Declare dependencies and lock resolved versions. |

`SYSTEM/config.yaml` 至少需要非空的 `SECURITY.secret_key`，以及 `DATABASE.META` 的 `type`、`is_async: true`、`name`。目前支援 `sqlite` 與 `postgresql`；PostgreSQL 還需 `host`、`user`、`password`。儲存庫目前沒有可直接複製的公開設定範本。文件路徑由 `URL` 設定；未覆寫時 Swagger 是 `/swagger`、ReDoc 是 `/redoc`、OpenAPI 是 `/openapi`。實際監聽位址與埠號取決於本機設定。

`SYSTEM/config.yaml` requires a nonempty `SECURITY.secret_key` and `DATABASE.META` values for `type`, `is_async: true`, and `name`. The supported types are `sqlite` and `postgresql`; PostgreSQL also needs `host`, `user`, and `password`. There is no public copyable configuration template yet. Documentation paths come from `URL`; without overrides, Swagger is `/swagger`, ReDoc is `/redoc`, and OpenAPI is `/openapi`. The actual listening address and port depend on local settings.

使用 SQLite 時，相對的 `DATABASE.META.name` 會依 `SYSTEM/settings.py` 的 `DB_CONF["sqlite"]` 存放在 `SYSTEM/models/sqlite/`，缺少的資料夾會自動建立；`:memory:` 不建立檔案，絕對路徑則保留指定位置。FastAPI 與 Alembic 使用同一個路徑。

For SQLite, a relative `DATABASE.META.name` uses `DB_CONF["sqlite"]` in `SYSTEM/settings.py` and is stored under `SYSTEM/models/sqlite/`, which is created when needed. `:memory:` creates no file, while an absolute path keeps its specified location. FastAPI and Alembic use the same path.

| 依賴 / Dependencies | 角色 / Role |
| --- | --- |
| `fastapi`, `fastapi-utils`, `uvicorn[standard]`, `python-socketio` | HTTP API、CBV、ASGI server 與 Socket.IO / HTTP API, CBVs, ASGI server, and Socket.IO |
| `sqlalchemy[asyncio]`, `aiosqlite`, `asyncpg`, `alembic` | 非同步 ORM、SQLite／PostgreSQL 驅動與 migration / Async ORM, database drivers, and migrations |
| `redis`, `fastapi-cache2`, `starsessions` | Redis clients、WEB cache 與 session / Redis clients, WEB cache, and sessions |
| `fastapi-pagination` | 四種集合共用的 ORM 頁碼分頁工具 / Shared ORM numbered pagination for all four collections |
| `pydantic`, `pydantic-settings`, `pyyaml`, `httpx` | 資料與設定驗證、YAML 讀取及 HTTP client 設定 / Data and settings validation, YAML loading, and HTTP client settings |
| `jinja2` | 已宣告的模板依賴；目前文件頁使用本機靜態資產。 / Declared template dependency; current docs pages use local static assets. |
| `black`, `pytest` | 開發依賴：排版與測試 / Development dependencies: formatting and tests |

## 本機操作 / Local Workflow

使用 Python 3.13 以上版本。在專案根目錄進入 `backend/` 後安裝依賴。先執行 Alembic migration，再啟動伺服器；資料表不由 FastAPI 啟動流程建立。

Use Python 3.13 or later. From the repository root, enter `backend/` and install dependencies. Apply the Alembic migration before starting the server; FastAPI startup does not create tables.

```bash
cd backend
uv sync
uv run alembic upgrade head
uv run manage_fastapi.py
```

`uv run alembic current` 可查看目前 migration 版本。`test.py` 可將相鄰 `portfolio-web/mock` 的英文、繁體中文與簡體中文資料匯入**已遷移且作品集表皆為空**的資料庫；來源不在本儲存庫，也可用 `--mock-dir` 指定。匯入工具不建立登入帳號。

`uv run alembic current` shows the current migration revision. `test.py` imports English, Traditional Chinese, and Simplified Chinese data from a sibling `portfolio-web/mock` into a **migrated database with empty portfolio tables**. That source is outside this repository and can be replaced with `--mock-dir`. The importer does not create a login account.

`uv` 產生的 `backend` console script 目前仍指向 `src/backend` 範例，不會啟動 API；請使用 `uv run manage_fastapi.py`。目前有 Portfolio 技能 API、CBV、SQLAlchemy 與 Redis 的回歸測試。`tests/test_database_core.py` 的舊 fixture 尚未配合目前單一資料庫 manager 更新，單獨執行也會因缺少設定欄位失敗。

The generated `backend` console script still points to the `src/backend` sample and does not start the API; use `uv run manage_fastapi.py`. Regression tests cover Portfolio skills, CBVs, SQLAlchemy, and Redis. The old `tests/test_database_core.py` fixture has not been updated for the current single-database manager and fails independently because its test settings omit required fields.

可單獨執行目前適用的回歸測試：

Run the currently applicable regression tests with:

```bash
uv run pytest -q tests/test_fastapi_cbv.py tests/test_portfolio_skills.py tests/test_sqlalchemy_tools.py tests/test_redis_tools.py
```

## 分頁與技能方法索引 / Pagination and Skill Reference

| 類別／方法 / Class or method | 參數 / Parameters | 職責與回傳 / Responsibility and result |
| --- | --- | --- |
| `RespRecords[T]` | items、total、pages、page、size | 共用 typed response；items 必為陣列，總數和頁數非負、頁碼和容量為正 / Shared typed response with required items and numeric bounds. |
| `RespRecords.from_records()` | items；keyword-only total、page、size | 計算 pages，建立回應；size ≤ 0 回 ValueError / Compute page count and build the response; reject nonpositive size. |
| `parser_pagination()` | page=1、size=6 | 驗證正頁碼與固定容量；回傳 dict / Validate page and fixed capacity, return a dictionary. |
| `parser_portfolio_skill_categories()` | locale、pagination | 合併語系與共用頁碼參數 / Combine locale and shared pagination. |
| `parser_portfolio_skills()` | locale、pagination、owner_type、owner_id | 合併參數，限定 category 並驗證非空 ownerId / Validate category ownership and combine parameters. |
| `PortfolioSkillsModule.__init__()` | locale、page、size、owner_type?、owner_id? | 建立分類與技能共用查詢上下文 / Initialize query context for categories and skills. |
| `PortfolioSkillsModule._skill_query()` | 無 / None | 組裝指定語言的技能關聯查詢 / Build the localized skill membership query. |
| `PortfolioSkillsModule.select_categories()` | 無 / None | 回傳分類頁與批次取得的 skills 第 1 頁 / Return category pagination and batched nested skill previews. |
| `PortfolioSkillsModule.select_skills()` | 無 / None | 驗證分類存在，回傳有序技能頁 / Check category existence and return ordered skill pagination. |
| `PortfolioExperiencesModule.select()`、`PortfolioProjectsModule.select()` | 無 / None | ORM 分頁後以共用 from_records 建立回應 / Build the shared response after ORM pagination. |
| `PortfolioSkills.get_skill_categories()`、`PortfolioSkills.get_skills()` | FastAPI Depends 注入 parser 及 is_caching / Injected parser and cache settings | 宣告 HTTP schema，委派 module 執行 / Declare HTTP schemas and delegate business queries. |

`RespPortfolioExperiences`、`RespPortfolioProjects`、`RespPortfolioSkills`、`RespPortfolioSkillCategories` 僅特化共用模型的 item 型別；`RespPortfolioSkillCategoryItem.skills` 直接使用 `RespPortfolioSkills`。分頁欄位不得在各 API 重複宣告或計算。

The four resource responses specialize only the item type of the shared model. Category skills directly use `RespPortfolioSkills`; keep pagination fields and arithmetic in the common response.
