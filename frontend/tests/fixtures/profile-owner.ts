import { importProfileContent } from '../../src/pages/profile/model/importProfileContent';
import type { ProfileContentLocale } from '../../src/pages/profile/model/loadProfileContent';
import type { ProfileDraft } from '../../src/features/profile-content/model/profile';
import { supportedLocales } from '../../src/i18n/locales';
import { endpointFixture } from './portfolio';
import { profileSourceFixture } from './profile-source';

/** Synthetic owner snapshots use the same normalized shape as the real private response models. */
export function ownerProfileSnapshot(user = 'operator'): ProfileDraft {
  const source = user === 'operator' ? profileSourceFixture : endpointFixture;
  const siteId = user === 'operator' ? 91 : user === 'sam' ? 2 : 1;
  const snapshots = supportedLocales.map((locale) => {
    const url = (resource: string, page = 1, ownerId?: string) => {
      const value = new URL(`http://fixture/portfolio/${resource}`);
      value.searchParams.set('locale', locale);
      value.searchParams.set(
        resource === 'site' ? 'user' : 'site_id',
        resource === 'site' ? user : String(siteId),
      );
      value.searchParams.set('page', String(page));
      if (ownerId) value.searchParams.set('ownerId', ownerId);
      return value;
    };
    const all = (resource: string, ownerId?: string) => {
      const first = source(url(resource, 1, ownerId)) as { pages: number; items: unknown[] };
      const items = [...first.items];
      for (let page = 2; page <= first.pages; page++)
        items.push(...(source(url(resource, page, ownerId)) as typeof first).items);
      return items;
    };
    const categories = all('skill-categories') as ProfileContentLocale['categories'];
    return {
      locale,
      site: source(url('site')),
      journey: source(url('journey')),
      experiences: all('experiences'),
      projects: all('projects'),
      categories,
      skills: Object.fromEntries(categories.map((item) => [item.id, all('skills', item.id)])),
    } as ProfileContentLocale;
  });
  const draft = importProfileContent(snapshots);
  // Owner reads include coordinates for every career; the older public fixture indexes only three stops.
  for (const entry of Object.values(draft.experiences)) {
    entry.latitude ||= '51.5';
    entry.longitude ||= '-0.1';
  }
  return { ...draft, revision: 0 };
}

export function ownerProfileResponse(
  draft: ProfileDraft,
  pathname: string,
  params = new URLSearchParams(),
) {
  const resource = pathname.split('/').at(-1);
  const revision = draft.revision ?? 0;
  if (resource === 'site') {
    const { version, source, brand, profiles, social } = draft;
    return { revision, site: { version, source, brand, profiles, social } };
  }
  const name = resource === 'skill-categories' ? 'categories' : resource;
  if (name === 'projects') {
    const page = Number(params.get('page') ?? 1),
      size = Number(params.get('size') ?? 6);
    return {
      revision,
      items: draft.projectOrder
        .slice((page - 1) * size, page * size)
        .map((id) => draft.projects[id]!),
      total: draft.projectOrder.length,
      pages: Math.ceil(draft.projectOrder.length / size),
      page,
      size,
      order: draft.projectOrder,
      references: Object.fromEntries(
        Object.entries(draft.projects).map(([id, item]) => [
          id,
          {
            names: Object.fromEntries(
              Object.entries(item.translations).map(([locale, copy]) => [locale, copy.name]),
            ),
            skillIds: item.skillIds,
          },
        ]),
      ),
    };
  }
  if (name === 'skills') return { revision, items: Object.values(draft.skills) };
  if (name === 'experiences' || name === 'categories')
    return {
      revision,
      items: Object.values(draft[name]),
      order: draft[name === 'experiences' ? 'experienceOrder' : 'categoryOrder'],
    };
  return undefined;
}

/** Mirror the scoped save boundary: unvisited content is retained, and the response remains partial. */
export function saveOwnerProfile(
  previous: ProfileDraft,
  input: { draft: ProfileDraft; project_scope?: { loaded_ids: string[]; order: string[] } },
) {
  const incoming = structuredClone(input.draft);
  const scope = input.project_scope;
  if (scope) {
    incoming.projects = {
      ...Object.fromEntries(
        Object.entries(previous.projects).filter(([id]) => !scope.loaded_ids.includes(id)),
      ),
      ...incoming.projects,
    };
    incoming.projectOrder = scope.order;
    for (const project of Object.values(incoming.projects))
      if (project.experienceId && !incoming.experiences[project.experienceId])
        project.experienceId = null;
  }
  const snapshot = { ...canonicalOwnerDraft(incoming), revision: previous.revision! + 1 };
  const draft = structuredClone(snapshot);
  if (!scope) return { snapshot, response: { revision: snapshot.revision, draft } };
  const visited = new Set([...scope.loaded_ids, ...Object.keys(input.draft.projects)]);
  const loaded = scope.order.flatMap((id, index) =>
    visited.has(id) ? [snapshot.projectOrder[index]!] : [],
  );
  const references = ownerProfileResponse(snapshot, '/projects')!.references!;
  draft.projects = Object.fromEntries(loaded.map((id) => [id, draft.projects[id]!]));
  draft.projectOrder = loaded;
  return {
    snapshot,
    response: {
      revision: snapshot.revision,
      draft,
      project_scope: { order: snapshot.projectOrder, loaded_ids: loaded, references },
    },
  };
}

/** Simulate database-assigned numeric IDs so browser saves cannot rely on temporary draft keys. */
export function canonicalOwnerDraft(draft: ProfileDraft): ProfileDraft {
  const result = structuredClone(draft);
  const mapping = new Map<string, string>();
  for (const [resource, prefix, order] of [
    ['experiences', 'experience', 'experienceOrder'],
    ['projects', 'project', 'projectOrder'],
  ] as const) {
    let maximum = Math.max(
      0,
      ...Object.keys(result[resource]).map((key) => Number(key.split(':')[1]) || 0),
    );
    for (const key of result[order]) {
      const canonical = new RegExp(`^${prefix}:\\d+$`).test(key) ? key : `${prefix}:${++maximum}`;
      mapping.set(key, canonical);
    }
    result[resource] = Object.fromEntries(
      Object.entries(result[resource]).map(([key, item]) => [
        mapping.get(key)!,
        { ...item, id: mapping.get(key)! },
      ]),
    ) as (typeof result)[typeof resource];
    result[order] = result[order].map((key) => mapping.get(key)!);
  }
  for (const project of Object.values(result.projects))
    if (project.experienceId)
      project.experienceId = mapping.get(project.experienceId) ?? project.experienceId;
  return result;
}
