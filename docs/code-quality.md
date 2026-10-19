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

完整整合需要可刪除的 Redis 與 PostgreSQL。變數只在測試程式使用；每個 PostgreSQL 測試自行建立／移除 schema，Redis 使用測試命名空間：

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

Profile 的公開六支 GET 保留，編輯器改以五支本人 GET 讀取完整三語內容，並以單一 revision-checked POST 儲存。單元測試涵蓋組織／詳情／座標、語言缺漏、完整私有來源、實體引用、日期／聯絡驗證、帳號隔離、取消、失敗不重送及三語字典；瀏覽器測試另涵蓋 15 筆專案全部載入、重新整理後保留後端結果、舊草稿復原、版本衝突、儲存鎖定、權限、各分區 CUD、共用技能、旅程同步、拖曳與 390／820／1600／2560px 排版。後端涵蓋 23 個新增操作、owner／即時權限、交易回滾、提交後快取失敗與正規化技能；migration 另在獨立 PostgreSQL schema 驗證既有資料搬移。首次前端階段的首頁 6× CPU／4G 實測基礎 JS gzip 為 256.4–257.8KiB、LCP 約 1.4 秒、CLS 0.00082。自動聯絡氣泡是否在量測截止前完成載入會影響數值；258KiB 上限保守包含該氣泡及共用導覽、API query chunk，明確驗證首頁不下載 Profile 編輯器／文案／範例與離線地圖；LCP、CLS 門檻維持不變。完整 client 產物的有界預算另包含新增的路由與樣式，並由 verify-public 檢查。

2026-10-18 本次 CUD 驗證：後端一般檢查 928 passed／171 skipped，Black、Ruff、十支核心模組 mypy 通過；另外在專用 PostgreSQL 資料庫執行 migration 與內容編輯測試共 20 passed。前端 `npm run check` 通過，包含 837 項單元測試、型別、lint、格式、shared 契約索引與正式建置。Profile／地點／API 來源／帳號選單共 43 項 Playwright 通過；另一次獨立手機冷載入檢查通過，初始 JS gzip 256.54KiB、LCP 1,404ms、CLS 0.00082，沒有提前載入 Profile 或地圖 chunk。這批瀏覽器流程使用隔離模擬 API。

之後依使用者指示，以 `uv run --locked alembic upgrade head` 將原本機 PostgreSQL 由 `d7a24e91b630` 升級至 `e42b19a7d603`。遷移前完整備份已驗證可讀，遷移後比較 12 張原有 Portfolio 表的既有欄位資料均保留；新增技能記錄與關聯另行建立。前後端已啟動，OpenAPI 實際註冊 29 個 Portfolio 操作，三語六支公開 API 皆正常回應、未登入的本人 GET 回 401，完整編輯 document 亦通過嚴格驗證。瀏覽器登入頁正常；原帳號登入後的實際儲存尚未驗收，未修改原內容來製造測試結果。

### 20 帳號完整驗證（2026-10-19）

依使用者指示，在原本機 PostgreSQL 建立 20 個具有唯一 QA 前綴的合成帳號，透過真實登入與 Profile 頁逐一編輯四個分區、三語內容、技能排序、經歷／Journey 地點與專案詳情，儲存後重載驗證。每個帳號再透過真實 HTTP 執行資源 CUD、排序、分類成員與使用中技能保護；共 20 次整頁 UI 儲存、360 次個別資源寫入。管理頁另驗證 20 個帳號的角色指派、20 個網站發布／取消發布、帳號停用／恢復，並以批次刪除精確移除指定的 10 個 QA 帳號；其餘 10 個保留、維持啟用且未公開。QA 管理帳號最後自我降為一般編輯權限，驗證管理 API 回 403、本人內容仍可讀。沒有修改或刪除原有共用角色。

- 完整後端檢查：1,099 passed、0 skipped，啟用獨立 PostgreSQL／Redis／Socket.IO／排程整合；Black、Ruff、十支核心模組 mypy 通過。整合用容器與測試資料庫已清理，原服務保留。
- 前端完整檢查：837 項單元、型別、lint、格式、shared 契約與正式 build 通過；另 7 項前端對真實 API 契約通過。完整瀏覽器矩陣 634 項通過；修正文案及加入搜尋導航案例後，另 36 項 Profile／地圖／搜尋聚焦重驗通過，與矩陣有重疊而不加總。真實環境包含 20 個 owner 案例、1 個管理案例與 3 個監控／手機／權限後續案例。
- 原帳號／角色／作品集 16 張表的每筆原資料雜湊均保留；被刪除 QA 帳號的 site_id 關聯與登入紀錄殘留為 0，登入均回 401。跨 owner 修改回 404，非法日期／座標回 422 且不改動 revision；保留帳號的三語與內容契約重新驗證通過。
- 本次修正 Profile 三語提示，移除「儲存只留在瀏覽器」的過期描述。管理新增、SMTP 實際寄信及密碼重設仍未實作，未將占位畫面視為功能通過。

逐帳號結果、畫面、機器可讀摘要及原始測試紀錄保留於忽略的 `agent/full-verification-2026-10-19/`；`report.html` 與 `accounts-results.csv` 不含密碼。測試憑證以 0600 權限另存私人 manifest。真實測試使用 `frontend/playwright.live.config.ts` 與 `frontend/tests/live/accounts.spec.ts`，僅接受明確提供的 20 帳號 QA manifest；已完成的同批帳號有 10 個被刪除，不應直接當作全新 fixture 重跑。
