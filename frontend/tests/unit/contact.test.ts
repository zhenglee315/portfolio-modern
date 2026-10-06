import { describe, expect, it } from 'vitest';
import { contactReducer, initialContact } from '@/features/site/model/contact';

describe('contact disclosure policy', () => {
  it('waits for automatic entrance but permits the same idle policy immediately for manual opening', () => {
    const introduction = contactReducer(initialContact, { type: 'open', appearing: true });
    expect(contactReducer(introduction, { type: 'fade' })).toBe(introduction);
    const mounted = contactReducer(introduction, { type: 'present' });
    expect(contactReducer(mounted, { type: 'fade' })).toBe(mounted);
    const ready = contactReducer(mounted, { type: 'appeared' });
    expect(contactReducer(ready, { type: 'fade' }).fading).toBe(true);
    const manual = contactReducer(initialContact, { type: 'open' });
    expect(manual.appearing).toBe(false);
    expect(contactReducer(manual, { type: 'fade' })).toBe(manual);
    expect(
      contactReducer(contactReducer(manual, { type: 'present' }), { type: 'fade' }).fading,
    ).toBe(true);
    const failed = contactReducer(introduction, { type: 'present', animate: false });
    expect(failed.appearing).toBe(false);
    expect(contactReducer(failed, { type: 'fade' }).fading).toBe(true);
    expect(contactReducer(initialContact, { type: 'present' })).toBe(initialContact);
    expect(contactReducer(initialContact, { type: 'fade' })).toBe(initialContact);
  });

  it('does not interrupt fade for unchanged hover or focus outside the bubble', () => {
    const open = contactReducer(contactReducer(initialContact, { type: 'open' }), {
      type: 'present',
    });
    const fading = contactReducer(open, {
      type: 'fade',
    });
    expect(contactReducer(fading, { type: 'focus', active: false })).toBe(fading);
    expect(contactReducer(fading, { type: 'hover', active: false })).toBe(fading);
    const rescued = contactReducer(fading, { type: 'open' });
    expect(rescued.presented).toBe(true);
    expect(rescued.fading).toBe(false);
    expect(contactReducer(rescued, { type: 'fade' }).fading).toBe(true);
  });

  it('reconciles loading-surface engagement when the readable surface first mounts', () => {
    const loading = contactReducer(initialContact, { type: 'open', appearing: true });
    const hovered = contactReducer(loading, { type: 'hover', active: true });
    const focused = contactReducer(hovered, { type: 'focus', active: true });
    const ready = contactReducer(focused, { type: 'present', hovered: false, focused: false });
    expect(ready.hovered).toBe(false);
    expect(ready.focused).toBe(false);
    expect(ready.presented).toBe(true);
    // Repeated acknowledgements cannot consume an already-visible reader's current engagement.
    const engaged = contactReducer(ready, { type: 'hover', active: true });
    expect(contactReducer(engaged, { type: 'present' })).toBe(engaged);
  });

  it('rescues fading content while hover or keyboard focus is engaged', () => {
    const open = contactReducer(contactReducer(initialContact, { type: 'open' }), {
      type: 'present',
    });
    const fading = contactReducer(open, { type: 'fade' });
    expect(fading.fading).toBe(true);
    const engaged = contactReducer(fading, { type: 'hover', active: true });
    expect(contactReducer(engaged, { type: 'fade' })).toEqual(engaged);
    expect(engaged.fading).toBe(false);
    const focused = contactReducer(open, { type: 'focus', active: true });
    expect(contactReducer(focused, { type: 'fade' })).toEqual(focused);
    expect(contactReducer(focused, { type: 'close' })).toEqual(initialContact);
  });
});
