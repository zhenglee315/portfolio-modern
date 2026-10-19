# Portfolio Content API

既有六支公開 GET 保留原本的 locale、發布條件與分頁契約。Profile 編輯器沿用五支本人 GET，其中專案以 `page/size` 按頁讀取完整三語內容，再以一個交易儲存所有分區。Journey 與工作／學歷共用同一份 Career 資料，不提供第二套 Journey CUD。

The six public GET contracts remain available. The editor uses private owner snapshots and one atomic save; Journey projects the same careers instead of storing a second editable copy.

## 檔案 / Files

| 位置                                                                                         | 職責                                                        |
| -------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| [views_portfolio.py](views_portfolio.py)                                                     | 原有 CBV、Module class、select／CUD、owner 範圍、交易與快取 |
| [body_portfolio.py](schema/body/body_portfolio.py)                                           | 嚴格請求模型、三語內容、日期、座標、ID 引用與排序驗證       |
| [parser_portfolio.py](schema/parser/parser_portfolio.py)                                     | 公開 query parser、私有 HTTP／來源／大小檢查                |
| [resp_portfolio.py](schema/resp/resp_portfolio.py)                                           | 公開、本人讀取與儲存回應模型                                |
| [models_portfolio.py](../../SYSTEM/models/models_portfolio.py)                               | ORM 欄位、同站外鍵與技能關聯                                |
| [migration](../../SYSTEM/models/migrations/versions/e42b19a7d603_profile_content_editing.py) | 結構升級與既有技能搬移                                      |

`PortfolioSiteModule`、`PortfolioExperiencesModule`、`PortfolioProjectsModule`、`PortfolioSkillsModule` 的查詢及寫入方法皆在同一個既有 class。Journey 維持 `PortfolioJourneyModule.select()`。舊 `module` import 路徑透過延遲相容匯出指向同一 class；router discovery 使用完整 APPs module 名稱，避免重複註冊。

## 操作 / Operations

下表路徑皆以前綴 `/portfolio` 開始；共新增 23 個 HTTP 操作，包含 5 個 GET 與 18 個寫入，連同原本 6 個公開 GET 共 29 個。

| 功能       | 讀取                       | 新增                     | 更新                           | 刪除                            | 其他                                |
| ---------- | -------------------------- | ------------------------ | ------------------------------ | ------------------------------- | ----------------------------------- |
| 個人介紹   | `GET /me/site`             | —                        | `PATCH /site`                  | —                               | `POST /site/save` 整頁儲存          |
| 工作／學歷 | `GET /me/experiences`      | `POST /experiences`      | `PATCH /experiences/{id}`      | `DELETE /experiences/{id}`      | `PUT /experiences/order`            |
| 專案作品   | `GET /me/projects`         | `POST /projects`         | `PATCH /projects/{id}`         | `DELETE /projects/{id}`         | `PUT /projects/order`               |
| 技能分類   | `GET /me/skill-categories` | `POST /skill-categories` | `PATCH /skill-categories/{id}` | `DELETE /skill-categories/{id}` | `PUT /skill-categories/order`       |
| 技能       | `GET /me/skills`           | `POST /skills`           | `PATCH /skills/{id}`           | `DELETE /skills/{id}`           | `PUT /skill-categories/{id}/skills` |

經歷與專案的 URL 使用資料庫數字 ID；分類與技能使用原字串 ID。排序與關聯內容使用本人 GET 回傳的完整 draft ID。Swagger `/docs` 提供各操作的 request schema、範例及既有風格的詳細 description。

## 契約 / Contract

- 本人 GET 依有效 SESSION 找到唯一 Site，不接受 `user`／`site_id` 等 query selector，包含未公開項目及三語欄位；回應 `revision` 必須一致。沒有網站時回 404，不自動建立網站或填入範例。
- GET 需要 `is_read`；新增、更新、刪除各使用目前有效角色的 `is_create`、`is_update`、`is_delete`。每次寫入會在交易內重新確認權限與 owner；整頁儲存另依新增／移除的 ID 檢查對應權限。
- 所有寫入 body 必須包含 `expected_revision`。新增使用 `entry`，PATCH 使用 `changes`（Site 直接提交 profiles／social／brand 群組），刪除只需版本，排序／分類成員使用完整 `ids`。整頁儲存使用 `{expected_revision, draft, project_scope?}`，draft 不含傳輸層 revision；分頁模式須附已載入 `loaded_ids` 與完整專案 `order`，draft.projectOrder 只包含隨 body 提交的完整記錄。
- PATCH 保留未提交欄位與語言；null 不等於省略。排序必須恰好包含全部既有 ID；分類成員可為空，只移除關聯，不刪技能。被分類、經歷或專案引用的技能不可直接刪除。
- 日期、有效經緯度、三碼國別、可用連結、翻譯長度、重複 ID、跨站引用及不合法文字均由後端驗證。新增經歷必須選取有效地點；前端以本機世界／城市資料完成定位。
- 一次寫入只提交一次資料庫交易，成功後增加 revision、回傳 canonical ID 與 draft，再清除公開快取；分頁儲存僅回傳已載入／新建記錄，並附 canonical project_scope。任何資料錯誤會整筆回滾。

