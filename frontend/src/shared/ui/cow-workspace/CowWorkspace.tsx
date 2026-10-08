import { memo, type CSSProperties, type ReactNode } from 'react';
import { COW_RIG_BOUNDS, COW_RIG_PARTS } from '@/assets/cow-workspace/rig';
import {
  COMPLETE_COW_PROPS,
  COMPLETE_COW_PROP_BOUNDS,
  COMPLETE_COW_PROP_VIEWBOX,
} from '@/assets/cow-workspace/complete-props';
import {
  COW_GLOBE_ROTATION_BASE,
  COW_GLOBE_ROTATION_DURATION,
  COW_GLOBE_ROTATION_FRAMES,
  COW_GLOBE_ROTATION_OVERLAY,
} from '@/assets/cow-workspace/globe-rotation';
import '@/assets/cow-workspace/globe-rotation.css';
import {
  useCowWorkspaceMotion,
  type CowWorkspaceMotionOptions,
} from '@/shared/hooks/useCowWorkspaceMotion';
import styles from './CowWorkspace.module.css';

type RigLayerName = keyof typeof COW_RIG_PARTS;
type CompletePropName = keyof typeof COMPLETE_COW_PROPS;
interface VectorPath {
  fill: string;
  d: string;
  opacity?: number;
  transform?: string;
}
/** Each layer contains local vector paths only, never embedded bitmap images. */
const Paths = memo(function Paths({ name }: { name: CompletePropName }) {
  const paths: readonly VectorPath[] = COMPLETE_COW_PROPS[name];
  return paths.map((path, index) => (
    <path
      key={index}
      fill={path.fill}
      d={path.d}
      opacity={path.opacity}
      transform={path.transform}
    />
  ));
});

const RigPaths = memo(function RigPaths({ name }: { name: RigLayerName }) {
  const paths: readonly VectorPath[] = COW_RIG_PARTS[name];
  return paths.map((path, index) => (
    <path
      key={index}
      fill={path.fill}
      d={path.d}
      opacity={path.opacity}
      transform={path.transform}
    />
  ));
});

/** Complete rig primitives use the same scene coordinates and can be composed in any SVG. */
export function CowTorso({ pose = 'neutral' }: { pose?: 'neutral' | 'typing' } = {}) {
  return (
    <g data-cow-part="cow-body" data-cow-body-pose={pose} className={styles.cowRigBody}>
      <RigPaths name={pose === 'typing' ? 'cowBodyTyping' : 'cowBodyComplete'} />
    </g>
  );
}

export function CowHead() {
  return (
    <g data-cow-part="cow-head">
      <RigPaths name="cowHeadComplete" />
    </g>
  );
}

export function CowEyes({ state }: { state?: 'thinking' | 'working' | 'observer' } = {}) {
  if (state) {
    const part = {
      thinking: 'cowEyesThinking',
      working: 'cowEyesWorking',
      observer: 'cowEyesObserver',
    } as const;
    return (
      <g data-cow-part="cow-eyes" data-cow-eye-state={state}>
        <RigPaths name={part[state]} />
      </g>
    );
  }
  return (
    <g data-cow-part="cow-eyes">
      <g className={styles.cowEyesThinking} data-cow-eye-state="thinking">
        <RigPaths name="cowEyesThinking" />
      </g>
      <g className={styles.cowEyesWorking} data-cow-eye-state="working">
        <RigPaths name="cowEyesWorking" />
      </g>
      <g className={styles.cowEyesObserver} data-cow-eye-state="observer">
        <RigPaths name="cowEyesObserver" />
      </g>
    </g>
  );
}

