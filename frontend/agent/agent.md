# Frontend agent note

## Portfolio response revision (2026-10-04)

The user decided to remove the Portfolio dataset `revision` mechanism. The backend `/api/v1/site` now returns the four SiteData groups directly, without `meta` or `revision`. This is an API data revision decision; it does not change the backend application version or Alembic migration versions.

When frontend development resumes, align the frontend contract with this decision:

- Remove the required `meta.revision` check, shared revision state, and `STALE_REVISION` comparison in the Portfolio API client.
- Remove `revision` from mock API envelopes and related response schemas, examples, tests, and documentation.
- Review the skill cursor implementation separately: its current token and validation contain the mock revision. If cursor pagination remains, keep resource and owner validation while removing the dataset revision dependency.
- Review `config/build.json`'s `mock.revision` when the mock loader is updated; remove it if no remaining build process needs it.

The reference frontend currently lives in the sibling `portfolio-web` project. Its runtime code has not been changed as part of this backend update, so its current mock contract still expects `revision` until the frontend work above is completed.

## Portfolio 公開讀取 API 規劃（2026-10-04）

以下是已討論的目標契約；**後端 `/site` 的直接回傳已實作，其餘 API 與前端串接尚待完成**。以將來多位作者刊登 Portfolio 為前提，保留 6 支 GET；每支公開路由都要能指定作品集（例如公開 slug），後端查詢和前後端快取鍵也必須包含作品集識別、語系及適用的分頁／游標參數，避免不同作者的資料混用。具體路由路徑尚未定案。

| API | 目標回傳格式 | 與目前 mock 的差異 |
| --- | --- | --- |
| `/site` | 直接回傳 `brand`、`profile`、`social`、`chatme`。 | 後端已移除外層 `data`、空的 `included`、`page: null` 與 `meta`；參考前端 mock 與 client 仍使用舊格式，接線時須同步修改。 |
| `/journey` | 直接回傳依旅程順序排列的完整陣列，包含地點、期間、組織、經緯度與詳情等畫面所需欄位。 | 移除沒有用途的外層包裝和空 `included`；若多作者內容增長，再評估數量上限或地圖摘要。 |
| `/experiences` | 保留 `{total, pages, page, size, items}`，每筆保留畫面所需詳情與技能。 | 編號分頁與主要回傳格式暫不變。 |
| `/projects` | 保留 `{total, pages, page, size, items}`，每筆暫保留畫面所需詳情與技能。 | 編號分頁與主要回傳格式暫不變；依實際內文規模再評估詳情是否拆開。 |
| `/skill-categories` | 分類直接提供指定語系的 `id`、`label`、前 6 個 `skillIds` 與 `skillsPage`；`included.skills` 只收實際引用的 `{id, label}`，相同技能去重。 | 保留技能預覽及游標；移除空關聯陣列、`labelKey` 與 `translations` 字典，避免重複資料。 |
| `/skills` | 保留游標分頁，回傳 `{items: [{id, label}], page: {...}}`。 | 不再同時於 `data` 和 `included.skills` 回傳同一批技能。 |

六支回應都不再使用資料集 `revision`。`/skills` 游標仍須綁定作品集、語系、分類和分頁位置，不能依賴已移除的資料集 revision。

前端接線時，須一起更新 API client 的回應驗證與快取鍵、store 的 `included`／翻譯讀取和資料合併、mock transport、OpenAPI／介面文件及相關測試；`/site`、`/journey` 的直接回傳尤其不能再用目前的通用 envelope 解析。後端 `/site` 已以目前單份作品集資料驗證三語回應、預設語言、400／404、可選快取及 OpenAPI；公開作品集識別仍待多人資料模型確定。
