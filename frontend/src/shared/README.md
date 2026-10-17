# 共用模組規格 / Shared Module Specifications

**文件責任：** 跨功能共用 API、schema、hooks、lib 與 UI 的邊界、呼叫契約及公開匯出索引。DataTable 的完整 props／互動範例由 [表格指南](ui/README.md) 擁有，角色素材與動畫由 [Cow workspace](ui/cow-workspace/README.md) 擁有；feature／page 的組裝行為見 [前端總覽](../../README.md)。

`shared` 是前端的共用基礎層，對應後端 `COMMON` 的責任：集中外部資料驗證、HTTP 與分頁流程、日期計算、瀏覽器訂閱、浮動面板定位及通用 UI。使用者透過參數傳入資料、文案與事件；共用模組不自行決定作品集業務規則。完整分層、環境安裝及元件規格見[前端 README](../../README.md)。

`shared` provides frontend infrastructure comparable to the backend's `COMMON` layer: validated HTTP reads, numbered pagination, date calculations, browser subscriptions, panel placement, and reusable UI. Consumers supply data, copy, and callbacks. Portfolio business rules remain with their owning features. See the [frontend README](../../README.md) for architecture, installation, and component specifications.

## 邊界與引用 / Boundaries and Imports

```text
app / routes / pages → features → shared
app / routes / pages / features → i18n → shared
```

共用層可以引用其他共用模組與套件，不可以反向引用 `features`、`pages`、`routes`、`app` 或 `i18n`。固定 UI 翻譯在 `i18n` 組合後傳入，API 回應文字則由 feature 傳入；共用 UI 不另外取得 API 資料。ESLint 檢查這些依賴邊界。以 `@/shared/<責任>/<檔案>` 明確引用實際需要的能力，避免大型匯出檔拉入無關依賴。

Shared modules may import other shared modules and packages, but never features, pages, routes, application assembly, or i18n. Locale adapters inject UI copy; features inject validated API content. Shared presentation does not fetch domain data. ESLint enforces these boundaries. Import the required module explicitly using `@/shared/<responsibility>/<file>`.

| 目錄 / Directory | 責任 / Responsibility                                                                        | 選擇原則 / Placement rule                                                                        |
| ---------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `api/`           | HTTP、錯誤分類、分頁查詢與快取銜接 / HTTP, errors, pagination, and cache handoff             | 與 endpoint 業務欄位無關的讀取流程 / Read mechanics independent of domain fields                 |
| `schemas/`       | 識別碼、日期、共同分頁及職涯欄位契約 / IDs, periods, pagination, and common career contracts | 多個 endpoint 確實共享的契約 / Contracts genuinely shared by endpoints                           |
| `lib/`           | 純計算、驗證與明確的 DOM 操作 / Calculations, validation, and explicit DOM operations        | 不管理 React 狀態；DOM 方法由呼叫端啟動 / No React state; callers initiate DOM operations        |
| `hooks/`         | 訂閱、觀察、事件與副作用的生命週期 / Subscription, observation, event, and effect lifecycles | 掛載與清理成對；業務狀態留在 feature / Paired setup and cleanup; feature-owned business state    |
| `ui/`            | 通用呈現與交互外殼 / Reusable presentation and interaction shells                            | 以 props 接收內容、文案、樣式差異及事件 / Receive content, copy, style variations, and callbacks |

## HTTP 與分頁 / HTTP and Pagination

搜尋標籤與下拉選項共用 `tableChoiceColor(value, override?)`、`TableChoiceColor` 及七色柔和 CSS 色票；搜尋以欄位 ID 固定配色，切換語言或取消其他欄位不變色。標籤高度 24px、字級 12px、最寬 180px，移除 × 位於邊框右上角；捲動區保留圓點與焦點外框的空間。

資料表搜尋共用 `DataTableSearch`、`DataTableSearchProps`、`DataTableSearchCopy` 與 `DataTableSearchState`。`parseTableSearch(value, allowed)` 驗證關鍵字及欄位白名單；`tableSearchMaxLength=200` 限制長度。DataTable 的 `search={{ value, onChange, copy }}` 開啟共用搜尋列；`toolbarStart` 放在 Export／Columns 後、搜尋列前，可放 Reload。搜尋控制最大 360px，左側為彈性輸入，中間為 64px 的 All／Funnel fill 按鈕，右側為搜尋 icon。部分選取時，欄名標籤在控制項右側延伸並可逐項按 × 移除；全部選取時隱藏標籤；標籤使用右側剩餘空間，超出時在單列內水平滑動，窄容器下整列移至搜尋框下方。`copy.remove(label)` 注入移除標籤的無障礙文案。Columns 與搜尋共用 `DataTableFieldPicker` 的 Checkbox、All 半選狀態、方向鍵／Space 操作及 Escape 焦點還原；選項使用 `{ id, label, checked, disabled? }`，owner 透過 `onAllChange`／`onChange` 保留各自的資料規則。三個工具列選單共用 `DataTableMenu.module.css` 與 `tableToolbarMenuPosition`，統一起始邊、4px 間隔及主題樣式；下拉保留完整欄名所需寬度。選項來自 column ID／label（searchable=false 可排除不支援搜尋的計算欄），Actions 不列入。typing、勾選及移除標籤只修改暫存，輸入框 Enter 或搜尋按鈕才通知 owner，元件不讀 API 或篩選目前一頁。

`useDataTableQuery(sortable, fields, initialSize?, searchable?)` 和 `readTableQuery` 可接收搜尋欄位白名單；`onSearchChange` 回到第一頁，保留 size／sort／filters。`writeTableQuery` 保存 search／search_fields，支援重新整理及上一頁／下一頁。Management API 在資料庫以不分大小寫的包含比對搜尋所有符合列：搜尋欄位以 OR、原有逐欄 filters 以 AND 組合，先 COUNT 再分頁；%／_ 為一般字元。清空後送出會清除搜尋。數字可搜尋部分字串，布林使用 true／false，UTC 日期支援 ISO 及表格的點分隔格式。

| 模組 / Module                                                | 公開介面與行為 / Public interface and behavior                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`api/http.ts`](api/http.ts)                                 | `requestJson(path, schema, options?)` 驗證未知 JSON 後回傳型別化資料；支援 `signal`、SSR 專用 `baseUrl` 及 `timeoutMs`。`ApiError` 將失敗分為 `network`、`timeout`、`http`、`parse`、`contract`；`retryRead` 僅對暫時性讀取失敗重試一次。 / Validated GET/POST/PATCH requests with cancellation, optional server origin, and timeout; classified errors and one transient-read retry.       |
| [`schemas/records.ts`](schemas/records.ts)                   | `recordIdSchema`、`stableIdSchema`、`monthSchema`、`periodShape`、`validatePeriod`、`uniqueRecords` 提供基礎契約。`numberedPageSchema(itemSchema)` 特化公開 Portfolio 的 `{ items, total, pages, page, size }` 與固定 `pageSize=6`；可調大小的管理契約由 management feature 驗證。 / Common identities/periods and fixed-size public pages; management owns its adjustable page validation. |
| [`schemas/career.ts`](schemas/career.ts)                     | `careerShape`、`careerDetailSchema` 共用 Journey 與 Experiences 的職涯欄位；各 feature 加上自己的欄位。 / Shared Journey/Experiences career fields extended by each feature.                                                                                                                                                                                                                |
| [`api/numbered-query.ts`](api/numbered-query.ts)             | `numberedQuery(resource, locale, schema, options?)` 統一 query key、頁碼、owner 參數、取消與續頁；`assertPageAppend` 防止頁碼、筆數資訊漂移或重複 ID。`fillNumberedPages` 沿用已驗證快取補齊指定範圍；`pageRecords` 衍生攤平列表。 / One continuation policy, append validation, cache-preserving range completion, and derived record lists.                                               |
| [`hooks/usePagedCollection.ts`](hooks/usePagedCollection.ts) | `usePagedCollection(query, queryKey, locked?)` 提供 `records`、`total`、`invalid`、`status`、`onLoadMore`。續頁失敗保留有效資料，契約錯誤由明確重試重設該 query；鎖定或已有請求時不重複續讀。 / Unified collection feedback and bounded continuation while retaining validated data.                                                                                                        |

Feature API 決定 endpoint、item schema 與額外驗證，透過共用方法組裝查詢；頁面與 UI 不重寫 `fetch`、分頁計算或錯誤分類。Query cache 是遠端資料的唯一來源，`pageRecords`／`usePagedCollection` 回傳的列表是衍生值，不再另外放入全域 state。

Feature APIs own endpoints, item contracts, and additional validation. Pages and UI reuse transport, pagination, and errors instead of implementing them again. Query caching remains the source of server data; flattened records are derived values rather than another store.

經歷與專案集合的初始預覽以後端第一頁為界，因此 `ExpandableCollection` 與 owner 標籤的初次續讀判斷都引用 `pageSize`，目前為六筆；不在 UI 另寫一份數字。這個頁數政策與標籤的 75% 寬度政策分工不同：前者決定初始集合範圍，後者決定一列放得下多少標籤。

Experience/project collection previews and initial owner continuation share the API's `pageSize`, currently six records. UI does not duplicate this number. First-page boundaries and measured 75% tag width have separate responsibilities: initial record range and visible labels per row.

```ts
import { useInfiniteQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { numberedQuery } from '@/shared/api/numbered-query';
import { numberedPageSchema, recordIdSchema } from '@/shared/schemas/records';

// Feature-owned schema: additional domain fields and relationships belong here.
const itemSchema = z.object({ id: recordIdSchema, label: z.string() });
const itemsSchema = numberedPageSchema(itemSchema);

/** Define one endpoint contract and reuse the common continuation policy. */
export function itemsQuery(locale: string, baseUrl?: string) {
  return numberedQuery('items', locale, itemsSchema, { baseUrl });
}

/** Subscribe to the same query identity used by prefetch and collection feedback. */
export function useItems(locale: string) {
  return useInfiniteQuery(itemsQuery(locale));
}
```

以上 `items` 是新增 feature 的示例資源，需有相符的後端 endpoint；現有實作可參考 `features/experiences/api/experiences.ts`。傳給 `usePagedCollection` 的 query key 必須來自同一個 feature 查詢函式，不手動拼接另一份 key。server 用 `baseUrl` 不應序列化進公開資料。

`items` illustrates a new feature and requires a corresponding endpoint; the existing experiences API is a concrete example. Pass the feature query's exact key to `usePagedCollection`. Keep server-only origins outside serialized public data.

## 公開身份與按需載入 / Public Identity and Demand Loading

`api/portfolio.ts` 的 `PortfolioSiteSelector` 僅供 Site 查找，互斥接受 `user` 或 `site_id`；其他五支內容 API 只接受 `site_id`，省略時保留 default 讀取。`portfolioContentParams(locale, siteId?)` 共用內容參數；`portfolioIdentity`／`portfolioKey` 讓查詢及取消使用相同的 Site／selector＋locale 前綴。Site／Journey 使用 `portfolioQuery` 共用單份回應 transport、契約驗證與取消，request 型別限制只有 Site 能帶 `user`；四個分頁 endpoint 使用 `numberedQuery`，保留各 domain 額外驗證。`cancelPortfolioQueries` 一起取消指定 lookup 和已解析 Site 的內容，不取消其他 owner／auth；尚未解析 Site 時不連帶取消 default。`schemas/portfolio.ts` 的 `publicUserSchema` 與後端相同，統一 handle 格式與保留字。

`PortfolioSiteSelector` permits mutually exclusive `user` or `site_id` lookup only for Site metadata. The other five content APIs accept only `site_id`, with omitted IDs retaining the public default. `portfolioContentParams` builds content parameters; identity/query helpers share one cache and cancellation prefix. `portfolioQuery` owns Site/Journey transport and limits user selectors to Site at the type boundary; `numberedQuery` owns pagination while domain validation remains specialized. `cancelPortfolioQueries` releases the selected lookup and resolved content without cancelling another owner or auth; an unresolved explicit owner never cancels default content. The public handle schema matches backend format and reserved routes.

`context/portfolio.tsx` 的公開介面提供已解析的 `site_id`／`user` 和原始 public selector；完整 DTO 留在各 feature query cache。`usePortfolioScope(enabled?)` 統一 subsection 的 Site 與 demand guard：協調中的頁面必須先解析 Site，獨立 feature 則維持原有 default 讀取。共用層不引用 Site feature，更不把 SESSION 帶入公開 owner 選擇。

`PortfolioAccess`（`api/portfolio.ts`）定義 public／preview 讀取模式；`portfolioTransport(access?)` 為 preview 提供 management/preview 前綴、credentials=include 與 cache=no-store。`portfolioKey` 與 `cancelPortfolioQueries` 接受可選 access；`portfolioQuery`／`numberedQuery` 的 options.access 與 PortfolioProvider 的 access 共享相同來源。preview query 使用獨立的 portfolio-preview 前綴和 meta.private=true，不能進入 SSR dehydration；public 預設、身份與分頁契約維持原樣。

