import { memo, useState, type CSSProperties } from 'react';
import { createRoot } from 'react-dom/client';
import sourceImage from '../../../backend/SYSTEM/static/icon/logo.png?url';
import {
  CowRigAsset,
  CowWorkspace,
  CowWorkspaceAsset,
  CowWorkspacePiece,
} from '@/shared/ui/cow-workspace/CowWorkspace';
import type {
  CowWorkspaceMotionOptions,
  CowWorkspacePhase,
} from '@/shared/hooks/useCowWorkspaceMotion';
import './cow-workspace.css';

const assetFiles = import.meta.glob<string>('../assets/cow-workspace/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
});

const rigPieceNames = [
  'cowHeadComplete',
  'cowBodyComplete',
  'cowBodyTyping',
  'cowArmLeftThinking',
  'cowArmLeftTyping',
  'cowArmRightTyping',
  'cowArmRightResting',
  'cowEyesThinking',
  'cowEyesWorking',
  'cowEyesObserver',
  'cowMouthNeutral',
  'cowMouthSmile',
] as const;
type RigPieceName = (typeof rigPieceNames)[number];

const propPieceNames = [
  'books',
  'globe',
  'openBook',
  'laptop',
  'coffee',
  'plantPot',
  'plantLeaves',
  'desk',
] as const;
type PropPieceName = (typeof propPieceNames)[number];

interface PieceInfo {
  name: string;
  detail: string;
  file: string;
}

const cowInfo: PieceInfo = {
  name: '完整牛工程師',
  detail: '把頭、身體、手臂、眼睛與嘴巴組在一起',
  file: 'rig-cow.svg',
};

const rigPieces: Record<RigPieceName, PieceInfo> = {
  cowHeadComplete: {
    name: '牛頭',
    detail: '完整頭部，可以疊上不同眼神與嘴巴',
    file: 'rig-cowHeadComplete.svg',
  },
  cowBodyComplete: { name: '牛身體', detail: '完整肩膀與腰身', file: 'rig-cowBodyComplete.svg' },
  cowBodyTyping: {
    name: '牛身體・打字',
    detail: '和打字雙臂連接的完整衣身',
    file: 'rig-cowBodyTyping.svg',
  },
  cowArmLeftThinking: {
    name: '左側手臂・思考',
    detail: '手托下巴，想一想',
    file: 'rig-cowArmLeftThinking.svg',
  },
  cowArmLeftTyping: {
    name: '左側手臂・打字',
    detail: '向桌前伸出的完整手臂',
    file: 'rig-cowArmLeftTyping.svg',
  },
  cowArmRightTyping: {
    name: '右側手臂・打字',
    detail: '和左手一起敲代碼',
    file: 'rig-cowArmRightTyping.svg',
  },
  cowArmRightResting: {
    name: '右側手臂・放鬆',
    detail: '自然垂下的完整手臂',
    file: 'rig-cowArmRightResting.svg',
  },
  cowEyesThinking: {
    name: '眼睛・思考中',
    detail: '托腮想一想，和寫代碼時不同的眼神',
    file: 'rig-cowEyesThinking.svg',
  },
  cowEyesWorking: {
    name: '眼睛・寫代碼',
    detail: '視線朝下，看著電腦',
    file: 'rig-cowEyesWorking.svg',
  },
  cowEyesObserver: {
    name: '眼睛・看著你',
    detail: '朝前看，像是在和你對視',
    file: 'rig-cowEyesObserver.svg',
  },
  cowMouthNeutral: {
    name: '嘴巴・認真思考',
    detail: '平嘴，思考和寫代碼時使用',
    file: 'rig-cowMouthNeutral.svg',
  },
  cowMouthSmile: {
    name: '嘴巴・微笑',
    detail: '看著你時輕輕微笑',
    file: 'rig-cowMouthSmile.svg',
  },
};

const propPieces: Record<PropPieceName, PieceInfo> = {
  books: { name: '那疊書', detail: '五本書，各有完整的封面與書頁', file: 'complete-books.svg' },
  globe: {
    name: '地球儀',
    detail: '球面持續轉動，支架與底座固定',
    file: 'complete-globe-rotating.svg',
  },
  openBook: { name: '打開的書', detail: '兩頁插圖與完整書脊', file: 'complete-openBook.svg' },
  laptop: { name: '筆記型電腦', detail: '完整電腦輪廓', file: 'complete-laptop.svg' },
  coffee: { name: '咖啡杯', detail: '杯身、把手與熱氣都在', file: 'complete-coffee.svg' },
  plantPot: { name: '花盆', detail: '完整盆身，可以另外放入葉片', file: 'complete-plantPot.svg' },
  plantLeaves: {
    name: '盆栽葉片',
    detail: '和花盆分開的完整葉片',
    file: 'complete-plantLeaves.svg',
  },
  desk: { name: '桌子', detail: '完整桌面，把小物件一層層放上去', file: 'complete-desk.svg' },
};

type PieceSelection =
  { kind: 'cow' } | { kind: 'rig'; part: RigPieceName } | { kind: 'prop'; part: PropPieceName };

