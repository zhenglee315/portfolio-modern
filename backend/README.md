# 後端總覽 / Backend Overview

**文件責任：** 後端啟動與設定、HTTP／Socket.IO 契約、資料流、資料庫部署及排錯。排程操作由 [SCHEDULER](SCHEDULER/README.md) 說明，管理交易規則由 [Management module](APPs/Management/module/README.md) 說明，共用儲存工具的 ownership 與方法以各套件 README 為準。

This guide owns backend integration and operational contracts. Scheduler, management-business and shared-storage guides own their respective implementation boundaries; the [project overview](../README.md#文件分工--documentation-responsibilities) indexes all documentation.

User PATCH `/management/users/{account_id}` 現在接受 is_active／role_id，沿用 email 確認與 expected 原值比較。角色指派在同一交易及管理寫入鎖下檢查角色存在、啟用、操作者八項權限上限與最後角色管理員。新增 `/management/users/role-options` 提供 page／size／search，僅需 is_manage_users，回傳 can_assign。Login records GET 加入 nullable is_online：使用與 system heartbeat 相同的 Redis SYS online:<IP> TTL key，只批次讀取當頁 IP；不存在為 false，Redis 無法讀取為 null。此值表示 IP 活動，不代表帳號 session，無 SQL 排序／篩選。geo_status 仍保留原登入地理快照；沒有 migration 或額外寫入 API。

本目錄是個人檔案系統的 FastAPI 後端。`APPs` 放業務 API，`COMMON` 放共用工具，`SYSTEM` 負責設定、模型、資料庫、middleware 與應用生命週期。整體產品方向見[專案 README](../README.md)。

This directory contains the FastAPI backend for the personal profile system. `APPs` holds business APIs, `COMMON` holds shared tools, and `SYSTEM` owns configuration, models, the database, middleware, and the application lifecycle. See the [project README](../README.md) for the product overview.

目前已完成六支公開 Portfolio 讀取 API、五支本人內容 GET、十八支內容寫入操作、網站／帳號／角色三支管理列表 GET、Role／User／Platform PATCH 與單筆／批次刪除、線上人數診斷 API、登入、登出、註冊與 SESSION 查詢，以及 SQLite／PostgreSQL 非同步資料庫架構、Redis 快取與 session、Socket.IO 組裝、ORM 模型及 Alembic migration。Worker 監控由 lifespan 啟停，包含資源、HTTP 請求、交易與程序替換統計，透過 `/monitor` Socket.IO namespace 推送變更快照，並提供 CLI 自測。管理新增 API 尚未實作。Profile 啟用前需套用 `e42b19a7d603`；操作矩陣、權限、交易與結構變更見 [Profile API](APPs/Portfolio/README.md)。

Six public Portfolio reads, five private owner reads, eighteen content writes, three management lists, Role/User/Platform PATCH and single/batch deletion, an online-count diagnostic API, sign-in, sign-out, registration, and session lookup are implemented alongside the async SQLite/PostgreSQL infrastructure, Redis cache and sessions, Socket.IO assembly, ORM models, and Alembic migrations. Lifespan-managed worker monitoring covers resources, HTTP requests, transactions and process replacements, delivering changed snapshots through the `/monitor` Socket.IO namespace, with a diagnostic CLI. Administration create APIs remain pending. Profile requires migration `e42b19a7d603` before enabling this version; see the Profile API reference for operations, transactions and schema changes.

## 本人內容與新介面 / Owner content and editor

Profile 現在包含本人內容讀取、資源 CUD／排序及整頁交易保存，並非只有公開六支 GET。畫面由前端組合，所有 owner、權限、revision、關聯與交易驗證仍在後端。新註冊只建立帳號，未建立作品集時本人 GET 回 404；不能用 default 網站代替本人資料。

[![目前的 Profile 專案編輯、分頁及保存介面](../docs/images/profile-projects.png)](../docs/images/profile-projects.png)

| 操作     | 契約                                                                            | 設計                                                                                                                             |
| -------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 本人讀取 | `GET /portfolio/me/{site,experiences,projects,skill-categories,skills}`         | SESSION 限定 owner，含未公開及三語資料；專案以 page／size 查詢，其他引用使用輕量 ID 索引。                                       |
| 專案分頁 | `GET /portfolio/me/projects?page=1&size=6`                                      | size 1–100，沿用 `items/total/pages/page/size`，附 revision／order／references；公開與管理員 preview 集合仍固定 size=6。         |
| 整頁保存 | `POST /portfolio/site/save`                                                     | `expected_revision`、`draft` 與可選 `project_scope.loaded_ids/order`；單一交易保留未載入專案，409 衝突保留工作副本，不自動重送。 |
| 個別修改 | 既有 `site`、`experiences`、`projects`、`skill-categories`、`skills` CUD／order | 共用同一 Module、schema、ORM 工具及 CRUD 權限；使用中的技能與跨 owner ID 不可任意刪改。                                          |
| 草稿預覽 | 前端未送出 modal                                                                | 重用公開 Views，不觸發保存；[畫面](../docs/images/profile-preview.png)不是讀取已發布內容的另一支 API。                           |

完整 operation matrix／輸入回傳／正規化表格由 [Portfolio 指南](APPs/Portfolio/README.md) 維護。SQL 交易與分頁沿用 [SQLAlchemy 工具](COMMON/tools/storage/sqlalchemy/README.md)，共用輸入及五欄回應由 [COMMON schema](COMMON/schema/README.md) 登記。卡片的左滑、拖曳及 checkbox 是草稿操作，前端唯一 Save 才提交，不把手勢拆成多個不一致交易。

## 管理員 Portfolio 預覽

`APPs/Management/views_management.py` 的 `ManagementPortfolioPreview` 提供 `/management/preview/site`、`journey`、`experiences`、`projects`、`skill-categories`、`skills` 六支 GET。CBV class 直接使用共用 ManagementPermission(AuthRole.is_manage_sites)，每次透過既有 AuthSessionModule 讀取目前有效帳號與角色；未登入／停用管理員回 401，沒有管理權限回 403，儲存不可用回 503。必須明確指定 site_id，不以帳號 id 或 default 推測；可讀取未發布及停用用戶的網站，缺少網站／語言回 404。View 只呼叫既有 Portfolio module 的 `preview()`／`preview_categories()`／`preview_skills()`；目標存在性、內容讀取與私有錯誤處理由 module 負責。公開 Portfolio 的發布條件維持不變。

所有預覽 DTO 與資料查詢共用 APPs/Portfolio；四個集合仍為 page／size=6，Skills 仍使用 ownerType=category／ownerId。預覽不掛 public cache decorator，成功及已處理錯誤使用 private, no-store／Vary: Cookie。這些端點只讀取，不改資料庫；管理員 SESSION 依既有機制刷新。三支管理列表也已套用共用權限檢查；PATCH 與刪除依各資源管理旗標檢查，內容 CRUD 旗標不能替代；新增仍未實作。

## 同時啟動 API 與排程 / Combined startup

在 backend 執行 `uv run --locked manage.py`，會以目前 Python 環境同時啟動 FastAPI 與 APScheduler。任一子程序退出會關閉另一個；支援 SIGINT／SIGTERM 與 worker 程序群組清理。每個 VM／Pod 使用自己的記憶體排程表，所有 job 共用 Redis DB 5 的 token 鎖與續鎖機制。宣告、設定、CLI、關閉期限及互斥限制見 [SCHEDULER/README.md](SCHEDULER/README.md)。Monitor jobs 包含 Redis／SQL 健康檢查，以及每分鐘將 SYS Redis request queue 寫入 [record_request](SYSTEM/models/README_record_request.md) 的歷史保存。

`SYSTEM/tools` 與 `SCHEDULER/SYSTEM/tools` 不引用 COMMON。lifespan／啟動入口透過 `CONN_MANAGER` 取得既有資源，準備 RedisAsync、SQLAlchemy 交易觀察器及同步 Redis 工廠後注入。GeoIP 的 `GeoIpDatabaseImporter.prepare_bundle` 同樣由 lifespan 傳入 `GeoIpReader`；工具不自行匯入 COMMON。這個依賴方向避免 settings → tools → COMMON → database → settings 的循環，保留共用工具原有連線管理方式。

## 完整測試入口 / Full Test Entry

以下環境變數必須指向已建立的隔離 Redis 與 PostgreSQL；省略時，對應整合案例會跳過。測試會建立／移除自己的表或 schema，不使用開發帳號及正式資料。所有後端服務啟動／重啟仍透過 `manage.py` 同時管理 FastAPI 與 APScheduler。

```sh
# Run from backend/ with disposable services prepared first.
SCHEDULER_TEST_REDIS_URL=redis://127.0.0.1:16389/0 \
MONITOR_TEST_REDIS_URL=redis://127.0.0.1:16389/0 \
SOCKETIO_TEST_REDIS_URL=redis://127.0.0.1:16389/0 \
PLATFORM_PATCH_TEST_POSTGRES_URL=postgresql+asyncpg://test_user@127.0.0.1:16439/disposable_test \
  uv run --locked check.py --integration
```

整合測試用 PostgreSQL 資料庫及 Redis DB 必須與正在執行的 QA／開發服務分開；`test_request_history` 會建立及移除自己的歷史表。即使兩者都是合成資料，也不能同時共用同一資料庫，否則排程寫入會干擾測試筆數。

正式回歸案例位於 `tests/`，依賴由 `pyproject.toml`／`uv.lock` 鎖定。`uv run --locked check.py` 統一執行 Black、Ruff、漸進式 mypy 與 pytest；檢查同時涵蓋前端七支 Python 資產產生器。`--integration` 要求上方全部隔離服務環境變數，缺少即拒絕執行。只跑測試可用 `uv run --locked pytest`。mypy 目前覆蓋監控、IP／GeoIP、遷移支援政策、公開 handle 及分散鎖共十支模組；其餘 Python 仍執行格式、lint 與行為測試。完整對照見[品質驗證](../docs/code-quality.md)。

Maintained tests now ship under tests/. The locked check.py entry runs formatting, lint, gradual type checks and pytest, including the frontend Python generators. Integration mode requires explicitly supplied disposable endpoints. One-time evidence stays under ignored agent/.

### 模組責任 / Module Ownership

- `SYSTEM/tools/tools_monitor.py` 保留公開入口；`monitor_worker.py` 採樣／佇列發布、`monitor_snapshot.py` 聚合、`monitor_stream.py` Socket.IO、`monitor_supervisor.py` Uvicorn adapter，`monitor_contracts.py` 宣告注入協定及常數。
- `APPs/Auth/module/` 使用 `module_base.py`、`module_register.py`、`module_session.py`、`module_sign_in.py`，由 `__init__.py` 直接匯出業務 class。憑證原值與交易 ownership 保留原契約。
- `APPs/Management/module/` 使用 `module_base.py`、`module_roles.py`、`module_users.py`、`module_sites.py`、`module_logins.py`、`module_state.py` 及 `module_permission.py`，由 `__init__.py` 直接匯出業務 class 與權限依賴。詳見 [Management module](APPs/Management/module/README.md)。

SYSTEM 與 SCHEDULER 的 tools 不匯入 COMMON。匯入依 `Project`、`Common`、`System`、套件名稱及 `Python` 分組，使用 `# ◆—< Pack >—————————————————————————————————◆ Project` 這類分隔線；使用 `import *` 的來源需明確宣告 `__all__`。工具依賴邊界、公開匯出清單與匯入順序已有正式回歸測試。

## 目錄結構 / Directory Layout

下列是目前的主要檔案與資料夾；省略 package 標記、靜態資產細項、虛擬環境、本機資料及測試產物。

The tree shows the main files and directories currently present; package markers, individual static assets, and the virtual environment are omitted.

```text
backend/
├── README.md
├── pyproject.toml
├── uv.lock
├── check.py                      # Black／Ruff／mypy／pytest
├── alembic.ini
├── manage.py                     # 同時管理 FastAPI 與 APScheduler
├── manage_fastapi.py              # 由 manage.py 管理的 child
├── manage_apscheduler.py          # 由 manage.py 管理的 child
├── tests/                        # 單元、整合、依賴邊界與文件契約檢查
├── APPs/
│   ├── Auth/
│   │   ├── views_auth.py
│   │   ├── module/               # 註冊、登入、SESSION 與權限
│   │   └── schema/
│   ├── Management/
│   │   ├── views_management.py   # 列表、預覽、PATCH 與刪除
│   │   ├── constants/
│   │   ├── module/
│   │   └── schema/
│   ├── Monitor/
│   │   ├── README.md
│   │   ├── views_monitor.py      # HTTP 歷史彙總與即時診斷
│   │   ├── module/
│   │   └── schema/
│   ├── Portfolio/
│   │   ├── README.md
│   │   ├── views_portfolio.py    # 公開／本人 GET、內容 CUD 與原有 Module
│   │   ├── module/              # 公開查詢／管理 module 與相容匯出
│   │   └── schema/              # body、parser、resp
│   └── Sys/                     # 心跳／在線人數
├── COMMON/
│   ├── decorator/               # 快取與 SQL 驗證裝飾器，含 README
│   ├── schema/                  # 共用分頁、搜尋／篩選 parser，含 README
│   └── tools/
│       ├── README.md            # 全部通用工具入口、用法與 ownership
│       ├── tools_enum.py
│       ├── tools_geoip.py       # 本機 MMDB／gzip 驗證及原子匯入
│       ├── tools_search.py
│       ├── tools_yaml.py
│       └── storage/
│           ├── redis/           # client、WATCH／stream／heartbeat 與 README
│           └── sqlalchemy/      # session、ORM、分頁／篩選／搜尋與 README
├── SYSTEM/
│   ├── config.yaml              # 本機服務設定；文件不保存憑證值
│   ├── settings.py
│   ├── extension.py
│   ├── events.py
│   ├── lifespan.py              # 資源建立、注入與關閉
│   ├── urls.py
│   ├── constants/
│   ├── database/
│   │   ├── database_core.py     # 共用 async DB／Redis manager
│   │   ├── migration_policy.py
│   │   ├── orm/                 # ORM Base
│   │   └── models/              # 相容匯出
│   ├── geoip/                   # 本機 City 資料、manifest 與 README
│   ├── middleware/              # CORS、heartbeat、SESSION、monitor
│   ├── models/                  # Auth／Portfolio／Record ORM 與表格指南
│   │   └── migrations/
│   ├── scripts/                 # 本機診斷／資料匯入 CLI
│   ├── static/                  # 本機 Swagger／ReDoc
│   └── tools/                   # FastAPI／Socket／IP／監控組裝，含 README
└── SCHEDULER/
    ├── README.md
    ├── JOBs/
    │   └── Sys/                 # 健康採樣及請求歷史寫入
    └── SYSTEM/
        ├── settings.py
        ├── extension.py
        └── tools/               # scheduler adapter、token lease 與 README
```

新增工具時，詳細方法、參數與用法寫在該工具資料夾的 README。現有文件：[SQLAlchemy 工具](COMMON/tools/storage/sqlalchemy/README.md)、[Redis 工具](COMMON/tools/storage/redis/README.md)、[快取裝飾器](COMMON/decorator/README.md)。這份 README 維護後端架構、API 總覽與操作入口。

其餘入口與 ownership 集中於 [COMMON tools](COMMON/tools/README.md)、[SYSTEM tools](SYSTEM/tools/README.md)、[Scheduler tools](SCHEDULER/SYSTEM/tools/README.md) 及 [COMMON schema](COMMON/schema/README.md)。每份指南登記介面、匯入路徑、輸入／回傳、用法、設計與清理責任；`tests/test_documentation.py` 直接讀 AST 比對公開介面及 README 目錄，不匯入執行期設定或建立連線。

When adding a tool, document its methods, parameters, and usage in that tool folder's README. See the [SQLAlchemy](COMMON/tools/storage/sqlalchemy/README.md), [Redis](COMMON/tools/storage/redis/README.md), and [cache decorator](COMMON/decorator/README.md) guides. This README covers backend architecture, API scope, and operational entry points.

## 請求與資料流 / Request and Data Flow

公開內容的處理順序如下；`APPs/Portfolio` 的公開 GET、本人 GET 與 CUD 共用一個 `FastApiRouter`，以原有 CBV 組織路由。依此功能的檔案配置要求，Portfolio 的 Module class 與原有 `.select()`、新增 CUD 同放在 `views_portfolio.py`，schema 仍依 parser／body／resp 分層；原 `module` 路徑保留相容匯出。其餘 APP 維持 views／module 分層，資料庫操作使用非同步 ORM 工具與同一寫入交易。

Public content follows the flow below. Portfolio routes share one `FastApiRouter`; its existing query Module classes and their CUD methods are colocated in `views_portfolio.py`, while parser/body/response schemas stay separate. Compatibility exports preserve the old module imports. Other applications retain the views/module separation. Portfolio writes reuse one async session and transaction per edit.

```text
HTTP request
  → SYSTEM/middleware
  → APPs/{Auth,Management,Monitor,Portfolio,Sys}/views
  → schema/parser → module → ORM or Redis helper
  → SYSTEM/database/ConnectionManager → SQLite/PostgreSQL or Redis
  → schema/resp → JSON response
```

`GET /authority/session` 以伺服器 SESSION 的帳號 ID 查詢啟用中的帳號與角色，回傳 `id`、`email`、`user`、`role` 及八個內容／監控／管理權限；訪客或失效帳號回傳 `null`，儲存服務錯誤回傳 `503`。查詢會更新 SESSION 中的身份與權限，保留原 SID 及尚未完成的註冊驗證。Auth 回應使用 `Cache-Control: no-store`；前端可在重新整理後恢復身份，無須儲存密碼。

`GET /authority/session` resolves the server session's account ID against an active account and role, returning `id`, `email`, `user`, `role`, and eight content, monitoring and management permissions. Guests and invalid accounts receive `null`; storage failures return `503`. Lookup refreshes session identity and permissions while retaining the SID and pending registration proof. Auth responses use `Cache-Control: no-store`, allowing the frontend to restore identity after reload without storing passwords.

SESSION 資料欄位統一由 [`SYSTEM/constants/constant_session.py`](SYSTEM/constants/constant_session.py) 的 `EnumSess` 定義，包含公開身份、八個權限、私有身份驗證與註冊挑戰欄位。讀寫 SESSION 或其帳號字典時使用枚舉，例如 `account.get(EnumSess.IS_MANAGE_SITES)`；`AUTH_PERMISSION_FIELDS` 也共用這些成員。枚舉沿用原始字串值，既有 Redis JSON 與前端 DTO 欄位保持相容。`EnumSess.PASSWORD` 僅用來清除舊資料，不允許新 SESSION 保存密碼。

Session payload keys belong to `EnumSess`, including account identity, eight permissions, private identity proof and registration challenge fields. Session and account-dictionary access uses these enum members; `AUTH_PERMISSION_FIELDS` shares the same definitions. Existing Redis JSON and public response field names remain compatible. `EnumSess.PASSWORD` only removes legacy data; new sessions never store passwords.

`POST /authority/sign-in` 驗證帳號、角色與密碼，建立 SESSION 後，透過 `execute_orm()` 新增一筆 `RecordLogin`（`record_login`）：保存帳號 `user_id`，由資料庫產生 serial `id` 與具時區的 `logintime`。每次成功登入各有一筆；登入失敗及 SESSION 查詢不新增紀錄。紀錄寫入失敗時回傳 `503 AUTH_DATABASE_UNAVAILABLE` 並清除剛建立的登入身份。Migration `159af2dc7898` 僅建立這張表、FK、檢查限制及兩個歷史查詢索引。

`POST /authority/sign-in` verifies the account, role and password, initializes SESSION, then inserts one `RecordLogin` (`record_login`) through `execute_orm()`. It stores the account's `user_id`; the database supplies the serial `id` and timezone-aware `logintime`. Each successful sign-in creates a separate row; failed sign-ins and session lookups create none. A record write failure returns `503 AUTH_DATABASE_UNAVAILABLE` and clears the newly prepared identity. Migration `159af2dc7898` creates only this table, its FK, check constraint and two history indexes.

### 登入來源與離線地區查詢 / Login IP and offline geolocation

Migration `71bc8f24d903` 在 `record_login` 新增 `ip_address`（45）、`country_code`（2）、`region`／`city`（128）與 `geo_status`（24）。前四個欄位可空；舊紀錄保留原 ID、帳號、時間及索引，狀態為 `unknown`。地區是登入當時的 IP 推估快照；查閱紀錄時不重新定位。這張歷史事件表沒有 Updated，預設依 `logintime DESC, id DESC` 排序。

Migration `71bc8f24d903` adds nullable IP/country/region/city snapshots and a bounded status to the existing login table. Historical rows retain their original identity, owner, time and indexes. History reads use stored values and default to descending event time, then descending ID.

`SYSTEM.tools.tools_geoip.GeoIpReader` 使用官方 `geoip2` 讀取部署提供的 City MMDB。Lifespan 每個 process 開啟一個 reader，關閉時釋放；登入以 thread pool 執行本機查詢。程式啟動、登入及歷史查詢都不下載資料、不呼叫外部地區 API。IP 取自既有 `net_client_ip(request=...)`，不接受登入 body 的 IP／地區欄位。

The process-local reader performs local-file lookups only. Startup, sign-in and history reads never download GeoIP data or call a remote geolocation API. IP extraction uses the validated ASGI client after trusted-proxy handling, never user-submitted login fields.

| `geo_status`  | 意義 / Meaning                                                                        |
| ------------- | ------------------------------------------------------------------------------------- |
| `unknown`     | 舊紀錄或來源位址不明 / Legacy event or unknown source address                         |
| `resolved`    | 至少取得一項地區資訊；其他欄位仍可空 / At least one geographic attribute is available |
| `not_found`   | 本機資料庫沒有對應地區 / No geographic match in the local database                    |
| `non_public`  | 內網、loopback 或其他不可公開定位的位址 / Private, loopback or non-public address     |
| `unavailable` | 缺少、無法讀取或查詢失敗的 City MMDB / City data missing, unreadable or unavailable   |

地區缺少或查詢失敗不阻擋登入，仍保存可取得的 IP。登入紀錄本身的資料庫寫入失敗，維持既有 503 與清除新登入身份行為。VPN／行動網路可能影響定位，地區資訊不可視為實際住址。

Missing geographic data does not block a valid sign-in; the event still retains the available IP and status. Failure to persist the login event itself preserves the established 503/session-cleanup behavior. IP-derived locations are approximate and can identify a VPN exit instead of the user.

### 封閉網段部署 / Isolated-network deployment

1. 在可連外且與目標相容的作業系統／CPU／Python 3.13 環境，依 `pyproject.toml`／`uv.lock` 準備離線套件或完整部署映像；`geoip2` 套件不包含地區資料。部署映像須事先含 Python、套件、前後端建置輸出及靜態資產。
2. 目前採用 DB-IP Lite City 的本機 MMDB（CC BY 4.0），不需下載金鑰。壓縮原檔 `SYSTEM/geoip/City.mmdb.gz`、來源 NOTICE 與版本／雜湊 manifest **一起納入 Git**；新環境 clone 不需另取地區資料。原本的後端部署產物也須保留這些檔案。登入紀錄畫面保留 DB-IP 來源連結，不新增服務、排程或啟動下載。
3. 備份資料庫並執行 `uv run --offline --locked alembic upgrade head`（需事先備妥本機依賴）。FastAPI 啟動不自動執行 migration。
4. 設定 `GEOIP_DATABASE_PATH` 環境變數，或私有 `SYSTEM/config.yaml` 的 `GEOIP.database_path`；環境變數優先。預設檔案是 `backend/SYSTEM/geoip/City.mmdb`。
5. 預設路徑在第一次啟動時，自動驗證壓縮檔並於本機解壓為 `City.mmdb`；原始大小與 SHA-256、City 類型全部正確才原子替換。解壓後的大檔與暫存檔不進 Git。初次啟動需能寫入 `SYSTEM/geoip/`；之後若檔案與 manifest 一致則不重寫。唯讀部署需在打包階段預先產生並驗證 `City.mmdb`，再給 API 使用者讀取權限；資料更新時也需重新打包。
6. 更新 Git 中的壓縮檔時一併更新 NOTICE 與 manifest，重新啟動 workers 就會依新雜湊替換舊快取。更新失敗保留原有可讀的資料，不在登入請求內更新。自訂 `GEOIP_DATABASE_PATH` 仍可使用自行準備的原始 MMDB；沒有同名 `.gz` 時不套用內建資料包。

Prepare Python dependencies outside the isolated network and apply the migration. Git includes the compressed DB-IP Lite City database, NOTICE and release/hash manifest, so a fresh clone contains all GeoIP data. First startup validates and atomically extracts the local archive; subsequent startups reuse a matching cache, or refresh it after a Git data update. The expanded MMDB stays ignored. Initial extraction requires a writable data directory; read-only deployments must include a validated, expanded `City.mmdb` prepared during packaging and rebuild it for data updates. No additional service, Git LFS, scheduler or runtime download is required. Retain the DB-IP attribution in the history dialog. Data is distributed under CC BY 4.0; see [DB-IP Lite downloads and attribution](https://db-ip.com/db/download/ip-to-city-lite). The same reader can also accept a separately licensed compatible City MMDB.

尚未提供 MMDB 時 API 仍可啟動並記錄登入 IP，公開 IP 的狀態為 `unavailable`；取得地區仍需要有效資料檔。

Without an MMDB, the API remains usable and records source IPs with an unavailable status for public IPs; geographic results require actual City data.

正式路徑為「用戶 → Nginx → FastAPI」。使用 `frontend/deploy/nginx.conf.example` 的 API 區段，以 `$remote_addr` **覆寫** `X-Forwarded-For`／`X-Real-IP`。FastAPI 必須僅對 Nginx 開放，例如同機 loopback；Lightsail 防火牆不對 Internet 開放後端 API port。現有入口信任轉發標頭，因此禁止繞過 Nginx 直接連線。日後加入 Cloudflare／其他代理時，須重新設定完整可信代理鏈。

For the confirmed direct-client → Nginx → FastAPI topology, overwrite incoming IP headers in Nginx and restrict the backend to Nginx-only access. The current API entry enables forwarded-header handling, so direct public access to its port must be blocked. A future CDN/load balancer changes this trust configuration.

### 管理端登入紀錄 / Management login history

`GET /management/login-records` 沿用既有 Management router 與 `ManagementPermission(AuthRole.is_manage_users)`。每次讀取重新檢查登入中的啟用帳號／角色及管理用戶權限；目標用戶停用後仍保留歷史紀錄。支援選填 `user_id`、既有 page／size、sort、filters、search／search_fields，查詢先篩選再計算總數及分頁。預設最新登入在前；回應維持 `items/total/pages/page/size`，並設定 private／no-store／Vary Cookie。

The private history endpoint reuses the management router, fresh user-management authorization and existing server-side DataTable controls. Optional user_id scopes an account; omitting it queries all authorized events. Disabled target accounts remain auditable. No new authentication or permission mechanism is introduced.

`POST /authority/sign-out` 不需要 body，使用目前的 session cookie，先刪除 System Redis 中的 SESSION，再清除所有欄位並使 cookie 過期。成功回傳 `200 {"signed_out": true}`，訪客或重複登出也回成功。後續 SESSION 查詢回傳 `null`；同一帳號的其他瀏覽器 session 不受影響。

`POST /authority/sign-out` requires no body and uses the current session cookie. It removes the session from System Redis, clears all session fields, and expires the incoming cookie. Success returns `200 {"signed_out": true}`, including guests and repeated sign-out requests. Subsequent session lookup returns `null`; other browser sessions for the account remain active.

Auth 的查詢與寫入統一使用 `SqlAlchemyExecAsync.execute_orm(stmt)`，由共用工具管理資料庫 session、提交與回滾。註冊使用單一 `INSERT … SELECT … RETURNING`，在同一 statement 鎖定並套用啟用中的預設角色，同時取得新帳號 ID 與角色權限。外部注入 `manage_transaction=False` 時仍由呼叫端管理交易。

Auth queries and writes use `SqlAlchemyExecAsync.execute_orm(stmt)` for shared database-session, commit, and rollback handling. Registration uses one `INSERT … SELECT … RETURNING` statement to lock and apply the active default role while returning the new account ID and role permissions. Injected `manage_transaction=False` sessions retain caller-owned transactions.

`AuthUser.set_password()` 與 `get_password()` 是 async 方法，module 直接使用 `await account.set_password(password)` 與 `await account.get_password(password)`。Model 將 Argon2 計算交給工作執行緒，共用最多四個同時執行的限制；ORM 欄位仍在事件迴圈讀寫。密碼至少八個字元，`get_password()` 回傳驗證結果，不會回傳密碼。

`AuthUser.set_password()` and `get_password()` are async methods, called directly with `await account.set_password(password)` and `await account.get_password(password)`. The model runs Argon2 calculations on workers with a shared limit of four concurrent operations, while ORM attributes remain on the event loop. Passwords require at least eight characters; `get_password()` returns a verification result, never a password.

Auth 快取操作統一透過 `RedisAsync`。發碼、驗證、註冊憑證的占用／釋放／清理使用共用 `transaction()`，業務判斷留在 Python callback，由工具管理 WATCH／MULTI／EXEC 與有限重試。驗證資料保留原 JSON 及 raw `verify_<email>` 格式，更新憑證使用 KEEPTTL；登入限流使用 `incr_with_expiry()`，原子遞增並補上首次期限。詳見 [Redis 工具](COMMON/tools/storage/redis/README.md)。

Auth cache operations use `RedisAsync`. Code delivery, verification, and registration-proof ownership use the shared `transaction()` method: Python callbacks retain business decisions while the tool manages WATCH/MULTI/EXEC and bounded retries. Proofs keep their existing JSON and raw `verify_<email>` formats; updates preserve their deadline with KEEPTTL. Sign-in limiting uses `incr_with_expiry()` for atomic increments and initial expiry. See the [Redis tool guide](COMMON/tools/storage/redis/README.md).

Portfolio 的 `site`、`journey` 直接回傳物件或陣列；四種集合 `experiences`、`projects`、`skill-categories`、`skills` 共用五欄位頁碼分頁。沒有統一的外層 `data/meta/revision` 包裝。`is_caching=true` 才會使用 `EnumCache.WEB` 的回應快取；session 與心跳使用 `EnumCache.SYS`。公開內容、分頁及快取依作品集隔離；SESSION 不影響公開作品集的選擇。

`site` and `journey` return a direct object or array; all four collections use the same five-field numbered pagination. There is no universal `data/meta/revision` envelope. `is_caching=true` opts into the `EnumCache.WEB` response cache; sessions and heartbeats use `EnumCache.SYS`. Public content, pagination and cache are isolated by portfolio; SESSION does not select the public owner.

## 多用戶作品集 / Multi-user Portfolios

只有 Site API 接受互斥的 `user`／`site_id` selector。`/portfolio/site?user=zhenglee315` 先解析公開帳號並回傳 `site_id` 與 `user`；其他五支內容 API 只接受 `site_id`，例如 `/portfolio/projects?site_id=1`，帶入 `user` 會回 400 `INVALID_SITE_SELECTOR`，不會忽略參數後誤讀首頁。Site 不帶兩個 selector、內容 API 不帶 `site_id` 時，皆讀取 `is_default=true` 的已發布作品集；Site 同時帶兩個 selector 回 400。不存在、草稿、軟刪除帳號或未設首頁都回 404，不會退回其他帳號。角色停用只阻擋登入，不會自動下架作品集。

Only Site accepts mutually exclusive user/site_id selectors. `/portfolio/site?user=zhenglee315` resolves the public account and returns its identity; the other five content APIs accept only site_id, such as `/portfolio/projects?site_id=1`. Supplying user on a content endpoint returns 400 INVALID_SITE_SELECTOR instead of silently reading the default. Omitting the supported selectors reads the published default. Missing/draft portfolios, inactive owners and a missing default return 404 without fallback. Role inactivity blocks login independently of publication.

| Model                                      | 歸屬及約束 / Ownership and constraints                                                                                                                                  |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AuthUser`                                 | 唯一 email 與獨立唯一 `user`；公開識別 3–32 個小寫 ASCII 字元，保留路由不可使用 / Independent unique login email and stable public handle                               |
| `AuthRole`                                 | 八個權限；預設註冊角色不可有任何 `is_manage_*` / Eight permissions, no management permission on the registration default                                                |
| `PortfolioSite`                            | `user_id UNIQUE`；`is_published`／`is_default` 預設 false；全站最多一個 default，default 必須 published / At most one site per account and one published global default |
| Career／Project                            | `site_id` FK，順序唯一性及查詢索引以 site 開頭 / Site-owned numeric IDs and per-site ordering                                                                           |
| Skill／SkillCategory                       | `(site_id,id)` 複合 PK，保留原字串 ID / Composite keys retain public string IDs                                                                                         |
| SkillLocale／CategoryLocale／CategorySkill | 共用 site_id 的複合 FK，DB 阻擋跨站關聯 / Composite foreign keys prevent cross-site associations                                                                        |
| `PortfolioLocale`                          | 全站語言字典 / Shared language dictionary                                                                                                                               |
| `RecordLogin`                              | 成功登入的帳號與時間 / Successful account login timestamps                                                                                                              |

`COMMON/schema/schema_user.py` 共用公開識別驗證及 email 前綴分配；省略註冊 `user` 時自動加數字後綴處理撞名。新帳號不會自動建立作品集。`PortfolioManagementModule` 保留共用帳號／owner 權限檢查及內部原子發布／首頁切換工具；對外的發布與首頁切換由 Platform PATCH 統一處理。多 statement 交易透過 `SqlAlchemyExecAsync.transaction()`，business module 仍只提交 ORM statement。

Shared user validation/allocation handles prefix collisions. Registration does not automatically create a portfolio. The portfolio management module retains reusable authorization and internal atomic publication/default operations; the public management entry point for these changes is Platform PATCH. Multi-statement operations use the shared transaction tool and execute_orm interface.

公開可見性 dependency 在 response cache 前執行；cache key 包含解析後的 site_id、語言與分頁／owner 參數。發布／首頁變更提交後使用共用 Redis SCAN 工具刪除 portfolio namespace；Auth 保持 no-store。Migration 依 `2f6a91c3e480` 擴充、`4c7e2b90d615` 補齊資料、`6d4f8a21c903` 補上約束，歷史內容不變；多站已有重複字串 ID 時拒絕降回全域 PK。

Visibility is checked before cache hits. Keys include resolved site, locale, pagination and category ownership. Publication/default commits invalidate the dedicated namespace through bounded Redis scanning; Auth remains no-store. Expand/backfill/constraint migrations preserve historical content, and unsafe downgrades reject reused cross-site IDs.

## 啟動與生命週期 / Startup and Lifespan

1. 匯入 `SYSTEM/extension.py` 時，從 `SYSTEM/config.yaml` 載入設定；`SYSTEM/settings.py` 整理 server、security、Redis 與資料庫設定。設定於模組匯入時讀取，修改 YAML 後須重啟程式。
   Importing `SYSTEM/extension.py` loads `SYSTEM/config.yaml`; `SYSTEM/settings.py` derives server, security, Redis, and database settings. Configuration is read at import time, so changes to YAML require a restart.
2. `manage_fastapi.py` 建立 FastAPI、掛載 middleware、搜尋 `APPs/` 中的 `views` router、註冊本機 Swagger／ReDoc 與 Socket.IO 事件，最後以 Socket.IO ASGI wrapper 交給 Uvicorn。
   `manage_fastapi.py` builds FastAPI, mounts middleware, discovers `views` routers under `APPs/`, registers local Swagger/ReDoc and Socket.IO events, then passes a Socket.IO ASGI wrapper to Uvicorn.
3. FastAPI lifespan 依序註冊 async Redis clients、將 `EnumCache.WEB` 設為 FastAPICache backend，並建立單一 async SQLAlchemy engine。建立 client 或 engine 不會立即驗證 Redis／資料庫連線。
   The FastAPI lifespan registers async Redis clients, configures `EnumCache.WEB` as the FastAPICache backend, and creates one async SQLAlchemy engine, in that order. Client and engine construction do not verify service connectivity immediately.
4. HTTP 請求經過 CORS、heartbeat 與 session middleware，再進入文件頁、Portfolio 或 Sys 路由。`EnumCache.SYS` 用於 heartbeat 與 Redis session；Portfolio 的可選回應快取使用 `EnumCache.WEB`。
   HTTP requests pass through CORS, heartbeat, and session middleware before reaching docs, Portfolio, or Sys routes. `EnumCache.SYS` serves heartbeats and Redis sessions; optional Portfolio response caching uses `EnumCache.WEB`.
5. 正常關閉或啟動中途失敗時，lifespan 會 reset FastAPICache，並關閉資料庫 engine 與 Redis clients。啟動流程**不會**自動建立資料表或執行 migration。
   On normal shutdown or a startup failure, the lifespan resets FastAPICache and closes the database engine and Redis clients. Startup **does not** create tables or run migrations automatically.

## 目前的 GET API / Available GET APIs

六支 Portfolio API 都接受 `locale=en|zh-Hans|zh-Hant`（預設 `en`），以及 `is_caching`（預設 `false`）；設為 `true` 時可使用最多 60 秒的 Redis 回應快取。所有文字與技能標籤直接使用指定語言。每支 CBV 只收一個 `query_string: dict = Depends(parser_...)`，parser 組合已解析的 `site_id` 與其他參數，module 使用 `**query_string` 接收。

All six Portfolio APIs accept `locale=en|zh-Hans|zh-Hant` (default `en`) and `is_caching` (default `false`). Setting `is_caching=true` allows a Redis response cache for up to 60 seconds. Text and skill labels are returned directly in the selected language. Every CBV accepts one `query_string` dictionary from its parser, including the resolved `site_id`; modules receive the dictionary with `**query_string`.

| Endpoint                          | 用途 / Purpose                                                                                          | 額外查詢參數 / Additional query                                                                                                          | 回應 / Response                                   |
| --------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `GET /portfolio/site`             | 品牌、個人介紹、社群連結與聯絡入口 / Site branding, profile, social links, and contact entry            | `user` 或 / or `site_id`（互斥 / exclusive）                                                                                             | `{site_id, user, brand, profile, social, chatme}` |
| `GET /portfolio/journey`          | 供地圖與時間線使用的完整旅程，依儲存順序排列 / Complete ordered journey for the map and timeline        | `site_id`（可省略 / optional）                                                                                                           | `JourneyItem[]`                                   |
| `GET /portfolio/experiences`      | 學經歷、內容、詳情及完整技能清單 / Work and education records with details and skills                   | `site_id`（可省略 / optional）, `page=1`, `size=6`（固定 / fixed）                                                                       | `{total, pages, page, size, items}`               |
| `GET /portfolio/projects`         | 專案介紹、完整詳情及技能 / Projects with introductions, full details, and skills                        | `site_id`（可省略 / optional）, `page=1`, `size=6`（固定 / fixed）                                                                       | `{total, pages, page, size, items}`               |
| `GET /portfolio/skill-categories` | 技能分類；每類最多預覽 6 個技能 / Categories with up to six skill previews each                         | `site_id`（可省略 / optional）, `page=1`, `size=6`（固定 / fixed）                                                                       | `{items, total, pages, page, size}`               |
| `GET /portfolio/skills`           | 取得指定分類中的技能，亦可接續分類預覽 / Ordered skills in one category, including preview continuation | `site_id`（可省略 / optional）, `ownerType=category`（預設 / default）, `ownerId`（必填 / required）, `page=1`, `size=6`（固定 / fixed） | `{items, total, pages, page, size}`               |
| `GET /system/heartbeat`           | 依近期心跳估算在線人數 / Estimated online count from recent heartbeats                                  | `is_caching=false`                                                                                                                       | `{online: number}`                                |

`/site` 是單一物件，缺少站點內容回 404；`/journey` 一次回傳地圖需要的資料，沒有資料時回 `[]`。`/experiences` 與 `/projects` 每頁固定 6 筆，超過最後一頁時 `items` 為空；前者每筆提供完整技能字串陣列，後者包含完整專案詳情與技能。

`/site` is one object and returns 404 when site content is missing. `/journey` returns the full map dataset or `[]` when empty. `/experiences` and `/projects` use fixed six-item pages and return empty `items` beyond the last page; experience items include their complete skill labels, and project items include full details and skills.

所有分頁都繼承 `COMMON/schema/resp/resp_common.py` 的 `RespRecords[T]`，使用 `from_records(items, total=..., page=..., size=...)` 計算 `pages=ceil(total/size)`。回應固定為 `{items,total,pages,page,size}`；空集合 total=0、pages=0、items=[]，超頁保留請求頁碼與真實總數。公開 API 每頁固定 6 筆。

All paginated responses inherit `RespRecords[T]` from `COMMON/schema/resp/resp_common.py`. Use `from_records()` to compute pages consistently. The response is `{items,total,pages,page,size}`; empty collections use total=0 and pages=0, while out-of-range requests keep the requested page and actual totals. Public endpoints use size=6.

分類每項提供 `{id,label,skills}`，內層 skills 也使用同一五欄位模型，為該分類的第 1 頁技能預覽。`skills.items` 直接提供指定語言的 `{id,label}`，最多 6 筆；`skills.total` 與 `skills.pages` 描述完整技能集合。展開時以相同 site_id、locale、ownerId 呼叫 `/portfolio/skills?site_id=1&page=2&size=6`，之後逐頁續取。分類預覽使用視窗函式批次查詢，避免每類各查一次。

Each category contains `{id,label,skills}`. Its nested skills response uses the same five fields and represents page 1 of that category, with up to six localized `{id,label}` records. Continue through `/portfolio/skills?site_id=1&page=2&size=6` with the same site_id, locale and ownerId. Window functions batch preview queries across categories instead of querying each category separately.

`/system/heartbeat` 回傳近期心跳對應的估算人數，並非登入帳號或瀏覽器分頁數；設 `is_caching=true` 時最多快取 30 秒。語言、頁碼、size 或 owner 參數錯誤由 API 回傳對應 400；省略 `/skills` 必填的 `ownerId` 由 FastAPI 驗證回 422，找不到分類回 404。完整欄位與範例可在 `/swagger` 查看。

`/system/heartbeat` estimates recent visitors from heartbeats; it does not count logged-in accounts or browser tabs. `is_caching=true` allows up to 30 seconds of caching. Invalid language, page, size, or owner values return the relevant 400 response; an omitted required `/skills` `ownerId` returns FastAPI 422, and an unknown category returns 404. `/swagger` documents fields and examples.

前端的 React 重構規劃見[前端 README](../frontend/README.md)。正式串接時以本後端的 `/portfolio` 路徑、直接回應格式與 OpenAPI 為契約依據；參考前端與舊文件須核對實際版本，不能沿用過時的回應包裝或 `revision` 假設。

See the [frontend README](../frontend/README.md) for the React migration plan. Integration must follow this backend's `/portfolio` paths, direct response shapes, and OpenAPI contract. Check reference code and older documentation against their actual versions rather than assuming obsolete envelopes or `revision` checks.

## 角色管理列表 / Role Management List

管理列表與 Portfolio preview 已共用 `ManagementPermission` class dependency。`roles`、`users`、`sites` 分別要求 `is_manage_roles`、`is_manage_users`、`is_manage_sites`；preview 要求 `is_manage_sites`。每次依伺服器 SESSION 的 ID 重查有效帳號及角色，訪客／停用回 401、權限不足回 403、身份儲存失敗保留 503，成功讀取為 `private, no-store`。用法與擴充界線見 [權限模組](APPs/Management/module/README.md)，Role／User／Site 的 PATCH 與刪除已有對應管理旗標檢查，管理新增仍未實作。

Management lists and portfolio previews share the `ManagementPermission` class dependency. Roles, users and sites require their matching `is_manage_*` flag; preview requires `is_manage_sites`. Each request refreshes the active account and role from the server SESSION ID. Guests/disabled identities receive 401, denied permissions 403, and identity storage failures retain 503; successful reads are private and not cached. See the [permission module](APPs/Management/module/README.md) for usage and extension boundaries. PATCH and deletion use the matching management flag; administration creation and per-resource CRUD grants remain future extensions.

`GET /management/roles` 每列是一個角色，沿用 `{items,total,pages,page,size}`，`items` 是有欄位名稱的物件陣列。前端透過既有代理呼叫 `/api/management/roles`。查詢由 `schema/parser/parser_management.py` 驗證，`module/module_roles.py` 組合 SQL，`schema/resp/resp_management.py` 定義回應，`views_management.py` 提供 HTTP 介面；啟動時由現有路由探索機制載入。

`GET /management/roles` returns one object per role in the shared numbered envelope. The frontend uses `/api/management/roles` through its existing proxy. The parser validates query values, the module builds ORM queries, the response schema defines serialization, and the CBV view supplies HTTP behavior. Existing route discovery registers the endpoint.

| Query     | 預設 / Default    | 規則 / Rule                                                                                                                                                   |
| --------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `page`    | `1`               | 1–9007199254740991；超頁保留頁碼並回傳空 items / Out-of-range pages retain their requested number                                                             |
| `size`    | `6`               | 1–100；不接受 all，公開 Portfolio 仍固定 6 / No full-fetch mode; public Portfolio remains fixed at 6                                                          |
| `filters` | `[]`              | JSON 陣列 `{field, operator, value?}`；每欄一個型別化條件，多欄 AND；文字不分大小寫，`%`、`_` 按字面搜尋 / Typed column predicates before counting and paging |
| `sort`    | `updatetime:desc` | 最多三個不同欄位，依順序優先，例如 `is_active:desc,user_count:desc,role:asc`；可用下表所有欄位 / Up to three ordered, distinct fields                         |

| 回應欄位 / Field  | 來源 / Source                                                           | 用途 / Purpose                                                                                |
| ----------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `id`              | `auth_role.id`                                                          | 角色識別及穩定排序 / Identity and sorting tie-breaker                                         |
| `role`            | `auth_role.role`                                                        | 唯一角色名稱 / Unique role name                                                               |
| `description`     | `auth_role.description`                                                 | 角色說明，可為 null / Nullable description                                                    |
| `is_create`       | `auth_role.is_create`                                                   | 內容新增權限 / Create content                                                                 |
| `is_read`         | `auth_role.is_read`                                                     | 內容管理讀取權限 / Read managed content                                                       |
| `is_update`       | `auth_role.is_update`                                                   | 內容修改權限 / Update content                                                                 |
| `is_delete`       | `auth_role.is_delete`                                                   | 內容刪除權限 / Delete content                                                                 |
| `is_manage_sites` | `auth_role.is_manage_sites`                                             | 網站管理權限 / Manage sites                                                                   |
| `is_manage_users` | `auth_role.is_manage_users`                                             | 帳號管理權限 / Manage accounts                                                                |
| `is_manage_roles` | `auth_role.is_manage_roles`                                             | 角色管理權限 / Manage roles                                                                   |
| `is_default`      | `auth_role.is_default`                                                  | 是否為新註冊帳號的預設角色 / Registration default                                             |
| `is_active`       | `auth_role.is_active`                                                   | 是否允許所屬帳號登入 / Allow assigned accounts to sign in                                     |
| `createtime`      | `auth_role.createtime`                                                  | UTC ISO 8601 建立時間 / Creation timestamp                                                    |
| `updatetime`      | `auth_role.updatetime`                                                  | UTC ISO 8601 修改時間 / Update timestamp                                                      |
| `user_count`      | `COUNT(auth_user.id)`，以 `auth_user.role_id` 分組 / Grouped by role_id | 全部關聯帳號數，包含停用帳號；無帳號回 0 / All assigned accounts, including inactive accounts |

查詢先彙整帳號數再 LEFT JOIN，避免同一角色重複出現。搜尋、篩選與排序都在資料庫執行，再分頁；`total` 是符合條件的完整筆數。各排序欄位 NULL 一律放最後，未指定 id 時補上 `id:asc`。空集合回 `total=0,pages=0,items=[]`。

Counts are aggregated before a LEFT JOIN to preserve one role per row. Search, filtering and sorting run in the database before pagination; total counts all matches. Nulls sort last in both directions, and id:asc breaks ties unless id was explicitly sorted. Empty results use total=0, pages=0 and items=[].

Role／User／Platform 三支 GET 共用 `MANAGEMENT_DEFAULT_SORT=updatetime:desc`；省略 sort 時，最新更新的資料排在前面，同時間依 id:asc 穩定排序。提供 sort 時完全使用指定條件及既有 ID 補充排序；空字串仍回傳 INVALID_SORT。Role 使用 auth_role.updatetime，User／Platform 使用 auth_user.updatetime。

All three GETs share MANAGEMENT_DEFAULT_SORT=updatetime:desc. Omitting sort returns the latest updated records first with ascending ID for equal timestamps. Explicit criteria retain their requested order and the existing ID tie-breaker; an empty sort remains INVALID_SORT. Roles use auth_role.updatetime, while users and platform owners use auth_user.updatetime.

每次請求都查詢資料庫，這支 API 沒有套用回應快取 decorator。無效查詢回 400，detail 為 `INVALID_PAGE`、`INVALID_SIZE`、`INVALID_SORT`、`INVALID_FILTERS` 或 `INVALID_QUERY`；資料庫不可用回 `503 MANAGEMENT_DATABASE_UNAVAILABLE`。Role 讀取沿用 `ManagementPermission(AuthRole.is_manage_roles)`，每次核對目前有效帳號／角色；沿用既有 auth_role／auth_user，不因列表增加新表或 migration。

Each request queries the database; this endpoint has no response-cache decorator. Invalid query values return 400 with the corresponding INVALID_* detail; unavailable storage returns 503 MANAGEMENT_DATABASE_UNAVAILABLE. Role reads enforce current `is_manage_roles` through the shared ManagementPermission dependency and reuse auth_role/auth_user without list-specific schema changes.

## 帳號與網站管理列表 / Account and Platform Lists

三支列表 GET 皆支援 `search`（最多 200 字、大小寫不敏感的 literal contains）及 `search_fields`（JSON 欄位 ID 陣列，白名單驗證）。前端 All 傳送 DataTable 標題對應的所有資料欄位，單選只傳一個；API 若省略 search_fields，預設搜尋允許的 projection 欄位，排除固定 locale。多欄搜尋以 OR 組合，再與既有 filters AND；COUNT 與分頁都在搜尋後執行，沒有額外查全部資料的 API。空文字移除搜尋；%／_ 不作萬用字元。布林使用 true／false，數字做文字包含比對，UTC 日期可用 ISO 或 `YYYY.MM.DD HH:mm:ss` 的部分字串。無效欄位、重複欄位／參數、格式錯誤及過長文字回 `400 INVALID_SEARCH`。共同驗證在 `COMMON/schema/parser/parser_table_search.py`，共同 SQL 在 `COMMON/tools/storage/sqlalchemy/tools_table_search.py`。

`GET /management/users` 與 `GET /management/sites` 沿用角色列表的 `{items,total,pages,page,size}`、page=1、size=6（可調 1–100）、型別化逐欄篩選與最多三欄排序。`module/module_users.py`、`module/module_sites.py` 內的資源類別共用 `module/module_base.py` 的 `ManagementListModule`；`schema/parser/parser_management.py` 內的各資源函式共用欄位篩選、排序、分頁驗證，`schema/resp/resp_management.py` 集中各資源返回類別，HTTP 介面集中於 `views_management.py`。OpenAPI 說明共用條件契約並以 response schema 列出完整欄位。前端呼叫 `/api/management/users`、`/api/management/sites`。

The account and platform GETs share the role list's numbered envelope, pagination limits, typed column predicates and ordered sorting. Resource query classes in module_users.py and module_sites.py share ManagementListModule from module_base.py. Query functions remain in parser_management.py, response classes in resp_management.py, and HTTP routes in views_management.py. Generic predicate validation and SQL application live in COMMON, with resource field capabilities and projection expressions supplied by Management. OpenAPI describes the shared query contract and typed response schemas. The frontend uses the existing /api proxy.

User 的 `role` 與 Role 列表一樣支援 `in`／`not_in` 文字陣列，角色名稱比較不分大小寫；條件在 COUNT 與分頁前執行，供共用 Dropdown list filter 複選使用。

The User `role` field supports the same case-insensitive `in`/`not_in` string arrays as the role list. Predicates apply before counting and pagination for the shared dropdown list filter.

| Endpoint                | 條件欄位 / Predicate fields                             | 額外參數 / Additional query |
| ----------------------- | ------------------------------------------------------- | --------------------------- |
| `GET /management/users` | 下表全部回應欄位，包含 login_count／last_login 彙整欄位 | 無                          |
| `GET /management/sites` | 下表全部回應欄位及 profile_name 組合名稱                | locale=en\|zh-Hans\|zh-Hant |

共用驗證是 `COMMON/schema/parser/parser_column_filters.py::parse_column_filters`，SQL 引擎是 `COMMON/tools/storage/sqlalchemy/tools_column_filters.py::apply_column_filters`；資源只配置白名單、型別、nullable、enum options 及欄位 expression。文字支援 contains／not_contains／equals／not_equals／starts／ends／empty／not_empty；數字／日期支援 equals／not_equals／gt／gte／lt／lte／between，Between 兩界含邊界；布林與 enum 支援 equals／not_equals。nullable 欄位支援空值運算，false／0 不算 empty。文字 empty 忽略與 browser String.trim 相同的空白，否定條件排除 null。每個字串最多 200 Unicode 字元；所有 predicate 在 COUNT 和 LIMIT／OFFSET 前套用。日期接受 `YYYY-MM-DD` 日曆值，按整個 UTC 日篩選；Equals 使用含當日開始、不含次日開始的範圍，Does not equal 排除該日及 null，After 從次日開始，Before 不含選定當日。日期欄位均可使用 Empty／Not empty。既有含 timezone 的 ISO timestamp 保留精確比較並正規化為 UTC；between 仍要求兩個精確 timestamp，日曆 UI 僅呈現指定的六項條件。

角色的 role 欄另外允許 in／not_in，value 為最多 100 個唯一字串。文字比對不分大小寫，重複大小寫變體、型別不合或超限值回 400；空 in 陣列匹配零筆，空 not_in 陣列匹配所有非 null 值。選項清單沿用分頁角色 GET，前端只在開啟選單或按 More 時讀取，不新增無上限的全表 API。

```json
[
  { "field": "email", "operator": "contains", "value": "lee" },
  { "field": "is_active", "operator": "equals", "value": false }
]
```

上例 JSON 以 URLSearchParams 編碼在 filters 參數。上方搜尋使用獨立 search／search_fields，與 filters 同時套用；散落的 boolean query 參數已移除，未知／過期 query keys 回 400 INVALID_QUERY。錯誤欄位、運算、型別、重複條件或反向範圍回 400 INVALID_FILTERS。profile_name 使用當前語言的姓名、漢字姓在前及 nickname fallback；無作品集／翻譯／名稱的提示文案不是可搜尋資料值。

兩者都以帳號為根，每人一列，包含停用帳號與沒有網站的帳號。`id` 一律是 `auth_user.id`，`site_id` 才是網站 ID。User 的成功登入紀錄先彙整再 JOIN，避免重複列；Platform 只 JOIN 指定語言，缺翻譯時不丟棄帳號、不混用其他語言。網站缺失回 `has_site=false`、site_id 與網站欄位為 null；翻譯缺失回 `has_translation=false`、語言內容欄位為 null。`is_published=false`／`is_default=false` 僅篩選有網站且旗標為 false 的列，缺網站的 null 不算 false。

Both lists use one account per row, including inactive accounts and accounts without a portfolio. The row id is auth_user.id; site_id identifies the portfolio. Login records are aggregated before joining. Platform joins only the requested language, retaining accounts with missing translations without falling back. Missing portfolios and translations are explicit nulls, with has_site and has_translation flags. A missing portfolio's null publication/default state does not match a false state filter.

Platform 的 Profile 使用 `has_profile`，以關聯 `EXISTS` 判斷該網站在指定語言下是否至少有一筆 `portfolio_career` 工作／教育經歷及對應 `portfolio_career_locale`。只建立網站或填寫基本介紹不會打勾；沒有經歷或缺少該語言的經歷時為 false；語言停用不隱藏管理資料。此判斷不受網站發布／帳號啟用狀態影響，亦不以專案／技能作為工作教育履歷。判斷直接放在列表 SQL 中，只回傳 boolean，不載入經歷資料、不增加逐列查詢；排序、篩選與總筆數共用同一個表達式。`has_site` 保留網站存在的原意，預覽、編輯及 Default 判斷仍使用它。

The Profile column uses `has_profile`, a correlated EXISTS over careers and the requested-language career translation, including inactive languages. Basic site/profile text alone does not count; publication and owner activation do not affect existence. The list returns only a boolean, with no per-owner reads or career content transfer. Sorting, filtering and pagination counts share this expression; `has_site` continues to mean website existence.

### User 返回欄位 / Account Response Fields

User 列表直接讀取登入信箱，不返回或從 Email 推導 Account／`user`；排序及篩選白名單也不包含 `user`。資料庫的公開作品集 handle 仍由公開網址、身份 API 與 Platform 管理使用，沒有更動資料表或既有資料。

The User list reads the stored login email directly and neither returns nor derives an Account/`user` field. Its sort and filter allowlists exclude `user`. Public portfolio handles remain available to public URLs, identity APIs and Platform management; database columns and existing records are unchanged.

| 欄位 / Field     | 來源 / Source                                                       | 用途 / Purpose                                          |
| ---------------- | ------------------------------------------------------------------- | ------------------------------------------------------- |
| `id`             | `auth_user.id`                                                      | 帳號識別 / Account identity                             |
| `email`          | `auth_user.email`                                                   | 登入信箱 / Login email                                  |
| `role_id`        | `auth_user.role_id`                                                 | 指派角色識別 / Assigned role identity                   |
| `role`           | `auth_role.role`                                                    | 角色名稱 / Role name                                    |
| `is_active`      | `auth_user.is_active`                                               | 帳號狀態；false 為軟刪除 / Account state                |
| `role_is_active` | `auth_role.is_active`                                               | 角色登入狀態 / Role login availability                  |
| `site_id`        | `portfolio_site.id`                                                 | 網站 ID，無網站為 null / Nullable portfolio identity    |
| `has_site`       | `portfolio_site.id IS NOT NULL`                                     | 是否已建立網站 / Portfolio presence                     |
| `login_count`    | `COUNT(record_login.id)`，按 user_id 分組 / Grouped by user_id      | 成功登入總次數，無紀錄為 0 / Total successful sign-ins  |
| `last_login`     | `MAX(record_login.logintime)`，按 user_id 分組 / Grouped by user_id | 最近成功登入，無紀錄為 null / Latest successful sign-in |
| `createtime`     | `auth_user.createtime`                                              | UTC 帳號建立時間 / Account creation time                |
| `updatetime`     | `auth_user.updatetime`                                              | UTC 帳號修改時間 / Account update time                  |

### Platform 返回欄位 / Platform Response Fields

| 欄位 / Field      | 來源 / Source                                                           | 用途 / Purpose                                                                                                                                                       |
| ----------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`              | `auth_user.id`                                                          | 每人一列的識別 / Person row identity                                                                                                                                 |
| `user`            | `auth_user.user`                                                        | 公開作品集網址代號 / Public portfolio URL handle                                                                                                                     |
| `owner_email`     | `auth_user.email`                                                       | 登入信箱，管理表格及詳情中的唯讀 Email；與公開聯絡信箱分開 / Read-only login email                                                                                   |
| `owner_is_active` | `auth_user.is_active`                                                   | 擁有者狀態 / Owner state                                                                                                                                             |
| `site_id`         | `portfolio_site.id`                                                     | 網站識別 / Nullable portfolio identity                                                                                                                               |
| `has_site`        | `portfolio_site.id IS NOT NULL`                                         | 網站是否存在 / Portfolio presence                                                                                                                                    |
| `has_profile`     | 關聯 `EXISTS`（site_id／locale，不過濾停用語言） / Correlated EXISTS    | 至少一筆工作或教育履歷 / Localized career presence                                                                                                                   |
| `is_published`    | `portfolio_site.is_published`                                           | 發布旗標；無網站為 null / Nullable publication flag                                                                                                                  |
| `is_default`      | `portfolio_site.is_default`                                             | 預設首頁旗標；無網站為 null / Nullable homepage flag                                                                                                                 |
| `copyright_year`  | `portfolio_site.copyright_year`                                         | 版權年份 / Copyright year                                                                                                                                            |
| `linkedin`        | `portfolio_site.linkedin`                                               | LinkedIn 連結 / LinkedIn URL                                                                                                                                         |
| `github`          | `portfolio_site.github`                                                 | GitHub 連結 / GitHub URL                                                                                                                                             |
| `medium`          | `portfolio_site.medium`                                                 | Medium 連結 / Medium URL                                                                                                                                             |
| `email`           | `portfolio_site.email`                                                  | 公開聯絡信箱 / Public contact email                                                                                                                                  |
| `chat_icon`       | `portfolio_site.chat_icon`                                              | 聯絡氣泡圖示路徑 / Contact-bubble icon path                                                                                                                          |
| `locale`          | 查詢參數 / Requested locale                                             | 管理語言 / Management language                                                                                                                                       |
| `has_translation` | `portfolio_site_locale.id IS NOT NULL`（指定 locale） / Selected locale | 指定語言內容是否存在 / Translation presence                                                                                                                          |
| `brand_title`     | `portfolio_site_locale.brand_title`                                     | 品牌標題 / Brand title                                                                                                                                               |
| `brand_title_sub` | `portfolio_site_locale.brand_title_sub`                                 | 品牌副標題 / Brand subtitle                                                                                                                                          |
| `first_name`      | `portfolio_site_locale.first_name`                                      | 名 / Given name                                                                                                                                                      |
| `family_name`     | `portfolio_site_locale.family_name`                                     | 姓 / Family name                                                                                                                                                     |
| `nick_name`       | `portfolio_site_locale.nick_name`                                       | 暱稱 / Nickname                                                                                                                                                      |
| `profile_content` | `portfolio_site_locale.profile_content`                                 | 個人介紹 / Profile introduction                                                                                                                                      |
| `edu_code`        | `portfolio_site_locale.edu_code`                                        | 教育簡稱 / Education abbreviation                                                                                                                                    |
| `program`         | `portfolio_site_locale.program`                                         | 教育課程 / Education program                                                                                                                                         |
| `intro_content`   | `portfolio_site_locale.intro_content`                                   | 名字上方介紹 / Introductory text                                                                                                                                     |
| `footer_content`  | `portfolio_site_locale.footer_content`                                  | 頁尾文案 / Footer text                                                                                                                                               |
| `chat_title`      | `portfolio_site_locale.chat_title`                                      | 聯絡氣泡標題 / Contact-bubble title                                                                                                                                  |
| `chat_title_sub`  | `portfolio_site_locale.chat_title_sub`                                  | 聯絡氣泡副標題 / Contact-bubble subtitle                                                                                                                             |
| `chat_content`    | `portfolio_site_locale.chat_content`                                    | 聯絡氣泡文案 / Contact-bubble copy                                                                                                                                   |
| `createtime`      | `auth_user.createtime`                                                  | 主表帳號的 UTC 建立時間；沒有網站也有值 / Primary-account creation time, including accounts without a portfolio                                                      |
| `updatetime`      | `auth_user.updatetime`                                                  | 主表帳號的 UTC 更新時間；沒有網站也有值，並非網站內容修改時間 / Primary-account update time, including accounts without a portfolio; not a website-content timestamp |

以上語言欄位都使用請求的 locale。Platform 的 `createtime`／`updatetime` 使用主表 `auth_user` 的 UTC 建立／更新時間，前端顯示為 Created／Updated；網站表沒有建立／修改時間，因此這不是網站設定或翻譯內容的修改時間。User 不選取也不返回密碼；Platform 的 email 是公開聯絡信箱，User 的 email 是登入信箱。全部 User 欄位可排序，Platform 除固定請求值 locale 之外的欄位都可排序，名稱直接對應 response 欄位。

Localized fields use only the requested locale. Platform `createtime` and `updatetime` are the primary account's UTC creation/update timestamps, displayed as Created/Updated even when no portfolio exists. Portfolio and translation tables do not store these timestamps, so they do not describe website-content changes. User queries never select password data. Platform owner_email reads auth_user.email directly and identifies the account; Platform email remains public contact information. Both login email displays are read-only in the management editor. Every User response field is sortable; every Platform response field except the constant requested locale is sortable.

三支管理列表不使用快取 decorator，透過 ManagementPermission 檢查目前資料庫權限，回應包含 private, no-store／Vary Cookie；沒有新增表或 migration。無效查詢回 400 INVALID_PAGE／INVALID_SIZE／INVALID_SORT／INVALID_FILTERS／INVALID_QUERY，無效語言回 INVALID_LOCALE。資料庫錯誤統一回 503 MANAGEMENT_DATABASE_UNAVAILABLE。

All three lists omit response-cache decorators, check current database permissions through ManagementPermission, and return private/no-store headers varying by Cookie. No migration is required. Invalid queries return the corresponding INVALID_* error with status 400; database failures return 503 MANAGEMENT_DATABASE_UNAVAILABLE.

## 管理與公開可見性 / Management and Public Visibility

Management 列表及六支 Preview 包含停用的目標帳號／語言資料，不以目標 `is_active=true` 作隱藏條件；`has_profile` 也計算停用語言中的實際經歷。管理 PATCH 可以修正既有停用語言內容，不會順便重新啟用。操作者仍須通過啟用帳號、啟用角色與最新管理權限檢查；Default 的啟用 owner／發布條件是另外的業務規則。

公開 Portfolio 由 `PortfolioPublicScopeModule.resolve(..., locale=...)` 在快取之前同時確認 owner 啟用、網站發布與語言啟用；不可見目標／語言統一回 404。內容查詢以 `_localized_query()` 保留公開的啟用條件；只有伺服器授權後的 Preview 內部呼叫會傳 `include_inactive=True`。這個參數不接收客戶端 query，也不會在 module instance 留下可變的預覽狀態。

Management target visibility is independent of soft deletion, while actor authentication remains active-only. Public owner/language visibility is checked before caching. Preview passes a server-only read policy through the existing query methods; client query flags cannot enable inactive public content.

## 平台部分更新 / Platform Partial Updates

`PATCH /management/sites/{account_id}?locale=zh-Hant` 在既有 `ManagementSites` CBV 宣告，沿用 `ManagementPermission(AuthRole.is_manage_sites)`。Path 使用列表 `id`（帳號 PK），後端自行解析網站歸屬；`locale` 只選擇現有翻譯，不修改 FK。Body 與 query 由 `BodyManagementSitePatchRequest`（內含 `BodyManagementSitePatch`）、`parser_management_site_patch` 驗證，原本 `ManagementSitesModule` 同時提供 `select()`、`update()`，透過 `_query()` 共用欄位投影。成功回傳單筆 `RespManagementSite`，不是分頁 envelope。Platform 表格 Active／Default 已串接單欄即時 PATCH；Edit 內完整 Save 使用同一支 PATCH 持久化。

ORM／Enum 分層：驗證後的變更以 ORM 屬性作 key，`update()` 使用必要欄位的 entity；API 名稱透過明確白名單映射，不從欄名動態 getattr。CBV 接收不可變 `ManagementSitePatchParameters`；資料庫／語言沿用 `EnumDBType`／`EnumLocal`。共用權限宣告改為 `ManagementPermission(AuthRole.is_manage_sites)`，身份在邊界轉成嚴格的 `RespAuthUser`。HTTP 與快取 namespace 使用共用定義；詳細維護規則見[管理模組](APPs/Management/module/README.md#orm-欄位與外部契約--orm-bindings-and-wire-contracts)。

The existing Platform CBV and business class own GET and PATCH together. The path selects the owner account, the query selects a language, and the module resolves the existing site/translation. A successful patch returns the complete row using the GET projection. Platform table Active/Default switches save immediately through PATCH. Full-detail Save persists through the same PATCH endpoint.

```http
PATCH /management/sites/2?locale=zh-Hant
Content-Type: application/json

{"expected_owner_email":"person2@example.com","expected":{"first_name":"原名","github":""},"changes":{"first_name":"鄭","github":"https://github.com/example"}}
```

- Body 的 `expected_owner_email` 是唯讀目標確認值，與 path 的帳號 ID 在同一交易內同時比對 `AuthUser.id`／`AuthUser.email`；不匹配回 404 `ACCOUNT_NOT_FOUND`。信箱不放在 URL，也不作為可更新欄位；這是資料一致性核對，不能代替 SESSION 與管理權限。
- `changes` 僅更新明確傳入欄位；未傳保持原值，空 `{}`、明確 `null`、未知欄位與型別轉換一律拒絕。`false` 與允許的空字串是有效值。文字保留原文，不作 HTML 執行。
- PK／FK、登入信箱 `owner_email`、公開代稱 `user`、時間與衍生欄位不在更新白名單；任何這些欄位出現在 `changes` 都回 422，不能透過關聯顯示值間接更新。
- `email` 僅是公開聯絡信箱，與 SMTP 驗證的登入身分獨立；採既有信箱格式與 254 字上限，空字串隱藏。社群連結上限 2048 字，只接受無憑證及空白的 HTTP(S) URL，空字串隱藏；不由後端下載目標網址。圖示只接受前台目前信任的四個 bundled 路徑。
- 短文字沿用儲存欄位長度；四個 Text 欄位各限 10,000 字，拒絕 NUL 與非法 Unicode。年份必須為 1900–9999 的整數；字串、浮點與 boolean 不能冒充整數。
- `ManagementRoute` 在 JSON 解碼前限制實際串流為 256 KiB，包含無 Content-Length 的 chunked body。只接受未壓縮的 application/json；拒絕重複 JSON key、NaN／Infinity 和格式錯誤。驗證回應保留 loc/type/msg，不回傳原始 input、ctx 或資料庫例外內容。
- 帶 Origin 的瀏覽器 PATCH 必須符合 backend 同源、既有 CORS origins 或 `SECURITY.management_write_origins`。Vite 改寫 Host 時，原始 Origin 仍須列入後者；開發設定包含 localhost／127.0.0.1:5173 與 :4173，部署時在私有 YAML 填正式網站 origin。CLI 沒有 Origin 時仍須提供有效 SESSION；不信任 client 提交的 forwarded origin。
- 更新網站欄位要求網站存在；涉及翻譯欄位時，另外要求指定語言翻譯存在；語言停用不阻擋管理修正。PATCH 不建立缺少的資料。`owner_is_active` 是唯一可寫的帳號欄位；僅切換帳號啟用時由既有 onupdate 維護 Updated，其他內容修改不變更帳號時間。沒有網站的帳號也可只改 Active，重送相同值不改 Updated。
- 所有寫入透過 `SqlAlchemyExecAsync.transaction()` 一起提交／回滾。發布／Default 更新在 PostgreSQL 使用交易 advisory lock；SQLite 在讀取決策前取得 writer lock。設新 Default 先驗證最終發布狀態及啟用 owner，再取消舊 Default；重選目前 Default 冪等。Default 網站的帳號禁止停用，回 409 `DEFAULT_SITE_DEACTIVATE_FORBIDDEN`；必須先取消／切換 Default，或在同一 Platform PATCH 明確取消 Default。Active 不隱式清除 Default；取消發布仍清除 Default，明確要求 `is_default=true` 且最終未發布回 409。
- Commit 後沿用 `PortfolioManagementModule.invalidate_cache()` 清除公開 `portfolio` namespace。若快取清除失敗，回 503 `MANAGEMENT_UPDATE_COMMITTED_CACHE_UNAVAILABLE` 與 `X-Management-Update-State: committed`，代表資料已寫入，呼叫端必須重新查詢。公開快取仍採原本最多 60 秒的期限。

Only explicitly supplied mutable fields are written. Strict schemas reject coercion, nulls and identity/relationship changes; bounded transport validation rejects malformed or ambiguous JSON without echoing submitted values. One transaction owns account activation, both content field groups and global-default replacement. A Default website's owner cannot be disabled; clear or switch Default first, or explicitly clear it in the same Platform PATCH. Reactivation never selects a Default automatically. Missing content is never created. Cache failure after commit explicitly distinguishes committed database state from a rollback. Existing account timestamps retain their original meaning.

| 狀態     | 說明                                           |
| -------- | ---------------------------------------------- |
| 400      | 無效 JSON、帳號 selector、語言或 query         |
| 401／403 | 目前身份無效／缺網站管理權限，或 Origin 不允許 |
| 404      | ID／email 配對、網站或所需翻譯不存在           |
| 409      | Default 條件矛盾或資料庫約束衝突；交易回滾     |
| 413／415 | 實際 body 超限／不支援的 Content-Type 或編碼   |
| 422      | 空更新、不可寫欄位、null、型別或欄位內容錯誤   |
| 503      | 儲存不可用；提交後快取失敗使用獨立錯誤碼       |

隔離測試不會連到設定檔中的資料庫、Redis 或 SMTP。以下指令從 `backend/` 執行；PostgreSQL 選項只應指向可拋棄的測試資料庫，每個測試使用獨立 schema 並於結束移除。

Tests use temporary SQLite storage by default and never contact configured services. An optional disposable PostgreSQL URL repeats the HTTP/transaction suite in isolated, automatically removed schemas.

```sh
uv run --locked pytest
PLATFORM_PATCH_TEST_POSTGRES_URL='postgresql+asyncpg://user:password@127.0.0.1:5432/disposable_test' \
  uv run --locked pytest
```

## 設定與依賴 / Configuration and Dependencies

| 位置 / Location                             | 用途 / Purpose                                                                                                                                                                                                                                                                          |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SYSTEM/config.yaml`                        | 納入版本控制的開發預設：loopback、PostgreSQL 部署參數、明確的占位金鑰；正式設定由部署環境私下提供。 / Tracked development defaults with loopback services, PostgreSQL deployment parameters, and an explicit placeholder key; provide production configuration privately at deployment. |
| `SYSTEM/extension.py`、`SYSTEM/settings.py` | 載入 YAML 並整理應用設定。 / Load YAML and derive application settings.                                                                                                                                                                                                                 |
| `alembic.ini`、`SYSTEM/models/migrations/`  | 指向 migration 環境與版本；Alembic 使用目前資料庫設定及 `SYSTEM/models` metadata。 / Migration location and revisions; Alembic uses the configured database and model metadata.                                                                                                         |
| `pyproject.toml`、`uv.lock`                 | 宣告依賴與鎖定解析後版本。 / Declare dependencies and lock resolved versions.                                                                                                                                                                                                           |

`SYSTEM/config.yaml` 至少需要非空的 `SECURITY.secret_key`，以及 `DATABASE.META` 的 `type`、`is_async: true`、`name`。多用戶 migration 使用 PostgreSQL；底層 SQLite 支援保留供工具及隔離測試。API `127.0.0.1:8080`、Redis `127.0.0.1:6379`。`SERVER.locally: false` 讓 server 與 Redis 各自讀取 YAML 的 host／port；設為 `true` 時 server 強制使用 loopback，Redis 固定使用本機 6379。文件路徑由 `URL` 設定；預設 Swagger 是 `/swagger`、ReDoc 是 `/redoc`、OpenAPI 是 `/openapi`。

`SYSTEM/config.yaml` requires a nonempty `SECURITY.secret_key` and `DATABASE.META` values for `type`, `is_async: true`, and `name`. The local API uses port 8080 and Redis port 6379; configure PostgreSQL for the multi-user migration chain. With `SERVER.locally: false`, the server and Redis use their YAML host/port values; `true` forces a loopback server and local Redis on port 6379. Documentation defaults are `/swagger`, `/redoc`, and `/openapi`.

目前 `YamlConfig` 直接讀取此檔案，**沒有環境變數覆寫或 `${VARIABLE}` 插值機制**。正式環境必須將 `SECURITY.secret_key` 換成部署專用的隨機值，並以私有部署檔案或 secret mount 覆蓋此路徑；不要把真實金鑰寫進版本控制的設定。也須依部署設定 `SERVER.host`、HTTPS cookie、Redis 主機與資料庫連線。可在部署環境產生金鑰，再填入私有 YAML：

`YamlConfig` reads this file directly: **environment-variable overrides and `${VARIABLE}` interpolation are not implemented**. In production, replace `SECURITY.secret_key` with a unique random value using a private deployment file or secret mount at this path. Keep real keys out of tracked configuration, and configure the server bind address, HTTPS cookies, Redis host, and database connection for that deployment. Generate a key in the deployment environment and place it in its private YAML:

```bash
uv run --locked python -c "import secrets; print(secrets.token_urlsafe(48))"
```

連線工具支援 `sqlite` 與 `postgresql`；目前多用戶部署及完整 migration 使用 PostgreSQL，須設定 `host`、`port`、`name`、`user`、`password` 並先建立資料庫。SQLite 保留供工具與隔離測試；歷史 revision 包含 PostgreSQL regex、partial index、ALTER TYPE；完整 Alembic 入口會在連線及 DDL 前明確拒絕 SQLite，避免部分升級。`SEC_CORS` origins 由 settings 建立；額外瀏覽器寫入 origin 使用 `SECURITY.management_write_origins`。前端預設 `VITE_API_BASE_URL=/api`，開發／正式 reverse proxy 移除 `/api` 後轉送後端。

Storage tools support SQLite and PostgreSQL. Current multi-user deployment and complete migrations require an existing PostgreSQL database; the Alembic entry rejects unsupported SQLite deployments before connecting or executing DDL. SQLite remains available for isolated tool tests. CORS is derived in settings, while extra browser-write origins use SECURITY.management_write_origins. The frontend defaults to the same-origin /api prefix, removed by its reverse proxy.

使用 SQLite 時，相對的 `DATABASE.META.name` 會依 `SYSTEM/settings.py` 的 `DB_CONF["sqlite"]` 存放在 `SYSTEM/models/sqlite/`，缺少的資料夾會自動建立；`:memory:` 不建立檔案，絕對路徑則保留指定位置。此路徑只適用 SQLite 工具／測試；完整 Alembic 部署入口要求 PostgreSQL。

For SQLite, a relative `DATABASE.META.name` uses `DB_CONF["sqlite"]` in `SYSTEM/settings.py` and is stored under `SYSTEM/models/sqlite/`, which is created when needed. `:memory:` creates no file, while an absolute path keeps its specified location. This path applies to SQLite tool/model tests; full Alembic deployments require PostgreSQL.

| 依賴 / Dependencies                                                | 角色 / Role                                                                                                                |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `fastapi`, `fastapi-utils`, `uvicorn[standard]`, `python-socketio` | HTTP API、CBV、ASGI server 與 Socket.IO / HTTP API, CBVs, ASGI server, and Socket.IO                                       |
| `sqlalchemy[asyncio]`, `aiosqlite`, `asyncpg`, `alembic`           | 非同步 ORM、SQLite／PostgreSQL 驅動與 migration / Async ORM, database drivers, and migrations                              |
| `redis`, `fastapi-cache2`, `starsessions`                          | Redis clients、WEB cache 與 session / Redis clients, WEB cache, and sessions                                               |
| `fastapi-pagination`                                               | 四種集合共用的 ORM 頁碼分頁工具 / Shared ORM numbered pagination for all four collections                                  |
| `pydantic`, `pydantic-settings`, `pyyaml`, `httpx`                 | 資料與設定驗證、YAML 讀取及 HTTP client 設定 / Data and settings validation, YAML loading, and HTTP client settings        |
| `jinja2`                                                           | 已宣告的模板依賴；目前文件頁使用本機靜態資產。 / Declared template dependency; current docs pages use local static assets. |
| `black`                                                            | 開發依賴：排版 / Development dependency: formatting                                                                        |

## 安裝與本機操作 / Installation and Local Workflow

以下順序適用於全新 clone。需要 Git、`uv`、Python 3.13，以及可連線的 Redis。`.python-version` 固定開發用 Python 3.13；`pyproject.toml` 允許 3.13 以上版本。SQLite 驅動隨鎖定依賴安裝，隔離測試不需要額外 SQL 服務；完整部署須先準備 PostgreSQL。依賴第一次下載與 Python 安裝需要網路；離線環境須預先備妥相同版本的環境。前端安裝見[前端 README](../frontend/README.md)。

These steps cover a fresh clone. Install Git, `uv`, Python 3.13, and a reachable Redis service. `.python-version` pins development to Python 3.13; `pyproject.toml` permits 3.13 or later. Locked dependencies include SQLite for isolated tests; complete deployments require PostgreSQL. Initial dependency downloads and Python installation require network access; prepare the same environment in advance for offline use. See the [frontend README](../frontend/README.md) for frontend setup.

### 1. 準備工具與 Redis / Prepare Tools and Redis

macOS 已安裝 Homebrew 時，可依 [uv 安裝文件](https://docs.astral.sh/uv/getting-started/installation/)及 [Redis macOS 文件](https://redis.io/docs/latest/operate/oss_and_stack/install/archive/install-redis/install-redis-on-mac-os/)操作：

On macOS with Homebrew, follow the official [uv](https://docs.astral.sh/uv/getting-started/installation/) and [Redis](https://redis.io/docs/latest/operate/oss_and_stack/install/archive/install-redis/install-redis-on-mac-os/) installation guides:

```bash
brew install uv redis
brew services start redis
redis-cli -h 127.0.0.1 -p 6379 ping
```

`ping` 須回 `PONG`。其他平台可按上述官方文件安裝 uv，並依 [Redis 安裝文件](https://redis.io/docs/latest/operate/oss_and_stack/install/)準備服務。Redis 不隨 Python 套件自動啟動；系統 session、心跳與可選回應快取都依賴它。heartbeat middleware 可以略過 Redis 連線錯誤，但含 session cookie 或啟用快取的請求仍可能失敗，因此完整本機環境應啟動 Redis。

The ping must return `PONG`. On other platforms, install uv through its official guide and provision Redis using the [Redis installation documentation](https://redis.io/docs/latest/operate/oss_and_stack/install/). Python dependencies do not start Redis. Sessions, heartbeats, and optional response caching use it. Heartbeat middleware tolerates Redis connection failures, but requests with session cookies or caching can still fail; start Redis for the complete local environment.

### 2. 取得專案與鎖定依賴 / Clone and Install Locked Dependencies

```bash
git clone https://github.com/zhenglee315/portfolio-modern.git
cd portfolio-modern/backend
uv python install 3.13
uv sync --locked
```

`uv sync --locked` 依 `uv.lock` 建立 `backend/.venv`，包含開發依賴；若鎖定檔與宣告不一致，指令會失敗，避免安裝時偷偷重解版本。`tool.uv.package = false` 讓 uv 只管理依賴，不將後端原始碼建置成套件。現有 Python 3.13 可省略 `uv python install`。`uv run --locked` 自動使用專案環境，不必先 `source .venv/bin/activate`；如要直接使用 `python`，macOS／Linux 可手動啟用該環境。

`uv sync --locked` creates `backend/.venv` from `uv.lock`, including development dependencies. It fails when declarations and the lockfile disagree, rather than silently resolving different versions. With `tool.uv.package = false`, uv manages dependencies without building the backend source as a package. Skip `uv python install` if Python 3.13 is already available. `uv run --locked` selects the project environment automatically; activate `.venv` manually only when running `python` directly.

### 3. 檢查設定並建立資料表 / Check Configuration and Migrate

檢查 `SYSTEM/config.yaml`，為多用戶版本準備 PostgreSQL 連線與既有資料備份。先建立資料表，再啟動 API：

Configure PostgreSQL in SYSTEM/config.yaml and back up existing data before multi-user migrations. Create tables before starting the API:

```bash
uv run --locked alembic upgrade head
uv run --locked alembic current
```

後端啟動不自動建立資料表或執行 migration。SQLite 分支的相對 `DATABASE.META.name` 存放在 `SYSTEM/models/sqlite/`，`:memory:` 與絕對路徑保留原語意；檔名不必有 `.db` 副檔名。SQLite 檔案、journal／WAL 及實際使用者資料不納入版本控制。完整歷史 migration 請使用 PostgreSQL；SQLite 測試使用隔離 schema 建立或獨立驗證支援該方言的新 revision。

Backend startup does not create tables or run migrations. Relative SQLite names resolve under SYSTEM/models/sqlite/, while memory and absolute paths retain their meaning. Keep database files, journals/WAL and user data out of Git. Use PostgreSQL for the complete historical migration chain; isolated SQLite tests create their schema or exercise individually compatible revisions.

### 4. 啟動與確認 / Start and Verify

```bash
uv run --locked manage.py
```

預設 API 為 `http://127.0.0.1:8080`，Swagger 為 `http://127.0.0.1:8080/swagger`。開啟另一個 terminal 檢查：

The default API is `http://127.0.0.1:8080`, with Swagger at `http://127.0.0.1:8080/swagger`. In another terminal, check:

```bash
curl -fsS http://127.0.0.1:8080/openapi.json > /dev/null
curl -fsS 'http://127.0.0.1:8080/portfolio/projects?locale=en&page=1&size=6'
```

新資料庫沒有作品集內容；`/portfolio/site?locale=en` 在沒有對應語言的已發布首頁時回傳 404。建立自己的作品集內容後，可用此端點確認個人資料。後端統一從 `backend/` 執行 `uv run --locked manage.py`，同時啟動 FastAPI 與 APScheduler。FastAPI 子程序 `manage_fastapi.py` 使用 `create_app()` application factory，並由目前檔名與函式名稱產生 Uvicorn import string；`SERVER.worker` 可設定為大於 1，由各 worker 建立自己的應用程式並執行 lifespan。`SERVER.reload` 目前沒有傳給入口的 Uvicorn 呼叫，不能將它視為已實作的熱重載。

A new database has no portfolio content; `/portfolio/site?locale=en` returns 404 without a published default site in that locale. After creating your own content, use this endpoint to verify the profile. Start FastAPI and APScheduler together with `uv run --locked manage.py` from `backend/`. The FastAPI child entry point `manage_fastapi.py` uses the `create_app()` application factory and derives Uvicorn's import string from the current filename and function name. `SERVER.worker` can be greater than 1; each worker creates its own application and runs its lifespan. `SERVER.reload` is not forwarded to Uvicorn and does not currently enable hot reload.

### Worker 監控 / Worker Monitoring

[`SYSTEM/events.py`](SYSTEM/events.py) 集中定義兩類 Socket.IO 枚舉：`NameSpace.MONITOR` 對應命名空間 `/monitor`，`EventMonitor` 定義監控的訂閱、重新同步、退訂、測試、測試回應、快照及狀態事件。各功能的事件類別依 `Event<用途>` 命名；事件註冊與推送共用同一份定義，原有前端通訊字串保持相容。Socket.IO namespaces belong to `NameSpace`, while purpose-specific event enums such as `EventMonitor` define incoming and outgoing event names in the same module.

Worker 監控核心位於 `SYSTEM/tools/tools_monitor.py`，由 `WorkerMonitor` 管理；`MonitorMiddleware` 位於 `SYSTEM/middleware/utils/middleware_monitor.py`，透過 middleware 套件統一匯出及註冊。系統基礎設施不依賴 `APPs` 業務模組。每個 worker 的 lifespan 在 Redis／SQL 初始化後建立 `app.state.monitor` 並啟動背景回報；middleware 與 SQLAlchemy 事件只更新程序內統計。背景回報同步將完成事件加入 SYS Redis queue，由 scheduler 寫入 `record_request`。關閉時先停止回報與移除事件，再關閉 Redis；Monitor Overview 已提供流量、登入／國別、採樣可用率及服務資訊 HTTP API，另由 SYS Redis 提供本 run 成功／失敗累計；見 [Monitor API](APPs/Monitor/README.md)。

Worker monitoring lives in `SYSTEM/tools/tools_monitor.py`, owned by `WorkerMonitor`. `MonitorMiddleware` lives in `SYSTEM/middleware/utils/middleware_monitor.py`, exported and registered through the middleware package. Each worker's lifespan injects its dependencies. Middleware updates local observations; the background publisher updates live snapshots and queues completed requests in SYS Redis. The scheduler persists that separate queue to `record_request` every minute. Shutdown stops reporting before closing shared storage. Monitor Overview HTTP APIs expose traffic, distinct sign-ins/countries/local-network accounts, sampled availability, service metadata and current-run SYS Redis request totals; see [Monitor API](APPs/Monitor/README.md).

| 檔案 / File                                     | 責任 / Responsibility                                                                                                                                                                             |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `manage_fastapi.py`                             | Application factory、ASGI middleware 外層與原生 Uvicorn supervisor 接線。 / Application factory, outer monitoring middleware and native supervisor integration.                                   |
| `SYSTEM/lifespan.py`                            | 初始化後啟動採樣與推送，關閉時依序回收背景工作及連線。 / Starts sampling and streaming after initialization; stops tasks before closing connections.                                              |
| `SYSTEM/settings.py`                            | 統一 `MONITOR_CYCLE_SEC` 採樣／推送週期。 / Shared sampling and publishing cycle.                                                                                                                 |
| `SYSTEM/tools/tools_monitor.py`                 | WorkerMonitor／MonitorSupervisor／MonitorStream：採樣、統計、重啟觀察、Redis 彙整與授權變更推送。 / Sampling, counters, replacement tracking, Redis aggregation and authorized change publishing. |
| `SYSTEM/middleware/utils/middleware_monitor.py` | 記錄 HTTP 進入到最後 ASGI body／trailers，更新本機統計。 / Tracks HTTP entry through the final ASGI body/trailers and updates local counters.                                                     |
| `SYSTEM/tools/tools_socketio.py`                | 掃描事件、Socket.IO 啟停、讀取 Session 及綁定監控推送服務。 / Event discovery, Socket.IO lifecycle, session loading and monitor stream setup.                                                     |
| `APPs/Monitor/events_monitor.py`                | `/monitor` 事件、目前 Session 權限檢查與訂閱入口。 / Namespace events, current session authorization and subscription entry points.                                                               |
| `SYSTEM/scripts/check_monitor.py`               | 讀取 Redis 快照的診斷 CLI。 / Read-only snapshot diagnostic CLI.                                                                                                                                  |

HTTP 請求本身由原 Worker 執行；middleware 更新程序內觀測資料。背景採樣更新有期限的 Redis 快照，Socket.IO 彙整供前端顯示；同一筆 Redis 交易另將完成事件加入無期限的 Stream queue，供 scheduler 落庫，不影響前端讀快照。

HTTP requests execute in their accepting worker. Background sampling writes expiring snapshots for Socket.IO and appends completed events to a separate persistent Redis Stream for minute-based SQL ingestion. Redis queues observations, not HTTP execution.

- Redis：沿用 `EnumCache.SYS`（目前 DB 0），key 前綴為 `system:monitor`，與 session／訪客心跳分開。採樣及 Supervisor 回報共用 `SYSTEM/settings.py` 的 `MONITOR_CYCLE_SEC: float = 0.5`；請求／交易事件只更新記憶體，合併至下一輪採樣。心跳 TTL 15 秒，快照及管理器目前狀態保留 60 秒後自動到期；request queue 與異常事件 queue 無 TTL，已 commit 的正常事件由消費者移除。
- 資源：CPU 以單一邏輯核心容量為基準，可能超過 100%；第一次採樣為 `null`。RAM 為 RSS bytes，多程序 RSS 加總可能包含共享記憶體。運行時間使用程序建立時間與單調時鐘。
- 請求：保留處理中明細及最近 60 秒完成事件，每個 worker 最多各輸出 200 筆處理中／已結束明細。欄位包括 Request ID、Worker／PID、Method、Path、進入／離開時間、ASGI 階段、HTTP、已處理／總耗時及 IP／地區。超量時回報截斷旗標，總併發計數仍維持完整；最近平均值只依保留事件列表計算。串流最後 body／trailers 才算完成，取消、斷線、錯誤及 worker 退出分開標示。健康檢查及文件端點預設排除，可透過 middleware 的 `exclude` 調整；Socket.IO、WebSocket 與回應後背景工作不混入 HTTP 計數。
- 掛載：入口另以 `MonitorMiddleware(..., state=self.app.state)` 包住完整 ASGI app，以觀察 FastAPI 外層產生的 HTTP 500。scope 標記讓既有內層掛載略過重複計數；正常回應與 500 都只登記一次。
- 開機累計：`GET /monitor/request-totals` 直接讀取 `EnumCache.SYS` 的 `system:monitor:metrics:requests:<instance/run hash>`，不查歷史 SQL。Middleware 在最後 body／trailers 後計數，HTTP 2xx／3xx 成功；4xx／5xx、異常、取消及斷線失敗。既有 Worker 採樣週期合併寫入 Redis；Lua 以每個 process 的累計 checkpoint 原子增加差額，避免重試或亂序寫入重複計數。Worker 替換保留本次 run 的總數；完整伺服器重啟使用新 run 歸零。閒置每 30 秒續期、停止回報 24 小時後過期。各 Worker 的 `completed_requests_total`／`failed_requests_total` 同時由 workers Socket.IO topic 提供，表示該程序啟動後累計。API 沿用 `is_manage_sites` 權限及 private/no-store，拒絕 query 參數與回應快取；Redis 不可用回 503，不偽造零。
- IP／地區：只採用 Uvicorn 處理後的 ASGI `client`，不直接讀請求的轉送標頭。入口的 `SERVER.forwarded_allow_ips` 預設為 `127.0.0.1,::1`；反向代理位於其他位址時，部署設定須明確列出可信代理 IP／CIDR。保留 IPv4／IPv6，IPv4-mapped IPv6 正規化為 IPv4。地區重用既有本地 `GeoIpReader`，背景執行並使用有期限、最多 1024 筆的程序內快取；內網／未知／資料庫不可用均有明確狀態。地區代表 IP 的粗略推估，不代表使用者實體位置；不記錄 query、body、cookie 或授權標頭。
- 交易：透過 `CONN_MANAGER.get_engine().sync_engine` 識別本應用的 engine，只監聽最外層 Session 邏輯交易，包含讀取觸發的 autobegin。監控不建立 session、不執行 SQL；數據只回報到 Redis SYS。Commit、rollback、close 均會結束計數，SAVEPOINT 不另計。開啟中的交易數不等於正在執行 SQL 的數量。
- 重啟：由入口的 `WorkerMonitor.supervise(...)` 觀察原生 Uvicorn 管理器替換。各 slot 的 `restarts` 只計意外替換；SIGHUP 更新另計 `reloads`，擴縮容分開處理。本次 manager run 結束後不跨次累計。已退出的程序標記短期保留，避免舊快照被誤認為存活。
- 相容性：入口保留 `app=f"{Path(__file__).stem}:{create_app.__name__}"`。管理器接線使用 Uvicorn 內部介面，因此固定 `uvicorn==0.54.0`；升級時需重新驗證強制退出、reload、擴縮容及關閉行為。直接從其他 Uvicorn CLI 啟動而未使用此接線時，重啟次數顯示未知。
- 可用性：Redis 故障不阻塞 HTTP 路徑；回報有逾時與重試。沒有有效心跳時顯示 `stale`，不把舊數據解讀成即時狀態。短請求透過暫存的完成事件回報；若程序在下一次回報前突然退出，未回報的事件仍可能遺失。這是短期觀測資料，不是審計紀錄。
- UI 語義：HTTP 忙碌 worker 依 `active_requests` 判斷，與 DB 交易忙碌分開。`health_basis=lifespan_heartbeat` 僅表示 Worker 心跳，UI 顯示「心跳正常」；Overview 的 HTTP／Redis／SQL 健康則由獨立分鐘探測提供，兩者不可混用。每個 worker 有自己的 `observed_at`，彙整結果是非同步快照，並非跨程序原子快照；完成時間表示最後 ASGI 回應送出，不代表客戶端已確認接收。

Redis uses SYS (currently DB 0) under `system:monitor`. Worker and supervisor reports share `SYSTEM/settings.py: MONITOR_CYCLE_SEC = 0.5`; local request/transaction changes are batched into the next sample. Heartbeat TTL is 15 seconds, and snapshots expire after 60 seconds. Each worker retains up to 200 recent request events and outputs up to 200 active details with explicit truncation flags. Events include identity, method/path, times, ASGI phase, HTTP outcome, duration, normalized client IP and local GeoIP enrichment. Private/unknown IPs have explicit location states. Proxy headers are only trusted from `SERVER.forwarded_allow_ips` (default loopback); configure actual proxy IPs/CIDRs in deployment settings. GeoIP runs in the background with bounded, expiring cache; request query/body/credentials are not recorded. CPU is relative to one core, RAM is RSS, transaction counts cover outer logical Session scopes. HTTP busy and transaction busy are separate. Health represents lifespan heartbeats, not an HTTP probe; observations are asynchronous per-worker snapshots, not a globally atomic trace. Events can be lost if a process dies before publishing. The native supervisor adapter remains pinned to Uvicorn 0.54.0; unexpected restarts, reload and scaling are counted separately.

`WorkerMonitor.read_snapshot()` 提供 UI 可直接映射的資料分組；`run_id` 可篩選特定管理器執行，`window_seconds` 指定事件顯示視窗：

`WorkerMonitor.read_snapshot()` exposes the following UI data groups; optional `run_id` selects a manager run and `window_seconds` selects the event display window:

| UI        | 資料 / Data                                                                                 | 語義 / Meaning                                                                                                                                                                                                                          |
| --------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Worker 表 | `current_workers`                                                                           | 目前 slot，含 PID、CPU、RSS、運行時間與重啟；尚無快照的 slot 使用 unknown／starting。 / Current slots, including unknown/starting placeholders.                                                                                         |
| 請求卡    | `summary.active_requests`、`summary.busy_workers`、`summary.idle_workers`                   | 只計新鮮 HTTP 觀測；`active_requests_complete=false` 表示不完整。 / Fresh HTTP observations with explicit completeness.                                                                                                                 |
| 完成卡    | `summary.recent_completed_requests`、`recent_average_duration_ms`、`recent_max_duration_ms` | 依保留事件列表計算，截斷時不能當成完整流量。 / Based on retained events, not full traffic when truncated.                                                                                                                               |
| HTTP 2xx  | `summary.recent_http_2xx`                                                                   | 符合示意圖 2xx 篩選的 count、average_duration_ms、max_duration_ms。 / Successful-response subset for the mockup.                                                                                                                        |
| 事件表    | `requests`                                                                                  | 依進入時間倒序；含 slot、PID、IP、country_code、region、city、geo_status、location；本機／私有 IP 的 location 為 `local`。 / Entry-time descending events with worker/IP/location; local and private IPs use the `local` display label. |
| 狀態卡    | `summary.running_workers`、`expected_workers`、`abnormal_workers`、`health`                 | 心跳狀態與目標數，避免把資料過期誤認為健康。 / Heartbeat capacity with stale data treated as unknown.                                                                                                                                   |
| 服務列    | `supervisors[].server`                                                                      | 實際 Uvicorn host、port、application、factory、目標 worker 數。 / Actual Uvicorn configuration.                                                                                                                                         |

從 `backend/` 執行可移除的自測 CLI；預設只印一次，`--watch` 持續查看，`--json` 輸出 JSON。它只讀取目前快照：

From `backend/`, run the removable read-only diagnostic CLI. Default output is one snapshot; add `--watch` for periodic reads or `--json` for JSON:

```bash
uv run python -m SYSTEM.scripts.check_monitor --watch --requests
```

隔離測試預設不連任何設定中的資料庫／Redis。設定 `MONITOR_TEST_REDIS_URL` 才會額外啟動四個本機測試 worker，使用記憶體 SQLite 與指定 Redis 的隨機測試前綴，驗證 TTL、SIGKILL 補位、SIGHUP、擴縮容及 CLI，結束時清理程序與測試 key。請使用可拋棄的測試 Redis：

Unit tests do not connect to configured SQL/Redis services. Setting `MONITOR_TEST_REDIS_URL` enables four local test workers using in-memory SQLite and a random Redis prefix. Integration tests cover expiry, SIGKILL replacement, reload, scaling and the CLI, then clean up processes and test keys. Use a disposable test Redis:

```bash
uv run --locked pytest tests/test_monitor.py -v
MONITOR_TEST_REDIS_URL=redis://127.0.0.1:16379/0 uv run --locked pytest tests/test_monitor.py -v
```

### Socket.IO 啟動與連線自測 / Startup and Connectivity Probe

沿用 `APPs/<project>/events*.py` 的事件檔案慣例。入口呼叫 `socketio_init_app()`，由 `SYSTEM/tools/tools_socketio.py` 掃描並以完整套件名稱匯入，例如 `APPs.Monitor.events_monitor`；同一個 interpreter 重複初始化不會重跑已匯入的事件模組。相對路徑以 backend 根目錄解析，載入順序固定，錯誤會使啟動失敗。`SYSTEM.extension` 保留每個 worker 的單一 `sio`；lifespan 關閉時透過 `socketio_shutdown()` 停止背景監聽並關閉它獨立持有的 Redis 資源。

Event discovery follows `APPs/<project>/events*.py`. `socketio_init_app()` imports canonical package names with normal import caching, deterministic ordering and backend-relative paths. The worker-local `sio` remains in `SYSTEM.extension`; lifespan uses `socketio_shutdown()` to stop its listener and close its separate Redis resources.

`APPs/Monitor/events_monitor.py` 提供正式 `/monitor` 訂閱。握手、訂閱及每個監控週期均重新讀取 HTTP-only Session 與資料庫目前的 `is_monitor`；前端自報身份／權限無效。權限撤銷或登出會退出房間並斷線，儲存服務不可用時停止提供資料。授權僅讀資料庫、不保存監控資料，且其邏輯交易不計入應用 transaction。

The `/monitor` namespace requires an active server-side Session and current database-issued `is_monitor` permission. Authorization is rechecked at connect, subscription and each cycle, including quiet periods. These read-only permission lookups are excluded from application transaction metrics. Socket session reads do not refresh the cookie or Redis session TTL.

- `monitor_subscribe` / `monitor_resync`: `{topics: ["workers", "requests"]}`；每個主題回傳 `monitor_snapshot`，包括 `schema`、`topic`、字串 `revision`、`sampled_at`、`cycle_seconds`、`data`。
- `monitor_unsubscribe`: 離開目前訂閱房間。初次／重連／恢復取得完整主題快照；`revision="0"` 為訂閱快照，正常廣播使用 Redis 產生的遞增版本。前端丟棄已接收版本以前的快照。
- `workers` 僅包含資源及 Worker 狀態；`requests` 包含 HTTP／transaction 計數與請求明細。請求統計排除同實例的舊啟動批次，仍保留本批次退出 Worker 的短期事件。
- 同一實例透過 SYS Redis 租約選出發布者，採樣完成後按共用週期聚合；非發布者不重複廣播。房間跨 Worker 交由 `AsyncRedisManager` 傳送；訂閱 presence、租約、比較雜湊與版本都有期限。發布者接手會重新同步。
- 每個主題只在資料有變更時廣播完整快照；採樣時間、運行時間與處理中耗時不影響比較。心跳及正常 Socket.IO ping 仍持續，資料沒有推送不等於斷線。首次／重新同步與發布者接手是例外。
- `/socket.io` 是後端傳輸路徑，`/monitor` 是 namespace；兩端限定 WebSocket。前端走同源 `/api/socket.io`，Vite 與 Nginx 分別移除 `/api` 前綴並轉送 Upgrade。Nginx 保留公開 Host，讀取逾時 75 秒。

A single leased publisher per instance sends changed, bounded topic snapshots through the existing Redis manager. Heartbeats continue independently. Reconnect and publisher takeover resynchronize current state; this is not durable event replay. The browser derives elapsed/uptime counters and freezes them with the snapshot. Short requests may first appear completed. The diagnostic `monitor_test` event remains available only after authorized connection.

前端使用 `socket.io-client` 時的接線範例（後端 URL 由部署設定提供）：

```javascript
const socket = io(`${API_ORIGIN}/monitor`, {
  path: "/socket.io",
  transports: ["websocket"],
});
socket.on("monitor_snapshot", console.log);
socket.on("connect", () => {
  socket.emit("monitor_subscribe", { topics: ["workers", "requests"] });
  // Optional connectivity probe; normal monitoring uses monitor_snapshot.
  socket.emit("monitor_test", { message: "hello monitor" }, console.log);
});
```

成功回傳 `{"ok": true, "message": "hello monitor", "pid": 12345, "sid": "...", "transport": "websocket"}`。同一條連線重複測試的 PID 應相同；worker 重啟後重連可以取得不同 PID／SID。若使用 Socket.IO ACK，事件也回傳同一份結果。額外欄位、非字串或過長訊息回傳 `INVALID_PAYLOAD`，不回顯輸入內容。

Redis Pub/Sub 使用 `SOCKETIO.channel`（預設 `portfolio-modern:socketio`）；共用 Redis 的不同部署環境應使用不同 channel，DB index 不提供 Pub/Sub 隔離。Socket.IO 預設只接受同源連線；若開發前端直接跨 port 連後端，可在 `SOCKETIO.allowed_origins` 明確列出前端來源。FastAPI CORS 設定不會自動套用到 Socket.IO。

Optional `SOCKETIO.channel` separates deployments sharing Redis. Optional `SOCKETIO.allowed_origins` permits explicit cross-origin clients; its default retains Socket.IO's same-origin check. FastAPI CORS does not configure the Socket.IO endpoint.

```bash
uv run --locked pytest tests/test_socketio.py -v
SOCKETIO_TEST_REDIS_URL=redis://127.0.0.1:16379/0 uv run --locked pytest tests/test_socketio.py -v
```

第二個指令需使用隔離 Redis，會啟動四個測試 worker，驗證 WebSocket 握手、namespace 事件、固定 worker、不同 worker 經 Redis 定向推送，以及 SIGKILL 後補位和重新連線。測試專用指令佇列只存在於 `tests/test_socketio.py`，不會註冊到應用程式。另驗證正式訂閱與跨 Worker 請求快照。測試不連線設定中的 SQL／Redis；權限案例使用隔離 SQLite 和 Session。

### 5. 常見問題 / Troubleshooting

新增的 API 回傳 404、舊 GET 仍正常時，先檢查執行中的 `/openapi.json` 是否包含該路徑與 HTTP method。若原始碼已有路由、執行中的 schema 卻沒有，請在啟動後端的 terminal 按 Ctrl+C，再執行 `uv run --locked manage.py`；目前入口不會自動重載程式碼。若路由已存在，才依回應的 detail 檢查身份確認、網站或翻譯資料是否存在。

If a new endpoint returns 404 while existing GET requests work, check its path and HTTP method in the running `/openapi.json`. When source contains the route but the running schema does not, stop the backend with Ctrl+C in its terminal and run `uv run --locked manage.py` again; this entry point does not reload source automatically. If the route is registered, inspect the response detail for missing identity confirmation, site or translation data.

| 現象 / Symptom                                        | 處理方式 / Resolution                                                                                                                                                                       |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SECURITY.secret_key` 驗證失敗 / Key validation fails | 保持非空字串；正式環境使用私有金鑰檔案，不依賴尚未實作的環境變數覆寫。 / Configure a nonempty string; production uses a private key file rather than unsupported environment overrides.     |
| Redis connection refused                              | 確認服務正在執行，並以 YAML 的 host／port 執行 `redis-cli ... ping`。 / Start Redis and ping the configured host and port.                                                                  |
| `no such table`                                       | 在 `backend/` 執行 `uv run --locked alembic upgrade head`，確認 API 與 migration 使用同一份設定。 / Apply migrations from `backend/` and ensure API and migrations share the configuration. |
| `/portfolio/site` 回 404 / returns 404                | 尚無對應語言的已發布首頁；建立自己的作品集內容並確認發布狀態與語言。 / Create your own portfolio content and verify that a default site is published in the requested locale.               |

## 分頁與技能方法索引 / Pagination and Skill Reference

| 類別／方法 / Class or method                                              | 參數 / Parameters                                       | 職責與回傳 / Responsibility and result                                                                                              |
| ------------------------------------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `RespRecords[T]`                                                          | items、total、pages、page、size                         | 共用 typed response；items 必為陣列，總數和頁數非負、頁碼和容量為正 / Shared typed response with required items and numeric bounds. |
| `RespRecords.from_records()`                                              | items；keyword-only total、page、size                   | 計算 pages，建立回應；size ≤ 0 回 ValueError / Compute page count and build the response; reject nonpositive size.                  |
| `parser_pagination()`                                                     | page=1、size=6                                          | 驗證正頁碼與固定容量；回傳 dict / Validate page and fixed capacity, return a dictionary.                                            |
| `parser_portfolio_site()`                                                 | user?、site_id?、locale、is_caching                     | 唯一公開帳號查找；回傳已解析 site_id 及共用參數 / Sole public account lookup with resolved identity and common parameters.          |
| `parser_portfolio_content()`                                              | site_id?、locale、is_caching                            | 驗證公開可見性並組合內容參數；拒絕 user / Resolve visible content by ID/default and reject user selectors.                          |
| `parser_portfolio_records()`                                              | content query_string、pagination                        | 在共用內容參數加上頁碼 / Add numbered pagination to the common content dictionary.                                                  |
| `parser_portfolio_skills()`                                               | content query_string、owner_type、owner_id              | 合併參數，限定 category 並驗證非空 ownerId / Validate category ownership and combine parameters.                                    |
| `PortfolioSkillsModule.__init__()`                                        | site_id、locale、page、size、owner_type?、owner_id?     | 建立分類與技能共用查詢上下文 / Initialize query context for categories and skills.                                                  |
| `PortfolioSkillsModule._skill_query()`                                    | 無 / None                                               | 組裝指定語言的技能關聯查詢 / Build the localized skill membership query.                                                            |
| `PortfolioSkillsModule.select_categories()`                               | 無 / None                                               | 回傳分類頁與批次取得的 skills 第 1 頁 / Return category pagination and batched nested skill previews.                               |
| `PortfolioSkillsModule.select_skills()`                                   | 無 / None                                               | 驗證分類存在，回傳有序技能頁 / Check category existence and return ordered skill pagination.                                        |
| `PortfolioExperiencesModule.select()`、`PortfolioProjectsModule.select()` | 無 / None                                               | ORM 分頁後以共用 from_records 建立回應 / Build the shared response after ORM pagination.                                            |
| `PortfolioSkills.get_skill_categories()`、`PortfolioSkills.get_skills()`  | 單一 query_string 注入 / One combined parser dictionary | 宣告 HTTP schema，委派 module 執行 / Declare HTTP schemas and delegate business queries.                                            |

`RespPortfolioExperiences`、`RespPortfolioProjects`、`RespPortfolioSkills`、`RespPortfolioSkillCategories` 僅特化共用模型的 item 型別；`RespPortfolioSkillCategoryItem.skills` 直接使用 `RespPortfolioSkills`。分頁欄位不得在各 API 重複宣告或計算。

The four resource responses specialize only the item type of the shared model. Category skills directly use `RespPortfolioSkills`; keep pagination fields and arithmetic in the common response.

套件準備階段以 `tool.uv.no-binary-package` 對 `charset-normalizer` 使用純 Python 版本，避免載入選用的原生加速檔。封閉網段仍需事先備妥與目標 OS／CPU／Python 相容的全部依賴；本機開發的虛擬環境不可直接搬到不同作業系統。

The dependency preparation step builds the optional charset detector as pure Python. Prepare all locked dependencies for the actual target OS, CPU and Python before entering the isolated network; a development virtual environment is not a cross-platform deployment artifact.

### Role / User / Platform 編輯契約

三支 PATCH 均位於原 Management CBV，對應原 Module 的 select／update，查詢投影共用 `_query()`。Role：`PATCH /management/roles/{role_id}`，body 為 `{expected_role, expected, changes}`；User：`PATCH /management/users/{account_id}`，body 為 `{expected_email, expected, changes}`；Platform：`PATCH /management/sites/{account_id}?locale=en`，body 為 `{expected_owner_email, expected, changes}`。expected 必須和 changes 有相同欄位，承載使用者開始編輯時的原值，不能代替 SESSION 授權；原值不同回 409 MANAGEMENT_EDIT_CONFLICT。未送、null、false、空字串分別處理，只有 Role description 允許明確 null。此契約新增 expected，舊前端亦須更新。

Role 允許 role（1–64 字元、無首尾空白且唯一）、description（最多 10,000 字元或 null）、八個權限、is_default、is_active。User 允許 is_active 與 role_id 角色指派；PK、其他 FK、已驗證 Email、public user、密碼、時間及統計不接受寫入。不同入口分別要求 AuthRole.is_manage_roles／is_manage_users／is_manage_sites，不以內容 is_update 替代。角色指派權限上限由明確的 ORM `ROLE_PERMISSION_COLUMNS` 定義；新增權限時須同步更新 ORM、授權／SESSION、DTO 與此清單。

`ManagementWriteState` 接收既有交易，不自行提交。固定順序為 auth-management 交易鎖、publication 鎖、當前操作者、目標列；等待後重新查操作者權限。User 與 Platform 使用同一 activate 操作；Default 網站的帳號不可停用，先取消／切換 Default 後才可停用，恢復帳號不自動恢復 Default。Platform 可在同一交易明確取消 Default 再停用。Role 停用不批改 AuthUser.is_active。以有效帳號與有效角色的 is_manage_roles 判定最後管理員，禁止從 Role、User、Platform 任一入口移除最後有效管理員；既有零管理員資料可經授權的外部修復流程恢復，不自動選擇帳號。

註冊角色 Default 必須啟用且無三個 management 權限。選新 Default 在同一交易取消舊值；唯一的 Default 不允許直接取消或停用。Role 名稱與權限更新不改寫既有帳號的 role_id。註冊 INSERT 在取得 `AUTH_MANAGEMENT_WRITE_LOCK_KEY` 後才讀 Default snapshot，避免等待鎖後使用舊狀態。PostgreSQL 使用交易級 advisory lock，SQLite 使用保留時間的 no-op writer lock；沿用既有資料表與唯一／check constraints，本次無 migration。

成功回完整單筆 projection，包含關聯與統計，不受當前列表 filters／pagination 限制。User／Platform commit 後才清公開 cache；已提交但 cache 失敗使用 MANAGEMENT_UPDATE_COMMITTED_CACHE_UNAVAILABLE 與 X-Management-Update-State: committed。更新相同值不無故修改 Updated。管理列表／Preview 不過濾停用目標；操作者必須有效。

測試（從 `backend/` 執行）：`uv run --locked pytest tests/test_management_role_user_update.py tests/test_management_site_update.py`。提供僅供丟棄的 `PLATFORM_PATCH_TEST_POSTGRES_URL` 可同時執行 PostgreSQL 分支；不得指向應用程式資料庫。

## 平台網站刪除 / Platform Website Deletion

`ManagementSites` 原 CBV 提供 DELETE `/management/sites/{account_id}` 及 POST `/management/sites/bulk-delete`，兩者都由原 `ManagementSitesModule.delete()` 執行一個交易。登入及權限沿用 `ManagementPermission(AuthRole.is_manage_sites)`；交易取得既有 management／publication 鎖後再次檢查有效操作者。單筆 body 是 `{expected_owner_email, expected_site_id}`；批次 body 是 `{targets: [{account_id, expected_owner_email, expected_site_id}]}`。批次上限 100，目標帳號與網站不可重複；型別嚴格、不接受未知欄位、null 或強制轉型。DELETE／POST 套用 Origin、未壓縮 JSON、64 KiB 實際串流上限與重複 JSON key／NaN 防護；不接受 locale、搜尋或分頁 query。

目標以帳號 ID／不可變登入 Email 核對，再比對該帳號的原網站 ID。目標依固定順序鎖定、全部驗證通過後才刪除，任一失敗整批回滾。Default 網站回 409 DEFAULT_SITE_DELETE_FORBIDDEN，必須先用既有 PATCH 切換 Default；網站 ID 已變更回 409 SITE_DELETE_CONFLICT，缺帳號／網站回 404。停用 owner／語言仍可管理。

只物理刪除 PortfolioSite；既有 FK `ON DELETE CASCADE` 清除所有語言、經歷、專案、技能、分類與關聯內容。AuthUser、AuthRole、RecordLogin 及共用 PortfolioLocale 保留，因此 Platform 帳號列仍存在且 has_site=false；不修改 PK／FK／登入信箱，不需要 migration。網站 ID 是存在性確認，帳號 Updated 不作整站版本號；目前未提供涵蓋子內容異動的 revision 機制。

成功回 `{deleted_count, deleted: [{account_id, site_id}]}`，不返回登入信箱。公開快取只在 commit 後清除；共用處理移至 `ManagementWriteState.invalidate_public_cache()`，保持原 PATCH 的錯誤契約。刪除已提交但 cache 失敗回 503 MANAGEMENT_DELETE_COMMITTED_CACHE_UNAVAILABLE 及 `X-Management-Update-State: committed`，呼叫端不得自動重試。

驗證（從 `backend/` 執行）：`uv run --locked pytest tests/test_management_site_delete.py`。僅供丟棄的 `PLATFORM_PATCH_TEST_POSTGRES_URL` 可重複執行 PostgreSQL 鎖、競態與真實級聯刪除測試；SQLite fixture 自動啟用 foreign_keys。

## 角色與帳號刪除 / Role and Account Deletion

Role 與 User 都在原 CBV／Module class 新增 `delete()`，與 `select()`、`update()` 放在一起。單筆使用 DELETE `/management/roles/{role_id}`／`/management/users/{account_id}`；批次使用 POST `/management/roles/bulk-delete`／`/management/users/bulk-delete`。共用管理寫入邊界限制未壓縮 JSON、64 KiB 串流上限、重複 key／非有限數字／不受信任 Origin；不接受 query selectors。嚴格型別、未知欄位禁止，批次 1–100 筆且不可重複。

Role 單筆 body 是 `{expected_role}`，批次為 `{targets: [{role_id, expected_role}]}`。登入與交易內分別檢查目前有效操作者的 `AuthRole.is_manage_roles`。角色須無任何帳號指派（停用帳號也算），且不是註冊 Default；否則回 409 ROLE_IN_USE／DEFAULT_ROLE_REQUIRED。角色名稱已變更或不存在回 404 ROLE_NOT_FOUND。只刪角色，不連帶刪帳號／網站；AuthUser.role_id 的 RESTRICT FK 保留。

User 單筆 body 是 `{expected_email, expected_site_id}`，批次為 `{targets: [{account_id, expected_email, expected_site_id}]}`。expected_site_id 沒有網站時也必須明確送 null；確認後網站新增、移除或更換時回 409 USER_DELETE_CONFLICT。授權沿用 `AuthRole.is_manage_users`；FK 擁有者資料清理由同一個 User 業務交易負責，不以內容 CRUD 的 is_delete 代替管理權限。先確認整批身份、網站、Default 與刪除後仍有有效角色管理員，全部通過後才刪 RecordLogin、PortfolioSite、AuthUser；網站子內容沿用既有 CASCADE。共用角色／語言與其他帳號資料保留，User 的帳號關聯 FK 保持 RESTRICT，不需 migration。

單筆與批次使用相同交易、固定 ID 鎖定順序與既有 management／publication locks。任一筆衝突、缺資料、外鍵失敗或最後管理員保護都回滾整批。User 刪除只在 commit 後清公開 cache；已提交但清除失敗回 MANAGEMENT_DELETE_COMMITTED_CACHE_UNAVAILABLE 與 `X-Management-Update-State: committed`，不可自動重試。Role 刪除沒有指派帳號，因此不清公開內容 cache。成功回 `{deleted_count, deleted}`，Role 項目只含 role_id，User 項目含 account_id 及原 site_id，不返回信箱或密碼。

### SESSION 世代驗證 / Session Generation Binding

正常登入／註冊在伺服器 SESSION 加入 `EnumSess.AUTH_IDENTITY`，內容為帳號 ID 與 Argon2 密碼雜湊的 keyed digest；密碼雜湊及此識別值都不加入公開 Auth DTO。每次 current_session 重新查有效帳號／角色並以 constant-time comparison 驗證。刪除帳號後，即使 SQLite 重用相同 ID 並以相同信箱／handle／明文密碼重新註冊，新 Argon2 salt 仍使舊 SESSION 失效；密碼更新亦撤銷舊身份。不掃描整個 Redis，不改共用 IP 在線鍵。舊格式或格式損壞的 SESSION 會清除身份，需重新登入一次；原有未完成的註冊驗證欄位仍保留。

測試（從 `backend/` 執行）：`uv run --locked pytest tests/test_management_role_user_delete.py`，並可提供僅供丟棄的 `PLATFORM_PATCH_TEST_POSTGRES_URL`。涵蓋角色 FK／Default、User 全部子資料、批次回滾、權限撤回、最後管理員、並行角色指派／Default 切換、提交後 cache 失敗及真實 cookie 的 ID 重用／舊 SESSION 防護。

## 獨立監控權限 / Independent monitor permission

`auth_role.is_monitor` 控制 Overview／Requests／Worker 的五支 HTTP API 與 Socket.IO，不再與網站管理共用旗標；公開 `/monitor/health` 仍只作最小存活探測。`EnumSess.IS_MONITOR` 與八個權限一同由登入／註冊／SESSION 回傳並重新查詢資料庫。Role GET／PATCH、排序、篩選、搜尋及權限指派都包含此欄。Default 角色可啟用 Monitor，其他三項管理旗標仍受既有保護。

Migration `d7a24e91b630` 新增非空欄位，所有既有角色設為 true，之後新角色預設 false；不改寫其他權限或帳號。先 migrate 再由 `uv run --locked manage.py` 同時啟動 FastAPI／APScheduler。

Monitoring HTTP/Socket access requires `is_monitor=true`, independently of site management. Existing roles are enabled by migration; future roles default to false. The registration default may grant monitoring without management rights.
