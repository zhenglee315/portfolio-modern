# 程式品質與驗證

本文件記錄品質分析 Q01–Q10 的處理方式、可重現入口與支援範圍。前後端 README 分別擁有部署、API 與產品行為契約。

| 項目 | 修正                                                                                                           | 驗證                                                                 |
| ---- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Q01  | 明確區分 PostgreSQL 完整部署與 SQLite 工具／模型測試；不支援的完整遷移在連線及 DDL 前拒絕                      | 空庫升級、既有帳號／密碼雜湊／網站／登入紀錄保留、重跑 head 冪等     |
| Q02  | 解除正式測試的忽略規則並加入明確的維護目錄例外，正式回歸移入 backend/tests，包含離線 GeoIP fixture 與授權      | pytest 可獨立執行資料庫核心測試；隔離 Redis／PostgreSQL 整合         |
| Q03  | 正式加入 Vitest、Testing Library、Playwright 與鎖定依賴，單元與真實 API 測試分開                               | 登入、註冊、管理編輯／刪除、監控斷線重連與授權、三語及響應式         |
| Q04  | Python 統一 Black 120、Ruff、漸進式 mypy、pytest 入口，包含前端七支 Python 產生器                              | backend/check.py；前端既有嚴格 TypeScript／ESLint／Prettier／build   |
| Q05  | 監控按採樣、聚合、Socket.IO、supervisor 拆分；Auth 按 session／登入／註冊，Management 按資源                   | 保留公開 class、交易 ownership、日誌名稱；匯入順序與工具依賴邊界測試 |
| Q06  | MonitoringPanel、AuthPanel、DataTable 拆為控制器及各自畫面區塊                                                 | 原有行為與瀏覽器矩陣、表單取消、表格排序／分頁／匯出                 |
| Q07  | validateNumberedPage 共用分頁算術及 ID 唯一性，domain 保留不同 size 政策                                       | 空頁、末頁、越界、大頁碼、重複 ID、不一致總數                        |
| Q08  | shared/lib/timestamps.ts 統一 UTC，監控明確標籤，秒在邊界轉毫秒                                                | 三語、時區偏移、午夜、epoch 0、缺少／無效值；耗時仍用單調時鐘        |
| Q09  | 套件以 **all** 宣告 API，星號匯入來源維持明確公開清單；import 依屬性以 Pack 分隔線分組                         | 靜態邊界測試、不同匯入順序、套件匯出類別一致性                       |
| Q10  | 修正 errorCode 對 validation array 的說明及 model_where_cond 的 _intvl 範例；補充新控制器與依賴 ownership 註解 | 原有錯誤解析測試、lint、型別與回歸                                   |

## 後端

Auth 與 Management 的實作檔採 `module_<用途>.py` 命名，由各自的 `module/__init__.py` 直接匯出業務 class。Auth 使用 base、register、session、sign_in；Management 使用 base、roles、users、sites、logins、state 及 permission。

從 `backend/` 執行，單元測試使用暫存 SQLite／替身，不使用部署資料：

```sh
uv sync --locked
uv run --locked check.py
# 只跑測試：
uv run --locked pytest
```

完整整合需要可刪除的 Redis 與 PostgreSQL。變數只在測試程式使用；PostgreSQL 測試自行建立／移除表或 schema，Redis 使用測試命名空間。整合測試的資料庫及 Redis DB 必須與同時執行的 QA／開發服務分開，避免排程流量混入歷史請求測試：

```sh
SCHEDULER_TEST_REDIS_URL=redis://127.0.0.1:16389/0 \
MONITOR_TEST_REDIS_URL=redis://127.0.0.1:16389/0 \
SOCKETIO_TEST_REDIS_URL=redis://127.0.0.1:16389/0 \
PLATFORM_PATCH_TEST_POSTGRES_URL=postgresql+asyncpg://test_user@127.0.0.1:16439/disposable_test \
  uv run --locked check.py --integration
```

`--integration` 缺少任一變數會失敗，不把跳過案例視為完整驗證。一般 pytest 不提供服務變數時會明確列出 skipped。測試服務應使用獨立容器／埠，不指向開發或正式資料。

