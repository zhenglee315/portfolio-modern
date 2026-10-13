# 後端總覽 / Backend Overview

本目錄是個人檔案系統的 FastAPI 後端。`APPs` 放業務 API，`COMMON` 放共用工具，`SYSTEM` 負責設定、模型、資料庫、middleware 與應用生命週期。整體產品方向見[專案 README](../README.md)。

This directory contains the FastAPI backend for the personal profile system. `APPs` holds business APIs, `COMMON` holds shared tools, and `SYSTEM` owns configuration, models, the database, middleware, and the application lifecycle. See the [project README](../README.md) for the product overview.

目前已完成六支 Portfolio 讀取 API、網站／帳號／角色三支管理列表 GET、線上人數診斷 API、登入、登出、註冊與 SESSION 查詢，以及 SQLite／PostgreSQL 非同步資料庫架構、Redis 快取與 session、Socket.IO 組裝、ORM 模型及 Alembic migration。管理寫入 API 與 Portfolio 寫入 API 尚未實作。

Six Portfolio read APIs, three management lists for sites/accounts/roles, an online-count diagnostic API, sign-in, sign-out, registration, and session lookup are implemented alongside the async SQLite/PostgreSQL infrastructure, Redis cache and sessions, Socket.IO assembly, ORM models, and Alembic migrations. Administration write APIs and Portfolio write APIs are not implemented yet.

## 目錄結構 / Directory Layout

下列是目前的主要檔案與資料夾；省略 package 標記、靜態資產細項與虛擬環境。

The tree shows the main files and directories currently present; package markers, individual static assets, and the virtual environment are omitted.

```text
backend/
├── APPs/
│   ├── Auth/
│   │   ├── views_auth.py         # Auth CBV routes and private responses
│   │   ├── module/              # Sign-in, sign-out, registration and session logic
│   │   └── schema/              # Request validation and account responses
│   ├── Management/
│   │   ├── views_management.py   # Role/account/platform list GETs
│   │   ├── constants/
│   │   │   └── constant_management.py # Query limits and allowed projection/sort fields
│   │   ├── module/              # Filtered, sorted and paginated ORM projections
│   │   └── schema/              # parser/ query validation and resp/ response models
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
│   ├── config.yaml               # 公開開發預設 / public development defaults
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
├── alembic.ini                   # migration 入口 / migration configuration
├── manage_fastapi.py            # API 啟動入口 / server entry point
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
  → APPs/{Auth,Management,Portfolio,Sys}/views
  → schema/parser → module → ORM or Redis helper
  → SYSTEM/database/ConnectionManager → SQLite/PostgreSQL or Redis
  → schema/resp → JSON response
```

`GET /authority/session` 以伺服器 SESSION 的帳號 ID 查詢啟用中的帳號與角色，回傳 `id`、`email`、`user`、`role` 及七個 CRUD／管理權限；訪客或失效帳號回傳 `null`，儲存服務錯誤回傳 `503`。查詢會更新 SESSION 中的身份與權限，保留原 SID 及尚未完成的註冊驗證。Auth 回應使用 `Cache-Control: no-store`；前端可在重新整理後恢復身份，無須儲存密碼。

`GET /authority/session` resolves the server session's account ID against an active account and role, returning `id`, `email`, `user`, `role`, and seven CRUD/management permissions. Guests and invalid accounts receive `null`; storage failures return `503`. Lookup refreshes session identity and permissions while retaining the SID and pending registration proof. Auth responses use `Cache-Control: no-store`, allowing the frontend to restore identity after reload without storing passwords.

`POST /authority/sign-in` 驗證帳號、角色與密碼，建立 SESSION 後，透過 `execute_orm()` 新增一筆 `RecordLogin`（`record_login`）：保存帳號 `user_id`，由資料庫產生 serial `id` 與具時區的 `logintime`。每次成功登入各有一筆；登入失敗及 SESSION 查詢不新增紀錄。紀錄寫入失敗時回傳 `503 AUTH_DATABASE_UNAVAILABLE` 並清除剛建立的登入身份。Migration `159af2dc7898` 僅建立這張表、FK、檢查限制及兩個歷史查詢索引。

