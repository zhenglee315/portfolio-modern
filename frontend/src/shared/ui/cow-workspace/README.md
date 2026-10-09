# Cow workspace

可重用的像素風 SVG 桌面與角色拆件。以 `backend/SYSTEM/static/icon/logo.png` 為造型依據，桌面道具各自由新繪製的完整透明原稿轉成純 SVG 路徑，不沿用原場景切片。牛頭採用使用者選定的第一版完整頭原稿，整張轉成向量；嘴筆畫拆為獨立物件，頭部嘴區補回原鼻口底色，再分別疊上眼睛與嘴型。原始 PNG 保留不變。

A reusable pixel-style SVG character and desk for the portfolio's account panel. Character parts and complete props retain their transparent source artwork; eyes and mouth are independent vector layers. React composes the scene, a shared hook owns its motion lifecycle, and the account feature supplies localized controls.

角色分為衣身、完整牛頭、思考／打字／直視三組眼睛、平嘴／微笑兩組嘴型、左手托腮／打字兩種姿勢、右手放鬆／打字兩種姿勢。正式角色資產共 12 件，包含共用相同衣身輪廓與尺寸的兩個資產名稱。道具分為書堆、地球儀、打開的書、筆電、咖啡杯、盆、葉片與桌子。每件都有自己的完整輪廓，重疊區域由前後圖層遮擋。

衣身使用完整透明原稿 `rig-source/cowBodyTorsoRedrawnV2.png`，肩膀、兩側輪廓與下擺連續，保留領口、抽繩、字標和口袋。兩個衣身資產從同一原稿等比例定位、整張轉成 SVG；生成提示詞保存於 `body-edge-redraw-prompts.json`。`rig-body-review.svg` 並排呈現獨立衣身與疊上頭、手臂的完整牛。

直視眼睛使用 `rig-source/cowEyesObserverDirectRedrawn.png`，參考使用者提供的向日葵牛眼神，包含朝正前方、同高度的雙瞳孔、完整眼白與眉間線。整組等比例疊上原本的空白牛頭；提示詞保存於 `observer-eyes-redraw-prompts.json`。`rig-eyes-review.svg` 在相同牛頭與尺度下比較原本眼神、新直視眼神。

打字眼睛使用重新生成的獨立透明原稿 `rig-source/cowEyesWorkingFocusedRedrawnV3.png`（2172 × 724）。眉尾抬高、內眉尖壓低，眉毛與上眼瞼斜向鼻梁，眼眶開口較集中；瞳孔略向下、向內看代碼，保留清楚高光。虹膜使用直視眼睛相同的低飽和灰棕色票，讓敲代碼與直視靠眉形和視線區別。眼白只位於眼瞼輪廓內，眉毛周圍、兩眼之間和眼睛外圍均透明。整組原稿等比例轉成 SVG；提示詞保存於 `working-eyes-focus-redraw-prompts.json`。`rig-working-eyes-focus-review.svg` 用同一牛頭、同尺度比較修改前的工作眼睛、新專注眼睛與直視參考，並在棋盤底顯示獨立素材。修改前的完整 V2 原稿與 SVG 保存在 `rig-source/cowEyesWorkingLively-v2.png`／`.svg`；更早的 V1 保留於 `rig-source/cowEyesWorkingIndependent-v1.png`／`.svg`。

思考眼睛使用另一份完整新繪透明原稿 `rig-source/cowEyesThinkingRedrawnV2.png`（2170 × 725），正式分件為 `rig-cowEyesThinking.svg`。短眉、厚圓弧上眼瞼與部分露出的虹膜構成托腮思考的表情，視線比打字時略向上，搭配平嘴。虹膜沿用直視眼睛的灰棕色票；整組等比例對齊既有牛頭，不更改其餘 11 件角色資產。兩輪完整生成提示詞記錄於 `thinking-eyes-redraw-prompts.json`。三組眼睛分別對應 `thinking`、`typing`、`glance`；既有打字與直視眼睛保持原樣。`rig-three-expressions-review.svg` 在上方棋盤底以共同視角、尺度獨立呈現三組眼睛，下方疊上同一牛頭與對應嘴型：思考平嘴、打字平嘴、直視微笑。

嘴型為獨立原生 SVG 筆畫 `rig-cowMouthNeutral.svg`、`rig-cowMouthSmile.svg`，沿用原牛頭嘴線的位置與深棕色；平嘴保留原筆畫，微笑使用兩端微抬的像素曲線。每件嘴型外圍透明，不包含鼻口底色，牛頭原 PNG 不變。思考、打字使用平嘴；抬頭看操作者的 `glance` 使用微笑。嘴型依姿勢切換，停止動畫或使用減少動態效果時仍保留該姿勢的嘴型。`rig-mouth-review.svg` 以相同棋盤底獨立顯示兩件嘴型，並疊在同一牛頭、同一直視眼睛上比較。

