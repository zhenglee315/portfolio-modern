# 前端架構總覽 / Frontend Architecture

本目錄規劃以 React 重構既有 `portfolio-web`，沿用其版型、三語內容與互動規則，並串接本專案的 FastAPI。前端負責呈現、互動與資料取得；後端負責業務資料、驗證、權限與儲存。整體產品方向見[專案 README](../README.md)，API 現況見[後端 README](../backend/README.md)。

This directory plans the React migration of `portfolio-web`, preserving its design, three languages, and interaction rules while integrating with the existing FastAPI backend. The frontend owns presentation, interaction, and data fetching; the backend owns business data, validation, authorization, and persistence.

**目前狀態：架構規劃。** 採用 React Router Framework Mode、React 與 TypeScript，初期規劃預先渲染公開的三語個人檔案頁面，互動與後續資料由瀏覽器按需載入。React 應用、套件宣告、設定檔、測試與下列程式目錄尚未建立；公開 URL、內容更新後的重建流程與離線交付方式須在實作前確認。實作時同步更新文件，區分已完成能力與後續規劃。

**Status: architecture planning.** The selected architecture is React Router Framework Mode with React and TypeScript. The initial plan pre-renders public profile pages in three languages and loads interactions and subsequent data in the browser as needed. The application, dependencies, configuration, tests, and source directories do not exist yet. Confirm public URLs, rebuild triggers, and offline delivery before implementation, and keep this document aligned with progress.

## 工程原則 / Engineering Principles

- **正規化 / Normalization：** 資料契約、設定與設計變數有明確來源；API 資料、UI 狀態與衍生結果分責管理，減少重複定義與同步負擔。
- **模組化 / Modularity：** 先按功能分組，再依責任拆分；每個模組定義公開介面、相依項目與生命週期。
- **標準化 / Standardization：** 統一型別、命名、格式、錯誤處理、測試與建置流程，透過工具檢查可自動驗證的規則。
- **重用性 / Reusability：** 撰寫元件、Hook、函式或 class 前，分析業務相依、狀態、副作用與實際使用情境，再決定共用範圍。
- **輕量化 / Lightweight development：** 依功能需求引入依賴與抽象層；開發工具與正式依賴分開管理，簡單功能保持簡單。

These principles apply to responsibility and behavior as well as directory layout. Reusable abstractions should share meaning and change together, with dependencies and side effects made explicit.

## 技術基線 / Technology Baseline

下列為初始化時的建議組合；實際套件版本以未來的 `package.json` 與 `package-lock.json` 為準。

The following is the proposed initialization baseline. Installed versions will be recorded in the dependency manifest and lockfile.

| 項目 / Tool | 責任 / Responsibility |
| --- | --- |
| Node.js 24 LTS | 開發工具與建置執行環境 / Development and build runtime |
| npm | 依賴、鎖定檔與專案指令管理 / Dependencies, lockfile, and project scripts |
| React | 函式元件、畫面組合與互動 / Function components, composition, and interaction |
| TypeScript | API、元件參數與函式介面；啟用 `strict` / Strictly typed API, component, and function interfaces |
| React Router Framework Mode | 路由、資料載入入口、metadata、路由程式碼分割與渲染策略 / Routing, data-loading entry points, metadata, route code splitting, and rendering strategies |
| Vite | 透過 React Router plugin 提供開發與建置 / Development and builds through the React Router plugin |
| TanStack Query | API 資料快取、載入、重試與分頁 / Server data caching, loading, retries, and pagination |
| CSS、CSS Modules | 沿用既有 CSS，逐步隔離元件樣式 / Existing CSS plus scoped component styles |
| ESLint、Prettier | 程式規範、Hooks 規則與一致排版 / Code rules, Hooks rules, and formatting |
| Vitest、React Testing Library | 純邏輯、資料契約與元件行為測試 / Logic, contract, and component behavior tests |
| Playwright | 瀏覽器互動與跨畫面驗證 / Browser interaction and viewport checks |

