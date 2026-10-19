import { z } from 'zod';
import { ApiError, requestJson } from '@/shared/api/http';
import { profileDraftSchema, type ProfileDraft } from '../model/profile';

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
const projectsSchema = collection(shape.projects.valueType);
const categoriesSchema = collection(shape.categories.valueType);
const skillsSchema = z.object({ revision, items: z.array(shape.skills.valueType) });
const savedSchema = z.object({ revision, draft: profileDraftSchema });
const privateRead = { credentials: 'include', cache: 'no-store' } as const;

/** Read the owner's complete editable content, including hidden records and all translations.
 * Each response must describe one revision and the current account; public caches stay separate.
 */
export async function readProfileContent(user: string, signal: AbortSignal): Promise<ProfileDraft> {
  const options = { ...privateRead, signal };
  const [site, experiences, projects, categories, skills] = await Promise.all([
    requestJson('portfolio/me/site', siteSchema, options),
    requestJson('portfolio/me/experiences', experiencesSchema, options),
    requestJson('portfolio/me/projects', projectsSchema, options),
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
    categories: records(categories.items),
    categoryOrder: categories.order,
    skills: records(skills.items),
  });
  if (!result.success) throw new ApiError('contract');
  return result.data;
}

/** Submit once: the backend commits all sections or rolls back, then returns canonical IDs.
 * Transport/commit uncertainty never becomes a successful local save and is never retried here.
 */
export async function saveProfileContent(draft: ProfileDraft, expectedRevision: number) {
  const content = { ...draft };
  delete content.revision;
  const result = await requestJson('portfolio/site/save', savedSchema, {
    ...privateRead,
    method: 'POST',
    json: { expected_revision: expectedRevision, draft: content },
    timeoutMs: 30_000,
  });
  if (result.revision <= expectedRevision) throw new ApiError('contract');
  return { ...result.draft, revision: result.revision };
}