The context interface exposes resolved ownership and the original Site selector; feature caches retain complete DTOs. `usePortfolioScope(enabled?)` shares the Site/demand guard: coordinated pages wait for Site resolution, then send only its ID for content reads, while standalone features retain their default-read behavior. Locale staging infers that ID from cached Site metadata and cannot capture another default portfolio while a named Site remains unresolved. The context imports no domain feature and never selects public ownership from session identity.

SSR loader 與切語言 staging 共用 `app/query-client.ts` 的 `withIsolatedQueryClient(work, signal?)`。Callback 在 cache 清理前複製 snapshot；取消會停止讀取，已取消的工作不能提交結果，成功／失敗都解除 listener 並清空臨時 cache。瀏覽器跨頁的 QueryClient 持續存在，由個別 owner 的取消與公開 identity 上限管理。

SSR and locale staging reuse `withIsolatedQueryClient(work, signal?)`. The callback copies its result before cleanup; cancellation stops reads and prevents a completed snapshot from being returned. Success and failure both release listeners and temporary data. The persistent browser client instead uses scoped cancellation and the public identity cap.

`hooks/useSectionDemand.ts` 以穩定 anchor、Site／locale scope、viewport 或明確導覽啟用讀取，掛載與清理 observer 成對。`lib/viewport.ts` 共用可取消的觀察：資料 demand 可用 200px margin，動畫 visibility 使用 0px。

Section demand follows stable anchors, ownership/language scope, viewport and explicit navigation. The common viewport observer returns cleanup; reads can use a 200px margin while active animations use actual 0px visibility.

## 管理存取組合 / Management Access Composition

SESSION 與管理權限屬於 auth feature，由 route／page 組合，不放進 shared 的通用讀取或表格。輕量 [`auth/session`](../features/auth/session.ts) 的 `refreshAuthSession` 在管理入口重新讀取 cookie 身份；[`auth/permissions`](../features/auth/permissions.ts) 的 `canManage` 要求旗標明確為 true，選單、sidebar 與表格 gate 共用相同政策。網站／監控使用 `is_manage_sites`，帳號使用 `is_manage_users`，角色使用 `is_manage_roles`；監控目前只有選單項目。

SESSION and management rights remain auth-feature responsibilities composed by routes/pages. Lightweight [`auth/session`](../features/auth/session.ts) freshly checks cookie identity through `refreshAuthSession`; [`auth/permissions`](../features/auth/permissions.ts) shares strict-true `canManage` across the menu, sidebar and table gate. Sites/monitoring use `is_manage_sites`, users use `is_manage_users`, roles use `is_manage_roles`, and monitoring remains menu-only.

[`routes/management`](../routes/management.tsx) 在瀏覽器檢查通過後才載入管理頁或列表；SSR／首次 hydration 只重用 `LoadingIndicator`，不序列化身份或私有列。已確認訪客、false 權限或 SESSION HTTP 401／403 由呼叫端使用 `useNotifications` 發出 warning，再 replace 到三語 Access denied。網路／服務／契約錯誤則維持內容隱藏並提供重試。取消的決定不得提交；身份／角色／管理旗標改變時取消並移除 private cache，保留公開資料。DataTable 不判定權限；後端管理讀取與 preview 由共用 `ManagementPermission` dependency 重新驗證目前帳號及角色權限。

The [management route](../routes/management.tsx) loads the page/lists only after its browser check succeeds. SSR and first hydration reuse `LoadingIndicator` without serialized identity or private rows. Confirmed guests, false permissions or SESSION HTTP 401/403 make callers publish a warning through `useNotifications` and replace the URL with localized Access denied. Network/service/schema failures keep content hidden with explicit retry. Canceled decisions cannot commit; identity/role/management-flag changes cancel and remove private cache while retaining public data. DataTable does not authorize access; backend management reads and previews independently refresh account and role permissions through the shared `ManagementPermission` dependency.

## 日期與標籤計算 / Dates and Tag Calculations

| 模組 / Module                            | 公開介面與使用限制 / Public interface and constraints                                                                                                                                                                                                                                                                                                                    |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`lib/dates.ts`](lib/dates.ts)           | `monthIndex`、`monthLabel`、`monthDuration` 處理有效 `YYYY-MM`；`periodLabels`、`projectPeriod` 接收期間、語系與 `DateCopy`。`currentMonthUTC`、`careerYearRange`、`workDuration` 處理完整職涯摘要；呼叫端傳入明確 UTC 月份，SSR 與 hydration 使用同一基準。 / Valid calendar arithmetic, injected localized period labels, and deterministic complete-career summaries. |
| [`lib/tag-layout.ts`](lib/tag-layout.ts) | `labelTags(labels)` 將完整標籤陣列轉為 UI 識別資料，接受 `null`。`tagPreviewCount(widths, total, available, gap, toggleWidth)` 依實際寬度在列的 75% 內容納有序標籤與 disclosure；不固定截取六個。 / Stable tags and a measured 75% preview including its disclosure.                                                                                                     |
| [`lib/site-url.ts`](lib/site-url.ts)     | `publicSiteOrigin(value)` 接受明確設定的 HTTP(S) origin，拒絕帳密、路徑、query、hash 與無效輸入；無效值回傳 `undefined`。 / Validate an explicitly configured public web origin for canonical metadata.                                                                                                                                                                  |

日期計算不讀取 feature state，文案由 `i18n/date-copy.ts` 注入。完整經歷與專案卡片的技能使用 `labelTags`；分類技能有後端識別碼，直接使用已驗證 records，保留 owner 的真實 `total`。

Date helpers do not access feature state; `i18n/date-copy.ts` supplies localized copy. Complete card labels use `labelTags`, while category skills retain validated backend IDs and the owner's actual total.

```tsx
import { useTranslation } from 'react-i18next';
import { tagCopy } from '@/i18n/tag-copy';
import { labelTags } from '@/shared/lib/tag-layout';
import { ExpandableTagList } from '@/shared/ui/ExpandableTagList';

/** Reuse measured disclosure for complete local labels without owning any API. */
export function LabelPreview({ labels }: { labels: string[] | null }) {
  const { t } = useTranslation();
  return <ExpandableTagList items={labelTags(labels)} copy={tagCopy(t)} />;
}
```

## 訂閱、定位與焦點 / Subscriptions, Placement, and Focus

| 模組 / Module                                                      | 公開介面與責任 / Public interface and responsibility                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`hooks/useMediaQuery.ts`](hooks/useMediaQuery.ts)                 | `useMediaQuery(query, serverValue?)` 訂閱 media 變化，SSR 使用固定預設值；`mobileQuery` 與 `reducedMotionQuery` 統一 JS 條件。 / Media subscriptions with deterministic server snapshots and shared conditions.                                                                                                                                                                            |
| [`hooks/useDocumentVisible.ts`](hooks/useDocumentVisible.ts)       | `useDocumentVisible()` 提供文件可見狀態，讓持續播放／裝飾效果停止排程。 / Document visibility used to suspend ongoing playback and decoration.                                                                                                                                                                                                                                             |
| [`hooks/useDisclosureFocus.ts`](hooks/useDisclosureFocus.ts)       | `useDisclosureFocus(open, surfaceRef, initialRef, onClose)` 統一非 modal 選單開啟後的初始焦點、焦點移出關閉及 rAF／listener 清理；refs 與 `onClose` 維持穩定。Appearance 指向第一個 slider，Language 指向已選語系。 / Shared initial focus, outside-focus dismissal, and cleanup with stable refs/callback; the owner selects its initial control.                                         |
| [`hooks/useReturnFocus.ts`](hooks/useReturnFocus.ts)               | `useReturnFocus(open)` 回傳 trigger 記錄 callback；從開啟事件的 `currentTarget` 先記錄控制項，關閉後在 modal 清理完成時還原焦點，適用延遲載入對話框；卸載清理 rAF，不還原已移除／停用／inert 控制項。 / Capture the activating control before asynchronous work and restore it after dialog cleanup.                                                                                       |
| [`hooks/useHoverTooltip.ts`](hooks/useHoverTooltip.ts)             | `useHoverTooltip()` 回傳 `triggerProps`、可為 `null` 的 `tooltipProps`、`show()` 與 `close()`；共用 hover／可見鍵盤焦點、描述關聯與關閉生命週期。OnlineVisitors 與 AuthCowScene 共用；點擊動作留在呼叫端。 / Shared tooltip disclosure and cleanup; online visitors and cow controls retain their own actions.                                                                             |
| [`hooks/useCowWorkspaceMotion.ts`](hooks/useCowWorkspaceMotion.ts) | `useCowWorkspaceMotion({ motion?, parallax?, phase?, pointerScope?, pointerOrigin? })` 回傳場景 ref 與局部 pointer handlers；管理表情剩餘時間、細指標視差、可見性與暫停訂閱。`page` 模式改以整頁事件追蹤目前 ref 的中心；Hook 清理 timer、rAF、observer 與 listener。 / Shared cow phase clock and pointer motion with optional full-page tracking, preference gates and resource cleanup. |
| [`lib/floating-panel.ts`](lib/floating-panel.ts)                   | `floatingPosition(anchor, container, width, height, bottom?, topBoundary?)` 純計算座標、tail 方向與 `maxHeight`；`floatingSidePosition(anchor, container, width, height, side, bottom?, topBoundary?)` 共用側邊定位與左側空間不足的垂直回退。輸入是同一 viewport 的 bounds。 / Pure anchored placement, fit-aware side placement, and available-content budgets.                           |
| [`hooks/useAnchoredPanel.ts`](hooks/useAnchoredPanel.ts)           | `useAnchoredPanel(panelRef, anchor, containerRef?, bottomRef?, placement?, topRef?)` 共用量測、resize／scroll 監聽與清理；`placement` 為 `above`、`side`、`side-left` 或 `below-header`，`topRef` 可傳一個或多個保護區域。 / Shared geometry measurement, coalesced updates, and observer/listener cleanup.                                                                                |
| [`lib/focus.ts`](lib/focus.ts)                                     | `cycleDialogTab(event, surface)` 在 dialog 邊界循環 Tab，略過 disabled、hidden、inert 元素；呼叫端／Bootstrap 仍管理開啟、Escape 與還原焦點。 / Boundary Tab wrapping without replacing the owning dialog lifecycle.                                                                                                                                                                       |

`useAnchoredPanel` 以元素 inline style 寫入 `left`、`top`、`--tail-x`、`--tail-y`、`--tail-center-y`，並標記 `data-below`、`data-side`、`data-side-left`、`data-over-point`。`side` 將面板放在 trigger 右邊、尾巴朝左；`side-left` 將面板放在左邊、尾巴朝右，左側空間不足時回退成一般 above／below 定位。有保護上界時，呼叫端須以 `--floating-max-height` 限制面板並允許內容捲動，不能只量測卻不處理過高的內容。傳入的 ref／ref 清單保持穩定，以免無意重建 observer。所有 DOM 定位與訂閱在瀏覽器生命週期內啟動。

Anchored placement writes position, tail variables, and orientation attributes. Side placement keeps the panel on the trigger's right; side-left uses its left with a right-facing tail, falling back above/below when there is no room. A protected upper boundary publishes `--floating-max-height`; the consumer must constrain its panel and provide content scrolling. Keep refs and ref arrays stable. Browser effects own DOM access, subscriptions, and complete cleanup.

`placement="below-header"` 以 `topRef` 清單的第一個元素作為外框上界；其餘與面板水平重疊的區域改為 `--floating-content-inset`，讓呼叫端增加正文／關閉按鈕的頂部留白並從高度 budget 扣除。外框與尾巴因此能貼近 header 內的 trigger，而不覆蓋工具列。一般 `above`／`side` 維持原本定位。

With `placement="below-header"`, the first upper ref protects the shell's top edge. Subsequent horizontally overlapping guards publish `--floating-content-inset`; consumers add it to copy/close spacing and subtract it from the content height budget. This keeps the frame and tail near a header trigger while protecting the toolbar. Ordinary above/side placement retains its existing geometry.

`useDisclosureFocus` 的 `surfaceRef` 包含 trigger 與面板；`initialRef` 指向實際可聚焦控制項。`onClose` 使用穩定 callback，避免每次更改 slider 或文案時重新啟動初始焦點。可選第五個參數 `activationKey` 只在切換面板內容時重啟初始焦點，例如齒輪選單進入或返回主題／語言頁。初始 rAF 執行前若焦點已改變，保留使用者的新焦點。Hook 不攔截 Tab，也不接管 Bootstrap 的 Escape、outside pointer 與關閉後焦點還原。