React、Vite 與其他工具安裝為專案依賴。Node.js 與 npm 是本機準備事項；安裝 npm 套件不代表已啟動 FastAPI、資料庫或 Redis。日常可直接在本機開發，Docker 按實際服務或部署需要使用。

Install frontend tools as project dependencies. Node.js and npm are local prerequisites; installing frontend packages does not start backend services. Use Docker when service or deployment requirements call for it.

### 渲染、路由與按需載入 / Rendering, Routing, and On-Demand Loading

React Router Framework Mode 是前端框架，Vite 是其開發與建置基礎。FastAPI 持續提供業務 API；前端的路由與預先渲染不取代後端的驗證、權限或資料存取。框架支援瀏覽器渲染、預先渲染及伺服器渲染，目錄分層不因渲染方式改變。[官方模式說明](https://reactrouter.com/start/modes)

React Router Framework Mode uses Vite for development and builds and supports client rendering, pre-rendering, and server rendering. FastAPI remains responsible for business APIs, validation, authorization, and persistence. Feature boundaries remain the same across rendering strategies.

| 情境 / Requirement | 方案與影響 / Approach and implications |
| --- | --- |
| 初期公開個人檔案頁 / Initial public profile pages | 預先渲染（SSG）：建置時取得公開資料，產生包含主要內容與 metadata 的 HTML；內容更新需重新建置 / Pre-render public content and metadata at build time; updates require rebuilding |
| 地圖、對話框、後續分頁 / Maps, dialogs, and subsequent pages | 瀏覽器互動與按需載入；依操作載入程式碼或取得 API 資料 / Client interaction with code or data loaded when needed |
| 未來公開 HTML 須即時反映資料 / Future live public HTML | 評估伺服器渲染（SSR），增加相應前端執行服務 / Evaluate SSR with an appropriate frontend runtime |

初期靜態部署規劃設定 `ssr: false`，並明確列出需要預先渲染的語系 URL；動態路由參數不能只靠路由宣告自動產生所有頁面。部署時提供產生的 HTML、路由資料及靜態資產，並配置必要的路由回退。這種部署不需要常駐前端 Node.js 服務，Node.js 仍用於開發與建置。[官方預先渲染說明](https://reactrouter.com/how-to/pre-rendering)

The initial static deployment plan disables runtime SSR and explicitly lists locale URLs to pre-render. Dynamic route parameters need concrete build paths. Serve generated HTML, route data, and assets with the required routing fallback. Node.js is needed for development and builds, without a persistent frontend Node.js service.

按需載入包含兩個不同責任：**Code Splitting** 將程式拆成可獨立下載的區塊；**Lazy Loading** 決定何時取得與呈現。框架自動按路由分割程式碼；同一頁中的地圖或對話框仍須設計動態 import 與觸發條件。立即渲染所有 lazy 元件仍會立即觸發載入，不能只靠資料夾分組達成延遲下載。API 資料載入與程式碼下載也分開管理。[官方程式碼分割說明](https://reactrouter.com/explanation/code-splitting)

Code splitting creates separately downloadable modules; lazy loading controls when they are requested and rendered. Framework mode splits routes automatically. Deferred maps and dialogs within one page still need dynamic imports and meaningful triggers; immediately rendered lazy components load immediately. API requests have their own loading policy.

既有單頁區塊導覽可沿用錨點；語系與未來多份個人檔案的 URL 按公開路由需求設計。預先渲染的公開 HTML 與路由資料只包含可公開內容；瀏覽器專用的 `window`、storage、DOM 量測及地圖初始化放在可於建置時安全執行的生命週期邊界。舊版直接以 `file://` 開啟的離線能力另行設計與驗證。

Retain section anchors and design locale and future profile URLs deliberately. Pre-rendered output contains only public content. Keep browser-only APIs and imperative initialization behind lifecycle boundaries that are safe during build-time rendering. Direct `file://` delivery requires a separate design.

## 規劃目錄 / Proposed Directory Layout

目錄圖只呈現主要分層，個別檔案與功能內部分工在後續章節說明。React Router 的 `appDirectory` 設為 `src`，框架根入口與路由設定放在此處；`src/app` 則是本專案的應用組裝層。目錄依實際責任建立，單元與元件測試可與程式放在一起。[官方目錄設定](https://reactrouter.com/api/framework-conventions/react-router.config.ts#appdirectory)

This tree shows the main layers rather than every implementation file. Configure React Router's application directory as `src`; `src/app` is the project's assembly layer. Create directories as needed and colocate unit and component tests with their implementation.

```text
frontend/
├── README.md                      # Architecture and development guide
├── package.json / package-lock.json
├── react-router.config.ts         # Source directory and rendering configuration
├── vite.config.ts / tsconfig.json
├── .env.example                   # Public configuration example
├── public/                        # Assets requiring stable public paths
├── src/
│   ├── root.tsx                   # Root layout and providers
│   ├── routes.ts                  # URL-to-route-module mapping
│   ├── app/                       # Application assembly and providers
│   ├── routes/                    # Route modules, loaders, metadata
│   ├── pages/                     # Complete page composition
│   ├── features/
│   │   ├── site/
│   │   ├── journey/
│   │   ├── experiences/
│   │   ├── projects/
│   │   ├── skills/
│   │   ├── appearance/
│   │   └── language/
│   ├── shared/
│   │   ├── api/                   # HTTP transport and common errors
│   │   ├── config/                # Public environment/runtime configuration
│   │   ├── ui/                    # Button, Dialog, ExpandableTagList
│   │   ├── hooks/                 # General interaction hooks
│   │   ├── lib/                   # General pure functions
│   │   └── types/                 # Genuinely shared types
│   ├── i18n/                      # Fixed UI dictionaries and locale utilities
│   ├── styles/                    # Base styles, themes, design tokens
│   └── assets/                    # Imported fonts, icons, maps, images
└── tests/
    └── e2e/                       # Browser scenarios
```

### 與後端分層的對照 / Backend Layer Mapping

| 後端 / Backend | 前端 / Frontend | 共同目的 / Shared purpose |
| --- | --- | --- |
| `APPs` | `features` | 依業務或功能組織 / Feature boundaries |
| `COMMON` | `shared` | 跨模組能力 / Shared capabilities |
| `SYSTEM` | `app`、框架入口與設定檔 / Framework entry and configuration | 系統組裝 / Application assembly |
| `schema` | 功能內的 `schemas` / Feature schemas | 資料契約 / Data contracts |
| `module` | `api`、`model`、`hooks` | 請求、計算與流程分責 / Requests, calculations, and state |

## 模組責任與依賴 / Responsibilities and Dependencies

- `root.tsx`、`app`：根佈局、Provider 與全域初始化；業務計算交給功能模組。
- `routes.ts`、`routes`：URL 對應、參數、loader、metadata 與路由錯誤邊界；透過功能 API 取得資料，再交給頁面組合。
- `pages`：組合功能區塊、版面與跨功能協調；頁面專屬元件放在 `pages/<page>/components`。
- `features`：擁有該功能的 API、契約、純計算、狀態與畫面。
- `shared`：提供不依賴特定 Portfolio 功能的基礎能力。
- `i18n`：管理固定 UI 文案與語系工具；作品集業務文字由 API 提供。
- `styles`、`assets`：管理全域視覺資源；功能樣式放在對應元件旁。

The root and `app` assemble global services. Route modules handle URLs, loaders, metadata, and route errors. Pages compose features and own page-specific components. Each feature owns its data and behavior; `shared` provides business-independent capabilities. UI translations belong to `i18n`, while localized profile content comes from the API.

依賴方向：

```text
app / routes / pages → features → shared
app / routes / pages / features → i18n → shared
```

`shared` 不反向依賴功能、路由或應用組裝；功能之間由頁面協調，例如由頁面串接技能資料與專案呈現所需的 props／事件，避免 `projects` 與 `skills` 互相引用。外部使用功能的 `index.ts`，不直接引用內部實作；公開匯出保持明確，功能內部直接引用自己的檔案，避免循環依賴。初始化時配置 import 限制，將可檢查的邊界交給 lint。

Keep shared code independent of features, routes, and application assembly. Pages connect feature data and interactions through props and events rather than circular feature imports. Expose explicit public exports and enforce import boundaries with lint rules.

### 功能內部分工 / Feature Structure

`features` 是前端功能模組，不等於單一頁面、元件或 endpoint。一個功能可包含多個 API 與元件，也可以只有本機互動。各功能遵循同一套責任規則，**只建立實際需要的子目錄**；例如 `projects` 可能需要完整分層，`appearance` 沒有遠端資料就不需要 `api` 或 API `schemas`。

A feature groups related frontend behavior rather than representing one page, component, or endpoint. It may own several API calls or only local interactions. Apply consistent responsibilities and create only the directories each feature needs.

| 位置 / Location | 責任與邊界 / Responsibility and boundary |
| --- | --- |
| `api/` | 功能 endpoint、參數、回應解析、query keys 與查詢設定；不操作 DOM / Endpoint calls, response parsing, query keys, and query options without DOM access |
| `schemas/` | 外部資料契約與執行期解析；可從 schema 推導型別時，避免另寫一份相同欄位 / External contracts and runtime parsers; derive types where possible |
| `model/` | 功能型別、業務計算、資料轉換與 selector；保持輸入輸出明確，不發 HTTP 請求 / Feature types and pure business calculations, transformations, and selectors |
| `hooks/` | React 資料訂閱、互動狀態與副作用生命週期；可組合 API 查詢設定與 model / React subscriptions, interaction state, and lifecycle-managed effects |
| `components/` | 功能畫面、props、事件與元件樣式；不重寫 transport 或契約解析 / Feature UI, props, events, and styles |
| `index.ts` | 明確列出外部可用的元件、函式與型別；不匯出所有內部細節 / Explicit public components, functions, and types |

功能檔案依具體責任命名，例如 `projectsApi.ts`、`project.schema.ts`、`useProjects.ts`、`ProjectCard.tsx`。檔案與目錄在責任增長時拆分；不為每個短函式建立一層資料夾。

Name files by responsibility and split them as complexity grows, without introducing a directory for every small function.

### API 放置與資料載入 / API Placement and Data Loading

前端 `api` 指呼叫 FastAPI 的程式。**功能請求放在 `features/<feature>/api`，HTTP 基礎能力集中在 `shared/api`。** 例如 `siteApi.ts` 定義 `/portfolio/site` 的參數與回應解析；`httpClient.ts` 處理 URL、取消請求及共用錯誤。即使多個頁面使用 Site，請求仍由 `site` 擁有，透過公開介面重用。

Frontend API modules call FastAPI. Features own endpoint semantics, while `shared/api` owns HTTP mechanics. Reuse a feature API through its public interface even when several pages need it.

路由 loader 呼叫功能 API 或公開查詢設定，不在路由檔案另寫一套 endpoint 與解析規則。預先渲染負責取得首批公開資料；初始化時將這批資料銜接到 Query cache，明確設定刷新時機。後續分頁、重試與瀏覽器更新由功能 Hooks 使用 Query 管理，避免同一筆資料在掛載時無意重抓，或另存一份全域 store。[Query 初始資料與刷新規則](https://tanstack.com/query/latest/docs/framework/react/guides/initial-query-data)

Route loaders reuse feature APIs or public query options. Pre-rendering supplies initial public data; initialize Query caching from that data with an explicit freshness policy. Feature hooks manage subsequent pagination, retries, and refreshes without accidental duplicate requests or a second global copy.

典型請求與回應流程：

```text
ProjectsSection → useProjects → projectsApi → HTTP transport → FastAPI
FastAPI JSON → response parser → Query cache → selector/model → component
```

HTTP transport 處理 URL、query、取消請求與共用錯誤；資源 API 定義 endpoint、參數與回應解析；Hook 管理資料或互動生命週期；元件依資料與狀態呈現。`model` 保持純計算，以明確輸入取得結果。獨立資源可平行載入，避免因元件逐層掛載形成不必要的請求等待。

Transport owns HTTP mechanics, resource APIs own endpoint contracts, hooks own state lifecycles, and components render data. Keep model calculations pure and load independent resources concurrently where appropriate.

## 元件、Hooks 與重用規範 / Components, Hooks, and Reuse

### 元件放置 / Component Placement

| 元件範圍 / Scope | 位置與例子 / Location and example |
| --- | --- |
| 不依賴業務的通用 UI / Business-independent UI | `shared/ui`：Button、Dialog、ExpandableTagList；資料透過 props 傳入 / Receive data through props |
| 理解特定功能資料與規則 / Feature-specific UI | `features/<feature>/components`：ProjectCard、ProjectDetailDialog、JourneyMap |
| 僅組織單一頁面的版面 / Page-specific composition | `pages/<page>/components`：PortfolioLayout |

`ProjectDetailDialog` 可使用共用 `Dialog`，前者負責專案內容，後者負責開關、焦點與鍵盤等彈窗行為。業務元件被多個頁面使用，仍留在所屬功能；只有語意與依賴都通用時才移入 `shared`。共用 `ExpandableTagList` 不自行呼叫技能 API，取得更多資料的責任交給功能並透過事件連接。

A project detail dialog composes a shared dialog primitive. Reuse across pages does not remove feature ownership. Shared components remain business-independent; an expandable tag list receives data and callbacks rather than fetching skills itself.

### 邏輯抽取與生命週期 / Logic Extraction and Lifecycle

畫面以函式元件組合；需要 React 狀態或生命週期的邏輯使用 Hooks；資料轉換與計算優先使用純函式。具有明確實例狀態與生命週期的外部資源可使用 class，介面仍應保持小而清楚。

Use function components for UI, hooks for React state and lifecycles, and pure functions for calculations. Classes remain an option for resources with a meaningful instance lifecycle.

新增或抽取程式時，依序評估：

1. 責任：輸入、輸出、錯誤、狀態與副作用是否明確？
2. 相依：是否依賴特定 endpoint、業務欄位、DOM、語系或全域設定？
3. 使用者：是否已有相同語意的使用情境，且未來會一起變更？
4. 放置：屬於單一功能、跨功能業務能力，或完全通用的基礎工具？
5. 介面：抽取後是否更容易使用與測試，參數能否合理表達差異？

Evaluate responsibility, dependencies, actual consumers, ownership, and interface clarity before extracting reusable code. Similar-looking code alone is insufficient evidence for a shared abstraction.

| 情境 / Scenario | 放置與責任 / Placement and responsibility |
| --- | --- |
| 經歷、專案與技能都需要展開標籤 / Expandable labels | `shared/ui/ExpandableTagList` 接收標籤與互動參數；資源取得留在各功能 / Share presentation while retaining resource fetching in features |
| 多處格式化月份或計算期間 / Month formatting and arithmetic | 共用純函式，明確傳入日期與語系 / Pure helpers with explicit dates and locale |
| 工作年資或專案分組 / Career duration or project grouping | 留在擁有該業務規則的 `model`，跨功能使用再評估公開介面 / Business model with deliberate public exposure |
| 頁碼與游標兩種分頁 / Numbered and cursor pages | 共用載入按鈕與錯誤呈現；保留各自參數、契約與延續規則 / Share controls, preserve pagination semantics |
| 地圖投影與標籤量測 / Projection and label measurement | 純幾何計算與 DOM 量測拆分；量測透過 ref 與生命週期管理 / Separate geometry from lifecycle-managed DOM measurement |

Effect 中建立的事件監聽、計時器、observer、動畫與連線須對應清理；支援重複掛載與依賴變更。React 管理的畫面依 props/state 更新，必要的 SVG、canvas 或第三方 DOM 操作限制在明確的 ref 邊界。元件參數與純函式不讀取舊版 `window.Portfolio`、`I18n` 等隱含全域狀態。

Clean up listeners, timers, observers, animations, and connections. Isolate imperative rendering behind refs and pass dependencies explicitly rather than retaining legacy globals.

## 資料契約與狀態 / Contracts and State

以[後端回應模型](../backend/APPs/Portfolio/schema/resp/resp_portfolio.py)、[參數解析器](../backend/APPs/Portfolio/schema/parser/parser_portfolio.py)及執行中服務的 OpenAPI 為依據。導入型別產生工具時，產生結果與手寫業務模型分開，產生檔由工具維護。TypeScript 型別檢查與執行期 JSON 驗證分責；mock、HTTP transport 和測試使用同一份資源契約。

Backend models, query parsers, and OpenAPI define the API contract. Separate generated types from handwritten models. Compile-time types do not replace runtime JSON validation; mocks and real requests must follow the same resource contracts.

目前 Portfolio API 摘要如下；完整欄位與錯誤格式見[後端 README](../backend/README.md#目前的-get-api--available-get-apis)。

| Endpoint | 回應 / Response | 分頁 / Pagination |
| --- | --- | --- |
| `GET /portfolio/site` | `{brand, profile, social, chatme}` | 無 / None |
| `GET /portfolio/journey` | `JourneyItem[]` | 無 / None |
| `GET /portfolio/experiences` | `{total, pages, page, size, items}` | `page` 從 1 開始，`size=6` / Numbered, six per page |
| `GET /portfolio/projects` | `{total, pages, page, size, items}` | `page` 從 1 開始，`size=6` / Numbered, six per page |
| `GET /portfolio/skill-categories` | `{items, page, included: {skills}}` | 游標；每類最多預覽 6 個技能 / Cursor with skill previews |
| `GET /portfolio/skills` | `{items, page}` | 分類內的技能游標頁 / Skills within a category |

- 六支 API 接受 `locale=en|zh-Hans|zh-Hant`，預設 `en`；所有業務文字直接使用指定語系。
- 回應沒有共通的 `data/meta/revision` envelope，也不使用資料集 revision 比對；保留資源自己的回應形狀。
- 技能游標頁為 `{limit, total, hasMore, nextCursor}`；集合請求的 `limit` 預設 12、範圍 1–50。`nextCursor=null` 表示結束，cursor 視為不透明值，原樣交回 API。
- `/skills` 需要 `ownerId`，`ownerType` 只接受 `category`。分類預覽的 `skillsPage.nextCursor` 可接續該分類。
- Projects 與 Experiences 已包含各筆技能；Projects 也包含詳情，展開時使用已載入內容。
- 保留 API 的穩定 ID、陣列順序，以及 `null`、空陣列和缺少欄位的差異。DOM/React key 使用穩定 ID；技能參照可用 selector 建立查找表。

Responses retain their resource-specific shapes and localized text. Treat cursors as opaque, preserve backend ordering and null semantics, and reuse loaded project details and skills.

狀態依所有權管理：

| 狀態 / State | 所有者 / Owner |
| --- | --- |
| API 回應、載入、錯誤、已取得頁面 / Server data and request state | TanStack Query，銜接路由載入的初始資料 / TanStack Query initialized from route-loaded data |
| 對話框、卡片展開、地圖播放 / Local interaction | 對應元件或 Hook / Owning component or hook |
| 語系、外觀偏好 / Shared preferences | 有明確範圍的 Provider；需要時才持久化 / Scoped providers with deliberate persistence |
| 日期文字、分組、查找表 / Derived values | 純函式或 selector，從來源資料計算 / Pure functions or selectors |

Query cache 保留回應作為來源，避免把同一批 API 資料再複製到全域 store。TanStack Query 的查詢快取不等於全域實體正規化；跨分類的技能查找與去重依實際需求在 selector 處理。

Keep one authoritative server-data cache. Query caching is not a globally normalized entity store; derive lookup tables and deduplicate references where the feature needs them.

快取鍵包含資源、語系及影響結果的頁碼、分類、limit 或其他篩選條件；游標載入依選用的 Query API 管理延續參數。切換語系或分類時重新使用相應範圍的資料與游標，失敗不得前進頁碼。重試依錯誤類型與次數設定，取消請求傳遞 `AbortSignal`；舊請求完成後不得覆蓋新選擇的畫面。

Cache keys identify the resource and all relevant selection parameters. Manage continuation parameters according to the Query API, keep cursors scoped, and ensure failed or outdated requests do not advance or overwrite visible state.

目前後端服務單份 Portfolio。未來加入多人作品集時，公開識別、後端資料隔離與快取範圍需一起完成；前端在路由、API 參數與快取鍵納入真正的作品集識別後才能支援。現階段不預設尚未實作的 slug endpoint。

Multi-author support requires coordinated backend ownership, public identifiers, routes, and cache scopes. Current endpoints serve one Portfolio.

## 程式與視覺標準 / Code and Visual Standards

- TypeScript 使用 `strict`；外部資料先視為 `unknown`，在邊界解析；型別斷言不代替驗證。
- 元件與其檔名使用 PascalCase，例如 `ProjectCard.tsx`；Hooks 使用 `use` 前綴，例如 `useProjects.ts`；函式與變數使用 camelCase；功能資料夾使用小寫名稱。
- 元件保持單一主要責任，props 明確定義；純計算、副作用與資源請求各有歸屬。跨模組公開方法記錄用途、參數、回傳、錯誤與副作用。
- HTTP 狀態、後端錯誤碼與使用者文案分開；功能明確呈現載入、空資料、錯誤、重試與完成狀態。
- 全域 theme、色彩、間距、字體與 motion token 集中在 `styles`；元件樣式逐步轉為 `.module.css`，按版型相依遷移並驗證。
- 固定 UI 文案放在 `i18n`；API 的三語業務內容直接呈現，避免再維護一份業務翻譯字典。
- 使用語意 HTML；連結、按鈕、對話框與選單支援鍵盤、焦點與可存取名稱；RWD、減少動態效果與動畫暫停列入功能規格。
- 公開環境設定透過共用設定模組讀取；前端建置可見的設定只放公開值。開發 proxy、正式 API base 與跨來源設定依部署拓樸明確配置。

Enforce strict types, consistent naming, explicit module contracts, and separate error presentation from transport errors. Centralize design tokens and UI translations, preserve semantic HTML and accessibility, and configure public frontend settings centrally.

`package.json`、鎖定檔、工具設定與 `.env.example` 納入版本控制；初始化時補齊 `node_modules/`、建置產物、測試產物與本機環境檔的忽略規則。新增功能或共用工具時，在對應模組的 README 記錄詳細介面；本文件維護架構、責任與操作入口。

Track dependency manifests, lockfiles, tooling configuration, and public examples. Add ignore rules for dependencies, generated outputs, and local settings during initialization. Keep detailed module interfaces in their own README files.

## 開發與驗證 / Development and Verification

安裝 Node.js LTS 與 npm 後，可先確認環境：

```bash
node --version
npm --version
```

初始化時固定實際 Node 版本，建立並提交 `package.json`、鎖定檔與工具設定。下列是**待建立的指令介面**；目前尚不能用來啟動或驗證 React 應用。

Pin the runtime and commit manifests and tooling during initialization. The commands below are planned interfaces, not currently available scripts.

| 指令 / Command | 目的 / Purpose |
| --- | --- |
| `npm ci` | 依鎖定檔安裝 / Install locked dependencies |
| `npm run dev` | 本機開發 / Local development |
| `npm run typecheck` | TypeScript 檢查 / Type checking |
| `npm run lint` | 程式與依賴邊界檢查 / Code and import rules |
| `npm run format:check` | 排版檢查 / Formatting check |
| `npm run test` | 一次執行單元與元件測試 / Unit and component tests |
| `npm run test:e2e` | 瀏覽器流程測試 / Browser scenarios |
| `npm run build` | 正式建置 / Production build |
| `npm run preview` | 本機檢視建置結果 / Local build preview |

CI 執行型別、lint、格式、必要測試與建置；瀏覽器測試使用可重現的 mock 或明確的整合環境。測試驗證實際規則與使用者行為，重點包含日期邊界、契約錯誤、分頁重試、技能預覽接續、三語切換與延遲回應、對話框焦點，以及手機版和 reduced-motion 行為。測試範圍依變更影響調整。

CI checks types, lint, formatting, relevant tests, and builds. Browser tests use reproducible fixtures or a defined integration environment and cover meaningful rules and user behavior.

## 遷移流程 / Migration Sequence

1. **盤點 / Inventory：** 以 `portfolio-web` 實際程式與畫面確認功能、資產、三語、資料契約及離線需求；核對後端現況，更新過時紀錄。
2. **建立基線 / Baseline：** 初始化 React Router Framework Mode，確認三語公開 URL 與預先渲染範圍，建立環境、Provider、HTTP transport、檢查工具與模組邊界。
3. **完整流程 / First complete feature：** 先完成 Site 的 API、回應解析、Hook、元件、樣式與錯誤呈現。
4. **功能遷移 / Feature migration：** 依序導入經歷、專案與技能；沿用既有規則，從實際共用情境抽取元件與函式。
5. **互動遷移 / Interaction migration：** 導入地圖、動畫、語系與外觀；把舊全域註冊器改為明確 import/export，拆開純計算與 DOM 副作用。
6. **驗證與部署 / Verification and deployment：** 驗證 API、分頁、三語、RWD、鍵盤與動畫；依已選渲染模式確認建置、路由、metadata 和交付方式。

遷移時保留可驗證的規則，調整其相依與生命週期；舊 mock、client 或文件的版本可能不同，以實際程式及現行後端契約為準。Mock 與正式請求使用同一組呈現元件，避免維護兩套畫面實作。

Preserve validated behavior while adapting dependencies and lifecycles. Reconcile reference code against current backend contracts and use the same presentation components for mock and real data.

## 官方參考 / Official References

- [React：建立應用](https://react.dev/learn/creating-a-react-app)與[從 Vite 等建置工具起步](https://react.dev/learn/build-a-react-app-from-scratch)
- [React：函式元件與 class 的選擇](https://react.dev/reference/react/Component)
- [Node.js LTS 下載](https://nodejs.org/en/download)
- [Vite：環境需求](https://vite.dev/guide/)與[CSS Modules](https://vite.dev/guide/features#css-modules)
- [TypeScript：strict](https://www.typescriptlang.org/tsconfig/strict.html)
- [React Router：模式選擇](https://reactrouter.com/start/modes)、[路由設定](https://reactrouter.com/start/framework/routing)、[目錄設定](https://reactrouter.com/api/framework-conventions/react-router.config.ts#appdirectory)、[預先渲染](https://reactrouter.com/how-to/pre-rendering)與[程式碼分割](https://reactrouter.com/explanation/code-splitting)
- [TanStack Query：query keys](https://tanstack.com/query/latest/docs/framework/react/guides/query-keys)與[初始資料](https://tanstack.com/query/latest/docs/framework/react/guides/initial-query-data)
- [ESLint](https://eslint.org/docs/latest/use/getting-started)、[Prettier](https://prettier.io/docs/install)
- [Vitest](https://vitest.dev/guide/)、[React Testing Library](https://testing-library.com/docs/react-testing-library/intro/)、[Playwright](https://playwright.dev/docs/intro)
