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

| 模組 / Module                                                | 公開介面與責任 / Public interface and responsibility                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`hooks/useMediaQuery.ts`](hooks/useMediaQuery.ts)           | `useMediaQuery(query, serverValue?)` 訂閱 media 變化，預先渲染使用固定預設值；`mobileQuery` 與 `reducedMotionQuery` 統一 JS 條件。 / Media subscriptions with deterministic server snapshots and shared conditions.                                                                                                                                |
| [`hooks/useDocumentVisible.ts`](hooks/useDocumentVisible.ts) | `useDocumentVisible()` 提供文件可見狀態，讓持續播放／裝飾效果停止排程。 / Document visibility used to suspend ongoing playback and decoration.                                                                                                                                                                                                     |
| [`hooks/useDisclosureFocus.ts`](hooks/useDisclosureFocus.ts) | `useDisclosureFocus(open, surfaceRef, initialRef, onClose)` 統一非 modal 選單開啟後的初始焦點、焦點移出關閉及 rAF／listener 清理；refs 與 `onClose` 維持穩定。Appearance 指向第一個 slider，Language 指向已選語系。 / Shared initial focus, outside-focus dismissal, and cleanup with stable refs/callback; the owner selects its initial control. |
| [`lib/floating-panel.ts`](lib/floating-panel.ts)             | `floatingPosition(anchor, container, width, height, bottom?, topBoundary?)` 純計算座標、tail 方向與 `maxHeight`；輸入是同一 viewport 的 bounds。 / Pure anchored placement and available-content budget calculations.                                                                                                                              |
| [`hooks/useAnchoredPanel.ts`](hooks/useAnchoredPanel.ts)     | `useAnchoredPanel(panelRef, anchor, containerRef?, bottomRef?, placement?, topRef?)` 共用量測、resize／scroll 監聽與清理；`placement` 為 `above`、`side` 或 `below-header`，`topRef` 可傳一個或多個保護區域。 / Shared geometry measurement, coalesced updates, and observer/listener cleanup.                                                     |
| [`lib/focus.ts`](lib/focus.ts)                               | `cycleDialogTab(event, surface)` 在 dialog 邊界循環 Tab，略過 disabled、hidden、inert 元素；呼叫端／Bootstrap 仍管理開啟、Escape 與還原焦點。 / Boundary Tab wrapping without replacing the owning dialog lifecycle.                                                                                                                               |

`useAnchoredPanel` 以元素 inline style 寫入 `left`、`top`、`--tail-x`、`--tail-y`，並標記 `data-below`、`data-side`、`data-over-point`。有保護上界時，呼叫端須以 `--floating-max-height` 限制面板並允許內容捲動，不能只量測卻不處理過高的內容。傳入的 ref／ref 清單保持穩定，以免無意重建 observer。所有 DOM 定位與訂閱在瀏覽器生命週期內啟動。

Anchored placement writes position, tail variables, and orientation attributes. A protected upper boundary publishes `--floating-max-height`; the consumer must constrain its panel and provide content scrolling. Keep refs and ref arrays stable. Browser effects own DOM access, subscriptions, and complete cleanup.

`placement="below-header"` 以 `topRef` 清單的第一個元素作為外框上界；其餘與面板水平重疊的區域改為 `--floating-content-inset`，讓呼叫端增加正文／關閉按鈕的頂部留白並從高度 budget 扣除。外框與尾巴因此能貼近 header 內的 trigger，而不覆蓋工具列。一般 `above`／`side` 維持原本定位。

With `placement="below-header"`, the first upper ref protects the shell's top edge. Subsequent horizontally overlapping guards publish `--floating-content-inset`; consumers add it to copy/close spacing and subtract it from the content height budget. This keeps the frame and tail near a header trigger while protecting the toolbar. Ordinary above/side placement retains its existing geometry.

`useDisclosureFocus` 的 `surfaceRef` 包含 trigger 與面板；`initialRef` 指向實際可聚焦控制項。`onClose` 使用穩定 callback，避免每次更改 slider 或文案時重新啟動初始焦點。Hook 不攔截 Tab，也不接管 Bootstrap 的 Escape、outside pointer 與關閉後焦點還原。

For `useDisclosureFocus`, the surface contains both trigger and panel, and the initial ref identifies a usable control. A stable close callback prevents ordinary value updates from restarting initial focus. The hook leaves Tab, Escape, outside-pointer dismissal, and restoration to the owning dropdown.

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

