import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  checkRegistrationEmail,
  register,
  sendRegistrationCode,
  signIn,
  signOut,
  verifyRegistrationEmail,
} from '@/features/auth/api/auth';
import { ApiError, errorCode, requestJson, retryRead } from '@/shared/api/http';
import { assertPageAppend } from '@/shared/api/numbered-query';
import { pageFixture } from '../unit-fixtures/portfolio';
import { getSession } from '@/features/auth/session';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe('HTTP boundary', () => {
  const account = {
    id: 12,
    email: 'person@example.com',
    user: 'person',
    role: 'editor',
    is_create: true,
    is_read: true,
    is_update: true,
    is_delete: true,
    is_manage_roles: false,
    is_manage_users: false,
    is_monitor: false,
    is_manage_sites: false,
  };

  it('sends sign-in as one JSON POST with browser-managed cookies and no caching', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(account)));
    vi.stubGlobal('fetch', fetch);
    const credentials = { email: account.email, password: 'test-password' };
    const controller = new AbortController();

    await expect(signIn(credentials, controller.signal)).resolves.toEqual(account);
    expect(fetch).toHaveBeenCalledOnce();
    const [url, options] = fetch.mock.calls[0]!;
    expect(url).toBe('/api/authority/sign-in');
    expect(options).toMatchObject({
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
      credentials: 'include',
      cache: 'no-store',
    });
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(url).not.toContain(credentials.password);
  });

  it.each([null, account])(
    'restores a nullable session with one private uncached GET',
    async (identity) => {
      const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(identity)));
      vi.stubGlobal('fetch', fetch);
      const controller = new AbortController();
      await expect(getSession(controller.signal)).resolves.toEqual(identity);
      expect(fetch).toHaveBeenCalledOnce();
      const [url, options] = fetch.mock.calls[0]!;
      expect(url).toBe('/api/authority/session');
      expect(options).toMatchObject({ method: 'GET', credentials: 'include', cache: 'no-store' });
      expect(options.body).toBeUndefined();
      expect(options.signal).toBeInstanceOf(AbortSignal);
      controller.abort();
      expect(options.signal.aborted).toBe(true);
    },
  );

  it('signs out with one bodyless uncached POST and browser-managed cookies', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ signed_out: true })));
    vi.stubGlobal('fetch', fetch);
    const controller = new AbortController();

    await expect(signOut(controller.signal)).resolves.toEqual({ signed_out: true });
    expect(fetch).toHaveBeenCalledOnce();
    const [url, options] = fetch.mock.calls[0]!;
    expect(url).toBe('/api/authority/sign-out');
    expect(options).toMatchObject({
      method: 'POST',
      headers: { Accept: 'application/json' },
      credentials: 'include',
      cache: 'no-store',
    });
    expect(options.body).toBeUndefined();
    expect(options.headers).not.toHaveProperty('Content-Type');
    expect(options.signal).toBeInstanceOf(AbortSignal);
    controller.abort();
    expect(options.signal.aborted).toBe(true);
  });

  it.each([null, {}, false, { signed_out: false }, { signed_out: 'true' }])(
    'rejects an unsuccessful or malformed sign-out response',
    async (response) => {
      const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(response)));
      vi.stubGlobal('fetch', fetch);
      await expect(signOut()).rejects.toMatchObject({ kind: 'contract' });
      expect(fetch).toHaveBeenCalledOnce();
    },
  );

  it('preserves an unavailable sign-out error without automatically retrying', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ detail: 'SESSION_UNAVAILABLE' }), { status: 503 }),
      );
    vi.stubGlobal('fetch', fetch);
    await expect(signOut()).rejects.toMatchObject({ kind: 'http', status: 503 });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it.each([{}, { ...account, is_manage_users: undefined }, { user: account }, false])(
    'rejects a session response outside the user-or-null contract',
    async (identity) => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(identity))));
      await expect(getSession()).rejects.toMatchObject({ kind: 'contract' });
    },
  );

  it.each([
    'is_create',
    'is_read',
    'is_update',
    'is_delete',
    'is_manage_roles',
    'is_manage_users',
  ] as const)('rejects an otherwise successful sign-in missing %s', async (permission) => {
    const partial: Partial<typeof account> = { ...account };
    delete partial[permission];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(partial))));
    await expect(signIn({ email: account.email, password: 'test-password' })).rejects.toMatchObject(
      {
        kind: 'contract',
      },
    );
  });

  it('checks an exact email with an encoded GET and session cookies, without caching', async () => {
    const email = 'First+portfolio@example.com';
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ email, available: false })));
    vi.stubGlobal('fetch', fetch);
    await expect(checkRegistrationEmail(email)).resolves.toEqual({ email, available: false });
    expect(fetch).toHaveBeenCalledOnce();
    const [url, options] = fetch.mock.calls[0]!;
    expect(url).toBe(`/api/authority/register?email=${encodeURIComponent(email)}`);
    expect(options).toMatchObject({ method: 'GET', credentials: 'include', cache: 'no-store' });
    expect(options.body).toBeUndefined();
  });

  it.each([
    {
      path: '/api/authority/confirm-email',
      body: { email: account.email },
      response: { expires_in: 300, retry_after: 60 },
      status: 202,
      call: () => sendRegistrationCode({ email: account.email }),
    },
    {
      path: '/api/authority/verify-email',
      body: { email: account.email, code: '123' },
      response: { email: account.email, verified: true },
      status: 200,
      call: () => verifyRegistrationEmail({ email: account.email, code: '123' }),
    },
    {
      path: '/api/authority/register',
      body: { email: account.email, password: 'private-password' },
      response: account,
      status: 201,
      call: () => register({ email: account.email, password: 'private-password' }),
    },
  ])(
    'sends $path once with the JSON/session contract',
    async ({ path, body, response, status, call }) => {
      const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(response), { status }));
      vi.stubGlobal('fetch', fetch);
      await expect(call()).resolves.toEqual(response);
      expect(fetch).toHaveBeenCalledOnce();
      const [url, options] = fetch.mock.calls[0]!;
      expect(url).toBe(path);
      expect(options).toMatchObject({
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        credentials: 'include',
        cache: 'no-store',
      });
      expect(url).not.toContain('private-password');
      expect(url).not.toContain('123');
    },
  );

  it.each([
    { response: { email: account.email }, call: () => checkRegistrationEmail(account.email) },
    {
      response: { email: account.email, available: 'true' },
      call: () => checkRegistrationEmail(account.email),
    },
    { response: { expires_in: 300 }, call: () => sendRegistrationCode({ email: account.email }) },
    {
      response: { expires_in: -1, retry_after: 60 },
      call: () => sendRegistrationCode({ email: account.email }),
    },
    {
      response: { email: account.email, verified: 'true' },
      call: () => verifyRegistrationEmail({ email: account.email, code: '123' }),
    },
    {
      response: { ...account, is_manage_users: undefined },
      call: () => register({ email: account.email, password: 'private-password' }),
    },
  ])(
    'rejects incomplete or incorrectly typed registration responses',
    async ({ response, call }) => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(response))));
      await expect(call()).rejects.toMatchObject({ kind: 'contract' });
    },
  );

  it.each([
    {
      status: 409,
      detail: 'EMAIL_ALREADY_EXISTS',
      call: () => register({ email: account.email, password: 'private-password' }),
    },
    {
      status: 400,
      detail: 'INVALID_VERIFICATION_CODE',
      call: () => verifyRegistrationEmail({ email: account.email, code: '123' }),
    },
    {
      status: 400,
      detail: 'EMAIL_VERIFICATION_REQUIRED',
      call: () => verifyRegistrationEmail({ email: account.email, code: '123' }),
    },
    {
      status: 429,
      detail: 'CODE_REQUEST_TOO_FREQUENT',
      call: () => sendRegistrationCode({ email: account.email }),
    },
  ])(
    'returns safe $detail without retrying or leaking backend details',
    async ({ status, detail, call }) => {
      const fetch = vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ detail, private: 'private backend error' }), { status }),
        );
      vi.stubGlobal('fetch', fetch);
      await expect(call()).rejects.toMatchObject({ kind: 'http', status, code: detail });
      expect(fetch).toHaveBeenCalledOnce();
    },
  );

  it('validates success before returning data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"name":"demo"}')));
    await expect(requestJson('portfolio/site', z.object({ name: z.string() }))).resolves.toEqual({
      name: 'demo',
    });
  });
  it.each([
    ['<html>failure</html>', 502, 'http'],
    ['{"detail":[{"type":"missing"}]}', 422, 'http'],
    ['{"detail":{"code":"NOT_FOUND"}}', 404, 'http'],
    ['{"detail":"INVALID_PAGE"}', 400, 'http'],
    ['not json', 200, 'parse'],
    ['{"items":null}', 200, 'contract'],
  ])('classifies responses without exposing payloads', async (body, status, kind) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { status })));
    await expect(
      requestJson('test', z.object({ items: z.array(z.string()) })),
    ).rejects.toMatchObject({ kind });
  });
  it('separates timeout from caller cancellation', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url, options: RequestInit) =>
          new Promise((_resolve, reject) =>
            options.signal?.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError')),
            ),
          ),
      ),
    );
    await expect(requestJson('test', z.unknown(), { timeoutMs: 5 })).rejects.toMatchObject({
      kind: 'timeout',
    });
    const controller = new AbortController();
    const pending = requestJson('test', z.unknown(), { signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });
  it('bounds transient retries and drops untrusted detail', () => {
    expect(retryRead(0, new ApiError('network'))).toBe(true);
    expect(retryRead(1, new ApiError('timeout'))).toBe(false);
    expect(retryRead(0, new ApiError('http', 404))).toBe(false);
    expect(retryRead(0, new ApiError('contract'))).toBe(false);
    expect(errorCode({ detail: 'private error /Users/example' })).toBeUndefined();
    expect(errorCode({ detail: [{ msg: 'field required' }] })).toBeUndefined();
  });
  it('rejects changed totals, wrong pages and cross-page repeated IDs', () => {
    const items = Array.from({ length: 8 }, (_, i) => ({ id: i }));
    const first = pageFixture(items);
    const next = pageFixture(items, 2);
    expect(() => assertPageAppend([first], next, 2)).not.toThrow();
    expect(() => assertPageAppend([first], { ...next, total: 9 }, 2)).toThrow(ApiError);
    expect(() => assertPageAppend([first], next, 3)).toThrow(ApiError);
    expect(() => assertPageAppend([first], { ...next, items: [{ id: 0 }, { id: 7 }] }, 2)).toThrow(
      ApiError,
    );
  });
});
