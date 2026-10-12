# 共用模組規格 / Shared Module Specifications

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

| 模組 / Module                                                | 公開介面與行為 / Public interface and behavior                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`api/http.ts`](api/http.ts)                                 | `requestJson(path, schema, options?)` 驗證未知 JSON 後回傳型別化資料；支援 `signal`、SSR 專用 `baseUrl` 及 `timeoutMs`。`ApiError` 將失敗分為 `network`、`timeout`、`http`、`parse`、`contract`；`retryRead` 僅對暫時性讀取失敗重試一次。 / Validated reads with cancellation, optional server origin, and timeout; classified errors and one transient-read retry.                         |
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

The context interface exposes resolved ownership and the original Site selector; feature caches retain complete DTOs. `usePortfolioScope(enabled?)` shares the Site/demand guard: coordinated pages wait for Site resolution, then send only its ID for content reads, while standalone features retain their default-read behavior. Locale staging infers that ID from cached Site metadata and cannot capture another default portfolio while a named Site remains unresolved. The context imports no domain feature and never selects public ownership from session identity.

SSR loader 與切語言 staging 共用 `app/query-client.ts` 的 `withIsolatedQueryClient(work, signal?)`。Callback 在 cache 清理前複製 snapshot；取消會停止讀取，已取消的工作不能提交結果，成功／失敗都解除 listener 並清空臨時 cache。瀏覽器跨頁的 QueryClient 持續存在，由個別 owner 的取消與公開 identity 上限管理。

SSR and locale staging reuse `withIsolatedQueryClient(work, signal?)`. The callback copies its result before cleanup; cancellation stops reads and prevents a completed snapshot from being returned. Success and failure both release listeners and temporary data. The persistent browser client instead uses scoped cancellation and the public identity cap.

`hooks/useSectionDemand.ts` 以穩定 anchor、Site／locale scope、viewport 或明確導覽啟用讀取，掛載與清理 observer 成對。`lib/viewport.ts` 共用可取消的觀察：資料 demand 可用 200px margin，動畫 visibility 使用 0px。

Section demand follows stable anchors, ownership/language scope, viewport and explicit navigation. The common viewport observer returns cleanup; reads can use a 200px margin while active animations use actual 0px visibility.

## 管理存取組合 / Management Access Composition

SESSION 與管理權限屬於 auth feature，由 route／page 組合，不放進 shared 的通用讀取或表格。輕量 [`auth/session`](../features/auth/session.ts) 的 `refreshAuthSession` 在管理入口重新讀取 cookie 身份；[`auth/permissions`](../features/auth/permissions.ts) 的 `canManage` 要求旗標明確為 true，選單、sidebar 與表格 gate 共用相同政策。網站／帳號／監控沿用 `is_manage_sites`，角色使用 `is_manage_roles`；監控目前只有選單項目。

SESSION and management rights remain auth-feature responsibilities composed by routes/pages. Lightweight [`auth/session`](../features/auth/session.ts) freshly checks cookie identity through `refreshAuthSession`; [`auth/permissions`](../features/auth/permissions.ts) shares strict-true `canManage` across the menu, sidebar and table gate. Sites/users/monitoring retain `is_manage_sites`, roles use `is_manage_roles`, and monitoring remains menu-only.

[`routes/management`](../routes/management.tsx) 在瀏覽器檢查通過後才載入管理頁或列表；SSR／首次 hydration 只重用 `LoadingIndicator`，不序列化身份或私有列。已確認訪客、false 權限或 SESSION HTTP 401／403 由呼叫端使用 `useNotifications` 發出 warning，再 replace 到三語 Access denied。網路／服務／契約錯誤則維持內容隱藏並提供重試。取消的決定不得提交；身份／角色／管理旗標改變時取消並移除 private cache，保留公開資料。DataTable 不判定權限，後端 permission dependencies 維持原樣並另待實作。

The [management route](../routes/management.tsx) loads the page/lists only after its browser check succeeds. SSR and first hydration reuse `LoadingIndicator` without serialized identity or private rows. Confirmed guests, false permissions or SESSION HTTP 401/403 make callers publish a warning through `useNotifications` and replace the URL with localized Access denied. Network/service/schema failures keep content hidden with explicit retry. Canceled decisions cannot commit; identity/role/management-flag changes cancel and remove private cache while retaining public data. DataTable does not authorize access; backend permission dependencies remain unchanged and planned separately.

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