嘴型原生來源保存於 `rig-source/cowMouthNeutralNative.svg`、`rig-source/cowMouthSmileNative.svg`。`head-mouth-native-edits.json` 記錄移出的精確嘴筆畫和鼻口底色復原規格；`mouth-smile-native-spec.json` 記錄微笑的像素曲線與色票。原有嘴線的完整牛頭 SVG 保存在 `rig-source/cowHeadCompleteOriginal-v1.svg`，可用於比對重建結果。

左右打字臂使用完整透明原稿 `cowArmLeftTypingRedrawn.png`、`cowArmRightTypingRedrawn.png`，保留彎肘、短手腕與蹄子姿勢，補齊圓整肩根及內側袖邊。恢復使用者認可的原本較厚比例：左臂等比例縮放 `.40`、右臂 `.34`，肩根與共用衣身保持實心重疊。整張原稿轉成 SVG；生成提示詞保存於 `typing-arm-redraw-prompts.json`，`rig-typing-arms-review.svg` 可獨立檢查雙臂。

思考左臂與放鬆右臂各自重新繪製為完整透明原稿 `cowArmLeftThinkingThickRedrawnV2.png`、`cowArmRightRestingThickRedrawnV3.png`，加厚衣袖、袖口、白色手腕和蹄子，配合原本打字臂的份量。放鬆手縮短袖身以容納較大的蹄子，維持肩根位置與手臂末端高度。兩件各自等比例整體定位，整張轉成 SVG；完整生成提示詞保存於 `arm-thickness-redraw-prompts.json`。`rig-arms-review.svg` 可在棋盤背景上獨立檢查兩臂。

## 使用 / Usage

```tsx
import { CowWorkspace } from '@/shared/ui/cow-workspace/CowWorkspace';

<CowWorkspace label="牛工程師在桌前工作" />;
<CowWorkspace phase="typing" label="牛工程師用雙手打字" />;
<CowWorkspace phase="glance" motion={false} label="牛工程師微笑看著你" />;
```

| Prop            | 預設 / Default           | 用途 / Purpose                                                                         |
| --------------- | ------------------------ | -------------------------------------------------------------------------------------- |
| `label`         | 必填 / Required          | 呼叫端提供無障礙描述 / Owner-supplied accessible description                           |
| `motion`        | `true`                   | 動畫與自然行為切換 / Scene animation and ambient phases                                |
| `parallax`      | `true`                   | 細指標滑鼠視差 / Fine-pointer parallax                                                 |
| `globeRotation` | `true`                   | 關閉時停在目前角度 / Independent globe rotation; holds its current angle when disabled |
| `pointerScope`  | `scene`                  | 場景內跟動；`page` 接收整頁事件 / Local tracking, or full-page events with `page`      |
| `pointerOrigin` | 場景中心 / Scene center  | 用目前元素 ref 指定跟動中心 / Current element ref used as the tracking origin          |
| `phase`         | 自然循環 / Ambient cycle | 固定 `thinking`、`typing` 或 `glance` / Optional fixed expression                      |
| `className`     | 空字串 / Empty           | 呼叫端的容器樣式 / Owner-supplied container style                                      |

自然循環固定依「思考 → 寫代碼 → 看著你 → 寫代碼」重複，每個狀態停留 3 秒，一輪共 12 秒。滑鼠互動保留循環時序並提供視差；暫停後繼續剩餘時間，也保留第二次打字在循環中的位置。托腮時使用專屬思考眼睛，頭部朝托腮的手輕微傾斜，以 6.4 秒週期在 2–4 度間緩慢微動；眼睛和嘴巴跟著完整牛頭一起轉動。打字時兩隻蹄子交錯敲擊，專注眼神朝下；直視時使用正面眼神與微笑。眼睛和嘴型只依姿勢切換，停止動畫或使用減少動態效果時仍保留所選姿勢的表情。咖啡冒煙、葉片搖擺、地球陸地持續繞球面轉動而支架與底座固定、整本打開的書輕微起伏。

地球開關只停止地球目前影格，不改變表情或滑鼠偏好。系統減少動態、全域暫停、隱藏分頁與場景離開 viewport 的規則仍優先套用。

The default cycle is thinking → coding → hello → coding, with three seconds per phase. Pausing retains expression, remaining time and cycle position. The globe toggle holds only its current frame without changing expression or pointer preferences. Reduced motion, global pause, hidden documents and out-of-view scenes still gate motion.

