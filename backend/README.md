# 後端總覽 / Backend Overview

本目錄是個人檔案系統的 FastAPI 後端。`APPs` 放業務 API，`COMMON` 放共用工具，`SYSTEM` 負責設定、模型、資料庫、middleware 與應用生命週期。整體產品方向見[專案 README](../README.md)。

This directory contains the FastAPI backend for the personal profile system. `APPs` holds business APIs, `COMMON` holds shared tools, and `SYSTEM` owns configuration, models, the database, middleware, and the application lifecycle. See the [project README](../README.md) for the product overview.

目前已建立應用入口、SQLite／PostgreSQL 非同步資料庫架構、Redis 快取與 session、Socket.IO 組裝、ORM 模型及初版 Alembic migration。業務 API 與登入流程尚未實作；可開啟 API 文件，但文件頁不代表業務端點已完成。

The application entry point, async SQLite/PostgreSQL infrastructure, Redis cache and sessions, Socket.IO assembly, ORM models, and an initial Alembic migration are present. Business APIs and login are not implemented yet. The API documentation is available, but it does not imply that business endpoints exist.

## 目錄結構 / Directory Layout

下列是目前的主要檔案與資料夾；省略 package 標記、靜態資產細項與虛擬環境。

The tree shows the main files and directories currently present; package markers, individual static assets, and the virtual environment are omitted.

