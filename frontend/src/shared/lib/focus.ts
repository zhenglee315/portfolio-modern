type TabEvent = Pick<KeyboardEvent, 'key' | 'shiftKey' | 'defaultPrevented' | 'preventDefault'>;

const interactiveSelector = [
  'a[href]',
  'button',
  'input:not([type="hidden"])',
  'select',
  'textarea',
  '[tabindex]',
  '[contenteditable]:not([contenteditable="false"])',
].join(',');

/** Keep Tab traversal inside an open modal when focus would otherwise reach browser chrome.
 * @param event Keydown owned by the dialog; a child control's prevented event is preserved.
 * @param surface Active dialog element. Its existing manager owns activation and restoration.
 * @returns Nothing. Only boundary Tab presses are prevented and wrapped to a usable control.
 * Disabled, hidden and inert descendants are excluded; positive tab order is respected.
 */
export function cycleDialogTab(event: TabEvent, surface: HTMLElement): void {
  if (event.defaultPrevented || event.key !== 'Tab') return;
  const controls = [...surface.querySelectorAll<HTMLElement>(interactiveSelector)]
    .filter(
      (element) =>
        element.tabIndex >= 0 &&
        !element.matches(':disabled') &&
        !element.closest('[inert], [hidden]') &&
        element.getClientRects().length > 0 &&
        getComputedStyle(element).visibility !== 'hidden',
    )
    .sort((left, right) => {
      const leftOrder = left.tabIndex > 0 ? left.tabIndex : Infinity;
      const rightOrder = right.tabIndex > 0 ? right.tabIndex : Infinity;
      return leftOrder === rightOrder ? 0 : leftOrder - rightOrder;
    });
  const first = controls[0];
  const last = controls.at(-1);
  const active = surface.ownerDocument.activeElement;
  if (!first || !last) {
    event.preventDefault();
    surface.focus();
    return;
  }
  const outside = !active || active === surface || !surface.contains(active);
  if (outside || (event.shiftKey ? active === first : active === last)) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
  }
}
