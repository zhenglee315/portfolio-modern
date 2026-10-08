# Cow workspace

可重用的像素風 SVG 桌面與角色拆件。以 `backend/SYSTEM/static/icon/logo.png` 為造型依據，桌面道具各自由新繪製的完整透明原稿轉成純 SVG 路徑，不沿用原場景切片。牛頭採用使用者選定的第一版完整頭原稿，整張轉成向量；嘴筆畫拆為獨立物件，頭部嘴區補回原鼻口底色，再分別疊上眼睛與嘴型。原始 PNG 保留不變。

角色分為衣身、完整牛頭、思考／打字／直視三組眼睛、平嘴／微笑兩組嘴型、左手托腮／打字兩種姿勢、右手放鬆／打字兩種姿勢。正式角色資產共 12 件，包含共用相同衣身輪廓與尺寸的兩個資產名稱。道具分為書堆、地球儀、打開的書、筆電、咖啡杯、盆、葉片與桌子。每件都有自己的完整輪廓，重疊區域由前後圖層遮擋。

衣身使用完整透明原稿 `rig-source/cowBodyTorsoRedrawnV2.png`，肩膀、兩側輪廓與下擺連續，保留領口、抽繩、字標和口袋。兩個衣身資產從同一原稿等比例定位、整張轉成 SVG；生成提示詞保存於 `body-edge-redraw-prompts.json`。`rig-body-review.svg` 並排呈現獨立衣身與疊上頭、手臂的完整牛。

直視眼睛使用 `rig-source/cowEyesObserverDirectRedrawn.png`，參考使用者提供的向日葵牛眼神，包含朝正前方、同高度的雙瞳孔、完整眼白與眉間線。整組等比例疊上原本的空白牛頭；提示詞保存於 `observer-eyes-redraw-prompts.json`。`rig-eyes-review.svg` 在相同牛頭與尺度下比較原本眼神、新直視眼神。

打字眼睛使用重新生成的獨立透明原稿 `rig-source/cowEyesWorkingFocusedRedrawnV3.png`（2172 × 724）。眉尾抬高、內眉尖壓低，眉毛與上眼瞼斜向鼻梁，眼眶開口較集中；瞳孔略向下、向內看代碼，保留清楚高光。虹膜使用直視眼睛相同的低飽和灰棕色票，讓敲代碼與直視靠眉形和視線區別。眼白只位於眼瞼輪廓內，眉毛周圍、兩眼之間和眼睛外圍均透明。整組原稿等比例轉成 SVG；提示詞保存於 `working-eyes-focus-redraw-prompts.json`。`rig-working-eyes-focus-review.svg` 用同一牛頭、同尺度比較修改前的工作眼睛、新專注眼睛與直視參考，並在棋盤底顯示獨立素材。修改前的完整 V2 原稿與 SVG 保存在 `rig-source/cowEyesWorkingLively-v2.png`／`.svg`；更早的 V1 保留於 `rig-source/cowEyesWorkingIndependent-v1.png`／`.svg`。

思考眼睛使用另一份完整新繪透明原稿 `rig-source/cowEyesThinkingRedrawnV2.png`（2170 × 725），正式分件為 `rig-cowEyesThinking.svg`。短眉、厚圓弧上眼瞼與部分露出的虹膜構成托腮思考的表情，視線比打字時略向上，搭配平嘴。虹膜沿用直視眼睛的灰棕色票；整組等比例對齊既有牛頭，不更改其餘 11 件角色資產。兩輪完整生成提示詞記錄於 `thinking-eyes-redraw-prompts.json`。三組眼睛分別對應 `thinking`、`typing`、`glance`；既有打字與直視眼睛保持原樣。`rig-three-expressions-review.svg` 在上方棋盤底以共同視角、尺度獨立呈現三組眼睛，下方疊上同一牛頭與對應嘴型：思考平嘴、打字平嘴、直視微笑。

嘴型為獨立原生 SVG 筆畫 `rig-cowMouthNeutral.svg`、`rig-cowMouthSmile.svg`，沿用原牛頭嘴線的位置與深棕色；平嘴保留原筆畫，微笑使用兩端微抬的像素曲線。每件嘴型外圍透明，不包含鼻口底色，牛頭原 PNG 不變。思考、打字使用平嘴；抬頭看操作者的 `glance` 使用微笑。嘴型依姿勢切換，停止動畫或使用減少動態效果時仍保留該姿勢的嘴型。`rig-mouth-review.svg` 以相同棋盤底獨立顯示兩件嘴型，並疊在同一牛頭、同一直視眼睛上比較。