`POST /authority/sign-in` verifies the account, role and password, initializes SESSION, then inserts one `RecordLogin` (`record_login`) through `execute_orm()`. It stores the account's `user_id`; the database supplies the serial `id` and timezone-aware `logintime`. Each successful sign-in creates a separate row; failed sign-ins and session lookups create none. A record write failure returns `503 AUTH_DATABASE_UNAVAILABLE` and clears the newly prepared identity. Migration `159af2dc7898` creates only this table, its FK, check constraint and two history indexes.

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
| `AuthRole`                                 | 七個權限；預設註冊角色不可有任何 `is_manage_*` / Seven permissions, no management permission on the registration default                                                |
| `PortfolioSite`                            | `user_id UNIQUE`；`is_published`／`is_default` 預設 false；全站最多一個 default，default 必須 published / At most one site per account and one published global default |
| Career／Project                            | `site_id` FK，順序唯一性及查詢索引以 site 開頭 / Site-owned numeric IDs and per-site ordering                                                                           |
| Skill／SkillCategory                       | `(site_id,id)` 複合 PK，保留原字串 ID / Composite keys retain public string IDs                                                                                         |
| SkillLocale／CategoryLocale／CategorySkill | 共用 site_id 的複合 FK，DB 阻擋跨站關聯 / Composite foreign keys prevent cross-site associations                                                                        |
| `PortfolioLocale`                          | 全站語言字典 / Shared language dictionary                                                                                                                               |
| `RecordLogin`                              | 成功登入的帳號與時間 / Successful account login timestamps                                                                                                              |

`COMMON/schema/schema_user.py` 共用公開識別驗證及 email 前綴分配；省略註冊 `user` 時自動加數字後綴處理撞名。新帳號不會自動建立作品集。`PortfolioManagementModule` 提供共用帳號／owner 權限檢查及原子發布／首頁切換，目前沒有對外寫入 route。多 statement 交易透過 `SqlAlchemyExecAsync.transaction()`，business module 仍只提交 ORM statement。

Shared user validation/allocation handles prefix collisions. Registration does not automatically create a portfolio. The management module supplies reusable authorization and atomic publication/default operations without exposing write routes. Multi-statement operations use the shared transaction tool and execute_orm interface.

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

後端管理 API 權限管理尚待實作；目前狀態、各 API 對應旗標及驗收項目見 [權限待辦](../docs/management-permissions-todo.md)。本次檢查依使用者指示保留現有後端權限行為。

`GET /management/roles` 每列是一個角色，沿用 `{items,total,pages,page,size}`，`items` 是有欄位名稱的物件陣列。前端透過既有代理呼叫 `/api/management/roles`。查詢由 `schema/parser/parser_management.py` 驗證，`module/module_management.py` 組合 SQL，`schema/resp/resp_management.py` 定義回應，`views_management.py` 提供 HTTP 介面；啟動時由現有路由探索機制載入。

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

每次請求都查詢資料庫，這支 API 沒有套用回應快取 decorator。無效查詢回 400，detail 為 `INVALID_PAGE`、`INVALID_SIZE`、`INVALID_SORT`、`INVALID_FILTERS` 或 `INVALID_QUERY`；資料庫不可用回 `503 MANAGEMENT_DATABASE_UNAVAILABLE`。這個工作包只有讀取 API，依規劃尚未加權限 decorator；沿用現有 auth_role／auth_user，沒有新增表或 migration。

Each request queries the database; this endpoint has no response-cache decorator. Invalid query values return 400 with the corresponding INVALID_* detail; unavailable storage returns 503 MANAGEMENT_DATABASE_UNAVAILABLE. This work package contains only the read API, with permission decorators deferred as planned. It reuses auth_role and auth_user without schema changes or migrations.

## 帳號與網站管理列表 / Account and Platform Lists

`GET /management/users` 與 `GET /management/sites` 沿用角色列表的 `{items,total,pages,page,size}`、page=1、size=6（可調 1–100）、型別化逐欄篩選與最多三欄排序。每層集中於一個檔案：`module/module_management.py` 內的各資源類別共用 `ManagementListModule`，`schema/parser/parser_management.py` 內的各資源函式共用欄位篩選、排序、分頁驗證，`schema/resp/resp_management.py` 集中各資源返回類別，HTTP 介面集中於 `views_management.py`。OpenAPI 說明共用條件契約並以 response schema 列出完整欄位。前端呼叫 `/api/management/users`、`/api/management/sites`。