mypy 目前覆蓋十支核心模組，清單維護於 pyproject.toml：公開 handle、遷移支援政策、IP／GeoIP、五支監控實作及分散鎖。未宣稱整個 Python 專案已採嚴格型別；所有 Python 與前端產生器仍接受共同格式、lint 與行為檢查。

完整應用啟動仍從 `backend/` 執行 `uv run --locked manage.py`，同時啟動 FastAPI 與 APScheduler。SYSTEM/tools 及 SCHEDULER/SYSTEM/tools 不匯入 COMMON；lifespan／啟動器注入 Redis、SQL 觀察器及 GeoIP 準備函式，保留既有 session ownership。

## 前端

從 `frontend/` 執行：

```sh
npm ci
npm run check
npx playwright install chromium
npm run test:e2e
```

`check` 包含 TypeScript、ESLint、Prettier、共用文件索引、Vitest 與正式 build。瀏覽器入口使用 Chromium，自行啟動 fixture API（4181）與 SSR 預覽（4173），不使用開發後端。瀏覽器測試以 example.com 經正式的驗證／gzip／原子發布流程建置隔離的 .test-build/，與正式 build/ 分開。6× CPU／4G 效能門檻先獨立執行，再進行其餘矩陣，避免並行瀏覽器干擾。結果輸出至忽略的 test-results/。

真實 API 案例另有明確入口，先以 manage.py 啟動隔離後端並建立測試帳號，再執行：

```sh
PORTFOLIO_API_SMOKE_TARGET=http://127.0.0.1:4186 \
PORTFOLIO_SMOKE_EMAIL=operator@example.com \
PORTFOLIO_SMOKE_PASSWORD=isolated-test-password \
  npm run test:integration
```

## 邊界

SMTP 寄送、密碼重設及管理新增仍是占位功能；Profile 已補齊前端編輯、五支本人 GET 與整頁交易儲存 POST，另有資源 CUD／排序 API。啟用前須確認並套用 `e42b19a7d603`，本次隔離測試不代表原資料庫已升級。record_request 是觀測歷史：尚未送入 Redis 的程序記憶體資料仍有中斷遺失窗口；這次保留原有容量、溢位計數及提交後 ACK 契約。草地牛素材保留可重組的原稿與來源，只整理 Python 產生器格式。

一次性完整執行證據保留在忽略的 agent/quality-fixes-2026-10-17/；正式測試原始碼、配置與依賴隨專案維護。

## 本次結果

2026-10-17：後端 1,017 項、前端 772 項單元＋7 項真實 API、543 項瀏覽器矩陣＋4 項真實 Node／Vite 操作全部通過，沒有跳過或失敗。另驗證 86 項 HTTP、5 項 WebSocket 代理與草地牛 144 組／11,762 條向量路徑。

雙 manage.py 實例中同一 job 最大併發為 1；實際每分鐘排程將 24 筆請求全部入庫，pending=0。手機 6× CPU／4G 模擬 LCP 為 1352 ms，低於原 2,500 ms 門檻。正式與測試產物都走相同驗證及 gzip 流程，分開存放。

Black／Ruff、十個核心模組的 mypy、TypeScript／ESLint／Prettier、195 個 shared 匯出索引、正式 build，以及 14 份 README 的 354 個本地連結均通過。保留 FastAPI TestClient 與 fastapi-pagination 的第三方 API 棄用警告，未關閉警告；測試沒有功能錯誤。一次性詳細證據見 agent/quality-fixes-2026-10-17/verification-summary.json。

2026-10-18 發布驗證：後端完整整合 1,022 項、前端 772 項單元與 7 項真實 API、543 項瀏覽器矩陣及 4 項真實 Node／Vite 操作全部通過，沒有跳過、失敗或不穩定重跑。另通過 86 項 HTTP／SSR、5 項 WebSocket 代理、草地牛 144 組／11,762 條路徑及 4 份重建模組比對。兩個 manage.py 實例同一 job 最大併發為 1，實際每分鐘排程寫入全部 24 筆請求，pending=0；手機 6× CPU／4G 模擬 LCP 為 1,368 ms。格式、lint、十個核心模組型別、正式 build 與 14 份 README 的 356 個本地連結均通過。詳細證據保留於忽略的 agent/release-2026-10-18/verification-summary.json，專用測試服務已關閉。

