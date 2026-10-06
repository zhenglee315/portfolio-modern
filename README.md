# portfolio-modern

現代化的個人檔案系統，以結構化方式組織與呈現個人介紹、學經歷、旅程、專案經驗與技能，並提供英文、簡體中文、繁體中文內容 API。

A modern personal profile system that organizes profile information, education and work experience, journeys, projects, and skills through structured data and serves content in English, Simplified Chinese, and Traditional Chinese.

本專案以 **輕量化開發與部署** 為目標：依實際功能引入依賴，控制常駐服務與資源使用，維持清楚、容易理解的模組結構。

The project aims for **lightweight development and deployment**: add dependencies as features require them, control resource usage and persistent services, and keep the module structure clear.

**後端公開讀取 API 與 React 前端功能已實作。** `backend/` 放置後端程式；`frontend/` 使用 React Router Framework Mode、React 與 TypeScript，已重構既有 `portfolio-web`，細節見[前端 README](frontend/README.md)。

**Public read APIs and the React frontend are implemented.** `backend/` contains backend code. `frontend/` uses React Router Framework Mode, React, and TypeScript for the completed feature migration of `portfolio-web`; see the [frontend README](frontend/README.md).

## 目前進度 / Current status

- 已完成 FastAPI 啟動入口、六支公開 Portfolio GET API、線上人數診斷 API，以及本機 Swagger／ReDoc。
- 後端使用單一非同步 SQLite 或 PostgreSQL 連線管理器；Redis 用於 session、心跳與可選的 HTTP 快取。
- 已建立作品集與帳號 ORM 模型、初版 Alembic migration 及三語 mock 匯入腳本；migration 須手動執行，登入與寫入 API 尚未實作。
- React Router、React、TypeScript、Bootstrap 樣式與图示已完成版型及六 API 整合，包含三語、經歷／專案／技能分頁、地圖播放、詳情、外觀與聯絡互動；四 URL 靜態內容、區段容錯與正式檢查工具可使用。

- The backend has a FastAPI entry point, six public Portfolio GET APIs, an online-count diagnostic endpoint, and local Swagger/ReDoc.
- One async connection manager supports SQLite or PostgreSQL; Redis supplies sessions, heartbeats, and optional HTTP response caching.
- Portfolio and account ORM models, an initial Alembic migration, and a three-language mock importer are present. Migrations run manually; login and write APIs are not implemented.
- The React frontend integrates six APIs with three languages, numbered collections, maps/playback, detail dialogs, appearance and contact interactions. Four static URLs, independent fault recovery and verification tooling are available.

## 技術選擇 / Technology choices

| 項目 / Tool                                          | 用途                                                                     | Purpose                                                                                    |
| ---------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Python                                               | 目前宣告支援 Python 3.13 以上                                            | Currently declares Python 3.13 or later                                                    |
| uv                                                   | Python 專案、依賴、虛擬環境與鎖定檔管理                                  | Python project, dependency, environment, and lockfile management                           |
| FastAPI                                              | API 框架                                                                 | API framework                                                                              |
| Uvicorn                                              | ASGI 伺服器，採用 `uvicorn[standard]`                                    | ASGI server with the `standard` extras                                                     |
| Pydantic                                             | 請求與回應資料驗證                                                       | Request and response validation                                                            |
| pydantic-settings                                    | 環境設定讀取與驗證                                                       | Environment configuration loading and validation                                           |
| SQLAlchemy                                           | ORM 與資料庫操作，包含 asyncio 額外依賴                                  | ORM and database operations with asyncio extras                                            |
| Alembic                                              | 資料庫結構版本管理                                                       | Database schema migrations                                                                 |
| redis、fastapi-cache2                                | Redis client 與 WEB cache；GET API 可透過 `is_caching=true` 使用回應快取 | Redis clients and WEB cache; GET APIs can opt into response caching with `is_caching=true` |
| fastapi-utils                                        | CBV 路由寫法                                                             | Class-based view routing                                                                   |
| python-socketio                                      | Socket.IO ASGI 組裝                                                      | Socket.IO ASGI assembly                                                                    |
| HTTPX                                                | HTTP client 設定，執行依賴                                               | HTTP client configuration; runtime dependency                                              |
| Black                                                | Python 排版，開發依賴                                                    | Python formatter; development dependency                                                   |
| pytest                                               | 測試工具，開發依賴                                                       | Test runner; development dependency                                                        |
| Docker                                               | 按需啟動外部服務、容器驗證或部署                                         | On-demand external services, container validation, or deployment                           |
| React Router Framework Mode、React、TypeScript、Vite | 已初始化的前端路由、畫面與建置                                           | Initialized frontend routing, UI, and build tools                                          |
| Bootstrap、React-Bootstrap、Bootstrap Icons          | 樣式、React 元件與 SVG 圖示                                              | Styles, React components, and SVG icons                                                    |

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