For `useDisclosureFocus`, the surface contains both trigger and panel, and the initial ref identifies a usable control. A stable close callback prevents ordinary value updates from restarting initial focus. An optional fifth activationKey restarts focus only when switching panel content, such as entering or returning from gear preferences. If focus changes before the initial frame runs, the hook preserves the new focus. It leaves Tab, Escape, outside-pointer dismissal, and restoration to the owning dropdown.

`useHoverTooltip` 將 `triggerProps` 展開到按鈕，只有 `tooltipProps` 存在時才掛載 `PixelTooltip` 並傳入這組 props。只揭露描述的 click／tap 呼叫 `show()`；牛控制先呼叫 `close()`，再執行自己的動作。非 touch pointer 移入與 `:focus-visible` 開啟提示，開啟時才加上 `aria-describedby`。滑鼠離開延遲 150ms 關閉，讓 pointer 能移入提示窗；可見鍵盤焦點保留提示，touch 不套用 hover 離開。焦點移出且兩個區域都未 hover、外部 pointerdown、Escape、scroll、resize、window blur 或文件隱藏時關閉；關閉／卸載清理 timer 與 listener，焦點仍由原按鈕持有。

Spread `triggerProps` onto the button and mount `PixelTooltip` with `tooltipProps` only while those props are present. Description-only click/tap actions call `show()`; cow controls call `close()` before their own action. Non-touch pointer entry and visible keyboard focus disclose the description; `aria-describedby` exists only while open. A 150ms departure delay allows movement into the tooltip, visible keyboard focus retains it, and touch skips hover dismissal. It closes on blur when neither surface is hovered, outside pointerdown, Escape, scroll, resize, window blur or document hiding. Timers and listeners are cleaned up on closing/unmount without moving button focus.

```tsx
import { useCallback, useRef, useState } from 'react';
import { useDisclosureFocus } from '@/shared/hooks/useDisclosureFocus';

/** Share focus lifecycle while keeping disclosure state and rendering with its owner. */
export function useNoticeControls() {
  const [open, setOpen] = useState(false);
  const surface = useRef<HTMLDivElement>(null);
  const initial = useRef<HTMLInputElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDisclosureFocus(open, surface, initial, close);
  return { open, setOpen, surface, initial };
}
```

將 `surface` 接到包含 trigger／面板的容器，將 `initial` 接到開啟後應聚焦的控制項；這是呼叫端組裝示例，不需為每個選單再寫一份共用 Hook。

Attach `surface` to the wrapper containing trigger and panel and `initial` to the intended focused control. This illustrates caller composition; consumers can call the shared hook directly.

```tsx
import { useRef } from 'react';
import { useAnchoredPanel } from '@/shared/hooks/useAnchoredPanel';
import { PixelBubble } from '@/shared/ui/PixelBubble';

/** Compose a shared shell and placement; the owner decides when to mount and close it. */
export function AnchoredNotice({
  anchor,
  closeLabel,
  onClose,
}: {
  anchor: Element | null;
  closeLabel: string;
  onClose: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useAnchoredPanel(panel, anchor);
  return (
    <PixelBubble ref={panel} closeLabel={closeLabel} onClose={onClose}>
      <p>Notice content supplied by the owning feature.</p>
    </PixelBubble>
  );
}
```

## 共用 UI / Shared UI

[`usePageEntrance`](hooks/usePageEntrance.ts) 接收 root 與 `{paused,subscribe,enabled?,ready?,onReady?}`，共用首次進場與主題 prepare／replay／cancel 生命週期。enabled 預設 true，ready 預設 true，onReady 可省略；業務 callback 由 owner 提供，最多觸發一次，較晚 ready 不重播畫面。disabled／卸載清理 marker、訂閱與 timer；pause 結束初次進場，恢復不重播。shared 不引用 appearance feature，subscribe 接收結構化的階段字串。

[`createEntrance`](lib/entrance.ts) 的 prepare／play／cancel／dispose 與同模組 `entranceTiming.durationMs=1400` 管理同一個有限時序；[`PageEntrance.module.css`](ui/PageEntrance.module.css) 的 frame class 及 data-entrance-content／data-entrance-navigation 標記共用內容、側欄及手機導覽的 keyframes。首頁與 Settings 使用同一份 controller、Hook、樣式及 BackgroundField，首頁的聯絡 callback 留在頁面薄 adapter。

The shared usePageEntrance hook owns paired setup/cleanup and one startup/palette timeline with optional owner readiness. createEntrance supplies finite playback operations and entranceTiming fixes the 1400ms deadline. PageEntrance styles consume content/navigation markers without replacing DOM. Public and settings pages share these implementations; the public page alone supplies its contact callback.

`BackgroundField` 的幾何沿用 `--rail-width`／`--rail-compact-width`；`--field-mobile-top` 預設 64px 對應首頁固定手機導覽，沒有頂欄的 Settings 注入 0px，平板 drawer 版面把 rail 寬度設為 0px。不另外產生動畫、格線或滑鼠追蹤器。

`Breadcrumb(label,items)` 只呈現 owner 傳入的階層、原生連結與可選圖示；最後一項標示 `aria-current="page"`，分隔符不加入讀屏文案。版面支援長名稱換行，文案、網址與資料讀取留在使用它的頁面。

`Breadcrumb(label,items)` renders injected ancestors, native links and optional icons. The final item uses `aria-current="page"`, separators are decorative, and long names wrap. Its owning page supplies copy and destinations; the shared component performs no data reads.

`SidebarRail`、`SidebarLinks`、`SidebarDrawer`（[來源](ui/SidebarNavigation.tsx)）是首頁與 Settings 共用的導航模組。SidebarRail 接收 compact／onCompact、收合與展開文案、brand、可選 brandLink(to,label)、leading／trailing、children 與 footer；drawerAt 選擇 phone（760px）或 tablet（1024px）的桌面側欄隱藏條件。兩邊共用 32px 雙箭頭控制、180 度旋轉、80px 收合寬度、至少 48px 的項目列高、8px 列間距及 18px 圖示；品牌與文字保持 DOM 並以 max-width、opacity、visibility 收合，不切換成漢堡圖示。

`SidebarNavigationItem` 提供 id、label、icon、可選 href／to／onSelect、current、ordinal 與 group。group 是呼叫端傳入的翻譯後分組標題；相鄰同組項目只顯示一次低調小字，桌面與 drawer 共用，compact 隱藏標題，未指定 group 維持平面列表。SidebarLinks 接收 items、label、active 與 compact，統一 anchor／Router link／button 的排版；compact 狀態的 tooltip 透過 body portal 呈現，沿用 useAnchoredPanel 與 useTooltipDismissal，在 Escape、外部點擊、resize、blur、文件隱藏或捲動時關閉並保留原項目焦點。呼叫端決定權限、排序、網址與翻譯，shared 不取得 SESSION 或 Site 資料。

SidebarDrawer 接收 id、open、onClose、label、closeLabel、children、footer 與可選 headerOffset（0 或 64px），共用 250px Offcanvas、關閉圖示、transition 與 cycleDialogTab。首頁保留 64px 固定頂欄避讓；Settings 從畫面頂端開啟，標題只提供無障礙名稱，不顯示 Management 字樣。兩邊的 mobile trigger 都使用共用 icon-button。

Public and settings navigation share one rail, item list and drawer implementation. Owners supply branding, translated labels, destinations and permission-filtered items. Optional item `group` labels insert muted section captions once per consecutive group in both rail and drawer; compact mode hides captions, and ungrouped lists remain flat. Collapse rotates the same double chevrons and animates existing labels; row spacing, icons and compact tooltips are shared. Only the responsive breakpoint and fixed-header offset differ between the two page layouts.

### 控制項與選單標準 / Control and Menu Contracts

| 共用模組 / Shared module                              | 使用與責任 / Usage and responsibility                                                                                                                                                                                                                                                                                                                                       |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`CloseButton`](ui/CloseButton.tsx)                   | `label` 與 `onClose` 必填；可傳 `ref`、`disabled`、`className`。原生 button、翻譯後的 aria-label、44px 點擊範圍與 20px 圖示一致。className 只負責位置；彈窗擁有確認、關閉與焦點還原流程。 / Native dismissal control with required translated label/callback and optional button ref, disabled state and placement class.                                                   |
| [`useTooltipDismissal`](hooks/useTooltipDismissal.ts) | `useTooltipDismissal(anchor, panelRef, onClose)` 在 anchor 存在時訂閱事件。anchor／portal panel 內部點擊保留提示；外部 pointerdown、Escape、scroll、resize、blur、文件隱藏時關閉。callback 保持穩定；換 anchor、關閉及卸載完整清理。 / Shared dismissal subscriptions without tooltip state, hover timing or focus transfer.                                                |
| [`menu-position.ts`](lib/menu-position.ts)            | `preferenceMenuPosition` 保留 10px 間隔；`boundedMenuPosition` 讓選單翻轉並保留 8px 邊界；`tableToolbarMenuPosition` 統一工具列選單的 4px 間隔；`portaledMenuPosition` 共用邊界規則並使用 fixed 座標。傳給 Dropdown.Menu 的 popperConfig；擴充時建立新物件，不修改共用 preset。 / Typed placement presets; menu state, autoClose and initial focus remain owner-controlled. |

`CloseButton` 已套用 ProjectDetail、ManagementDetails、PortfolioPreview 與 WarningModal。樣式只在 root 匯入一次 [`CloseButton.css`](ui/CloseButton.css)，避免 lazy chunks 重複輸出；feature CSS 只保留絕對定位等差異。`--control-size=44px` 是基本點擊範圍，`--control-size-compact=32px` 用於既有滑鼠側欄控制，`--control-icon-size=20px` 統一彈窗關閉圖示。顏色取主題 token，focus-visible 沿用全域外框，disabled 使用原生行為。Footer 的 Close／Cancel、清除輸入值與清除篩選仍是各自語義的控制項。

Dialog owners compose CloseButton without sharing their distinct content or save/iframe lifecycles. Root-only CSS prevents duplicated lazy-chunk output. Geometry, theme colors, keyboard focus and native disabled behavior form the shared control contract; footer actions and value/filter clearing retain their own semantics.

`useHoverTooltip` 保留單一 button 的 150ms hover bridge；SidebarLinks 保留多個導航項目共用一個 tooltip、移出立即關閉。兩者呼叫 `useTooltipDismissal`，不重複寫瀏覽器訂閱。Escape 若已被處理則忽略；本次處理後停止傳播，避免同一次按键同時關閉背景 modal。共用 Hook 不改變焦點或保存 owner state。

Single-button hover timing and multi-anchor sidebar disclosure remain separate. Both use the same dismissal policy, including nested scroll and document visibility. Consumed Escape stays with the description; an already handled event is respected. The hook never transfers focus or stores feature state.

```tsx
import Dropdown from 'react-bootstrap/Dropdown';
import { CloseButton } from '@/shared/ui/CloseButton';
import { boundedMenuPosition } from '@/shared/lib/menu-position';

// Dialog owns its lifecycle; the shared control only invokes its close callback.
<CloseButton label={copy.close} onClose={onClose} ref={closeRef} />;
// Toolbar owns selection/focus; Popper measures and cleans up the shared placement rules.
<Dropdown.Menu popperConfig={boundedMenuPosition}>{items}</Dropdown.Menu>;
```

### 共用元件清單 / Shared Component Inventory

`HelpTooltip`（[來源](ui/HelpTooltip.tsx)）是一般資料表／表單用的小型說明按鈕，接受已翻譯的 `label` 與純文字 `text`。使用 10px 的 `questionCircle` 圖示、專案面板／邊框／焦點 tokens 及一般圓角提示框與箭頭；不使用 pixel shell。沿用 `useHoverTooltip` 的 hover bridge、鍵盤焦點、點按、Escape／外部點擊／scroll 等關閉生命週期；`useAnchoredPanel` 限制提示於視窗內，portal 掛在 body 或原 modal，避免被表格裁切。元件不載入業務資料、不讀取語系、不觸發資料更新。

`DataTableColumn<T>.help={label,text}` 在欄名左側放置共用 `HelpTooltip`，保留原始 label 給搜尋、排序、Columns 與匯出。左右平衡的 header tracks 保持標題與資料置中；窄表格的整欄篩選點擊區不覆蓋說明按鈕。文案由 feature／page 決定，例如 Role 頁面沿用 `rolePermissionFields` 宣告為七個權限欄注入三語說明，其餘頁面沒有額外按鈕。

