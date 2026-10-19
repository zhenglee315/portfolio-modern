import { useCallback, useEffect, useRef, useState } from 'react';
import { useTooltipDismissal } from '@/shared/hooks/useTooltipDismissal';

/** Own reminder timing and its cookie separately from draft editing and API persistence. */
export function useProfileHelp(cookieName: string) {
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const focusFrame = useRef(0);
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const close = useCallback(() => {
    clearTimeout(timer.current);
    setOpen(false);
  }, []);
  const show = useCallback(() => {
    clearTimeout(timer.current);
    setOpen(true);
  }, []);
  const leave = useCallback(() => {
    clearTimeout(timer.current);
    // Bridge the gap to the floating panel and retain keyboard access to its checkbox.
    timer.current = setTimeout(() => {
      if (
        !trigger.current?.matches(':hover, :focus-visible') &&
        !panel.current?.matches(':hover') &&
        !panel.current?.querySelector(':focus-visible')
      )
        setOpen(false);
    }, 180);
  }, []);
  const acknowledge = (checked: boolean) => {
    setAcknowledged(checked);
    try {
      document.cookie = `${cookieName}=${checked ? 'acknowledged' : ''}; Path=/; Max-Age=${checked ? 31536000 : 0}; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
    } catch {
      // Restricted browsers can still dismiss this visit's reminder and open help manually.
    }
  };
  const focusPanel = () => {
    show();
    cancelAnimationFrame(focusFrame.current);
    focusFrame.current = requestAnimationFrame(() =>
      panel.current?.querySelector('input')?.focus(),
    );
  };

  useEffect(() => {
    let observer: IntersectionObserver | undefined;
    // Mount hidden first so each eligible page entry animates in after its initial layout.
    const frame = requestAnimationFrame(() => {
      setAnchor(trigger.current);
      let known = false;
      try {
        known = document.cookie
          .split(';')
          .some((part) => part.trim() === `${cookieName}=acknowledged`);
      } catch {
        // An unavailable preference never prevents access to the content editor.
      }
      setAcknowledged(known);
      if (!known && trigger.current) {
        // Lower-page hints wait for their icon to enter view instead of floating away from it.
        observer = new IntersectionObserver(
          ([entry]) => {
            if (!entry?.isIntersecting) return;
            observer?.disconnect();
            timer.current = setTimeout(() => {
              setOpen(true);
              timer.current = setTimeout(() => setOpen(false), 8000);
            }, 80);
          },
          { threshold: 0.5 },
        );
        observer.observe(trigger.current);
      }
    });
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(focusFrame.current);
      clearTimeout(timer.current);
      observer?.disconnect();
    };
  }, [cookieName]);
  const dismiss = useCallback(() => {
    const returnFocus = panel.current?.contains(document.activeElement);
    close();
    if (returnFocus) trigger.current?.focus({ preventScroll: true });
  }, [close]);
  useTooltipDismissal(open ? anchor : null, panel, dismiss);

  return {
    trigger,
    panel,
    anchor,
    open,
    acknowledged,
    show,
    close,
    leave,
    acknowledge,
    focusPanel,
  };
}
