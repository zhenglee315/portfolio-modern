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

| 模組 / Module                                                | 公開介面與行為 / Public interface and behavior                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`api/http.ts`](api/http.ts)                                 | `requestJson(path, schema, options?)` 驗證未知 JSON 後回傳型別化資料；支援 `signal`、建置專用 `baseUrl` 及 `timeoutMs`。`ApiError` 將失敗分為 `network`、`timeout`、`http`、`parse`、`contract`；`retryRead` 僅對暫時性讀取失敗重試一次。 / Validated reads with cancellation, optional build origin, and timeout; classified errors and one transient-read retry. |
| [`schemas/records.ts`](schemas/records.ts)                   | `recordIdSchema`、`stableIdSchema`、`monthSchema`、`periodShape`、`validatePeriod`、`uniqueRecords` 提供基礎契約。`numberedPageSchema(itemSchema)` 特化 `{ items, total, pages, page, size }`；`pageSize` 是所有分頁查詢使用的大小。 / Common identities and periods; domain-specialized five-field page validation and one page-size policy.                      |
| [`schemas/career.ts`](schemas/career.ts)                     | `careerShape`、`careerDetailSchema` 共用 Journey 與 Experiences 的職涯欄位；各 feature 加上自己的欄位。 / Shared Journey/Experiences career fields extended by each feature.                                                                                                                                                                                       |
| [`api/numbered-query.ts`](api/numbered-query.ts)             | `numberedQuery(resource, locale, schema, options?)` 統一 query key、頁碼、owner 參數、取消與續頁；`assertPageAppend` 防止頁碼、筆數資訊漂移或重複 ID。`fillNumberedPages` 沿用已驗證快取補齊指定範圍；`pageRecords` 衍生攤平列表。 / One continuation policy, append validation, cache-preserving range completion, and derived record lists.                      |
| [`hooks/usePagedCollection.ts`](hooks/usePagedCollection.ts) | `usePagedCollection(query, queryKey, locked?)` 提供 `records`、`total`、`invalid`、`status`、`onLoadMore`。續頁失敗保留有效資料，契約錯誤由明確重試重設該 query；鎖定或已有請求時不重複續讀。 / Unified collection feedback and bounded continuation while retaining validated data.                                                                               |

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

以上 `items` 是新增 feature 的示例資源，需有相符的後端 endpoint；現有實作可參考 `features/experiences/api/experiences.ts`。傳給 `usePagedCollection` 的 query key 必須來自同一個 feature 查詢函式，不手動拼接另一份 key。建置用 `baseUrl` 不應序列化進公開資料。

`items` illustrates a new feature and requires a corresponding endpoint; the existing experiences API is a concrete example. Pass the feature query's exact key to `usePagedCollection`. Keep build-only origins outside serialized public data.

## 日期與標籤計算 / Dates and Tag Calculations

| 模組 / Module                            | 公開介面與使用限制 / Public interface and constraints                                                                                                                                                                                                                                                                                                                    |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`lib/dates.ts`](lib/dates.ts)           | `monthIndex`、`monthLabel`、`monthDuration` 處理有效 `YYYY-MM`；`periodLabels`、`projectPeriod` 接收期間、語系與 `DateCopy`。`currentMonthUTC`、`careerYearRange`、`workDuration` 處理完整職涯摘要；呼叫端傳入明確 UTC 月份，SSG 與 hydration 使用同一基準。 / Valid calendar arithmetic, injected localized period labels, and deterministic complete-career summaries. |
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
| [`hooks/useMediaQuery.ts`](hooks/useMediaQuery.ts)                 | `useMediaQuery(query, serverValue?)` 訂閱 media 變化，預先渲染使用固定預設值；`mobileQuery` 與 `reducedMotionQuery` 統一 JS 條件。 / Media subscriptions with deterministic server snapshots and shared conditions.                                                                                                                                                                        |
| [`hooks/useDocumentVisible.ts`](hooks/useDocumentVisible.ts)       | `useDocumentVisible()` 提供文件可見狀態，讓持續播放／裝飾效果停止排程。 / Document visibility used to suspend ongoing playback and decoration.                                                                                                                                                                                                                                             |
| [`hooks/useDisclosureFocus.ts`](hooks/useDisclosureFocus.ts)       | `useDisclosureFocus(open, surfaceRef, initialRef, onClose)` 統一非 modal 選單開啟後的初始焦點、焦點移出關閉及 rAF／listener 清理；refs 與 `onClose` 維持穩定。Appearance 指向第一個 slider，Language 指向已選語系。 / Shared initial focus, outside-focus dismissal, and cleanup with stable refs/callback; the owner selects its initial control.                                         |
| [`hooks/useHoverTooltip.ts`](hooks/useHoverTooltip.ts)             | `useHoverTooltip()` 回傳 `triggerProps`、可為 `null` 的 `tooltipProps`、`show()` 與 `close()`；共用 hover／可見鍵盤焦點、描述關聯與關閉生命週期。OnlineVisitors、page LoginEntry 與 AuthCowScene 共用；點擊動作留在呼叫端。 / Shared tooltip disclosure and cleanup; online visitors, sign-in entries and cow controls retain their own actions.                                           |
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