The account and platform GETs share the role list's numbered envelope, pagination limits, typed column predicates and ordered sorting. Each layer uses one management file: resource query classes in module_management.py, query functions in parser_management.py, response classes in resp_management.py, and HTTP routes in views_management.py. Generic predicate validation and SQL application live in COMMON, with resource field capabilities and projection expressions supplied by Management. OpenAPI describes the shared query contract and typed response schemas. The frontend uses the existing /api proxy.

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

上例 JSON 以 URLSearchParams 編碼在 filters 參數。舊 search 與散落的 boolean query 參數已移除，未知／過期 query keys 回 400 INVALID_QUERY；錯誤欄位、運算、型別、重複條件或反向範圍回 400 INVALID_FILTERS。profile_name 使用當前語言的姓名、漢字姓在前及 nickname fallback；無作品集／翻譯／名稱的提示文案不是可搜尋資料值。

兩者都以帳號為根，每人一列，包含停用帳號與沒有網站的帳號。`id` 一律是 `auth_user.id`，`site_id` 才是網站 ID。User 的成功登入紀錄先彙整再 JOIN，避免重複列；Platform 只 JOIN 指定語言，缺翻譯時不丟棄帳號、不混用其他語言。網站缺失回 `has_site=false`、site_id 與網站欄位為 null；翻譯缺失回 `has_translation=false`、語言內容欄位為 null。`is_published=false`／`is_default=false` 僅篩選有網站且旗標為 false 的列，缺網站的 null 不算 false。

Both lists use one account per row, including inactive accounts and accounts without a portfolio. The row id is auth_user.id; site_id identifies the portfolio. Login records are aggregated before joining. Platform joins only the requested language, retaining accounts with missing translations without falling back. Missing portfolios and translations are explicit nulls, with has_site and has_translation flags. A missing portfolio's null publication/default state does not match a false state filter.

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
| `user`            | `auth_user.user`                                                        | 擁有者帳號 / Owner handle                                                                                                                                            |
| `owner_is_active` | `auth_user.is_active`                                                   | 擁有者狀態 / Owner state                                                                                                                                             |
| `site_id`         | `portfolio_site.id`                                                     | 網站識別 / Nullable portfolio identity                                                                                                                               |
| `has_site`        | `portfolio_site.id IS NOT NULL`                                         | 網站是否存在 / Portfolio presence                                                                                                                                    |
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

Localized fields use only the requested locale. Platform `createtime` and `updatetime` are the primary account's UTC creation/update timestamps, displayed as Created/Updated even when no portfolio exists. Portfolio and translation tables do not store these timestamps, so they do not describe website-content changes. User queries never select password data. Platform email is public contact information, while User email is the login address. Every User response field is sortable; every Platform response field except the constant requested locale is sortable.

三支管理列表都不使用快取 decorator、不另外設定 Cache-Control，權限 decorator 依原規劃後補；沒有新增表或 migration。無效查詢回 400 INVALID_PAGE／INVALID_SIZE／INVALID_SORT／INVALID_FILTERS／INVALID_QUERY，無效語言回 INVALID_LOCALE。資料庫錯誤統一回 503 MANAGEMENT_DATABASE_UNAVAILABLE。

All three lists omit response-cache decorators and additional Cache-Control settings. Permission decorators remain deferred as planned, and no migration is required. Invalid queries return the corresponding INVALID_* error with status 400; database failures return 503 MANAGEMENT_DATABASE_UNAVAILABLE.

## 設定與依賴 / Configuration and Dependencies

| 位置 / Location                             | 用途 / Purpose                                                                                                                                                                                                                                   |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `SYSTEM/config.yaml`                        | 納入版本控制的開發預設：loopback、SQLite、明確的占位金鑰；正式設定由部署環境私下提供。 / Tracked development defaults with loopback services, SQLite, and an explicit placeholder key; provide production configuration privately at deployment. |
| `SYSTEM/extension.py`、`SYSTEM/settings.py` | 載入 YAML 並整理應用設定。 / Load YAML and derive application settings.                                                                                                                                                                          |
| `alembic.ini`、`SYSTEM/models/migrations/`  | 指向 migration 環境與版本；Alembic 使用目前資料庫設定及 `SYSTEM/models` metadata。 / Migration location and revisions; Alembic uses the configured database and model metadata.                                                                  |
| `pyproject.toml`、`uv.lock`                 | 宣告依賴與鎖定解析後版本。 / Declare dependencies and lock resolved versions.                                                                                                                                                                    |

