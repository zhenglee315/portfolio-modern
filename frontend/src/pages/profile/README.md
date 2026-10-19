# Profile 元件索引

這些元件在 Profile 分區間共用，屬於頁面內的編輯語意，不放進無業務依賴的 shared。跨功能呈現使用 [feature 公開入口](../../features/README.md)，底層 UI／日期／定位／schema 使用 [shared 契約](../../shared/README.md)。

本索引登記 components 目錄的全部具名匯出，含分區控制器及別名，避免「只檢查 shared、漏掉頁內共用元件」。詳細操作規格由[前端 README](../../../README.md)擁有。

| 模組                                                      | 介面                                                                                                      | 用途                                                                         |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| [AddContentTile](components/AddContentTile.tsx)           | `AddContentTile`                                                                                          | 分類、經歷與專案共用虛線新增入口及 heartbeat；權限與新增資料由父層提供。     |
| [EditorCard](components/EditorCard.tsx)                   | `EditorCard`                                                                                              | 經歷／專案共用勾選、把手、標題、顯示開關及滑出操作；本身不儲存。             |
| [EditorFields](components/EditorFields.tsx)               | `EditorField`、`EditorArea`、`EditorSelect`、`EditorPanel`、`EditorNotice`、`EditorToggle`、`SkillPicker` | 欄位標籤／錯誤、原生輸入、提示、面板與 switch；技能以既有 ID 指派。          |
| [EditorPagination](components/EditorPagination.tsx)       | `EditorPagination`                                                                                        | 經歷、專案、技能引用與預覽共用有界頁碼及筆數；獨立 CSS，不借用語言控制樣式。 |
| [ExperienceEditor](components/ExperienceEditor.tsx)       | `ExperienceEditor`                                                                                        | 編輯指定經歷 ID 的多語、日期及關聯，不另外建立儲存入口。                     |
| [ExperienceList](components/ExperienceList.tsx)           | `ExperienceList`                                                                                          | 經歷篩選、共用卡片及分頁，統一確認後更新正規化草稿。                         |
| [ExperienceLocation](components/ExperienceLocation.tsx)   | `ExperienceLocation`                                                                                      | 座標欄位與地圖確認橋接；取消不回填。                                         |
| [InlineNameInput](components/InlineNameInput.tsx)         | `InlineNameInput`                                                                                         | 分類／技能共用名稱輸入、鉛筆圖示與 accessible label。                        |
| [IntroductionEditor](components/IntroductionEditor.tsx)   | `IntroductionEditor`                                                                                      | 個人介紹、品牌、聯絡與頁尾編輯，更新共用草稿。                               |
| [IntroductionPreview](components/IntroductionPreview.tsx) | `IntroductionPreview`、`IntroductionExtras`                                                               | 介紹、聯絡及頁尾即時呈現；不新增 API 或持久化副本。                          |
| [JourneyPreview](components/JourneyPreview.tsx)           | `JourneyPreview`                                                                                          | 由經歷推導旅程及時間，不維護另一份地點資料。                                 |
| [LocationPickerModal](components/LocationPickerModal.tsx) | `LocationPickerModal`                                                                                     | 共用 modal 焦點、離線地圖與明確確認／取消生命週期。                          |
| [OfflineCitySearch](components/OfflineCitySearch.tsx)     | `OfflineCitySearch`                                                                                       | 離線城市搜尋與候選位置選取，不請求外部地理服務。                             |
| [PeriodFields](components/PeriodFields.tsx)               | `PeriodFields`                                                                                            | 經歷／專案共用月份、結束日與預期／目前日期欄位。                             |
| [ProfileActions](components/ProfileActions.tsx)           | `ProfileActions`                                                                                          | 頁面唯一預覽、取消與整份儲存入口及狀態。                                     |
| [ProfileHelp](components/ProfileHelp.tsx)                 | `ProfileHelp`                                                                                             | 編輯／排序／共用技能提醒共用定位、hover、焦點與獨立 cookie。                 |
| [ProfileIcon](components/ProfileIcon.tsx)                 | `IconName`、`Icon`                                                                                        | 轉用 shared Icon／IconName，只有 Profile 專用 glyph 留在本頁層。             |
| [ProfilePreview](components/ProfilePreview.tsx)           | `PreviewSkills`、`PreviewHeading`、`CategoryPreview`、`ExperiencePreview`、`ProjectPreview`               | 共用預覽標題、技能及各領域摘要，從同一份草稿讀取。                           |
| [ProfilePreviewModal](components/ProfilePreviewModal.tsx) | `ProfilePreviewModal`                                                                                     | 尚未送出草稿的公開樣式 modal，保留 URL、編輯位置與焦點。                     |
| [ProfileSourceNotice](components/ProfileSourceNotice.tsx) | `ProfileSourceNotice`                                                                                     | 來源、載入失敗及舊草稿重載提示，不假造成功資料。                             |
| [ProjectEditor](components/ProjectEditor.tsx)             | `ProjectEditor`                                                                                           | 專案摘要、詳情、技能與經歷 ID 關聯；由父層統一保存。                         |
| [ProjectList](components/ProjectList.tsx)                 | `ProjectList`                                                                                             | 單頁 API 專案、跨頁勾選、共用拖曳及滑出操作。                                |
| [ProjectPageStatus](components/ProjectPageStatus.tsx)     | `ProjectPageStatus`                                                                                       | 列表／預覽共用載入、錯誤與重試狀態。                                         |
| [ProjectPagination](components/ProjectPagination.tsx)     | `ProjectPagination`                                                                                       | 將 API page／size context 接至 EditorPagination，不複製分頁 UI。             |
| [ReorderGhost](components/ReorderGhost.tsx)               | `ReorderGhost`                                                                                            | inert 全卡快照保持尺寸及抓取位置，不攔截輸入或複製 DOM ID。                  |
| [ReorderHandle](components/ReorderHandle.tsx)             | `ReorderHandle`                                                                                           | 滑鼠、觸控及方向鍵共用把手語意，手勢委派 usePointerReorder。                 |
| [SelectionToolbar](components/SelectionToolbar.tsx)       | `SelectionToolbar`                                                                                        | 全選僅限當頁，保留跨頁選取；拖放刪除只作用於拖曳 ID。                        |
| [ShowcasePreview](components/ShowcasePreview.tsx)         | `ShowcasePreview`                                                                                         | 正規化草稿映射到原公開 View，避免重寫主頁版型。                              |
| [SkillRenameInput](components/SkillRenameInput.tsx)       | `SkillRenameInput`                                                                                        | 共用技能改名只更新既有技能 ID，各引用同步顯示。                              |
| [SkillUsageList](components/SkillUsageList.tsx)           | `SkillUsageList`                                                                                          | 共享技能使用處與安全編輯入口，重用 EditorPagination。                        |
| [SkillsEditor](components/SkillsEditor.tsx)               | `SkillsEditor`                                                                                            | 分類及成員排序引用 ID，不建立同名技能副本。                                  |
| [SkillsPreview](components/SkillsPreview.tsx)             | `SkillsPreview`                                                                                           | 分類／技能公開樣式 modal，沿用現有 modal 焦點控制。                          |
| [SwipeReveal](components/SwipeReveal.tsx)                 | `SwipeReveal`                                                                                             | 左滑共用編輯／刪除 rail，區分垂直捲動，支援 Esc 與觸控取消。                 |

