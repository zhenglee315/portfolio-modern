import { describe, expect, it, vi, afterEach } from 'vitest';
import { loadProfileContent } from '@/pages/profile/model/loadProfileContent';
import { saveProfileContent } from '@/features/profile-content';
import { ownerProfileSnapshot, ownerProfileResponse } from '../fixtures/profile-owner';

afterEach(() => vi.unstubAllGlobals());

function apiFixture(transform?: (path: string, body: unknown) => unknown) {
  const reads: URL[] = [];
  const snapshot = ownerProfileSnapshot('alex');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, options?: RequestInit) => {
      expect(options?.method).toBe('GET');
      expect(options?.credentials).toBe('include');
      expect(options?.cache).toBe('no-store');
      const url = new URL(input, 'http://local.test');
      reads.push(url);
      const original = ownerProfileResponse(snapshot, url.pathname, url.searchParams);
      const body = transform ? transform(url.pathname, original) : original;
      return new Response(JSON.stringify(body ?? { detail: 'AUTHENTICATION_REQUIRED' }), {
        status: body === undefined ? 401 : 200,
      });
    }),
  );
  return reads;
}

describe('owner Portfolio editor reads and atomic saves', () => {
  it('loads one project page with a complete reference index through five private reads', async () => {
    const reads = apiFixture();
    const draft = await loadProfileContent('alex', new AbortController().signal);
    expect(draft.projectOrder).toHaveLength(15);
    expect(draft.experienceOrder).toHaveLength(8);
    expect(draft.categoryOrder).toHaveLength(7);
    expect(draft.categories['category:category-6']?.skillIds).toHaveLength(14);
    expect(draft.skills['skill:skill-13']?.labels?.['zh-Hant']).toBe('zh-Hant Skill 14');
    expect(Object.keys(draft.projects)).toHaveLength(6);
    expect(draft.projects['project:15']).toBeUndefined();
    expect(draft.projectScope?.references['project:15']?.names['zh-Hant']).toBe(
      'zh-Hant Project 15',
    );
    expect(draft.projects['project:1']?.translations.en).toMatchObject({
      organization: 'Example Studio',
      workflow: 'Design and deliver.',
      technical: 'Typed boundaries.',
    });
    expect(draft.revision).toBe(0);
    expect(reads).toHaveLength(5);
    expect(
      reads.every(
        (url) =>
          url.pathname.startsWith('/api/portfolio/me/') &&
          (url.pathname.endsWith('/projects')
            ? url.search === '?page=1&size=6'
            : url.search === ''),
      ),
    ).toBe(true);
  });

  it('rejects mixed revisions and identity changes instead of mixing owners or losing content', async () => {
    apiFixture((path, body) =>
      path.endsWith('/projects') ? { ...(body as object), revision: 9 } : body,
    );
    await expect(loadProfileContent('alex', new AbortController().signal)).rejects.toMatchObject({
      kind: 'contract',
    });
    apiFixture();
    await expect(
      loadProfileContent('different-owner', new AbortController().signal),
    ).rejects.toMatchObject({ kind: 'contract' });
  });

  it('reports private-read failures without falling back to public examples', async () => {
    apiFixture(() => undefined);
    await expect(loadProfileContent('alex', new AbortController().signal)).rejects.toMatchObject({
      kind: 'http',
      status: 401,
    });
  });

  it('posts all sections once with the original revision and accepts canonical server identities', async () => {
    const draft = ownerProfileSnapshot('alex');
    const fetch = vi.fn(async (input: string, options?: RequestInit) => {
      expect(input).toBe('/api/portfolio/site/save');
      expect(options?.method).toBe('POST');
      const inputBody = JSON.parse(options!.body as string);
      expect(inputBody.expected_revision).toBe(0);
      expect(inputBody.draft.revision).toBeUndefined();
      expect(inputBody.draft.projectOrder).toHaveLength(15);
      return new Response(JSON.stringify({ revision: 1, draft }));
    });
    vi.stubGlobal('fetch', fetch);
    expect((await saveProfileContent(draft, 0)).revision).toBe(1);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('never retries a conflict, an uncertain result or a committed cache failure', async () => {
    const fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ detail: 'PORTFOLIO_EDIT_CONFLICT' }), { status: 409 }),
    );
    vi.stubGlobal('fetch', fetch);
    await expect(saveProfileContent(ownerProfileSnapshot('alex'), 0)).rejects.toMatchObject({
      status: 409,
      code: 'PORTFOLIO_EDIT_CONFLICT',
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
