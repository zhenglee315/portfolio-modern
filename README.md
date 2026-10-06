# portfolio-modern

現代化的個人檔案系統，以結構化方式組織與呈現個人介紹、學經歷、旅程、專案經驗與技能，並提供英文、簡體中文、繁體中文內容 API。

A modern personal profile system that organizes profile information, education and work experience, journeys, projects, and skills through structured data and serves content in English, Simplified Chinese, and Traditional Chinese.

本專案以 **輕量化開發與部署** 為目標：依實際功能引入依賴，控制常駐服務與資源使用，維持清楚、容易理解的模組結構。

The project aims for **lightweight development and deployment**: add dependencies as features require them, control resource usage and persistent services, and keep the module structure clear.

**後端已有公開讀取 API；前端開發環境與應用基線已完成。** `backend/` 放置後端程式；`frontend/` 使用 React Router Framework Mode、React 與 TypeScript，準備重構既有 `portfolio-web`，細節見[前端 README](frontend/README.md)。

**The backend has public read APIs; the frontend development baseline is ready.** `backend/` contains backend code. `frontend/` uses React Router Framework Mode, React, and TypeScript for the migration of `portfolio-web`; see the [frontend README](frontend/README.md).

## 目前進度 / Current status

- 已完成 FastAPI 啟動入口、六支公開 Portfolio GET API、線上人數診斷 API，以及本機 Swagger／ReDoc。
- 後端使用單一非同步 SQLite 或 PostgreSQL 連線管理器；Redis 用於 session、心跳與可選的 HTTP 快取。
- 已建立作品集與帳號 ORM 模型、初版 Alembic migration 及三語 mock 匯入腳本；migration 須手動執行，登入與寫入 API 尚未實作。
- 已初始化 React Router、React、TypeScript、Bootstrap 樣式與圖示，完成 Provider、三語路由、預先渲染、開發 proxy 與檢查工具；版型遷移及業務 API 串接尚未實作。

- The backend has a FastAPI entry point, six public Portfolio GET APIs, an online-count diagnostic endpoint, and local Swagger/ReDoc.
- One async connection manager supports SQLite or PostgreSQL; Redis supplies sessions, heartbeats, and optional HTTP response caching.
- Portfolio and account ORM models, an initial Alembic migration, and a three-language mock importer are present. Migrations run manually; login and write APIs are not implemented.
- The frontend has React Router, React, TypeScript, Bootstrap styles and icons, providers, locale routes, pre-rendering, a development proxy, and verification tools. Design migration and business API integration are pending.

## 技術選擇 / Technology choices

| 項目 / Tool | 用途 | Purpose |
| --- | --- | --- |
| Python | 目前宣告支援 Python 3.13 以上 | Currently declares Python 3.13 or later |
| uv | Python 專案、依賴、虛擬環境與鎖定檔管理 | Python project, dependency, environment, and lockfile management |
| FastAPI | API 框架 | API framework |
| Uvicorn | ASGI 伺服器，採用 `uvicorn[standard]` | ASGI server with the `standard` extras |
| Pydantic | 請求與回應資料驗證 | Request and response validation |
| pydantic-settings | 環境設定讀取與驗證 | Environment configuration loading and validation |
| SQLAlchemy | ORM 與資料庫操作，包含 asyncio 額外依賴 | ORM and database operations with asyncio extras |
| Alembic | 資料庫結構版本管理 | Database schema migrations |
| redis、fastapi-cache2 | Redis client 與 WEB cache；GET API 可透過 `is_caching=true` 使用回應快取 | Redis clients and WEB cache; GET APIs can opt into response caching with `is_caching=true` |
| fastapi-utils | CBV 路由寫法 | Class-based view routing |
| python-socketio | Socket.IO ASGI 組裝 | Socket.IO ASGI assembly |
| HTTPX | HTTP client 設定，執行依賴 | HTTP client configuration; runtime dependency |
| Black | Python 排版，開發依賴 | Python formatter; development dependency |
| pytest | 測試工具，開發依賴 | Test runner; development dependency |
| Docker | 按需啟動外部服務、容器驗證或部署 | On-demand external services, container validation, or deployment |
| React Router Framework Mode、React、TypeScript、Vite | 已初始化的前端路由、畫面與建置 | Initialized frontend routing, UI, and build tools |
| Bootstrap、React-Bootstrap、Bootstrap Icons | 樣式、React 元件與 SVG 圖示 | Styles, React components, and SVG icons |

