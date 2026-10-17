# Management 業務模組 / Management Modules

**文件責任：** 管理權限依賴、列表／登入紀錄查詢、Role／User／Platform 更新與刪除的交易規則。HTTP 端點、參數與回應總表見 [後端總覽](../../../README.md)；前端互動見 [前端總覽](../../../../frontend/README.md)。

| 模組                         | 責任                                                               |
| ---------------------------- | ------------------------------------------------------------------ |
| `__init__.py`               | 直接匯出業務 class 與權限依賴，提供套件匯入入口。                 |
| `module_base.py`            | 共用列表篩選、排序與分頁。                                       |
| `module_roles.py`           | 角色列表、更新及刪除。                                           |
| `module_users.py`           | 帳號列表、更新及刪除。                                           |
| `module_sites.py`           | 網站列表、更新及刪除。                                           |
| `module_logins.py`          | 登入紀錄查詢。                                                   |
| `module_state.py`           | 寫入鎖、即時授權、原值比較、最後管理員、帳號啟用與提交後快取處理。 |
| `module_permission.py`      | 依目前 SESSION 與資料庫權限執行 FastAPI dependency 驗證。         |

目錄已表達 Management 用途，檔名採 `module_<用途>.py`。各資源的讀取與交易寫入放在同一個 class，`module_state.py` 共用寫入規則；呼叫端透過 `from APPs.Management.module import ...` 取得由 `__init__.py` 直接匯出的實作 class。

`module_permission.py` 提供可帶參數的 `ManagementPermission` class，FastAPI 透過 `__call__` 執行檢查。身份讀取沿用 `AuthSessionModule.current_session()`；角色名稱不參與授權判斷。

`ManagementPermission` is a parameterized callable class. FastAPI executes `__call__`; the existing `AuthSessionModule.current_session()` resolves the current account and role. Role names do not grant access.

## API 用法 / API Usage

只要驗證，不需在 handler 使用操作者時：

```python
from fastapi import Depends
from APPs.Management.module import ManagementPermission
from SYSTEM.models import AuthRole
from APPs.Auth.schema.resp import RespAuthUser

@router.get("/roles", dependencies=[Depends(ManagementPermission(AuthRole.is_manage_roles))])
async def get_roles():
    ...
```

handler 需要目前身份時，使用參數接收；`dependencies=[...]` 不會把回傳值傳入 handler。

```python
@router.get("/users")
async def get_users(account: RespAuthUser = Depends(ManagementPermission(AuthRole.is_manage_users))):
    ...
```

Use decorator dependencies for a guard whose result is not needed. Declare it as a function parameter when the handler needs the current identity.

Preview 在 `views_management.py` 的 `ManagementPortfolioPreview` class 直接宣告 `ManagementPermission(AuthRole.is_manage_sites)`，六支 API 共用同一身份依賴。Parser 只驗證參數，不匯入權限 class 或執行資料庫查詢；目標存在性、內容讀取與私有錯誤處理集中在既有 Portfolio module；Site 的 view 直接呼叫 `PortfolioSiteModule(...).preview()`。沒有額外的 `scope` 參數。

The preview CBV in views_management.py declares the shared permission dependency for all six endpoints. Parsers only validate input; existing portfolio modules own existence checks, preview reads and private error handling. Views call preview(), preview_categories() or preview_skills(). There is no extra scope parameter or parser-owned authorization layer.

## 條件與生命週期 / Conditions and Lifecycle

- 條件只接受明確白名單內的七個 `AuthRole` ORM 權限屬性。空規則、字串名稱、非權限欄位、SQL expression 與重複條件在宣告時拋出 `ValueError`；不再接受動態 keyword 旗標。
- 多個條件使用 AND；例如 `ManagementPermission(AuthRole.is_manage_roles, AuthRole.is_manage_users)` 要求兩項都具備。
- 同一 HTTP 請求的多個驗證器共用身份子依賴；不在 class instance 保存帳號或把授權結果快取到下一個請求。
- SESSION 僅以伺服器保存的 `id` 選取操作者，帳號、角色啟用與旗標以目前資料庫為準。變更在下一個請求生效。身份字典在 dependency 邊界嚴格驗證為 `RespAuthUser`，檢查器直接存取具型別屬性；不使用字串索引或動態 getattr。
- 未登入／停用回 `401 AUTH_REQUIRED`，權限不足回 `403 PERMISSION_DENIED`；身份儲存的 `503` 原樣保留。`denied_detail` 可指定既有 API 的穩定 403 代碼。
- 成功與身份／權限錯誤回應使用 `private, no-store` 及 `Vary: Cookie`。Preview 使用既有的 `PORTFOLIO_PREVIEW_FORBIDDEN`。

