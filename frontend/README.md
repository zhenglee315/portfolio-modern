# 前端架構總覽 / Frontend Architecture

本目錄以 React 重構既有 `portfolio-web`，沿用其版型、三語內容與互動規則，並串接本專案的 FastAPI。前端負責呈現、互動與資料取得；後端負責業務資料、驗證、權限與儲存。整體產品方向見[專案 README](../README.md)，API 現況見[後端 README](../backend/README.md)。

This directory implements the React migration of `portfolio-web`, preserving its design, three languages, and interaction rules while integrating with the existing FastAPI backend. The frontend owns presentation, interaction, and data fetching; the backend owns business data, validation, authorization, and persistence.

**目前狀態：React 功能遷移與登入介面已實作。** 九個 feature 涵蓋公開內容、三語切換、經歷／專案／雙層技能分頁、專案詳情、旅程地圖與播放、四主題設定、聯絡氣泡、在線人數及登入介面。公開內容串接六支 GET API，在線人數於瀏覽器另讀取 heartbeat；登入、註冊、密碼重設與驗證信仍待後端帳號服務。四個公開 URL 預先渲染有效資料，瀏覽器故障由各區獨立處理。元件與頁面規格集中在本文件，程式使用英文用途／介面／生命週期註解，樣式責任以 CSS 註解說明。

**Status: React feature migration and account interface implemented.** Nine features cover public content, locale transactions, numbered collections, project detail, journey mapping/playback, appearance preferences, contact introduction, online visitors and account forms. Public content uses six GET endpoints, while the browser separately reads heartbeat. Sign-in, registration, password reset and verification email await a backend account service. Four public URLs pre-render validated content, with independently recoverable browser requests. Component/page specifications live here; English comments describe code interfaces, lifecycle and style responsibility.

## 網站畫面導覽 / Visual Website Tour

