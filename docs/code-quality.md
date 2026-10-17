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
| Q09  | 套件以 **all** 宣告 API，星號匯入來源維持明確公開清單；import 依屬性以 Pack 分隔線分組                        | 靜態邊界測試、不同匯入順序、套件匯出類別一致性                       |
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

SMTP 寄送、密碼重設及尚未實作的新增／Profile 流程仍是原本的占位功能，不因本次整理宣稱已可用。record_request 是觀測歷史：尚未送入 Redis 的程序記憶體資料仍有中斷遺失窗口；這次保留原有容量、溢位計數及提交後 ACK 契約。草地牛素材保留可重組的原稿與來源，只整理 Python 產生器格式。

一次性完整執行證據保留在忽略的 agent/quality-fixes-2026-10-17/；正式測試原始碼、配置與依賴隨專案維護。

## 本次結果

2026-10-17：後端 1,017 項、前端 772 項單元＋7 項真實 API、543 項瀏覽器矩陣＋4 項真實 Node／Vite 操作全部通過，沒有跳過或失敗。另驗證 86 項 HTTP、5 項 WebSocket 代理與草地牛 144 組／11,762 條向量路徑。

雙 manage.py 實例中同一 job 最大併發為 1；實際每分鐘排程將 24 筆請求全部入庫，pending=0。手機 6× CPU／4G 模擬 LCP 為 1352 ms，低於原 2,500 ms 門檻。正式與測試產物都走相同驗證及 gzip 流程，分開存放。

Black／Ruff、十個核心模組的 mypy、TypeScript／ESLint／Prettier、195 個 shared 匯出索引、正式 build，以及 14 份 README 的 354 個本地連結均通過。保留 FastAPI TestClient 與 fastapi-pagination 的第三方 API 棄用警告，未關閉警告；測試沒有功能錯誤。一次性詳細證據見 agent/quality-fixes-2026-10-17/verification-summary.json。

2026-10-18 發布驗證：後端完整整合 1,022 項、前端 772 項單元與 7 項真實 API、543 項瀏覽器矩陣及 4 項真實 Node／Vite 操作全部通過，沒有跳過、失敗或不穩定重跑。另通過 86 項 HTTP／SSR、5 項 WebSocket 代理、草地牛 144 組／11,762 條路徑及 4 份重建模組比對。兩個 manage.py 實例同一 job 最大併發為 1，實際每分鐘排程寫入全部 24 筆請求，pending=0；手機 6× CPU／4G 模擬 LCP 為 1,368 ms。格式、lint、十個核心模組型別、正式 build 與 14 份 README 的 356 個本地連結均通過。詳細證據保留於忽略的 agent/release-2026-10-18/verification-summary.json，專用測試服務已關閉。
