import airplane from 'bootstrap-icons/icons/airplane-fill.svg?raw';
import home from 'bootstrap-icons/icons/house-door-fill.svg?raw';
import briefcase from 'bootstrap-icons/icons/briefcase-fill.svg?raw';
import award from 'bootstrap-icons/icons/award-fill.svg?raw';
import braces from 'bootstrap-icons/icons/braces-asterisk.svg?raw';
import linkedin from 'bootstrap-icons/icons/linkedin.svg?raw';
import github from 'bootstrap-icons/icons/github.svg?raw';
import medium from 'bootstrap-icons/icons/medium.svg?raw';
import envelope from 'bootstrap-icons/icons/envelope-fill.svg?raw';
import palette from 'bootstrap-icons/icons/palette-fill.svg?raw';
import translate from 'bootstrap-icons/icons/translate.svg?raw';
import chat from 'bootstrap-icons/icons/chat-dots-fill.svg?raw';
import list from 'bootstrap-icons/icons/list.svg?raw';
import close from 'bootstrap-icons/icons/x-lg.svg?raw';
import collapse from 'bootstrap-icons/icons/chevron-double-left.svg?raw';
import arrow from 'bootstrap-icons/icons/arrow-up-right.svg?raw';
import play from 'bootstrap-icons/icons/play-fill.svg?raw';
import pause from 'bootstrap-icons/icons/pause-fill.svg?raw';
import restart from 'bootstrap-icons/icons/arrow-counterclockwise.svg?raw';
import building from 'bootstrap-icons/icons/building-fill.svg?raw';
import education from 'bootstrap-icons/icons/mortarboard-fill.svg?raw';
import plus from 'bootstrap-icons/icons/plus-lg.svg?raw';
import minus from 'bootstrap-icons/icons/dash-lg.svg?raw';
import check from 'bootstrap-icons/icons/check-lg.svg?raw';
import arrowRight from 'bootstrap-icons/icons/arrow-right.svg?raw';
import arrowUp from 'bootstrap-icons/icons/arrow-up.svg?raw';
import plusCircle from 'bootstrap-icons/icons/plus-circle-dotted.svg?raw';
import personHearts from 'bootstrap-icons/icons/person-hearts.svg?raw';
import doorOpen from 'bootstrap-icons/icons/door-open-fill.svg?raw';
import doorOpenOutline from 'bootstrap-icons/icons/door-open.svg?raw';
import repeat from 'bootstrap-icons/icons/repeat.svg?raw';
import cupHot from 'bootstrap-icons/icons/cup-hot-fill.svg?raw';
import dpad from 'bootstrap-icons/icons/dpad-fill.svg?raw';
import balloon from 'bootstrap-icons/icons/balloon-fill.svg?raw';
import mouse2 from 'bootstrap-icons/icons/mouse2-fill.svg?raw';
import globeAmericas from 'bootstrap-icons/icons/globe-americas-fill.svg?raw';
import eye from 'bootstrap-icons/icons/eye-fill.svg?raw';
import eyeSlash from 'bootstrap-icons/icons/eye-slash-fill.svg?raw';
import lock from 'bootstrap-icons/icons/lock-fill.svg?raw';
import send from 'bootstrap-icons/icons/send-fill.svg?raw';
import sendCheck from 'bootstrap-icons/icons/send-check-fill.svg?raw';
import success from 'bootstrap-icons/icons/check-circle-fill.svg?raw';
import warning from 'bootstrap-icons/icons/exclamation-triangle-fill.svg?raw';
import error from 'bootstrap-icons/icons/x-circle-fill.svg?raw';
import bug from 'bootstrap-icons/icons/bug-fill.svg?raw';
import { memo, type ReactNode } from 'react';

const icons = {
  airplane,
  home,
  briefcase,
  award,
  braces,
  linkedin,
  github,
  medium,
  envelope,
  palette,
  translate,
  chat,
  list,
  close,
  collapse,
  arrow,
  play,
  pause,
  restart,
  building,
  education,
  plus,
  minus,
  check,
  arrowRight,
  arrowUp,
  plusCircle,
  personHearts,
  doorOpen,
  doorOpenOutline,
  repeat,
  cupHot,
  dpad,
  balloon,
  mouse2,
  globeAmericas,
  eye,
  eyeSlash,
  lock,
  send,
  sendCheck,
  success,
  warning,
  error,
  bug,
};
export type IconName = keyof typeof icons;
type IconPulse = 'chat' | 'disclosure';

/** One decoration contract serves individual SVGs and icon/text groups. */
function iconDecoration(pulse: IconPulse | undefined, highlight: boolean) {
  return {
    'data-icon-pulse': pulse,
    'data-icon-highlight': highlight || pulse === 'chat' ? '' : undefined,
    'data-decoration': pulse ? '' : undefined,
  };
}

/** Animate decorative icon/copy together while the owning control stays still. */
export function IconGroup({
  children,
  className = '',
  pulse,
  highlight = false,
}: {
  children: ReactNode;
  className?: string;
  pulse?: IconPulse;
  highlight?: boolean;
}) {
  return (
    <span
      className={`icon-group ${className}`}
      aria-hidden="true"
      data-icon-group
      {...iconDecoration(pulse, highlight)}
    >
      {children}
    </span>
  );
}

/** Render allowlisted bundled SVG with currentColor and optional accessible copy.
 * API text is never interpreted as markup; an unknown key uses a safe fallback.
 * Highlight reuses chat's interactive foreground/halo without requiring an idle pulse.
 */
export const Icon = memo(function Icon({
  name,
  label,
  className = '',
  pulse,
  highlight = false,
}: {
  name: IconName;
  label?: string;
  className?: string;
  pulse?: IconPulse;
  highlight?: boolean;
}) {
  return (
    <span
      className={`icon ${className}`}
      role={label ? 'img' : undefined}
      aria-label={label}
      title={label}
      aria-hidden={label ? undefined : true}
      {...iconDecoration(pulse, highlight)}
      dangerouslySetInnerHTML={{ __html: icons[name] ?? icons.braces }}
    />
  );
});
