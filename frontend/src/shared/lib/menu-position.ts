import type { DropdownMenuProps } from 'react-bootstrap/DropdownMenu';

type MenuPopperConfig = NonNullable<DropdownMenuProps['popperConfig']>;

/** Preference menus retain their 10px trigger gap; owners keep selection and focus behavior. */
export const preferenceMenuPosition: MenuPopperConfig = {
  modifiers: [{ name: 'offset', options: { offset: [0, 10] } }],
};

/**
 * Table toolbar menus may detach from their trigger to keep every action inside the viewport.
 * These presets are shared read-only inputs: construct a new config when extending a preset.
 * Popper owns measurement/listener cleanup; this module contains no browser state or effects.
 */
export const boundedMenuPosition: MenuPopperConfig = {
  modifiers: [
    { name: 'preventOverflow', options: { padding: 8, altAxis: true, tether: false } },
    { name: 'flip', options: { padding: 8 } },
  ],
};

/** Toolbar menus align to the trigger's start edge with the same 4px gap and viewport fallback. */
export const tableToolbarMenuPosition: MenuPopperConfig = {
  ...boundedMenuPosition,
  modifiers: [
    ...(boundedMenuPosition.modifiers ?? []),
    { name: 'offset', options: { offset: [0, 4] } },
  ],
};

/** Body-portaled column menus use viewport coordinates rather than the scrolling table's offset. */
export const portaledMenuPosition: MenuPopperConfig = {
  ...boundedMenuPosition,
  strategy: 'fixed',
};

/** Reposition intrinsic menus after async choices/search change their measured size.
 * Popper owns observer cleanup alongside its ordinary scroll/resize listeners.
 * @author ZhengLee 2026.10.16
 */
export const contentSizedMenuPosition: MenuPopperConfig = {
  ...portaledMenuPosition,
  modifiers: [
    ...(portaledMenuPosition.modifiers ?? []),
    {
      name: 'contentSize',
      enabled: true,
      phase: 'write',
      fn: () => undefined,
      effect: ({ state, instance }) => {
        const observer = new ResizeObserver(() => {
          void instance.update();
        });
        observer.observe(state.elements.popper);
        return () => observer.disconnect();
      },
    },
  ],
};