寫代碼時，筆電周圍會分批迸出奶白、金黃與青色的像素光束，以 1.8 秒週期向外移動後消散。`LaptopTypingLight` 是獨立的原生 SVG 裝飾群組，與筆電共用視差深度；它放在桌面道具後方，由書本、杯子等物件自然遮住光束根部。光芒只在動畫啟用的 `typing` 階段顯示，思考、直視、暫停及減少動態效果時隱藏。

寫代碼時，六個淺藍像素汗滴會從頭部兩側分批向外甩出，放大後淡去，表現卡通裡拼命努力的爆汗感。每滴以 2.4 秒循環，彼此錯開 0.4 秒，通常同時看見約三滴；帶深色輪廓、白色高光與小水珠。`CowTypingSweat` 是獨立原生 SVG 群組，與角色共用視差深度，避開眼眉和臉部，也不改變頭部旋轉軸或素材。只在動畫啟用的 `typing` 階段顯示；其他表情、暫停及減少動態效果時隱藏。

思考時，三個完整像素 SVG 小飛碟會在頭頂沿橢圓軌道慢轉，每 6 秒繞一圈，彼此錯開 2 秒。後半圈略小、略暗，前後兩層在軌道兩側交換，形成 2.5D 距離感。`CowThinkingOrbit` 與角色共用視差深度，但獨立於頭部微動，不改變頭部的旋轉軸或素材邊界。只在動畫啟用的 `thinking` 階段顯示；其他表情、暫停及減少動態效果時隱藏。

看著你時，原本托腮的左側手臂會在下巴旁輕擦一次，保持微笑可見。動作幅度為 2.5 度，在進入姿勢後約 1.5 秒內完成，接著長時間停頓，每 6.8 秒循環一次；只在動畫啟用的 `glance` 階段生效。保留完整手臂原稿與比例，暫停或減少動態效果時停止。

地球使用原生 SVG 球面投影，36 秒轉一圈。原本正面陸地反投影成經緯素材，背面補入相同像素畫風的大陸輪廓；這是角色桌面插畫，不作精確地圖使用。海洋底色、球面光影、高光與木框保持固定，陸地在圓球邊緣自然壓縮。動畫以預先繪製的向量影格和 CSS 播放，不逐幀重繪 React。停止動畫與減少動態效果時顯示原靜止地球。`globe-rotation-review.svg` 可檢查四個方向；`complete-globe-rotating.svg` 是可獨立使用與下載的動畫地球儀。

場景由多張相同 `0 0 1254 1254` 座標的 SVG 堆疊。完整角色、桌面、盆栽、書堆、筆電、地球儀、杯子與打開的書依序繪製；各層有不同視差距離。滑鼠移到場景邊緣時，整體左右傾斜最多 10 度、上下最多 8 度，使用 600px 透視；前景打開的書左右最多移動 18px、桌面最多 2px，以移動差距呈現景深，移出後平順回正。桌面遮住角色的下襬。打字手臂只繪製一次，位於筆電後方，螢幕自然遮住鍵盤與下方手部。

動畫在離開視窗、分頁隱藏、減少動態效果或全域暫停時停止。觸控操作不被攔截；視差只在精細指標裝置啟用，指標移動不觸發 React 重繪。

## 登入整合與素材 / Account Integration and Assets

登入頁透過 `AuthCowScene` 使用完整 `CowWorkspace`。左上四鈕為循環、思考（cup-hot-fill）、編程（dpad-fill）、你好（balloon-fill）；右下依序為地球（globe-americas-fill）、滑鼠跟動（mouse2-fill）及單一播放／暫停鈕。播放時顯示 pause-fill，暫停時顯示 play-fill，提示文字說明下一個動作。七鈕都採 44px 外框，沿用語言／主題控制尺寸與共用像素 tooltip，提供繁體、簡體及英文。

`AuthCowScene` provides four top-left controls for cycle, thinking (cup-hot-fill), coding (dpad-fill) and hello (balloon-fill). Bottom-right controls are globe-americas-fill, mouse2-fill and one play/pause button. Playback shows pause-fill while running and play-fill while paused; its description names the next action. All seven use the language/theme controls' 44px frame and shared pixel tooltips in Traditional Chinese, Simplified Chinese and English.

登入頁使用 `pointerScope="page"`，以目前表單輸入區中心為 `pointerOrigin`；滑鼠在背景與表單上都會跟動，位移依中心到視窗邊緣的距離漸變。離開頁面或視窗失焦時回正，追蹤開關與既有動畫暫停條件仍然生效。場景位於 keyed 表單之外，切換登入／註冊／忘記密碼仍保留表情、播放、滑鼠與地球偏好。760px 以下排列在表單上方，精細指標以外的裝置保留觸控捲動。角色拆件及道具組合保留在元件內部；獨立素材預覽頁及其拆件呈現介面已移除。

