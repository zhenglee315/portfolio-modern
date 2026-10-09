import { memo, type CSSProperties, type ReactNode } from 'react';
import {
  COW_RIG_PART_IDS,
  COMPLETE_COW_PROP_IDS,
  COMPLETE_COW_PROP_VIEWBOX,
  COW_GLOBE_ROTATION_BASE_ID,
  COW_GLOBE_ROTATION_DURATION,
  COW_GLOBE_ROTATION_FRAMES,
  COW_GLOBE_ROTATION_OVERLAY_ID,
} from '@/assets/cow-workspace/scene-metadata';
import spriteUrl from '@/assets/cow-workspace/scene-sprite.svg?url';
import '@/assets/cow-workspace/scene-globe-animation.css';
import {
  useCowWorkspaceMotion,
  type CowWorkspaceMotionOptions,
} from '@/shared/hooks/useCowWorkspaceMotion';
import styles from './CowWorkspace.module.css';

type RigLayerName = keyof typeof COW_RIG_PART_IDS;
type CompletePropName = keyof typeof COMPLETE_COW_PROP_IDS;
/** Drawing data stays in a same-origin SVG asset; React owns only scene composition. */
const Paths = memo(function Paths({ name }: { name: CompletePropName }) {
  return <use href={`${spriteUrl}#${COMPLETE_COW_PROP_IDS[name]}`} />;
});

/** Resolve a typed character part from the same-origin sprite. */
const RigPaths = memo(function RigPaths({ name }: { name: RigLayerName }) {
  return <use href={`${spriteUrl}#${COW_RIG_PART_IDS[name]}`} />;
});

/** Keep neutral and typing torso poses in the shared rig coordinates. */
function CowTorso({ pose = 'neutral' }: { pose?: 'neutral' | 'typing' } = {}) {
  return (
    <g data-cow-part="cow-body" data-cow-body-pose={pose} className={styles.cowRigBody}>
      <RigPaths name={pose === 'typing' ? 'cowBodyTyping' : 'cowBodyComplete'} />
    </g>
  );
}

/** Place the blank head beneath independently selected eyes and mouth. */
function CowHead() {
  return (
    <g data-cow-part="cow-head">
      <RigPaths name="cowHeadComplete" />
    </g>
  );
}

