# 後端管理 API 權限

更新日期：2026-10-16。現有管理讀取 API 與 Platform PATCH 已套用權限檢查；其他 CUD API 與各模組獨立 CRUD 授權尚未實作。

`APPs/Management/module/module_permission.py` 的 `ManagementPermission` 以 class 的 `__call__` 提供 FastAPI dependency。API 宣告所需旗標；同一請求共用身份讀取，下一個請求重新以伺服器 SESSION 的使用者 ID 查詢有效帳號、角色及最新權限。前端傳入的旗標、角色名稱及登入時的舊旗標不能授權。

| API                                      | 必須為 True 的角色旗標 |
| ---------------------------------------- | ---------------------- |
| `GET /management/roles`                  | `is_manage_roles`      |
| `GET /management/users`                  | `is_manage_users`      |
| `GET /management/sites`                  | `is_manage_sites`      |
| `PATCH /management/sites/{account_id}`   | `is_manage_sites`      |
| 六支 `GET /management/preview/*` preview | `is_manage_sites`      |

目前已實作：

- 未登入、身份失效、帳號或角色停用時回 401。
- 缺少對應旗標時回 403；其他管理旗標或內容 CRUD 權限不能代替。
- 帳號角色指派及角色旗標變更，於下一個請求使用最新資料。
- 身份讀取的資料庫／SESSION 儲存錯誤保留 503，不能使用舊旗標放行。
- 成功讀取與身份／權限錯誤回應包含 `Cache-Control: private, no-store`、`Vary: Cookie`。
- 宣告使用 `ManagementPermission(AuthRole.is_manage_sites)` 等 ORM 屬性；空規則、字串名稱、非權限欄位、SQL expression 與重複條件於 API 宣告時報錯，多個條件採 AND。身份於邊界驗證為 `RespAuthUser` 後以屬性讀取。
- Users 的前端入口改為檢查 `is_manage_users`，與後端一致。
- Preview 在 `views_management.py` 的 CBV class 直接宣告共用驗證器，parser 只驗證參數、不處理授權或資料庫查詢；保留 `AUTH_REQUIRED`／`PORTFOLIO_PREVIEW_FORBIDDEN` 及草稿、停用被預覽用戶的讀取契約。

後續工作：

- [ ] 依討論設計權限目錄與角色權限關聯，支援各管理模組獨立 read/create/update/delete。現有七個旗標尚不能表達這種粒度，勿以內容 `is_read`／`is_update` 代替管理模組操作權限。
- [ ] Add／Save／單筆與批次 Delete 接上 CUD API 後，套用對應操作權限及資料範圍檢查。
- [ ] 特殊資料規則在交易內處理：限制可授予權限、保留最後有效管理員、先移轉使用中的角色。
- [x] Platform 更新 DTO 排除 PK／FK、登入 Email、帳號狀態、時間與衍生欄位；後端嚴格拒絕額外欄位。
- [ ] 其他更新 DTO 套用相同限制；補上操作者與前後差異稽核。

Add／Save／Del 目前仍是介面與本地草稿；Platform PATCH 已完成後端驗證與交易，尚未串接前端 Save。沒有新增權限資料表或變更既有角色授權。