The account panel uses `pointerScope="page"` and the live form fields' center as `pointerOrigin`, tracking over both the background and form. Motion scales toward each viewport edge and returns to neutral on page departure or window blur. Keeping the scene outside the keyed form preserves expression, playback, pointer and globe preferences across account modes. At widths up to 760px it sits above the form; touch scrolling remains available. Scene parts remain internal components, and the standalone asset-preview page has been removed.

場景與各拆件的英文註解說明組合、對齊與動畫歸屬；`useCowWorkspaceMotion` 記錄表情時序、整頁跟動與 observer／listener／timer／rAF 清理。地球影格由 CSS 播放，`globeRotation` 不另外建立 JavaScript 計時器。文案及控制偏好由登入 feature 提供，共用場景不依賴 i18n 或帳號狀態。

English comments document scene composition, part alignment and motion ownership. `useCowWorkspaceMotion` describes phase timing, page tracking and observer/listener/timer/frame cleanup. CSS plays the globe frames, so `globeRotation` introduces no additional JavaScript clock. The auth feature supplies copy and control preferences; the shared scene has no dependency on i18n or account state.

正式完整分件位於 `src/assets/cow-workspace/`：`rig-*.svg` 為角色、`complete-*.svg` 為道具；生成資料為 `rig.ts` 與 `complete-props.ts`。SVG 不引用 PNG，也不含嵌入點陣圖片。

正式元件以同源 `scene-sprite.svg` 的 `<use>` 引用原始向量群組，JavaScript 只載入 `scene-metadata.ts` 的 ID、場景 viewBox 與影格資訊。路徑、顏色、透明度及順序保持原樣；地球的 120 張影格共用一組 CSS keyframes，以不同延遲維持 36 秒循環。Vite 負責素材 URL，部署時需讓 SVG 與頁面保持同源。

修改 `rig.ts`、`complete-props.ts` 或 `globe-rotation.ts` 後，在 `frontend/` 執行 `node scripts/build-cow-scene-sprite.mjs`，更新 sprite、metadata 及動畫 CSS。`node scripts/build-cow-scene-sprite.mjs --check` 檢查生成檔是否同步；`python3 scripts/verify-cow-scene-sprite.py` 獨立比對所有向量路徑、metadata 與影格播放順序。

舊的 `cow.svg`、`books.svg` 等與 `workspace.svg` 保留作原圖描圖基準。它們是原場景的分割結果，正式場景使用完整拆件。

## 重建

在作品集登入頁檢查完整場景、三種表情及動畫控制。

`src/assets/cow-workspace/rig-poses-review.svg` 以相同 viewBox 和顯示尺度並排呈現思考、打字完整牛，供檢查手臂比例與肩膀連接。

`complete-workspace.svg` 使用思考眼睛與平嘴，`complete-workspace-typing.svg` 使用既有打字眼睛與平嘴；`complete-workspace-glance.svg` 使用既有直視眼睛與微笑，保留托腮、放鬆手臂及相同桌面配置。三種完整場景都由獨立眼睛和嘴型疊在牛頭上。

`rig-arm-thickness-review.svg` 用相同牛頭、衣身、眼睛和尺度，對照思考／打字兩種姿勢修改前後的手臂。修改前的四件完整 SVG 和 PNG 原稿保存在 `rig-source/arm-thickness-before/`，重建比較板不依賴暫存目錄。

補畫使用內建 imagegen 工具。角色提示詞記錄於 `rig-prompts.json`，透明 PNG 原稿保存於 `rig-source/`；道具的獨立原稿保存於 `prop-source/`，提示詞記錄於 `prop-prompts.json`。原稿只作編輯與重建來源，正式元件不載入點陣圖。`rig-provenance.json` 與 `complete-props.source-map.json` 記錄來源雜湊與位置。所有桌面道具從各自原稿重建，舊場景的物件輪廓與接觸陰影不參與輸出。

```sh
python3 scripts/trace-cow-rig.py src/assets/cow-workspace/rig-build-manifest.json
python3 scripts/complete-cow-props.py
python3 scripts/build-cow-globe-rotation.py
python3 scripts/compose-cow-workspace.py
npx prettier --write src/assets/cow-workspace/rig.ts src/assets/cow-workspace/complete-props.ts
node scripts/build-cow-scene-sprite.mjs
node scripts/build-cow-scene-sprite.mjs --check
python3 scripts/verify-cow-scene-sprite.py
```

這是固定正面的 2.5D 堆疊；新增角度仍需要該角度的繪圖。書本目前是完整紙面一起微動，沒有逐頁翻書。
