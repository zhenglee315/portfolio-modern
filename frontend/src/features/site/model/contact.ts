/** Keep visual duration and dismissal deadlines synchronized from one feature-owned policy. */
export const contactTiming = { idleMs: 3000, fadeMs: 400 } as const;
/** Identify either usable contact surface for keyboard engagement and conditional focus restoration. */
export const contactSurfaceSelector = '[data-contact-bubble], [data-contact-fallback]';

export type ContactState = {
  open: boolean;
  presented: boolean;
  appearing: boolean;
  fading: boolean;
  hovered: boolean;
  focused: boolean;
};
export type ContactAction =
  | { type: 'open'; appearing?: boolean }
  | { type: 'present'; animate?: boolean; hovered?: boolean; focused?: boolean }
  | { type: 'close' | 'fade' | 'appeared' }
  | { type: 'hover' | 'focus'; active: boolean };
export const initialContact: ContactState = {
  open: false,
  presented: false,
  appearing: false,
  fading: false,
  hovered: false,
  focused: false,
};

/** Share one idle/fade policy between desktop and mobile, including engagement rescue. */
export function contactReducer(state: ContactState, action: ContactAction): ContactState {
  switch (action.type) {
    case 'open':
      // Rescuing an existing fade does not remount its surface, so retain its readiness.
      return {
        ...initialContact,
        open: true,
        presented: state.open && state.presented,
        appearing: action.appearing ?? false,
      };
    case 'present':
      // Lazy loading must not consume the visible copy's entrance or reading interval.
      if (!state.open || state.presented) return state;
      return {
        ...state,
        presented: true,
        appearing: state.appearing && action.animate !== false,
        hovered: action.hovered ?? false,
        focused: action.focused ?? false,
      };
    case 'appeared':
      return { ...state, appearing: false };
    case 'close':
      return initialContact;
    case 'fade':
      return !state.open || !state.presented || state.appearing || state.hovered || state.focused
        ? state
        : { ...state, fading: true };
    case 'hover':
      if (state.hovered === action.active) return state;
      return { ...state, hovered: action.active, fading: false };
    case 'focus':
      // Focus moving elsewhere must not rescue a fade unless the bubble's engagement changed.
      if (state.focused === action.active) return state;
      return { ...state, focused: action.active, fading: false };
  }
}

/** Locate the currently visible responsive trigger without storing duplicate UI state. */
export function contactAnchor() {
  return (
    Array.from(document.querySelectorAll<HTMLButtonElement>('[data-contact-trigger]')).find(
      (element) => element.getClientRects().length > 0,
    ) ?? null
  );
}

/** Read actual visible keyboard focus inside the disclosure, excluding its trigger and pointer focus. */
export function contactKeyboardFocused() {
  const target = document.activeElement;
  return (
    target instanceof Element &&
    !!target.closest(contactSurfaceSelector) &&
    target.matches(':focus-visible')
  );
}