## Monitor Overview 發布驗證（2026-10-18）

本次新增 Monitor 日期彙總／登入國別及 Localhost／採樣健康 API、SYS Redis 開機成功與失敗累計、Worker 程序計數、內容插槽總覽與統一導航。

- 後端完整一般測試：897 passed、170 skipped，另有 240 subtests passed。跳過項目需要明確設定隔離 Redis／PostgreSQL；本次未宣稱完整外部服務整合通過。Black、Ruff、既有十支核心及新增三支 Monitor 模組的 mypy 通過。
- 前端 `npm run check`：780 項單元、TypeScript、ESLint、Prettier、195 個 shared 契約索引及正式建置通過。監控／帳號選單／跨頁導航／權限／三語／響應式與冷啟動共 80 項 Playwright 測試通過。
- 手機 6× CPU／4G 場景：基礎初始 JS gzip 252.7KiB、LCP 1,380ms、CLS 0.00082。三語監控／選單文案仍在共用字典，JS 門檻由 250 記錄為 256KiB；LCP／CLS 門檻不變，公開頁未載入監控或離屏大型 feature。
- 17 份 README 同步新契約，補正 request 歷史說明；五張監控文件圖使用實際應用與隔離的合成資料，可透過 `npm run docs:monitor` 重建。截圖不含私人帳號或正式請求資料。

正式環境部署前須執行 migration `c6f37a92d104`；啟動仍使用 `backend/` 的 `uv run --locked manage.py`，同時啟動 FastAPI 與 APScheduler。

### Profile 前端驗證 / Profile frontend validation

2026-10-19 草稿預覽調整：導航維持四個編輯分頁，取消左側的預覽按鈕開啟共用 modal，以未送出草稿驅動主頁原有元件。測試涵蓋 modal／專案詳情／聯絡氣泡的焦點返回、獨立專案分頁、不讀公開舊內容、不提前儲存、顯示狀態與三語切換，以及 English 右側提醒的原有淡入／hover／cookie 行為。848 項前端單元測試、相關手機／桌面瀏覽器測試、型別、lint、格式與建置檢查通過。

Profile 的公開六支 GET 保留，編輯器改以五支本人 GET 讀取三語內容（專案每頁 6 筆，詳情按需載入），並以單一 revision-checked POST 儲存。單元測試涵蓋組織／詳情／座標、語言缺漏、完整私有來源、實體引用、日期／聯絡驗證、帳號隔離、取消、失敗不重送及三語字典；瀏覽器測試另涵蓋 15 筆專案按頁載入、未載入內容保留、跨頁選取與批次刪除、重新整理後保留後端結果、舊草稿復原、版本衝突、儲存鎖定、權限、各分區 CUD、共用技能、旅程同步、拖曳與 390／820／1600／2560px 排版。後端涵蓋 23 個新增操作、owner／即時權限、交易回滾、提交後快取失敗與正規化技能；migration 另在獨立 PostgreSQL schema 驗證既有資料搬移。首次前端階段的首頁 6× CPU／4G 實測基礎 JS gzip 為 256.4–257.8KiB、LCP 約 1.4 秒、CLS 0.00082。自動聯絡氣泡是否在量測截止前完成載入會影響數值；258KiB 上限保守包含該氣泡及共用導覽、API query chunk，明確驗證首頁不下載 Profile 編輯器／文案／範例與離線地圖；LCP、CLS 門檻維持不變。完整 client 產物的有界預算另包含新增的路由與樣式，並由 verify-public 檢查。

