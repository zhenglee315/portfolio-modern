import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ApiError, errorCode, requestJson, retryRead } from '@/shared/api/http';
import { assertPageAppend } from '@/shared/api/numbered-query';
import { pageFixture } from '../fixtures/portfolio';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe('HTTP boundary', () => {
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