`SearchableSelect`（[來源](ui/SearchableSelect.tsx)）是受控單選下拉，支援文字／數字值、搜尋、彩色 `ChoiceChip`、停用選項及原因、鍵盤方向鍵／Enter／Escape、選取後焦點還原。`SelectOption` 定義 value、label、disabled、reason；`SelectPage` 定義 items、page、pages；`SelectSource` 可提供靜態 options 或 `load(search, page, signal)`。`SelectCopy` 注入 search、empty、loading、error、retry、more。搜尋延遲 300ms，翻頁累積去重；新查詢及關閉會取消舊請求並忽略遲到結果。menu 使用 Popper 限制在視窗內，詳情視窗中 portal 留在 modal 內。owner 負責取得資料、權限與保存。`InlineFieldEditor.type='searchable-select'` 經 selection 傳入同一份設定，選取透過 onChange(value, option) 及 onComplete 通知 owner。

`ChoiceChip`（[來源](ui/ChoiceChip.tsx)）共用篩選及編輯選項的七色方塊，預設按 label 穩定取色，也可傳 color。`StatusIndicator`（[來源](ui/StatusIndicator.tsx)）接受 boolean/null 的 value 與 online/offline/unknown 文案，以綠色實心／灰色實心／灰色空心圓呈現，含 accessible label 與 tooltip；不自行判斷在線狀態。

`SearchableSelect` 的 trigger 隨目前文字／色塊收合，只保留下拉箭頭，外框及滑鼠 hover／按下狀態均無邊框；鍵盤焦點仍有 outline。展開選單以選項內容決定寬度，搜尋框不以原生預設 20 字元寬度撐開選單；長內容受 viewport／20rem 上限約束。`contentSizedMenuPosition` 延伸 `portaledMenuPosition`，以 Popper modifier 的 ResizeObserver 在非同步選項、搜尋或續頁改變選單尺寸後重新定位，關閉／卸載時清理 observer。

展開清單沿用 `--table-font-size`（預設 13px）；選項按鈕明確繼承字型，色塊不放大。選項與搜尋框最小高度 32px，勾選圖示 12px，選單內距 6px，使用與 DataTable 相同的緊湊節奏。

下表逐項涵蓋 `shared/ui` 的共用元件／Hook 匯出；型別、context 與時間常數另見各介面說明。場景道具拆件保持內部實作，呼叫端使用完整 `CowWorkspace` 及公開的角色插槽 `DeniedCowCharacter`。

`InlineField`（[來源](ui/InlineField.tsx)）以點選值啟用文字／信箱／URL／數字／多行編輯，布林值直接使用 checkbox 或 switch。`InlineFieldValue` 是 string／number／boolean／null；`InlineFieldEditor` 設定 type、nullable、checkbox、maxLength 與 validate；`InlineFieldCopy` 注入 edit(label)、clear(label)、invalid、empty。`value`／`onChange` 由 owner 控制；元件不讀取資料、不保存草稿或呼叫 API。Enter 完成單行、Ctrl／Cmd+Enter 完成多行、Escape 還原該格，Tab 或點選別處完成編輯；輸入法組字不觸發完成。無效值透過 aria-invalid 與描述文案標示，焦點／點擊區至少 44px。

This inventory covers shared component/hook exports in `shared/ui`. Types, context and timing constants are documented with their associated interfaces. Cow props remain internal; consumers use `CowWorkspace` and the public `DeniedCowCharacter` character slot.

| 匯出與模組 / Export and module                                     | 用途、使用方式與邊界 / Purpose, usage and boundary                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`BackgroundField`](ui/background-field/BackgroundField.tsx)       | `paused`、`speed`、`compact` 與 `copy: { unavailable, retry }`；共用背景／視差光暈，裝飾 `BackgroundSignals` 另 lazy 載入。 / Shared viewport decoration with injected failure copy and a lazy bounded signal controller.                                                                                                                                                                                         |
| [`Breadcrumb`](ui/Breadcrumb.tsx)                                  | 注入 `label`、`items` 的祖先 link／圖示；最後項目使用 aria-current。 / Injected page ancestry without route or data ownership.                                                                                                                                                                                                                                                                                    |
| [`LoadingIndicator`](ui/LoadingIndicator.tsx)                      | `LoadingIndicatorProps` 接收 `label`、可選 `size`／`className`；共用 SVG 載入及 reduced-motion。 / Injected status copy and bounded SVG loading decoration.                                                                                                                                                                                                                                                       |
| [`WarningModal`](ui/WarningModal.tsx)                              | 注入 title、message、closeLabel、onClose；可選 confirm: { label, cancelLabel, onConfirm, variant? } 開啟確認模式，variant 為 primary／danger／success；layout=standard（預設）或 prompt（突出警告圖示、置中文案與並排按鈕）。 / Mount-controlled warning or confirmation dialog with injected copy and callbacks.                                                                                                 |
| [`CowControl`](ui/cow-workspace/CowControl.tsx)                    | 注入 IconName、label、text、pressed、onClick，共用 44px 按鈕及 tooltip 清理。 / Shared button and tooltip lifecycle.                                                                                                                                                                                                                                                                                              |
| [`CowMotionControls`](ui/cow-workspace/CowMotionControls.tsx)      | 注入 `controls`、`copy: CowMotionCopy` 及可選 `eyes`；不讀語系／帳號。 / Reuse motion controls with translated copy.                                                                                                                                                                                                                                                                                              |
| [`useCowMotionControls`](ui/cow-workspace/useCowMotionControls.ts) | `active?` 控制動態，回傳 motion、preferences、toggle；暫停不覆寫個別偏好。 / Shared playback and independent preferences.                                                                                                                                                                                                                                                                                         |
| [`DeniedCowCharacter`](ui/cow-workspace/DeniedCowCharacter.tsx)    | `motion` 控制獨立瞳孔；只提供 SVG `<g>`，透過 `CowWorkspaceProps.character` 組裝。 / Shared SVG character slot for the denied pose.                                                                                                                                                                                                                                                                               |
| [`SectionHeader`](ui/SectionHeader.tsx)                            | 傳入 `eyebrow`、`title`、可選 `note`，共用標題與右對齊備註版型。 / Inject heading text and an optional right-aligned note.                                                                                                                                                                                                                                                                                        |
| [`DataTable`](ui/DataTable.tsx)                                    | 接收 typed columns、當頁 rows、rowKey、分頁 metadata、受控 sort、文案與事件；使用 Bootstrap table／pagination／switch，搜尋、資料庫排序、API 及取消由 feature 負責。 / Render a controlled server page with Bootstrap controls; features own transport, search, sorting and cancellation.                                                                                                                         |
| [`SectionState`](ui/SectionState.tsx)                              | 接收 `message`、可選 `retryLabel`／`onRetry`、`busy` 與 children；一般回饋使用 status，具重試動作的失敗使用 alert，忙碌時停用重試。 / Present injected section feedback and optional recovery content; disable retry while busy.                                                                                                                                                                                  |
| [`QueryStatus`](ui/QueryStatus.tsx)                                | 傳入 `pending`、`failed`、`empty`、`hasData`、`fetching`、loading／empty／error／retry 文案及 `onRetry`；使用 SectionState 呈現查詢狀態，資料仍由呼叫端渲染。 / Translate query flags into section feedback while consumers retain data rendering, including valid cached data.                                                                                                                                   |
| [`SectionBoundary`](ui/SectionBoundary.tsx)                        | 包住獨立區塊或 lazy 元件；提供安全訊息、`retryLabel` 與 `resetKey`，按恢復需求設定 `fallback`、`silent`、`reloadOnRetry`。有通知 provider 時另回報 bug，保留局部恢復。 / Isolate render/chunk failures with explicit reset identity and recovery policy; optionally publish a bug notification.                                                                                                                   |
| [`LoadMoreControl`](ui/LoadMoreControl.tsx)                        | 傳入 `busy`、`label`、`busyLabel`、可選 `error` 與 `onLoad`；忙碌時停用按鈕，API 責任留在 feature。 / Reuse continuation feedback and disabled in-flight controls without owning requests.                                                                                                                                                                                                                        |
| [`ExpandableCollection`](ui/ExpandableCollection.tsx)              | 必填 `items: T[]`、真實 `total`、`hasMore`、`busy`、`copy`、`onLoadMore()` 與 `renderItems(items)`；可傳 `error`／`className`。預覽第一頁、展開後渲染額外記錄；收起移除額外 DOM 並還原焦點，保留 query cache。 / Supply records, total, continuation flags, copy and callbacks; optional error/className customize feedback and styling. Disclosure preserves the feature cache.                                  |
| [`ExpandableTagList`](ui/ExpandableTagList.tsx)                    | 完整陣列只需 `items: { id: string \| number; label: string }[]`／`copy: TagCopy`；分頁 owner 再傳 `total`、`hasMore`、`busy`、`error`、`onLoadMore()`。`onPreviewMore()` 可補讀尚未填滿的 75% 預覽，元件不決定 endpoint。 / Supply identified labels and TagCopy, plus optional pagination state/callbacks; measured preview continuation remains feature-owned.                                                  |
| [`PixelBubble`](ui/PixelBubble.tsx)                                | 共用階梯包邊、bevel、tail 與可選關閉按鈕；傳入 `ref`、內容及 HTML attributes，需關閉按鈕時成對提供 `closeLabel`／`onClose`。定位、內容語意與自動關閉留在呼叫端。 / Reusable stepped shell; callers own placement, semantics, content and closing policy.                                                                                                                                                          |
| [`PixelTooltip`](ui/PixelTooltip.tsx)                              | 接收 `anchor`、`panel`、`text`、可選 `placement` 與 HTML attributes；以 portal 掛載 `role="tooltip"` 的 PixelBubble 並重用 useAnchoredPanel。搭配 useHoverTooltip，由呼叫端提供文案與開關。 / Compact portaled tooltip with shared placement; consumers supply localized copy and disclosure.                                                                                                                     |
| [`Icon`](ui/Icon.tsx)                                              | `name: IconName` 對應本地 Bootstrap SVG allowlist；`label` 提供無障礙文字，裝飾圖示預設隱藏。`pulse="chat"`／`"disclosure"` 與 `highlight` 引用共同呼吸／互動效果。 / Allowlisted local SVGs with accessible labels and shared optional decoration.                                                                                                                                                               |
| [`IconGroup`](ui/Icon.tsx)                                         | 以 `children` 包住圖示及文字，傳入 `pulse`／`highlight`／`className`，讓內容一起播放效果、外層控制維持固定。整組為裝飾且 `aria-hidden`，可操作父元素需提供完整無障礙名稱，子 Icon 不另加 pulse。 / Animate decorative icon/text as one group; the stable owning control supplies accessible meaning.                                                                                                              |
| [`CowWorkspace`](ui/cow-workspace/CowWorkspace.tsx)                | 必填 `label`，`CowWorkspaceProps` 可傳 `phase`、`motion`、`parallax`、`globeRotation`、`leafMotion`、`character`、`codingEffects`、`pointerScope`、`pointerOrigin` 與 `className`；共用場景與動態清理，不讀取帳號或語系。完整 props、素材與重建見 [cow workspace guide](ui/cow-workspace/README.md)。 / Reusable vector scene with injected copy and motion preferences; the guide defines its complete contract. |
| [`NotificationProvider`](ui/NotificationProvider.tsx)              | 在 app 外層掛載一次，傳入 `children` 與已翻譯的 `copy: NotificationCopy`；集中一個 viewport 上方通知、計時、關閉與常駐 live region。 / Own the single application notification host and timer with injected localized copy.                                                                                                                                                                                       |
| [`useNotifications`](ui/NotificationProvider.tsx)                  | 於 provider 子樹中取得 `notify({ kind, message?, id?, icon? })`／`dismiss()`；業務事件與文案由呼叫端決定，缺少 provider 時拋錯。 / Publish or dismiss a notification from the provider subtree; callers own event meaning and message text.                                                                                                                                                                       |

`SectionBoundary.componentDidCatch()` 透過可選 `NotificationContext` 回報 `{ kind: 'bug', id: 'render:' + resetKey }`，使用 provider 的安全預設文案。有無 provider 都保留原本的局部 SectionState、fallback 與重試；`silent` 只影響局部呈現，重設 `resetKey` 可恢復區塊。通知不包含原始 exception／stack，也不取代重試控制。

`SectionBoundary.componentDidCatch()` optionally publishes a bug through `NotificationContext`, using the provider's safe default copy and a render ID derived from `resetKey`. Local feedback, fallback and retry policies continue to work without a provider; `silent` affects local presentation, and a changed reset key recovers the section. The notification neither exposes exception details nor replaces recovery controls.

`ExpandableCollection.copy` 的四個必填欄位均為字串：`more` 是展開文案（剩餘筆數由元件附加）、`less` 是收合文案、`load` 是續頁按鈕、`loading` 是續頁等待文案。`renderItems(items)` 接收目前應呈現的子集合；資料取得由 `onLoadMore()` 的 feature 呼叫端負責。可選 `className` 套用在 disclosure 容器，能透過 `--collection-inset` 調整對齊。

