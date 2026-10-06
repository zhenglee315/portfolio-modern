import type { z } from 'zod';

export type ApiErrorKind = 'network' | 'timeout' | 'http' | 'parse' | 'contract';

/** Safe error classification; raw response bodies and stack traces never reach UI. */
export class ApiError extends Error {
  constructor(
    public readonly kind: ApiErrorKind,
    public readonly status?: number,
    public readonly code?: string,
  ) {
    super(`Request failed: ${kind}`);
    this.name = 'ApiError';
  }
}

/** Extract bounded backend error codes from FastAPI string, object or array detail. */
export function errorCode(body: unknown): string | undefined {
  if (!body || typeof body !== 'object' || !('detail' in body)) return undefined;
  const detail: unknown = body.detail;
  const value =
    typeof detail === 'string'
      ? detail
      : detail && !Array.isArray(detail) && typeof detail === 'object' && 'code' in detail
        ? detail.code
        : undefined;
  return typeof value === 'string' && /^[A-Z_]{1,64}$/.test(value) ? value : undefined;
}

/** Retry only transient reads, once; validation and client errors need explicit recovery. */
export function retryRead(failureCount: number, error: unknown) {
  return (
    failureCount < 1 &&
    error instanceof ApiError &&
    (error.kind === 'network' ||
      error.kind === 'timeout' ||
      (error.kind === 'http' && (error.status ?? 0) >= 500))
  );
}

type RequestOptions = { signal?: AbortSignal; baseUrl?: string; timeoutMs?: number };

/** Read and validate unknown JSON before returning cacheable domain data.
 * @param path Public endpoint path with its query string.
 * @param schema Domain contract; optional fields retain backend null semantics.
 * @param options Query cancellation, server-only build base URL and timeout policy.
 * @throws ApiError for classified failures; caller cancellation remains AbortError.
 */
export async function requestJson<T>(
  path: string,
  schema: z.ZodType<T>,
  options: RequestOptions = {},
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 10_000);
  const signal = options.signal
    ? AbortSignal.any([options.signal, controller.signal])
    : controller.signal;
  const base = options.baseUrl ?? import.meta.env.VITE_API_BASE_URL ?? '/api';
  try {
    const response = await fetch(`${base.replace(/\/$/, '')}/${path.replace(/^\//, '')}`, {
      signal,
      headers: { Accept: 'application/json' },
    });
    const body = await response.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      if (!response.ok) throw new ApiError('http', response.status);
      throw new ApiError('parse');
    }
    if (!response.ok) throw new ApiError('http', response.status, errorCode(parsed));
    const result = schema.safeParse(parsed);
    if (!result.success) throw new ApiError('contract');
    return result.data;
  } catch (error) {
    if (options.signal?.aborted)
      throw options.signal.reason ?? new DOMException('Aborted', 'AbortError');
    if (error instanceof ApiError) throw error;
    if (controller.signal.aborted) throw new ApiError('timeout');
    throw new ApiError('network');
  } finally {
    clearTimeout(timer);
  }
}
