# Frontend agent note

## Portfolio response revision (2026-10-04)

The user decided to remove the Portfolio dataset `revision` mechanism. The backend `/portfolio/site` now returns the four SiteData groups directly, without `meta` or `revision`. This is an API data revision decision; it does not change the backend application version or Alembic migration versions.

When frontend development resumes, align the frontend contract with this decision:

- Remove the required `meta.revision` check, shared revision state, and `STALE_REVISION` comparison in the Portfolio API client.
- Remove `revision` from mock API envelopes and related response schemas, examples, tests, and documentation.
- Replace the skill mock cursor format and validation: the backend cursor no longer contains the dataset revision, and it is scoped to resource, locale, category where applicable, and sort position.
- Review `config/build.json`'s `mock.revision` when the mock loader is updated; remove it if no remaining build process needs it.

The reference frontend currently lives in the sibling `portfolio-web` project. Its runtime code has not been changed as part of this backend update, so its current mock contract still expects `revision` until the frontend work above is completed.

## Portfolio 公開讀取 API 規劃（2026-10-04）

以下是已討論並於後端實作的六支 GET 回應契約；**前端 API client、mock、store 及多人資料隔離尚待完成**。後端目前的路由前綴是 `/portfolio`，前端接線時須同步修改 API base path。以將來多位作者刊登 Portfolio 為前提，保留 6 支 GET；每支公開路由都要能指定作品集（例如公開 slug），後端查詢和前後端快取鍵也必須包含作品集識別、語系及適用的分頁／游標參數，避免不同作者的資料混用。公開 slug 路由尚未定案。

| API | 目標回傳格式 | 與目前 mock 的差異 |
| --- | --- | --- |
| `/site` | 直接回傳 `brand`、`profile`、`social`、`chatme`。 | 後端已移除外層 `data`、空的 `included`、`page: null` 與 `meta`；參考前端 mock 與 client 仍使用舊格式，接線時須同步修改。 |
| `/journey` | 後端已直接回傳依旅程順序排列的完整陣列，包含地點、期間、組織、經緯度與詳情等畫面所需欄位。 | 前端接線時移除舊的外層包裝和空 `included`；若多作者內容增長，再評估數量上限或地圖摘要。 |
| `/experiences` | 後端已回傳 `{total, pages, page, size, items}`，每筆保留畫面所需詳情與技能。 | 使用編號分頁，每頁固定 6 筆；前端仍須修改 base path 並移除舊的 revision 驗證。 |
| `/projects` | 後端已回傳 `{total, pages, page, size, items}`，每筆保留畫面所需詳情與技能。 | 編號分頁固定每頁 6 筆，三語資料順序相同；前端仍須修改 base path 並移除舊的 revision 驗證。依實際內文規模再評估詳情是否拆開。 |
| `/skill-categories` | 直接回傳 `{items, page, included: {skills}}`。分類項目有指定語系的 `id`、`label`、前 6 個 `skillIds` 與 `skillsPage`；`included.skills` 只收實際引用的 `{id, label}`，相同技能去重。 | 保留技能預覽及游標；移除舊 envelope、空關聯陣列、`labelKey` 與 `translations` 字典。 |
| `/skills` | 直接回傳 `{items: [{id, label}], page: {limit, total, hasMore, nextCursor}}`。 | 不再同時於 `data` 和 `included.skills` 回傳同一批技能；技能在所選分類中依順序提供。 |

六支回應都不再使用資料集 `revision`。兩支技能 API 的 `limit` 預設 12、可用範圍 1–50；`cursor` 省略即第一頁，`nextCursor` 為 `null` 表示沒有下一頁。分類預覽最多 6 個技能，`skillsPage` 格式同 `{limit, total, hasMore, nextCursor}`，可將其 `nextCursor` 傳給 `/portfolio/skills?ownerType=category&ownerId=<category-id>` 取得剩餘技能。`/skills` 必須有 `ownerId`，`ownerType` 只接受 `category`。游標綁定資源、語系、分類和排序位置，不依賴資料集 revision；目前後端只有單份 Portfolio，將來支援多人時還須加入 Portfolio 識別。無效 limit／cursor／ownerType／空白 ownerId 分別回 `400 INVALID_LIMIT`／`400 INVALID_CURSOR`／`400 INVALID_OWNER`／`400 INVALID_OWNER_ID`；省略必填 `ownerId` 由 FastAPI 驗證回 422，找不到分類回 `404 NOT_FOUND`。

前端接線時，須一起更新 API client 的回應驗證與快取鍵、store 的 `included`／翻譯讀取和資料合併、mock transport、OpenAPI／介面文件及相關測試；`/site`、`/journey` 的直接回傳尤其不能再用目前的通用 envelope 解析。參考前端 `portfolio-web` 的 runtime 和 mock 仍採舊 envelope、revision 及游標格式，本輪尚未修改，須增加適配或同步更新後才能接新後端。後端前四支 API 已以目前單份作品集資料驗證三語回應、預設語言、無效語言 400、可選快取及 OpenAPI；`/site` 缺資料回 404，`/journey` 無紀錄回 `[]`，`/experiences` 和 `/projects` 超頁回空 `items`。公開作品集識別仍待多人資料模型確定。