以下顯示目前主要的程式模組與前端模組。後端實作細節見[後端 README](backend/README.md)，前端的目錄、責任與開發規範見[前端 README](frontend/README.md)。

The tree shows current backend modules and frontend modules. See the [backend README](backend/README.md) for implementation details and the [frontend README](frontend/README.md) for the layout, responsibilities, and development standards.

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
    │   ├── config.yaml           # Published development defaults; replace production secrets
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

`backend/SYSTEM/config.yaml` 提供可提交的開發預設配置；`backend/SYSTEM/settings.py` 負責整理設定。正式環境須使用私有配置替換 `SECURITY.secret_key` 與服務連線值，實際機密不回寫公開儲存庫。前端共用模組的介面與範例見[共用模組 SPEC](frontend/src/shared/README.md)，後端啟動與各工具規格見[後端 README](backend/README.md)。

`backend/SYSTEM/config.yaml` contains published development defaults, organized by `backend/SYSTEM/settings.py`. Production replaces the signing key and connection values through a private configuration file without committing secrets. See the [shared module specification](frontend/src/shared/README.md) for frontend interfaces and examples, and the [backend README](backend/README.md) for startup and backend tools.

## API 範圍 / API scope

後端已提供以下六支公開讀取 API，另有一支系統診斷 API：

The backend exposes six public read APIs and one system diagnostic API:

| 路徑 / Endpoint                   | 內容                                                      | Content                                             |
| --------------------------------- | --------------------------------------------------------- | --------------------------------------------------- |
| `GET /portfolio/site`             | 品牌、個人介紹、社群與聯絡入口                            | Brand, profile, social links, and contact entry     |
| `GET /portfolio/journey`          | 完整旅程與地圖資料                                        | Complete journey and map data                       |
| `GET /portfolio/experiences`      | 學經歷與技能，每頁 6 筆                                   | Education/work experience and skills, six per page  |
| `GET /portfolio/projects`         | 專案、完整詳情與技能，每頁 6 筆                           | Projects with full details and skills, six per page |
| `GET /portfolio/skill-categories` | 技能分類頁碼分頁；每類包含最多 6 個技能的內層 skills 分頁 | Numbered categories with nested skill preview pages |
| `GET /portfolio/skills`           | 指定分類下的技能頁碼分頁                                  | Numbered skills in one category                     |
| `GET /system/heartbeat`           | 依近期心跳估算目前在線人數                                | Estimated online count from recent heartbeats       |

Portfolio API 以 `locale=en` 為預設，另支援 `zh-Hans`、`zh-Hant`；六支 GET 均可透過 `is_caching=true` 啟用短時間回應快取。目前只有單份 Portfolio，未建立多作者資料隔離；登入、管理後台、寫入與上傳功能尚未實作。參數與回應格式見[後端 README](backend/README.md)。

Portfolio APIs default to `locale=en` and also support `zh-Hans` and `zh-Hant`. All six GETs can opt into short-lived response caching with `is_caching=true`. The backend currently serves one Portfolio; multi-author isolation, login, administration, write operations, and uploads are not implemented. See the [backend README](backend/README.md) for parameters and response shapes.

## 從乾淨 checkout 安裝 / Install from a Fresh Checkout