狀態由 `ProfileEditorContext`／`useProfileDraft` 擁有：ID record 與 order 分離；技能、經歷及專案只保留一份實體。分頁、勾選與彈窗等檢視狀態不寫入資料庫草稿。`usePointerReorder`、`reorder-layout`、`useProfileProjects` 與 `showcaseProjection` 分別擁有手勢、落點、缺頁載入及公開 DTO 投影。

新增或移除匯出時同步此表；`npm run check:docs` 透過 AST 自動驗證。註解應說明共用責任、參數／狀態 ownership 及取消／清理規則，不重複描述每一行 JSX。

## 用法與組合

| 元件                  | 輸入                                                                                                | ownership／清理                                                                                                                  |
| --------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `AddContentTile`      | `label`、`onClick`、`disabled`                                                                      | 只發出新增意圖；虛線框與加號重用 Icon heartbeat，disabled／暫停／reduced-motion 沿用共用政策。實體 ID 及權限由 controller 處理。 |
| `EditorCard`          | `selection`、`reorder`、`visibility`、`editLabel/onEdit`，其餘沿用 `SwipeReveal`                    | 頂部同列放 checkbox／把手／標題／顯示開關及 ⋮；body 與日期由 caller 組合。不能自行保存、猜測 owner 或再加入另一套刪除確認。      |
| `SwipeReveal`         | `open/onOpenChange`、`label`、`action`、可選 `edit`；children 可接 trigger render function          | caller 擁有唯一開啟 ID；編輯／刪除各 80px。水平手勢與垂直捲動分開，Esc／外部點擊關閉；保留控制項的 data-swipe-ignore。           |
| `SelectionToolbar`    | 當頁 `ids`、跨頁 `checked`、`onChange`、`onDelete`、可選 `deleteTarget`                             | 全選只改目前 ids，保留其他頁選取。拖放目標使用同一顆刪除按鈕；放開後由 controller 確認，不等於立即送出 DELETE。                  |
| `EditorPagination`    | `page`、`size`、`total`、`range`、`label`、`onPageChange/onSizeChange`，可選 `defaultSize/disabled` | 純檢視元件，頁碼最多五個；caller 決定本機或 API 載入。筆數切換回第一頁，保留草稿／勾選。預設 6，技能引用可設 5。                 |
| `ProfilePreviewModal` | `page/size`、`onPageChange/onSizeChange/onClose`；草稿讀取既有 `ProfileEditorContext`               | 使用原公開 feature Views；獨立預覽分頁，不改編輯 URL，也不送出草稿。關閉釋放 modal 並還原焦點／編輯位置。                        |