`ExpandableCollection.copy` requires four strings: `more` for disclosure (the component appends the remaining count), `less` for collapse, `load` for continuation and `loading` for its busy state. `renderItems(items)` renders the supplied subset; the feature's `onLoadMore()` owns fetching. Optional `className` styles the disclosure container, including alignment through `--collection-inset`.

`ExpandableTagList.copy` 使用公開型別 `TagCopy`：`more(count)` 回傳展開控制的完整無障礙名稱；`compact(count)` 回傳畫面上的短文案，兩者的 `count` 都是尚未顯示的數量。`less`／`lessLabel` 分別為收合控制的可見文案／無障礙名稱；`load`／`loading` 為續頁文案。六項皆必填。Feature 可重用 `i18n/tag-copy.ts` 的 `tagCopy(t)` 注入翻譯，shared 不直接引用它。省略分頁 props 時，`total` 預設 `items.length`、`hasMore`／`busy` 預設 `false`。

`ExpandableTagList.copy` uses the exported `TagCopy` type. `more(count)` returns the full accessible disclosure name; `compact(count)` returns its short visible copy. Both receive the hidden count. `less`/`lessLabel` supply visible/accessible collapse copy, and `load`/`loading` supply continuation copy; all six fields are required. Features can inject the existing `tagCopy(t)` locale adapter rather than rebuilding the vocabulary. With pagination props omitted, `total` defaults to `items.length`, and `hasMore`/`busy` default to `false`.

`PixelBubble` 的可調整樣式採 CSS custom properties：`--bubble-background`、`--bubble-padding`、`--bubble-backdrop-filter`、`--bubble-tail-step`，以及 `--bubble-close-size`、`--bubble-close-icon-size`、`--bubble-close-top`、`--bubble-close-right`、`--bubble-close-text`、hover／focus 對應 tokens。尾巴預設為 6px 階梯／30px 高；小型 tooltip 可設 `--bubble-tail-step: 4px`，得到 20px 高的尾巴。水平尾巴旋轉原有包邊三角輪廓，反向時鏡射整個形狀；內層縮進一格保留深色階梯邊，根部固定接入 6px 外框，避免小尺寸尾巴留下接縫。Feature CSS 將差異設定在自己的根 class，不複製 shared markup，也不依賴 shared CSS Modules 產生的 class 名稱。

Customize `PixelBubble` through its background, padding, backdrop, tail-step, and close-control variables on the feature's root class. Default 6px steps make a 30px-high tail; 4px steps make a compact 20px-high tail. Horizontal tails rotate the original outlined triangle and mirror the complete shape for the opposite direction. The inset fill retains one step of dark border; the root reaches the 6px shell outline even at the compact size, avoiding a seam. Preserve shared markup and avoid depending on generated CSS Modules class names. The shared tail is decorative and never intercepts pointer input. Supply both `closeLabel` and `onClose` for an interactive close control; omit both for a passive tooltip. Owners compose the appropriate positioning and disclosure lifecycle.

`PixelTooltip` 集中小型提示窗的樣式：14px／16px 內距、12px 文字、4px tail step、最多 260px 且不超出 viewport 的寬度及 layer 80。外殼透過 `document.body` portal 避免受側欄裁切，`useAnchoredPanel` 處理定位與清理；呼叫端指定 `text`／`placement`，搭配 `useHoverTooltip`，不複製共用 markup、幾何或關閉 listener。

`PixelTooltip` owns compact styling: 14px/16px padding, 12px type, 4px tail steps, a viewport-constrained maximum width of 260px and layer 80. Its `document.body` portal avoids sidebar clipping, while `useAnchoredPanel` owns placement and cleanup. Consumers supply `text` and `placement` and compose `useHoverTooltip` without duplicating shell markup, geometry or dismissal listeners.

## 資料表 / Data Tables

完整使用教學、各種 Filter／row renderer、圖示與截圖請見 [DataTable 元件套件 README](ui/README.md)。本節保留共用契約索引與規格。

[`DataTable<T>`](ui/DataTable.tsx) 是通用、受控的 Bootstrap 資料表。必填 props 是 `columns: DataTableColumn<T>[]`、`rows: T[]`、`rowKey(row)`、`page: { page, size, total, pages }`、`sort: DataTableSort[]`、`onSortChange(sort)`、`onPageChange(page)`、`onSizeChange(size)` 及 `copy: DataTableCopy`。可傳 `loading`、`error`、`onRetry()`、`toolbar: ReactNode` 與 `rowActions(row)`；`toolbar` 在欄位選單的同一列呈現 owner 的搜尋／篩選／更新控制，寬度不足時換行，事件及查詢狀態仍由 owner 擁有。`rowActions` 新增操作欄，文案使用 `copy.actions`。Rows 必須是 feature 已驗證的**當頁**資料，metadata 沿用 API 回應；元件不 fetch、不追加其他頁、不在瀏覽器排序，也不引用 i18n。

`DataTable<T>` is a controlled Bootstrap table. Required props provide typed columns, the current validated page, stable row keys, five-field paging metadata, controlled sort state, callbacks and injected copy. Optional loading/error/retry props present query feedback. A `toolbar` ReactNode composes owner-controlled search, filters or refresh beside the column chooser, with responsive wrapping; `rowActions(row)` adds an action column. The component performs no fetching, continuation, client sorting or locale lookup.

可選的 `selection: DataTableSelection<T>` 接收 `keys`、`onChange(keys)`、`allLabel` 與 `rowLabel(row)`，在最左側加入資料列 checkbox 與表頭全選。全選只涵蓋傳入的本頁 rows；部分選取顯示原生 indeterminate，取消全選清除本頁選取。選取欄不列入 Columns 或匯出，也不改變資料欄位；loading、error 或空頁時停用對應控制。Owner 擁有選取狀態及查詢切換時的清除規則。

Optional `selection: DataTableSelection<T>` injects controlled keys, an onChange callback and accessible labels. Its leading checkboxes select only the supplied page, with a mixed header state for partial selection. Selection controls are excluded from Columns and exports and never mutate row values. Loading/error states disable selection; an empty page disables the header. Owners define when query navigation clears selection.

外層以 `data-bs-theme="light|dark"` 控制 Bootstrap 原生控件配色；ManagementPage 將 mist 對應 light、其餘主題對應 dark，先保持 SSR／初次 hydration 一致，再套用瀏覽器偏好。共用元件不訂閱 appearance feature。

The owner supplies Bootstrap's light/dark mode on an ancestor. ManagementPage maps mist to light and the remaining palettes to dark, applying browser preferences after consistent server/initial hydration rendering. The shared component does not subscribe to the appearance feature.

每個 column 需要唯一 `id`、`label` 及 `value(row): string | number | boolean | null`；`sortable` 啟用欄位排序，`initiallyHidden` 隱藏較少使用的欄位，`render(row)` 可覆寫 cell 呈現。未覆寫時，boolean 使用停用、唯讀的 Bootstrap switch，`null` 顯示「—」。API 回應字串以 React 文字渲染，不插入 HTML。欄位選單只改變本地顯示；已隱藏的排序欄仍會顯示在排序摘要，最後一個可見欄不能隱藏。不同資料表請用 React `key` 明確重建其欄位顯示狀態。

Columns supply unique IDs, labels and primitive value accessors. Optional sortability, initial visibility and render callbacks customize presentation. Default cells show disabled read-only boolean switches and a dash for null, never raw HTML. Visibility affects presentation alone; hidden sorted columns remain in the ordering summary. The last visible column cannot be hidden. A React key creates a fresh visibility scope for a different table.

欄位選單頂部提供 `copy.allColumns` 文案的 All checkbox，勾選顯示所有欄位，取消只保留 `hideable=false` 的必要欄位；沒有必要欄位時保留一個原本可見的欄位。部分欄位顯示時使用原生 indeterminate 狀態。All 與個別欄位顯示只修改本地 visibility，不發 API 請求或改變排序；All 固定在選單頂部，長清單捲動後仍可使用。

Columns 選單以 max-content 依最長欄名與 checkbox／內距決定自然寬度，沒有固定 280px 或 Bootstrap 最小寬度；上限仍受 DataTable 容器及 viewport 限制，長欄名可換行。All、必要欄位與長清單捲動維持相同操作。

The Columns menu sizes to its longest label plus checkbox/spacing, bounded by the table container and viewport. It has no fixed 280px width or Bootstrap minimum; long labels can wrap while All and required-column behavior remain intact.

逐欄搜尋由 `DataTableColumn.filter: DataTableFilterSpec` 宣告能力，與 checkbox／toggle／其他 renderer 分開。`text` 提供 Contains、Does not contain、Equals、Does not equal、Starts、Ends、Empty、Not empty；`number`／`date` 提供等於、不等於、大小比較及 Between，nullable 才加入空值條件；`boolean` 使用 Yes／No，`enum` 注入 options。Number 可設定 integer／minimum／maximum。不同欄位以 AND 組合，每欄一個條件，`DataTableFilter` 以唯一 field ID 識別，允許相同顯示標題；`menuLabel` 可指定較明確的選單名稱，同名標題預設附加已翻譯的型別。

`DataTableColumn.filterStyle: 'dropdown-list'` 啟用 **Dropdown list filter**：配合 `filter: { type: 'text', sets: true }`（也支援 sets enum）即可由欄位 value 自動取得 DataTable 已載入資料的不同值，略過空值、文字不分大小寫去重。已出現的選項在同一個 DataTable mount 中保留，讓篩選後仍能改選；未載入頁面不會推測或額外發 API，跨 resource／account／locale 等資料範圍由 owner 使用 key 重建。新值依序配置七色 pastel chip，篩選與排序不改色，超過七種循環使用；原始資料不加入色碼。上方小字 Select(N) 顯示搜尋符合的選項數，Deselect(N) 顯示其中已選數（搜尋為空時包含目前 predicate 的全部選取值）；搜尋時按鈕僅選取／取消符合的值，保留搜尋外已選值，搜尋為空時 Deselect 清除整欄條件，包含網址帶入而尚未載入的選取。搜尋 debounce 300ms 且只縮小清單，不修改表格查詢。預設無勾選代表不限制資料，選取透過 in predicate 篩選，取消最後一個值移除條件並還原資料。搜尋下方是彩色標籤及選取 check，divider 以下為共用 Sort Ascending／Sort Descending／Clear sort；不加 Condition 切換或 Clear filter 項目。

`DataTableChoices`、`DataTableChoice`、`DataTableChoicePage`、`DataTableChoicesSource` 仍提供 owner 注入的 `choices: { options, colored: true }` 或 `choices: { load(search, page, signal), colored: true }`，也可覆寫 Dropdown list filter 的資料來源；省略 colored 使用一般清單。一般 choices 模式預設全選，Values／Condition 可切換文字運算，Deselect 全部 emit 空 in 陣列（零筆），Select 全部清除 predicate；與 Dropdown list filter 的明確選取模式分開。動態來源只在選單開啟時載入，More 讀下一頁；Escape／關閉／來源切換取消未完成載入，文案由 `DataTableFilterCopy` 注入。

複選使用 `in`／`not_in` 字串陣列，只允許宣告 sets 的文字或 enum 欄位；`tableFilterMaxValues` 為 100。空的 in 陣列代表不選任何值，清除條件才是全選；not_in 保留未明列值的選取狀態，避免分頁未載入選項消失。文字比較不分大小寫，拒絕重複值；否定運算排除 null，未知欄位與型別不合一樣拒絕。選項標籤支援省略號與 hover 全文，固定的七色 pastel chip 保持深色文字對比，顏色依 value 穩定配置，也可由 `DataTableChoice.color` 指定。原始 API／匯出資料不加入色碼。

`filters`／`onFiltersChange` 是受控 props；宣告 filter 的欄位會顯示 icon。`DataTableColumnMenu` 組合條件、型別輸入、單欄清除與排序，選單寬度為 224px，窄 viewport 保留左右各 8px，篩選輸入維持至少 44px 高度；divider 下方三個排序項目使用 4px 上下內距與桌面 32px 高度，窄螢幕／觸控維持 44px 點擊區；頁面不需要自行組選單；`DataTableFilterCopy` 注入完整文案。文字／數字／日期輸入 debounce 300ms，Enter 立即套用，布林／選項自動套用；讀取中仍可修改篩選並由 owner 取消舊請求。條件 icon 高亮，Escape 關閉並復原焦點。隱藏欄位保留條件，表格工具列提供清除全部篩選。