先安裝 Git、[uv](https://docs.astral.sh/uv/getting-started/installation/)、[Node.js 24](https://nodejs.org/en/download) 與 Redis。Python 基線為 3.13（`.python-version`），前端基線為 Node.js 24.21.0／npm 11.19.0（`frontend/.node-version`、`packageManager`）；Python 套件與 npm 套件分別由鎖定檔重建。SQLite driver 隨 Python 依賴安裝，使用預設 SQLite 不需要另啟資料庫服務；Redis 則須獨立啟動。

Install Git, uv, Node.js 24 and Redis first. The repository pins Python 3.13 and the frontend baseline of Node.js 24.21.0/npm 11.19.0. Lockfiles reproduce package dependencies. The default SQLite backend needs no separate database service, while Redis must run independently.

```bash
git clone https://github.com/zhenglee315/portfolio-modern.git
cd portfolio-modern
```

接著依序完成後端服務與資料初始化，再在另一個終端機啟動前端。完整後端說明見[後端安裝步驟](backend/README.md)，前端環境與部署說明見[前端安裝步驟](frontend/README.md#開發與驗證--development-and-verification)。

Initialize backend services and data first, then run the frontend in a separate terminal. The linked guides explain configuration, data import and deployment in detail.

## 後端本機開發 / Local backend development

在專案根目錄執行：

Run from the repository root:

```bash
cd backend
uv python install 3.13
uv sync --locked
```

`uv sync --locked` 依既有鎖定檔建立 `.venv` 與依賴，預設包含開發依賴；若 manifest 與 lock 不一致會停止，避免安裝時默默改版。

`uv sync --locked` creates `.venv` from the committed lockfile, including development dependencies, and fails if the manifest and lock disagree.

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

公開的 `SYSTEM/config.yaml` 預設使用 loopback、8080、SQLite 與本機 Redis 6379。先依 [Redis 安裝文件](https://redis.io/docs/latest/operate/oss_and_stack/install/install-stack/homebrew/)啟動 Redis；macOS 已安裝 Homebrew 時可執行：

The published YAML uses loopback port 8080, SQLite and local Redis on 6379. Start Redis first; on macOS with Homebrew:

```bash
brew install redis
brew services start redis
redis-cli ping
# Expected: PONG
```

在 `backend/` 執行 migration；新資料庫沒有作品集內容。若要使用既有公開示例，可將 [portfolio-web](https://github.com/zhenglee315/portfolio-web) clone 到與本專案同層，再執行一次匯入：

Apply migrations from `backend/`. A new database has no profile content. To seed the existing public example, clone portfolio-web beside this repository and import it once:

```bash
# Run inside backend/
uv run --locked alembic upgrade head
git clone https://github.com/zhenglee315/portfolio-web.git ../../portfolio-web
uv run --locked test.py
uv run --locked manage_fastapi.py
```

已經有 `portfolio-web/` 時省略 clone；也可用 `uv run --locked test.py --mock-dir /path/to/mock` 指定自己的合規三語資料。匯入只允許空的 Portfolio 資料表，沒有清空或覆寫既有資料的步驟。後端可先以空資料啟動；前端正式預先渲染則需要三語有效的 Site 內容。文件位於 `http://127.0.0.1:8080/swagger`。目前 `uv run backend` 是 uv 範例，不是 API 啟動入口。

Skip cloning if the sibling repository already exists, or pass your own valid three-language mock directory. The importer requires empty Portfolio tables and does not overwrite existing data. Empty-data backend development is supported; a production frontend build needs valid Site content in every locale. API documentation is at `http://127.0.0.1:8080/swagger`. The `backend` console script remains an example; use `manage_fastapi.py` to start the API.

`SECURITY.secret_key` 是明確標示的開發佔位值，正式環境必須更換為隨機私密金鑰。設定在 Python 匯入時讀取，修改後需重啟；目前沒有自動環境變數覆寫 YAML 的機制，部署時應掛載私有 `SYSTEM/config.yaml`。詳細欄位與金鑰產生方式見後端 README。

The signing key is a development-only placeholder and must be replaced with a random private value in production. Configuration loads at Python import time, so edits require a restart. YAML currently has no automatic environment override; mount a private `SYSTEM/config.yaml` for deployment.

## 前端本機開發 / Local frontend development

使用 Node.js 24 與 npm，在專案根目錄執行：

Use Node.js 24 and npm. From the repository root:

```bash
cd frontend
npm ci
cp .env.example .env.local
npm run dev
```

首次安裝才複製 `.env.example`，保留已有 `.env.local` 的個人設定。預設 proxy 與 build target 都是後端 8080；若更換 API 位址，同時調整兩者。開發頁面位於 `http://127.0.0.1:5173`，支援 `/`、`/en`、`/zh-Hans` 與 `/zh-Hant`。`npm run check` 執行型別、lint、格式、單元測試與建置，建置時需要已匯入內容的 API。瀏覽器測試另需 `npx playwright install chromium`，然後依序執行 `npm run test:dev` 與 `npm run test:e2e`；兩套測試共用 4181 fixture API，須分開執行。

Copy the environment example only on first setup; preserve existing local settings. Both default API targets point to port 8080. Development runs on port 5173 with four locale URLs. Standard checks include a build against seeded API content. Install Chromium before running the development and production browser suites sequentially, since both manage the same fixture API port 4181.

## 可重建檔案與版本控制 / Reproducible Files and Version Control

| 隨原始碼提交 / Tracked input                                                                        | 安裝或執行時產生 / Regenerated locally                                        |
| --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Python／npm manifests、lockfiles、版本檔 / Manifests, locks and runtime pins                        | `.venv/`、`node_modules/` / Installed dependencies                            |
| 前後端原始碼、CSS、三語字典、圖片／地圖／字型與授權 / Sources, styles, locales, assets and licenses | `.react-router/` / Route-generated types                                      |
| migration、維護中的測試與 fixtures、CI／工具設定 / Migrations, tests, fixtures and tooling          | SQLite 檔案／journal、測試報告／cache / Database data and verification output |
| 開發用 `config.yaml`、`.env.example`、README／部署範例 / Safe development configuration and docs    | `.env.local`、`build/` / Local settings and accepted builds                   |

這些輸入檔都屬於專案交付內容；依賴、型別與產物由以上指令重建，因此不需要提交 `node_modules`、虛擬環境或資料庫。需要初始內容時使用公開 mock 匯入流程；個人部署金鑰另行提供。Git 的 `??` 表示尚未追蹤，`!!` 才表示被忽略；發佈新功能時必須一併加入新增 source、assets、tests 與工具檔案，不能只提交 README 或 package.json。

Commit every required input file with a feature. Dependencies, route types and artifacts regenerate from the documented commands; database content comes from the import workflow and deployment secrets are supplied separately. In Git status, `??` means untracked and `!!` means ignored. New source, assets, tests and tooling must accompany the change.

## 文件與版本控制 / Documentation and version control

- 本儲存庫為公開專案；公開文件僅記錄架構、通用開發流程與不含敏感值的設定示例。
- 不在公開文件記錄實際伺服器配置、識別資訊、網路位址、登入資訊、金鑰或憑證。
- 本機工作筆記、暫存資料與私有部署紀錄統一存放於根目錄 `agent/`，該目錄已由 `.gitignore` 排除。
- manifests、lockfiles、完整原始碼與開發預設配置納入版本控制；虛擬環境、個人環境檔、SQLite 資料與正式機密不提交。

- This is a public repository. Public documentation covers architecture, general development workflows, and configuration examples without sensitive values.
- Keep actual server specifications, identifiers, network addresses, login details, keys, and credentials out of public documentation.
- Local working notes, temporary files, and private deployment records belong in the root `agent/` directory, which is excluded by `.gitignore`.
- Track manifests, lockfiles, complete sources and development defaults; keep dependency environments, local environment files, SQLite data and production secrets private.

## 授權 / License

本專案採 MIT License。

This project is licensed under the MIT License.