const PiecePreview = memo(function PiecePreview({
  selection,
  className = '',
  ...motion
}: {
  selection: Exclude<PieceSelection, { kind: 'cow' }>;
  className?: string;
} & CowWorkspaceMotionOptions) {
  if (selection.kind === 'rig') {
    return (
      <CowRigAsset
        part={selection.part}
        label={rigPieces[selection.part].name}
        className={`piece-vector ${className}`}
      />
    );
  }
  return (
    <CowWorkspacePiece
      {...motion}
      part={selection.part}
      label={propPieces[selection.part].name}
      className={`piece-vector ${className}`}
    />
  );
});

function Preview() {
  const [motion, setMotion] = useState(false);
  const [parallax, setParallax] = useState(false);
  const [view, setView] = useState<'original' | 'svg'>('svg');
  const [phase, setPhase] = useState<CowWorkspacePhase>();
  const [dark, setDark] = useState(false);
  const [selected, setSelected] = useState<PieceSelection>({ kind: 'cow' });
  const [inspectionTime, setInspectionTime] = useState<number>();
  const previewPhase = phase ?? (inspectionTime !== undefined ? 'thinking' : undefined);
  const selectedInfo =
    selected.kind === 'cow'
      ? cowInfo
      : selected.kind === 'rig'
        ? rigPieces[selected.part]
        : propPieces[selected.part];
  const poses: { value: CowWorkspacePhase | undefined; label: string }[] = [
    { value: undefined, label: '自然循環' },
    { value: 'thinking', label: '思考中' },
    { value: 'typing', label: '寫代碼' },
    { value: 'glance', label: '看著你' },
  ];

  return (
    <main
      className="workspace-preview"
      data-dark={dark}
      data-frame-inspection={inspectionTime !== undefined}
      style={{ '--preview-frame-seconds': inspectionTime ?? 0 } as CSSProperties}
    >
      <header className="preview-header">
        <a href="#workspace" className="preview-brand">
          <span className="brand-mark">
            ZL<span>.</span>
          </span>
          <span>THE LITTLE WORKSPACE</span>
        </a>
        <button className="theme-control" onClick={() => setDark(!dark)} aria-pressed={dark}>
          {dark ? '☀ 淺色背景' : '☾ 深色背景'}
        </button>
      </header>
      <section className="preview-introduction">
        <p className="preview-eyebrow">一個會陪你工作的 SVG 小世界</p>
        <h1>
          思考一下，
          <br />
          繼續寫<span>。</span>
        </h1>
        <p>先切換原圖與 SVG 比對，再開啟動畫與滑鼠視差。</p>
      </section>
      <section id="workspace" className="preview-workbench" aria-label="完整動畫預覽">
        <div className="scene-stage">
          <span className="stage-coordinate coordinate-top">
            01 / {view === 'original' ? 'ORIGINAL' : 'SVG WORKSPACE'}
          </span>
          <div className="preview-comparison">
            <div className="preview-svg" hidden={view === 'original'}>
              <CowWorkspace
                label="牛工程師坐在桌前思考與打字，桌上有筆電、咖啡、盆栽、書本和地球儀"
                className="preview-scene"
                motion={motion && view === 'svg'}
                parallax={parallax && view === 'svg'}
                phase={previewPhase}
              />
            </div>
            <img
              className="preview-source"
              src={sourceImage}
              alt="牛工程師桌面原圖"
              width="1254"
              height="1254"
              hidden={view !== 'original'}
            />
          </div>
          <span className="stage-coordinate coordinate-bottom">MOVE SLOWLY. MAKE SOMETHING.</span>
        </div>
        <aside className="preview-controls">
          <div className="comparison-controls" role="group" aria-label="預覽版本">
            <button aria-pressed={view === 'original'} onClick={() => setView('original')}>
              原圖
            </button>
            <button aria-pressed={view === 'svg'} onClick={() => setView('svg')}>
              SVG
            </button>
          </div>
          <p className="preview-eyebrow">讓他做點什麼</p>
          <div className="pose-controls" role="group" aria-label="牛的姿勢">
            {poses.map((pose) => (
              <button
                key={pose.label}
                aria-pressed={phase === pose.value}
                onClick={() => {
                  setPhase(pose.value);
                  setMotion(true);
                }}
              >
                <span className="control-dot" />
                {pose.label}
              </button>
            ))}
          </div>
          <div className="motion-controls">
            <button
              aria-label="動畫"
              aria-pressed={motion}
              onClick={() => {
                setInspectionTime(undefined);
                setMotion(!motion);
              }}
            >
              <span>{motion ? 'Ⅱ' : '▷'}</span>
              {motion ? '暫停動畫' : '播放動畫'}
            </button>
            <button
              aria-label="滑鼠視差"
              aria-pressed={parallax}
              onClick={() => {
                setParallax(!parallax);
                if (!parallax) setMotion(true);
              }}
            >
              <span>↔</span>
              {parallax ? '關閉滑鼠視差' : '開啟滑鼠視差'}
            </button>
          </div>
          <label className="frame-control">
            動畫影格
            <select
              aria-label="動畫影格"
              value={inspectionTime ?? 'live'}
              onChange={(event) => {
                const value = event.target.value;
                setInspectionTime(value === 'live' ? undefined : Number(value));
                if (value !== 'live') setMotion(true);
              }}
            >
              <option value="live">即時播放</option>
              {[0, 3.5, 6, 9, 12.5, 14, 18].map((time) => (
                <option key={time} value={time}>
                  {time} 秒
                </option>
              ))}
            </select>
          </label>
          <p className="controls-note">預設為靜態預覽。動畫會遵循系統的減少動態效果設定。</p>
          <div className="scene-downloads">
            <a
              href={assetFiles['../assets/cow-workspace/complete-workspace.svg']}
              download="complete-workspace.svg"
            >
              下載完整桌面 SVG <span aria-hidden="true">↓</span>
            </a>
            <a
              href={assetFiles['../assets/cow-workspace/complete-workspace-typing.svg']}
              download="complete-workspace-typing.svg"
            >
              下載打字姿勢 SVG <span aria-hidden="true">↓</span>
            </a>
            <a
              href={assetFiles['../assets/cow-workspace/complete-workspace-glance.svg']}
              download="complete-workspace-glance.svg"
            >
              下載微笑姿勢 SVG <span aria-hidden="true">↓</span>
            </a>
          </div>
          <div className="selected-asset">
            <span className="preview-eyebrow">目前選取</span>
            {selected.kind === 'cow' ? (
              <CowWorkspaceAsset
                part="cow"
                label={cowInfo.name}
                className="selected-preview"
                motion={motion}
                parallax={parallax}
                phase={previewPhase}
              />
            ) : (
              <PiecePreview
                selection={selected}
                className="selected-preview"
                motion={motion}
                parallax={parallax}
                phase={previewPhase}
              />
            )}
            <strong>{selectedInfo.name}</strong>
            <p>{selectedInfo.detail}</p>
            <a
              href={assetFiles[`../assets/cow-workspace/${selectedInfo.file}`]}
              download={selectedInfo.file}
            >
              下載 SVG <span aria-hidden="true">↓</span>
            </a>
          </div>
        </aside>
      </section>
      <section className="asset-section" aria-labelledby="cow-pieces-heading">
        <div className="asset-heading">
          <div>
            <p className="preview-eyebrow">THE COW, PIECE BY PIECE</p>
            <h2 id="cow-pieces-heading">牛的拆件。</h2>
            <p className="asset-section-note">
              頭、身體、手臂、三種眼神與嘴巴都能分開使用。左右以畫面方向為準。
            </p>
          </div>
          <span>{String(rigPieceNames.length).padStart(2, '0')} / COW PARTS</span>
        </div>
        <div className="asset-grid">
          <button
            className="asset-card"
            aria-pressed={selected.kind === 'cow'}
            onClick={() => setSelected({ kind: 'cow' })}
          >
            <span className="asset-number">完整組合</span>
            <div className="asset-image" aria-hidden="true">
              <CowWorkspaceAsset part="cow" label={cowInfo.name} />
            </div>
            <strong>{cowInfo.name}</strong>
            <span className="asset-detail">{cowInfo.detail}</span>
          </button>
          {rigPieceNames.map((part, index) => (
            <button
              key={part}
              className="asset-card"
              aria-pressed={selected.kind === 'rig' && selected.part === part}
              onClick={() => setSelected({ kind: 'rig', part })}
            >
              <span className="asset-number">{String(index + 1).padStart(2, '0')}</span>
              <div className="asset-image" aria-hidden="true">
                <PiecePreview selection={{ kind: 'rig', part }} />
              </div>
              <strong>{rigPieces[part].name}</strong>
              <span className="asset-detail">{rigPieces[part].detail}</span>
            </button>
          ))}
        </div>
      </section>
      <section className="asset-section" aria-labelledby="props-heading">
        <div className="asset-heading">
          <div>
            <p className="preview-eyebrow">EIGHT COMPLETE DESK PIECES</p>
            <h2 id="props-heading">桌上的完整部件。</h2>
            <p className="asset-section-note">
              每個物件都完整畫好，可以單獨使用，再一層層疊回桌面。
            </p>
          </div>
          <span>08 / DESK PARTS</span>
        </div>
        <div className="asset-grid">
          {propPieceNames.map((part, index) => (
            <button
              key={part}
              className="asset-card"
              aria-pressed={selected.kind === 'prop' && selected.part === part}
              onClick={() => setSelected({ kind: 'prop', part })}
            >
              <span className="asset-number">0{index + 1}</span>
              <div className="asset-image" aria-hidden="true">
                <PiecePreview selection={{ kind: 'prop', part }} />
              </div>
              <strong>{propPieces[part].name}</strong>
              <span className="asset-detail">{propPieces[part].detail}</span>
            </button>
          ))}
        </div>
      </section>
      <footer className="preview-footer">
        <span>ZL. / A SMALL PLACE FOR BIG IDEAS</span>
        <span>像素風 · 向量部件 · 滑鼠視差</span>
      </footer>
    </main>
  );
}

const root = document.getElementById('root');
if (root) createRoot(root).render(<Preview />);