嘴型原生來源保存於 `rig-source/cowMouthNeutralNative.svg`、`rig-source/cowMouthSmileNative.svg`。`head-mouth-native-edits.json` 記錄移出的精確嘴筆畫和鼻口底色復原規格；`mouth-smile-native-spec.json` 記錄微笑的像素曲線與色票。原有嘴線的完整牛頭 SVG 保存在 `rig-source/cowHeadCompleteOriginal-v1.svg`，可用於比對重建結果。

左右打字臂使用完整透明原稿 `cowArmLeftTypingRedrawn.png`、`cowArmRightTypingRedrawn.png`，保留彎肘、短手腕與蹄子姿勢，補齊圓整肩根及內側袖邊。恢復使用者認可的原本較厚比例：左臂等比例縮放 `.40`、右臂 `.34`，肩根與共用衣身保持實心重疊。整張原稿轉成 SVG；生成提示詞保存於 `typing-arm-redraw-prompts.json`，`rig-typing-arms-review.svg` 可獨立檢查雙臂。

思考左臂與放鬆右臂各自重新繪製為完整透明原稿 `cowArmLeftThinkingThickRedrawnV2.png`、`cowArmRightRestingThickRedrawnV3.png`，加厚衣袖、袖口、白色手腕和蹄子，配合原本打字臂的份量。放鬆手縮短袖身以容納較大的蹄子，維持肩根位置與手臂末端高度。兩件各自等比例整體定位，整張轉成 SVG；完整生成提示詞保存於 `arm-thickness-redraw-prompts.json`。`rig-arms-review.svg` 可在棋盤背景上獨立檢查兩臂。

## 使用

```tsx
import { CowWorkspace, CowWorkspaceAsset } from '@/shared/ui/cow-workspace/CowWorkspace';

<CowWorkspace label="牛工程師在桌前工作" />;
<CowWorkspace phase="typing" label="牛工程師用雙手打字" />;
<CowWorkspace phase="glance" motion={false} label="牛工程師微笑看著你" />;
<CowWorkspaceAsset part="coffee" label="冒煙的咖啡杯" motion />;
```

| Prop        | 預設     | 用途                                  |
| ----------- | -------- | ------------------------------------- |
| `label`     | 必填     | 無障礙描述，由呼叫端提供              |
| `motion`    | `true`   | 動畫與自然行為切換                    |
| `parallax`  | `true`   | 滑鼠視差                              |
| `phase`     | 自然循環 | 固定 `thinking`、`typing` 或 `glance` |
| `className` | 空字串   | 呼叫端的容器樣式                      |

自然循環在托腮思考、雙手打字與抬頭直視之間切換。托腮時使用專屬思考眼睛；打字時兩隻蹄子交錯敲擊，專注眼神朝下；直視時使用正面眼神與微笑。眼睛和嘴型只依姿勢切換，停止動畫或使用減少動態效果時仍保留所選姿勢的表情。咖啡冒煙、葉片搖擺、地球陸地持續繞球面轉動而支架與底座固定、整本打開的書輕微起伏。

地球使用原生 SVG 球面投影，36 秒轉一圈。原本正面陸地反投影成經緯素材，背面補入相同像素畫風的大陸輪廓；這是角色桌面插畫，不作精確地圖使用。海洋底色、球面光影、高光與木框保持固定，陸地在圓球邊緣自然壓縮。動畫以預先繪製的向量影格和 CSS 播放，不逐幀重繪 React。停止動畫與減少動態效果時顯示原靜止地球。`globe-rotation-review.svg` 可檢查四個方向；`complete-globe-rotating.svg` 是可獨立使用與下載的動畫地球儀。

場景由多張相同 `0 0 1254 1254` 座標的 SVG 堆疊。完整角色、桌面、盆栽、書堆、筆電、地球儀、杯子與打開的書依序繪製；各層有不同視差距離。桌面遮住角色的下襬。打字手臂只繪製一次，位於筆電後方，螢幕自然遮住鍵盤與下方手部。

動畫在離開視窗、分頁隱藏、減少動態效果或全域暫停時停止。觸控操作不被攔截；視差只在精細指標裝置啟用，指標移動不觸發 React 重繪。

## 拆件與檔案

`CowWorkspaceAsset` 保留 `cow`、`laptop`、`coffee`、`plant`、`books`、`globe`、`openBook`、`desk` 的組合資產介面。`CowWorkspacePiece` 另外支援 `plantPot` 與 `plantLeaves`；`CowRigAsset` 單獨呈現角色拆件。

