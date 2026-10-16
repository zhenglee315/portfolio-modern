# Management 權限模組 / Permission Module

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

目前既有三項管理旗標套用到讀取 API，Platform PATCH 也沿用 `is_manage_sites`；未提供 `action` 或 `policy` 入參。七個旗標尚不能表達各模組獨立 CRUD，這些參數必須在後續權限模型完成後再加入，不能宣告後忽略它們。公開 Portfolio GET 不套用管理旗標。

擁有者檢查、可修改欄位、最後管理員與刪除使用中角色等資料規則，保留在各業務模組的交易內處理；依賴驗證器不接管資料修改。

The current model gates reads with management flags, and Platform PATCH also requires is_manage_sites. Per-resource CRUD, `action`, and `policy` are future work; unsupported parameters fail validation instead of silently doing nothing. Public portfolio GETs stay public. Ownership, writable fields and transactional invariants belong to the resource's business module.

## Platform updates / 平台更新

`ManagementSitesModule` 保留 `select()` 並新增 `update(account_id, changes, expected_owner_email=...)`，`_query()` 提供兩者共用的 GET projection。View 只宣告 HTTP 與權限；body schema 驗證可寫欄位，parser 驗證 path／query；交易內的存在性、發布與 Default 規則都留在同一個業務 class。更新使用共用 `transaction()`／`execute_orm()`；公開快取清除沿用 `PortfolioManagementModule.invalidate_cache()`，不呼叫會另外提交的 set_default／set_published。所有 PK／FK、已驗證登入信箱及 AuthUser 狀態／時間保持唯讀。完整契約與隔離測試指令見[後端說明](../../../README.md#平台部分更新--platform-partial-updates)。

`BodyManagementSitePatchRequest` 將唯讀的 `expected_owner_email` 和 `changes` 分開。更新交易在同一條 owner 查詢比對 `AuthUser.id`／`AuthUser.email`；不匹配不寫入、不回傳現有帳號信箱。SQLite 的 writer-lock statement 也只定位已核對的 owner。身份核對不是授權，仍使用目前 SESSION 與管理權限。

Management／Preview 讀取包含停用目標；公開 Portfolio 才套用 active-language 條件，並在快取前檢查。`include_inactive=True` 僅由 `_read_preview()` 內部傳給共用查詢，不從 URL 注入，也不修改 instance 狀態。管理更新不要求語言啟用；缺網站／翻譯仍回 404。Default 的啟用 owner／發布規則維持獨立驗證。

The original Platform class owns both reads and transactional writes. Input validation stays in body/parser layers, permission checks stay in the existing dependency, and resource rules stay in update(). Cache invalidation runs only after commit. No new write service or independently committed publication operation is introduced.

### ORM 欄位與外部契約 / ORM bindings and wire contracts

`constant_management.py` 的 `EnumManagementField` 只定義穩定 API 名稱；`SITE_PATCH_COLUMNS`、`SITE_TRANSLATION_PATCH_COLUMNS` 明確將名稱綁定至 ORM 屬性。`BodyManagementSitePatch.orm_changes()` 在驗證後轉換一次，業務層以 ORM 屬性作更新集合 key；查詢來源直接引用 ORM，不依欄名 getattr，也不從整張 model 自動推導可寫權限。Roles／Users／Login records 沿用同一套明確投影。

`ManagementSitePatchParameters` 是不可變參數物件；CBV 透過 `.account_id`、`.expected_owner_email`、`.locale`、`.changes` 傳遞資料。發布／Default 使用 `PortfolioSite` entity，owner 只載入 id／is_active；SQL 賦值使用 `.values({PortfolioSite.is_default: False})` 等屬性映射。資料庫分支沿用 `EnumDBType`、語言沿用 `EnumLocal`、排序方向沿用 `EnumSortDirection`。公開 JSON key 和 Pydantic validator 名稱屬於 wire contract，保留其正式語法。

HTTP 方法使用標準庫 `HTTPMethod`；Header、媒體格式、編碼與 URL scheme 集中在 `SYSTEM/constants/constant_http.py`。錯誤碼與提交狀態集中於管理 constants；公開快取讀取／清除共用 `EnumCacheNamespace.PORTFOLIO`。設定名稱只在 settings 邊界讀取，view 使用已驗證的 origin 集合。

Wire names are bound to explicitly allowlisted ORM attributes once. Business rules use entities and attribute-keyed updates; shared enums replace database/protocol magic strings. Framework options, external payloads and test assertions of the public contract retain their required wire syntax.

## Login history / 登入紀錄

`ManagementLoginRecordsModule` extends `ManagementListModule` and uses the shared filters/search/sort/page engine. Its optional account selector is applied before counting or paging. Rows retain stored location snapshots, including legacy nulls and disabled target accounts; the module never opens a GeoIP reader. `ManagementPermission(AuthRole.is_manage_users)` protects `/management/login-records` through the existing management router. Views declare the HTTP contract and delegate the read.

登入紀錄沿用共用查詢引擎及既有管理用戶權限；地區資料在成功登入時由 Auth module 寫入。讀取 module 不解析代理標頭、不執行定位，也不更改歷史事件。預設依 `logintime DESC, id DESC`；其他三個管理列表維持 Updated 降序。