`SYSTEM/config.yaml` 至少需要非空的 `SECURITY.secret_key`，以及 `DATABASE.META` 的 `type`、`is_async: true`、`name`。多用戶 migration 使用 PostgreSQL；底層 SQLite 支援保留供工具及隔離測試。API `127.0.0.1:8080`、Redis `127.0.0.1:6379`。`SERVER.locally: false` 讓 server 與 Redis 各自讀取 YAML 的 host／port；設為 `true` 時 server 強制使用 loopback，Redis 固定使用本機 6379。文件路徑由 `URL` 設定；預設 Swagger 是 `/swagger`、ReDoc 是 `/redoc`、OpenAPI 是 `/openapi`。

`SYSTEM/config.yaml` requires a nonempty `SECURITY.secret_key` and `DATABASE.META` values for `type`, `is_async: true`, and `name`. The local API uses port 8080 and Redis port 6379; configure PostgreSQL for the multi-user migration chain. With `SERVER.locally: false`, the server and Redis use their YAML host/port values; `true` forces a loopback server and local Redis on port 6379. Documentation defaults are `/swagger`, `/redoc`, and `/openapi`.

目前 `YamlConfig` 直接讀取此檔案，**沒有環境變數覆寫或 `${VARIABLE}` 插值機制**。正式環境必須將 `SECURITY.secret_key` 換成部署專用的隨機值，並以私有部署檔案或 secret mount 覆蓋此路徑；不要把真實金鑰寫進版本控制的設定。也須依部署設定 `SERVER.host`、HTTPS cookie、Redis 主機與資料庫連線。可在部署環境產生金鑰，再填入私有 YAML：

`YamlConfig` reads this file directly: **environment-variable overrides and `${VARIABLE}` interpolation are not implemented**. In production, replace `SECURITY.secret_key` with a unique random value using a private deployment file or secret mount at this path. Keep real keys out of tracked configuration, and configure the server bind address, HTTPS cookies, Redis host, and database connection for that deployment. Generate a key in the deployment environment and place it in its private YAML:

```bash
uv run --locked python -c "import secrets; print(secrets.token_urlsafe(48))"
```

目前支援 `sqlite` 與 `postgresql`；PostgreSQL 還需實際 `host`、`port`、`name`、`user`、`password`，且必須先建立資料庫。依部署環境填入 PostgreSQL 連線設定；SQLite 不使用這些欄位。`SEC_CORS` 的 origins 目前由 `SYSTEM/settings.py` 建立，沒有 YAML origins 選項；前端預設 `VITE_API_BASE_URL=/api`，瀏覽器請求同源的 `/api/portfolio/*`，開發 proxy 或正式 reverse proxy 移除 `/api` 前綴後轉送至後端的 `/portfolio/*`。若要直接使用不同網域，須按部署需求設定 CORS。

Both `sqlite` and `postgresql` are supported. PostgreSQL additionally needs actual host, port, database name, username, password, and a database created in advance. Supply PostgreSQL connection values for the deployment environment; SQLite ignores those fields. `SEC_CORS` origins are currently defined in `SYSTEM/settings.py`; there is no YAML origins option. The frontend defaults to `VITE_API_BASE_URL=/api`, so browsers request same-origin `/api/portfolio/*`. The development proxy or production reverse proxy strips `/api` and forwards `/portfolio/*` to this API. Direct cross-origin deployments require matching CORS configuration.

使用 SQLite 時，相對的 `DATABASE.META.name` 會依 `SYSTEM/settings.py` 的 `DB_CONF["sqlite"]` 存放在 `SYSTEM/models/sqlite/`，缺少的資料夾會自動建立；`:memory:` 不建立檔案，絕對路徑則保留指定位置。FastAPI 與 Alembic 使用同一個路徑。

For SQLite, a relative `DATABASE.META.name` uses `DB_CONF["sqlite"]` in `SYSTEM/settings.py` and is stored under `SYSTEM/models/sqlite/`, which is created when needed. `:memory:` creates no file, while an absolute path keeps its specified location. FastAPI and Alembic use the same path.

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

