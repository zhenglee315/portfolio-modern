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

/** Body-portaled column menus use viewport coordinates rather than the scrolling table's offset. */
export const portaledMenuPosition: MenuPopperConfig = {
  ...boundedMenuPosition,
  strategy: 'fixed',
};
