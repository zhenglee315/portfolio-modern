import type { ProfileDraft, ProfileProject } from './profile';

export type ProfileProjectPage = {
  revision: number;
  items: ProfileProject[];
  total: number;
  pages: number;
  page: number;
  size: number;
  order: string[];
  references: NonNullable<ProfileDraft['projectScope']>['references'];
};

/** Page hydration is baseline data, not an edit; never revive deleted or overwrite edited records. */
export function mergeProfileProjectPages(
  draft: ProfileDraft,
  pages: ProfileProjectPage[],
): ProfileDraft {
  if (!draft.projectScope || pages.some((page) => page.revision !== draft.revision)) return draft;
  const known = new Set(draft.projectScope.loadedIds);
  const additions = pages.flatMap((page) => page.items).filter((item) => !known.has(item.id));
  if (!additions.length) return draft;
  const projects = { ...draft.projects };
  for (const item of additions) {
    known.add(item.id);
    // A career can be removed while this page was still unvisited.
    projects[item.id] = {
      ...item,
      experienceId:
        item.experienceId && draft.experiences[item.experienceId] ? item.experienceId : null,
    };
  }
  return { ...draft, projects, projectScope: { ...draft.projectScope, loadedIds: [...known] } };
}

/** One normalized deletion path serves card actions, bulk selection and the project editor. */
export function removeProfileProjects(draft: ProfileDraft, ids: readonly string[]): ProfileDraft {
  const removed = new Set(ids.filter((id) => draft.projectOrder.includes(id)));
  if (!removed.size) return draft;
  return {
    ...draft,
    projects: Object.fromEntries(Object.entries(draft.projects).filter(([id]) => !removed.has(id))),
    projectOrder: draft.projectOrder.filter((id) => !removed.has(id)),
  };
}

/** Lightweight server references remain complete; loaded draft edits take precedence over the index. */
export function profileProjectReferences(draft: ProfileDraft) {
  return draft.projectOrder.map((id) => {
    const project = draft.projects[id];
    const reference = draft.projectScope?.references[id];
    return {
      id,
      skillIds: project?.skillIds ?? reference?.skillIds ?? [],
      names: project
        ? (Object.fromEntries(
            Object.entries(project.translations).map(([locale, copy]) => [locale, copy.name]),
          ) as NonNullable<typeof reference>['names'])
        : reference?.names,
    };
  });
}
