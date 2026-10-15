# Management 權限模組 / Permission Module

`module_permission.py` 提供可帶參數的 `ManagementPermission` class，FastAPI 透過 `__call__` 執行檢查。身份讀取沿用 `AuthSessionModule.current_session()`；角色名稱不參與授權判斷。

`ManagementPermission` is a parameterized callable class. FastAPI executes `__call__`; the existing `AuthSessionModule.current_session()` resolves the current account and role. Role names do not grant access.

## API 用法 / API Usage

只要驗證，不需在 handler 使用操作者時：

```python
from fastapi import Depends
from APPs.Management.module import ManagementPermission

@router.get("/roles", dependencies=[Depends(ManagementPermission(is_manage_roles=True))])
async def get_roles():
    ...
```

handler 需要目前身份時，使用參數接收；`dependencies=[...]` 不會把回傳值傳入 handler。

```python
@router.get("/users")
async def get_users(account: dict = Depends(ManagementPermission(is_manage_users=True))):
    ...
```

Use decorator dependencies for a guard whose result is not needed. Declare it as a function parameter when the handler needs the current identity.

Preview 在 `views_management.py` 的 `ManagementPortfolioPreview` class 直接宣告 `ManagementPermission(is_manage_sites=True)`，六支 API 共用同一身份依賴。Parser 只驗證參數，不匯入權限 class 或執行資料庫查詢；目標存在性、內容讀取與私有錯誤處理集中在既有 Portfolio module；Site 的 view 直接呼叫 `PortfolioSiteModule(...).preview()`。沒有額外的 `scope` 參數。

The preview CBV in views_management.py declares the shared permission dependency for all six endpoints. Parsers only validate input; existing portfolio modules own existence checks, preview reads and private error handling. Views call preview(), preview_categories() or preview_skills(). There is no extra scope parameter or parser-owned authorization layer.

## 條件與生命週期 / Conditions and Lifecycle

- 條件只接受 `AUTH_PERMISSION_FIELDS` 中的七個名稱，值必須是 boolean `True`。空規則、錯字、`False`、`1` 或字串會在宣告時拋出 `ValueError`。
- 多個條件使用 AND；例如 `ManagementPermission(is_manage_roles=True, is_manage_users=True)` 要求兩項都具備。
- 同一 HTTP 請求的多個驗證器共用身份子依賴；不在 class instance 保存帳號或把授權結果快取到下一個請求。
- SESSION 僅以伺服器保存的 `id` 選取操作者，帳號、角色啟用與旗標以目前資料庫為準。變更在下一個請求生效。
- 未登入／停用回 `401 AUTH_REQUIRED`，權限不足回 `403 PERMISSION_DENIED`；身份儲存的 `503` 原樣保留。`denied_detail` 可指定既有 API 的穩定 403 代碼。
- 成功與身份／權限錯誤回應使用 `private, no-store` 及 `Vary: Cookie`。Preview 使用既有的 `PORTFOLIO_PREVIEW_FORBIDDEN`。

Rules accept recognized flags set to the literal boolean True. Multiple conditions use AND. FastAPI shares the identity sub-dependency only within the current request; the callable retains configuration, never an actor. Current database activation and grants determine access. Guests or disabled identities receive 401, denied grants 403, and identity storage errors preserve 503. `denied_detail` preserves an existing resource's denial code.

## 擴充界線 / Extension Boundaries

目前只將既有三項管理旗標套用到讀取 API，未提供 `action` 或 `policy` 入參。七個旗標尚不能表達各模組獨立 CRUD，這些參數必須在後續權限模型完成後再加入，不能宣告後忽略它們。公開 Portfolio GET 不套用管理旗標。

擁有者檢查、可修改欄位、最後管理員與刪除使用中角色等資料規則，保留在各業務模組的交易內處理；依賴驗證器不接管資料修改。

The current model gates existing reads with management flags. Per-resource CRUD, `action`, and `policy` are future work; unsupported parameters fail validation instead of silently doing nothing. Public portfolio GETs stay public. Ownership, writable fields and transactional invariants belong to the resource's business module.