具體依賴宣告見 [backend/pyproject.toml](backend/pyproject.toml)，解析後版本以 `backend/uv.lock` 為準；前端依賴見 [frontend/package.json](frontend/package.json) 與 `frontend/package-lock.json`。

Dependency declarations are in [backend/pyproject.toml](backend/pyproject.toml); resolved versions are recorded in `backend/uv.lock`. Frontend dependencies are recorded in [frontend/package.json](frontend/package.json) and `frontend/package-lock.json`.

目前的 `ConnectionManager` 支援單一非同步 SQLite 或 PostgreSQL engine，並提供每次操作新建的 `AsyncSession`。`asyncpg` 與 `aiosqlite` 都是正式依賴。`SYSTEM/models/` 定義 ORM 模型，Alembic 使用其 metadata；安裝 Python 用戶端套件不代表已安裝或啟動資料庫、Redis 服務。

`ConnectionManager` supports one async SQLite or PostgreSQL engine and returns a fresh `AsyncSession` for each operation. Both `asyncpg` and `aiosqlite` are runtime dependencies. `SYSTEM/models/` defines the ORM models whose metadata Alembic uses. Installing Python clients does not install or start database or Redis services.

## 輕量化原則 / Lightweight development principles

- 日常在 macOS 以 uv 虛擬環境直接開發 FastAPI，Docker 按需啟動。
- WEB cache 由 Redis 提供；讀取 API 透過 `is_caching` 選擇是否使用短時間回應快取。
- 初期採單一後端服務，避免預先拆分微服務或引入多套排程、訊息佇列系統。
- 部署時依實測負載調整 worker、資料庫連線池與快取上限，避免直接套用大型專案設定。
- 開發工具與正式執行依賴分開管理。
- 共用能力按實際重用需求抽取，避免為簡單功能建立過多抽象層。

- Develop FastAPI directly on macOS in a uv virtual environment; start Docker only when needed.
- Redis provides WEB cache; read APIs use `is_caching` to opt into short-lived response caching.
- Start with one backend service, without prematurely introducing microservices, multiple schedulers, or message queues.
- Tune workers, connection pools, and cache limits using measured workloads instead of copying settings from larger systems.
- Manage development tools separately from runtime dependencies.
- Extract shared functionality when reuse is justified; keep simple features free of unnecessary abstraction.

## 專案架構 / Project architecture

以下顯示目前主要的程式模組與前端基線。後端實作細節見[後端 README](backend/README.md)，前端的目錄、責任與開發規範見[前端 README](frontend/README.md)。

The tree shows current backend modules and frontend baseline. See the [backend README](backend/README.md) for implementation details and the [frontend README](frontend/README.md) for the layout, responsibilities, and development standards.

```text
portfolio-modern/
├── README.md
├── frontend/
│   ├── README.md                 # Frontend architecture and development guide
│   ├── src/                      # App, routes, pages, features, shared, i18n
│   ├── tests/                    # Unit/component and browser verification
│   ├── package.json / package-lock.json
│   └── react-router.config.ts / vite.config.ts / tsconfig.json
└── backend/
    ├── APPs/
    │   ├── Portfolio/            # Six public content GET APIs
    │   │   ├── views_portfolio.py
    │   │   ├── module/
    │   │   └── schema/
    │   └── Sys/                  # Online-count diagnostic API
    ├── COMMON/
    │   ├── decorator/
    │   ├── schema/               # Shared help, parsers, responses
    │   └── tools/storage/        # Redis and SQLAlchemy helpers
    ├── SYSTEM/
    │   ├── config.yaml           # Local, ignored by Git
    │   ├── settings.py
    │   ├── lifespan.py
    │   ├── database/             # Async DB and Redis connection manager
    │   ├── models/               # Portfolio, auth, Alembic migrations
    │   ├── middleware/
    │   ├── static/               # Local Swagger/ReDoc assets
    │   └── tools/                # Router, docs, Socket.IO assembly
    ├── manage_fastapi.py
    ├── test.py                   # Three-language mock importer
    ├── alembic.ini
    ├── pyproject.toml
    └── uv.lock
```

