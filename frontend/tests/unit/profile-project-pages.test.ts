import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  mergeProfileProjectPages,
  profileDraftSchema,
  profileProjectReferences,
  removeProfileProjects,
  useProfileDraft,
  type ProfileProjectPage,
  type ProfileDraft,
} from '@/features/profile-content';
import { ownerProfileSnapshot, ownerProfileResponse } from '../fixtures/profile-owner';

function snapshots() {
  const complete = ownerProfileSnapshot('alex');
  const first = ownerProfileResponse(complete, '/projects') as ProfileProjectPage;
  const second = ownerProfileResponse(
    complete,
    '/projects',
    new URLSearchParams('page=2'),
  ) as ProfileProjectPage;
  const source: ProfileDraft = {
    ...complete,
    projects: Object.fromEntries(first.items.map((item) => [item.id, item])),
    projectScope: {
      sourceOrder: complete.projectOrder,
      loadedIds: first.items.map((item) => item.id),
      references: first.references,
    },
  };
  return { complete, source, first, second };
}

describe('partial project drafts', () => {
  it('keeps unloaded references available without accepting damaged unloaded identities', () => {
    const { source } = snapshots();
    expect(profileDraftSchema.safeParse(source).success).toBe(true);
    expect(Object.keys(source.projects)).toHaveLength(6);
    expect(profileProjectReferences(source)).toHaveLength(15);
    expect(profileProjectReferences(source).at(-1)?.names?.en).toBe('en Project 15');
    expect(profileDraftSchema.safeParse({ ...source, projectScope: undefined }).success).toBe(
      false,
    );
    expect(
      profileDraftSchema.safeParse({ ...source, projectOrder: [...source.projectOrder, 'foreign'] })
        .success,
    ).toBe(false);
  });

  it('hydrates only new identities, preserving a rename and a deletion across repeated page reads', () => {
    const { source, first, second } = snapshots();
    const edited = structuredClone(source);
    edited.projects['project:2']!.translations.en.name = 'Unsaved name';
    const removed = removeProfileProjects(edited, ['project:1']);
    const next = mergeProfileProjectPages(removed, [first, second]);
    expect(next.projects['project:1']).toBeUndefined();
    expect(next.projects['project:2']!.translations.en.name).toBe('Unsaved name');
    expect(next.projects['project:12']).toBeDefined();
    expect(next.projects['project:15']).toBeUndefined();
    expect(next.projectScope?.loadedIds).toHaveLength(12);
    expect(next.skills).toBe(edited.skills);
    expect(next.experiences).toBe(edited.experiences);
    expect(profileDraftSchema.safeParse(next).success).toBe(true);
    expect(mergeProfileProjectPages(next, [{ ...second, revision: 99 }])).toBe(next);
  });

  it('page reads do not mark the working copy dirty, and Cancel retains hydrated server baselines', () => {
    localStorage.clear();
    const { source, second } = snapshots();
    const { result } = renderHook(() => useProfileDraft(91, source));
    act(() => result.current.hydrateProjects([second]));
    expect(result.current.dirty).toBe(false);
    act(() => result.current.update((draft) => removeProfileProjects(draft, ['project:2'])));
    expect(result.current.dirty).toBe(true);
    act(() => result.current.cancel());
    expect(result.current.draft.projects['project:2']).toBeDefined();
    expect(result.current.draft.projects['project:12']).toBeDefined();
    expect(result.current.dirty).toBe(false);
  });
});