Rules accept explicitly allowlisted AuthRole permission attributes. String names, SQL expressions, unrelated columns and duplicate gates fail at declaration. Multiple conditions use AND. FastAPI shares the identity sub-dependency only within the current request; the callable retains configuration, never an actor. Current database activation and grants determine access. Guests or disabled identities receive 401, denied grants 403, and identity storage errors preserve 503. `denied_detail` preserves an existing resource's denial code.

## 擴充界線 / Extension Boundaries

三項管理旗標套用到各資源的讀取、PATCH 及單筆／批次刪除：Role 使用 `is_manage_roles`、User 使用 `is_manage_users`、Platform／Preview 使用 `is_manage_sites`，登入紀錄沿用 `is_manage_users`。模組未提供 `action` 或 `policy` 入參；七個旗標尚不能表達各資源獨立 CRUD，須在權限模型完成後另行擴充。公開 Portfolio GET 不套用管理旗標。

擁有者檢查、可修改欄位、最後管理員與刪除使用中角色等資料規則，保留在各業務模組的交易內處理；依賴驗證器不接管資料修改。

The management flags gate resource reads, PATCH and single/batch deletion. Login history uses user-management permission and preview uses site-management permission. Per-resource CRUD grants, `action`, and `policy` remain future extensions. Public portfolio GETs stay public; ownership, writable fields and transactional invariants belong to the resource's business module.

## Platform updates / 平台更新