日期欄位自動使用瀏覽器原生日曆（`input type=date`），點擊欄位即開啟 picker，calendar 裝飾使用 Bootstrap icon 並繼承 light／dark form scheme。選單僅提供 Equals、Does not equal、After、Before、Empty、Not empty；不要求輸入時分秒。選定值以 `YYYY-MM-DD` 傳給 owner，以 UTC 日界計算：Equals 為 `start <= value < nextDay`，Does not equal 排除整天及 null，After 為 `value >= nextDay`，Before 為 `value < start`。Empty／Not empty 對所有日期欄位開放。現有 ISO timestamp 書籤與 transport 的精確比較仍可讀取，開啟選單不自行改寫既有條件；日期範圍的舊 API 能力保留，新的 UI 依指定六項條件呈現。日曆可選 0001-01-01 至 9999-12-30，確保次日邊界有效。

純契約位於 `lib/table-filter.ts`：`TableFilterOperator`、`DataTableFilterSpec`、`DataTableFilter`、`filterOperators(spec)`、`parseTableFilters(raw, fields)`。未知欄位、型別不符、重複條件、反向範圍與超限文字都會拒絕；文字最多 200 個 Unicode 字元，不切成多個搜尋詞。null 使用 Empty，false／0 是實際值；否定運算排除 null。資料篩選、總數與分頁由使用端的完整資料來源處理，DataTable 不篩選當頁 rows。

共用 URL 狀態是 `DataTableQueryState`；`readTableQuery(params, sortable, fields, initialSize?)` 正規化書籤，`writeTableQuery(state)` 序列化穩定的 filters 順序。`useDataTableQuery(sortable, fields, initialSize?)` 接上 React Router，回傳 state 與排序／篩選／翻頁／size callbacks；條件或 size 變更回第一頁，Back／Forward 復原條件。未使用 Router 的表格仍可直接傳入受控 props。`useDataTableSelection(scope)` 共用選取狀態與 scope 切換清除，scope 應包含資源、帳號、語言與查詢。翻譯以 `i18n/table-copy.dataTableCopy(t, caption)` 一次取得，不需要每頁重寫文案物件。

所有表頭與資料格水平、垂直置中；表頭以等寬左右區域讓標題中心對齊資料，功能圖示集中於右側。所有欄位（包含 Actions）共用相同表頭布局、高度與文字行高，欄名與控制項在所有尺寸維持同列，避免因是否有排序／filter 而上下錯位。桌面排序圖示 8px、filter 圖示 10px，箭頭／filter 按鈕寬 10px／14px，間距 1px；手機／觸控保留 44px 目標，寬欄透過表格內的水平捲動查看。字串預設單行 ellipsis，native title 在 hover 顯示完整文字；`textWidth` 可設定上限（預設 180px），`truncate=false` 關閉。自訂 renderer、詳情與匯出沿用完整原文。

表格高度預設依資料列自然伸縮，不保留固定高度或強制顯示捲軸。水平捲動只在欄位總寬超出容器時出現；可選 `maxHeight` 接受 CSS 高度（例如 `480` 或 `'60dvh'`），超過限制才啟用內部垂直捲動。隱藏 caption 使用 absolute 並清除負 margin，保留表格無障礙名稱但不佔排版高度；最末資料列不再畫底線，空表格的表頭亦同，底部只由 viewport 外框畫一條線。

The table grows to its rows by default. Horizontal scrolling appears only when columns exceed the container. Optional `maxHeight` accepts a CSS height and enables vertical scrolling only above that limit. The accessible caption is positioned outside row flow without a negative margin. The final body row, or the header of an empty table, omits its bottom border; the viewport supplies the single outer edge.

分頁以 Bootstrap Icons 的 chevron-double-left／chevron-left／chevron-right／chevron-double-right 呈現第一頁、上一頁、下一頁與最後一頁。圖示使用本地 CSS mask，名稱由 copy 注入；空頁、單頁、loading 與首尾邊界停用適當按鈕，不讀取中間頁。

每頁筆數下拉選單依目前數值的位數調整寬度，保留至少 44px 寬及數字／箭頭間距；左右內距一致，數字在整個選單框內置中，6、10、100 都使用相同對齊方式。

`BooleanCell({ value, label, rowId, readonly, checkbox?, unavailableReason?, onChange?, disabled?, busy?, saving? })` 共用布林狀態呈現；預設唯讀，明確提供 onChange 才能編輯。disabled／busy 在保存期間停用，saving 提供讀屏與 title 的保存中說明，頁面負責保存、回復及業務條件。保存後若焦點仍在 body，元件會將鍵盤焦點還給原開關，不搶走其他控制的焦點。元件預設為 switch，傳入 `checkbox=true` 改為 checkbox；`null` 顯示「—」。`unavailableReason` 由頁面決定並提供文案，讓不符合條件的控制淡化，同時提供 title 與讀屏說明。DataTable 的預設布林 cell 與管理詳情共用此元件；個別欄位仍透過 `render(row)` 選擇呈現。

每個可排序欄位提供獨立的 ↑／↓ 按鈕；點擊指定升冪／降冪，再次點擊同方向會取消該欄排序。其他欄位保留，依初次加入的順序最多累積三欄；修改方向保留原順位，取消後重新加入則排在最後。不需要多欄排序模式或 Shift。`sort` 的每項是 `{ field, direction: 'asc' | 'desc' }`，欄位 ID 對應後端白名單。搜尋、篩選、排序或 size 變更回第一頁。元件只呈現 API 的列順序；按鈕以 `aria-pressed` 表示選取方向，表頭保留 `aria-sort`，摘要顯示順位。達三欄上限時，其他欄的箭頭使用 `aria-disabled`，不替換既有排序。

Each sortable column has independent ascending/descending buttons. Activate a direction again to cancel only that column. Other criteria remain in first-selection order, up to three fields, without a mode checkbox or modifier key. Direction changes retain priority; removing and re-adding a field moves it to the end. Buttons expose aria-pressed, headers retain aria-sort and the summary shows priority. At capacity, unselected columns are aria-disabled rather than replacing selected criteria. Features serialize the controlled state and request the selected server page; DataTable never reorders local rows.

Owner 必須保留 `onSortChange([])` 的空排序狀態，讓下一次箭頭點擊能直接選取指定方向。ManagementPage 以 URL `sort=` 記錄清除排序；首次進入且缺少 sort 時，箭頭維持未選取。API 層仍提供穩定的 ID 降冪預設順序，畫面上的排序狀態不會被查詢預設值覆蓋。

Owners must preserve the empty sort array emitted on removal so the next activation can enter ascending order. ManagementPage stores that explicit reset as `sort=` in the URL; an absent parameter leaves both arrows unselected. Transport defaults maintain stable ID-descending database pagination without exposing an implicit technical sorting label or replacing the controlled UI state.

排序標題在 loading 時使用 `aria-disabled` 並阻擋事件，保留目前鍵盤焦點；資料回來後可繼續按 Enter／Space，不需重新 Tab 回欄位。其他分頁與資料查詢控件沿用原生 disabled。

Sort headings retain keyboard focus during loading with `aria-disabled` and guarded activation. Once the response arrives, Enter/Space can continue sorting without tabbing back to the heading; paging and other query controls retain native disabled behavior.

`DataTableCopy` 的所有字串與函式由 locale adapter 注入：`caption`、`loading`、`empty`、`error`、`retry`、`rowsPerPage`、`pagination`、`first`、`previous`、`next`、`last`、`columns`、`sorting`、`clearSort`、`readonly`、`actions`；`direction` 為 `{ asc, desc }`；`range(from, to, total, selected)`、`pageLabel(page)` 及 `sortLabel(column, next)` 提供動態文案，`next` 是 `asc`／`desc`／`none`。空頁的 from／to 為 0；selected 是本頁實際選取數，不包含未顯示的 keys。管理頁左下角顯示 `Showing 1 to 10 of 57 rows, Total: 57`，選取數大於 0 時接上 `, N rows selected`（單筆使用 row），其他語言由 copy 本地化。`loading` 停用資料查詢控制，並在工具列／排序摘要下方、表頭上方置中顯示共用 LoadingIndicator；結束後收起該區，不保留空白高度。錯誤提供 alert 及可選重試；已傳入 rows 保留，由 feature 決定何時使用有效 cache。`DataTable.module.css` 以 `--panel`、`--panel2`、`--text`、`--border`、`--control-hover` 橋接 Bootstrap 變數；row hover 隨主題更新，寬表格只在自身 viewport 水平捲動。

All copy is injected, including captions, query feedback, navigation, column controls, ordering hints, read-only semantics and dynamic range/page/sort labels. Loading disables query controls and centers the shared indicator below the toolbar/sort summary and above the table header; its region collapses when loading ends. Errors provide an optional local retry. Supplied rows remain visible, with cache retention owned by the feature. Semantic application tokens bridge Bootstrap variables for every theme and row hover. Wide tables scroll within their own viewport.

資料列使用緊湊的 `4px 8px` cell padding；表頭沿用原本間距。Actions 欄依內容收窄，操作按鈕桌面至少 `28px × 36px`，手機／觸控至少 `44px × 44px`，左右內距 4px；管理頁圖示按鈕之間不額外加間距。列高由內容與控制項決定，不設定固定高度。

RWD 依**元件容器寬度**處理：根節點是 `data-table` inline-size container，760px 以下工具列以兩排配置，管理 Add／Del 保留方形圖示與無障礙名稱，搜尋最寬 320px；640px 以下分頁與筆數控制分列，頁碼按鈕可換行；表頭標題與功能在同列置中，箭頭保留上下排列與各自 44px 觸控範圍。資料仍保持一列一筆，寬欄位保留在表格自己的水平捲動區；不縮小字體或把頁面本身撐寬。窄容器或 coarse pointer 裝置的主要控件至少 44px，長排序摘要與欄位標籤可以換行；欄位選單寬高受容器與 viewport 限制。Owner 注入的 toolbar 可使用同名 `@container data-table (max-width: 640px)`，應避免固定最小寬度超出父容器；外層 flex／grid item 要允許 `min-width: 0`。

Responsive behavior follows the allocated component width through a named `data-table` inline-size container. At 760px or less, toolbar actions use square icon buttons and search uses a second row capped at 320px; at 640px or less, footer controls wrap. Wide rows scroll only inside the table. Primary controls use at least 44px targets in compact containers or with coarse pointers. Long ordering labels wrap, and the column menu is bounded by available container/viewport dimensions. Injected toolbars may reuse the named container query; parent flex/grid items must permit shrinking with `min-width: 0`.

```tsx
const filterSpecs = {
  id: { type: 'number', integer: true },
  name: { type: 'text' },
  active: { type: 'boolean' },
} satisfies Record<string, DataTableFilterSpec>;
const columns: DataTableColumn<Item>[] = [
  { id: 'id', label: 'ID', value: (row) => row.id, sortable: true, filter: filterSpecs.id },
  { id: 'name', label: 'Name', value: (row) => row.name, sortable: true, filter: filterSpecs.name },
  {
    id: 'active',
    label: 'Active',
    value: (row) => row.active,
    sortable: true,
    filter: filterSpecs.active,
  },
];

function ItemsTable() {
  const { t } = useTranslation();
  const table = useDataTableQuery(['id', 'name', 'active'], filterSpecs);
  const selection = useDataTableSelection(JSON.stringify(table.state));
  const query = useItemsList(table.state); // Feature supplies schema, endpoint and validated page.
  return (
    <DataTable
      columns={columns}
      rows={query.data?.items ?? []}
      rowKey={(row) => row.id}
      page={query.data ?? { ...table.state, total: 0, pages: 0 }}
      sort={table.state.sort}
      filters={table.state.filters}
      onSortChange={table.onSortChange}
      onFiltersChange={table.onFiltersChange}
      onPageChange={table.onPageChange}
      onSizeChange={table.onSizeChange}
      selection={{ ...selection, allLabel: t('management.selectAll'), rowLabel: (row) => row.name }}
      loading={query.isFetching}
      error={query.isError}
      onRetry={() => void query.refetch()}
      copy={dataTableCopy(t, 'Items')}
    />
  );
}
```

此範例只需替換 Item、columns 和 feature 的 `useItemsList`；filterSpecs／columns 宣告於元件外以保持穩定。若資料受帳號／語言限制，selection scope 應加上相同身份資訊。匯出及 rowActions 按需求注入，不需要另做一份 DataTable。匯入 `DataTable`／`DataTableColumn`、`DataTableFilterSpec`、`useDataTableQuery`／`useDataTableSelection` 與 `dataTableCopy` 的實際模組路徑如上。