export function CowMouth({ state }: { state?: 'neutral' | 'smile' } = {}) {
  if (state) {
    return (
      <g data-cow-part="cow-mouth" data-cow-mouth-state={state}>
        <RigPaths name={state === 'neutral' ? 'cowMouthNeutral' : 'cowMouthSmile'} />
      </g>
    );
  }
  return (
    <g data-cow-part="cow-mouth">
      <g className={styles.cowMouthNeutral} data-cow-mouth-state="neutral">
        <RigPaths name="cowMouthNeutral" />
      </g>
      <g className={styles.cowMouthSmile} data-cow-mouth-state="smile">
        <RigPaths name="cowMouthSmile" />
      </g>
    </g>
  );
}

export function CowArmLeft({ pose = 'thinking' }: { pose?: 'thinking' | 'typing' } = {}) {
  return (
    <g data-cow-part="cow-arm-left" data-cow-arm-pose={pose}>
      <RigPaths name={pose === 'thinking' ? 'cowArmLeftThinking' : 'cowArmLeftTyping'} />
    </g>
  );
}

export function CowArmRight({ pose = 'typing' }: { pose?: 'resting' | 'typing' } = {}) {
  return (
    <g data-cow-part="cow-arm-right" data-cow-arm-pose={pose}>
      <RigPaths name={pose === 'resting' ? 'cowArmRightResting' : 'cowArmRightTyping'} />
    </g>
  );
}

function CowTypingArms() {
  return (
    <g className={styles.cowTypingArms} data-cow-part="typing-arms">
      <g className={styles.cowTypingArmLeft}>
        <CowArmLeft pose="typing" />
      </g>
      <g className={styles.cowTypingArmRight}>
        <CowArmRight />
      </g>
    </g>
  );
}

/** Exported groups can also be composed inside a caller-owned SVG. */
export function CowBody({ typingArms = true }: { typingArms?: boolean } = {}) {
  return (
    <g data-cow-part="cow">
      <g data-cow-rig>
        <g className={styles.cowBodyNeutral}>
          <CowTorso />
        </g>
        <g className={styles.cowBodyTyping}>
          <CowTorso pose="typing" />
        </g>
        <g className={styles.cowRestingArm}>
          <CowArmRight pose="resting" />
        </g>
        <g className={styles.cowRigHead}>
          <CowHead />
          <CowEyes />
          <CowMouth />
        </g>
        <g className={styles.cowThinkingArm}>
          <CowArmLeft />
        </g>
        {typingArms && <CowTypingArms />}
      </g>
    </g>
  );
}

export function Laptop() {
  return (
    <g data-cow-part="laptop">
      <Paths name="laptop" />
    </g>
  );
}

export function CoffeeCup() {
  return (
    <g data-cow-part="coffee">
      <g className={styles.mug}>
        <Paths name="mug" />
      </g>
      <g className={styles.steam}>
        <Paths name="steam" />
      </g>
    </g>
  );
}

export function PlantLeaves() {
  return (
    <g data-cow-part="plant-leaves" className={styles.leaves}>
      <Paths name="plantLeaves" />
    </g>
  );
}

export function PlantPot() {
  return (
    <g data-cow-part="plant-pot">
      <Paths name="plantPot" />
    </g>
  );
}

export function Plant() {
  return (
    <g data-cow-part="plant">
      <PlantPot />
      <PlantLeaves />
    </g>
  );
}

export function BookStack() {
  return (
    <g data-cow-part="books">
      <Paths name="books" />
    </g>
  );
}

const GlobeSurfacePaths = memo(function GlobeSurfacePaths({
  paths,
}: {
  paths: readonly VectorPath[];
}) {
  return paths.map((path, index) => (
    <path key={index} fill={path.fill} d={path.d} opacity={path.opacity} />
  ));
});

const GlobeRotation = memo(function GlobeRotation() {
  return (
    <g className={styles.globeRotation} data-globe-surface="rotating">
      <GlobeSurfacePaths paths={COW_GLOBE_ROTATION_BASE} />
      {COW_GLOBE_ROTATION_FRAMES.map((frame, index) => (
        <g
          key={index}
          className={styles.globeTurnFrame}
          data-globe-frame={index}
          data-globe-angle={frame.angle}
          style={{
            animationName: `cow-globe-turn-${index}`,
            animationDuration: `${COW_GLOBE_ROTATION_DURATION}s`,
          }}
        >
          <GlobeSurfacePaths paths={frame.paths} />
        </g>
      ))}
      <GlobeSurfacePaths paths={COW_GLOBE_ROTATION_OVERLAY} />
    </g>
  );
});

