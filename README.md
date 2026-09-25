# portfolio-modern

現代化的個人檔案系統，以結構化方式組織與呈現個人介紹、學經歷、旅程、專案經驗與技能，並規劃提供多語言內容 API。

A modern personal profile system that organizes and presents profile information, education and work experience, journeys, project experience, and skills through structured data, with planned multilingual content APIs.

本專案以 **輕量化開發與部署** 為目標：依實際功能引入依賴，控制常駐服務與資源使用，維持清楚、容易理解的模組結構。

The project aims for **lightweight development and deployment**: add dependencies as features require them, control resource usage and persistent services, and keep the module structure clear.

**目前優先完成後端；前端開發暫緩。** `backend/` 放置後端程式，`frontend/` 保留給後續前端開發。

**The current priority is completing the backend; frontend development is deferred.** `backend/` contains the backend, while `frontend/` is reserved for future frontend work.

## 目前進度 / Current status

- 已完成 Python 後端的 uv 專案初始化、基礎依賴宣告，以及 `APPs`、`COMMON`、`SYSTEM` 基礎目錄骨架。
- 正在討論後端架構、資料庫與 API 契約，尚未完成可運行的業務 API。
- 後端 API 契約參考既有 mock 資料；本專案前端暫未開發，串接工作留待後續階段。
- 以下目錄結構為規劃，不代表所有目錄或功能均已建立。

- The Python backend has been initialized with uv, its initial dependencies declared, and the base `APPs`, `COMMON`, and `SYSTEM` directory scaffold created.
- Backend architecture, database design, and API contracts are under discussion; runnable business APIs are not yet complete.
- Existing mock data informs the backend API contracts. Frontend development in this project and API integration are deferred to a later phase.
- The directory structure below is a plan; not all directories or features exist yet.

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
| redis | Redis Python 用戶端；快取用途與服務啟用方式待確認 | Redis client; cache usage and service setup remain undecided |
| Black | Python 排版，開發依賴 | Python formatter; development dependency |
| pytest、HTTPX | 測試工具，開發依賴 | Testing tools; development dependencies |
| Docker | 按需啟動外部服務、容器驗證或部署 | On-demand external services, container validation, or deployment |

具體依賴宣告見 [backend/pyproject.toml](backend/pyproject.toml)，解析後版本以 `backend/uv.lock` 為準。

Dependency declarations are in [backend/pyproject.toml](backend/pyproject.toml); resolved versions are recorded in `backend/uv.lock`.

目前方向是本機開發使用 SQLite，部署時使用 PostgreSQL，皆透過 SQLAlchemy 非同步 ORM 存取。目前已宣告 `asyncpg`，`aiosqlite` 則位於開發依賴群組；資料庫連線與 ORM models 尚未實作。安裝 Python 用戶端套件不代表已安裝或啟動資料庫、Redis 服務。

The current direction is SQLite for local development and PostgreSQL for deployment, both accessed through SQLAlchemy's asynchronous ORM. `asyncpg` is now declared, and `aiosqlite` is in the development dependency group; database connections and ORM models are not implemented yet. Installing Python clients does not install or start database or Redis services.

## 輕量化原則 / Lightweight development principles

- 日常在 macOS 以 uv 虛擬環境直接開發 FastAPI，Docker 按需啟動。
- 先完成必要的 API 與資料存取；有明確用途後才啟用快取、背景工作或其他常駐服務。
- 初期採單一後端服務，避免預先拆分微服務或引入多套排程、訊息佇列系統。
- 部署時依實測負載調整 worker、資料庫連線池與快取上限，避免直接套用大型專案設定。
- 開發工具與正式執行依賴分開管理。
- 共用能力按實際重用需求抽取，避免為簡單功能建立過多抽象層。

- Develop FastAPI directly on macOS in a uv virtual environment; start Docker only when needed.
- Implement essential APIs and data access first. Add caching, background jobs, or other persistent services when a concrete need arises.
- Start with one backend service, without prematurely introducing microservices, multiple schedulers, or message queues.
- Tune workers, connection pools, and cache limits using measured workloads instead of copying settings from larger systems.
- Manage development tools separately from runtime dependencies.
- Extract shared functionality when reuse is justified; keep simple features free of unnecessary abstraction.