`useDisclosureFocus` 的 `surfaceRef` 包含 trigger 與面板；`initialRef` 指向實際可聚焦控制項。`onClose` 使用穩定 callback，避免每次更改 slider 或文案時重新啟動初始焦點。Hook 不攔截 Tab，也不接管 Bootstrap 的 Escape、outside pointer 與關閉後焦點還原。

For `useDisclosureFocus`, the surface contains both trigger and panel, and the initial ref identifies a usable control. A stable close callback prevents ordinary value updates from restarting initial focus. The hook leaves Tab, Escape, outside-pointer dismissal, and restoration to the owning dropdown.

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

`Breadcrumb(label,items)` 只呈現 owner 傳入的階層、原生連結與可選圖示；最後一項標示 `aria-current="page"`，分隔符不加入讀屏文案。版面支援長名稱換行，文案、網址與資料讀取留在使用它的頁面。

`Breadcrumb(label,items)` renders injected ancestors, native links and optional icons. The final item uses `aria-current="page"`, separators are decorative, and long names wrap. Its owning page supplies copy and destinations; the shared component performs no data reads.

下表逐項涵蓋 `shared/ui` 的共用元件／Hook 匯出；型別、context 與時間常數另見各介面說明。場景道具拆件保持內部實作，呼叫端使用完整 `CowWorkspace` 及公開的角色插槽 `DeniedCowCharacter`。

This inventory covers shared component/hook exports in `shared/ui`. Types, context and timing constants are documented with their associated interfaces. Cow props remain internal; consumers use `CowWorkspace` and the public `DeniedCowCharacter` character slot.

| 匯出與模組 / Export and module                                     | 用途、使用方式與邊界 / Purpose, usage and boundary                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`BackgroundField`](ui/background-field/BackgroundField.tsx)       | `paused`、`speed`、`compact` 與 `copy: { unavailable, retry }`；共用背景／視差光暈，裝飾 `BackgroundSignals` 另 lazy 載入。 / Shared viewport decoration with injected failure copy and a lazy bounded signal controller.                                                                                                                                                                                         |
| [`Breadcrumb`](ui/Breadcrumb.tsx)                                  | 注入 `label`、`items` 的祖先 link／圖示；最後項目使用 aria-current。 / Injected page ancestry without route or data ownership.                                                                                                                                                                                                                                                                                    |
| [`LoadingIndicator`](ui/LoadingIndicator.tsx)                      | `LoadingIndicatorProps` 接收 `label`、可選 `size`／`className`；共用 SVG 載入及 reduced-motion。 / Injected status copy and bounded SVG loading decoration.                                                                                                                                                                                                                                                       |
| [`WarningModal`](ui/WarningModal.tsx)                              | 注入 title、message、closeLabel、onClose；呼叫端以掛載控制開關，所有關閉入口共用 onClose。 / Mount-controlled warning dialog with injected copy and a single close callback.                                                                                                                                                                                                                                      |
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

[`DataTable<T>`](ui/DataTable.tsx) 是通用、受控的 Bootstrap 資料表。必填 props 是 `columns: DataTableColumn<T>[]`、`rows: T[]`、`rowKey(row)`、`page: { page, size, total, pages }`、`sort: DataTableSort[]`、`onSortChange(sort)`、`onPageChange(page)`、`onSizeChange(size)` 及 `copy: DataTableCopy`。可傳 `loading`、`error`、`onRetry()`、`toolbar: ReactNode` 與 `rowActions(row)`；`toolbar` 在欄位選單的同一列呈現 owner 的搜尋／篩選／更新控制，寬度不足時換行，事件及查詢狀態仍由 owner 擁有。`rowActions` 新增操作欄，文案使用 `copy.actions`。Rows 必須是 feature 已驗證的**當頁**資料，metadata 沿用 API 回應；元件不 fetch、不追加其他頁、不在瀏覽器排序，也不引用 i18n。

`DataTable<T>` is a controlled Bootstrap table. Required props provide typed columns, the current validated page, stable row keys, five-field paging metadata, controlled sort state, callbacks and injected copy. Optional loading/error/retry props present query feedback. A `toolbar` ReactNode composes owner-controlled search, filters or refresh beside the column chooser, with responsive wrapping; `rowActions(row)` adds an action column. The component performs no fetching, continuation, client sorting or locale lookup.

