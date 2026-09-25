# 後端架構與方法目錄 / Backend Architecture and Method Catalog

本目錄是**現代化的個人檔案系統**的後端，以 FastAPI、uv 與 SQLAlchemy 非同步 ORM 為核心，目標是輕量化、模組化與可維護性。目前優先完成後端，前端開發暫緩。整體產品介紹見[根目錄 README](../README.md)。

This directory contains the backend of the **Modern Personal Profile System**, centered on FastAPI, uv, and SQLAlchemy's asynchronous ORM. The goals are lightweight development, modularity, and maintainability. Backend development takes priority; frontend development is deferred. See the [root README](../README.md) for the product overview.

本文件區分「目前已有的內容」與「規劃中的架構」。基礎目錄骨架、YAML／Enum 工具、快取常數與網路工具已建立；應用組裝、資源管理與業務功能仍待實作及整合。目標結構中的細部檔名是職責配置建議，依實際需求建立。

This document separates the current implementation from the planned architecture. The base scaffold, YAML/enum helpers, cache constants, and network utilities exist; application assembly, resource management, and business functionality still require implementation and integration. Detailed filenames in the target structure illustrate proposed responsibilities and will be introduced as needed.

## 1. 目前狀態 / Current State

目前已完成 uv 專案初始化、依賴宣告，以及 `APPs`、`COMMON`、`SYSTEM` 基礎目錄。目前另有 `YamlConfig`、網路工具及初步設定檔；初始化產生的 `main()` 仍僅輸出範例訊息，尚無完整 FastAPI 應用、業務 API、ORM models 或 migration 腳本。

The uv project, dependency declarations, and base `APPs`, `COMMON`, and `SYSTEM` directories are in place. The project also contains `YamlConfig`, network utilities, and initial configuration files. The generated `main()` still prints a sample message; a complete FastAPI application, business APIs, ORM models, and migration scripts remain pending.

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
│       ├── tools_enum.py
│       └── tools_yaml.py
├── SYSTEM/
│   ├── config.yaml
│   ├── extension.py
│   ├── settings.py
│   ├── tools/
│   │   └── tools_net.py
│   ├── constants/
│   │   ├── constant_storage.py
│   │   └── constants_cache.py
│   ├── database/
│   │   ├── models/
│   │   └── migrations/
│   │       └── .gitkeep
│   └── security/
│       └── middleware/
├── .python-version
├── README.md
├── pyproject.toml
├── uv.lock
└── src/
    └── backend/
        └── __init__.py