Private reads and writes are SESSION-scoped and use `Cache-Control: private, no-store` with `Vary: Cookie`. Writes require JSON and a valid request origin, reject duplicate keys/non-finite numbers, and limit the body to 2,000,000 bytes. The client sends one save without automatic retries; browser recovery storage cannot turn a failed server save into success.

| 狀態                                               | 語意                                                                                   |
| -------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 401／403                                           | 身份無效或目前權限不足                                                                 |
| 404                                                | 本人的 Site 或指定項目不存在                                                           |
| 409 `PORTFOLIO_EDIT_CONFLICT`                      | revision 已過期，沒有覆蓋新資料                                                        |
| 409 `PORTFOLIO_SKILL_IN_USE`                       | 技能仍被使用                                                                           |
| 422                                                | 請求欄位、排序或關聯不合法                                                             |
| 503 `PORTFOLIO_UPDATE_COMMITTED_CACHE_UNAVAILABLE` | 資料已提交，但清除快取失敗；帶 `X-Portfolio-Update-State: committed`，不可當成回滾重送 |

前端保留失敗時的工作副本，讓使用者明確重新載入伺服器內容。未知網路結果也不能假設資料庫已回滾。


## 本人專案分頁 / Owner project pagination

`GET /portfolio/me/projects?page=1&size=6` 共用管理端的 `parser_management_pagination`（同一套 page/size 格式及 1–100 限制）、交易綁定的 `SqlAlchemyExecAsync.paginate_orm` 與 `RespRecords.from_records`，不另寫 LIMIT/OFFSET。回應保留統一五欄 `items/total/pages/page/size`，另附 `revision`、完整 ID `order` 與輕量 `references`（三語名稱與技能 ID）；非本頁介紹／詳情不查詢或傳送。只有此本人 GET 接受 page/size，仍拒絕 user/site_id、其他 query 與重複參數。空頁 pages=0；超出頁數的請求保留 page 並回空 items；size 預設 6，接受 1–100，不接受 all；六支公開 GET 仍使用原本固定 6 的 `parser_pagination`。

分頁儲存沿用 `PortfolioSiteModule.save_changes` 與原交易：`project_scope.loaded_ids` 明確指定可替換／移除的既有專案，其他專案從同版本資料庫快照保留；`project_scope.order` 必須恰好包含合併後所有 ID。名稱、權限、關聯與版本驗證仍針對完整合併結果；刪除經歷時清除未載入專案的關聯。遺漏／偽造 scope、缺少完整順序或版本衝突都會回滾。回應只含曾載入／新建的 canonical 專案，避免儲存後反而把所有詳情送進瀏覽器。未使用 scope 的既有完整儲存仍相容。

此變更只調整既有 GET／save 契約與查詢，不新增 route，不修改表結構，也不需要 migration。

## 結構 / Schema

`e42b19a7d603` 接續 `d7a24e91b630`，不是只有新增路由：四張表共增加八個欄位，另建立兩張技能關聯表及同站外鍵／排序約束。`revision` 防止覆寫；`visible` 保存顯示開關；專案 `experience_id` 明確共用組織／職稱，`end_day` 保存選取日期；`skills_normalized` 區分既有匯入格式與關聯資料。

`portfolio_career_skill`、`portfolio_project_skill` 以 ID 引用技能及順序。升級會對照原有三語技能標籤，找不到的標籤保留為新的共享技能，再建立關聯；舊 JSON 留作降版備份。之後的內容編輯以技能關聯為準；降版會先由目前關聯重建技能文字。

啟用這版程式前必須先套用 migration；測試與啟動不會自動升級資料庫結構。結構及資料搬移已在專用 PostgreSQL 測試資料庫驗證。服務啟動仍從 `backend/` 使用 `uv run --locked manage.py`，讓 FastAPI 與 APScheduler 一起運行。

Schema changes require a migration before this version serves an existing database. Tests use disposable PostgreSQL databases/schemas; application startup does not automatically run Alembic.

2026-10-18 本機原 PostgreSQL 已由 `d7a24e91b630` 升級至 `e42b19a7d603`；遷移前留存完整備份，遷移後核對 12 張原有 Portfolio 表的既有欄位資料均保留。原環境已啟動 FastAPI／APScheduler 與前端，三語公開 API 正常，完整編輯 document 驗證包含 6 筆經歷、15 筆專案、7 個分類、109 個技能。登入後的瀏覽器儲存仍須用有效原帳號驗收，未以偽造 SESSION 或修改原內容替代測試。

2026-10-19 已以 20 個新建合成 QA 帳號完成真實登入、四分區與三語編輯、儲存／重載及全部內容寫入路由驗證；透過管理頁刪除指定 10 個帳號，另 10 個保留為一般編輯帳號。刪除後無關聯殘留，原有帳號／角色／作品集 16 張表的原資料均保留；詳細範圍、測試數與尚未實作功能見 [驗證紀錄](../../../docs/code-quality.md)。原本的個人帳號與內容未被拿來做寫入測試。