export function Globe() {
  return (
    <g data-cow-part="globe">
      <g className={styles.globeStill} data-globe-surface="still">
        <Paths name="globeMap" />
      </g>
      <GlobeRotation />
      <Paths name="globeFrame" />
    </g>
  );
}

export function OpenBook() {
  return (
    <g data-cow-part="open-book">
      <g className={styles.bookPages}>
        <Paths name="openBook" />
      </g>
    </g>
  );
}

export function Desk({ contactShadows = false }: { contactShadows?: boolean } = {}) {
  return (
    <g data-cow-part="desk">
      <Paths name="desk" />
      {contactShadows && <Paths name="deskContactShadows" />}
    </g>
  );
}

function Depth({ children, depth, name }: { children: ReactNode; depth: number; name: string }) {
  return (
    <svg
      className={`${styles.sceneLayer} ${styles.depth}`}
      data-cow-depth={name}
      style={{ '--cow-depth': depth } as CSSProperties}
      viewBox={COMPLETE_COW_PROP_VIEWBOX}
      aria-hidden="true"
      shapeRendering="crispEdges"
    >
      {children}
    </svg>
  );
}

export interface CowWorkspaceProps extends CowWorkspaceMotionOptions {
  /** Accessible description supplied by the owning feature or locale adapter. */
  label: string;
  className?: string;
}

/** Eight reusable vector props, layered parallax and an ambient cow performance. */
export const CowWorkspace = memo(function CowWorkspace({
  label,
  className = '',
  motion = true,
  parallax = true,
  phase,
}: CowWorkspaceProps) {
  const interaction = useCowWorkspaceMotion({ motion, parallax, phase });
  return (
    <div
      {...interaction}
      className={`${styles.scene} ${className}`}
      role="img"
      aria-label={label}
      data-cow-scene
      data-cow-phase={phase ?? 'thinking'}
      data-cow-motion="paused"
    >
      <div className={styles.sceneCanvas} aria-hidden="true">
        <Depth name="cow" depth={1.5}>
          <CowBody />
        </Depth>
        <Depth name="desk" depth={0.5}>
          <Desk />
        </Depth>
        <Depth name="plant-pot" depth={2}>
          <PlantPot />
        </Depth>
        <Depth name="plant-leaves" depth={2}>
          <PlantLeaves />
        </Depth>
        <Depth name="books" depth={2.5}>
          <BookStack />
        </Depth>
        <Depth name="laptop" depth={3}>
          <Laptop />
        </Depth>
        <Depth name="globe" depth={4}>
          <Globe />
        </Depth>
        <Depth name="coffee" depth={3.5}>
          <CoffeeCup />
        </Depth>
        <Depth name="open-book" depth={4.5}>
          <OpenBook />
        </Depth>
      </div>
    </div>
  );
});

export const cowWorkspaceAssets = [
  'cow',
  'laptop',
  'coffee',
  'plant',
  'books',
  'globe',
  'openBook',
  'desk',
] as const;
export type CowWorkspaceAssetName = (typeof cowWorkspaceAssets)[number];
export type CowWorkspacePieceName = CowWorkspaceAssetName | 'plantPot' | 'plantLeaves';
export type CowRigPartName = RigLayerName;

export interface CowRigAssetProps {
  part: CowRigPartName;
  label: string;
  className?: string;
}