| 模組 / Module                                                                            | 使用方式與邊界 / Usage and boundary                                                                                                                                                                                                                           |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`ui/SectionHeader.tsx`](ui/SectionHeader.tsx)                                           | 傳入 `eyebrow`、`title`、可選 `note`，共用標題與右對齊備註版型。 / Inject heading text and an optional right-aligned note.                                                                                                                                    |
| [`ui/SectionState.tsx`](ui/SectionState.tsx)、[`ui/QueryStatus.tsx`](ui/QueryStatus.tsx) | 共用 loading、empty、failed 與局部重試文案；QueryStatus 接收查詢 flags，資料仍由呼叫端呈現。 / Inject safe request feedback; consumers retain data rendering.                                                                                                 |
| [`ui/SectionBoundary.tsx`](ui/SectionBoundary.tsx)                                       | 包住獨立區塊或 lazy 元件；提供安全訊息與 `resetKey`，`fallback`、`silent`、`reloadOnRetry` 按真實恢復需求設定。 / Isolate render/chunk failures with explicit reset identity and recovery policy.                                                             |
| [`ui/LoadMoreControl.tsx`](ui/LoadMoreControl.tsx)                                       | 傳入 `busy`、文字、可選錯誤與 `onLoad`；忙碌時停用按鈕，API 責任留在 feature。 / Shared continuation feedback and disabled in-flight controls.                                                                                                                |
| [`ui/ExpandableCollection.tsx`](ui/ExpandableCollection.tsx)                             | 傳入 records、真實 `total`、續頁狀態、文案、`onLoadMore` 與 `renderItems`。預覽第一頁、展開後渲染額外記錄，收起移除額外 DOM 並還原焦點，保留 query cache。 / First-page preview and cache-preserving collection disclosure with feature-owned item rendering. |
| [`ui/ExpandableTagList.tsx`](ui/ExpandableTagList.tsx)                                   | 完整陣列只需 `items`／`copy`；分頁 owner 再傳 `total`、`hasMore`、`busy`、`error`、`onLoadMore`。`onPreviewMore` 可補讀尚未填滿的 75% 預覽；元件本身不決定 endpoint。 / Measured local or paginated label disclosure with optional preview continuation.      |
| [`ui/PixelBubble.tsx`](ui/PixelBubble.tsx)                                               | 共用包邊、bevel、tail 與可選關閉按鈕；傳入 `ref`、內容及 HTML attributes，需關閉按鈕時成對提供 `closeLabel`／`onClose`。定位、內容語意與自動關閉留在呼叫端。 / Reusable stepped shell; callers own placement, semantics, content, and closing policy.         |
| [`ui/Icon.tsx`](ui/Icon.tsx)                                                             | `name: IconName` 對應本地 Bootstrap SVG allowlist；`label` 提供無障礙文字，裝飾圖示預設隱藏；`pulse="chat"`／`"disclosure"` 引用共同圖示呼吸效果。 / Allowlisted local SVGs with accessible labels and shared optional breathing decoration.                  |

`PixelBubble` 的可調整樣式採 CSS custom properties：`--bubble-background`、`--bubble-padding`、`--bubble-backdrop-filter`，以及 `--bubble-close-size`、`--bubble-close-icon-size`、`--bubble-close-top`、`--bubble-close-right`、`--bubble-close-text`、hover／focus 對應 tokens。Feature CSS 將差異設定在自己的根 class，不複製 shared markup，也不依賴 shared CSS Modules 產生的 class 名稱。

Customize `PixelBubble` through its background, padding, backdrop, and close-control variables on the feature's root class. Preserve shared markup and avoid depending on generated CSS Modules class names. The shared tail is decorative and never intercepts pointer input. Supply both `closeLabel` and `onClose` for an interactive close control; omit both for a passive tooltip. Positioning and hover/focus dismissal remain with the caller.

## 視覺效果的共用來源 / Shared Visual Sources

全域幾何、色彩與時間在 [`styles/tokens.css`](../styles/tokens.css) 定義；共用裝飾與動態政策在 [`styles/global.css`](../styles/global.css)。經歷與專案 timeline 引用 `--timeline-point-size`、`--timeline-point-keyframe`、`--duration-timeline-pulse`，不各自建立另一份 heartbeat。`Icon` 的 chat 與 disclosure 引用同一個 `icon-breathe`，以 tokens 表達差異。`data-decoration` 讓背景暫停政策統一停止持續動畫；減少動態效果由 CSS 與 shared media 訂閱共同處理。

