import { dehydrate } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createQueryClient } from '@/app/query-client';
import {
  authSessionKey,
  authSessionQuery,
  forgetAuthSession,
  refreshAuthSession,
  type AuthUser,
} from '@/features/auth/session';

const clients: ReturnType<typeof createQueryClient>[] = [];
afterEach(() => {
  clients.splice(0).forEach((client) => client.clear());
  vi.unstubAllGlobals();
});

const account: AuthUser = {
  id: 91,
  user: 'operator',
  email: 'operator@example.com',
  role: 'custom-reviewer',
  is_create: true,
  is_read: true,
  is_update: false,
  is_delete: false,
  is_manage_sites: true,
  is_manage_users: false,
  is_manage_roles: true,
};

function seedClient() {
  const client = createQueryClient();
  clients.push(client);
  client.setQueryDefaults(authSessionKey, { meta: { private: true } });
  client.setQueryData(authSessionKey, account);
  const privateKey = ['management', account.id, 'roles'];
  client.setQueryDefaults(privateKey, { meta: { private: true } });
  client.setQueryData(privateKey, { items: [{ id: 1, role: 'cached-private-role' }] });
  const publicKey = ['portfolio', 'default', 'site'];
  client.setQueryData(publicKey, { user: 'public-owner' });
  return { client, privateKey, publicKey };
}

describe('fresh management SESSION verification', () => {
  it('bypasses a fresh identity cache for every entry with cookie credentials and no HTTP cache', async () => {
    const fetch = vi.fn().mockImplementation(() => Promise.resolve(Response.json(account)));
    vi.stubGlobal('fetch', fetch);
    const { client, privateKey } = seedClient();
    expect(await client.fetchQuery(authSessionQuery())).toEqual(account);
    expect(fetch).not.toHaveBeenCalled();

    expect(await refreshAuthSession(client, new AbortController().signal)).toEqual(account);
    expect(await refreshAuthSession(client, new AbortController().signal)).toEqual(account);
    expect(fetch).toHaveBeenCalledTimes(2);
    for (const [url, options] of fetch.mock.calls) {
      expect(url).toBe('/api/authority/session');
      expect(options).toMatchObject({ method: 'GET', credentials: 'include', cache: 'no-store' });
      expect(options.signal).toBeInstanceOf(AbortSignal);
    }
    expect(client.getQueryData(privateKey)).toBeDefined();
    expect(dehydrate(client).queries.map((query) => query.queryKey)).toEqual([
      ['portfolio', 'default', 'site'],
    ]);
  });

  it.each([
    ['revoked site permission', { ...account, is_manage_sites: false }],
    ['revoked role permission', { ...account, is_manage_roles: false }],
    ['changed user permission', { ...account, is_manage_users: true }],
    ['changed identity', { ...account, id: 92 }],
    ['changed role', { ...account, role: 'another-custom-role' }],
    ['expired session', null],
  ])(
    'discards private rows before returning %s and retains public content',
    async (_label, current) => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(current)));
      const { client, privateKey, publicKey } = seedClient();
      expect(await refreshAuthSession(client, new AbortController().signal)).toEqual(current);
      expect(client.getQueryData(authSessionKey)).toEqual(current);
      expect(client.getQueryData(privateKey)).toBeUndefined();
      expect(client.getQueryData(publicKey)).toEqual({ user: 'public-owner' });
    },
  );

  it.each([
    [
      'network failure',
      () => Promise.reject(new TypeError('PRIVATE_CONNECTION_DETAILS')),
      'network',
    ],
    [
      'server error',
      () => Promise.resolve(Response.json({ detail: 'PRIVATE_BODY' }, { status: 500 })),
      'http',
    ],
    [
      'invalid session',
      () => Promise.resolve(Response.json({ id: 91, is_manage_sites: true })),
      'contract',
    ],
  ])(
    'rejects %s without returning cached permission or retrying',
    async (_label, respond, kind) => {
      const fetch = vi.fn().mockImplementation(respond);
      vi.stubGlobal('fetch', fetch);
      const { client } = seedClient();
      await expect(refreshAuthSession(client, new AbortController().signal)).rejects.toMatchObject({
        kind,
      });
      expect(fetch).toHaveBeenCalledOnce();
    },
  );

  it('does not start SESSION verification after navigation has already been canceled', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const { client } = seedClient();
    const controller = new AbortController();
    controller.abort();
    await expect(refreshAuthSession(client, controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('passes canceled navigation into HTTP and ignores a late successful response', async () => {
    let complete!: (response: Response) => void;
    let httpSignal: AbortSignal | undefined;
    const fetch = vi.fn((_url: string, options: RequestInit) => {
      httpSignal = options.signal ?? undefined;
      return new Promise<Response>((resolve) => {
        complete = resolve;
      });
    });
    vi.stubGlobal('fetch', fetch);
    const { client } = seedClient();
    const controller = new AbortController();
    const pending = refreshAuthSession(client, controller.signal);
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    controller.abort();
    expect(httpSignal?.aborted).toBe(true);
    complete(Response.json({ ...account, id: 92 }));
    await rejected;
    expect(client.getQueryData(authSessionKey)).toEqual(account);
  });

  it('sign-out cancels an in-flight verification and cannot be overwritten by its late response', async () => {
    let complete!: (response: Response) => void;
    let httpSignal: AbortSignal | undefined;
    const fetch = vi.fn((_url: string, options: RequestInit) => {
      httpSignal = options.signal ?? undefined;
      return new Promise<Response>((resolve) => {
        complete = resolve;
      });
    });
    vi.stubGlobal('fetch', fetch);
    const { client, privateKey } = seedClient();
    const pending = refreshAuthSession(client, new AbortController().signal);
    const rejected = expect(pending).rejects.toBeDefined();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    await forgetAuthSession(client);
    expect(httpSignal?.aborted).toBe(true);
    complete(Response.json(account));
    await rejected;
    expect(client.getQueryData(authSessionKey)).toBeNull();
    expect(client.getQueryData(privateKey)).toBeUndefined();
  });
});