## 專案與後端目錄規劃 / Planned project and backend structure

`backend/` 是目前開發重點；`frontend/` 暫時保留，待後端完成後再進行前端開發。樹狀圖中的 `<module>`、`<interface>`、`<function>` 分別代表模組、介面與功能名稱。

`backend/` is the current development focus. `frontend/` is reserved for frontend development after the backend is complete. `<module>`, `<interface>`, and `<function>` are naming placeholders.

```text
portfolio-modern/
├── README.md
├── frontend/
└── backend/
    ├── APPs/
    │   └── <module>/
    │       ├── views_<interface>.py
    │       ├── module/
    │       │   └── <function>/
    │       │       └── module_<function>.py
    │       └── schema/
    │           ├── body/
    │           ├── parser/
    │           └── resp/
    ├── COMMON/
    │   ├── decorator/
    │   ├── exceptions/
    │   ├── schema/
    │   └── tools/
    ├── SYSTEM/
    │   ├── config.yaml
    │   ├── settings.py
    │   ├── urls.py
    │   ├── lifespan.py
    │   ├── database/
    │   │   └── models/
    │   └── security/
    │       └── middleware/
    ├── manage_fastapi.py
    ├── pyproject.toml
    └── uv.lock
```

- `APPs`：按業務模組組織 API。`views` 處理 HTTP 介面，`module` 處理業務邏輯，`schema` 分別定義請求主體、參數解析與回應格式。
- `COMMON`：跨模組共用的裝飾器、例外、資料格式與工具。
- `SYSTEM`：系統設定、路由註冊、生命週期、資料庫基礎設施與安全機制。
- `SYSTEM/database/models`：集中管理資料表模型，按業務領域分檔。
- `manage_fastapi.py`：規劃中的應用組裝與啟動入口。

- `APPs`: APIs grouped by business module. `views` handles HTTP interfaces, `module` contains business logic, and `schema` defines request bodies, parameter parsing, and response formats.
- `COMMON`: Decorators, exceptions, schemas, and utilities shared across modules.
- `SYSTEM`: Configuration, route registration, lifecycle management, database infrastructure, and security.
- `SYSTEM/database/models`: Centralized database models, split by business domain.
- `manage_fastapi.py`: Planned application assembly and startup entry point.

`SYSTEM/config.yaml` 規劃放置 server 與部署配置，`settings.py` 統一載入與驗證。完整目標結構、COMMON 的共用邊界及目前所有自有方法，見[後端 README](backend/README.md)。文件中會區分現況與尚未實作的設計。

`SYSTEM/config.yaml` is planned for server and deployment configuration, with `settings.py` providing centralized loading and validation. See the [backend README](backend/README.md) for the full target structure, COMMON's reuse boundaries, and every currently implemented project function. It distinguishes the current implementation from planned design.

## API 範圍 / API scope

目前 mock 對應以下六支讀取 API：

The existing mock data maps to six read APIs:

| 路徑 / Endpoint | 內容 | Content |
| --- | --- | --- |
| `GET /api/v1/site` | 品牌、個人介紹與社群資訊 | Branding, profile, and social links |
| `GET /api/v1/journey` | 旅程與地圖所需資料 | Journey and map data |
| `GET /api/v1/experiences` | 學經歷與相關技能 | Education, work experience, and related skills |
| `GET /api/v1/projects` | 專案經驗列表、完整詳情與技能 | Project experience with full details and skills |
| `GET /api/v1/skill-categories` | 技能分類與技能預覽 | Skill categories and previews |
| `GET /api/v1/skills` | 分類下的技能分頁 | Paginated skills within a category |

內容涵蓋英文、繁體中文與簡體中文。技能分類與技能 API 的最終契約仍待確認；登入、管理後台、寫入與上傳功能尚未納入已確認範圍。

Content covers English, Traditional Chinese, and Simplified Chinese. The final contracts for skill categories and skills remain pending. Authentication, an admin interface, write operations, and uploads are not part of the confirmed scope.

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

服務啟動指令將在 FastAPI 入口完成後補上。

Server startup instructions will be added once the FastAPI entry point is implemented.

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
