# 平台管理欄位與 Default 更新規則

記錄日期：2026-10-13。此文件供後續 update API 與可編輯介面實作使用；本次僅調整表格呈現，控制項維持唯讀。

## 表格欄位

欄名及順序固定如下，三種管理語言都使用這組短欄名：

| 順序 | 欄名    | 資料來源                                            | 呈現             |
| ---- | ------- | --------------------------------------------------- | ---------------- |
| 1    | ID      | `auth_user.id`                                      | 帳號編號         |
| 2    | Account | `auth_user.user`                                    | 帳號名稱         |
| 3    | Profile | `has_site`，是否存在 `portfolio_site`               | Checkbox         |
| 4    | Publish | `portfolio_site.is_published`                       | Checkbox         |
| 5    | Default | `portfolio_site.is_default`                         | Toggle           |
| 6    | Active  | `auth_user.is_active`，API 名稱為 `owner_is_active` | Toggle           |
| 7    | Updated | `auth_user.updatetime`                              | UTC 帳號更新時間 |
| 8    | Actions | 查看完整列詳情／單筆刪除入口                        | 眼睛／垃圾桶按鈕 |

主表只有上述八欄。Profile checkbox 不代表已有當前語言內容；`has_translation` 是另一個欄位。Profile name、品牌與語言內容保留在 Actions 詳情，Columns 不提供這些額外欄位。

缺作品集時，Publish 與 Default 保留 API 的 `null`，顯示 `—`，不捏造為 false。

管理表格與詳情的時間統一顯示為 `YYYY.MM.DD HH:mm:ss`，使用 24 小時制、保留秒數並沿用 UTC，例如 `2026.10.13 14:05:09`。三種語言格式相同；`createtime`、`updatetime`、`last_login` 都沿用此規則。API 與匯出資料保留原始 ISO timestamp，缺時間仍顯示 `—`。

## Default 可用條件

只有以下三個條件全部為 true，才允許將目標作品集設為 Default：

```text
Active  = owner_is_active = true
Profile = has_site        = true
Publish = is_published    = true
```

介面應在條件不符時停用 Default 並提示原因。後端必須重新讀取並驗證資料庫狀態，不能僅信任前端條件。啟用 update 後，唯讀權限、請求進行中狀態仍須另外限制操作。

## 後端切換順序

Default 是全平台共用的首頁設定，不能按帳號、語言或目前分頁各自保留一個。

1. 驗證目前登入者的網站管理權限。
2. 在同一個資料庫 transaction 中讀取並鎖定目標作品集與既有 Default，驗證目標的 Active、Profile、Publish 全部為 true。
3. 找到舊的 `is_default=true` 作品集，先將其更新為 `false`。
4. 再將選取的目標作品集更新為 `is_default=true`。
5. 兩次更新一起 commit；任何失敗都 rollback，保留原有 Default。
6. Commit 後清除公開作品集快取，重新查詢管理表格，讓舊列與新列同步顯示。

資料庫唯一約束必須保留，防止同時操作造成兩個 Default。併發衝突應回傳可處理的錯誤，前端重新取得實際狀態。重選目前 Default 應視為冪等操作，不必先清掉它；首次選取沒有舊 Default 時，驗證後直接設定目標。

管理表格的 `ID` 是帳號 ID；更新作品集時應使用該列的 `site_id`。

## 現有實作與後續工作

後端已有內部方法 `PortfolioManagementModule.set_default(request, site_id)`，位於 `backend/APPs/Portfolio/module/module_portfolio_manage.py`。它已在 transaction 中驗證作品集存在、擁有者啟用與發布狀態，先取消舊 Default，再設定新 Default，並處理唯一約束衝突與快取失效。

目前 Add 僅呈現入口；Delete／每列垃圾桶先開啟共用驚嘆號確認視窗，全選只涵蓋本頁。確認尚不執行刪除 API、不修改資料或顯示成功；詳情 Edit 點擊後僅切換為綠色 Submit，欄位仍唯讀，Submit 不提交資料或顯示成功。

目前平台管理頁僅串接 GET，尚未提供這個方法的 update route。後續可接用現有方法，補上 API 契約、前端 mutation、成功／失敗回饋與重新查詢。

直接關閉目前 Default，以及停用／取消發布目前 Default 的互動方式，留待後續 update 設計確認；本次不新增這些寫入行為。

## 欄位命名與排序介面

- 後續欄名以一個單字為優先，保留清楚語意；使用者指定的欄名優先。此慣例同步記錄在專案根目錄 `AGENTS.md`。
- 不提供 Multi-column sorting checkbox。直接點欄位的 ↑／↓ 按鈕選擇升冪／降冪，再點相同方向取消該欄。
- 其他欄位排序保留，按初次點擊的順序決定優先權，最多三欄（沿用管理 API 上限）。改方向保留順位；取消後重新加入排在最後。
- 首次進入沒有顯式排序時，箭頭不預先選取，前端省略 API 的 sort 參數。三支管理 GET 共用 `updatetime:desc` 預設順序，更新時間相同時依 `id:asc` 穩定分頁；有顯式排序時使用該條件。URL 的 `sort=` 保留使用者取消全部排序的狀態，API 不傳空字串。