以下順序適用於全新 clone。需要 Git、`uv`、Python 3.13，以及可連線的 Redis。`.python-version` 固定開發用 Python 3.13；`pyproject.toml` 允許 3.13 以上版本。SQLite 驅動隨鎖定依賴安裝，不需要額外安裝資料庫伺服器。依賴第一次下載與 Python 安裝需要網路；離線環境須預先備妥相同版本的環境。前端安裝見[前端 README](../frontend/README.md)。

These steps cover a fresh clone. Install Git, `uv`, Python 3.13, and a reachable Redis service. `.python-version` pins development to Python 3.13; `pyproject.toml` permits 3.13 or later. Locked dependencies include the SQLite driver, so no separate SQL server is needed for the defaults. Initial dependency downloads and Python installation require network access; prepare the same environment in advance for offline use. See the [frontend README](../frontend/README.md) for frontend setup.

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

`uv sync --locked` 依 `uv.lock` 建立 `backend/.venv`，包含開發依賴；若鎖定檔與宣告不一致，指令會失敗，避免安裝時偷偷重解版本。現有 Python 3.13 可省略 `uv python install`。`uv run --locked` 自動使用專案環境，不必先 `source .venv/bin/activate`；如要直接使用 `python`，macOS／Linux 可手動啟用該環境。

`uv sync --locked` creates `backend/.venv` from `uv.lock`, including development dependencies. It fails when declarations and the lockfile disagree, rather than silently resolving different versions. Skip `uv python install` if Python 3.13 is already available. `uv run --locked` selects the project environment automatically; activate `.venv` manually only when running `python` directly.

### 3. 檢查設定並建立資料表 / Check Configuration and Migrate

檢查 `SYSTEM/config.yaml`，為多用戶版本準備 PostgreSQL 連線與既有資料備份。先建立資料表，再啟動 API：

Configure PostgreSQL in SYSTEM/config.yaml and back up existing data before multi-user migrations. Create tables before starting the API:

```bash
uv run --locked alembic upgrade head
uv run --locked alembic current
```

FastAPI 啟動流程不建立資料表，也不自動跑 migration。相對的預設 SQLite 檔案位於 `SYSTEM/models/sqlite/porfolio_modern`；檔名沿用目前設定，不能靠 `.db` 副檔名判定是否為資料庫。SQLite 檔案、journal／WAL 及實際使用者資料不納入版本控制；其他開發者使用相同 migration 重建自己的資料庫。

FastAPI startup does not create tables or run migrations. The relative default SQLite file is `SYSTEM/models/sqlite/porfolio_modern`; its existing name has no `.db` suffix. Keep SQLite files, journals/WAL, and real user data out of version control. Each developer creates their own database from the same migrations.

### 4. 啟動與確認 / Start and Verify

```bash
uv run --locked manage_fastapi.py
```

預設 API 為 `http://127.0.0.1:8080`，Swagger 為 `http://127.0.0.1:8080/swagger`。開啟另一個 terminal 檢查：

The default API is `http://127.0.0.1:8080`, with Swagger at `http://127.0.0.1:8080/swagger`. In another terminal, check:

```bash
curl -fsS http://127.0.0.1:8080/openapi > /dev/null
curl -fsS 'http://127.0.0.1:8080/portfolio/projects?locale=en&page=1&size=6'
```

新資料庫沒有作品集內容；`/portfolio/site?locale=en` 在沒有對應語言的已發布首頁時回傳 404。建立自己的作品集內容後，可用此端點確認個人資料。`uv` 產生的 `backend` console script 目前仍指向 `src/backend` 範例，不會啟動 API；入口應使用 `manage_fastapi.py`。目前入口傳入 Uvicorn 的是已建立的 ASGI 物件，因此保持 `SERVER.worker: 1`；`SERVER.reload` 目前沒有傳給入口的 Uvicorn 呼叫，不能將它視為已實作的熱重載。部署多 worker／reload 需要先調整為可匯入的 application factory。

A new database has no portfolio content; `/portfolio/site?locale=en` returns 404 without a published default site in that locale. After creating your own content, use this endpoint to verify the profile. The generated `backend` console script still points to the `src/backend` sample and does not start the API; use `manage_fastapi.py`. This entry point passes an instantiated ASGI application to Uvicorn, so keep `SERVER.worker: 1`. `SERVER.reload` is not forwarded to Uvicorn and does not currently enable hot reload. Multiple workers or reload require an importable application factory.

### 5. 常見問題 / Troubleshooting

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