```tsx
<CowRigAsset part="cowHeadComplete" label="完整牛頭" />;
<CowRigAsset part="cowEyesObserver" label="直視的眼睛" />;
<CowRigAsset part="cowEyesThinking" label="思考的眼睛" />;
<CowRigAsset part="cowMouthSmile" label="微笑嘴型" />;
<CowRigAsset part="cowBodyTyping" label="打字用的完整衣身" />;
<CowWorkspacePiece part="plantLeaves" label="搖動的葉片" motion />;
```

`CowTorso`、`CowHead`、`CowEyes`、`CowMouth`、`CowArmLeft`、`CowArmRight`、`Laptop`、`CoffeeCup`、`PlantPot`、`PlantLeaves`、`Plant`、`BookStack`、`Globe`、`OpenBook`、`Desk` 為可放進自有 SVG 的 `<g>` 元件。

```tsx
<svg viewBox="0 0 1254 1254">
  <CowTorso pose="typing" />
  <CowHead />
  <CowEyes state="observer" />
  <CowMouth state="smile" />
  <CowArmLeft pose="typing" />
  <CowArmRight />
</svg>
```

正式完整分件位於 `src/assets/cow-workspace/`：`rig-*.svg` 為角色、`complete-*.svg` 為道具；生成資料為 `rig.ts` 與 `complete-props.ts`。SVG 不引用 PNG，也不含嵌入點陣圖片。

舊的 `cow.svg`、`books.svg` 等與 `workspace.svg` 保留作原圖描圖基準。它們是原場景的分割結果；新元件和下載入口使用完整拆件。

## 預覽與重建

在 `frontend/` 執行 `npm run dev:cow`，開啟 `http://127.0.0.1:5175/cow-workspace-preview.html`。預覽可比較原圖與新場景、選姿勢、逐格檢查動畫、獨立查看與下載角色及道具。

`src/assets/cow-workspace/rig-poses-review.svg` 以相同 viewBox 和顯示尺度並排呈現思考、打字完整牛，供檢查手臂比例與肩膀連接。單件卡片會各自適應容器大小，跨姿勢的比例比較應使用完整角色對照。

`complete-workspace.svg` 使用思考眼睛與平嘴，`complete-workspace-typing.svg` 使用既有打字眼睛與平嘴；`complete-workspace-glance.svg` 使用既有直視眼睛與微笑，保留托腮、放鬆手臂及相同桌面配置。三種完整場景都由獨立眼睛和嘴型疊在牛頭上。

`rig-arm-thickness-review.svg` 用相同牛頭、衣身、眼睛和尺度，對照思考／打字兩種姿勢修改前後的手臂。修改前的四件完整 SVG 和 PNG 原稿保存在 `rig-source/arm-thickness-before/`，重建比較板不依賴暫存目錄。

補畫使用內建 imagegen 工具。角色提示詞記錄於 `rig-prompts.json`，透明 PNG 原稿保存於 `rig-source/`；道具的獨立原稿保存於 `prop-source/`，提示詞記錄於 `prop-prompts.json`。原稿只作編輯與重建來源，正式元件不載入點陣圖。`rig-provenance.json` 與 `complete-props.source-map.json` 記錄來源雜湊與位置。所有桌面道具從各自原稿重建，舊場景的物件輪廓與接觸陰影不參與輸出。

```sh
python3 scripts/trace-cow-rig.py src/assets/cow-workspace/rig-build-manifest.json
python3 scripts/complete-cow-props.py
python3 scripts/build-cow-globe-rotation.py
python3 scripts/compose-cow-workspace.py
npx prettier --write src/assets/cow-workspace/rig.ts src/assets/cow-workspace/complete-props.ts
```

`split-cow-workspace.py` 與 `verify-cow-workspace.py` 用來重建、比對原始描圖基準；它們的原圖誤差門檻不代表補畫後的姿勢或重疊表面。完整拆件另以透明背景獨立預覽，以及思考、打字、直視和最大視差位置做視覺檢查。

這是固定正面的 2.5D 堆疊；新增角度仍需要該角度的繪圖。書本目前是完整紙面一起微動，沒有逐頁翻書。

目前交付為共用元件與獨立預覽入口，尚未接到首頁。保留像素細節的向量資料較大；此次獨立預覽建置的 JavaScript 約 6.82 MB（gzip 約 1.42 MB），正式頁面導入時可按需載入元件。