```

原始骨架的 Python package 含 `__init__.py`；目前 SYSTEM 已開始加入 import 與設定載入，尚待完整整合。`SYSTEM/tools/` 目前沒有 `__init__.py` 匯出介面。上圖省略 package 標記。`migrations/` 以 `.gitkeep` 保留於版本控制，尚未執行 Alembic 初始化。`APPs/` 的具體業務模組在確認分組後建立。

The original scaffold packages contain `__init__.py` files. SYSTEM now includes imports and initial configuration loading that still require integration. `SYSTEM/tools/` currently has no `__init__.py` export interface. Package markers are omitted above. `migrations/` uses `.gitkeep` to retain the directory in version control; Alembic has not been initialized. Business module directories under `APPs/` will be created once their grouping is confirmed.

本機產生的 `.venv/` 與作業系統檔案不屬於原始碼架構，未列入上圖。依賴宣告以 [pyproject.toml](pyproject.toml) 為準，解析後版本記錄於 [uv.lock](uv.lock)。

The locally generated `.venv/` and operating-system files are not part of the source architecture and are omitted above. Dependency declarations are maintained in [pyproject.toml](pyproject.toml), with resolved versions in [uv.lock](uv.lock).

| 類別 / Category | 目前宣告的套件 / Declared Packages | 用途 / Purpose |
| --- | --- | --- |
| API | `fastapi`, `uvicorn[standard]` | HTTP API 與 ASGI 執行環境 / HTTP APIs and ASGI runtime |
| 資料驗證 / Validation | `pydantic`, `pydantic-settings` | 資料與應用設定驗證 / Data and application settings validation |
| 資料庫 / Database | `sqlalchemy[asyncio]`, `asyncpg`, `alembic` | 非同步 ORM、PostgreSQL 驅動、結構遷移 / Async ORM, PostgreSQL driver, and schema migrations |
| 快取用戶端 / Cache Client | `redis` | Redis 用戶端；啟用快取的功能尚未實作 / Redis client; caching features are not implemented |
| 開發依賴 / Development | `aiosqlite`, `black`, `pytest`, `httpx` | 本機 SQLite 驅動、排版與測試 / Local SQLite driver, formatting, and testing |

目前方向是本機以 SQLite 開發、部署時使用 PostgreSQL，皆透過 SQLAlchemy async ORM 存取。`aiosqlite` 目前位於 `dev` 群組，因此本機 SQLite 環境需要包含此群組；若未來正式環境也使用 SQLite，須重新調整依賴分類。Python 驅動的安裝不代表資料庫或 Redis 服務已安裝、啟動。

The current direction is SQLite for local development and PostgreSQL for deployment, accessed through SQLAlchemy's async ORM. `aiosqlite` is currently in the `dev` group, so local SQLite environments need that group. If SQLite is later used in production, its dependency classification must change. Installing Python drivers does not install or start database or Redis services.

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

`config.example.yaml` 為尚未建立的無機密配置範本。`constants/` 已有 `constants_cache.py` 與 `constant_storage.py`；共用 schema 子目錄目前僅有 package 標記，其餘常數、schema 與工具依實際需求實作。ORM models 統一放在 `SYSTEM/database/models/`，按領域分檔；安全相關 middleware 放在 `SYSTEM/security/middleware/`。

`config.example.yaml` is a configuration template without secrets that has not been created yet. `constants/` now contains `constants_cache.py` and `constant_storage.py`; shared schema directories still contain only package markers. Additional constants, schemas, and utilities will be implemented as needed. ORM models belong in `SYSTEM/database/models/`, split by domain. Security middleware belongs in `SYSTEM/security/middleware/`.

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
| `tools/` | 以 `tools_<module>.py` 封裝跨模組的操作、轉換與輔助方法，以明確參數接收所需資源 | Shared operations, conversions, and helpers in `tools_<module>.py`, receiving resources through explicit parameters |

可按需求抽取 `tools_time.py`、`tools_yaml.py`、`tools_json.py` 或 `tools_sqlalchemy.py` 等工具；其中 `tools_yaml.py` 已建立，其餘為命名與職責示例。若功能增加，可依能力分子目錄，同時保留 `tools_<module>.py` 命名。一般資料轉換放在 tools；與 schema 欄位直接相關的限制與驗證放在 schema。

Potential helpers include `tools_time.py`, `tools_yaml.py`, `tools_json.py`, and `tools_sqlalchemy.py`. `tools_yaml.py` already exists; the others illustrate naming and responsibilities. As capabilities grow, subdirectories may group related helpers while preserving the `tools_<module>.py` convention. General transformations belong in tools; field constraints and schema-specific validation belong in schema.

COMMON 的使用規則如下：

Rules for COMMON:

1. **依賴方向：**COMMON 可使用標準函式庫與必要套件，但不反向載入 APPs 的業務模組或 SYSTEM 的全域資源；由呼叫端傳入設定、Session 或 client。明確 import 所需項目，避免 `__init__.py` 一次匯入整套工具與可選服務。
   **Dependency direction:** COMMON may use the standard library and required packages, but must not import APPs business modules or global SYSTEM resources. Callers provide settings, Sessions, or clients. Use explicit imports rather than loading the entire utility library and optional services through `__init__.py`.
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
| `urls.py` | 集中管理路由前綴與註冊，實際掛載各 APPs router | Centralize route prefixes and registration, mounting routers from APPs |
| `lifespan.py` | 控制應用資源的建立與釋放，處理啟動中途失敗時的清理 | Own application resource startup and shutdown, including cleanup after partial startup failures |
| `database/database_core.py` | 建立 async Engine、Session factory 與取得 Session 的介面，集中處理驅動和連線差異 | Configure async engines, Session factories, and Session access; centralize driver and connection differences |
| `database/models/` | 集中定義資料表、關聯與約束，按領域分檔 | Define database tables, relationships, and constraints, grouped by domain |
| `database/migrations/` | 維護單一可追蹤的資料庫結構版本歷史 | Maintain a single traceable database schema migration history |
| `security/middleware/` | 處理必要的跨請求安全機制；具體功能依 API 需求建立 | Implement required request-level security mechanisms as the API scope demands |
| `manage_fastapi.py` | 組裝 FastAPI 應用、路由、例外處理與生命週期，作為規劃中的啟動入口 | Assemble FastAPI, routers, exception handlers, and lifespan as the planned startup entry point |

YAML 保留為部署配置入口；settings 作為統一讀取與驗證的邊界，業務模組不各自讀取 YAML。載入工具、環境變數覆寫優先序與秘密值注入方式在實作時明確定義；目前已有 `YamlConfig` 與初步設定載入程式，但 package 匯出與完整啟動流程尚待整合。必要配置錯誤應在啟動時清楚回報，且日誌不得輸出整份配置或含憑證的連線資訊。

YAML remains the deployment configuration entry point. Settings provides the loading and validation boundary; business modules do not read YAML independently. The loader, environment override precedence, and secret injection mechanism will be defined during implementation. `YamlConfig` and initial configuration loading exist, but package exports and the complete startup flow still require integration. Required configuration errors should be reported clearly at startup without logging complete configuration objects or credential-bearing connection details.

設定預設在啟動時載入；修改 YAML 不代表已建立的 Engine、router 或其他物件會自動更新。模組啟用開關應決定路由是否註冊，API 文件的顯示開關另行處理。路由自動探索與熱更新不是初期必要功能。

Configuration is loaded at startup by default. Editing YAML does not automatically update existing engines, routers, or other objects. Module enablement should control route registration, separately from API documentation visibility. Router autodiscovery and hot reload of configuration are not initial requirements.

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

以下為規劃流程，尚未實作：

The following flows are planned, not implemented:

```text
Startup
config.yaml -> settings validation -> application assembly + route registration
                                   -> lifespan -> resource initialization

