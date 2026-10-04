# Backend agent note

## Portfolio 公開讀取 API 規劃（2026-10-04）

這是後續實作依據；**目前只有 `/site` 的直接回傳已完成，六支 API 及多人資料隔離尚未全部實作**。使用者希望未來讓其他人也能刊登 Portfolio，因此不能只按現有單人 mock 的資料量決定接口與負載。與前端同步調整 mock、client、store、規格與測試；目前不要把這份規劃當成可直接接線的現況。

### API 數量與目標回應

保留 **6 支 GET**，不合併或刪除 `/skills`。公開讀取時都要選定 Portfolio 與語系；具體公開 slug 放在路徑或網域中的方式，留待路由設計時確定。以下路徑沿用目前的資源名稱。

| API | 目標回應 | 分頁與資料取得 |
| --- | --- | --- |
| `GET /api/v1/site` | 直接回傳 `{brand, profile, social, chatme}`，保留目前 4 組、19 個業務欄位；不要 `data`、空 `included`、`page: null` 或無用途的 `meta`。 | 不分頁；按 Portfolio 與 locale 讀對應站點內容。 |
| `GET /api/v1/journey` | 直接回傳依旅程順序排列的 `JourneyItem[]`，包含地圖、期間、組織及需要的 `detail`。 | 暫時不分頁，以供地圖及年資計算；每份 Portfolio 的旅程量需要合理上限，量大時再設計輕量摘要或範圍查詢。 |
| `GET /api/v1/experiences` | 維持 `{total, pages, page, size, items}`；每筆保留完整經歷文字、`detail`、`skills: string[]`。 | 保留 `page`／`size=6` 和穩定排序；不能逐筆再查技能。 |
| `GET /api/v1/projects` | 維持 `{total, pages, page, size, items}`；每筆保留目前列表內的完整 `detail` 及 `skills`。 | 保留 `page`／`size=6` 和穩定排序；先不另設詳情 API，之後按內文上限與實測負載檢討。 |
| `GET /api/v1/skill-categories` | 保留分類游標頁；分類項目給 `id`、指定語言的 `label`、最多 6 個預覽 `skillIds`、各自的 `skillsPage`。只附當頁真正引用的 `included.skills: [{id, label}]`，同一技能去重；移除空 `organizations`／`countries`／`locations`、`translations` 字典及 `labelKey`。 | 分類以 cursor 分頁；技能預覽最多 6 筆。查詢時批次取分類、預覽及翻譯，避免每分類一次 SQL。 |
| `GET /api/v1/skills` | 回傳 `{items: [{id, label}], page: {limit, total, hasMore, nextCursor}}`；不要把同批技能再複製到 `included.skills`。 | 保留指定分類的 cursor 分頁，`ownerType=category`、`ownerId` 限定分類；游標須綁定 Portfolio、分類與穩定排序，避免跨作者或跨分類混用。 |

所有公開內容的 `label` 與文字直接使用請求 locale；不再傳翻譯字典或 `revision`。Experience／Project 的 `skills` 是完整文字陣列，不需要用 `/skills` 補查。技能分類的 `included.skills` 是實際預覽參照，其他空欄位不回傳。分類頁最外層的精確命名、游標錯誤碼與限額在前後端規格同步時定稿；不得重新加入無資料的通用 envelope。

### 多人刊登前必須完成的資料隔離

- 建立 Portfolio 根概念，與登入帳號建立擁有者關係，並給每份公開作品集穩定的識別值（例如唯一 slug）。先確認一個帳號能擁有一份或多份作品集，再決定沿用現有 Site 作根，或新增獨立 Portfolio 表；6 種 GET 資源數量不變。
- Site、Career／Journey、Project、Skill Category、Skill 與關聯都必須有清楚的 Portfolio 歸屬。所有讀取、計數、分頁與語系 JOIN 都按 **Portfolio + locale + 已發布狀態** 篩選；不能只按 locale 查第一筆，也不能把別人的資料混入結果。
- 目前排序唯一性有全域限制；多人使用時要把唯一約束改為 Portfolio 範圍，並依實際查詢增加 Portfolio／發布狀態／排序／locale 的複合索引。分頁排序要有穩定的 ID 作決勝欄位，技能關聯也要有明確順序。
- 限制 `size`／cursor `limit`、每份作品集的旅程數和單筆專案詳情長度，避免單一作者讓無分頁回應或資料庫查詢無界增長。需要量測查詢數、查詢計畫、回應大小與併發行為；目前單人資料的估算不足以推論多人站點負載。
- 快取鍵至少區分 Portfolio、locale、頁碼或 cursor，以及影響結果的查詢條件；內容更新／發布狀態變動時使對應 Portfolio 的快取失效。公開頁面心跳目前每請求寫 Redis；多人訪問前評估更新頻率，避免其寫入量跟每個靜態資源與 API 請求等比例增長。
- SQLite 與 PostgreSQL 都應使用可移植的 SQLAlchemy 欄位、外鍵和索引設計；不要為了多語系依賴 PostgreSQL 專有的 JSONB。SQLite 須確認外鍵約束已啟用，且其單寫入者特性不適合直接推論多人編輯的吞吐量；正式負載再按預期併發與壓測結果選資料庫。

### 現況與同步工作

- 後端 `/site` 已直接回傳 `{brand, profile, social, chatme}`，`locale` 由 `COMMON.schema.parser.parser_locale` 共用驗證，並核對三語 mock、預設 en、400／404、可選快取和 OpenAPI；模組目前仍按 locale 取第一筆站點資料。其他五支公開 API 尚待依規劃實作。
- 現有 `AuthUser` 尚未擁有 Portfolio 根實體，資料模型也未完成多人歸屬、發布狀態與範圍索引。這些是未來支援其他人刊登時的前置變更，不代表本輪文件已修改資料庫。
- 前端 `portfolio-web` 目前的 mock、client、store、OpenAPI 和文件仍採舊 envelope／revision／翻譯映射；正式接線時同步修正並驗證三種語言、分頁、游標與切換語言行為。