`WarningModal` 未傳 confirm 時維持原有提示模式；確認模式沿用 Bootstrap 的 dialog、aria-modal、標題／說明關聯，呈現驚嘆號 icon、取消與確認按鈕，預設聚焦取消，Escape／backdrop／右上關閉皆呼叫 onClose，確認僅呼叫 onConfirm。`layout="prompt"` 用於編輯、儲存及單筆／批次刪除確認，頂部警告徽章、置中標題／內容與等寬按鈕沿用主題；最大 420px 寬，短橫向畫面縮小徽章，長說明由 body 捲動。variant=success 用於儲存確認。variant=danger 在 prompt 版型使用 Bootstrap 紅色警示方塊、白色三角驚嘆號及紅色確認按鈕，standard 版型保留紅色行內 icon；控件最小高度 44px，Modal body 可捲動，Bootstrap 擁有焦點圈限及還原。元件不讀取選取列、不 fetch、不執行刪除或自行顯示成功，owner 提供列名／筆數與實際操作。

`WarningModal busy` 由 owner 控制，預設 false。提交刪除期間停用確認、取消與關閉按鈕，忽略 Escape／backdrop 關閉並以 aria-busy 標示確認按鈕；shared 不執行刪除或自動重試。`requestJson` 的 method 支援 GET／POST／PATCH／DELETE，DELETE 的 JSON body 沿用相同型別驗證與錯誤分類。

## 浮動通知 / Floating Notifications

`NotificationProvider` 是共用、非阻擋的提示外殼。通知固定於 viewport 上方中央，寬度最多 420px，保留安全區與兩側空間。Provider 只接收 `NotificationCopy`：`close`、四種 `labels` 與四種 `defaults`。`message` 省略時使用該種類的預設文案；實際翻譯在 app／feature 組合後注入，shared 不引用 `i18n`，不發送 API 或自行判定操作成功。

`NotificationProvider` supplies a reusable, nonblocking host at the upper center of the viewport, constrained to 420px with safe-area and side spacing. Its `NotificationCopy` contains `close`, four `labels` and four `defaults`; an omitted message uses the kind's default. App or feature callers inject localized text. Shared code imports no i18n, sends no requests and does not infer operation success.

| `kind`    | 色彩 / Color            | 使用時機 / Meaning                                                                                                       |
| --------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `success` | 綠 / Green (`#65d79b`)  | 已確認操作成功或已發生的連線恢復。 / Confirmed operation success or connection recovery.                                 |
| `warning` | 黃 / Yellow (`#efc56a`) | 連線中斷、逾時、暫時例外或功能尚未接上服務。 / Offline/timeout conditions, temporary exceptions or unavailable services. |
| `error`   | 紅 / Red (`#ef8585`)    | 請求或操作失敗，例如 HTTP 錯誤。 / Failed requests or operations, including HTTP failures.                               |
| `bug`     | 紅 / Red (`#ef8585`)    | 程式／渲染錯誤或回應無法通過解析、契約驗證。 / Unexpected runtime/render defects or invalid response parsing/contracts.  |

`notify({ kind, message?, id?, icon? })` 永遠只呈現最新一則，不建立 queue。新內容取代舊內容並重新倒數 `notificationDurationMs = 3000`；當目前通知的非空 `id`、`kind`、`message` 與 `icon` 全部相同時，重複呼叫不延長時間。同一 ID 的種類或文案改變仍會取代並重設倒數；通知消失後可再使用同一 ID。`dismiss()` 或右側關閉鈕立即清除通知。取代／卸載時取消舊 timer，舊 callback 不得關閉新通知。

`notify({ kind, message?, id?, icon? })` presents only the latest message, without a queue. Replacement receives a new three-second timer (`notificationDurationMs = 3000`). Repeating the active notification's nonempty ID with identical kind, message and icon does not extend it; changed content or kind replaces it, and an expired ID can be reused. `dismiss()` and the close button clear it immediately. Timer cleanup prevents an older callback from dismissing newer content or surviving unmount.

`icon?: IconName` 可指定操作圖示；省略時使用種類對應的預設圖示，顏色仍由 `kind` 決定。The optional `icon` overrides the operation symbol; omitting it retains the kind default, and kind still controls color.

Live host 常駐並使用 `role="status"`、`aria-live="polite"`、`aria-atomic="true"`；顯示文字及圖示共同表達種類。訊息本身允許點擊穿透，只有 44×44px 的關閉按鈕接收 pointer 操作。通知不 autofocus、不鎖住焦點、不加 backdrop；既有表單、導覽與局部重試保持可操作。短暫進場動畫遵守全域 reduced-motion 規則；自動消失時間不依賴動畫。

The persistent host uses `role="status"`, `aria-live="polite"` and `aria-atomic="true"`; text and an icon accompany the semantic color. The message permits click-through, with only its 44×44px close control receiving pointer input. No autofocus, focus trap or backdrop is added, so forms, navigation and inline retry remain usable. Reduced motion disables the brief entrance animation without changing dismissal timing.

Provider 在應用程式外層接收已完成翻譯的文案；以下示例屬於 app 組合層。實際實作見 [`AppProviders`](../app/providers/AppProviders.tsx)。

The application layer mounts the provider with already localized copy. The concrete app assembly is [`AppProviders`](../app/providers/AppProviders.tsx).

```tsx
import type { ReactNode } from 'react';
import { NotificationProvider, type NotificationCopy } from '@/shared/ui/NotificationProvider';

export function FeedbackRoot({ children, copy }: { children: ReactNode; copy: NotificationCopy }) {
  return <NotificationProvider copy={copy}>{children}</NotificationProvider>;
}
```

Feature 透過 hook 發布有意義的結果；`copy` 由呼叫端用目前語系取得。以下四個 callback 示範各種類，應在對應結果發生時呼叫，成功 callback 應等真正的操作成功後才執行。

Features publish meaningful outcomes through the hook. The caller supplies `copy` in the active locale and invokes the appropriate callback when the corresponding event occurs; success follows a confirmed operation.

```ts
import { useNotifications } from '@/shared/ui/NotificationProvider';

type OperationCopy = { success: string; warning: string; error: string; bug: string };

export function useOperationFeedback(copy: OperationCopy) {
  const { notify, dismiss } = useNotifications();
  return {
    succeeded: () => notify({ kind: 'success', message: copy.success, id: 'profile-save' }),
    unavailable: () => notify({ kind: 'warning', message: copy.warning, id: 'profile-save' }),
    failed: () => notify({ kind: 'error', message: copy.error, id: 'profile-save' }),
    unexpected: () => notify({ kind: 'bug', message: copy.bug, id: 'profile-save' }),
    dismiss,
  };
}
```

[`NotificationEvents`](../app/providers/NotificationEvents.tsx) 負責瀏覽器整合：監聽未捕捉的 `error`／`unhandledrejection`、offline／online，以及 query cache 的最終失敗。連線／timeout、HTTP 4xx 的可預期拒絕顯示 warning，系統 HTTP 失敗顯示 error，parse／contract 或未知程式錯誤顯示 bug；紅色保留給系統故障與程式異常。分類與安全文案 key 由 [`i18n/notification-copy.ts`](../i18n/notification-copy.ts) 提供。取消不通知，同一 query 失敗直到恢復或移除前只回報一次；離線去重只辨識連線失敗，不會吞掉業務規則或權限 warning。已回報失敗的真實 query 恢復，或離線後重新連線，才顯示恢復 success。初次 GET、一般成功 polling 與手動 `setQueryData` 不顯示成功通知。事件 listener 與 cache 訂閱於卸載時清理。

[`NotificationEvents`](../app/providers/NotificationEvents.tsx) integrates uncaught browser errors/rejections, connection changes and terminal query-cache failures. Its locale-layer classifier maps connection/timeout and HTTP 4xx rejections to warning, server HTTP failures to error, and parsing/contract or unexpected defects to bug. Red is reserved for system failures and defects. Cancellations are silent; each query failure is reported once until recovery/removal. Outage deduplication recognizes connection failures specifically and preserves business/permission warnings. Recovery success follows a previously reported failed query's real recovery or an offline-to-online transition. Initial GETs, ordinary successful polling and manual `setQueryData` do not produce success toasts. Unmount removes listeners and cache subscriptions.

通知補充局部回饋：`QueryStatus`、`LoadMoreControl` 與 `SectionBoundary` 保留可用的重試按鈕，欄位驗證仍在欄位標題右側。登入 feature 透過 ConnectedAuthPanel 串接 SESSION API，已知帳密／限流／格式／服務錯誤有本地化提示；只有 `onAuthenticate` 真正 resolve 後才顯示 success 並觸發 welcome 牛姿勢。註冊 send-code／驗證均以真實 API 成功結果顯示提示，email 重複的鎖定操作使用共用 WarningModal；未接 API 的帳號操作顯示 warning。共用層不顯示密碼、驗證碼、原始回應或 stack。

Toasts supplement local feedback: query, continuation and boundary controls retain inline retry, while field validation stays beside its label. ConnectedAuthPanel uses the session sign-in API with localized credential/rate/validation/service failures; only a resolved `onAuthenticate` emits success and enables the welcome pose. Registration sending/verification reflect real API results, and duplicate-email guarded controls open shared WarningModal. Unsupported account actions emit warnings. Messages never expose credentials, verification codes, raw responses or stacks.

## 視覺效果的共用來源 / Shared Visual Sources

全域幾何、色彩與時間在 [`styles/tokens.css`](../styles/tokens.css) 定義；共用裝飾與動態政策在 [`styles/global.css`](../styles/global.css)。經歷與專案 timeline 引用 `--timeline-point-size`、`--timeline-point-keyframe`、`--duration-timeline-pulse`，不各自建立另一份 heartbeat。`Icon` 的 chat、disclosure 與 `IconGroup` 圖示／文字群組引用同一個 `icon-breathe`，以 tokens 表達差異。在線圖示與數字透過 `IconGroup pulse="chat"` 共用 chat 的 4 秒週期，穩定的外層按鈕不播放動畫。`data-decoration` 讓背景暫停政策統一停止持續動畫；減少動態效果由 CSS 與 shared media 訂閱共同處理。

Global tokens define palette, geometry, and timing. Shared global styles define timeline/icon breathing and decoration pause policy. Experience and project timelines reference the same point keyframe and size; individual icons and `IconGroup` icon/text groups customize one shared breathing effect through variables. The online indicator uses the same four-second chat cycle on its inner group while its button hit area stays still. Decoration pauses and reduced-motion preferences remain consistent across features.

`Icon highlight` 共用 chat 圖示在 hover／focus-visible／active 時的高亮前景與光暈，不需要閒置呼吸動畫；`pulse="chat"` 自動啟用此互動效果。`Icon` 與 `IconGroup` 共用效果屬性與 CSS 規則；群組內的 `Icon` 不另外啟用 pulse／highlight，以維持單層光暈。

`Icon highlight` shares chat's foreground and halo on hover, visible keyboard focus and activation, without adding idle breathing. Chat pulse icons enable this feedback automatically. `Icon` and `IconGroup` share decoration attributes and CSS rules; icons inside a group omit their own pulse/highlight so the glow is applied once.

`ExpandableTagList` 收合時的「＋」圖示使用 `Icon pulse="disclosure"`，共用區段圓圈「＋」的縮放與光暈 heartbeat；展開後「−」保持靜態，寬度量測副本也不播放動畫。hover 填色時以 `--on-accent` 保持圖示對比，暫停與 reduced-motion 沿用共用政策。

Collapsed tag-list plus icons reuse the same disclosure breathing as section-level dotted plus controls. Expanded minus icons and inert measurement copies remain static. Hover uses the filled button's foreground token for contrast; shared pause and reduced-motion rules apply.

主題切換的有限生命週期由 `useAppearance().subscribeThemeTransition(listener)` 提供 `prepare`／`replay`／`cancel` 通知；Portfolio page 重用自己的 `createEntrance` 與既有 CSS，遮罩完全覆蓋時暫停於首幀，顯露完成後開始進場。Appearance 不引用 page DOM，page 不另外建立換色控制器。新增元件使用語意色彩 tokens，頁面內容沿用既有進場外殼；不複製 heartbeat、換色或進場 keyframes。具體時序、首次聯絡介紹與中斷規則見[前端 SPEC](../../README.md)。

The appearance feature publishes finite `prepare`/`replay`/`cancel` phases through `useAppearance().subscribeThemeTransition(listener)`. Portfolio reuses its own `createEntrance` and existing CSS: preparation holds the first frame under the opaque veil, and playback starts after reveal. Appearance never imports page DOM, and pages do not duplicate palette controllers. New components consume semantic color tokens and the existing entrance shell instead of copying breathing, palette or entrance keyframes. The frontend specification defines timing, one-time contact disclosure and interruption rules.

主題漸變控制器屬於 `features/appearance`，聯絡氣泡倒數與狀態屬於 `features/site`，地圖播放屬於 `features/journey`，入場與區塊導航屬於 `pages/portfolio`。它們重用通用外殼、定位、焦點與訂閱，但生命週期和業務狀態不同，因此保留各自的 owner。相似的 `setTimeout` 或 `requestAnimationFrame` 不代表可以合併成同一套流程。