/** Inspect or reuse one complete rig part at its own natural bounds. */
export function CowRigAsset({ part, label, className = '' }: CowRigAssetProps) {
  const { x, y, width, height } = COW_RIG_BOUNDS[part];
  return (
    <svg
      className={`${styles.asset} ${styles.assetStatic} ${className}`}
      viewBox={`${x} ${y} ${width} ${height}`}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
    >
      <RigPaths name={part} />
    </svg>
  );
}

function unionViewBoxes(...viewBoxes: string[]) {
  const boxes = viewBoxes.map((viewBox) => {
    const [x = 0, y = 0, width = 1254, height = 1254] = viewBox.split(/\s+/).map(Number);
    return { x, y, right: x + width, bottom: y + height };
  });
  const left = Math.min(...boxes.map(({ x }) => x));
  const top = Math.min(...boxes.map(({ y }) => y));
  const right = Math.max(...boxes.map((box) => box.right));
  const bottom = Math.max(...boxes.map((box) => box.bottom));
  return `${left} ${top} ${right - left} ${bottom - top}`;
}

function assetViewBox(part: CowWorkspacePieceName) {
  if (part === 'cow') {
    const { x, y, width, height } = COW_RIG_BOUNDS.cow;
    return `${x} ${y} ${width} ${height}`;
  }
  if (part === 'plant') {
    return unionViewBoxes(COMPLETE_COW_PROP_BOUNDS.plantPot, COMPLETE_COW_PROP_BOUNDS.plantLeaves);
  }
  return COMPLETE_COW_PROP_BOUNDS[part];
}

const assetComponents: Record<CowWorkspacePieceName, () => ReactNode> = {
  cow: CowBody,
  laptop: Laptop,
  coffee: CoffeeCup,
  plant: Plant,
  books: BookStack,
  globe: Globe,
  openBook: OpenBook,
  desk: Desk,
  plantPot: PlantPot,
  plantLeaves: PlantLeaves,
};

export interface CowWorkspaceAssetProps extends CowWorkspaceMotionOptions {
  part: CowWorkspaceAssetName;
  label: string;
  className?: string;
}

export interface CowWorkspacePieceProps extends CowWorkspaceMotionOptions {
  part: CowWorkspacePieceName;
  label: string;
  className?: string;
}

function AnimatedAsset({
  part,
  label,
  className = '',
  motion,
  parallax,
  phase,
}: CowWorkspacePieceProps) {
  const interaction = useCowWorkspaceMotion({ motion, parallax, phase });
  const Asset = assetComponents[part];
  const viewBox = assetViewBox(part);
  const [, , width, height] = viewBox.split(/\s+/).map(Number);
  return (
    <div
      {...interaction}
      role="img"
      aria-label={label}
      className={`${styles.scene} ${className}`}
      style={{ aspectRatio: `${width} / ${height}` }}
      data-cow-scene
      data-cow-phase={phase ?? 'thinking'}
      data-cow-motion="paused"
    >
      <svg
        className={styles.canvas}
        viewBox={viewBox}
        aria-hidden="true"
        shapeRendering="crispEdges"
      >
        <Asset />
      </svg>
    </div>
  );
}

/** Complete independent props, including separate pot and foliage, share motion controls. */
export function CowWorkspacePiece({
  part,
  label,
  className = '',
  motion,
  parallax = false,
  phase,
}: CowWorkspacePieceProps) {
  if (motion !== undefined || parallax || phase !== undefined) {
    return (
      <AnimatedAsset
        part={part}
        label={label}
        className={className}
        motion={motion ?? parallax}
        parallax={parallax}
        phase={phase}
      />
    );
  }
  const Asset = assetComponents[part];
  return (
    <svg
      className={`${styles.asset} ${styles.assetStatic} ${className}`}
      viewBox={assetViewBox(part)}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
    >
      <Asset />
    </svg>
  );
}

/** Preserve the original eight-asset API while allowing separate pieces through CowWorkspacePiece. */
export function CowWorkspaceAsset(props: CowWorkspaceAssetProps) {
  return <CowWorkspacePiece {...props} />;
}
