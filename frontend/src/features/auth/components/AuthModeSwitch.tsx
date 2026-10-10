import { useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './AuthPanel.module.css';

type Mode = 'login' | 'register';
type Drag = {
  pointerId: number;
  x: number;
  y: number;
  start: number;
  travel: number;
  position: number;
  active: boolean;
};

/** Follow horizontal drags, then snap on release; leave vertical touch scrolling to the browser. */
export function AuthModeSwitch({
  mode,
  onChange,
  onDragPosition,
}: {
  mode: Mode;
  onChange: (mode: Mode) => void;
  onDragPosition?: (position: number | null) => void;
}) {
  const { t } = useTranslation();
  const drag = useRef<Drag | null>(null);
  const suppressClick = useRef(false);
  const [position, setPosition] = useState<number | null>(null);

  const move = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const dx = event.clientX - current.x;
    const dy = event.clientY - current.y;
    if (!current.active) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 6) return;
      if (Math.abs(dy) >= Math.abs(dx)) {
        drag.current = null;
        return;
      }
      current.active = true;
      suppressClick.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    current.position = Math.max(0, Math.min(1, current.start + dx / current.travel));
    setPosition(current.position);
    onDragPosition?.(current.position);
  };

  // Cancellation (including native scrolling or lost capture) restores the current selection.
  const finish = (event: PointerEvent<HTMLDivElement>, commit: boolean) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    if (commit && current.active) move(event);
    drag.current = null;
    setPosition(null);
    if (current.active && event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    if (commit && current.active) onChange(current.position >= 0.5 ? 'register' : 'login');
    if (current.active) onDragPosition?.(null);
  };

  return (
    <div
      className={styles.modes}
      data-mode={mode}
      data-dragging={position !== null ? '' : undefined}
      style={
        {
          '--auth-mode-offset': `${(position ?? (mode === 'register' ? 1 : 0)) * 100}%`,
        } as CSSProperties
      }
      role="group"
      aria-label={t('auth.modeLabel')}
      onPointerDown={(event) => {
        if (!event.isPrimary || event.button !== 0 || drag.current) return;
        suppressClick.current = false;
        drag.current = {
          pointerId: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          start: mode === 'register' ? 1 : 0,
          position: mode === 'register' ? 1 : 0,
          travel: Math.max(1, (event.currentTarget.clientWidth - 8) / 2),
          active: false,
        };
      }}
      onPointerMove={move}
      onPointerUp={(event) => finish(event, true)}
      onPointerCancel={(event) => finish(event, false)}
      onLostPointerCapture={(event) => {
        // Touch starts with implicit capture on a child button; transferring it here
        // emits a bubbling loss event from that button, which does not cancel our drag.
        if (event.target === event.currentTarget) finish(event, false);
      }}
      onPointerLeave={(event) => {
        if (!drag.current?.active) finish(event, false);
      }}
      onClickCapture={(event) => {
        // A drag must not also activate the button underneath the release point.
        if (suppressClick.current && event.detail > 0) {
          event.preventDefault();
          event.stopPropagation();
          suppressClick.current = false;
        }
      }}
    >
      <button type="button" aria-pressed={mode === 'login'} onClick={() => onChange('login')}>
        {t('auth.login')}
      </button>
      <button type="button" aria-pressed={mode === 'register'} onClick={() => onChange('register')}>
        {t('auth.register')}
      </button>
    </div>
  );
}