Palette transitions, contact disclosure timing, journey playback, and portfolio entrance/navigation have distinct owners and lifecycles. They reuse appropriate shared infrastructure while retaining their specific state. Similar scheduling syntax alone does not justify one generic animation controller.

## 新增與維護規範 / Extension and Maintenance

登入所用的 `PixelTooltip`、`CowWorkspace` 與場景拆件已有英文用途註解；tooltip、定位與牛動態 Hooks 說明各自的訂閱、計時與清理責任。牛的表情／播放／滑鼠／地球偏好由 `AuthCowScene` 擁有；共用層只接受 props，不讀取帳號模式或語系。完整介面與素材重建見 [cow workspace 文件](ui/cow-workspace/README.md)。

The auth consumers `PixelTooltip`, `CowWorkspace` and its scene parts have English purpose comments, while tooltip, positioning and cow-motion hooks document subscriptions, timing and cleanup. `AuthCowScene` owns expression, playback, mouse and globe preferences; shared code accepts props without reading account modes or locale. See the [cow workspace guide](ui/cow-workspace/README.md) for its interface and asset rebuild process.

登入成功的 welcome 行為由 [`AuthCowScene`](../features/auth/components/AuthCowScene.tsx) 組合既有能力：feature 接收真實成功狀態，暫時傳入 `CowWorkspace phase="glance"`，在場景中以 `PixelBubble` 呈現已翻譯的 welcome 文案及指向牛的尾巴。Feature 擁有氣泡定位、語意及顯示時機；stored 表情／播放／滑鼠／地球偏好保留，motion 仍遵守暫停與 reduced-motion。這不新增 shared 帳號成功元件，也不為 CowWorkspace 加入帳號或 welcome 業務狀態。

For a successful-authentication welcome, `AuthCowScene` composes existing primitives: the feature supplies real success state, temporarily selects `CowWorkspace phase="glance"` and places a localized `PixelBubble` with its tail pointing toward the cow. The feature owns greeting placement, semantics and timing. Stored expression, playback, pointer and globe preferences remain intact, and motion still honors pause and reduced motion. Shared code gains no account-success component or account-specific welcome state.

1. 先搜尋既有能力與使用者，再決定放在 feature、page 或 shared；共用的語意與變更原因要一致。 / Search existing modules and consumers before extracting; shared meaning and change reasons must align.
2. 每個方法／Hook／元件說明用途、輸入、輸出、副作用與清理責任；styles 註解說明樣式責任及差異來源。 / Document purpose, interfaces, effects, cleanup, and style responsibilities.
3. 外部資料先由 schema 驗證，型別從契約推導；衍生值直接計算，不再保存一份需要同步的 state。 / Validate external input, derive types, and avoid duplicate derived state.
4. 透過 props、callbacks 與 CSS tokens 表達合理差異；不要讓 shared 接收 feature 名稱以切換業務分支。 / Express supported variation through props, callbacks, and tokens rather than feature-name branches.
5. 異步、observer、listener 與 timer 在取消／卸載時清理；過期 callback 不得更新已失效的畫面。 / Clean up async resources and guard stale callbacks.
6. 共用流程有變更時檢查實際使用者；資料契約、非同步邊界、跨元件焦點、RWD 與特效均須檢查；可重現的回歸案例納入 `frontend/tests`；一次性證據放根目錄的 `agent/`。 / Check contracts, lifecycle boundaries, focus, responsive layouts and effects; maintain regressions in frontend/tests and keep disposable evidence under agent/.
7. 新增或修改公開能力時同步本文件與必要的[元件／頁面規格](../../README.md)，說明實際介面和限制。 / Keep shared and component/page specifications aligned with the implemented interface.

## 共用契約補充與文件檢查 / Contract Inventory and Documentation Check

`hooks/useHydrated.ts` 的 `useHydrated()` 在 SSR／首次 hydration 回傳 false，瀏覽器接續回傳 true，沒有額外事件或 timer。身份、主題及角色動態使用同一個 hydration 邊界；它本身不讀 session、儲存或 DOM。

`lib/auth-transition.ts` 提供 `AuthTransitionPhase`、`authTransitionTiming`、`authTransitionStyle`、`authTransitionImmediateStyle` 及 `createAuthTransition(onPhase)`。Controller 只管理 CSS 階段與有限時鐘，提供 open／back／finish／dispose／getPhase；帳號與 Access denied 的 owner 各自處理 scroll、是否自動進場及清理。`lib/background-signals.ts` 的 `SignalGeometry`／`signalGeometry(width,height)` 是純幾何計算，最多 400 個十字。

共用匯出工具位於 `lib/table-export.ts`。`TableExportCell`／`TableExportMatrix` 是已投影的可見欄位矩陣；`tableCsv`／`tableTsv` 處理 escaping 與 spreadsheet formula 前綴，`tableXlsx` 產生離線 workbook bytes，`tablePrintHtml` 產生已 escape 的列印 HTML。`DataTableExport<T>` 的 filename 由 owner 提供，未指定 loadRows 時只匯出當頁可見欄位，含非 hideable 的 ID，不匯出動作或隱藏欄位。選擇 copy／CSV／Excel／print 才產生內容；loadRows 的取消、Blob URL 與 print iframe 由元件清理。`DataTableCopy.export` 文案由呼叫端注入，資料表不讀帳號或 i18n。

Export 按鈕使用 Bootstrap Icons 的 download，Columns 按鈕使用 ui-checks，圖示與文字置中並保留 6px 間距。Export 選單寬度為 180px，上限隨 viewport 縮小；範圍說明可換行。Copy／Excel／CSV／Print 分別使用 Bootstrap Icons 的 copy、file-earmark-spreadsheet-fill、filetype-csv、printer。SVG 以本地靜態檔案及 CSS mask 呈現，沿用文字顏色並保持裝飾圖示不影響操作的無障礙名稱。

傳输／scope 公開契約：`ApiErrorKind` 分類可重試、HTTP、JSON 解析及契約失敗；`errorCode` 只接受有界的後端代碼，不顯示 raw body。`PortfolioProvider` 注入公開 selector／已解析身份，`usePortfolioContext` 讀取同一 scope；`observeViewport` 回傳 observer 清理函式。牛的 `CowWorkspaceMotionOptions`／`CowWorkspacePhase` 定義 motion、pointer scope 與姿勢；具體生命週期見牛場景指南。

通知型別 `NotificationKind`／`NotificationInput` 定義種類與可選 message／id／icon；shared 收到安全文案，feature 判定成功或失敗。`CowMotionCopy` 定義 group、四種 toggle 的 label／start／stop 與 play／pause 文案。使用者可從 `i18n/cow-copy.cowMotionCopy(t)` 取得三語文案；shared 不匯入該 adapter。

`npm run check:docs` 讀取 shared 原始碼的 TypeScript AST，檢查具名公開匯出是否出現在此 README。它不載入 browser modules，也不讀 API。新增 helper／component／props 型別時同步補上此清單、責任及呼叫方式；牛素材的詳細規格仍維持在同一份 [cow-workspace/README](ui/cow-workspace/README.md)。

`schemas/portfolio.reservedPublicUsers` 與 `publicUserSchema` 一起維護後端一致的保留名稱及 handle 格式；`schemas/records.textSchema` 只驗證字串，不自行 trim 或改寫 API 文字。

`NumberedPage<T>` 定義 `{ items: T[], total, pages, page, size }` 的共用傳輸型別；schema 決定允許的 size 與頁數算術，UI 不另保存或重算一份資料來源。

`useHydrated` provides one SSR-safe boundary. Shared finite transition and background geometry helpers have no account/API dependency. Table export helpers operate on projected cell matrices; the component cleans up downloads/print work and callers own rows, scope and copy. Public transport, scope, motion and notification types are indexed above. `check:docs` uses source AST declarations to detect missing README entries without importing browser modules.

## 表格欄位群組編輯 / Table Editing Groups

`DataTableColumn<T>.editing` 接受 `DataTableCellEditing<T>`。以 `useDataTableEditGroup({ scope, group, rowKey, enabled, copy })` 宣告一組需要共同驗證、共同保存的欄位，透過 `controller.column(field)` 綁定欄位；未綁定的欄位維持原有 render。`column(field, render)` 可替換欄位元件，仍沿用控制器提供的 change／complete／cancel；`DataTableEditCell` 提供預設文字、數字、多行、select 與布林呈現。Hook 回傳 busy、pending、dirty 及 change／complete／cancel。不同保存群組使用不同 hook，scope 必須包含資源、帳號、語系等身份邊界；切換 scope 或卸載後，舊回應不會恢復草稿。分頁可保留尚未完成的草稿，owner 若要切頁捨棄，須把頁面身份納入 scope。

`DataTableEditGroup<T,V>` 的 fields 是可編輯欄位白名單；read(row) 只回傳該組資料，null 表示此列不適用；save 接收 `DataTableEditSubmission<T,V>` 的 row、changes、values，必須在失敗時 reject。`DataTableEditValues` 定義 scalar DTO；`DataTableEditDraft<V>` 容許輸入中尚未有效的值。`DataTableEditField<T,V>` 宣告 editor、required、dependsOn、clearValue、canEdit 及 unavailableReason，條件可依目前整組草稿與該列動態決定。editor 的 select options 保留數字／字串型別，實際儲存值必須在選項內；`InlineFieldEditor` 同時支援 options。`InlineField` 新增 disabled、required、onComplete、onCancel：既有詳情編輯仍由 owner 控制，只有提供 completion callback 才會啟用保存邊界。

`editFieldOrder` 拒絕未知相依欄位、循環及未宣告 clearValue 的子欄位；`changeEditDraft` 依父子順序清空所有後代。`validateEditDraft` 回傳整組 valid 與逐欄 `DataTableEditIssue`，檢查必填、nullable、型別、有限數字、長度、選項、欄位及群組自訂規則。false／0 都是有效的必填值；null 和空字串不等價。`editDraftChanges` 只投影已宣告且改變的欄位。

文字在 blur／Enter、多行在 blur／Ctrl 或 Cmd+Enter、布林及選單在選擇後呼叫 complete；輸入法組字完成前不提交，不使用 typing debounce 或 render effect 保存。相依必填欄位尚未完成時，整組草稿留在本地；全部有效後才一次保存。例如 country 改變會將 province／town 清為 null；province 必填時先等待新值，town 可空時可連同 null 一次保存。Escape 或「捨棄草稿」還原整組，包括被清空的後代。保存期間鎖定該 controller，避免連點重複寫入；預設失敗保留草稿，同版本 blur 不重試，只有新修改或明確 Retry 才再提交。伺服器已顯示不同的原始欄位值時，標示衝突並要求捨棄後重編；這不是後端的版本鎖。

`DataTableEditCopy` 的 edit／clear／empty／required／invalid／incomplete／saving／failed／conflict／retry／cancel／readonly 全由 owner 注入。API、身份驗證、權限、欄位白名單、資料庫交易、通知與 query 同步由功能擁有；前端驗證不能取代後端驗證父子資料關係或併發控制。`failure: 'discard'` 僅用於自行重讀伺服器狀態的功能。display 可顯示跨列業務預覽，預覽永遠不會加入 changes 或保存草稿；Platform 用於顯示舊 Default 關閉，真正的原子替換由既有 PATCH 處理。

Nullable 的非布林 `InlineField` 同樣提供 clear(label) 控制，明確送出 null，不把空字串和 null 混為一談；clear 的 pointer down 保留輸入焦點，避免先 blur 保存舊值再清空。Management 詳情屬頁面層，由 owner 接收保存、跨欄位驗證及相依變更 callbacks，共用元件不讀 API。

## 分頁與時間契約 / Page and Time Contracts

`validateNumberedPage` 共用總數、頁數、項目數及 unique ID 驗證；domain schema 分別決定固定或可調的 size。`formatUtcTimestamp` 接收 ISO 字串或 epoch 毫秒，產出固定 UTC 日期文字；`formatUtcClock` 依語系格式化並明確標示 UTC。缺少／無效時間回傳「—」，epoch 0 保留有效，秒由呼叫端明確轉換。

## 表格內部組成 / Table Internals

`DataTableProps` 與原本的 DataTable 型別集中於 DataTable.types.ts；舊入口保留原型別的重匯出。`useDataTable` 回傳 `DataTableModel`，由 `DataTableToolbar`、`DataTableHead`、`DataTableFooter` 呈現對應區塊。`TableCheckbox` 保持 checked／indeterminate 一致，`downloadTable` 回收 Blob URL，`printTable` 在列印完成或取消時回收 frame。這些模組供 DataTable 內部組合，不持有 API 或帳號狀態。