外層以 `data-bs-theme="light|dark"` 控制 Bootstrap 原生控件配色；ManagementPage 將 mist 對應 light、其餘主題對應 dark，先保持 SSR／初次 hydration 一致，再套用瀏覽器偏好。共用元件不訂閱 appearance feature。

The owner supplies Bootstrap's light/dark mode on an ancestor. ManagementPage maps mist to light and the remaining palettes to dark, applying browser preferences after consistent server/initial hydration rendering. The shared component does not subscribe to the appearance feature.

每個 column 需要唯一 `id`、`label` 及 `value(row): string | number | boolean | null`；`sortable` 啟用欄位排序，`initiallyHidden` 隱藏較少使用的欄位，`render(row)` 可覆寫 cell 呈現。未覆寫時，boolean 使用停用、唯讀的 Bootstrap switch，`null` 顯示「—」。API 回應字串以 React 文字渲染，不插入 HTML。欄位選單只改變本地顯示；已隱藏的排序欄仍會顯示在排序摘要，最後一個可見欄不能隱藏。不同資料表請用 React `key` 明確重建其欄位顯示狀態。

Columns supply unique IDs, labels and primitive value accessors. Optional sortability, initial visibility and render callbacks customize presentation. Default cells show disabled read-only boolean switches and a dash for null, never raw HTML. Visibility affects presentation alone; hidden sorted columns remain in the ordering summary. The last visible column cannot be hidden. A React key creates a fresh visibility scope for a different table.

一般點擊／鍵盤啟用標題依序切換升冪、降冪、取消，並改成單欄排序；勾選多欄排序或按住 Shift，可以依點擊順序累積最多三欄、調整方向或移除其中一欄，手機直接點選即可操作。`sort` 的每項是 `{ field, direction: 'asc' | 'desc' }`，欄位 ID 必須對應後端排序白名單；feature 序列化成 querystring 並在排序／size／search／filter 改變時回第一頁。元件保留 API row 順序，單欄提供 `aria-sort`，多欄提供順位及摘要；page buttons 只呈現首尾與鄰近頁，不依 total 建立大量 DOM。

Normal header activation cycles ascending, descending and removal with one criterion. Shift activation or the explicit multi-column checkbox retains up to three ordered criteria, including on touch devices. Features map column IDs to backend allowlists, serialize query parameters and reset the page after sort, size, search or filter changes. Single-column ARIA sorting, visible ranks and an ordering summary explain the controlled order. Pagination renders only bounded neighboring pages.

Owner 必須保留 `onSortChange([])` 的空排序狀態，讓欄位標題下一次可重新進入升冪。ManagementPage 以 URL `sort=` 記錄清除排序；首次進入且缺少 sort 時顯示 ID 降冪排序。API 層仍提供穩定的 ID 降冪預設順序，畫面上的排序狀態不會被查詢預設值覆蓋。

Owners must preserve the empty sort array emitted on removal so the next activation can enter ascending order. ManagementPage stores that explicit reset as `sort=` in the URL; an absent parameter displays the initial ID-descending criterion. Transport defaults maintain stable ID-descending database pagination without exposing an implicit technical sorting label or replacing the controlled UI state.

排序標題在 loading 時使用 `aria-disabled` 並阻擋事件，保留目前鍵盤焦點；資料回來後可繼續按 Enter／Shift+Enter，不需重新 Tab 回欄位。其他分頁與資料查詢控件沿用原生 disabled。

Sort headings retain keyboard focus during loading with `aria-disabled` and guarded activation. Once the response arrives, Enter/Shift+Enter can continue sorting without tabbing back to the heading; paging and other query controls retain native disabled behavior.

`DataTableCopy` 的所有字串與函式由 locale adapter 注入：`caption`、`loading`、`empty`、`error`、`retry`、`rowsPerPage`、`pagination`、`previous`、`next`、`columns`、`sorting`、`clearSort`、`sortHint`、`multiSort`、`readonly`、`actions`；`direction` 為 `{ asc, desc }`；`range(from, to, total)`、`pageLabel(page)` 及 `sortLabel(column, next)` 提供動態文案，`next` 是 `asc`／`desc`／`none`。空頁的 from／to 為 0。`loading` 停用資料查詢控制並顯示 status，錯誤提供 alert 及可選重試；已傳入 rows 保留，由 feature 決定何時使用有效 cache。`DataTable.module.css` 以 `--panel`、`--panel2`、`--text`、`--border`、`--control-hover` 橋接 Bootstrap 變數；row hover 隨主題更新，寬表格只在自身 viewport 水平捲動。