2026-10-18 本次 CUD 驗證：後端一般檢查 928 passed／171 skipped，Black、Ruff、十支核心模組 mypy 通過；另外在專用 PostgreSQL 資料庫執行 migration 與內容編輯測試共 20 passed。前端 `npm run check` 通過，包含 837 項單元測試、型別、lint、格式、shared 契約索引與正式建置。Profile／地點／API 來源／帳號選單共 43 項 Playwright 通過；另一次獨立手機冷載入檢查通過，初始 JS gzip 256.54KiB、LCP 1,404ms、CLS 0.00082，沒有提前載入 Profile 或地圖 chunk。這批瀏覽器流程使用隔離模擬 API。

之後依使用者指示，以 `uv run --locked alembic upgrade head` 將原本機 PostgreSQL 由 `d7a24e91b630` 升級至 `e42b19a7d603`。遷移前完整備份已驗證可讀，遷移後比較 12 張原有 Portfolio 表的既有欄位資料均保留；新增技能記錄與關聯另行建立。前後端已啟動，OpenAPI 實際註冊 29 個 Portfolio 操作，三語六支公開 API 皆正常回應、未登入的本人 GET 回 401，完整編輯 document 亦通過嚴格驗證。瀏覽器登入頁正常；原帳號登入後的實際儲存尚未驗收，未修改原內容來製造測試結果。

### 20 帳號完整驗證（2026-10-19）

依使用者指示，在原本機 PostgreSQL 建立 20 個具有唯一 QA 前綴的合成帳號，透過真實登入與 Profile 頁逐一編輯四個分區、三語內容、技能排序、經歷／Journey 地點與專案詳情，儲存後重載驗證。每個帳號再透過真實 HTTP 執行資源 CUD、排序、分類成員與使用中技能保護；共 20 次整頁 UI 儲存、360 次個別資源寫入。管理頁另驗證 20 個帳號的角色指派、20 個網站發布／取消發布、帳號停用／恢復，並以批次刪除精確移除指定的 10 個 QA 帳號；其餘 10 個保留、維持啟用且未公開。QA 管理帳號最後自我降為一般編輯權限，驗證管理 API 回 403、本人內容仍可讀。沒有修改或刪除原有共用角色。

- 完整後端檢查：1,099 passed、0 skipped，啟用獨立 PostgreSQL／Redis／Socket.IO／排程整合；Black、Ruff、十支核心模組 mypy 通過。整合用容器與測試資料庫已清理，原服務保留。
- 前端完整檢查：837 項單元、型別、lint、格式、shared 契約與正式 build 通過；另 7 項前端對真實 API 契約通過。完整瀏覽器矩陣 634 項通過；修正文案及加入搜尋導航案例後，另 36 項 Profile／地圖／搜尋聚焦重驗通過，與矩陣有重疊而不加總。真實環境包含 20 個 owner 案例、1 個管理案例與 3 個監控／手機／權限後續案例。
- 原帳號／角色／作品集 16 張表的每筆原資料雜湊均保留；被刪除 QA 帳號的 site_id 關聯與登入紀錄殘留為 0，登入均回 401。跨 owner 修改回 404，非法日期／座標回 422 且不改動 revision；保留帳號的三語與內容契約重新驗證通過。
- 本次修正 Profile 三語提示，移除「儲存只留在瀏覽器」的過期描述。管理新增、SMTP 實際寄信及密碼重設仍未實作，未將占位畫面視為功能通過。

逐帳號結果、畫面、機器可讀摘要及原始測試紀錄保留於忽略的 `agent/full-verification-2026-10-19/`；`report.html` 與 `accounts-results.csv` 不含密碼。測試憑證以 0600 權限另存私人 manifest。真實測試使用 `frontend/playwright.live.config.ts` 與 `frontend/tests/live/accounts.spec.ts`，僅接受明確提供的 20 帳號 QA manifest；已完成的同批帳號有 10 個被刪除，不應直接當作全新 fixture 重跑。

## 前端七項檢查（2026-10-19）

本次檢查涵蓋整個前端的型別、依賴邊界、循環引用、格式、單元、建置與 Chromium 瀏覽器矩陣；另檢視主要共用元件、正規化資料及公開／草稿呈現的重用方式。檢查結果是目前已驗證流程的證據，不代表所有未實作功能或真實後端整合已完成。

