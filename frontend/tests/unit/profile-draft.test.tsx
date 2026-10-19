import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { profileDraftKey, useProfileDraft, createProfileExample } from '@/features/profile-content';

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

/** Exercise real browser storage and hook snapshots, including failure paths. */
describe('browser-only profile drafts', () => {
  it('requires an explicit save, restores saved edits and cancels against the last saved snapshot', () => {
    const editor = renderHook(() => useProfileDraft(91, createProfileExample()));
    expect(editor.result.current.hasSaved).toBe(false);
    const initial = editor.result.current.draft.profiles.en.firstName;
    act(() =>
      editor.result.current.update((draft) => ({
        ...draft,
        profiles: { ...draft.profiles, en: { ...draft.profiles.en, firstName: 'Saved name' } },
      })),
    );
    expect(editor.result.current.dirty).toBe(true);
    expect(localStorage.getItem(profileDraftKey(91))).toBeNull();
    act(() => {
      expect(editor.result.current.save()).toBe(true);
    });
    expect(editor.result.current.dirty).toBe(false);
    expect(editor.result.current.hasSaved).toBe(true);
    act(() =>
      editor.result.current.update((draft) => ({
        ...draft,
        profiles: { ...draft.profiles, en: { ...draft.profiles.en, firstName: 'Unsaved' } },
      })),
    );
    act(() => editor.result.current.cancel());
    expect(editor.result.current.draft.profiles.en.firstName).toBe('Saved name');
    expect(editor.result.current.dirty).toBe(false);
    editor.unmount();
    const restored = renderHook(() => useProfileDraft(91, createProfileExample()));
    expect(restored.result.current.draft.profiles.en.firstName).toBe('Saved name');
    expect(restored.result.current.hasSaved).toBe(true);
    const otherAccount = renderHook(() => useProfileDraft(92, createProfileExample()));
    expect(otherAccount.result.current.draft.profiles.en.firstName).toBe(initial);
    expect(otherAccount.result.current.hasSaved).toBe(false);
  });

  it.each(['{bad-json', '{"version":99}', 'x'.repeat(2_000_001)])(
    'falls back to an example for malformed, unsupported or oversized storage (%#)',
    (raw) => {
      localStorage.setItem(profileDraftKey(91), raw);
      const { result } = renderHook(() => useProfileDraft(91, createProfileExample()));
      expect(result.current.draft.experienceOrder).toHaveLength(6);
      expect(result.current.hasSaved).toBe(false);
      expect(result.current.dirty).toBe(false);
    },
  );

  it('keeps unsaved edits when storage is unavailable and retains beforeunload protection', () => {
    const { result } = renderHook(() => useProfileDraft(91, createProfileExample()));
    act(() =>
      result.current.update((draft) => ({
        ...draft,
        experienceOrder: [...draft.experienceOrder].reverse(),
      })),
    );
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Quota exceeded');
    });
    act(() => {
      expect(result.current.save()).toBe(false);
    });
    expect(result.current.dirty).toBe(true);
    expect(result.current.hasSaved).toBe(false);
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    act(() => result.current.cancel());
    const clean = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);
  });
});