`useHoverTooltip` 將 `triggerProps` 展開到按鈕，只有 `tooltipProps` 存在時才掛載 `PixelTooltip` 並傳入這組 props。只揭露描述的 click／tap 呼叫 `show()`；登入導覽與牛控制先呼叫 `close()`，再執行自己的動作。非 touch pointer 移入與 `:focus-visible` 開啟提示，開啟時才加上 `aria-describedby`。滑鼠離開延遲 150ms 關閉，讓 pointer 能移入提示窗；可見鍵盤焦點保留提示，touch 不套用 hover 離開。焦點移出且兩個區域都未 hover、外部 pointerdown、Escape、scroll、resize、window blur 或文件隱藏時關閉；關閉／卸載清理 timer 與 listener，焦點仍由原按鈕持有。

Spread `triggerProps` onto the button and mount `PixelTooltip` with `tooltipProps` only while those props are present. Description-only click/tap actions call `show()`; sign-in navigation and cow controls call `close()` before their own action. Non-touch pointer entry and visible keyboard focus disclose the description; `aria-describedby` exists only while open. A 150ms departure delay allows movement into the tooltip, visible keyboard focus retains it, and touch skips hover dismissal. It closes on blur when neither surface is hovered, outside pointerdown, Escape, scroll, resize, window blur or document hiding. Timers and listeners are cleaned up on closing/unmount without moving button focus.

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

下表逐項涵蓋 `shared/ui` 的 14 個公開元件／Hook 匯出；型別、context 與時間常數另見各介面說明。場景內部拆件不是公開 UI，使用完整 `CowWorkspace`。

This inventory covers all 14 public component/hook exports in `shared/ui`. Types, context and timing constants are documented with their associated interfaces. Cow scene parts remain internal; consumers use `CowWorkspace`.

