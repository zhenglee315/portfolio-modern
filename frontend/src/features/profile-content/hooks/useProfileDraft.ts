import { useCallback, useEffect, useMemo, useState } from 'react';
import { profileDraftSchema, type ProfileDraft } from '../model/profile';
import { createEmptyProfile } from '../model/empty';

export const profileDraftKey = (accountId: number) => `portfolio.profile-draft.v1:${accountId}`;

/** Read only this account's versioned draft; bad storage never becomes executable UI state. */
function readDraft(accountId: number, source: ProfileDraft) {
  try {
    const raw =
      typeof window === 'undefined' ? null : localStorage.getItem(profileDraftKey(accountId));
    if (raw && raw.length < 2_000_000) {
      const parsed = profileDraftSchema.safeParse(JSON.parse(raw));
      if (parsed.success) {
        if (
          source.revision !== undefined &&
          parsed.data.revision !== undefined &&
          parsed.data.revision !== source.revision
        )
          return { draft: source, savedAt: true };
        return { draft: parsed.data, savedAt: true };
      }
    }
  } catch {
    /* Unavailable/malformed storage uses the supplied API snapshot without deleting the old bytes. */
  }
  return { draft: source, savedAt: false };
}

/** Own explicit local saves over an API snapshot; saved drafts always take priority on reopening. */
export function useProfileDraft(accountId: number, source: ProfileDraft = createEmptyProfile()) {
  const [initial] = useState(() => readDraft(accountId, source));
  const [draft, setDraft] = useState(initial.draft);
  const [saved, setSaved] = useState(source.revision !== undefined ? source : initial.draft);
  const [hasSaved, setHasSaved] = useState(source.revision !== undefined || initial.savedAt);
  const [imported, setImported] = useState(false);
  const serialized = useMemo(() => JSON.stringify(draft), [draft]);
  const dirty = imported || serialized !== JSON.stringify(saved);
  const save = useCallback(() => {
    try {
      localStorage.setItem(profileDraftKey(accountId), serialized);
      setSaved(draft);
      setHasSaved(true);
      setImported(false);
      return true;
    } catch {
      return false;
    }
  }, [accountId, draft, serialized]);
  // An acknowledged server snapshot becomes the baseline; browser storage is only a recovery cache.
  const acceptSaved = useCallback(
    (next: ProfileDraft) => {
      try {
        localStorage.setItem(profileDraftKey(accountId), JSON.stringify(next));
      } catch {
        /* Server save already succeeded. */
      }
      setDraft(next);
      setSaved(next);
      setHasSaved(true);
      setImported(false);
    },
    [accountId],
  );
  const cancel = useCallback(() => {
    setDraft(saved);
    setImported(false);
  }, [saved]);
  const update = useCallback(
    (updater: (current: ProfileDraft) => ProfileDraft) => setDraft(updater),
    [],
  );
  // Importing changes only the working copy: Cancel/reload can recover the existing saved draft.
  const useSource = useCallback((next: ProfileDraft) => {
    setDraft(next);
    setImported(true);
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  return {
    draft,
    update,
    save,
    cancel,
    dirty,
    hasSaved,
    useSource,
    acceptSaved,
    savedRevision: saved.revision ?? source.revision,
  };
}