| 項目     | 結果               | 證據                                                                                                                                                                                                                                                                                        |
| -------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 模組化   | 已確認並清理       | `app/routes/pages → features → shared` 由 ESLint 檢查；跨功能從公開入口引用。卡片、滑出操作、拖曳、分頁與工作區導航共用既有元件，公開畫面／草稿預覽共用 View。移除已無呼叫者的 `OrderButtons`、樣式及三語舊文案；非平凡頂層函式的完全相同 body 掃描沒有發現重複。                           |
| 標準化   | 已確認並修正       | 嚴格 TypeScript、ESLint、Prettier、共同主題 tokens／控制項及翻譯；分頁沿用 `items/total/pages/page/size`。`EditorPagination` 改由自己的 CSS module 管理，不再借用內容語言選單樣式；筆數選單沿用 DataTable 使用的 Bootstrap 控制項。                                                         |
| 正規化   | 已確認             | 實體以 ID record 保存，order 與關聯分開；技能只有一份實體。Zod 驗證 ID／順序／引用一致性；日期與分頁使用共用契約。`revision`／`projectScope` 保留未載入專案，hydrate 同步基準且不覆蓋修改或復活刪除資料。                                                                                   |
| 可維護性 | 已改善             | 拆開元件樣式責任、移除失效控制；lint 與 README 驗證共用 `scripts/feature-entries.mjs`，包含 Auth 的既有額外公開入口，避免兩份允許清單漂移。功能狀態與事件清理由各自 controller／hook 擁有。                                                                                                 |
| 註解     | 已補齊             | 全 `src` 的 191 個具名 TSX 匯出函式均有 JSDoc；本次補齊欄位／預覽用途及 route loader、headers、錯誤恢復、嵌入焦點等邊界。資料合併、取消與清理規則另有實作註解。此數字不表示每個型別／每行程式都應有重複註解。                                                                               |
| README   | 已補齊且自動檢查   | [Shared](../frontend/src/shared/README.md) 196 個、[Feature](../frontend/src/features/README.md) 117 個、[Profile](../frontend/src/pages/profile/README.md) 45 個匯出契約；`check:docs` 直接讀 AST，缺漏會使檢查失敗。Feature 索引包含 13 個功能及 Auth 既有公開子入口。                    |
| 功能     | 已驗證目前支援流程 | 72 份單元檔案共 853 項通過。完整 694 項瀏覽器矩陣先取得 677 passed，另 17 項仍預期舊側欄；確認失敗皆來自新增 Profile 分組後的舊數量／文案斷言，改成獨立於產品程式的共用預期 fixture，保留權限限制。修正後包含全部 17 項及側欄回歸的 28 項重驗全數通過；這 28 項與完整矩陣重疊，不另行加總。 |

可重現入口（由 `frontend/` 執行）：

```sh
npm run check
npm run test:e2e
npx playwright test tests/e2e/management-access.spec.ts tests/e2e/monitor-overview.spec.ts tests/e2e/management.spec.ts tests/e2e/sidebar-unification.spec.ts --project=management --project=management-contracts --project=public --no-deps --grep 'established flag policy|monitor-only accounts|monitor content retains|settings reuse the background|share expanded/compact|Profile and management'
```

手機 360×800、冷快取、6× CPU／4G：LCP 1,400 ms、CLS 0.000815、初始 JavaScript gzip 257.75 KiB，沒有提前載入 Profile／大型區塊。完整 client 為 JS 1,586,006 bytes／gzip 524,408 bytes、CSS 426,676 bytes／gzip 89,247 bytes，均在既有預算內。本次沒有調高效能或產物上限。

## 前後端完整操作測試（2026-10-19）

本輪使用全新的 PostgreSQL／Redis 容器及合成帳號。瀏覽器操作資料庫與後端整合測試資料庫分開，Redis 也分離 DB；API 與排程依 `AGENTS.md` 透過 `uv run --locked manage.py` 一起啟動。真實操作使用 Node 正式前端與實際 HTTP／SQL／Socket.IO，沒有攔截 API；完整介面矩陣另使用隔離 fixture。原本的開發資料庫及服務未用作可刪除資料。