All copy is injected, including captions, query feedback, navigation, column controls, ordering hints, read-only semantics and dynamic range/page/sort labels. Loading disables query controls; errors provide an optional local retry. Supplied rows remain visible, with cache retention owned by the feature. Semantic application tokens bridge Bootstrap variables for every theme and row hover. Wide tables scroll within their own viewport.

RWD 依**元件容器寬度**處理：根節點是 `data-table` inline-size container，640px 以下搜尋／工具列換行、排序模式獨立一列、分頁與筆數控制分列，頁碼按鈕可換行。資料仍保持一列一筆，寬欄位保留在表格自己的水平捲動區；不縮小字體或把頁面本身撐寬。窄容器或 coarse pointer 裝置的主要控件至少 44px，長排序摘要與欄位標籤可以換行；欄位選單寬高受容器與 viewport 限制。Owner 注入的 toolbar 可使用同名 `@container data-table (max-width: 640px)`，應避免固定最小寬度超出父容器；外層 flex／grid item 要允許 `min-width: 0`。

Responsive behavior follows the allocated component width through a named `data-table` inline-size container. At 640px or less, controls and page buttons wrap while wide rows scroll only inside the table. Primary controls use at least 44px targets in compact containers or with coarse pointers. Long ordering labels wrap, and the column menu is bounded by available container/viewport dimensions. Injected toolbars may reuse the named container query; parent flex/grid items must permit shrinking with `min-width: 0`.

```tsx
import {
  DataTable,
  type DataTableColumn,
  type DataTableCopy,
  type DataTableSort,
} from '@/shared/ui/DataTable';

type Item = { id: number; label: string; active: boolean };
const columns: DataTableColumn<Item>[] = [
  { id: 'id', label: 'ID', value: (row) => row.id, sortable: true },
  { id: 'label', label: 'Name', value: (row) => row.label, sortable: true },
  { id: 'active', label: 'Active', value: (row) => row.active, sortable: true },
];

/** The feature supplies a validated page and connects callbacks to its query state. */
export function ItemsTable(props: {
  records: { items: Item[]; page: number; size: number; total: number; pages: number };
  sort: DataTableSort[];
  copy: DataTableCopy;
  onSortChange: (sort: DataTableSort[]) => void;
  onPageChange: (page: number) => void;
  onSizeChange: (size: number) => void;
}) {
  return (
    <DataTable
      columns={columns}
      rows={props.records.items}
      rowKey={(row) => row.id}
      page={props.records}
      sort={props.sort}
      copy={props.copy}
      onSortChange={props.onSortChange}
      onPageChange={props.onPageChange}
      onSizeChange={props.onSizeChange}
    />
  );
}
```

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

[`NotificationEvents`](../app/providers/NotificationEvents.tsx) 負責瀏覽器整合：監聽未捕捉的 `error`／`unhandledrejection`、offline／online，以及 query cache 的最終失敗。連線／timeout 顯示 warning、HTTP 顯示 error、parse／contract 或未知程式錯誤顯示 bug；分類與安全文案 key 由 [`i18n/notification-copy.ts`](../i18n/notification-copy.ts) 提供。取消不通知，同一 query 失敗直到恢復或移除前只回報一次；離線與後續 query 回饋避免重複報告同一中斷。已回報失敗的真實 query 恢復，或離線後重新連線，才顯示恢復 success。初次 GET、一般成功 polling 與手動 `setQueryData` 不顯示成功通知。事件 listener 與 cache 訂閱於卸載時清理。