在既有 controller 內使用以下組合，沿用上下文的 `page/size/total` 與 handler；不要在元件內再建立 API 或第二份 draft：

```tsx
<>
  <SelectionToolbar
    ids={visibleIds}
    checked={checkedIds}
    onChange={setCheckedIds}
    onDelete={confirmSelectedDeletion}
  />
  <AddContentTile label="Add project" onClick={addProject} disabled={!canCreate} />
  <EditorPagination
    page={page}
    size={size}
    total={total}
    range="projectRange"
    label="Project pagination"
    onPageChange={setPage}
    onSizeChange={changeSize}
  />
</>
```

拖曳組合以 [ProjectList](components/ProjectList.tsx)／[ExperienceList](components/ExperienceList.tsx) 為可直接核對的完整範例：`usePointerReorder(axis, onMove, order, { onDrop, disabled })` 回傳 list ref、`handleProps`、drag、`deleteTarget`；`ReorderHandle` 接手勢，`ReorderGhost` 顯示完整卡片，`reorder-layout` 計算固定原槽位及不同寬度標籤的落點。pointercancel／Esc／失焦／resize 釋放 capture、rAF、ghost 及捲動；只有有效放開才改 ID 順序或呼叫既有刪除確認。

專案的資料責任由 `useProfileProjects`／feature 的 private API 擁有。載入另一頁同時 hydrate 草稿與保存基準，不覆蓋已改／已刪項目；全頁 Save 帶 `expected_revision`、`project_scope.loaded_ids/order`，後端保留未載入項目。`showcaseProjection` 只把正規化草稿轉為既有公開 DTO，不能複製另一份首頁元件或查舊公開內容來當預覽。