| 範圍     | 結果                                                                                                                                   |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 後端     | Black、Ruff、十支核心模組 mypy、1,108 項測試通過，0 skipped；包含 PostgreSQL、Redis、Socket.IO 與排程整合。                            |
| 前端     | 73 份單元檔案共 858 項通過；型別、lint、格式、三份匯出契約索引及正式建置通過。                                                         |
| 瀏覽器   | 最終版本完整 694 項 Chromium 矩陣全部通過；0 skipped、0 flaky，未設定自動 retries。                                                    |
| 真實 API | 7 項前端對真實後端契約通過，包含三語、分頁、管理排序及身分一致性。                                                                     |
| 真實操作 | 26 個不重複案例通過；重驗不重複加總。包含 20 個 owner 的四分區／三語儲存、重載、資源 CUD，另含分頁、註冊、管理、監控、手機地圖及降權。 |
| 焦點回歸 | 原 iframe 彈窗案例修正前重複 5 次有 1 次失敗；修正後連續 10 次通過，沒有放寬斷言。                                                     |

實際發現並修正兩個問題：

1. `ManagementDetails` 原先驗證所有欄位，Profile 已接受的既有圖示值會讓單純發布的 Save 持續停用。現在只驗證 PATCH 中已修改的欄位；整筆預覽的 Default／Active 等業務規則仍執行。新增單元案例同時確認保留既有值可以發布、明確改成非法值仍被阻擋。
2. `useReturnFocus` 的延遲 callback 會在 Bootstrap 已還原焦點或使用者移到外層 iframe 後，再次把焦點搶回專案按鈕。現在檢查 owner document、已移動及已還原的焦點；補四項確定性的單元案例，並更新既有 [Shared 索引](../frontend/src/shared/README.md)。

真實分頁測試在只載入第一頁時儲存，直接比較未載入專案內容不變；再驗證切頁、每頁筆數、未送出 modal 預覽與取消。管理操作完成角色指派、20 個網站發布／取消、三語公開 SSR、實際公開瀏覽器頁、指定 10 帳號批次刪除及降權。Socket.IO 測試直接等待 `monitor_snapshot` frame。資料庫核對刪除帳號關聯殘留為 0、登入回 401；跨 owner 修改、非法日期／座標均拒絕且不改 revision；保留的 10 份合成作品集三語契約正確。

註冊實測確認現有 202 challenge、200 verify、201 register、預設權限、登出與重新登入。SMTP 尚未實作，使用既有暫時驗證碼 123。註冊只建立帳號，不建立作品集，因此新帳號 `/portfolio/me/site` 回 404；建立作品集／管理新增及密碼重設仍是功能缺口，未列作已完成。瀏覽器範圍為 Chromium 與模擬觸控，不代表實體裝置或其他瀏覽器驗證。

首輪後端有一項因 QA 流量與歷史表測試共用資料庫而失敗；分離資料庫後完整 1,108 項通過。新測試的 ID 清理、動畫預覽定位、HTTP 狀態斷言及獨立環境的角色／最後管理員前置資料亦已修正；未放寬產品權限或刪除保護。後端仍有 674 則既有依賴棄用警告，主要為 pagination 的 SQLAlchemy `noload()` 與 TestClient 相容介面。

最終手機冷載入：360×800、6× CPU／4G，LCP 1,388 ms、CLS 0.000815、初始 JS gzip 257.80 KiB，未提前載入 Profile／大型區塊；公開產物大小檢查通過，未調高預算。原始紀錄、逐案例 JSON、畫面及重驗歷程保留於忽略的 `agent/fullops-2026-10-19/`；憑證與 traces 留在私人目錄。測試專用服務及容器已移除，原 PostgreSQL／Redis 容器保留。

維護性仍有改善空間：`ProfilePage.tsx` 的 658 行涵蓋頁面組裝、草稿協調與交易儲存，之後可進一步拆分 controller；本次沒有為行數而改動已驗證的儲存生命週期。相似但領域規則不同的流程仍需由語意判斷，完全相同函式掃描不能證明「零語意重複」。