- `APPs`：按 Portfolio 與 Sys 模組組織 API。`views` 定義 CBV 路由，`schema` 解析參數及驗證回應，`module` 執行業務查詢。
- `COMMON`：跨模組共用的裝飾器、例外、資料格式與工具。
- `SYSTEM`：系統設定、路由定義、生命週期、資料庫基礎設施與 middleware。
- `SYSTEM/models`：作品集與帳號的 ORM 模型，以及 Alembic migration；資料表需手動遷移。
- `manage_fastapi.py`：目前的 FastAPI、文件與 Socket.IO 組裝及啟動入口。

- `APPs`: Portfolio and Sys APIs. `views` declares CBV routes, `schema` parses parameters and validates responses, and `module` runs business queries.
- `COMMON`: Decorators, exceptions, schemas, and utilities shared across modules.
- `SYSTEM`: Configuration, route definitions, lifecycle management, database infrastructure, and middleware.
- `SYSTEM/models`: Portfolio and account ORM models and Alembic migrations; apply migrations manually.
- `manage_fastapi.py`: The current FastAPI, docs, and Socket.IO assembly and startup entry point.

`backend/SYSTEM/config.yaml` 是不提交的本機配置；`backend/SYSTEM/settings.py` 負責整理設定。啟動步驟與資料流見[後端 README](backend/README.md)；工具的詳細介面見各工具資料夾的 README。

`backend/SYSTEM/config.yaml` is a local configuration file excluded from Git, and `backend/SYSTEM/settings.py` organizes its values. See the [backend README](backend/README.md) for startup steps and request flow; each tool folder documents its detailed API in its own README.

## API 範圍 / API scope

後端已提供以下六支公開讀取 API，另有一支系統診斷 API：

The backend exposes six public read APIs and one system diagnostic API:

| 路徑 / Endpoint | 內容 | Content |
| --- | --- | --- |
| `GET /portfolio/site` | 品牌、個人介紹、社群與聯絡入口 | Brand, profile, social links, and contact entry |
| `GET /portfolio/journey` | 完整旅程與地圖資料 | Complete journey and map data |
| `GET /portfolio/experiences` | 學經歷與技能，每頁 6 筆 | Education/work experience and skills, six per page |
| `GET /portfolio/projects` | 專案、完整詳情與技能，每頁 6 筆 | Projects with full details and skills, six per page |
| `GET /portfolio/skill-categories` | 技能分類頁碼分頁；每類包含最多 6 個技能的內層 skills 分頁 | Numbered categories with nested skill preview pages |
| `GET /portfolio/skills` | 指定分類下的技能頁碼分頁 | Numbered skills in one category |
| `GET /system/heartbeat` | 依近期心跳估算目前在線人數 | Estimated online count from recent heartbeats |

Portfolio API 以 `locale=en` 為預設，另支援 `zh-Hans`、`zh-Hant`；六支 GET 均可透過 `is_caching=true` 啟用短時間回應快取。目前只有單份 Portfolio，未建立多作者資料隔離；登入、管理後台、寫入與上傳功能尚未實作。參數與回應格式見[後端 README](backend/README.md)。

Portfolio APIs default to `locale=en` and also support `zh-Hans` and `zh-Hant`. All six GETs can opt into short-lived response caching with `is_caching=true`. The backend currently serves one Portfolio; multi-author isolation, login, administration, write operations, and uploads are not implemented. See the [backend README](backend/README.md) for parameters and response shapes.