```text
backend/
├── APPs/                         # 業務路由位置 / business routes (not implemented yet)
├── COMMON/
│   ├── decorator/                # 共用 decorator / shared decorators
│   ├── schema/                   # 共用資料格式 / shared schemas
│   └── tools/
│       ├── storage/
│       │   ├── redis/            # Redis 操作工具 / Redis helpers
│       │   └── sqlalchemy/       # SQLAlchemy CRUD 工具與 README
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
│   ├── models/                   # 作品集與帳號模型 / portfolio and account models
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

新增工具時，詳細方法、參數與用法寫在該工具資料夾的 README。現有文件：[SQLAlchemy 工具](COMMON/tools/storage/sqlalchemy/README.md)、[Redis 工具](COMMON/tools/storage/redis/README.md)。這份 README 只維護後端整體架構與操作入口。

When adding a tool, document its methods, parameters, and usage in that tool folder's README. See the [SQLAlchemy](COMMON/tools/storage/sqlalchemy/README.md) and [Redis](COMMON/tools/storage/redis/README.md) tool guides. This README covers only the backend architecture and operational entry points.

## 啟動與生命週期 / Startup and Lifespan

1. 匯入 `SYSTEM/extension.py` 時，從本機 `SYSTEM/config.yaml` 載入設定；`SYSTEM/settings.py` 整理 server、security、Redis 與資料庫設定。設定於模組匯入時讀取，修改 YAML 後須重啟程式。
   Importing `SYSTEM/extension.py` loads local `SYSTEM/config.yaml`; `SYSTEM/settings.py` derives server, security, Redis, and database settings. Configuration is read at import time, so changes to YAML require a restart.
2. `manage_fastapi.py` 建立 FastAPI、掛載 middleware、搜尋 `APPs/` 中的 `views` router、註冊本機 Swagger／ReDoc 與 Socket.IO 事件，最後以 Socket.IO ASGI wrapper 交給 Uvicorn。
   `manage_fastapi.py` builds FastAPI, mounts middleware, discovers `views` routers under `APPs/`, registers local Swagger/ReDoc and Socket.IO events, then passes a Socket.IO ASGI wrapper to Uvicorn.
3. FastAPI lifespan 依序註冊 async Redis clients、將 `EnumCache.WEB` 設為 FastAPICache backend，並建立單一 async SQLAlchemy engine。建立 client 或 engine 不會立即驗證 Redis／資料庫連線。
   The FastAPI lifespan registers async Redis clients, configures `EnumCache.WEB` as the FastAPICache backend, and creates one async SQLAlchemy engine, in that order. Client and engine construction do not verify service connectivity immediately.
4. HTTP 請求經過 CORS、heartbeat 與 session middleware，再進入文件頁或路由。`EnumCache.SYS` 用於 heartbeat 與 Redis session；業務 API 目前尚未加入。
   HTTP requests pass through CORS, heartbeat, and session middleware before reaching documentation or routes. `EnumCache.SYS` serves heartbeat and Redis sessions; business APIs have not been added yet.
5. 正常關閉或啟動中途失敗時，lifespan 會 reset FastAPICache，並關閉資料庫 engine 與 Redis clients。啟動流程**不會**自動建立資料表或執行 migration。
   On normal shutdown or a startup failure, the lifespan resets FastAPICache and closes the database engine and Redis clients. Startup **does not** create tables or run migrations automatically.

## 設定與依賴 / Configuration and Dependencies

| 位置 / Location | 用途 / Purpose |
| --- | --- |
| `SYSTEM/config.yaml` | 本機執行設定；由 Git 忽略，不提交實際金鑰或連線資訊。 / Local runtime configuration, ignored by Git; do not commit secrets or connection details. |
| `SYSTEM/extension.py`、`SYSTEM/settings.py` | 載入 YAML 並整理應用設定。 / Load YAML and derive application settings. |
| `alembic.ini`、`SYSTEM/models/migrations/` | 指向 migration 環境與版本；Alembic 使用目前資料庫設定及 `SYSTEM/models` metadata。 / Migration location and revisions; Alembic uses the configured database and model metadata. |
| `pyproject.toml`、`uv.lock` | 宣告依賴與鎖定解析後版本。 / Declare dependencies and lock resolved versions. |

`SYSTEM/config.yaml` 至少需要非空的 `SECURITY.secret_key`，以及 `DATABASE.META` 的 `type`、`is_async: true`、`name`。目前支援 `sqlite` 與 `postgresql`；PostgreSQL 還需 `host`、`user`、`password`。儲存庫目前沒有可直接複製的公開設定範本。文件路徑由 `URL` 設定；未覆寫時 Swagger 是 `/swagger`、ReDoc 是 `/redoc`、OpenAPI 是 `/openapi`。實際監聽位址與埠號取決於本機設定。

`SYSTEM/config.yaml` requires a nonempty `SECURITY.secret_key` and `DATABASE.META` values for `type`, `is_async: true`, and `name`. The supported types are `sqlite` and `postgresql`; PostgreSQL also needs `host`, `user`, and `password`. There is no public copyable configuration template yet. Documentation paths come from `URL`; without overrides, Swagger is `/swagger`, ReDoc is `/redoc`, and OpenAPI is `/openapi`. The actual listening address and port depend on local settings.

| 依賴 / Dependencies | 角色 / Role |
| --- | --- |
| `fastapi`, `uvicorn[standard]`, `python-socketio` | HTTP API、ASGI server 與 Socket.IO / HTTP API, ASGI server, and Socket.IO |
| `sqlalchemy[asyncio]`, `aiosqlite`, `asyncpg`, `alembic` | 非同步 ORM、SQLite／PostgreSQL 驅動與 migration / Async ORM, database drivers, and migrations |
| `redis`, `fastapi-cache2`, `starsessions` | Redis clients、WEB cache 與 session / Redis clients, WEB cache, and sessions |
| `fastapi-pagination` | 共用資料查詢分頁 / Pagination for shared database helpers |
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

`uv` 產生的 `backend` console script 目前仍指向 `src/backend` 範例，不會啟動 API；請使用 `uv run manage_fastapi.py`。現行 SQLAlchemy 工具測試在 `tests/test_sqlalchemy_tools.py`；`tests/test_database_core.py` 仍針對舊版多資料庫 manager，尚待改寫。

The generated `backend` console script still points to the `src/backend` sample and does not start the API; use `uv run manage_fastapi.py`. Current SQLAlchemy helper tests are in `tests/test_sqlalchemy_tools.py`; `tests/test_database_core.py` still targets the former multi-database manager and awaits a rewrite.