`ManagementSitesModule` 的 `select()`、`update()` 與 `delete()` 共用原資源 class，`_query()` 提供共用 GET projection。View 宣告 HTTP 與權限；body schema 驗證可寫欄位，parser 驗證 path／query；存在性、發布與 Default 規則留在業務交易。更新透過共用 `transaction()`／`execute_orm()`，公開快取於 commit 後清除，不呼叫會另外提交的發布方法。Platform 的 PK／FK、已驗證登入信箱及帳號時間維持唯讀；`owner_is_active` 是唯一可寫的帳號狀態，實際更新 `AuthUser.is_active`。完整契約見[後端說明](../../../README.md#平台部分更新--platform-partial-updates)。

`BodyManagementSitePatchRequest` 將唯讀的 `expected_owner_email` 和 `changes` 分開。更新交易在同一條 owner 查詢比對 `AuthUser.id`／`AuthUser.email`；不匹配不寫入、不回傳現有帳號信箱。SQLite 的 writer-lock statement 也只定位已核對的 owner。身份核對不是授權，仍使用目前 SESSION 與管理權限。

Management／Preview 讀取包含停用目標；公開 Portfolio 才套用 active-language 條件，並在快取前檢查。`include_inactive=True` 僅由 `_read_preview()` 內部傳給共用查詢，不從 URL 注入，也不修改 instance 狀態。管理更新不要求語言啟用；缺網站／翻譯仍回 404。Default 的啟用 owner／發布規則維持獨立驗證。

Default 網站的 Active 不可關閉：`ManagementWriteState.activate()` 在 publication lock 下由 ORM 檢查目前 Default，User／Platform 共用，違反回 409 `DEFAULT_SITE_DEACTIVATE_FORBIDDEN`。Active 不再隱式取消 Default。先取消／切換 Default，或在同一 Platform PATCH 明確取消 Default 後，才可停用帳號；任何衝突皆整筆回滾。

The original Platform class owns both reads and transactional writes. Input validation stays in body/parser layers, permission checks stay in the existing dependency, and resource rules stay in update(). Cache invalidation runs only after commit. No new write service or independently committed publication operation is introduced.

### Platform 刪除 / Website deletion

同一個 `ManagementSitesModule.delete(targets, actor_id=...)` 處理單筆與批次，不呼叫會各自 commit 的單筆迴圈。驗證 owner ID／不可變登入信箱／原網站 ID，沿用 `ManagementWriteState.begin()` 的交易鎖與即時授權，固定順序鎖定所有目標。Default 必須先替換；任何一筆失敗整批回滾。只刪網站 root，由既有 FK cascade 刪除所有語系子內容，保留帳號、角色、登入歷史及共用語言。共用提交後 cache 處理由 `ManagementWriteState.invalidate_public_cache()` 負責，update／delete 使用各自的 committed error code，業務判斷仍留在原 class。

### Role／User 刪除 / Role and User deletion

`ManagementRolesModule.delete()` 確認原角色 ID／名稱，並在共用鎖內確認不是 Default、沒有任何指派帳號（不過濾 is_active）。角色使用中的 FK 問題回報衝突，不轉成連帶刪人或自動重新指派。

`ManagementUsersModule.delete()` 確認帳號 ID／不可變登入信箱及原 optional site_id。整批目標先通過 Default 及 `ManagementWriteState.preserve_manager(excluded_accounts)` 檢查，再依序清登入紀錄、網站、帳號；FK 保持原本 RESTRICT／CASCADE，任一失敗完整回滾。允許刪除自己，但必須有其他有效角色管理員；目前 SESSION 在下一次讀取失效。刪帳號及網站同屬 User 管理操作，沿用 is_manage_users，不使用角色名稱或內容 CRUD 旗標授權。User 提交後才清公開 cache；Role 無帳號使用，不觸發內容 cache 清除。所有刪除方法都要求有效的 server actor_id，即使直接從 module 呼叫也驗證輸入。

Auth 的 current_session 除資料庫有效性外，也驗證伺服器 SESSION 的帳號世代 digest；刪除後重用 ID 不會恢復舊登入權限。識別值不暴露於 response DTO，舊格式 SESSION 需重新登入。完整契約及隔離測試見[後端說明](../../../README.md#角色與帳號刪除--role-and-account-deletion)。

### ORM 欄位與外部契約 / ORM bindings and wire contracts

`constant_management.py` 的 `EnumManagementField` 只定義穩定 API 名稱；`SITE_PATCH_COLUMNS`、`SITE_TRANSLATION_PATCH_COLUMNS` 明確將名稱綁定至 ORM 屬性。`BodyManagementSitePatch.orm_changes()` 在驗證後轉換一次，業務層以 ORM 屬性作更新集合 key；查詢來源直接引用 ORM，不依欄名 getattr，也不從整張 model 自動推導可寫權限。Roles／Users／Login records 沿用同一套明確投影。

`ManagementSitePatchParameters` 是不可變參數物件；CBV 透過 `.account_id`、`.expected_owner_email`、`.locale`、`.changes` 傳遞資料。發布／Default 使用 `PortfolioSite` entity，owner 只載入 id／is_active；SQL 賦值使用 `.values({PortfolioSite.is_default: False})` 等屬性映射。資料庫分支沿用 `EnumDBType`、語言沿用 `EnumLocal`、排序方向沿用 `EnumSortDirection`。公開 JSON key 和 Pydantic validator 名稱屬於 wire contract，保留其正式語法。

HTTP 方法使用標準庫 `HTTPMethod`；Header、媒體格式、編碼與 URL scheme 集中在 `SYSTEM/constants/constant_http.py`。錯誤碼與提交狀態集中於管理 constants；公開快取讀取／清除共用 `EnumCacheNamespace.PORTFOLIO`。設定名稱只在 settings 邊界讀取，view 使用已驗證的 origin 集合。

Wire names are bound to explicitly allowlisted ORM attributes once. Business rules use entities and attribute-keyed updates; shared enums replace database/protocol magic strings. Framework options, external payloads and test assertions of the public contract retain their required wire syntax.

## Login history / 登入紀錄

`ManagementLoginRecordsModule` extends `ManagementListModule` and uses the shared filters/search/sort/page engine. Its optional account selector is applied before counting or paging. Rows retain stored location snapshots, including legacy nulls and disabled target accounts; the module never opens a GeoIP reader. `ManagementPermission(AuthRole.is_manage_users)` protects `/management/login-records` through the existing management router. Views declare the HTTP contract and delegate the read.

登入紀錄沿用共用查詢引擎及既有管理用戶權限；地區資料在成功登入時由 Auth module 寫入。讀取 module 不解析代理標頭、不執行定位，也不更改歷史事件。預設依 `logintime DESC, id DESC`；其他三個管理列表維持 Updated 降序。
