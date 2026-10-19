import { z } from 'zod';
import { ApiError, requestJson } from '@/shared/api/http';
import { profileDraftSchema, type ProfileDraft } from '../model/profile';
import type { ProfileProjectPage } from '../model/projects';
import { numberedPageSchema } from '@/shared/schemas/records';

const revision = z.number().int().nonnegative();
const shape = profileDraftSchema.shape;
const siteSchema = z.object({
  revision,
  site: z.object({
    version: z.literal(1),
    source: shape.source.unwrap(),
    brand: shape.brand.unwrap(),
    profiles: shape.profiles,
    social: shape.social,
  }),
});
const collection = <T extends z.ZodType>(item: T) =>
  z.object({ revision, items: z.array(item), order: z.array(z.string()) });
const experiencesSchema = collection(shape.experiences.valueType);
const projectReferences = shape.projectScope.unwrap().shape.references;
const projectsSchema = numberedPageSchema(
  shape.projects.valueType,
  z.number().int().min(1).max(100),
)
  .safeExtend({
    revision,
    order: z.array(z.string()),
    references: projectReferences,
  })
  .superRefine((value, context) => {
    const ids = value.items.map((item) => item.id);
    if (
      value.total !== value.order.length ||
      new Set(value.order).size !== value.order.length ||
      ids.join('|') !==
        value.order.slice((value.page - 1) * value.size, value.page * value.size).join('|') ||
      value.order.some((id) => !value.references[id])
    )
      context.addIssue({ code: 'custom', message: 'Invalid project pagination.' });
  });
const categoriesSchema = collection(shape.categories.valueType);
const skillsSchema = z.object({ revision, items: z.array(shape.skills.valueType) });
const projectScopeSchema = z.object({
  order: z.array(z.string()),
  loaded_ids: z.array(z.string()),
  references: projectReferences,
});
const savedSchema = z.object({
  revision,
  draft: profileDraftSchema,
  project_scope: projectScopeSchema.nullish(),
});
const privateRead = { credentials: 'include', cache: 'no-store' } as const;

/** Read the owner's complete editable content, including hidden records and all translations.
 * Each response must describe one revision and the current account; public caches stay separate.
 */
export async function readProfileContent(user: string, signal: AbortSignal): Promise<ProfileDraft> {
  const options = { ...privateRead, signal };
  const [site, experiences, projects, categories, skills] = await Promise.all([
    requestJson('portfolio/me/site', siteSchema, options),
    requestJson('portfolio/me/experiences', experiencesSchema, options),
    readProfileProjectPage(1, signal),
    requestJson('portfolio/me/skill-categories', categoriesSchema, options),
    requestJson('portfolio/me/skills', skillsSchema, options),
  ]);
  if (
    site.site.source.user !== user ||
    [experiences, projects, categories, skills].some((value) => value.revision !== site.revision)
  )
    throw new ApiError('contract');
  const records = <T extends { id: string }>(items: T[]) =>
    Object.fromEntries(items.map((item) => [item.id, item]));
  const result = profileDraftSchema.safeParse({
    ...site.site,
    revision: site.revision,
    experiences: records(experiences.items),
    experienceOrder: experiences.order,
    projects: records(projects.items),
    projectOrder: projects.order,
    projectScope: {
      sourceOrder: projects.order,
      loadedIds: projects.items.map((item) => item.id),
      references: projects.references,
    },
    categories: records(categories.items),
    categoryOrder: categories.order,
    skills: records(skills.items),
  });
  if (!result.success) throw new ApiError('contract');
  return result.data;
}

/** The original owner endpoint uses the shared page/size input and five-field numbered response. */
export async function readProfileProjectPage(
  page: number,
  signal: AbortSignal,
  size = 6,
): Promise<ProfileProjectPage> {
  const result = await requestJson(
    `portfolio/me/projects?page=${page}&size=${size}`,
    projectsSchema,
    {
      ...privateRead,
      signal,
    },
  );
  if (result.page !== page || result.size !== size) throw new ApiError('contract');
  return result;
}

/** Submit once: the backend commits all sections or rolls back, then returns canonical IDs.
 * Transport/commit uncertainty never becomes a successful local save and is never retried here.
 */
export async function saveProfileContent(draft: ProfileDraft, expectedRevision: number) {
  const content = { ...draft };
  delete content.revision;
  const scope = content.projectScope;
  delete content.projectScope;
  if (scope) content.projectOrder = content.projectOrder.filter((id) => content.projects[id]);
  const result = await requestJson('portfolio/site/save', savedSchema, {
    ...privateRead,
    method: 'POST',
    json: {
      expected_revision: expectedRevision,
      draft: content,
      ...(scope
        ? { project_scope: { loaded_ids: scope.loadedIds, order: draft.projectOrder } }
        : {}),
    },
    timeoutMs: 30_000,
  });
  if (result.revision <= expectedRevision) throw new ApiError('contract');
  if (scope && !result.project_scope) throw new ApiError('contract');
  const next = {
    ...result.draft,
    revision: result.revision,
    ...(result.project_scope
      ? {
          projectOrder: result.project_scope.order,
          projectScope: {
            sourceOrder: result.project_scope.order,
            loadedIds: result.project_scope.loaded_ids,
            references: result.project_scope.references,
          },
        }
      : {}),
  };
  const parsed = profileDraftSchema.safeParse(next);
  if (!parsed.success) throw new ApiError('contract');
  return parsed.data;
}
