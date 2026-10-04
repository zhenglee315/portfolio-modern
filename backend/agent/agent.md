# Backend agent note

## Portfolio 公開讀取 API 規劃（2026-10-04）

這是目前後端六支公開 GET API 的契約及後續多人資料隔離規劃；**六支 API 已實作，但多人資料隔離與前端串接尚未完成**。使用者希望未來讓其他人也能刊登 Portfolio，因此不能只按現有單人 mock 的資料量決定接口與負載。與前端同步調整 mock、client、store、規格與測試；目前不要把這份規劃當成前端可直接接線的現況。

### API 數量與目標回應

保留 **6 支 GET**，不合併或刪除 `/skills`。目前的路由前綴已改為 `/portfolio`；公開讀取時仍需選定 Portfolio 與語系，具體公開 slug 放在路徑或網域中的方式留待多人資料模型確定。

| API | 目標回應 | 分頁與資料取得 |
| --- | --- | --- |
| `GET /portfolio/site` | 直接回傳 `{brand, profile, social, chatme}`，保留目前 4 組、19 個業務欄位；不要 `data`、空 `included`、`page: null` 或無用途的 `meta`。 | 不分頁；按 Portfolio 與 locale 讀對應站點內容。 |
| `GET /portfolio/journey` | 直接回傳依旅程順序排列的 `JourneyItem[]`，包含地圖、期間、組織及需要的 `detail`。 | 暫時不分頁，以供地圖及年資計算；每份 Portfolio 的旅程量需要合理上限，量大時再設計輕量摘要或範圍查詢。 |
| `GET /portfolio/experiences` | 維持 `{total, pages, page, size, items}`；每筆保留完整經歷文字、`detail`、`skills: string[]`。 | 保留 `page`／`size=6` 和穩定排序；不能逐筆再查技能。 |
| `GET /portfolio/projects` | 維持 `{total, pages, page, size, items}`；每筆保留目前列表內的完整 `detail` 及 `skills`。 | 保留 `page`／`size=6` 和穩定排序；先不另設詳情 API，之後按內文上限與實測負載檢討。 |
| `GET /portfolio/skill-categories` | 直接回傳 `{items, page, included: {skills}}`。分類項目給 `id`、指定語言的 `label`、最多 6 個預覽 `skillIds`、各自的 `skillsPage`；`included.skills: [{id, label}]` 只收當頁預覽真正引用的技能，重複 ID 去重。 | `locale`、`cursor`、`limit`；分類以穩定的 position＋ID 游標分頁，預覽按分類技能順序批次查詢。 |
| `GET /portfolio/skills` | 直接回傳 `{items: [{id, label}], page: {limit, total, hasMore, nextCursor}}`，不另附重複的 `included.skills`。 | `ownerType=category`、必填 `ownerId`、`locale`、`cursor`、`limit`；限定分類後按技能關聯的 position＋ID 分頁。 |

所有公開內容的 `label` 與文字直接使用請求 locale；不再傳翻譯字典或 `revision`。Experience／Project 的 `skills` 是完整文字陣列，不需要用 `/skills` 補查。技能分類的 `included.skills` 是實際預覽參照，不回傳空的 `organizations`／`countries`／`locations`、`translations` 或 `labelKey`。

兩支技能 API 的 `limit` 預設 12、可用範圍 1–50，`cursor` 省略時從第一頁開始。`page` 與每個分類的 `skillsPage` 均為 `{limit, total, hasMore, nextCursor}`；分類的預覽頁 `limit` 固定為 6，其 `nextCursor` 可以交給 `/portfolio/skills` 繼續同一分類。`nextCursor` 在無後續資料時為 `null`。游標綁定資源、locale、分類及排序位置；跨資源、跨語言、跨分類或格式錯誤回 `400 INVALID_CURSOR`。無效 `limit` 回 `400 INVALID_LIMIT`；無效 `ownerType` 回 `400 INVALID_OWNER`。`ownerId` 未帶入時由 FastAPI 必填參數驗證回 422，僅空白時回 `400 INVALID_OWNER_ID`；找不到分類回 `404 NOT_FOUND`。目前只服務單份 Portfolio，游標尚無 Portfolio 識別；未來多人模型上線時必須將 Portfolio 納入查詢與游標範圍。

### 多人刊登前必須完成的資料隔離

- 建立 Portfolio 根概念，與登入帳號建立擁有者關係，並給每份公開作品集穩定的識別值（例如唯一 slug）。先確認一個帳號能擁有一份或多份作品集，再決定沿用現有 Site 作根，或新增獨立 Portfolio 表；6 種 GET 資源數量不變。
- Site、Career／Journey、Project、Skill Category、Skill 與關聯都必須有清楚的 Portfolio 歸屬。所有讀取、計數、分頁與語系 JOIN 都按 **Portfolio + locale + 已發布狀態** 篩選；不能只按 locale 查第一筆，也不能把別人的資料混入結果。
- 目前排序唯一性有全域限制；多人使用時要把唯一約束改為 Portfolio 範圍，並依實際查詢增加 Portfolio／發布狀態／排序／locale 的複合索引。分頁排序要有穩定的 ID 作決勝欄位，技能關聯也要有明確順序。
- 限制 `size`／cursor `limit`、每份作品集的旅程數和單筆專案詳情長度，避免單一作者讓無分頁回應或資料庫查詢無界增長。需要量測查詢數、查詢計畫、回應大小與併發行為；目前單人資料的估算不足以推論多人站點負載。
- 快取鍵至少區分 Portfolio、locale、頁碼或 cursor，以及影響結果的查詢條件；內容更新／發布狀態變動時使對應 Portfolio 的快取失效。公開頁面心跳目前每請求寫 Redis；多人訪問前評估更新頻率，避免其寫入量跟每個靜態資源與 API 請求等比例增長。
- SQLite 與 PostgreSQL 都應使用可移植的 SQLAlchemy 欄位、外鍵和索引設計；不要為了多語系依賴 PostgreSQL 專有的 JSONB。SQLite 須確認外鍵約束已啟用，且其單寫入者特性不適合直接推論多人編輯的吞吐量；正式負載再按預期併發與壓測結果選資料庫。

### 現況與同步工作

- 後端 `/site` 已直接回傳 `{brand, profile, social, chatme}`；`/journey` 依 `journey_position` 直接回傳完整陣列；`/experiences` 與 `/projects` 使用共用 `parser_common`、Portfolio 組合 parser 與 ORM 分頁工具，固定每頁 6 筆並回傳 `{total, pages, page, size, items}`。四支 API 已核對三語 mock、預設 en、無效語言 400、可選快取和 Swagger；兩支分頁 API 的超頁回空 `items`，無效 page／size 回 400。Projects 依原始顯示順序排序；只有 `detail_kind=object` 回傳詳情物件，其餘回傳 `null`，`skills` 仍保留 `null` 與空陣列的差異。`/skill-categories` 與 `/skills` 使用同一個 ORM module class，依所選 locale 查技能分類和技能，分別回傳直接格式與游標頁。目前六支路由仍未加入多人作品集篩選。
- 現有 `AuthUser` 尚未擁有 Portfolio 根實體，資料模型也未完成多人歸屬、發布狀態與範圍索引。這些是未來支援其他人刊登時的前置變更，不代表本輪文件已修改資料庫。
- 前端 `portfolio-web` 目前的 mock、client、store、OpenAPI 和文件仍採舊 envelope／revision／翻譯映射；正式接線時須以新技能回應契約調整解析器、預覽補頁與游標，並驗證三種語言、分頁及切換語言行為。本輪未修改前端 runtime。