Request
HTTP -> middleware -> views + schema -> module -> SQLAlchemy Session -> database
                                  -> module response -> response schema -> HTTP

Shared capabilities
APPs -----> COMMON
SYSTEM ---> COMMON
Caller ---> passes settings / Session / client to shared helpers

Shutdown
lifespan -> release clients and engines
```

SYSTEM 定義與組裝資源，views 透過依賴取得資源並交給業務操作。COMMON 提供可重用能力，但不負責啟動整個應用。正常結束及異常流程都要有清楚的資源所有權與清理責任。

SYSTEM defines and assembles resources. Views obtain them through dependencies and pass them to business operations. COMMON supplies reusable capabilities without starting the application. Resource ownership and cleanup responsibilities must be explicit for both normal and exceptional paths.

## 7. 目前完整方法目錄 / Complete Current Method Catalog

目前方法包含 uv 範例入口、YAML 讀取類別、Enum 工具與網路工具。以下記錄實際程式（含私有方法），所有方法皆為同步；前述規劃功能不列為已實作。

Current methods include the uv sample entry point, YAML reader, enum helpers, and network utilities. This catalog describes actual code, including private methods. All methods are synchronous; planned functionality is not listed as implemented.

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
| `DB_KEEP_ALIVE` | OPTIONS 下的 KEEP_ALIVE 區塊。 / KEEP_ALIVE within OPTIONS. |
| `EnumDBType` | 資料庫、訊息、圖形與儲存服務識別碼，不代表皆支援 SQLAlchemy 或已整合驅動。 / Database, messaging, graph, and storage service identifiers; they do not imply SQLAlchemy compatibility or implemented drivers. |
| `EnumDBStoreType` | 關聯式資料庫、佇列、圖形與儲存分類。 / Categories for relational databases, queues, graphs, and storage. |
| `EnumDBSource` | 應用程式自定義的邏輯資料來源識別碼。 / Application-defined identifiers for logical data sources. |
| `EnumDBSourceCenter` | 應用程式自定義的來源中心識別碼，實際意義由使用處定義。 / Application-defined source-center identifiers whose meaning is defined by their consumers. |

四個 Enum 均繼承 `EnumUtils` 的 `values()` 與原值顯示方式，沒有新增自有方法。巢狀配置預期為 mapping，本檔尚未執行結構驗證；本次僅更新英文註解與 docstrings，保留所有值及執行流程。 / All four enums inherit `values()` and raw-value display from `EnumUtils`, with no additional methods. Nested configuration is expected to be a mapping but is not structurally validated here. This revision changes only English comments and docstrings, preserving all values and execution flow.

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

- `net_client_ip(request)` 不直接信任 `X-Forwarded-For` 或 `X-Real-IP`。使用代理時，在 Uvicorn 設定 `--proxy-headers` 與明確的 `--forwarded-allow-ips`；代理應正確產生轉送標頭，避免使用信任所有來源的 `*`。 / Configure explicit trusted proxies in Uvicorn; this helper does not independently trust forwarding headers. Proxies must generate correct headers; avoid trusting every source. [Uvicorn settings](https://github.com/Kludex/uvicorn/blob/main/docs/settings.md#http)
- 無 request 時保留同步公開 IP 查詢，以標準庫取代開發依賴 HTTPX；網路或無效回應會退回本機解析。1 秒 socket timeout 不等於整體截止時間，不應直接在 async 請求路徑呼叫。 / Without a request, public-IP detection remains synchronous and uses the standard library instead of development-only HTTPX. Failed or invalid responses fall back to hostname resolution. The one-second socket timeout is not a total deadline; avoid calling this mode directly on an async request path.
- `net_primary_ip()` 不傳送應用資料，但 hostname 解析可能產生 DNS 流量，所得位址不保證是 NAT 外部的公開 IP，也不代表目的地可達。 / Route probing sends no application payload, but hostname resolution may cause DNS traffic. The result need not be the public address beyond NAT and does not establish destination reachability.
- 萬用字元只支援 IPv4；IPv6 scope 不接受，IPv4-mapped IPv6 保持 IPv6 比對。網路錯誤採既定 fallback；無效白名單輸入不放行。 / Wildcards are IPv4-only; scoped IPv6 is rejected, and IPv4-mapped IPv6 remains IPv6. Network errors use the documented fallbacks; invalid whitelist input never grants access.

後續每次新增、修改或刪除函式，都要同步更新本節。涵蓋 API handlers、業務方法、共用工具、私有方法、建構方法、property、巢狀 helper 與生命週期函式；列出檔案、完整簽名、用途、參數、回傳，以及必要的例外、副作用與 async 特性。第三方套件內部方法不列入。

Update this section whenever functions are added, changed, or removed. Include API handlers, business methods, shared utilities, private methods, constructors, properties, nested helpers, and lifecycle functions. Document each location, full signature, purpose, parameters, return value, and relevant exceptions, side effects, and async behavior. Third-party library internals are excluded.

## 8. 工程與文件規則 / Engineering and Documentation Rules

- **正規化、模組化、標準化：**資料模型與關聯以正規化為原則；目錄、命名、型別與契約保持一致；業務與基礎設施職責清楚。
- **工程架構與可維護性：**明確定義依賴、交易與生命週期，避免循環依賴、巨型模組與 import 時建立外部資源。
- **重用與輕量化：**先檢查共用方法，再增加程式；不預先移植未需要的背景工作、外部服務或大型工具庫。
- **英文程式註解：**使用英文註解與 docstrings 說明必要的行為和設計理由。
- **中英文件同步：**本 README 維護後端結構與每個方法；根目錄 README 維護整體產品介紹與進度。
- **公開資料邊界：**公開文件不包含真實伺服器規格、識別資訊、連線位置、登入資料或密鑰。`SYSTEM/config.yaml` 已由根目錄 `.gitignore` 排除，僅保留於本機。`SECURITY.secret_key` 必須提供非空字串，缺少時設定載入會報錯；可選的 `SECURITY.cookie_domain` 也由本機配置讀取，程式不保存部署網域或預設簽章金鑰。
- **工作筆記：**助理的暫存檔、研究筆記與私有紀錄一律放在根目錄 `agent/`，該目錄已由 Git 忽略；不放入後端原始碼目錄。
- **授權：**本專案採 MIT License。

- **Normalization, modularity, and standardization:** Normalize data models and relationships, keep naming/types/contracts consistent, and separate business and infrastructure responsibilities.
- **Architecture and maintainability:** Make dependencies, transactions, and lifecycles explicit. Avoid circular imports, oversized modules, and external resource initialization at import time.
- **Reuse and lightweight development:** Check shared helpers before adding code. Do not preemptively port background jobs, external services, or large utility libraries.
- **English code comments:** Use English comments and docstrings to explain relevant behavior and design decisions.
- **Bilingual documentation:** Keep Chinese and English documentation aligned. This README owns backend structure and method details; the root README owns the product overview and progress.
- **Public information boundary:** Public documentation excludes actual server specifications, identifiers, connection locations, login details, and secrets. `SYSTEM/config.yaml` is excluded by the root `.gitignore` and stays local. `SECURITY.secret_key` must be a non-empty string or settings loading raises an error. The optional `SECURITY.cookie_domain` is also read from local configuration; code contains neither a deployment domain nor a default signing key.
- **Working notes:** Assistant temporary files, research notes, and private records belong exclusively in the root `agent/` directory, which Git already ignores, rather than backend source directories.
- **License:** This project uses the MIT License.