| 匯出與模組 / Export and module                        | 用途、使用方式與邊界 / Purpose, usage and boundary                                                                                                                                                                                                                                                                                                                               |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`SectionHeader`](ui/SectionHeader.tsx)               | 傳入 `eyebrow`、`title`、可選 `note`，共用標題與右對齊備註版型。 / Inject heading text and an optional right-aligned note.                                                                                                                                                                                                                                                       |
| [`SectionState`](ui/SectionState.tsx)                 | 接收 `message`、可選 `retryLabel`／`onRetry`、`busy` 與 children；一般回饋使用 status，具重試動作的失敗使用 alert，忙碌時停用重試。 / Present injected section feedback and optional recovery content; disable retry while busy.                                                                                                                                                 |
| [`QueryStatus`](ui/QueryStatus.tsx)                   | 傳入 `pending`、`failed`、`empty`、`hasData`、`fetching`、loading／empty／error／retry 文案及 `onRetry`；使用 SectionState 呈現查詢狀態，資料仍由呼叫端渲染。 / Translate query flags into section feedback while consumers retain data rendering, including valid cached data.                                                                                                  |
| [`SectionBoundary`](ui/SectionBoundary.tsx)           | 包住獨立區塊或 lazy 元件；提供安全訊息、`retryLabel` 與 `resetKey`，按恢復需求設定 `fallback`、`silent`、`reloadOnRetry`。有通知 provider 時另回報 bug，保留局部恢復。 / Isolate render/chunk failures with explicit reset identity and recovery policy; optionally publish a bug notification.                                                                                  |
| [`LoadMoreControl`](ui/LoadMoreControl.tsx)           | 傳入 `busy`、`label`、`busyLabel`、可選 `error` 與 `onLoad`；忙碌時停用按鈕，API 責任留在 feature。 / Reuse continuation feedback and disabled in-flight controls without owning requests.                                                                                                                                                                                       |
| [`ExpandableCollection`](ui/ExpandableCollection.tsx) | 必填 `items: T[]`、真實 `total`、`hasMore`、`busy`、`copy`、`onLoadMore()` 與 `renderItems(items)`；可傳 `error`／`className`。預覽第一頁、展開後渲染額外記錄；收起移除額外 DOM 並還原焦點，保留 query cache。 / Supply records, total, continuation flags, copy and callbacks; optional error/className customize feedback and styling. Disclosure preserves the feature cache. |
| [`ExpandableTagList`](ui/ExpandableTagList.tsx)       | 完整陣列只需 `items: { id: string \| number; label: string }[]`／`copy: TagCopy`；分頁 owner 再傳 `total`、`hasMore`、`busy`、`error`、`onLoadMore()`。`onPreviewMore()` 可補讀尚未填滿的 75% 預覽，元件不決定 endpoint。 / Supply identified labels and TagCopy, plus optional pagination state/callbacks; measured preview continuation remains feature-owned.                 |
| [`PixelBubble`](ui/PixelBubble.tsx)                   | 共用階梯包邊、bevel、tail 與可選關閉按鈕；傳入 `ref`、內容及 HTML attributes，需關閉按鈕時成對提供 `closeLabel`／`onClose`。定位、內容語意與自動關閉留在呼叫端。 / Reusable stepped shell; callers own placement, semantics, content and closing policy.                                                                                                                         |
| [`PixelTooltip`](ui/PixelTooltip.tsx)                 | 接收 `anchor`、`panel`、`text`、可選 `placement` 與 HTML attributes；以 portal 掛載 `role="tooltip"` 的 PixelBubble 並重用 useAnchoredPanel。搭配 useHoverTooltip，由呼叫端提供文案與開關。 / Compact portaled tooltip with shared placement; consumers supply localized copy and disclosure.                                                                                    |
| [`Icon`](ui/Icon.tsx)                                 | `name: IconName` 對應本地 Bootstrap SVG allowlist；`label` 提供無障礙文字，裝飾圖示預設隱藏。`pulse="chat"`／`"disclosure"` 與 `highlight` 引用共同呼吸／互動效果。 / Allowlisted local SVGs with accessible labels and shared optional decoration.                                                                                                                              |
| [`IconGroup`](ui/Icon.tsx)                            | 以 `children` 包住圖示及文字，傳入 `pulse`／`highlight`／`className`，讓內容一起播放效果、外層控制維持固定。整組為裝飾且 `aria-hidden`，可操作父元素需提供完整無障礙名稱，子 Icon 不另加 pulse。 / Animate decorative icon/text as one group; the stable owning control supplies accessible meaning.                                                                             |
| [`CowWorkspace`](ui/cow-workspace/CowWorkspace.tsx)   | 必填 `label`，可傳 `phase`、`motion`、`parallax`、`globeRotation`、`pointerScope`、`pointerOrigin` 與 `className`；共用場景與動態清理，不讀取帳號或語系。完整 props、素材與重建見 [cow workspace guide](ui/cow-workspace/README.md)。 / Reusable vector scene with injected copy and motion preferences; the guide defines its complete contract.                                |
| [`NotificationProvider`](ui/NotificationProvider.tsx) | 在 app 外層掛載一次，傳入 `children` 與已翻譯的 `copy: NotificationCopy`；集中一個 viewport 上方通知、計時、關閉與常駐 live region。 / Own the single application notification host and timer with injected localized copy.                                                                                                                                                      |
| [`useNotifications`](ui/NotificationProvider.tsx)     | 於 provider 子樹中取得 `notify({ kind, message?, id?, icon? })`／`dismiss()`；業務事件與文案由呼叫端決定，缺少 provider 時拋錯。 / Publish or dismiss a notification from the provider subtree; callers own event meaning and message text.                                                                                                                                      |

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

通知補充局部回饋：`QueryStatus`、`LoadMoreControl` 與 `SectionBoundary` 保留可用的重試按鈕，欄位驗證仍在欄位標題右側。登入 feature 的 send-code／未接 API 的帳號操作顯示 warning；只有注入的 `onAuthenticate` 真正 resolve 後才顯示 success 並觸發 welcome 牛姿勢。共用層不把前端驗證碼模擬視為登入成功，也不顯示密碼、原始回應或 stack。

Toasts supplement local feedback: query, continuation and boundary controls retain inline retry, while field validation stays beside its label. Auth send-code and account actions without an API emit warnings; only a genuinely resolved injected `onAuthenticate` emits success and enables the welcome pose. Frontend verification-code mocks do not imply authentication success, and messages never expose credentials, raw responses or stacks.

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