Global tokens define palette, geometry, and timing. Shared global styles define timeline/icon breathing and decoration pause policy. Experience and project timelines reference the same point keyframe and size; icon roles customize one shared breathing effect through variables. Decoration pauses and reduced-motion preferences remain consistent across features.

`Icon highlight` 共用 chat 圖示在 hover／focus-visible／active 時的高亮前景與光暈，不需要閒置呼吸動畫；`pulse="chat"` 自動啟用此互動效果。

`Icon highlight` shares chat's foreground and halo on hover, visible keyboard focus and activation, without adding idle breathing. Chat pulse icons enable this feedback automatically.

`ExpandableTagList` 收合時的「＋」圖示使用 `Icon pulse="disclosure"`，共用區段圓圈「＋」的縮放與光暈 heartbeat；展開後「−」保持靜態，寬度量測副本也不播放動畫。hover 填色時以 `--on-accent` 保持圖示對比，暫停與 reduced-motion 沿用共用政策。

Collapsed tag-list plus icons reuse the same disclosure breathing as section-level dotted plus controls. Expanded minus icons and inert measurement copies remain static. Hover uses the filled button's foreground token for contrast; shared pause and reduced-motion rules apply.

主題切換的有限生命週期由 `useAppearance().subscribeThemeTransition(listener)` 提供 `prepare`／`replay`／`cancel` 通知；Portfolio page 重用自己的 `createEntrance` 與既有 CSS，遮罩完全覆蓋時暫停於首幀，顯露完成後開始進場。Appearance 不引用 page DOM，page 不另外建立換色控制器。新增元件使用語意色彩 tokens，頁面內容沿用既有進場外殼；不複製 heartbeat、換色或進場 keyframes。具體時序、首次聯絡介紹與中斷規則見[前端 SPEC](../../README.md)。

The appearance feature publishes finite `prepare`/`replay`/`cancel` phases through `useAppearance().subscribeThemeTransition(listener)`. Portfolio reuses its own `createEntrance` and existing CSS: preparation holds the first frame under the opaque veil, and playback starts after reveal. Appearance never imports page DOM, and pages do not duplicate palette controllers. New components consume semantic color tokens and the existing entrance shell instead of copying breathing, palette or entrance keyframes. The frontend specification defines timing, one-time contact disclosure and interruption rules.

主題漸變控制器屬於 `features/appearance`，聯絡氣泡倒數與狀態屬於 `features/site`，地圖播放屬於 `features/journey`，入場與區塊導航屬於 `pages/portfolio`。它們重用通用外殼、定位、焦點與訂閱，但生命週期和業務狀態不同，因此保留各自的 owner。相似的 `setTimeout` 或 `requestAnimationFrame` 不代表可以合併成同一套流程。

Palette transitions, contact disclosure timing, journey playback, and portfolio entrance/navigation have distinct owners and lifecycles. They reuse appropriate shared infrastructure while retaining their specific state. Similar scheduling syntax alone does not justify one generic animation controller.

## 新增與維護規範 / Extension and Maintenance

1. 先搜尋既有能力與使用者，再決定放在 feature、page 或 shared；共用的語意與變更原因要一致。 / Search existing modules and consumers before extracting; shared meaning and change reasons must align.
2. 每個方法／Hook／元件說明用途、輸入、輸出、副作用與清理責任；styles 註解說明樣式責任及差異來源。 / Document purpose, interfaces, effects, cleanup, and style responsibilities.
3. 外部資料先由 schema 驗證，型別從契約推導；衍生值直接計算，不再保存一份需要同步的 state。 / Validate external input, derive types, and avoid duplicate derived state.
4. 透過 props、callbacks 與 CSS tokens 表達合理差異；不要讓 shared 接收 feature 名稱以切換業務分支。 / Express supported variation through props, callbacks, and tokens rather than feature-name branches.
5. 異步、observer、listener 與 timer 在取消／卸載時清理；過期 callback 不得更新已失效的畫面。 / Clean up async resources and guard stale callbacks.
6. 共用流程有變更時檢查實際使用者；資料契約／非同步邊界使用 `tests/unit`，跨元件的焦點、RWD 與特效使用 `tests/e2e`。 / Validate real consumers with contract/lifecycle unit checks and browser interaction checks.
7. 新增或修改公開能力時同步本文件與必要的[元件／頁面規格](../../README.md)，說明實際介面和限制。 / Keep shared and component/page specifications aligned with the implemented interface.
