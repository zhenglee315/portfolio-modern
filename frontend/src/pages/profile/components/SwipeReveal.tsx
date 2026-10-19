import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type HTMLAttributes,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { Icon } from './ProfileIcon';
import { useTranslation } from 'react-i18next';
import editorStyles from '../ProfilePage.module.css';
import styles from './SwipeReveal.module.css';

type Gesture = {
  pointerId: number;
  x: number;
  y: number;
  start: number;
  offset: number;
  active: boolean;
};

/** Reveal an explicit action without committing it; horizontal gestures never claim vertical scrolling. */
export function SwipeReveal({
  open,
  onOpenChange,
  action,
  label,
  edit,
  triggerIcon = 'threeDots',
  children,
  ...attributes
}: Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  action: ReactNode;
  label: string;
  edit?: { label: string; onClick: () => void; disabled?: boolean };
  triggerIcon?: 'threeDots' | 'threeDotsVertical';
  children: ReactNode | ((trigger: ReactNode) => ReactNode);
}) {
  const { t } = useTranslation();
  // Each explicit action keeps the same 80px touch target; the face reveals the whole rail.
  const travel = edit ? 160 : 80;
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const suppressClick = useRef(false);
  const [offset, setOffset] = useState<number | null>(null);
  const actionsId = useId();

  const cancel = useCallback(() => {
    const current = gesture.current;
    gesture.current = null;
    setOffset(null);
    if (current && root.current?.hasPointerCapture(current.pointerId))
      root.current.releasePointerCapture(current.pointerId);
  }, []);
  useEffect(() => {
    if (!open) return;
    const outside = (event: globalThis.PointerEvent) => {
      // A confirmation dialog temporarily owns input; keep its return-focus action available.
      if (event.target instanceof Element && event.target.closest('[role="dialog"]')) return;
      if (event.target instanceof Node && !root.current?.contains(event.target))
        onOpenChange(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open, onOpenChange]);
  useEffect(() => {
    window.addEventListener('blur', cancel);
    return () => window.removeEventListener('blur', cancel);
  }, [cancel]);

  const move = (event: PointerEvent<HTMLDivElement>) => {
    const current = gesture.current;
    if (!current || event.pointerId !== current.pointerId) return;
    const dx = event.clientX - current.x;
    const dy = event.clientY - current.y;
    if (!current.active) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 8) return;
      if (Math.abs(dy) >= Math.abs(dx)) {
        gesture.current = null;
        return;
      }
      current.active = true;
      suppressClick.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    event.preventDefault();
    current.offset = Math.max(-travel, Math.min(0, current.start + dx));
    setOffset(current.offset);
  };
  const finish = (event: PointerEvent<HTMLDivElement>) => {
    const current = gesture.current;
    if (!current || event.pointerId !== current.pointerId) return;
    if (current.active) move(event);
    cancel();
    if (current.active) onOpenChange(current.offset < -travel / 2);
  };

  // Each card places this accessible disclosure beside its controls without duplicating gesture logic.
  const actionTrigger = (
    <button
      ref={trigger}
      type="button"
      className={editorStyles.iconButton}
      data-swipe-ignore
      aria-label={label}
      aria-expanded={open}
      aria-controls={actionsId}
      onClick={(event) => {
        onOpenChange(!open);
        if (!open && event.detail === 0)
          requestAnimationFrame(() =>
            root.current
              ?.querySelector<HTMLButtonElement>(`#${CSS.escape(actionsId)} button`)
              ?.focus(),
          );
      }}
    >
      <Icon name={triggerIcon} />
    </button>
  );

  return (
    <div
      {...attributes}
      ref={root}
      data-swipe-open={open}
      data-swiping={offset !== null}
      onPointerDown={(event) => {
        if (!event.isPrimary || event.button !== 0 || gesture.current) return;
        suppressClick.current = false;
        // During the slide transition the disclosure may pass under a returning finger.
        // An open disclosure remains a valid closing gesture; taps still use its normal click handler.
        if (
          (event.target as Element).closest('[data-swipe-ignore]') &&
          !(open && trigger.current?.contains(event.target as Node))
        )
          return;
        gesture.current = {
          pointerId: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          start: open ? -travel : 0,
          offset: open ? -travel : 0,
          active: false,
        };
      }}
      onPointerMove={move}
      onPointerUp={finish}
      onPointerCancel={cancel}
      onLostPointerCapture={(event) => {
        // Transferring implicit touch capture from a child button emits its own bubbling event.
        if (event.target === event.currentTarget) cancel();
      }}
      onPointerLeave={() => {
        if (!gesture.current?.active) cancel();
      }}
      onClickCapture={(event) => {
        if (suppressClick.current && event.detail > 0) {
          event.preventDefault();
          event.stopPropagation();
          suppressClick.current = false;
        }
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && (open || gesture.current)) {
          event.preventDefault();
          cancel();
          onOpenChange(false);
          trigger.current?.focus({ preventScroll: true });
        }
      }}
    >
      <div
        id={actionsId}
        className={styles.action}
        style={{ width: travel }}
        inert={!open}
        aria-hidden={!open}
      >
        {edit && (
          <button
            type="button"
            data-swipe-edit
            aria-label={edit.label}
            disabled={edit.disabled}
            onClick={() => {
              onOpenChange(false);
              edit.onClick();
            }}
          >
            <Icon name="pencil" />
            <span>{t('profileEditor.edit')}</span>
          </button>
        )}
        {action}
      </div>
      <div
        className={styles.surface}
        data-swipe-surface
        style={{ transform: `translateX(${offset ?? (open ? -travel : 0)}px)` }}
      >
        {typeof children === 'function' ? (
          children(actionTrigger)
        ) : (
          <>
            {children}
            {actionTrigger}
          </>
        )}
      </div>
    </div>
  );
}
