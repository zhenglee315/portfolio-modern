# 平台管理欄位與 Default 更新規則

更新日期：2026-10-16。Platform PATCH 後端已實作；前端 Save 目前仍是本地草稿，刪除與新增尚未串接寫入 API。

## 表格欄位

目前主表保留以下短欄名，三種管理語言相同：

| 順序 | 欄名    | 來源                          | 呈現                         |
| ---- | ------- | ----------------------------- | ---------------------------- |
| 1    | ID      | `auth_user.id`                | 帳號 PK、唯讀                |
| 2    | Email   | `auth_user.email`             | SMTP 驗證的登入信箱、唯讀    |
| 3    | Profile | `has_profile`                 | 目前語言是否有工作／教育紀錄 |
| 4    | Publish | `portfolio_site.is_published` | 發布狀態                     |
| 5    | Default | `portfolio_site.is_default`   | 平台預設首頁                 |
| 6    | Active  | `auth_user.is_active`         | 帳號狀態、本輪不可修改       |
| 7    | Updated | `auth_user.updatetime`        | UTC 帳號更新時間、唯讀       |
| 8    | Actions | 編輯、預覽、刪除確認入口      | 刪除仍不執行寫入             |

`has_site` 表示網站是否存在；`has_translation` 表示目前語言翻譯是否存在，與 `has_profile` 分開。缺網站時 Publish／Default 保留 API 的 `null`，不捏造為 false。完整網站設定與翻譯欄位保留在詳情。

時間顯示為 `YYYY.MM.DD HH:mm:ss`，使用 UTC、24 小時制並保留秒數。Created／Updated 是帳號時間；網站與翻譯表目前沒有修改時間，因此更新內容不會改動帳號的 Updated。

## PATCH 契約

```http
PATCH /management/sites/{account_id}?locale=zh-Hant
Content-Type: application/json

{"expected_owner_email":"person2@example.com","changes":{"is_default":true}}
```

Body 的 `expected_owner_email` 與 Path 的帳號 ID 在同一交易內核對同一筆 `AuthUser`；不一致回 404。它是唯讀確認值，登入信箱不修改，SESSION／管理權限仍是授權依據。

Path 對應列表 `id`（帳號 PK）；module 依既有 `PortfolioSite.user_id` 找網站。`locale` 選擇要編輯的翻譯，不修改 FK。`changes` 僅更新明確提交的可編輯欄位，不建立缺少的網站或翻譯。

管理列表、`has_profile`、Preview 與內容修正不排除停用的目標帳號／語言；公開 Portfolio 才要求可見狀態，且在快取前檢查。操作者帳號／角色仍須啟用。

所有 PK／FK、已驗證的登入 `owner_email`、公開代稱 `user`、帳號狀態、時間與衍生值都不能寫入。公開聯絡 `email` 與登入信箱獨立，可以更新。未知／唯讀欄位、null、空更新、錯誤型別與不合法內容回 422；未傳保持原值，false 和允許的空字串會正常保存。

原本 `ManagementSites` CBV 增加 PATCH，原本 `ManagementSitesModule` 同時提供 `select()`、`update()`，共用 `_query()` 投影。權限仍是 `ManagementPermission(AuthRole.is_manage_sites)`；每次從 SESSION 的身份重查有效帳號與角色，其他 CRUD 或 management 旗標不能替代。

## Default 規則

只有帳號啟用、網站存在，且這次 PATCH 後最終發布狀態為 true，才允許設定 Default。Default 全平台最多一個，不按語言或目前分頁分組；可以暫時沒有 Default。

1. 在共用 `transaction()` 內鎖定並重新讀取目標資料。
2. 驗證這次提交後的最終 Publish 狀態與 owner Active。
3. 若設新 Default，先取消其他網站的 Default，再設定目標；重選目前 Default 保持冪等。
4. 若取消發布，自動將同一網站的 Default 改為 false；明確同時要求 Default=true 和最終 Publish=false 回 409。
5. 網站與翻譯修改一起 commit；任何寫入或約束失敗全部 rollback，保留原 Default。
6. Commit 後清除公開 portfolio cache。成功回傳完整的新 Platform row；未來前端還需重查列表，讓舊／新 Default 列同步。

PostgreSQL 發布／Default 更新使用交易級 advisory lock；SQLite 在讀取決策前取得 writer lock。既有單一 Default 唯一索引與 Default 必須發布的 check constraint 繼續作為資料庫防線。併發約束衝突回 409，不回傳內部例外。

清除快取沿用 `PortfolioManagementModule.invalidate_cache()`。PATCH 不呼叫會獨立提交的舊 set_default／set_published；交易規則集中在同一個 `ManagementSitesModule.update()`。若提交後快取失敗，回 503 `MANAGEMENT_UPDATE_COMMITTED_CACHE_UNAVAILABLE`，並附 `X-Management-Update-State: committed`；資料已寫入，不能解讀為 rollback，呼叫端應重新查詢。

完整 body 限制、Origin 設定、錯誤碼與 SQLite／PostgreSQL 隔離測試指令見[後端契約](../backend/README.md#平台部分更新--platform-partial-updates)。

## 欄位命名與排序介面

- 後續欄名以一個單字為優先，保留清楚語意；使用者指定的欄名優先。此慣例同步記錄在專案根目錄 `AGENTS.md`。
- 不提供 Multi-column sorting checkbox。直接點欄位的 ↑／↓ 按鈕選擇升冪／降冪，再點相同方向取消該欄。
- 其他欄位排序保留，按初次點擊的順序決定優先權，最多三欄（沿用管理 API 上限）。改方向保留順位；取消後重新加入排在最後。
- 首次進入沒有顯式排序時，箭頭不預先選取，前端省略 API 的 sort 參數。三支管理 GET 共用 `updatetime:desc` 預設順序，更新時間相同時依 `id:asc` 穩定分頁；有顯式排序時使用該條件。URL 的 `sort=` 保留使用者取消全部排序的狀態，API 不傳空字串。