/** Keep all three eye poses mounted so scene-phase CSS selects their visibility. */
function CowEyes() {
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

/** Align neutral and smiling mouths with the same head transform. */
function CowMouth() {
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

/** Select the thinking or typing left arm while preserving its rig anchor. */
function CowArmLeft({ pose = 'thinking' }: { pose?: 'thinking' | 'typing' } = {}) {
  return (
    <g data-cow-part="cow-arm-left" data-cow-arm-pose={pose}>
      <RigPaths name={pose === 'thinking' ? 'cowArmLeftThinking' : 'cowArmLeftTyping'} />
    </g>
  );
}

/** Select the resting or typing right arm within the character's depth layer. */
function CowArmRight({ pose = 'typing' }: { pose?: 'resting' | 'typing' } = {}) {
  return (
    <g data-cow-part="cow-arm-right" data-cow-arm-pose={pose}>
      <RigPaths name={pose === 'resting' ? 'cowArmRightResting' : 'cowArmRightTyping'} />
    </g>
  );
}

/** Group both typing arms so CSS can animate each hand independently. */
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

/** Compose both body poses beneath one head so phase changes preserve rig alignment. */
function CowBody() {
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
        <CowTypingArms />
      </g>
    </g>
  );
}

const thinkingSaucers = [
  { delay: 0, accent: '#6ee7ed' },
  { delay: -2, accent: '#ffd17d' },
  { delay: -4, accent: '#a9df9c' },
] as const;

/** Complete pixel saucers orbit independently of the head's tilt and bounds. */
function CowThinkingOrbit({ side }: { side: 'back' | 'front' }) {
  return (
    <g
      className={styles.cowThinkingOrbit}
      data-cow-part="thinking-orbit"
      data-cow-orbit-side={side}
      transform="translate(617 8)"
    >
      {thinkingSaucers.map(({ delay, accent }) => (
        <g
          key={accent}
          className={side === 'back' ? styles.thoughtOrbitBack : styles.thoughtOrbitFront}
          style={{ '--cow-orbit-delay': `${delay}s` } as CSSProperties}
        >
          <g className={styles.thoughtSaucerOrbit}>
            <path
              d="M-36-2H-28V-8H-18V-18H-12V-24H12V-18H18V-8H28V-2H36V8H28V14H-28V8H-36Z"
              fill="#202331"
            />
            <path d="M-14-8V-16H-8V-20H8V-16H14V-8Z" fill={accent} />
            <path d="M-8-16H0V-12H-8Z" fill="#fff8db" />
            <path d="M-26-4H26V0H32V4H-32V0H-26Z" fill="#e8e6dc" />
            <path d="M-30 4H30V8H24V10H-24V8H-30Z" fill="#858d9f" />
            <path d="M-22 4H-16V8H-22ZM-3 4H3V8H-3ZM16 4H22V8H16Z" fill={accent} />
            <path d="M-16 10H16V12H-16Z" fill="#525a70" />
          </g>
        </g>
      ))}
    </g>
  );
}

const typingSweatDrops = [
  { x: 386, y: 111, angle: 136, scale: 0.65, delay: 0 },
  { x: 259, y: 366, angle: 103, scale: 0.8, delay: -0.4 },
  { x: 278, y: 529, angle: 71, scale: 0.7, delay: -0.8 },
  { x: 855, y: 111, angle: -136, scale: 0.65, delay: -1.2 },
  { x: 989, y: 366, angle: -103, scale: 0.8, delay: -1.6 },
  { x: 964, y: 529, angle: -71, scale: 0.7, delay: -2 },
] as const;

/** Pixel sweat sprays away from the silhouette without changing the facial rig. */
function CowTypingSweat() {
  return (
    <g className={styles.cowTypingSweat} data-cow-part="typing-sweat">
      {typingSweatDrops.map(({ x, y, angle, scale, delay }) => (
        <g
          key={`${x}-${y}`}
          transform={`translate(${x} ${y}) rotate(${angle}) scale(${scale})`}
          style={{ '--cow-sweat-delay': `${delay}s` } as CSSProperties}
        >
          <g className={styles.typingSweatDrop}>
            <path
              d="M-2-24H2V-16H6V-8H10V0H14V8H18V20H14V28H6V32H-6V28H-14V20H-18V8H-14V0H-10V-8H-6V-16H-2Z"
              fill="#274653"
            />
            <path
              d="M-2-12H2V-4H6V4H10V12H14V20H10V24H4V28H-4V24H-10V20H-14V12H-10V4H-6V-4H-2Z"
              fill="#9ce3ee"
            />
            <path d="M-6 6H-2V10H-6ZM-10 12H-6V20H-10Z" fill="#f0ffff" />
            <path d="M-13-34H-9V-30H-13ZM9-40H13V-36H9Z" fill="#63c5d7" />
          </g>
        </g>
      ))}
    </g>
  );
}

/** Render the laptop separately from its typing rays while sharing their depth. */
function Laptop() {
  return (
    <g data-cow-part="laptop">
      <Paths name="laptop" />
    </g>
  );
}

const laptopTypingRays = [
  { x: 451, y: 823, angle: -40, delay: 0, color: '#ffc96b' },
  { x: 541, y: 823, angle: -18, delay: 0.18, color: '#6ee7ed' },
  { x: 730, y: 823, angle: 20, delay: 0.36, color: '#ffc96b' },
  { x: 829, y: 834, angle: 46, delay: 0, color: '#6ee7ed' },
  { x: 427, y: 907, angle: -90, delay: 0.36, color: '#6ee7ed' },
  { x: 853, y: 924, angle: 90, delay: 0.18, color: '#ffc96b' },
  { x: 477, y: 1024, angle: -130, delay: 0.18, color: '#ffc96b' },
  { x: 819, y: 1036, angle: 137, delay: 0.36, color: '#6ee7ed' },
] as const;

/** Decorative pixel rays share the laptop's depth; desk props cover their roots. */
function LaptopTypingLight() {
  return (
    <g className={styles.laptopTypingLight} data-cow-part="laptop-typing-light">
      {laptopTypingRays.map(({ x, y, angle, delay, color }, index) => (
        <g key={index} transform={`translate(${x} ${y}) rotate(${angle})`}>
          <g
            className={styles.laptopLightRay}
            style={{ '--laptop-light-delay': `${delay}s` } as CSSProperties}
          >
            <path d="M-6 0H6V-14H10V-34H6V-68H-6V-34H-10V-14H-6Z" fill={color} />
            <path d="M-2-8H2V-60H-2Z" fill="#fff8db" />
            <path d="M-3-82H3V-88H-3Z" fill={color} />
          </g>
        </g>
      ))}
    </g>
  );
}

/** Animate the mug and steam independently within the cup's shared depth layer. */
function CoffeeCup() {
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

/** Keep leaf sway separate from the stable pot so it retains its own pivot. */
function PlantLeaves() {
  return (
    <g data-cow-part="plant-leaves" className={styles.leaves}>
      <Paths name="plantLeaves" />
    </g>
  );
}

/** Render the stable pot beneath the separately animated leaves. */
function PlantPot() {
  return (
    <g data-cow-part="plant-pot">
      <Paths name="plantPot" />
    </g>
  );
}

/** Keep stacked books as one prop; depth motion belongs to the parent layer. */
function BookStack() {
  return (
    <g data-cow-part="books">
      <Paths name="books" />
    </g>
  );
}

/** Resolve generated globe surfaces from the sprite without loading their paths into JavaScript. */
const GlobeSurfacePaths = memo(function GlobeSurfacePaths({ id }: { id: string }) {
  return <use href={`${spriteUrl}#${id}`} />;
});

/**
 * Play precomputed globe surfaces with one CSS keyframe and staggered frame delays.
 * The globe toggle pauses these frames in place without rebuilding their timeline.
 */
const GlobeRotation = memo(function GlobeRotation() {
  return (
    <g className={styles.globeRotation} data-globe-surface="rotating">
      <GlobeSurfacePaths id={COW_GLOBE_ROTATION_BASE_ID} />
      {COW_GLOBE_ROTATION_FRAMES.map((frame, index) => (
        <g
          key={index}
          className={styles.globeTurnFrame}
          data-globe-frame={index}
          data-globe-angle={frame.angle}
          style={{
            animationName: 'cow-globe-turn',
            animationDuration: `${COW_GLOBE_ROTATION_DURATION}s`,
            animationDelay: `${
              index === 0
                ? 0
                : -(
                    ((COW_GLOBE_ROTATION_FRAMES.length - index) * COW_GLOBE_ROTATION_DURATION) /
                    COW_GLOBE_ROTATION_FRAMES.length
                  )
            }s`,
          }}
        >
          <GlobeSurfacePaths id={frame.id} />
        </g>
      ))}
      <GlobeSurfacePaths id={COW_GLOBE_ROTATION_OVERLAY_ID} />
    </g>
  );
});

/** Let scene motion CSS select the globe surface while keeping its frame fixed. */
function Globe() {
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

/** Move one complete page surface so the traced gutter and paper edges stay aligned. */
function OpenBook() {
  return (
    <g data-cow-part="open-book">
      <g className={styles.bookPages}>
        <Paths name="openBook" />
      </g>
    </g>
  );
}

/** Place the desktop in front of the character body and behind the loose props. */
function Desk() {
  return (
    <g data-cow-part="desk">
      <Paths name="desk" />
    </g>
  );
}

/**
 * Wrap a prop in common scene coordinates and publish its parallax depth.
 * name identifies the layer for inspection; the motion hook and CSS own its movement.
 */
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
  /** Independently hold the globe's current rotation frame. */
  globeRotation?: boolean;
}

/**
 * Compose independent vector layers with the shared motion lifecycle.
 * The caller supplies accessible copy and motion preferences; the hook owns timers and listeners.
 * globeRotation only pauses the globe's CSS frames, leaving phase and pointer clocks intact.
 */
export const CowWorkspace = memo(function CowWorkspace({
  label,
  className = '',
  motion = true,
  parallax = true,
  globeRotation = true,
  pointerScope,
  pointerOrigin,
  phase,
}: CowWorkspaceProps) {
  const interaction = useCowWorkspaceMotion({
    motion,
    parallax,
    phase,
    pointerScope,
    pointerOrigin,
  });
  return (
    <div
      {...interaction}
      className={`${styles.scene} ${className}`}
      role="img"
      aria-label={label}
      data-cow-scene
      data-cow-phase={phase ?? 'thinking'}
      data-cow-motion="paused"
      data-cow-globe-motion={globeRotation ? 'active' : 'paused'}
    >
      <div className={styles.sceneCanvas} aria-hidden="true">
        <Depth name="cow" depth={1.5}>
          <CowThinkingOrbit side="back" />
          <CowBody />
          <CowThinkingOrbit side="front" />
          <CowTypingSweat />
        </Depth>
        <Depth name="desk" depth={0.5}>
          <Desk />
        </Depth>
        <Depth name="laptop-light" depth={3}>
          <LaptopTypingLight />
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