網站的[完整截圖圖解](../README.md#網站圖解--website-tour)位於專案 README，涵蓋首頁、旅程地圖、學經歷、專案時間軸／詳情、技能、主題、語言、聯絡與平板／手機版型。所有正式文件圖片集中在 [`../docs/images/`](../docs/images/README.md)，兩份 README 共用圖片，維持單一來源。

The project README contains the [complete screenshot tour](../README.md#網站圖解--website-tour), covering the overview, map, experience, project timeline/detail, skills, appearance, language, contact, tablet and mobile layouts. Both guides share the documentation assets in [`../docs/images/`](../docs/images/README.md).

[![專案時間軸局部裁切：月份、目前節點、摘要與詳情入口 / Project timeline crop with month groups, active node, summaries and detail controls](../docs/images/project-timeline.png)](../README.md#4-專案時間軸與詳情--project-timeline-and-detail)

本文件以下保留架構、安裝與元件規格；圖解介紹操作與畫面，規格說明介面、資料契約及生命週期。

The sections below retain architecture, setup and component specifications. The tour explains the visible experience; the specifications define interfaces, data contracts and lifecycle.

## 工程原則 / Engineering Principles

- **正規化 / Normalization：** 資料契約、設定與設計變數有明確來源；API 資料、UI 狀態與衍生結果分責管理，減少重複定義與同步負擔。
- **模組化 / Modularity：** 先按功能分組，再依責任拆分；每個模組定義公開介面、相依項目與生命週期。
- **標準化 / Standardization：** 統一型別、命名、格式、錯誤處理、測試與建置流程，透過工具檢查可自動驗證的規則。
- **重用性 / Reusability：** 撰寫元件、Hook、函式或 class 前，分析業務相依、狀態、副作用與實際使用情境，再決定共用範圍。
- **輕量化 / Lightweight development：** 依功能需求引入依賴與抽象層；開發工具與正式依賴分開管理，簡單功能保持簡單。

These principles apply to responsibility and behavior as well as directory layout. Reusable abstractions should share meaning and change together, with dependencies and side effects made explicit.

## 技術基線 / Technology Baseline

下列工具已安裝；實際套件版本以 [package.json](package.json) 與 `package-lock.json` 為準。Node.js 以 `.node-version` 記錄版本，`engines` 限定 Node.js 24；npm 版本記錄於 `packageManager`，依賴採精確版本與鎖定檔。

The tools below are installed. The manifest and lockfile record exact dependencies; `.node-version`, `engines`, and `packageManager` document the runtime and package manager baseline.

| 項目 / Tool                                   | 責任 / Responsibility                                                                                                                                 |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node.js 24 LTS                                | 開發工具與建置執行環境 / Development and build runtime                                                                                                |
| npm                                           | 依賴、鎖定檔與專案指令管理 / Dependencies, lockfile, and project scripts                                                                              |
| React                                         | 函式元件、畫面組合與互動 / Function components, composition, and interaction                                                                          |
| TypeScript                                    | API、元件參數與函式介面；啟用 `strict` / Strictly typed API, component, and function interfaces                                                       |
| React Router Framework Mode                   | 路由、資料載入入口、metadata、路由程式碼分割與渲染策略 / Routing, data-loading entry points, metadata, route code splitting, and rendering strategies |
| Vite                                          | 透過 React Router plugin 提供開發與建置 / Development and builds through the React Router plugin                                                      |
| TanStack Query                                | API 資料快取、載入、重試與分頁 / Server data caching, loading, retries, and pagination                                                                |
| Bootstrap、React-Bootstrap                    | Bootstrap 5 樣式與由 React 管理的互動元件 / Bootstrap styles and React-managed components                                                             |
| Bootstrap Icons                               | 按需 import 個別 SVG 圖示 / Individual SVG imports                                                                                                    |
| CSS、CSS Modules                              | 全域 tokens 與逐步隔離的元件樣式 / Global tokens and scoped component styles                                                                          |
| Zod                                           | 外部資料的執行期驗證與型別推導 / Runtime validation and inferred types                                                                                |
| i18next、react-i18next                        | 固定 UI 三語字典與 React Provider / UI dictionaries and React integration                                                                             |
| ESLint、typescript-eslint、import-x、Prettier | 型別語法、Hooks、依賴邊界與一致排版 / Typed syntax, Hooks, import boundaries, and formatting                                                          |
| Vitest、React Testing Library                 | 純邏輯、資料契約與元件行為測試 / Logic, contract, and component behavior tests                                                                        |
| Playwright                                    | Chromium 瀏覽器驗證，可後續增加其他瀏覽器 / Chromium checks, extensible to other browsers                                                             |
| sirv                                          | 正式建置的本機靜態預覽 / Local static build preview                                                                                                   |

React、Vite 與其他工具安裝為專案依賴。Node.js 與 npm 是本機準備事項；安裝 npm 套件不代表已啟動 FastAPI、資料庫或 Redis。日常可直接在本機開發，Docker 按實際服務或部署需要使用。

Install frontend tools as project dependencies. Node.js and npm are local prerequisites; installing frontend packages does not start backend services. Use Docker when service or deployment requirements call for it.

### 渲染、路由與按需載入 / Rendering, Routing, and On-Demand Loading

React Router Framework Mode 是前端框架，Vite 是其開發與建置基礎。FastAPI 持續提供業務 API；前端的路由與預先渲染不取代後端的驗證、權限或資料存取。框架支援瀏覽器渲染、預先渲染及伺服器渲染，目錄分層不因渲染方式改變。[官方模式說明](https://reactrouter.com/start/modes)

React Router Framework Mode uses Vite for development and builds and supports client rendering, pre-rendering, and server rendering. FastAPI remains responsible for business APIs, validation, authorization, and persistence. Feature boundaries remain the same across rendering strategies.

| 情境 / Requirement                                           | 方案與影響 / Approach and implications                                                                                                                                          |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 初期公開個人檔案頁 / Initial public profile pages            | 預先渲染（SSG）：建置時取得公開資料，產生包含主要內容與 metadata 的 HTML；內容更新需重新建置 / Pre-render public content and metadata at build time; updates require rebuilding |
| 地圖、對話框、後續分頁 / Maps, dialogs, and subsequent pages | 瀏覽器互動與按需載入；依操作載入程式碼或取得 API 資料 / Client interaction with code or data loaded when needed                                                                 |
| 未來公開 HTML 須即時反映資料 / Future live public HTML       | 評估伺服器渲染（SSR），增加相應前端執行服務 / Evaluate SSR with an appropriate frontend runtime                                                                                 |

目前設定 `ssr: false`，預先渲染 `/`（英文）、`/en`、`/zh-Hans` 與 `/zh-Hant` 四個 URL。各 URL 包含 Site、完整 Journey、經歷／專案第一頁與完整技能分類的 HTML、Query snapshot 及 API metadata；分類續頁失敗時保留有效前綴，瀏覽器可局部補讀。瀏覽器 loader 使用相同語系驗證，未知語系呈現錯誤頁。動態路由參數不能只靠路由宣告自動產生所有頁面。部署時提供產生的 HTML、路由資料及靜態資產，並配置必要的路由回退。這種部署不需要常駐前端 Node.js 服務，Node.js 仍用於開發與建置。[官方預先渲染說明](https://reactrouter.com/how-to/pre-rendering)

Runtime SSR is disabled, and `/`, `/en`, `/zh-Hans`, and `/zh-Hant` are pre-rendered. They include profile/journey content, the first experience/project pages and the complete category index, query snapshots and API-derived metadata. A failed category continuation retains its validated prefix for independent browser recovery. Browser loading applies the same locale validation. Dynamic route parameters need concrete build paths. Serve generated HTML, route data, and assets with the required routing fallback. Node.js is needed for development and builds, without a persistent frontend Node.js service.

按需載入包含兩個不同責任：**Code Splitting** 將程式拆成可獨立下載的區塊；**Lazy Loading** 決定何時取得與呈現。框架自動按路由分割程式碼；同一頁中的地圖或對話框仍須設計動態 import 與觸發條件。立即渲染所有 lazy 元件仍會立即觸發載入，不能只靠資料夾分組達成延遲下載。API 資料載入與程式碼下載也分開管理。[官方程式碼分割說明](https://reactrouter.com/explanation/code-splitting)

Code splitting creates separately downloadable modules; lazy loading controls when they are requested and rendered. Framework mode splits routes automatically. Deferred maps and dialogs within one page still need dynamic imports and meaningful triggers; immediately rendered lazy components load immediately. API requests have their own loading policy.

既有單頁區塊導覽可沿用錨點；語系與未來多份個人檔案的 URL 按公開路由需求設計。預先渲染的公開 HTML 與路由資料只包含可公開內容；瀏覽器專用的 `window`、storage、DOM 量測及地圖初始化放在可於建置時安全執行的生命週期邊界。舊版直接以 `file://` 開啟的離線能力另行設計與驗證。

Retain section anchors and design locale and future profile URLs deliberately. Pre-rendered output contains only public content. Keep browser-only APIs and imperative initialization behind lifecycle boundaries that are safe during build-time rendering. Direct `file://` delivery requires a separate design.

## 目錄分層 / Directory Layout

目錄圖只呈現主要分層，個別檔案與功能內部分工在後續章節說明。React Router 的 `appDirectory` 已設為 `src`，框架根入口與路由設定放在此處；`src/app` 則是本專案的應用組裝層。目錄依實際責任建立，單元與元件測試可與程式放在一起。[官方目錄設定](https://reactrouter.com/api/framework-conventions/react-router.config.ts#appdirectory)

This tree shows the main layers rather than every implementation file. React Router's application directory is configured as `src`; `src/app` is the project's assembly layer. Create directories as needed and colocate unit and component tests with their implementation.

```text
frontend/
├── README.md                      # Architecture and development guide
├── package.json / package-lock.json
├── react-router.config.ts         # Source directory and rendering configuration
├── vite.config.ts / tsconfig.json
├── .env.example                   # Public configuration example
├── scripts/                       # Build acceptance, preview and public-output checks
├── deploy/                        # Generic static/API hosting example
├── public/                        # Stable public paths and asset license notices
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
│   │   ├── online-visitors/
│   │   ├── auth/
│   │   ├── appearance/
│   │   └── language/
│   ├── shared/
│   │   ├── README.md             # Shared contracts, consumers and usage examples
│   │   ├── api/                   # HTTP transport and common errors
│   │   ├── schemas/               # Common record, career and numbered-page contracts
│   │   ├── ui/                    # States, collection/tag disclosure, PixelBubble and PixelTooltip
│   │   ├── hooks/                 # General interaction hooks
│   │   └── lib/                   # General pure functions
│   ├── i18n/                      # Fixed UI dictionaries and locale utilities
│   ├── styles/                    # Base styles, themes, design tokens
│   └── assets/                    # Imported fonts, icons, maps, images
└── tests/
    ├── unit/                      # Baseline unit and component tests
    └── e2e/                       # Browser scenarios
```

各 feature 依實際責任建立 api、schemas、model、hooks、components，透過 index.ts 公開介面。沒有 API 的 appearance／language 不建立空 API 層；正式建置與公開產物檢查放 scripts，通用 hosting 範例放 deploy。

Features contain the layers they need and expose an index.ts interface. Local-only appearance/language features have no artificial API layer. Formal build/public-output tooling lives in scripts; generic hosting examples live in deploy.

### 與後端分層的對照 / Backend Layer Mapping

| 後端 / Backend | 前端 / Frontend                                             | 共同目的 / Shared purpose                                |
| -------------- | ----------------------------------------------------------- | -------------------------------------------------------- |
| `APPs`         | `features`                                                  | 依業務或功能組織 / Feature boundaries                    |
| `COMMON`       | `shared`                                                    | 跨模組能力 / Shared capabilities                         |
| `SYSTEM`       | `app`、框架入口與設定檔 / Framework entry and configuration | 系統組裝 / Application assembly                          |
| `schema`       | 功能內的 `schemas` / Feature schemas                        | 資料契約 / Data contracts                                |
| `module`       | `api`、`model`、`hooks`                                     | 請求、計算與流程分責 / Requests, calculations, and state |

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

`shared` 不反向依賴功能、路由或應用組裝；功能之間由頁面協調，例如由頁面串接技能資料與專案呈現所需的 props／事件，避免 `projects` 與 `skills` 互相引用。外部使用功能的 `index.ts`，不直接引用內部實作；公開匯出保持明確，功能內部直接引用自己的檔案，避免循環依賴。`eslint.config.js` 已配置 import-x 規則，檢查 alias 與相對路徑的依賴方向、功能間引用及功能公開入口。新增功能名稱時同步更新設定中的 `features` 清單；目前九個功能均已登記，包含 `online-visitors` 與 `auth`。

Keep shared code independent of features, routes, and application assembly. Pages coordinate features. The ESLint configuration enforces import direction, feature isolation, and public indexes; register new feature names in its `features` list.

React Router Framework Mode 以 `:locale?` route 管理三語 URL、loader、client navigation 與錯誤邊界；帳號畫面使用 URL query state，頁內章節使用 hash，並非每個 section 都是一條 route。路由 chunk 分割與元件 lazy 分割各自負責不同層級：帳號表單於進入時載入、ProjectDetail 於選取專案時載入、JourneyMap 於接近 viewport 時載入、ContactBubble 於開啟時載入、牛場景於需要時載入。BackgroundSignals 有獨立 chunk 但首頁立即掛載；Bootstrap 以 Sass 只編譯網站使用的基礎、button、dropdown、modal、offcanvas、helpers 及 utilities；三語 UI 文案仍共同載入。建置的 Site 與獨立 section 資料平行準備，失敗仍遵守原本發布條件。

React Router Framework Mode manages locale URLs, loaders, client navigation and route error boundaries through `:locale?`; account access uses query state and in-page sections use hashes. Route splitting and component lazy loading cover different boundaries: account entry, selected project detail, near-viewport map, open contact bubble and the needed cow scene. BackgroundSignals is a separate chunk mounted immediately. Bootstrap Sass compiles only the used foundations, buttons, dropdowns, modals, offcanvas, helpers and utilities. All three UI dictionaries remain shared upfront. Build-time Site/section reads start concurrently while preserving publication requirements.

帳號入口目前是 `?view=login`，由頁面管理 history 與切換效果，沒有獨立的登入 route。直接開啟這個 URL 仍載入個人檔案 route，底層導覽、各 section 與其 query 訂閱保持掛載；`inert`／`aria-hidden` 禁止互動及隱藏無障礙內容，並不卸載元件或停止資料訂閱。現有 lazy 主要延後帳號表單、詳情與大型場景，尚未完全隔離登入入口的個人檔案載入成本。

Account access currently uses `?view=login`, with page-owned history and transitions rather than a separate login route. Opening this URL still loads the profile route; navigation, sections and query subscriptions remain mounted underneath. `inert`/`aria-hidden` prevent interaction and hide accessibility content without unmounting components or stopping subscriptions. Existing lazy boundaries defer forms, details and large scenes, but do not fully isolate account entry from profile loading.

共用方法、Hooks、元件的完整介面與引用範例見 [`src/shared/README.md`](src/shared/README.md)。共用檔案依責任直接 import，不建立把所有工具混在一起的大型匯出入口；功能模組對外仍使用自己的 `index.ts`。

See [`src/shared/README.md`](src/shared/README.md) for shared contracts, consumers and import examples. Import shared modules by responsibility; feature consumers retain each feature's public index.

### 功能內部分工 / Feature Structure

`features` 是前端功能模組，不等於單一頁面、元件或 endpoint。一個功能可包含多個 API 與元件，也可以只有本機互動。各功能遵循同一套責任規則，**只建立實際需要的子目錄**；例如 `projects` 可能需要完整分層，`appearance` 沒有遠端資料就不需要 `api` 或 API `schemas`。

A feature groups related frontend behavior rather than representing one page, component, or endpoint. It may own several API calls or only local interactions. Apply consistent responsibilities and create only the directories each feature needs.

| 位置 / Location | 責任與邊界 / Responsibility and boundary                                                                                                                 |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `api/`          | 功能 endpoint、參數、回應解析、query keys 與查詢設定；不操作 DOM / Endpoint calls, response parsing, query keys, and query options without DOM access    |
| `schemas/`      | 外部資料契約與執行期解析；可從 schema 推導型別時，避免另寫一份相同欄位 / External contracts and runtime parsers; derive types where possible             |
| `model/`        | 功能型別、業務計算、資料轉換與 selector；保持輸入輸出明確，不發 HTTP 請求 / Feature types and pure business calculations, transformations, and selectors |
| `hooks/`        | React 資料訂閱、互動狀態與副作用生命週期；可組合 API 查詢設定與 model / React subscriptions, interaction state, and lifecycle-managed effects            |
| `components/`   | 功能畫面、props、事件與元件樣式；不重寫 transport 或契約解析 / Feature UI, props, events, and styles                                                     |
| `index.ts`      | 明確列出外部可用的元件、函式與型別；不匯出所有內部細節 / Explicit public components, functions, and types                                                |

功能檔案依具體責任命名，例如 `projects/api/projects.ts`、`projects/schemas/projects.ts`、`journey/hooks/useJourneyPlayback.ts`、`projects/components/ProjectCard.tsx`。檔案與目錄在責任增長時拆分；不為每個短函式建立一層資料夾。

Name files by responsibility and split them as complexity grows, without introducing a directory for every small function.

### API 放置與資料載入 / API Placement and Data Loading

前端 `api` 指呼叫 FastAPI 的程式。**功能請求放在 `features/<feature>/api`，HTTP 基礎能力集中在 `shared/api`。** 例如 `features/site/api/site.ts` 的 `siteQuery` 定義 `/portfolio/site` 的參數與回應解析；`shared/api/http.ts` 的 `requestJson` 處理 URL、取消請求及共用錯誤。即使多個頁面使用 Site，請求仍由 `site` 擁有，透過公開介面重用。

Frontend API modules call FastAPI. Features own endpoint semantics, while `shared/api` owns HTTP mechanics. Reuse a feature API through its public interface even when several pages need it.

路由 loader 呼叫功能 API 或公開查詢設定，不在路由檔案另寫一套 endpoint 與解析規則。預先渲染負責取得首批公開資料；初始化時將這批資料銜接到 Query cache，明確設定刷新時機。後續分頁、重試與瀏覽器更新由功能 Hooks 使用 Query 管理，避免同一筆資料在掛載時無意重抓，或另存一份全域 store。[Query 初始資料與刷新規則](https://tanstack.com/query/latest/docs/framework/react/guides/initial-query-data)

Route loaders reuse feature APIs or public query options. Pre-rendering supplies initial public data; initialize Query caching from that data with an explicit freshness policy. Feature hooks manage subsequent pagination, retries, and refreshes without accidental duplicate requests or a second global copy.

典型請求與回應流程：

```text
ProjectsSection → useInfiniteQuery(projectsQuery) → numberedQuery → requestJson → FastAPI
FastAPI JSON → response parser → Query cache → selector/model → component
```

HTTP transport 處理 URL、query、取消請求與共用錯誤；資源 API 定義 endpoint、參數與回應解析；Hook 管理資料或互動生命週期；元件依資料與狀態呈現。`model` 保持純計算，以明確輸入取得結果。獨立資源可平行載入，避免因元件逐層掛載形成不必要的請求等待。

Transport owns HTTP mechanics, resource APIs own endpoint contracts, hooks own state lifecycles, and components render data. Keep model calculations pure and load independent resources concurrently where appropriate.

### 在線人數 / Online Visitors

`features/online-visitors` 擁有 `GET /system/heartbeat` 的非負整數契約、查詢與 `OnlineVisitors` 呈現元件。`PortfolioPage` 只建立一個查詢訂閱，透過 `ProfileOverview.leadingControls` 將 Person hearts 圖示與數字放在 social 列最左側，接續 API 社群連結、語言與外觀控制。桌面與手機共用這一個呈現實例，窄螢幕允許控制列換行；側欄底部保留 Door open fill 登入入口。文案提供三語 aria-label 與像素提示窗，零人顯示 `0`；首次載入／不可用顯示 `—`，更新失敗保留最後有效值並標示過期。hover、可見鍵盤焦點或輕觸圖示透過共用 `useHoverTooltip` 開啟 `PixelTooltip`，顯示目前網站語言的在線人數。

The `online-visitors` feature owns the nonnegative integer contract, query and `OnlineVisitors` indicator for `GET /system/heartbeat`. PortfolioPage owns one subscription and supplies the indicator through ProfileOverview's leadingControls slot. The toolbar order is online count, API social links, language and appearance, with one responsive instance and wrapping on narrow screens. The Door open fill sign-in entry remains at the sidebar footer. Localized accessible labels and pixel tooltips distinguish zero, loading, unavailable and stale results. Hover, visible keyboard focus or tap opens the shared `PixelTooltip` through `useHoverTooltip`, showing the online count in the active language.

在線提示窗使用共用 `side-left` 定位，在圖示左側以縮小的像素尾巴朝右指向圖示；左側空間不足時改用共用上下定位，保持在視窗內。`PixelTooltip` 集中 `PixelBubble` 小型外殼的內距、文字、20px 尾巴與 viewport 限寬，透過 body portal 避免被側欄裁切。在線圖示與數字透過共用 `IconGroup pulse="chat"` 一起播放 heartbeat，沿用 chat 的 `icon-breathe` 與 4 秒週期；hover／鍵盤聚焦時整組高亮，Door open fill 也沿用相同高亮規則。動畫、暫停及減少動態效果由 shared 模組統一管理，feature 不另外定義 heartbeat。

The online tooltip uses shared side-left placement with a smaller right-facing pixel tail. When the left side lacks room, shared above/below placement keeps it within the viewport. `PixelTooltip` owns the compact `PixelBubble` padding, type, 20px tail and viewport-constrained width, with a body portal that avoids sidebar clipping. The online icon and count pulse together through shared `IconGroup pulse="chat"`, using the same icon-breathe and four-second cycle as chat. Hover and visible keyboard focus highlight the whole group; Door open fill uses the same highlight rules. Shared decoration policies own pause and reduced motion; the feature defines no separate heartbeat.

page 的 `LoginEntry` 共用同一個 `useHoverTooltip`／`PixelTooltip`，以目前網站語言顯示 `ui.adminSignIn`：英文「Admin sign in」、簡體「登录管理员」、繁體「登入管理員」。按鈕保留 `ui.signIn` aria-label，移除原生 `title`；hover 與可見鍵盤焦點開啟提示。桌面使用 `side`，手機使用 `above`，由共用定位保持在 viewport 內。`Navigation.onLogin` 接到 page-owned 登入轉場；click 關閉提示與手機 drawer 後開啟登入頁。未提供 callback 時保留 click／tap 提示並以 `aria-disabled` 標示。

The page-owned `LoginEntry` shares `useHoverTooltip` and `PixelTooltip` and displays `ui.adminSignIn` in the active language: “Admin sign in”, “登录管理员” or “登入管理員”. The button preserves its `ui.signIn` accessible label and removes the native `title`; hover and visible keyboard focus open the description. Desktop uses `side` and mobile uses `above`, with shared viewport placement. `Navigation.onLogin` starts the page-owned sign-in transition after dismissing the tooltip and mobile drawer. Without a callback, click/tap retains the description and the entry is marked `aria-disabled`.

### 全站訊息 / Global Notifications

`AppProviders` 掛載單一 `NotificationProvider`，注入三語狀態名稱、預設訊息和關閉文案。全站以 `useNotifications().notify({kind,message?,id?})` 呼叫：成功綠色、異常黃色、錯誤及 Bug 紅色。提示固定於視窗上方中央，3 秒後消失，亦可手動關閉；沒有遮罩、焦點移動或焦點圈限，文字區可點穿，僅關閉鈕接收點擊。最新訊息取代前一則；相同 ID、種類及文案不延長時間。持續掛載的 polite live region 提供讀屏回饋，計時器在替換、關閉及卸載時清理。完整介面和使用範例見[共用 UI 規格](src/shared/README.md#浮動通知--floating-notifications)。

`AppProviders` mounts one `NotificationProvider` with injected localized labels, defaults and dismissal copy. Call `useNotifications().notify({kind,message?,id?})`: success is green, warning yellow, and error/bug red. Notifications sit at the viewport's upper center for three seconds, with optional manual dismissal. They have no backdrop or focus movement/trap; text allows click-through and only the close button intercepts input. The latest message replaces its predecessor; identical ID/kind/message does not extend its timer. A persistent polite live region announces copy, and timer cleanup covers replacement, dismissal and unmount. The [shared UI guide](src/shared/README.md#浮動通知--floating-notifications) defines the contract and examples.

`NotificationEvents` 僅在瀏覽器監聽主 Query cache 的最終失敗、離線／恢復及未捕捉的程式錯誤。相同 query 失敗直到恢復前只提示一次，排除取消、重試中及手動 cache 更新；一般 GET 成功不跳提示。成功恢復與明確的語言切換完成才顯示成功。`i18n/notification-copy.ts` 統一分類，僅顯示安全文案。局部請求／分頁的重試鈕保留；`SectionBoundary` 捕捉的渲染或 chunk 錯誤會顯示 Bug 提示，並保留局部恢復功能。SSR、建置及語言預備 cache 不發布瀏覽器提示。

`NotificationEvents` listens only in the browser to terminal failures in the application Query cache, offline/recovery events and uncaught bugs. Each query failure is announced once until recovery; cancellation, intermediate retries and manual cache writes are excluded. Ordinary GET success stays quiet; real recovery and completed explicit language changes announce success. `i18n/notification-copy.ts` owns shared safe classification. Local request/pagination retry controls remain available. `SectionBoundary` announces caught render/chunk bugs while retaining local recovery. SSR, builds and isolated locale-preparation caches emit no browser notifications.

### 帳號介面 / Account Forms

`auth` feature 提供最大 720px 的半透明雙欄卡片，左側牛場景、右側登入／註冊／忘記密碼。`PortfolioPage` 在進入帳號畫面時才動態載入 `AuthPanel`，牛拆件再獨立按需載入。只有當前模式的一份表單，已移除重複的隱藏尺寸副本及 API 訊息空位。登入與註冊切換保持相同桌面外框尺寸。模式切換清空帳密、驗證碼及欄位結果，保留牛的播放、表情和跟動偏好。英文信箱標籤為 Email；密碼與確認密碼各占半列，至少 8 字元提示放在 placeholder。信箱、密碼和確認密碼於輸入框 mouseleave 或 input blur 時檢查，未互動空值不顯示錯誤；精簡錯誤或可讀屏的通過勾號顯示在標籤右側，修改時清除舊結果及原生 custom validity。

The `auth` feature presents a translucent two-column frame up to 720px, with the cow scene and account modes. `PortfolioPage` dynamically imports `AuthPanel` only when entering account access; cow parts load separately on demand. Each mode has one form, with no duplicate hidden sizing form or empty API-feedback reservation. Desktop sign-in and registration share frame dimensions. Switching modes clears credentials, code and field checks, while retaining cow preferences. The English email label is Email. Password/confirmation share a row; the eight-character hint lives in the placeholder. Input-frame mouseleave or input blur triggers label-side validation, leaving untouched empty fields quiet. Accessible success checks and concise errors clear on edits alongside stale native custom validity.

帳號卡片頂部、底部留白統一為 16px，列間距也為 16px。桌面雙欄共用三列 subgrid：上方表情圖示外框與登入／註冊切換列同為 44px 高，下方播放圖示外框與提示文字區也同為 44px 高，上下邊緣完全對齊。圖示外框與語言／主題按鈕共用尺寸；手機上下排列也保留 16px 外側留白。切換列的透明點擊區覆蓋完整 44px 高度。

The account card uses equal 16px top/bottom insets and row gaps. Desktop columns share three subgrid rows with matching 44px outer heights for expression buttons/account switch and playback buttons/footer area. Icon frames share the language/theme button size. Mobile retains 16px outer insets; the compact switch keeps its full 44px tap height.

登入／註冊內容以動態島式收合及展開切換：舊內容向內縮小、模糊並淡出，新內容短距離滑入、展開並輕微回彈，整段展開為 480ms。拖曳時收合程度跟隨指標；放開後完成切換或回到原位。過場暫時渲染一份 inert／aria-hidden 的視覺預覽，輸入停用且為空、不複製帳密、不建立第二份 form；預覽使用獨立 ID，完成後移除。只有提交模式切換才清空欄位及取消待辦請求；取消拖曳保留原輸入。快速反向切換沿用當前 transform、透明度及模糊程度，完成才將焦點移到新標題。系統減少動態時立即切換；背景分頁取消過場，卸載及替換清除 rAF／計時器。

Account content uses a Dynamic Island-style collapse and expansion. The old view shrinks, blurs and fades; the new view travels a short distance and expands with a gentle rebound over 480ms. Dragging controls the collapse, then settles or returns on release. A temporary inert, aria-hidden visual preview uses empty disabled inputs and separate IDs, copies no credentials, and creates no second form. Only committed mode changes clear fields and abort requests; cancelled drags retain input. Rapid reversal preserves the rendered transform, opacity and blur, and heading focus moves after settling. Reduced motion switches immediately; hidden pages cancel the effect and replacement/unmount clears frames and timers.

登入／註冊切換列保留點擊與鍵盤操作，另支援手機、平板的水平觸控拖曳及滑鼠拖曳。滑塊即時跟隨指標，放開後依中點吸附；未跨中點或取消手勢不切換、不清空表單。垂直觸控保留頁面捲動；拖曳後不額外觸發按鈕點擊。

The sign-in/registration switch supports horizontal touch and mouse dragging alongside clicks and keyboard activation. The highlight follows the pointer and snaps at the midpoint on release. Short or cancelled drags retain the selection and form values. Vertical touch gestures preserve scrolling, and a completed drag suppresses the trailing button click.

驗證碼輸入區與註冊鈕各占半列，框內右側為 Bootstrap send-fill。可發送且尚未檢查通過時沿用共用 heartbeat；第一次發送檢查信箱並啟動 300 秒倒數，秒數位於圖示上方，圖示下移及淡化，按鈕停用並停止 heartbeat。到期後才可再次發送；已通過的 send-check-fill 在可操作時保持主題色高亮及靜止，等待中沿用淡化規則。只保存 sessionStorage 到期時間；切換模式、語言及重新整理不重設等待，儲存不可用時使用當前元件記憶體，恢復分頁時依實際時間核對。發送以綠色全站提示搭配 send-fill 顯示「驗證碼已送出」及有效 5 分鐘；此為使用者指定的送出狀態預覽，寄信 API 尚未串接。非空驗證碼仍是使用者要求的暫時檢查預覽，沒有實際伺服器驗證或寄信。

The code field and Register share a row, with an embedded Bootstrap send-fill icon. Available unchecked sending uses the shared heartbeat. The first action validates email and starts a 300-second cooldown: integer seconds appear above the lowered, faded, disabled icon and its pulse stops. Sending resumes only after expiry. Accepted send-check-fill is highlighted and still when available, but faded during waiting. Only the sessionStorage deadline persists; mode/language changes and reloads retain it, with mounted-memory fallback and wall-clock reconciliation on visibility/focus. The green global notification uses send-fill and says the code was sent with five-minute validity. This is the requested sent-state preview; the delivery endpoint remains absent. Nonempty-code acceptance remains a requested presentation preview, without server verification or delivery.

`AuthPanel.onAuthenticate({mode,fields,signal})` 是由頁面注入的真實登入／註冊服務接入點，帳密只存在表單及單次 FormData 呼叫，不放入 React state、儲存或提示內容。只有這個 Promise 真正成功時，才顯示綠色成功提示，牛切為看你，並以共用 PixelBubble 的箭頭尾巴顯示三語「歡迎」。模式切換或卸載取消待辦請求並忽略過期結果；失敗沿用共用錯誤分類。目前頁面未提供帳號 API，因此有效送出顯示黃色未開放提示，不模擬登入成功。欄位檢查仍保留在欄位旁，密碼不一致以紅色提示，其他操作訊息統一走全站提示。

`AuthPanel.onAuthenticate({mode,fields,signal})` is the page-injected real sign-in/registration service boundary. Credentials remain in the form and one FormData call, never React state, storage or notifications. Only successful resolution produces a green notice and the watching cow with a translated Welcome speech bubble using shared PixelBubble/tail. Mode changes and unmount abort pending work and ignore late results; failures reuse shared classification. The page currently supplies no account API, so valid submission produces a yellow unavailable notice without simulated authentication. Field validation stays local, with password mismatch shown in red; operation messages use the global host.

`AuthCowScene` 延後載入 shared `CowWorkspace` 原有 SVG 場景，首頁不下載牛的拆件。左上使用 Bootstrap repeat／cup-hot-fill／dpad-fill／balloon-fill 圖示，切換自然循環、思考、代碼及注視；右下依序提供 globe-americas-fill／mouse2-fill／播放暫停切換鈕；播放時顯示 pause-fill，暫停時顯示 play-fill，提示和無障礙名稱隨下一個動作切換；地球按鈕獨立切換旋轉，關閉時停在目前角度，再次開啟後繼續；滑鼠按鈕獨立切換視差跟動，不影響表情或動畫播放，關閉時回正。七個控制鈕在桌面與手機均共用語言及主題按鈕的 44px 外框。各按鈕共用 `useHoverTooltip`／`PixelTooltip` 顯示上方像素提示，取代原生 title；三種表情只顯示「思考／編程／你好」，其餘使用最短操作文案，滑鼠跟動依狀態顯示開啟或停止。點擊先關閉提示再執行按鈕動作，文案提供三語。預設每段 3 秒循環，播放／暫停保留表情及剩餘循環時間；切換帳戶表單不重建場景。登入框淡入時才啟動，並沿用 shared motion 的系統減少動態、全域暫停、隱藏分頁及離開畫面規則；手機版場景排列於表單上方。

`AuthCowScene` lazy-loads the existing shared `CowWorkspace` SVG, keeping its rig out of the initial portfolio bundle. Top-left Bootstrap repeat/cup-hot-fill/dpad-fill/balloon-fill controls select the natural cycle or thinking/coding/watching poses; bottom-right controls place globe-americas-fill before mouse2-fill and a single playback button. The playback button shows pause-fill while playing and play-fill while paused; its tooltip and accessible name describe the next action. Globe rotation toggles independently, holding its current angle when stopped and continuing when enabled. Mouse following toggles independently of expression and playback, returning the scene to neutral when disabled. Play/pause retains the current expression and remaining cycle time. All seven controls share the language/theme buttons’ 44px frames on desktop and mobile. Each reuses `useHoverTooltip`/`PixelTooltip` above the button, replacing native titles with brief localized copy: Thinking/Coding/Hello and short actions for loop, tracking and playback. Clicking dismisses the tooltip before performing the action. The default cycle holds each phase for three seconds. Account mode changes retain the scene. Motion starts when the auth panel reveals and follows the shared reduced-motion, global-pause, document-visibility and intersection policies; narrow screens place the scene above the form.

登入沿用主頁的 760px 斷點：較寬視窗使用最大 720px 的雙欄框，牛場景最大 300px 並依可視高度縮小，卡片內距與區段間距收緊。手機及窄平板改為最大 520px 單欄，上方牛場景最大 220px 並保留全部控制；380px 以下工具列可換行，內嵌發送圖示的驗證碼框與註冊按鈕各占完整一列。短視窗捲動整個登入層，保留表單自然高度，沒有表單內部捲動框。手機與粗略指標裝置的輸入文字為 16px，初始焦點落在標題。信箱／密碼共用 Bootstrap 圖示前綴，密碼使用眼睛圖示切換顯示；提交鈕的真實 SVG 斜紋在 hover 或可見鍵盤焦點時向右移動，遵守暫停與減少動態規則。

Auth follows the portfolio's 760px breakpoint: wider viewports use a two-column frame up to 720px with tighter padding and section spacing. The cow scene is capped at 300px and adapts to viewport height. Phones and narrow tablets use a single column up to 520px with a cow scene up to 220px above the form and all scene controls retained. At 380px and below the toolbar can wrap, and the code field with its embedded send icon and Register each use a full row. Short viewports scroll the entire auth surface while preserving natural form height. Mobile and coarse-pointer inputs use 16px text, and entry focus targets the heading. Email/password fields share Bootstrap icon prefixes; an eye icon toggles password visibility. A real SVG stripe pattern moves right on submit-button hover or visible keyboard focus and respects pause and reduced-motion policies.

登入表單、牛控制與場景拆件均有英文用途註解，特別說明帳號模式切換時保留的場景偏好，以及事件、計時器與觀察器的清理歸屬。page-owned 登入導覽／轉場與 shared tooltip／場景 Hook 各自記錄生命週期；新增拆件仍須維持這些註解與實際行為一致。

English comments cover account components, cow controls and scene parts, explaining scene preferences retained across account-mode changes and ownership of event, timer and observer cleanup. Page-owned auth navigation/transitions and shared tooltip/scene hooks document their lifecycles. Keep those comments aligned with behavior when extending the components.

牛的原始向量以同源外部 SVG sprite 載入，React 保留圖層組合與動畫控制，避免大型路徑資料進入 JavaScript。場景使用局部錯誤邊界，素材載入失敗仍保留表單、返回及控制鈕；素材重建與校驗指令見 shared cow workspace README。

Original cow vectors load through a same-origin external SVG sprite while React owns composition and motion, keeping drawing data out of JavaScript. A local scene error boundary leaves the form, back button and controls usable if loading fails. The shared cow workspace README documents regeneration and parity checks.

`useAuthTransition` 管理 exit 260ms → collide 300ms → expand 350ms → reveal 420ms → auth，重用原有左右 ruler 對撞再展開；導覽完全滑出、portfolio 淡出後隱藏，登入框最後淡入。Reduced motion 跳過轉場，文件隱藏完成有限動畫；背景 Pause 不阻擋使用者導覽。`useAuthNavigation` 使用目前語系路徑的 `?view=login`，保留其他 query、section hash 與 Router state，支援直接連結、上一頁／下一頁與 Escape 返回。隱藏的導覽／內容為 inert，section tracking、entrance replay 與 Journey playback 暫停；返回保留 compact 設定、捲動位置與入口焦點。登入可見時鎖定 body 捲動，手機 drawer 的鎖定先釋放，離開時復原原有樣式。

`useAuthTransition` coordinates exit (260ms), collision (300ms), expansion (350ms) and reveal (420ms), reusing the existing rulers. The navigation slides fully out, portfolio fades and hides, and the panel fades in. Reduced motion skips the sequence; document hiding finishes finite animation, while background Pause leaves explicit navigation available. `useAuthNavigation` uses `?view=login` on the locale route and preserves other queries, section hashes and Router state, including direct links, history and Escape. Hidden portfolio/navigation surfaces are inert; section tracking, entrance replays and Journey playback suspend. Returning restores compact state, scroll and entry focus. The visible panel owns body scroll locking after the mobile drawer releases its lock, restoring original styles on exit.

共用 tooltip 只在開啟時掛載並加上 `aria-describedby`。滑鼠離開延遲 150ms 關閉，允許移入提示窗；可見鍵盤焦點保留提示，touch 不套用 hover 離開。焦點移出且 trigger／提示窗皆未 hover、外部點擊、Escape、scroll、resize、window blur 或文件隱藏時關閉，timer／listener 隨關閉與卸載清理。文案與按鈕動作由各 owner 提供，共用層不讀取 i18n 或登入狀態。

The shared tooltip mounts and adds `aria-describedby` only while open. A 150ms pointer-departure delay allows movement into it; visible keyboard focus retains it and touch skips hover dismissal. Blur outside both hovered surfaces, outside pointerdown, Escape, scroll, resize, window blur or document hiding closes it, with timer/listener cleanup on closing and unmount. Owners supply copy and button actions; the shared layer reads neither i18n nor login state.

查詢只在瀏覽器執行，不加入靜態預先渲染資料；可見頁面每 45 秒更新，不啟用後端 30 秒回應快取，背景頁籤暫停，恢復可見時重新取得過期資料。沿用共用 HTTP 驗證、取消與短暫錯誤重試。後端依最近 60 秒的 IP 活動估算人數，並非登入帳號或分頁數；建置端仍不因這項可選查詢而失敗。

This browser-only query is excluded from static snapshots. It polls every 45 seconds without backend response caching, pauses in hidden documents and refreshes stale data on return. Shared HTTP validation, cancellation and transient retries apply. The backend estimates recent active IPs within 60 seconds, rather than accounts or tabs; this optional feature cannot block static publication.

## 元件、Hooks 與重用規範 / Components, Hooks, and Reuse

### 元件放置 / Component Placement

| 元件範圍 / Scope                                 | 位置與例子 / Location and example                                                                                         |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| 不依賴業務的通用 UI / Business-independent UI    | `shared/ui`：SectionState、PixelBubble、PixelTooltip、ExpandableTagList；資料透過 props 傳入 / Receive data through props |
| 理解特定功能資料與規則 / Feature-specific UI     | `features/<feature>/components`：ProjectCard、ProjectDetail、JourneyMap                                                   |
| 僅組織單一頁面的版面 / Page-specific composition | `pages/<page>/components`：Navigation、BackgroundField                                                                    |

`ProjectDetail` 使用 React-Bootstrap Modal 管理焦點與鍵盤，專案內容保留在 feature。業務元件被多個頁面使用，仍留在所屬功能；只有語意與依賴都通用時才移入 `shared`。共用 `ExpandableTagList` 不自行呼叫技能 API，取得更多資料的責任交給功能並透過事件連接。

ProjectDetail composes the Bootstrap modal primitive for focus and keyboard behavior. Reuse across pages does not remove feature ownership. Shared components remain business-independent; an expandable tag list receives data and callbacks rather than fetching skills itself.

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

| 情境 / Scenario                                            | 放置與責任 / Placement and responsibility                                                                                               |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 經歷、專案與技能都需要展開標籤 / Expandable labels         | `shared/ui/ExpandableTagList` 接收標籤與互動參數；資源取得留在各功能 / Share presentation while retaining resource fetching in features |
| 多處格式化月份或計算期間 / Month formatting and arithmetic | 共用純函式，明確傳入日期與語系 / Pure helpers with explicit dates and locale                                                            |
| 工作年資或專案分組 / Career duration or project grouping   | 留在擁有該業務規則的 `model`，跨功能使用再評估公開介面 / Business model with deliberate public exposure                                 |
| 共用頁碼分頁 / Shared numbered pagination                  | 共用五欄位契約、載入按鈕與錯誤呈現；保留資源及 owner 範圍 / Share the page contract and controls, retain resource and owner scope       |
| 地圖投影與標籤量測 / Projection and label measurement      | 純幾何計算與 DOM 量測拆分；量測透過 ref 與生命週期管理 / Separate geometry from lifecycle-managed DOM measurement                       |

Effect 中建立的事件監聽、計時器、observer、動畫與連線須對應清理；支援重複掛載與依賴變更。React 管理的畫面依 props/state 更新，必要的 SVG、canvas 或第三方 DOM 操作限制在明確的 ref 邊界。元件參數與純函式不讀取舊版 `window.Portfolio`、`I18n` 等隱含全域狀態。

Clean up listeners, timers, observers, animations, and connections. Isolate imperative rendering behind refs and pass dependencies explicitly rather than retaining legacy globals.

### 共用流程與特效責任 / Shared Flows and Effect Ownership

| 能力 / Capability                                      | 共用介面與引用者 / Shared interface and consumers                                                                                                                                                                                                  |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HTTP、契約與分頁 / Transport, contracts and pagination | `requestJson`、`numberedPageSchema`、`numberedQuery`、`usePagedCollection` 統一讀取／驗證／續頁／狀態；feature API 提供 endpoint 與 item schema。 / Feature APIs inject endpoints and item contracts into one read/validation/continuation policy. |
| 展開與標籤預覽 / Collection and tag disclosure         | 經歷／專案使用 `ExpandableCollection`；卡片／分類使用 `ExpandableTagList` 與 `tagPreviewCount`。集合第一頁引用 `pageSize`，標籤另依 75% 實際寬度量測。 / First-page collections and measured-width labels reuse shared presentation.               |
| 浮框與包邊 / Floating surfaces                         | Contact／City 共用 `PixelBubble`、`useAnchoredPanel`、`floatingPosition`；feature 傳入內容、關閉流程與保護邊界。 / Owners inject content, lifecycle and protected bounds into one shell/placement system.                                          |
| 小型提示窗 / Compact tooltips                          | OnlineVisitors／page LoginEntry 共用 `useHoverTooltip` 的揭露／關閉生命週期及 `PixelTooltip` 小型外殼與定位；文案與按鈕動作由 owner 提供。 / Shared disclosure/dismissal and compact anchored presentation with owner-supplied copy and actions.   |
| 選單與 modal 焦點 / Menu and modal focus               | Appearance／Language 共用 `useDisclosureFocus`；Drawer／ProjectDetail 共用 `cycleDialogTab`。初始目標與關閉後還原留在 owner／Bootstrap。 / Shared focus mechanics retain owner-specific activation and restoration.                                |
| 持續 heartbeat / Continuous breathing                  | Timeline 點引用共用 size／duration／keyframe tokens；chat／disclosure 使用 `Icon` 的同一 breathing 動畫。 / Timeline points and icon roles reuse their shared keyframes and tokens.                                                                |
| 螢幕與動態政策 / Responsive and motion policy          | 共用 `mobileQuery`、`reducedMotionQuery`、`useMediaQuery`、`useDocumentVisible`。 / Components share media/visibility subscriptions and JS breakpoint conditions.                                                                                  |

有限主題漸變由 appearance 管理，聯絡倒數由 site 管理，地圖播放由 journey 管理，入場／區段導覽由 page 管理。它們引用上述基礎能力，保留各自的狀態與清理；新增效果前先查找可重用介面，再記錄其 owner、觸發、停止、卸載與減少動態效果行為。

Appearance owns finite palette transitions, Site owns contact timing, Journey owns playback, and the page owns entrance/navigation. They reuse shared infrastructure while retaining distinct state and cleanup. New effects document their owner, triggers, suspension, unmount and reduced-motion behavior.

## 資料契約與狀態 / Contracts and State

以[後端回應模型](../backend/APPs/Portfolio/schema/resp/resp_portfolio.py)、[參數解析器](../backend/APPs/Portfolio/schema/parser/parser_portfolio.py)及執行中服務的 OpenAPI 為依據。導入型別產生工具時，產生結果與手寫業務模型分開，產生檔由工具維護。TypeScript 型別檢查與執行期 JSON 驗證分責；mock、HTTP transport 和測試使用同一份資源契約。

Backend models, query parsers, and OpenAPI define the API contract. Separate generated types from handwritten models. Compile-time types do not replace runtime JSON validation; mocks and real requests must follow the same resource contracts.

目前 Portfolio API 摘要如下；完整欄位與錯誤格式見[後端 README](../backend/README.md#目前的-get-api--available-get-apis)。

| Endpoint                          | 回應 / Response                     | 分頁 / Pagination                                             |
| --------------------------------- | ----------------------------------- | ------------------------------------------------------------- |
| `GET /portfolio/site`             | `{brand, profile, social, chatme}`  | 無 / None                                                     |
| `GET /portfolio/journey`          | `JourneyItem[]`                     | 無 / None                                                     |
| `GET /portfolio/experiences`      | `{total, pages, page, size, items}` | `page` 從 1 開始，`size=6` / Numbered, six per page           |
| `GET /portfolio/projects`         | `{total, pages, page, size, items}` | `page` 從 1 開始，`size=6` / Numbered, six per page           |
| `GET /portfolio/skill-categories` | `{items, total, pages, page, size}` | 頁碼；每類 skills 也是分頁 / Numbered with nested skill pages |
| `GET /portfolio/skills`           | `{items, total, pages, page, size}` | 分類內的技能頁碼分頁 / Skills within a category               |

- 六支 API 接受 `locale=en|zh-Hans|zh-Hant`，預設 `en`；所有業務文字直接使用指定語系。
- 回應沒有共通的 `data/meta/revision` envelope，也不使用資料集 revision 比對；保留資源自己的回應形狀。
- 四種集合共用 `{items,total,pages,page,size}`，page 從 1 開始，size 固定 6；空集合 pages=0，超頁 items=[]。
- `/skills` 需要 `ownerId`，`ownerType` 只接受 `category`。分類內的 `skills` 是同一五欄位回應，預覽為第 1 頁；寬度量測需要補足預覽或使用者展開時，以 `page=2&size=6` 接續同一分類。
- Projects 與 Experiences 已包含各筆技能；Projects 也包含詳情，展開時使用已載入內容。
- 保留 API 的穩定 ID、陣列順序，以及 `null`、空陣列和缺少欄位的差異。DOM/React key 使用穩定 ID；技能參照可用 selector 建立查找表。

Responses retain their resource-specific shapes and localized text. Preserve numbered pagination, backend ordering and null semantics, and reuse loaded project details and skills.

狀態依所有權管理：

| 狀態 / State                                                     | 所有者 / Owner                                                                             |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| API 回應、載入、錯誤、已取得頁面 / Server data and request state | TanStack Query，銜接路由載入的初始資料 / TanStack Query initialized from route-loaded data |
| 對話框、卡片展開、地圖播放 / Local interaction                   | 對應元件或 Hook / Owning component or hook                                                 |
| 語系、外觀偏好 / Shared preferences                              | 有明確範圍的 Provider；需要時才持久化 / Scoped providers with deliberate persistence       |
| 日期文字、分組、查找表 / Derived values                          | 純函式或 selector，從來源資料計算 / Pure functions or selectors                            |

Query cache 保留回應作為來源，避免把同一批 API 資料再複製到全域 store。TanStack Query 的查詢快取不等於全域實體正規化；跨分類的技能查找與去重依實際需求在 selector 處理。

Keep one authoritative server-data cache. Query caching is not a globally normalized entity store; derive lookup tables and deduplicate references where the feature needs them.

快取鍵包含資源、語系、size、owner 分類及實際篩選條件；InfiniteQuery 的頁碼保存在 pageParams，不為每頁建立另一份集合快取。四種集合使用相同五欄位頁碼回應；分類 skills 預覽已是第 1 頁，後續從第 2 頁接續。切換語系或分類時重新使用相應範圍的資料與頁碼，失敗不得前進頁碼。重試依錯誤類型與次數設定，取消請求傳遞 `AbortSignal`；舊請求完成後不得覆蓋新選擇的畫面。

Cache keys identify the resource and all relevant selection parameters. Manage numbered pages according to the Query API, keep pages scoped, and ensure failed or outdated requests do not advance or overwrite visible state.

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

`package.json`、鎖定檔、工具設定與 `.env.example` 納入版本控制；`.gitignore` 已排除 `node_modules/`、框架產生的型別、建置與測試產物、本機環境檔。新增元件或頁面時，在本文件更新繁體中文＋英文 SPEC；本文件也維護架構、責任與操作入口。

Track dependency manifests, lockfiles, tooling configuration, and public examples. Ignore rules exclude dependencies, generated outputs, and local settings. Update bilingual specifications here whenever a component or page changes.

## 開發與驗證 / Development and Verification

環境基線為 Node.js **24.21.0**、npm **11.19.0**。Mac 可透過 Homebrew 安裝 `node@24` 並依安裝提示加入 PATH；其他作業系統使用 Node.js 官方安裝方式。確認 `node --version` 與 `npm --version` 後，在專案根目錄執行：

The runtime baseline is Node.js **24.21.0** and npm **11.19.0**. Ensure both commands are on PATH. From the repository root:

```bash
cd frontend
npm ci
cp .env.example .env.local
npm run dev
```

首次安裝才複製 `.env.example`，不要覆寫已有的 `.env.local`。先依[後端安裝步驟](../backend/README.md)啟動 8080 API；要顯示完整作品集或正式建置，需完成三語內容匯入。開發網址為 `http://127.0.0.1:5173`；dev server 使用固定 port，若已被占用會停止。API 無法使用時各區呈現載入失敗／重試，保留有效快取。第一次安裝或更新 Playwright 後，執行 `npx playwright install chromium` 下載測試瀏覽器；Linux CI 可使用 `npx playwright install --with-deps chromium`。

Copy the example only on first setup and preserve existing local settings. Start the backend on port 8080; complete locale data import for a full portfolio or production build. Development runs on fixed port 5173. API failures have independent retry feedback and retain valid cached data. Install Chromium after first setup or a Playwright update; Linux CI can also install its system dependencies with `--with-deps`.

| 指令 / Command                            | 目的 / Purpose                                                                                   |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `npm ci`                                  | 依鎖定檔重新安裝 / Reinstall locked dependencies                                                 |
| `npm run dev`                             | 本機開發與 HMR / Development with hot module replacement                                         |
| `npm run typecheck`                       | 產生路由型別並執行 TypeScript 檢查 / Generate route types and check TypeScript                   |
| `npm run lint`                            | 程式、Hooks 與依賴邊界檢查 / Code, Hooks, and import rules                                       |
| `npm run format` / `npm run format:check` | 排版／排版檢查 / Format or check formatting                                                      |
| `npm run test` / `npm run test:watch`     | 單元與元件測試／持續監看 / Unit and component tests or watch mode                                |
| `npm run test:e2e`                        | 自動建置、啟動靜態預覽與執行 Chromium 測試 / Build, preview, and run Chromium scenarios          |
| `npm run test:dev`                        | 重新轉換相依並驗證實際 dev server / Check the real dev server with fresh dependency optimization |
| `npm run build`                           | 正式建置與三語預先渲染 / Production build and locale pre-rendering                               |
| `npm run verify:public`                   | 公開檔案與資產預算檢查 / Check deliverable files and asset budgets                               |
| `npm run preview`                         | 預覽既有 `build/client`，通常使用 port 4173 / Preview an existing build, normally on port 4173   |
| `npm run check`                           | 型別、lint、格式、單元測試及建置 / Types, lint, formatting, unit tests, and build                |

### 開發相依載入 / Development Dependency Loading

即使正式配置為 `ssr:false`，React Router 開發模式仍會在 Node 中渲染頁面；dev module runner 與正式建置的相依處理方式不同。React-Bootstrap 的間接相依 `@restart/ui` 在 Node 條件下提供 CommonJS，因此 `ssr.noExternal` 必須搭配 `ssr.optimizeDeps.include` 將元件相依樹預先轉成 ESM。SSR optimizer 排除 `react`／`react-dom`，讓元件與外部渲染器共用同一份 React，避免 Hook dispatcher 不一致。

React Router renders development pages in Node even with production `ssr:false`. Its development module runner differs from the production bundler. Keep `ssr.noExternal` for component transformation and pre-bundle the component dependency trees through `ssr.optimizeDeps.include` to convert the Node-selected CommonJS dependencies. Excluding React and React DOM from SSR optimization preserves the renderer's shared React instance.

瀏覽器 optimizer 在啟動時掃描 root／route entries，包含懶載入元件；已使用的 Dropdown／Offcanvas／Modal 集中於 `vite.config.ts` 的 `bootstrapComponents`，兩個 optimizer 重用同一清單。新增 React-Bootstrap 互動元件時同步更新此清單，避免操作後才重新轉換相依。`npm run test:dev` 使用獨立 port 5174 與合成 API，強制重新轉換快取，驗證四 URL、hydration、下拉選單、手機導覽、Modal 及分頁，並檢查 runtime／console errors；建置後的 preview 另由 `test:e2e` 驗證。

Browser optimization scans root and route entries, including lazy components, before initial loading. Both optimizers reuse `bootstrapComponents`; extend this list when introducing another interactive React-Bootstrap component. `test:dev` manages port 5174 and a synthetic API, forces dependency optimization and checks all four URLs, hydration, dropdowns, mobile navigation, lazy dialogs and pagination with runtime/console error assertions. `test:e2e` independently verifies the production preview.

See [Vite dependency optimization](https://vite.dev/config/dep-optimization-options) and [SSR options](https://vite.dev/config/ssr-options) for the configuration boundaries.

### 環境變數與 API / Environment and API Configuration

需要更改本機 API target 時，複製公開範例，再編輯忽略的 `.env.local`：

To customize the local API target, copy the public example and edit the ignored `.env.local`:

```bash
cp .env.example .env.local
```

預設 `API_PROXY_TARGET` 與 `API_BUILD_TARGET` 都是 `http://127.0.0.1:8080`，與公開後端開發配置一致；更換服務位址時一起調整兩者，修改環境檔後重啟 dev server。`npm ci` 安裝依賴，不會自動建立環境檔或啟動後端。

Both API targets default to `http://127.0.0.1:8080`, matching the published backend configuration. Update both when changing origins and restart the development server after environment edits. Dependency installation does not create an environment file or start the backend.

- `VITE_API_BASE_URL=/api`：瀏覽器 HTTP transport 的公開前綴；所有 `VITE_` 變數都可能進入公開 bundle，只能填公開值。
- `API_PROXY_TARGET`：僅供本機 dev／preview 的公開 API 轉交；移除 `/api` 並保留 query 與錯誤 status。
- `API_BUILD_TARGET`：僅供 server loader 在建置時讀取公開 API，不進入瀏覽器 bundle；建置不經 dev proxy。
- `VITE_PUBLIC_SITE_URL`：可選的公開網站 origin；設定後產生 canonical、四組 hreflang 與 Open Graph URL。未設定時省略絕對 URL，不猜測正式網域；不支援 origin 以外的子目錄部署。
- 正式 hosting 需獨立把 `/api` 轉給 FastAPI。範例使用同源 proxy；若改成跨來源 API，另外驗證後端 CORS。
- `.env.example` 只有通用示例；實際本機環境檔不提交，憑證與資料庫設定不放前端。

The browser uses a public API prefix. Dev/preview proxy and build-time origins are separate server-only settings. Static builds read the public backend directly. An optional public website origin enables canonical/hreflang/Open Graph URLs; absent or invalid origins are omitted, and subdirectory hosting is not supported. Production requires explicit API routing; cross-origin delivery additionally needs verified CORS. Local settings and credentials stay outside published files.

### 樣式與圖示 / Styles and Icons

`root.tsx` 依序引入選擇性的 Bootstrap Sass、`styles/tokens.css`、`styles/global.css`。需要覆寫的全域設計值集中在 tokens；元件專屬樣式使用 CSS Modules。本地字型／圖示的授權聲明放 public/licenses，隨正式 artifact 發布。互動元件以 React-Bootstrap 管理 React 狀態，不另外引入 Bootstrap 的 DOM 操作 bundle。Bootstrap Icons 以 `bootstrap-icons/icons/<name>.svg` 單獨 import，避免為少數圖示載入整套 icon font。Bootstrap 由 `styles/bootstrap.scss` 以官方 Sass 模組選擇性編譯，保留使用中的基礎、互動元件、helpers 與 utilities；新增 Bootstrap 元件時必須同步這個入口及瀏覽器驗證，避免回頭引入整份 CSS。

Compile the selected official Bootstrap Sass modules before tokens and global overrides. Local font/icon license notices ship in public/licenses and remain in the client artifact. Use React-Bootstrap for interactive components and individual SVG imports for icons. Component-specific styles belong in CSS Modules; The shared Sass entry owns the selection; adding a Bootstrap component requires updating that entry and verifying its browser behavior.

### 建置與檢查範圍 / Build and Verification Scope

`npm run build` 在隔離產物目錄執行 React Router，再檢查四語系路徑的有效 Site 標記、公開檔案與資產預算，全部通過才替換 `build`。CLI exit=0 不足以代表 loader 成功，錯誤 HTML 不能通過。Site 缺少／契約錯誤使建置失敗並保留上一份產物；其餘區的建置請求可獨立失敗，瀏覽器提供重試。

Builds use an isolated directory and accept output only after verifying all four locale profiles, public-file policy and asset budgets. Router CLI success alone is insufficient: rendered loader errors cannot pass. A missing/invalid required Site preserves the previous artifact; independent domains can recover in the browser.

僅發布 `build/client`。`npm run preview` 以 sirv 靜態檔優先，並獨立代理公開 API；未知 API／asset 不回傳成功的 SPA HTML。[Nginx 範例](deploy/nginx.conf.example)提供相同分工，實際 upstream／root 在私有部署配置調整。HTML／route data 重新驗證，hashed assets 可長期快取；fallback 的未知前端路由先回 HTML，hydration 後顯示安全錯誤頁，不能當作伺服器已回 HTTP 404。

Publish only `build/client`. Local preview prioritizes static files and separately proxies public reads. Unknown APIs/assets retain failures. The generic Nginx example keeps routing responsibilities separate and revalidates HTML/data while caching hashed assets. Unknown frontend paths initially receive fallback HTML and show a route error after hydration; this does not imply an HTTP 404 response.

SSG 是建置時的公開快照；後端內容變更後需重建／重新發布 HTML。Query staleTime=60 秒、gcTime=30 分鐘；有效資料在 fresh 期間不立即重複讀取。語言導覽會檢查相應 cache；正常內容沒有常駐區塊重新整理按鈕，載入失敗才呈現重試入口並保留已驗證資料。owner 技能第 1 頁來自分類 preview，後續頁由 75% 預覽量測或展開操作按需取得。沒有後端 revision 的情況下，前端以 ID、總數與頁碼驗證常見異常，不能保證多次讀取為同一資料庫快照。

SSG changes require rebuilding and publishing. Browser queries are fresh for one minute and retained for thirty minutes, avoiding immediate duplicate reads. Locale navigation consults cache. Normal sections have no persistent refresh control; failed reads expose retry while retaining validated content. Owner previews seed skill page one; measured capacity or disclosure requests continuation as needed. Identity/count/page checks detect common changes without claiming transaction-level snapshot consistency.

Vitest 涵蓋六契約、日期、HTTP timeout／取消、頁碼與 label 一致性、locale staging、地圖、播放及偏好，並驗證登入導覽／轉場、表單、驗證碼占位、牛控制與 tooltip 生命週期；Playwright 使用合成公開 fixtures 驗證四 URL、分頁、對話框、切語言／取消、fault、RWD／四色、鍵盤、無 JavaScript 和建置故障保留。 `*-parity.spec.ts` 對照實際版型、paint 與互動：四邊／導覽進場時序、光暈與慢 chunk、短 viewport、三語／四色、手機／平板／桌面至 4K、選單內距／焦點、對話框技能與流程、聯絡漸層及 Journey 鍵盤／overflow。開發 runtime 與正式 preview 分開執行；宣告的測試範圍不等同當次執行結果。目前儲存庫未配置 CI workflow，使用下列本機指令執行檢查；瀏覽器測試建置的合成快照不能發布為正式網站。

Vitest covers contracts, dates, bounded HTTP failures/cancellation, pagination consistency, locale staging, map/playback and preferences, plus auth navigation/transitions, forms, verification-code placeholders, cow controls and tooltip lifecycles. Chromium verifies static delivery, interactions, faults, responsive layouts, keyboard behavior, JavaScript-disabled content and artifact preservation. Parity tests inspect visible geometry, paint and behavior: entrance timing, halo/slow chunks, short viewports, three languages/four themes, mobile/tablet/desktop through 4K, menu padding/focus, detail skills/flow, contact surfaces and Journey keyboard/overflow boundaries. Development runtime and production preview are exercised separately; declared coverage does not claim that a particular run passed. The repository currently has no CI workflow; run the local checks below. Browser-test synthetic snapshots are not production websites.

真 API 驗證是額外的只讀模式：在 shell 設定 `PORTFOLIO_API_SMOKE_TARGET` 為你的公開 API origin 後，執行 `npm run test`（六 endpoint／所有續頁）及 `npm run test:e2e -- live.spec.ts`（三語靜態交付及實際分頁）。未設定時跳過 live checks；一般測試不需要你的後端，也不停止服務。`npm run verify:public` 可重跑公開產物檢查。

For optional read-only live verification, set `PORTFOLIO_API_SMOKE_TARGET` in the shell, then run the unit suite for all endpoint/pages and `npm run test:e2e -- live.spec.ts` for three-language browser integration. Live checks are skipped when unset; normal tests do not depend on or stop a personal backend. `npm run verify:public` reruns public-output inspection.

從乾淨 checkout 驗證時，先執行 `npm run typecheck`（重新產生 `.react-router` 型別）、`npm run lint`、`npm run format:check`、`npm run test`；再**依序**執行 `npm run test:dev` 與 `npm run test:e2e`。兩者共用自動管理的 fixture API 4181，開發驗證使用 5174，正式 preview 使用 4173，不能同時啟動。瀏覽器測試會以合成資料重建 `build/`；要交付正式網站，測試結束後以有效公開 API 執行 `npm run build`，再 `npm run verify:public` 與 `npm run preview`。

For a fresh checkout, generate route types, then run lint, formatting and unit checks. Run development and production browser suites sequentially: both own fixture port 4181, with frontend ports 5174 and 4173 respectively. Browser verification replaces `build/` with a synthetic snapshot. Rebuild against valid public API content before delivering a site, verify the output, then preview it.

開發瀏覽器測試固定使用兩個 worker，每項測試上限 60 秒，為冷載入模組與多尺寸畫面矩陣保留時間。操作伺服器先渲染的按鈕前，測試以預設 fixture 的 client-only 在線數更新確認 hydration，避免把尚未掛上事件的靜態畫面當成可互動頁面；覆寫 heartbeat 的測試使用自己的就緒條件。

Development browser checks use two workers and a 60-second per-test budget for cold module loading and viewport matrices. Before interacting with server-rendered controls, tests confirm hydration through the default fixture's client-only online-count update. Tests that override heartbeat use their own readiness condition.

原始碼、CSS、字典、字型／地圖／圖片及授權、測試 fixtures、scripts、deploy 範例與工具設定必須隨功能提交。`.gitignore` 僅排除依賴、本機環境及可重建產物；`.react-router` 由 typecheck／dev／build 產生，`build/client` 由正式 build 產生，測試瀏覽器由 Playwright 安裝。使用者不需要取得其他開發者的 `node_modules` 或環境檔；重建所需輸入與安裝指令在本儲存庫中。

Commit every source, style, locale, asset/license, fixture, script, deployment example and tool configuration with its feature. Ignore dependencies, local settings and reproducible output. Route types regenerate through framework commands, static delivery comes from the production build, and Playwright installs its browser separately.

### 載入與資產預算 / Loading and Asset Budgets

Route code 自動分割；AuthPanel 在切換到帳號畫面時載入，牛場景再由帳號 feature 按需載入。JourneyMap 在鄰近 viewport 載入，ProjectDetail 在開啟詳情時載入，ContactBubble／吉祥物在聯絡介紹揭露時載入（包含首次進場後的自動揭露）。`BackgroundField` 外殼與 pointer glow 隨頁面載入，只有可選 `BackgroundSignals` 格線／脈衝 controller 分開 lazy import，避免裝飾 chunk 延遲阻擋四邊進場與光暈。第一次載入可包含已進入 viewport 的地圖，不能把 lazy 當成一定不會首屏下載。Bootstrap 樣式由 `styles/bootstrap.scss` 選取網站使用的基礎、utilities、Dropdown、Offcanvas、Modal 與其樣式相依；React-Bootstrap 不載入 Bootstrap DOM bundle。

Route splitting is automatic. AuthPanel loads when entering the account view, which then requests its cow scene. Maps load near the viewport, details on opening and contact/mascot on disclosure, including the initial offer. The `BackgroundField` shell and pointer halo load with the page; only the optional `BackgroundSignals` grid/pulse controller is lazy. A delayed decoration chunk cannot hold back the inward frame or halo. A visible lazy map can load during initial viewing. `styles/bootstrap.scss` selects the used Bootstrap foundations, utilities, Dropdown, Offcanvas, Modal and their style dependencies; React-Bootstrap owns component behavior without the Bootstrap DOM bundle.

每次建置以 `verify-public` 的實際輸出檢查完整 client artifact；總產物大小不等於首屏傳輸量，hosting 壓縮與按需載入影響實際 bytes。驗證上限：全部 JS 1.05 MB raw／350 KB gzip、CSS 330 KB raw／60 KB gzip、字型 250 KB、map 250 KB、聯絡吉祥物 `cow-engineer-*` 1.25 MB。超限會停止接受新產物。

Every build verifies its actual complete client artifact through `verify-public`. Artifact totals are not first-view transfer claims; server compression and deferred loading affect transferred bytes. Acceptance ceilings are 1.05 MB raw/350 KB gzip for JavaScript, 330 KB raw/60 KB gzip for CSS, 250 KB for fonts, 250 KB for the map and 1.25 MB for the `cow-engineer-*` contact mascot. Output exceeding a ceiling is rejected.

帳號牛場景使用獨立的大型 `scene-sprite.svg`，只在帳號畫面載入；目前不列入聯絡吉祥物的檔名預算。延後下載已降低首頁資源需求，SVG 素材大小仍有後續精簡空間。三語 UI 字典也仍共同載入，並未按語言分 chunk。

The account cow uses a separate large `scene-sprite.svg`, requested only by the account view; the filename-based contact-mascot budget does not cover it. Deferred loading reduces startup work, while the SVG artwork remains a candidate for size reduction. All three UI dictionaries also remain bundled together rather than split by locale.

## 共用元件規格 / Shared Component Specifications

| 元件 / Component  | 規格 / Specification                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `SectionState`    | 接收已本地化的 message、busy、retryLabel、onRetry 與可選 children；呈現 loading／empty／error／舊資料更新提示，不讀業務 API。Receives localized copy and optional recovery; presents section state without owning domain requests.                                                                                                                                                                     |
| `SectionBoundary` | 以 resetKey 控制 render／lazy chunk 錯誤恢復，只影響自己的子樹；不顯示錯誤堆疊或 response。Contains render and lazy failures within its subtree, with safe retry and reset identity. Chunk recovery explicitly reloads the document; optional decoration may use silent fallback.                                                                                                                      |
| `LoadMoreControl` | 接收 busy、label、busyLabel、error、onLoad；loading 時禁止重複操作，失敗保留已有資料並由父層重試同頁。Receives pagination feedback and callback, prevents concurrent clicks and leaves cache ownership to its feature.                                                                                                                                                                                 |
| `Icon`            | allowlist 本地 Bootstrap inline SVG，currentColor 繼承主題；可選 label 同時提供 accessible name／title，裝飾預設 aria-hidden。可選 `pulse="chat"`／`"disclosure"` 重用共用呼吸樣式與停止政策，不在領域元件複製動畫。Renders bundled allowlisted SVG with inherited color, an optional accessible label/title and shared chat/disclosure pulse modes; decorative icons are hidden from assistive tools. |
| `SectionHeader`   | 接收 eyebrow、title 與可選 note；標題在左、補充文字靠右並右對齊，1150px 以下隱藏 note，保留原版響應式字級。不含常駐重新整理控制；失敗重試由 feature 的 `QueryStatus` 呈現。Receives heading copy and an optional right-aligned note, hidden at widths up to 1150px with legacy responsive title sizes. Failure recovery belongs to the feature's `QueryStatus`.                                        |
| `QueryStatus`     | 共用 loading／empty／error／stale 呈現，接收 query 旗標與翻譯 copy，不擁有 query。Shared request feedback receives flags and localized copy; the feature owns its cache.                                                                                                                                                                                                                               |

## 頁面規格 / Page Specification

`PortfolioPage(locale, nowMonth)` 是跨 feature 的組合層：依 URL 語言訂閱資料、建立各區獨立的 render boundary，並協調導覽、進場與共用摘要。`careerYearRange` 從完整 Journey 推導職涯年分範圍（包含教育，ongoing 使用 nowMonth），再以 yearRange 注入 ExperiencesSection；不能從經歷第一頁計算完整範圍。工作年資另用排除教育與重疊月份的 `workDuration`。route loader 使用獨立 QueryClient 產生 SSG snapshot，HydrationBoundary 交接成功資料，避免首屏重複請求。頁面不保存另一份 API 資料副本。

`PortfolioPage(locale, nowMonth)` composes feature boundaries and coordinates navigation, entrance and shared summaries. `careerYearRange` derives the year span from the complete Journey, including education and the explicit month for ongoing periods, then injects it into ExperiencesSection. A first experience page cannot define the complete span. Work tenure separately uses `workDuration`, excluding education and overlapping months. The route loader builds an isolated locale snapshot and HydrationBoundary restores validated queries without immediate duplicate reads. Domain DTOs remain in the query cache.

| 框架元件 / Framework component   | 規格 / Specification                                                                                                                                                                                                                                                                                                             |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AppProviders(locale, children)` | 組裝 Query、每個 locale 的 i18n instance、全站 NotificationProvider／NotificationEvents 與 AppearanceProvider；SSR client 隔離，瀏覽器 cache 跨語言持續使用。Composes isolated translations, Query service, global notification delivery/events and appearance, retaining the browser cache across locale navigation.            |
| `PortfolioRoute`                 | 驗證 URL locale，將 loader 的 dehydratedState 放入 HydrationBoundary，再傳 locale／UTC nowMonth 給頁面；SPA fallback 缺少快照時走 clientLoader。Validates route language, hydrates loader queries and supplies explicit UTC month, with browser loading for empty SPA fallback.                                                  |
| `Layout` / `App`                 | document lang 與驗證後的 locale 一致；可信外觀 bootstrap 在 CSS 前恢復偏好，本地 `favicon.svg` 沿用固定 dark／mint 品牌，不發外部請求。App 把 Outlet 放入 Providers。Own document language, trusted first-paint preferences and the local fixed-brand favicon; App provides the route outlet without external branding requests. |
| `ErrorBoundary`                  | root 僅呈現安全的路由錯誤（未知語言／地址等），不揭露 exception／stack；業務請求錯誤由 feature 區段處理。Presents safe routing errors without exception detail; domain request failures stay in their own sections.                                                                                                              |

## 集合與標籤規格 / Collection and Tag Specifications

| 元件 / Component          | 規格 / Specification                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ExpandableCollection<T>` | 首六筆、真實 total、hasMore、busy、error、renderItems 與載入 callback；可選 className 透過 `--collection-inset` 對齊領域卡片。展開隱藏 summary；鍵盤展開於資料準備後聚焦新增內容，收合卸下額外 DOM、還原 summary 焦點與可見位置，cache 留在 feature。Receives records and callbacks, with optional className/inset token for feature geometry. Expansion hides the summary and keyboard activation focuses new content after loading; collapse unmounts extras and restores the summary/focus while retaining feature cache.                                                                                                                                                                                                            |
| `ExpandableTagList`       | 有序 items、真實 total、可選 onLoadMore／onPreviewMore；`tagCopy` 共用本地化可見「N 項技能／N skills」與完整 accessible label，同字體／文案量測標籤加控制的總寬，不超過 75% row。僅當目前全部標籤與控制仍能放下，才通知 feature 補預覽；新資料須重新量測，busy／error／locked 時停止。標籤保留 7px gap、4px radius、虛線透明控制與 accent hover／expanded 狀態；category 的 CSS tokens 同時套用 inert 量測副本，margin 0、桌面 12px／手機 11px。Shares ordered localized tags within a 75% budget including disclosure width. Optional onPreviewMore fills spare capacity after measuring current inputs; the feature owns requests. Busy/error states stop continuation, replicas cannot widen the page, and observers are cleaned up. |
| `ExperienceCard`          | Experience DTO 與 locale，純文字摘要、optional detail 日期、完整 skills；不打 skills API。Renders one career DTO with optional supplementary period and complete local skill tags.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `ExperiencesSection`      | 接收 locale、可選 locked 與 page 從完整 Journey 注入的 yearRange；feature 擁有 Query 分頁，共用集合控制，不以第一頁推導職涯範圍。錯誤保留卡片，契約變更提供從首頁重新載入。Receives locale, optional pagination lock and a complete-index year range from the page. Owns ordered experience pages and independent recovery without deriving the career span from page one.                                                                                                                                                                                                                                                                                                                                                              |

## Project 元件規格 / Project Component Specifications

| 元件 / Component  | 規格 / Specification                                                                                                                                                                                                                                        |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ProjectCard`     | Project DTO／locale／可選 onDetail；呈現組織、inclusive 期間、專案名稱、純文字介紹與 nullable skills。Renders validated project copy and local nullable skill labels, with an optional meaningful-detail callback.                                          |
| `ProjectTimeline` | 只分組相鄰相同 startMonth，保留 API 順序；首六筆與展開區的月份群組各自呈現，選中範圍由外層集合統一管理。Groups only consecutive equal months, preserves backend order and retains the preview boundary; the owning collection provides one selection scope. |
| `ProjectsSection` | Query 擁有三頁等實際分頁，重用 `ExpandableCollection` 與 `usePagedCollection`，續頁失敗保留原內容。Owns project pages with shared disclosure and first-page recovery for invalid append data.                                                               |

經歷與專案時間軸共用 `--timeline-point-size` 的 12px 外徑，明確採 border-box，避免 Bootstrap reset 改變含邊框尺寸。選中的圓點實心，沿用 2.2 秒 ease-in-out heartbeat：光環由 6px 擴至 10px、柔光由 8px 至 22px，本體不縮放。CSS Modules 透過 `--timeline-point-keyframe` 引用同一份全域 keyframes，避免動畫名稱被局部改寫。

Experience and project timelines share an explicit 12px outer diameter through `--timeline-point-size`. The selected point fills and uses the shared 2.2-second ease-in-out heartbeat: its ring grows from 6px to 10px and glow from 8px to 22px without scaling the point. Modules resolve `--timeline-point-keyframe` to one global animation, preserving its name across CSS scoping.

每個 feature 的預覽與展開歷史位於同一選中範圍。預設只有原始第一筆啟用 heartbeat；fine pointer 移到其他卡片時，效果轉移至該日期圓點，離開後復原。展開歷史不新增第二個預設選中點；同月份的多張專案卡共用日期圓點。暫停／背景頁籤沿用共用動畫暫停政策，減少動態偏好停用裝飾動畫，內容與手動操作保持可用。

Each feature owns one selection scope spanning its preview and expanded history. Only the original first item pulses by default; fine-pointer hover moves the effect to that card's date point and leaving restores the default. Expansion adds no second default selection, and projects sharing a month share a point. Existing pause/hidden policies suspend decoration and reduced motion disables it without blocking content or controls.

`ProjectDetail(project,locale,onClose,localeControl?)` 只在開啟有實質內容的 project 時 dynamic import；以列表 payload 呈現 workflow、flow、technical、contribution、outcome，省略 null／空白欄位。skills 重用 `labelTags`／`tagCopy`／`ExpandableTagList`，不新增詳情或技能請求。流程以有序列表搭配裝飾箭頭呈現；對話框最大寬 680px、桌面內距 42px、760px 以下 30px／24px、最大高度 85vh，遮罩使用 token 透明度與 6px blur。Bootstrap 管理啟閉、Escape、backdrop 與還原焦點；共用 `cycleDialogTab` 補上 Tab／Shift+Tab 首末邊界循環，略過 hidden／inert／disabled 並尊重子控制已 preventDefault 的事件。選取只記錄 stable ID，切語言可保留對應專案。

`ProjectDetail(project,locale,onClose,localeControl?)` is imported only when meaningful detail is opened. It reuses the list payload and shared tag disclosure for skills, hides empty fields and issues no detail/skill request. Workflow steps form an ordered list with decorative arrows. The dialog retains a 680px maximum width, 42px desktop padding, 30px/24px padding at widths up to 760px and an 85vh height bound; its backdrop uses the semantic alpha token and 6px blur. Bootstrap manages activation, Escape, dismissal and restoration. Shared `cycleDialogTab` wraps first/last Tab boundaries, excludes hidden/inert/disabled controls and preserves a child control's prevented event. Stable-ID selection survives language changes.

## Skills 元件規格 / Skills Component Specifications

`SkillsSection` 把所有分類直接呈現在同一個 toolkit，不套用首六筆收合。`prefetchCategoryIndex` 在建置時透過共用 `fillNumberedPages` 續讀完整分類；瀏覽器自動補完缺頁，失敗停止且保留已驗證分類，提供同頁重試或契約重載。每列上下內距 23px、桌面標題欄 190px／欄距 30px，2200px 以上標題欄 220px；760px 以下單欄、欄距 12px。標題 15px、行高 1.65，標籤 gap 7px。

`SkillsSection` renders every category in one toolkit without a six-row disclosure. `prefetchCategoryIndex` uses shared `fillNumberedPages` to prepare the complete index; browser continuation fills missing pages, stops on failure and retains valid rows with local recovery. Rows preserve 23px vertical padding, a 190px desktop label column with a 30px gap, a 220px label column at widths of 2200px and above, and a single column with a 12px gap up to 760px. Labels use 15px text at line-height 1.65; tags retain a 7px gap.

`SkillCategoryRow` 以分類內 `skills` 第 1 頁初始化獨立 owner Query，不重抓已內嵌的頁面。內部收合預覽的「標籤＋More」最多佔標籤容器 75%；已載入標籤全部放得下且還有後頁時，才續讀下一頁填補可用寬度。填滿即停止；完整技能全部放得下就不顯示 More。展開與剩餘續頁保留明確操作，縮放重用 cache。Query key 包含 locale／ownerId／ownerType／size，頁碼由 pageParam 管理；label 不一致或 owner 失效提供局部重載，共用 UI 不讀 API。

`SkillCategoryRow` seeds an independent owner cache from embedded page one. The collapsed prefix and More control fit within 75% of the tag container. Only spare capacity with all loaded tags fitting triggers another page; filling the preview stops automatic reads, and a complete fitting list needs no More control. Expansion and remaining continuation stay explicit, resizing reuses cache, and owner keys include locale/type/size. Invalid owners or inconsistent labels provide local recovery; shared UI owns no API.

## 語言元件規格 / Language Specifications

`LanguageMenu(locale,busy,onChange,onOpen?)` 呈現三語選項、EN／简／繁角落標記、目前語言 check 與透明的選中列；選單最小寬 170px、內距 6px，開啟聚焦目前語言，ArrowUp／ArrowDown 在首末循環，Home／End 跳首末；瀏覽只移動焦點，不提交語言。處理既有鍵盤事件時保留 defaultPrevented，Escape／Tab 與選取仍交給 Dropdown／共用 dialog 焦點管理。鍵盤關閉或選取後還原觸發器焦點。可選 onOpen 在開啟前通知 page，讓明確操作優先於自動聯絡介紹；feature 不引用其他 feature。page 的 `useLocaleSwitch` 以隔離的短期 QueryClient 準備已讀頁數及 owner 範圍，全部驗證成功後才 hydrate 正式 cache 並切 URL。分類 preview 直接提供技能第 1 頁；已展開的第 2／3 頁逐頁續載。失敗保留原 UI／URL，快速選擇會取消過期請求；沒有有效資料的失敗區不阻擋切換。準備時續頁暫停，已展開集合與 selected project ID 保留；Modal 可注入同一語言控制。

`LanguageMenu` receives an optional page-owned onOpen callback and retains three choices, the EN/简/繁 corner badge, selected check and transparent current-language row in a 170px minimum-width menu with 6px padding. Opening focuses the current language; ArrowUp/ArrowDown wrap at both boundaries and Home/End jump to the first/last option. Browsing changes focus without committing a locale, preserves already-prevented events and leaves Escape/Tab/selection to the dropdown or shared dialog lifecycle. Keyboard dismissal or selection restores the trigger. The opening callback lets the page prioritize explicit controls over automatic contact without a cross-feature import. The page coordinator prepares loaded ranges in an isolated QueryClient and commits validated cache/URL together. Category previews seed owner page one; only previously read continuation pages are fetched. Failures preserve the visible language, later choices cancel obsolete requests and independently failed sections do not block switching. Pagination pauses during preparation while disclosure and selected project IDs are preserved.

## 外觀規格 / Appearance Specifications

`AppearanceProvider` 是 app 組裝的唯一偏好來源；`AppearanceMenu(onOpen?)` 呈現 mint／blue／amber／mist、blink frequency 0.4–2（step 0.1）、intensity 20–100（step 5）、pause／reset。設定面板沿用 300px 最大寬、18px 內距、標題分隔線、兩欄主題選項與 token 色票；按鈕為 4px 圓角、44px 高度，面板與觸發器間距 10px，短橫向螢幕可捲動至最後動作。開啟聚焦第一個 range，Escape 還原觸發器；具體的 Bootstrap bridge selector 保護內距與圓形觸發器，不依賴開發／正式 CSS 順序。Cookie 為優先、localStorage 為後備，彼此獨立且只儲存驗證值。初始 script 重用 normalization，在 CSS 前恢復 palette；SSR 不讀 storage。focused range 不因設定／語言更新重建；可選 onOpen 由 page 協調聯絡介紹的 dismiss，避免 pause 提前完成進場後覆蓋已開啟選單，背景停止政策不阻擋手動聯絡操作。

`AppearanceProvider` owns validated preferences. `AppearanceMenu(onOpen?)` supplies four palettes, bounded frequency/intensity, pause and reset in the original 300px panel with 18px padding, divided heading, two-column choices and semantic swatches. Buttons retain 4px corners/44px height, the disclosure offset is 10px and short landscape screens scroll to the final actions. Opening focuses the first range; Escape restores the trigger. Explicit Bootstrap bridge selectors protect padding and circular controls from CSS load order. Cookies are primary, localStorage is a fallback and each may fail independently. The first-paint script reuses normalization before styling without server storage access. Focused controls survive updates. The optional opening callback delegates contact dismissal to the page so finishing entrance through pause cannot cover an already-open menu. Motion policy does not block manual contact interaction.

`useThemeTransition(theme, reduced, visible)` 將主題繪製交由 appearance 領域的 `createThemeTransition` 管理；Provider 仍是唯一偏好來源。切換以一次 800ms 呼吸式漸變呈現：使用舊主題背景色的固定遮罩淡入 400ms，完全覆蓋時同步發出 prepare 並套用最新選擇，再淡出 400ms 顯露新色；遮罩完全移除後才發出 replay，重播原有四邊、sidebar／手機 header 與內容進場。page 透過 `subscribeThemeTransition(listener)` 訂閱 prepare／replay／cancel，卸載時取消訂閱；appearance 不持有 page DOM。背景、漸層、文字、SVG、陰影與選單一起過渡；遮罩 aria-hidden、pointer-events:none，不參與版面，不重建內容、重抓 API、跳動 scroll 或搬動焦點。themeTransitionTiming 共用時長／easing，沒有永久 transition:all。首次載入直接恢復已儲存主題，同色選擇及單純調整 speed／brightness／pause 不觸發換色或進場。

快速選色在覆蓋階段合併成最後選擇；若在顯露階段再選，完成當前漸變後才為最新顏色啟動下一次，期間保持進場 CSS 暫停，只在最後一次顯露完成後播放一次；覆蓋期間 Reset 回到原色時不重播。背景 Pause 保留換色與有限進場回饋；Reduced Motion 或文件隱藏則立即套色、清理遮罩及準備／播放中的進場，恢復時不補播。關閉／卸載／取消以 generation 防止舊動畫完成後重新覆寫顏色；動畫 API 不可用或拒絕時仍可直接套用主題並釋放進場。Cookie／localStorage 仍由既有 normalization／persistence 處理。

`useThemeTransition(theme, reduced, visible)` delegates palette paint to the appearance-owned `createThemeTransition`; the Provider remains the single preference owner. One 800ms breathing cycle fades an old-background-colored fixed veil in for 400ms, synchronously emits prepare and applies the latest selection while fully covered, then fades out for 400ms. Removing the veil emits replay for the original frame, sidebar/mobile header and content entrance. The page subscribes to prepare/replay/cancel through `subscribeThemeTransition(listener)` and unsubscribes on unmount; appearance owns no page DOM. Backgrounds, gradients, text, SVG, shadows and menus change together. The aria-hidden, pointer-transparent veil does not affect layout, remount content, refetch API data, change scroll or move focus. themeTransitionTiming supplies shared duration/easing without permanent transition:all. First paint restores saved colors immediately; identical selections and speed, brightness or pause changes alone trigger neither palette animation nor entrance replay.

Rapid selections coalesce before the covered midpoint. A selection during reveal waits for the current cycle to finish before the latest palette gets a fresh cycle; entrance CSS remains paused until the final reveal completes, then plays once. Resetting to the original palette while covered requires no replay. Background pause retains finite palette and entrance feedback; reduced motion or a hidden document applies colors immediately and removes both the veil and prepared/playing entrance, without replay on resume. Generation guards prevent cancelled/unmounted animation completions from overwriting current colors. Missing or rejected animation support retains direct theme selection and releases preparation. Existing normalization and cookie/localStorage persistence remain the data boundary. The implementation uses [Element.animate](https://developer.mozilla.org/en-US/docs/Web/API/Element/animate) and its finished promise.

## 聯絡元件規格 / Contact Specifications

`useContactDisclosure` 管理桌面／手機共用的一份 open／presented／appearing／idle／fade 狀態。穩定的 `dismiss()` 記錄明確使用者操作、關閉介紹且不搬動焦點，page 將它注入外觀／語言控制（含 Modal）；之後不再自動揭露，手動 toggle 仍可使用。`ContactIntroduction` 在開啟時才 lazy import `ContactBubble` 與吉祥物資產；Site 的 chatme 是聯絡介紹，不新增 chat API。共用 PixelBubble 外殼透過背景／內距／blur tokens 呈現漸層、chat bevel、3px backdrop blur 與便箋呼吸光暈。吉祥物為 104px、760px 以下 80px、380px 以下 64px。桌面定位在 icon 旁；手機外框固定在實際 header 下方 12px，尾巴貼近 chat icon，只有與面板水平重疊的 controls 才透過共用內部 inset 避讓正文與關閉按鈕；resize／scroll 重新定位，短視窗以共用高度 budget 在框內捲動正文。時間由 feature 的 contactTiming 統一管理並傳入 CSS；元件真正掛載才回報 presented，延遲載入不消耗正文的閱讀時間：首次自動顯示先淡入 400ms，再完整閒置 3000ms，最後淡出 400ms（約 3.8 秒）；手動開啟直接顯示，閒置＋淡出約 3.4 秒。淡入完成移除 appearing 狀態，不保留 opacity 的動畫最後一幀。框內 hover／可見鍵盤焦點取消 fade，離開／移出焦點後重新倒數；滑鼠焦點與只停在 chat trigger 不暫停計時。淡出中再次點擊 trigger 會恢復顯示並重啟完整閒置倒數；loading surface 換成正文時重新核對 hover／鍵盤焦點，不繼承已卸載節點的互動狀態。Escape／外部點擊關閉並按需復原焦點。API icon 只能映射可信本地檔，失敗仍提供 email。聯絡介紹保持 layer 60，控制／選單高於它、Bootstrap Modal 高於兩者，避免 popup 攔截真實選單點擊。停止背景只取消無限呼吸，不凍結揭露與淡出；Reduced Motion 則跳過淡入／淡出動畫，仍在閒置 3 秒後關閉。

`ContactBubble` 將 API 正文依換行分成純文字段落，忽略空白行，各段保留 7px 上下間距；桌面內距 15px／17px，手機基準 20px／14px／14px，上內距再加實際 controls overlap inset。關閉按鈕透過共用外殼的 close tokens 設定：桌面 32px 點擊範圍、距頂／右 7px，手機 44px 範圍、距頂 4px 加 overlap inset／距右 4px，兩者圖示均為 12px。CTA 圖示跟隨內文字級，桌面 13px／手機 14px；最小高度桌面 34px／手機 44px。Chat trigger 維持 44px 透明範圍與 28px SVG；滑鼠與鍵盤 focus-visible 均以圖示變色及雙層光暈回饋，不繪製矩形框。關閉後的焦點復原仍由 disclosure 管理；其他控制保留各自的 focus 樣式。

A single `useContactDisclosure` owns responsive open, presented, appearance, idle and fade state. Its stable `dismiss()` records explicit interaction and closes without moving focus; the page injects it into appearance/language controls, including the dialog. Later automatic offers are suppressed while manual toggling remains available. `ContactIntroduction` defers `ContactBubble`/mascot until disclosure and uses Site data without a chat API. Shared PixelBubble tokens provide the gradient, chat bevel, 3px backdrop blur and note breathing. The mascot is 104px on desktop, 80px up to 760px and 64px up to 380px. Desktop placement sits beside its trigger. The mobile shell starts 12px below the actual header, keeping its tail near chat; horizontally overlapping profile controls reserve an interior inset for copy and close rather than pushing the entire frame down. Resize/scroll reposition the panel and short viewports scroll copy within the shared height budget. Feature-owned contactTiming also supplies CSS duration. Timing starts when the mounted surface reports presented, so lazy loading does not consume the copy’s reading interval. Automatic introduction enters for 400ms, then waits the full 3000ms idle interval and fades for 400ms (about 3.8 seconds); a manual opening appears directly and closes after about 3.4 seconds idle/fade. Entrance releases its opacity frame when appearing ends. Hover or visible keyboard focus inside the bubble cancels fading, leaving or moving focus outside restarts idle. Pointer focus or focus on the chat trigger alone does not suspend dismissal. Activating the trigger during fading restores the mounted copy and restarts the full idle interval. Replacing a loading surface reconciles actual hover/keyboard focus instead of inheriting engagement from an unmounted node. Escape/outside dismissal retains conditional focus restoration. Trusted local icon mapping preserves email on asset failure. The introduction remains at layer 60, beneath explicit profile controls/menus and Bootstrap dialogs, so its popup cannot intercept menu activation. Pausing removes infinite breathing while leaving disclosure and fade operational. Reduced Motion skips entrance/fade animation but still closes after three idle seconds.

`ContactBubble` renders newline-delimited API copy as plain-text paragraphs, ignores blank lines and retains 7px vertical paragraph margins. Content padding is 15px/17px on desktop and starts at 20px/14px/14px on mobile, with the measured overlap inset added at the top. Shared close tokens provide a 32px desktop target at 7px top/right and a 44px mobile target at 4px right and 4px plus the overlap inset from the top; both use a 12px glyph. The CTA arrow follows the text size (13px desktop/14px mobile) with a minimum height of 34px on desktop/44px on mobile. The chat trigger keeps its transparent 44px target and 28px SVG. Pointer and keyboard focus feedback use color and a two-layer SVG halo without a rectangular outline. Disclosure still owns focus restoration; other controls retain their own focus styles.

`ContactFallback` 重用相同 disclosure 計時與 hover／鍵盤焦點政策。載入中提供 email 與關閉按鈕，等待正文完成後才倒數；chunk 失敗時顯示不可用提示、email、重載與關閉操作，跳過淡入並啟動正常閒置／淡出。

`ContactFallback` shares disclosure timing and hover/keyboard engagement. Loading retains email and close controls without consuming the final copy’s idle interval. A failed chunk provides an unavailable message, email, reload and close actions; it skips entrance and starts the normal idle/fade policy.

## 導覽元件規格 / Navigation Specifications

`Navigation` 接收 Site 品牌、active、compact、onCompact、onNavigate、endpoints 與可選 contact／onOpen callback。桌面 rail 在短 viewport 可捲動，收合以共用 duration／ease 平滑調整寬度、品牌、label、footer 與頁面 inset。compact icon 保留 accessible name；`NavLinks` 的 tooltip portal 在 rail 外 clamp，Escape、blur、resize 或 rail scroll 關閉描述，不搬動 link 焦點。760px 以下採 64px 固定 header 與 header 下方 250px Offcanvas；header／drawer／backdrop 分別為 layer 75／70／69，高於流動社群控制 65 與聯絡介紹 60，Bootstrap Modal 維持 1055。Bootstrap 管理焦點啟用、Escape、遮罩與焦點復原，Tab 邊界由共用 `cycleDialogTab` 補強。`onOpen` 由 page 注入 `contact.dismiss`，手動開啟導覽時收起介紹並抑制稍後自動揭露；未互動的首次入口仍正常運作。內部 `NavLinks` 重用同一份五區段設定。

`Navigation` receives branding, active section, collapse state, callbacks and optional journey/contact/onOpen inputs. A short desktop rail scrolls; collapse smoothly updates width, branding, labels, footer and page inset through shared motion tokens. Compact icons retain accessible names. `NavLinks` portals a clamped tooltip outside the rail; Escape, blur, resize and rail scrolling dismiss it without moving link focus. Widths up to 760px use a fixed 64px header and a 250px drawer beneath it. Header, drawer and backdrop use layers 75, 70 and 69, above scrolling social controls at 65 and contact at 60; Bootstrap Modal stays at 1055. Bootstrap owns focus activation, Escape, backdrop dismissal and restoration; shared `cycleDialogTab` handles Tab boundaries. The page supplies `contact.dismiss` through `onOpen`, so explicit navigation dismisses contact and suppresses later automatic offers while an untouched entrance retains its normal behavior. Both layouts share one section configuration.

`cycleDialogTab(event, surface)` 位於 `shared/lib/focus.ts`，補足最後一個 control 按 Tab 離開 document／瀏覽器 chrome 而無法觸發 focus enforcement 的情況。它只處理 Tab／Shift+Tab 首末邊界，尊重子元件已 preventDefault 的事件，排除 disabled、hidden、inert、負 tabIndex 與不可見元素，並保留正 tabIndex 排序。Bootstrap 仍擁有 modal 生命週期，helper 不註冊全域 listener、不接管 Escape 或關閉後焦點復原。

`cycleDialogTab(event, surface)` in `shared/lib/focus.ts` prevents the final control's Tab press from leaving the document for browser chrome without a focus event. It wraps only Tab/Shift+Tab boundaries, preserves child-prevented events, excludes disabled, hidden, inert, negative-tab-index and invisible controls, and respects positive tab order. Bootstrap retains modal lifecycle ownership; the helper adds no global listener and does not handle Escape or restoration after closing.

`useSectionNavigation` 統一錨點生命週期：明確導覽 push，scroll spy replace；保留 query 與語言 path，支援 intro／stack／toolkit 舊錨點。頁面不再使用第二套 ScrollRestoration。`useSectionNavigation` owns hash restoration and scroll tracking, preserves query and locale paths, pushes explicit navigation and replaces passive scroll positions, including legacy aliases.

## Journey 元件規格 / Journey Component Specifications

`JourneySection(locale)` 使用完整 Journey index；loading／empty／error 各自呈現，合法資料保留 API 順序，header summary 以不重複的城市數量呈現 badge。站點城市、組織與日期皆來自 DTO；完整資料供 page 計算年資、職涯年分範圍、側欄起終點與頁尾所在地。工作年資採 UTC、inclusive 月份、重疊工作只計一次、教育不計；職涯年分範圍包含完整 index 的教育。expected 固定區間保留舊政策，ongoing 使用 loader 傳入的 nowMonth。

`JourneySection(locale)` owns independent full-index feedback and ordered destinations; its header summary badge counts distinct cities. The page derives tenure, complete career-year bounds, endpoints and footer location from this index. Work tenure uses UTC/inclusive month intervals, counts overlapping employment once and excludes education; the career-year span includes education. Expected fixed periods preserve the original policy and an explicit loader month keeps ongoing calculations consistent across build/hydration.

| 元件 / Component              | 規格 / Specification                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `JourneyMap`                  | 鄰近 viewport 才 lazy import map／本地 atlas；保留 caption 狀態 dot、Looping／Paused、Play／Pause 文字與最後站點座標／下一章。SVG marker 支援鍵盤／觸控、stable-ID 選取、量測 label 避讓；active destination 保留呼吸 halo；手機地圖高 220px，1700px 以上採 500–760px 流動高度。Lazily loads the trusted atlas, retaining caption status, playback text and final-destination coordinates/next chapter. Accessible markers use stable selection, measured label collision handling and active-destination breathing. Mobile maps are 220px high; screens from 1700px use a 500–760px fluid height. |
| `JourneyAtlas(finalCountry?)` | memo 化可信本地 atlas；country DOM 不隨播放、浮框或 locale re-render 重建，只有最後一筆已驗證 countryCode 變更才更新國家裝飾，避免呼吸 paint 被 React 重設。Preserves trusted atlas nodes across playback, popup and locale rerenders; only a changed validated final-country code updates country decoration.                                                                                                                                                                                                                                                                                     |
| `StopCarousel`                | 接收 items、selectedId、locale、onSelect 與可選 onBlur；量測 overflow 後才顯示箭頭，邊界禁止無效方向。ArrowLeft／ArrowRight／Home／End 移動焦點並只捲動 strip，Enter／Space 選取；blur 可關閉浮框，map chunk 失敗仍可操作。Receives ordered destinations, selection and optional blur callback; measured overflow controls arrow visibility/boundaries. Arrow/Home/End navigation focuses and scrolls only the strip; activation selects a chapter, with a usable map-failure fallback.                                                                                                            |
| `CityBubble`                  | 接收 Journey DTO、locale、anchor/container/bottom refs，clamp 浮框並避開站點列；Escape／外部點擊、滑鼠離開或焦點移出會關閉，但 anchor／浮框之間移動保留內容，touch 不套用 hover leave。Renders escaped detail above the strip; Escape/outside dismissal, mouse leave and blur close it while movement between popup/anchor remains usable and touch avoids hover dismissal.                                                                                                                                                                                                                        |
| `PixelBubble`                 | 共用外層 18px／6px 與內層 12px／6px 階梯裁切、6px 四邊包邊／內陰影、tail、closeLabel／onClose 與 children；tail 為純裝飾，不攔截觸發器的 pointer 操作；background／padding／backdrop 與 close 幾何／色彩 tokens 可由領域覆寫，未設定沿用共用預設。Shared outer 18px/6px and inner 12px/6px stepped clips preserve the 6px outline and bevel around all corners. Tail, close control and children share one shell. The decorative tail never intercepts anchor pointer actions; optional surface and close geometry/color tokens retain safe defaults. Features own positioning and lifecycle.      |

`useAnchoredPanel` 重用 `floatingPosition`，可注入單個／多個上方 ref 與下方站點列作為保護範圍；上界取目前各元素底部的最大值，由同一個 observer 與定位計算追蹤。`CityBubble` 依 `--floating-max-height` 限制長文字並內部捲動，初次定位在 paint 前完成；覆蓋自身 anchor 時隱藏 tail，避免遮住播放控制。ResizeObserver 與 scroll／resize listener 在卸載時清理。

`useAnchoredPanel` shares `floatingPosition` and accepts one or several optional upper refs and a lower surface. The maximum current bottom edge of the upper surfaces forms one protected boundary, tracked by the same observer and position calculation. `CityBubble` consumes the available height token to scroll long content within those bounds, positions before first paint and suppresses its tail when covering its own anchor. Observers and scroll/resize listeners are cleaned up on unmount.

地圖右下角北向標示以 N 與共用 Bootstrap `arrowUp` SVG 分兩列呈現，圖示沿用 1em 尺寸並視為裝飾。

The bottom-right north indicator presents N above the shared Bootstrap `arrowUp` SVG, preserving its 1em size and decorative semantics.

`JourneySummary(entry, locale, index, count, nextCity)` 共用組織／職稱／城市與期間呈現；SSG 或 map chunk 故障時，站點選取仍會更新可讀的職涯資訊，完整 map 重用同一元件。`JourneySummary` shares readable chapter information between static/failure fallback and the enhanced map, keeping destination detail usable without its optional atlas.

旅程播放 / Playback：`useJourneyPlayback` 使用單一可取消 rAF 與 ref clock；每幀只更新 SVG，章節／phase 才更新 React。沿用 hold 1500、flight 5200、arrival 500、finalHold 3000ms；最後 500ms 先畫亮目的地，summary／strip／ARIA selection 在完整 7200ms 後才切換章節。最後一站停留後回第一站，不畫不存在的返程。手動選站暫停，Restart 回第一站；hidden 停止排程並保留 elapsed，reduced-motion 停用自動動畫，unmount 清理。`atlasViewport` 延展 viewBox 以涵蓋所有 API 座標和超寬畫面。

`useJourneyPlayback` owns one cancellable animation frame loop and a ref clock. Frames update SVG directly; React updates only chapters and phases. Original hold/flight/arrival/final durations are preserved. The arrival destination highlights during the last 500ms while chapter summary/strip/ARIA selection remain on the source until the complete 7200ms interval ends. The final stop rests before restarting without a fabricated return arc. Manual selection pauses, restart selects the first stop, hidden documents stop scheduling and reduced motion disables automatic flight. The atlas viewport expands for all supplied coordinates and wide displays.

## Site 元件規格 / Site Component Specifications

| 元件 / Component  | 規格 / Specification                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ProfileOverview` | 依 locale 訂閱 Site，姓名／標點採 accent、問候維持 text，eyebrow 保留 24×2px tiny line；tenure／controls 與可選 controlsRef 由 page 注入；controlsRef 讓聯絡框共用實際按鈕列邊界，onExplore 交共用導覽。社群控制以 layer 65 高於可選聯絡介紹，main 不建立限制它的 stacking context；1150px 以下維持 positioned normal-flow，760px 以下包行並調整字級／教育資訊，超寬螢幕放大字級，中文保留 -1px 字距。只允許安全 web／email 連結。Subscribes to Site with accented name/punctuation and a tiny rule, injected tenure/controls, an optional controlsRef for contact placement and shared navigation. Social controls remain above optional contact at layer 65 without a trapping main stacking context. Responsive socials retain positioned normal flow up to 1150px and wrap with mobile type up to 760px; wide layouts scale type and Chinese retains tighter spacing. Links are validated and API text is escaped. |
| `Brand`           | 共用 sidebar／mobile 品牌；site 無資料仍可導覽首頁。Shares the API wordmark and home callback with an empty-data fallback.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `SiteFooter`      | 依 Site 與注入的最後所在地顯示 brand.title／titleSub、copyright、tagline 與 email；不 import Journey。Displays both brand title and subtitle with maintained copyright, tagline/email and an injected final location; no Journey dependency.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

## API 契約與故障政策 / API Contracts and Failure Policy

六支 endpoint 由各 feature 的 Zod schema 驗證；共用分頁固定 `{items,total,pages,page,size}`，size=6。`items:null`、重複 ID、不合法日期或頁數算術皆拒絕進入 Query cache。可選欄位的 null 語意保留於 DTO，僅在呈現時轉換。HTTP 請求預設 10 秒 timeout；network、timeout、5xx 最多自動重試一次，取消不呈現為服務故障。不同 section 獨立載入；更新與續頁失敗保留已驗證資料。

Each feature validates its six-endpoint DTOs with Zod. All pagination uses the same five-field contract and size six. Null items, duplicate identities, invalid calendar periods and inconsistent page arithmetic cannot enter the query cache. Nullable DTO semantics are preserved. Reads time out after ten seconds and transient failures retry once. Sections load independently and retain validated content when refresh or continuation fails.

靜態預覽 / Static preview：`npm run preview` 以靜態檔案優先，`/api` 由本機 server 單獨轉交公開 API，未知 API 不回傳 SPA HTML。API_PROXY_TARGET 用於 preview／dev；API_BUILD_TARGET 僅供 server loader，瀏覽器始終使用 VITE_API_BASE_URL。`npm run preview` serves static files first and proxies public reads under `/api` separately, preserving API error status instead of returning SPA HTML.

## 裝飾與進場規格 / Decoration and Entrance Specifications

`BackgroundField(paused,speed,compact)` 是隨 page 載入的非互動外殼，不依賴 API；四邊、靜態格線 fallback 與 pointer glow 不等待 lazy chunk。可選 `BackgroundSignals(paused,speed)` 依 viewport 量測格線，最多 400 個十字與 6 個同時脈衝，重建／卸載清理 ResizeObserver、timer、rAF 與 Web Animations。強度沿用 appearance token；hidden／reduced-motion／使用者 pause 停止排程。Pointer glow 是 fixed radial-gradient，僅支援 mouse＋fine pointer，事件合併為每幀最多一次 paint、無閒置 loop；離開 viewport、blur、touch 或停止政策會隱藏，慢／失敗的 signals chunk 不阻擋它。

`BackgroundField(paused,speed,compact)` is an eager, noninteractive page shell with no API dependency. Four edges, a static grid fallback and the pointer halo do not wait for a lazy chunk. Optional `BackgroundSignals(paused,speed)` measures viewport geometry, caps allocation at 400 crosses/six pulses and releases observers, timers, frames and Web Animations on rebuild/unmount. Shared appearance intensity and hidden/reduced/paused policies control scheduling. A fixed radial-gradient halo uses mouse/fine-pointer events with one coalesced paint per frame and no idle loop; viewport exit, blur, touch or suspension hides it. Slow or failed signals do not block the halo.

`useEntrance(root,ready,reveal,paused,subscribe)` 重用 page 的 `createEntrance(surface)` 管理初次進場與主題重播：上下框線 650ms、左右 ruler 650ms＋100ms 延遲、signals 淡入 800ms；內容沿用原本淡入節奏，450ms＋750ms 延遲，左側 rail／手機 header 450ms＋800ms 延遲。prepare 設定原有 data-entering marker 與 `--entrance-play-state:paused`，replay 僅將同一組 CSS 動畫釋放為 running；1400ms 後清理 marker／變數。初次進場完成才提出一次聯絡介紹；主題重播沒有聯絡 callback，也不重新掛載 component。初次 hidden／reduced-motion／pause 立即完成，恢復時不重播；主題重播只因 hidden／reduced-motion 取消，背景 Pause 不阻擋它。較晚到達的 API 僅補上初次聯絡介紹，不重啟四邊或導覽；手動聯絡操作優先。SSR／無 JavaScript 保持可讀，裝飾失敗不影響資料與操作。

`useEntrance(root,ready,reveal,paused,subscribe)` reuses the page-owned `createEntrance(surface)` for startup and palette replays. Upper/lower edges take 650ms, side rulers add a 100ms delay, signals fade over 800ms, content retains its original entrance cadence over 450ms after 750ms, and rail/mobile header runs 450ms after 800ms. Prepare sets the existing data-entering marker and `--entrance-play-state:paused`; replay releases the same CSS animations to running. The 1400ms deadline removes both marker and variable. Only startup supplies the one-shot contact callback; palette playback does not remount components or offer contact. Hidden/reduced/paused policies immediately finish startup without replay on resume; palette replay cancels for hidden/reduced motion while background pause leaves it operational. Late API data may offer initial contact but does not restart the frame/navigation. Manual interaction takes priority, SSR/no-JavaScript content remains readable and decoration failures leave operations usable.

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

- [Bootstrap](https://getbootstrap.com/docs/5.3/getting-started/introduction/)、[React-Bootstrap](https://react-bootstrap.github.io/docs/getting-started/introduction/)與[Bootstrap Icons](https://icons.getbootstrap.com/)
- [Zod](https://zod.dev/)與[react-i18next](https://react.i18next.com/getting-started)
- [import-x 依賴路徑規則](https://github.com/un-ts/eslint-plugin-import-x/blob/master/docs/rules/no-restricted-paths.md)