## 後端本機開發 / Local backend development

在專案根目錄執行：

Run from the repository root:

```bash
cd backend
uv sync
```

`uv sync` 會同步專案虛擬環境與依賴，預設包含開發依賴。

`uv sync` synchronizes the project environment and dependencies, including development dependencies by default.

新增正式依賴與開發依賴的方式：

To add runtime or development dependencies, replace the placeholders below with package names:

```bash
uv add <package-name>
uv add --dev <development-tool-name>
```

以上 `<package-name>` 與 `<development-tool-name>` 為佔位符，執行前請替換為實際套件名稱。

在 VS Code 選擇 `backend/.venv/bin/python` 作為 Python interpreter；終端機也可手動啟用環境：

Select `backend/.venv/bin/python` as the Python interpreter in VS Code. You can also activate the environment manually in a terminal:

```bash
# 於 backend 目錄執行 / Run inside backend
source .venv/bin/activate
python -c "import sys; print(sys.executable)"
```

不手動啟用環境時，可使用 `uv run` 執行專案指令。例如檢查 Python 排版：

Use `uv run` to execute project commands without manually activating the environment. For example, check Python formatting:

```bash
uv run black --check .
```

在 `backend/` 建立私有的 `SYSTEM/config.yaml` 後，先執行 `uv run alembic upgrade head`，再以 `uv run manage_fastapi.py` 啟動伺服器。設定中至少要有非空的 `SECURITY.secret_key` 和 `DATABASE.META` 的 `type`、`is_async`、`name`；預設文件路徑為 `/swagger`。目前 `backend` console script 仍是 uv 範例，不會啟動 API。

After creating a private `SYSTEM/config.yaml` inside `backend/`, run `uv run alembic upgrade head`, then start the server with `uv run manage_fastapi.py`. Configure a nonempty `SECURITY.secret_key` and `DATABASE.META` values for `type`, `is_async`, and `name`; the default docs path is `/swagger`. The `backend` console script still runs the generated uv example rather than the API.

## 前端本機開發 / Local frontend development

使用 Node.js 24 與 npm，在專案根目錄執行：

Use Node.js 24 and npm. From the repository root:

```bash
cd frontend
npm ci
npm run dev
```

開發頁面位於 `http://127.0.0.1:5173`，支援 `/`、`/en`、`/zh-Hans` 與 `/zh-Hant`。`npm run check` 執行型別、lint、格式、單元測試與建置。瀏覽器測試需先執行 `npx playwright install chromium`，再執行 `npm run test:e2e`。目前頁面為啟動基線；API、proxy、靜態交付與模組規範見[前端 README](frontend/README.md)。

Development runs at `http://127.0.0.1:5173` with four public locale URLs. Run `npm run check` for standard checks and builds. Install Chromium with `npx playwright install chromium` before `npm run test:e2e`. The current page is a bootstrap baseline; see the frontend README for API configuration, static delivery, and module standards.

## 文件與版本控制 / Documentation and version control

- 本儲存庫為公開專案；公開文件僅記錄架構、通用開發流程與不含敏感值的設定示例。
- 不在公開文件記錄實際伺服器配置、識別資訊、網路位址、登入資訊、金鑰或憑證。
- 本機工作筆記、暫存資料與私有部署紀錄統一存放於根目錄 `agent/`，該目錄已由 `.gitignore` 排除。
- `pyproject.toml` 與 `uv.lock` 納入版本控制；虛擬環境、真實環境設定與機密不提交。

- This is a public repository. Public documentation covers architecture, general development workflows, and configuration examples without sensitive values.
- Keep actual server specifications, identifiers, network addresses, login details, keys, and credentials out of public documentation.
- Local working notes, temporary files, and private deployment records belong in the root `agent/` directory, which is excluded by `.gitignore`.
- Track `pyproject.toml` and `uv.lock`; do not commit virtual environments, actual environment configuration, or secrets.

## 授權 / License

本專案採 MIT License。

This project is licensed under the MIT License.
