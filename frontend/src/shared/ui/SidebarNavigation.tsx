import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router';
import Offcanvas from 'react-bootstrap/Offcanvas';
import { useAnchoredPanel } from '@/shared/hooks/useAnchoredPanel';
import { cycleDialogTab } from '@/shared/lib/focus';
import { Icon, type IconName } from './Icon';

/** Owners supply translated labels and destinations; the shared navigation never reads identity. */
export type SidebarNavigationItem = {
  id: string;
  label: string;
  icon: IconName;
  href?: string;
  to?: string;
  onSelect?: () => void;
  current?: 'page' | 'location';
  ordinal?: string;
};

/** One desktop rail owns collapse geometry, rotating chevrons and brand disclosure. */
export function SidebarRail({
  compact,
  onCompact,
  collapseLabel,
  expandLabel,
  brand,
  brandLink,
  leading,
  trailing,
  children,
  footer,
  drawerAt = 'phone',
}: {
  compact: boolean;
  onCompact: () => void;
  collapseLabel: string;
  expandLabel: string;
  brand: ReactNode;
  brandLink?: { to: string; label: string };
  leading?: ReactNode;
  trailing?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  drawerAt?: 'phone' | 'tablet';
}) {
  const brandContent = (
    <>
      {leading}
      <span inert={compact} data-nav-brand>
        {brand}
      </span>
      {trailing}
    </>
  );
  return (
    <aside
      className={`sidebar-navigation-sidebar ${compact ? 'sidebar-navigation-compact' : ''} ${drawerAt === 'tablet' ? 'sidebar-navigation-tablet-drawer' : ''}`}
      data-sidebar-rail
      data-sidebar-compact={compact}
      data-entrance-navigation
    >
      <button
        type="button"
        className="sidebar-navigation-collapse"
        aria-label={compact ? expandLabel : collapseLabel}
        aria-expanded={!compact}
        onClick={onCompact}
      >
        <Icon name="collapse" />
      </button>
      {brandLink ? (
        <Link className="sidebar-navigation-brand" to={brandLink.to} aria-label={brandLink.label}>
          {brandContent}
        </Link>
      ) : (
        <div className="sidebar-navigation-brand">{brandContent}</div>
      )}
      {children}
      {footer && <div className="sidebar-navigation-footer">{footer}</div>}
    </aside>
  );
}

/** Render route links, section anchors and actions with identical spacing and compact tooltips. */
export function SidebarLinks({
  items,
  label,
  active,
  compact = false,
}: {
  items: readonly SidebarNavigationItem[];
  label: string;
  active?: string;
  compact?: boolean;
}) {
  const tooltipId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<{ anchor: HTMLElement; id: string } | null>(null);
  const anchor = compact ? (tooltip?.anchor ?? null) : null;
  const tooltipLabel = items.find((item) => item.id === tooltip?.id)?.label;
  useAnchoredPanel(panel, anchor, undefined, undefined, 'side');
  useEffect(() => {
    if (!compact) {
      const frame = requestAnimationFrame(() => setTooltip(null));
      return () => cancelAnimationFrame(frame);
    }
  }, [compact]);
  useEffect(() => {
    if (!anchor) return;
    const rail = anchor.closest('aside');
    const hide = () => setTooltip(null);
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      hide();
    };
    document.addEventListener('keydown', escape, true);
    window.addEventListener('blur', hide);
    window.addEventListener('resize', hide);
    rail?.addEventListener('scroll', hide, { passive: true });
    return () => {
      document.removeEventListener('keydown', escape, true);
      window.removeEventListener('blur', hide);
      window.removeEventListener('resize', hide);
      rail?.removeEventListener('scroll', hide);
    };
  }, [anchor]);
  return (
    <>
      <nav className="sidebar-navigation-links" aria-label={label} data-sidebar-links>
        {items.map((item) => {
          const props = {
            className: `sidebar-navigation-item ${active === item.id ? 'sidebar-navigation-active' : ''}`,
            'aria-label': item.label,
            'aria-current': active === item.id ? (item.current ?? 'page') : undefined,
            'aria-describedby': anchor && tooltip?.id === item.id ? tooltipId : undefined,
            'data-sidebar-item': item.id,
            'data-section': item.href?.startsWith('#') ? item.id : undefined,
            onPointerEnter: (event: React.PointerEvent<HTMLElement>) => {
              if (compact && event.pointerType !== 'touch')
                setTooltip({ anchor: event.currentTarget, id: item.id });
            },
            onPointerLeave: (event: React.PointerEvent<HTMLElement>) => {
              if (!event.currentTarget.matches(':focus-visible')) setTooltip(null);
            },
            onFocus: (event: React.FocusEvent<HTMLElement>) => {
              if (compact) setTooltip({ anchor: event.currentTarget, id: item.id });
            },
            onBlur: () => setTooltip(null),
            onClick: (event: React.MouseEvent<HTMLElement>) => {
              if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
                return;
              setTooltip(null);
              if (item.href && item.onSelect) event.preventDefault();
              item.onSelect?.();
            },
            children: (
              <>
                <Icon name={item.icon} />
                <span className="sidebar-navigation-label" data-nav-label>
                  {item.label}
                </span>
                {item.ordinal && <small>{item.ordinal}</small>}
              </>
            ),
          };
          return item.to ? (
            <Link key={item.id} to={item.to} {...props} />
          ) : item.href ? (
            <a key={item.id} href={item.href} {...props} />
          ) : (
            <button key={item.id} type="button" {...props} />
          );
        })}
      </nav>
      {anchor &&
        tooltipLabel &&
        createPortal(
          <div ref={panel} id={tooltipId} className="sidebar-navigation-tooltip" role="tooltip">
            {tooltipLabel}
          </div>,
          document.body,
        )}
    </>
  );
}

/** Share the drawer transition, close icon and focus lifecycle; owners retain their header offset. */
export function SidebarDrawer({
  id,
  open,
  onClose,
  label,
  closeLabel,
  headerOffset = 0,
  children,
  footer,
}: {
  id: string;
  open: boolean;
  onClose: () => void;
  label: string;
  closeLabel: string;
  headerOffset?: 0 | 64;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const offsetClass = headerOffset === 64 ? 'sidebar-navigation-below-header' : '';
  return (
    <Offcanvas
      id={id}
      show={open}
      onHide={onClose}
      className={`sidebar-navigation-drawer ${offsetClass}`}
      backdropClassName={`sidebar-navigation-drawer-backdrop ${offsetClass}`}
      placement="start"
      aria-label={label}
      data-sidebar-drawer
      onKeyDown={(event: ReactKeyboardEvent<HTMLDivElement>) =>
        cycleDialogTab(event, event.currentTarget)
      }
    >
      <Offcanvas.Header>
        <Offcanvas.Title className="visually-hidden">{label}</Offcanvas.Title>
        <button
          type="button"
          className={`icon-button sidebar-navigation-drawer-close`}
          aria-label={closeLabel}
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      </Offcanvas.Header>
      <Offcanvas.Body>
        {children}
        {footer && <div className="sidebar-navigation-footer">{footer}</div>}
      </Offcanvas.Body>
    </Offcanvas>
  );
}