[`NotificationEvents`](../app/providers/NotificationEvents.tsx) integrates uncaught browser errors/rejections, connection changes and terminal query-cache failures. Its locale-layer classifier maps connection/timeout to warning, HTTP to error, and parsing/contract or unexpected defects to bug. Cancellations are silent; each query failure is reported once until recovery/removal, and outage reporting avoids duplicate connection messages. Recovery success follows a previously reported failed query's real recovery or an offline-to-online transition. Initial GETs, ordinary successful polling and manual `setQueryData` do not produce success toasts. Unmount removes listeners and cache subscriptions.

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
6. 共用流程有變更時檢查實際使用者；資料契約／非同步邊界使用 `tests/unit`，跨元件的焦點、RWD 與特效使用 `tests/e2e`。 / Validate real consumers with contract/lifecycle unit checks and browser interaction checks.
7. 新增或修改公開能力時同步本文件與必要的[元件／頁面規格](../../README.md)，說明實際介面和限制。 / Keep shared and component/page specifications aligned with the implemented interface.

## 共用契約補充與文件檢查 / Contract Inventory and Documentation Check

`hooks/useHydrated.ts` 的 `useHydrated()` 在 SSR／首次 hydration 回傳 false，瀏覽器接續回傳 true，沒有額外事件或 timer。身份、主題及角色動態使用同一個 hydration 邊界；它本身不讀 session、儲存或 DOM。

`lib/auth-transition.ts` 提供 `AuthTransitionPhase`、`authTransitionTiming`、`authTransitionStyle`、`authTransitionImmediateStyle` 及 `createAuthTransition(onPhase)`。Controller 只管理 CSS 階段與有限時鐘，提供 open／back／finish／dispose／getPhase；帳號與 Access denied 的 owner 各自處理 scroll、是否自動進場及清理。`lib/background-signals.ts` 的 `SignalGeometry`／`signalGeometry(width,height)` 是純幾何計算，最多 400 個十字。

共用匯出工具位於 `lib/table-export.ts`。`TableExportCell`／`TableExportMatrix` 是已投影的可見欄位矩陣；`tableCsv`／`tableTsv` 處理 escaping 與 spreadsheet formula 前綴，`tableXlsx` 產生離線 workbook bytes，`tablePrintHtml` 產生已 escape 的列印 HTML。`DataTableExport<T>` 的 filename 由 owner 提供，未指定 loadRows 時只匯出當頁可見欄位，含非 hideable 的 ID，不匯出動作或隱藏欄位。選擇 copy／CSV／Excel／print 才產生內容；loadRows 的取消、Blob URL 與 print iframe 由元件清理。`DataTableCopy.export` 文案由呼叫端注入，資料表不讀帳號或 i18n。

傳输／scope 公開契約：`ApiErrorKind` 分類可重試、HTTP、JSON 解析及契約失敗；`errorCode` 只接受有界的後端代碼，不顯示 raw body。`PortfolioProvider` 注入公開 selector／已解析身份，`usePortfolioContext` 讀取同一 scope；`observeViewport` 回傳 observer 清理函式。牛的 `CowWorkspaceMotionOptions`／`CowWorkspacePhase` 定義 motion、pointer scope 與姿勢；具體生命週期見牛場景指南。

通知型別 `NotificationKind`／`NotificationInput` 定義種類與可選 message／id／icon；shared 收到安全文案，feature 判定成功或失敗。`CowMotionCopy` 定義 group、四種 toggle 的 label／start／stop 與 play／pause 文案。使用者可從 `i18n/cow-copy.cowMotionCopy(t)` 取得三語文案；shared 不匯入該 adapter。

`npm run check:docs` 讀取 shared 原始碼的 TypeScript AST，檢查具名公開匯出是否出現在此 README。它不載入 browser modules，也不讀 API。新增 helper／component／props 型別時同步補上此清單、責任及呼叫方式；牛素材的詳細規格仍維持在同一份 [cow-workspace/README](ui/cow-workspace/README.md)。

`schemas/portfolio.reservedPublicUsers` 與 `publicUserSchema` 一起維護後端一致的保留名稱及 handle 格式；`schemas/records.textSchema` 只驗證字串，不自行 trim 或改寫 API 文字。

`NumberedPage<T>` 定義 `{ items: T[], total, pages, page, size }` 的共用傳輸型別；schema 決定允許的 size 與頁數算術，UI 不另保存或重算一份資料來源。

`useHydrated` provides one SSR-safe boundary. Shared finite transition and background geometry helpers have no account/API dependency. Table export helpers operate on projected cell matrices; the component cleans up downloads/print work and callers own rows, scope and copy. Public transport, scope, motion and notification types are indexed above. `check:docs` uses source AST declarations to detect missing README entries without importing browser modules.
