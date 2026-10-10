import { CancelledError, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NotificationEvents } from '@/app/providers/NotificationEvents';
import { createI18n, type Locale } from '@/i18n/config';
import { ApiError } from '@/shared/api/http';

const { notify } = vi.hoisted(() => ({ notify: vi.fn() }));
vi.mock('@/shared/ui/NotificationProvider', () => ({
  useNotifications: () => ({ notify, dismiss: vi.fn() }),
}));

const clients: QueryClient[] = [];

function renderEvents(locale: Locale = 'en') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  const tree = (nextLocale: Locale) => (
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={createI18n(nextLocale)}>
        <NotificationEvents />
      </I18nextProvider>
    </QueryClientProvider>
  );
  const view = render(tree(locale));
  const read = async (key: string, result: unknown, error?: unknown) => {
    await act(async () => {
      await client
        .fetchQuery({
          queryKey: [key],
          staleTime: 0,
          networkMode: 'always',
          queryFn: () => (error === undefined ? Promise.resolve(result) : Promise.reject(error)),
        })
        .catch(() => undefined);
    });
  };
  return { client, view, read, rerender: (nextLocale: Locale) => view.rerender(tree(nextLocale)) };
}

function rejectInBrowser(reason: unknown) {
  const event = new Event('unhandledrejection');
  Object.defineProperty(event, 'reason', { value: reason });
  window.dispatchEvent(event);
}

afterEach(() => {
  for (const client of clients.splice(0)) client.clear();
  vi.restoreAllMocks();
});

describe('browser notification events', () => {
  it.each([
    [new ApiError('network'), 'warning', 'notifications.connectionFailed'],
    [new ApiError('timeout'), 'warning', 'notifications.connectionFailed'],
    [new ApiError('http', 503, 'PRIVATE_BACKEND_DETAIL'), 'error', 'notifications.requestFailed'],
    [new ApiError('parse'), 'bug', 'notifications.invalidResponse'],
    [new ApiError('contract'), 'bug', 'notifications.invalidResponse'],
    [new Error('private exception details'), 'bug', 'notifications.unexpectedError'],
  ] as const)('classifies %s without exposing exception details', async (error, kind, key) => {
    const { read } = renderEvents();
    await read('request', undefined, error);
    expect(notify).toHaveBeenCalledExactlyOnceWith({
      kind,
      message: createI18n('en').t(key),
      id: 'query:["request"]',
    });
    expect(JSON.stringify(notify.mock.calls)).not.toMatch(
      /PRIVATE_BACKEND_DETAIL|private exception/,
    );
  });

  it('reports only the final failure after query retries finish', async () => {
    const { client } = renderEvents();
    const queryFn = vi.fn(() => Promise.reject(new ApiError('network')));
    await act(async () => {
      await client
        .fetchQuery({ queryKey: ['retry'], queryFn, retry: 1, retryDelay: 0 })
        .catch(() => undefined);
    });
    expect(queryFn).toHaveBeenCalledTimes(2);
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('deduplicates recurring failures across locale rerenders until a successful request', async () => {
    const { client, read, rerender } = renderEvents();
    await read('heartbeat', undefined, new ApiError('network'));
    rerender('zh-Hant');
    await read('heartbeat', undefined, new ApiError('network'));
    expect(notify).toHaveBeenCalledTimes(1);

    act(() => client.setQueryData(['heartbeat'], { cached: true }));
    expect(notify).toHaveBeenCalledTimes(1);
    await read('heartbeat', { connected: true });
    expect(notify).toHaveBeenLastCalledWith({
      kind: 'success',
      message: createI18n('zh-Hant').t('notifications.connectionRestored'),
      id: 'connection',
    });
    await read('heartbeat', { connected: true });
    expect(notify).toHaveBeenCalledTimes(2);
    await read('heartbeat', undefined, new ApiError('network'));
    expect(notify).toHaveBeenCalledTimes(3);
  });

  it('does not notify normal successful reads or aborted requests', async () => {
    const { read } = renderEvents();
    await read('success', { ok: true });
    await read('aborted', undefined, new DOMException('cancelled', 'AbortError'));
    await read('cancelled', undefined, new CancelledError());
    expect(notify).not.toHaveBeenCalled();
  });

  it('reports offline and online once and suppresses overlapping network warnings', async () => {
    const { read } = renderEvents();
    window.dispatchEvent(new Event('online'));
    expect(notify).not.toHaveBeenCalled();
    window.dispatchEvent(new Event('offline'));
    window.dispatchEvent(new Event('offline'));
    await read('offline-request', undefined, new ApiError('network'));
    expect(notify).toHaveBeenCalledExactlyOnceWith({
      kind: 'warning',
      message: createI18n('en').t('notifications.offline'),
      id: 'connection',
    });
    window.dispatchEvent(new Event('online'));
    window.dispatchEvent(new Event('online'));
    await read('offline-request', { connected: true });
    expect(notify).toHaveBeenCalledTimes(2);
    expect(notify).toHaveBeenLastCalledWith({
      kind: 'success',
      message: createI18n('en').t('notifications.connectionRestored'),
      id: 'connection',
    });
  });

  it('coalesces a query failure immediately before an offline event and its eventual recovery', async () => {
    const { read } = renderEvents();
    await read('network', undefined, new ApiError('network'));
    window.dispatchEvent(new Event('offline'));
    expect(notify).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event('online'));
    await read('network', { connected: true });
    expect(notify).toHaveBeenCalledTimes(2);
  });

  it('recognizes an already offline browser at mount', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    renderEvents();
    expect(notify).toHaveBeenCalledExactlyOnceWith({
      kind: 'warning',
      message: createI18n('en').t('notifications.offline'),
      id: 'connection',
    });
  });

  it('reports uncaught errors and rejected promises as safe generic bugs, excluding cancellation', () => {
    renderEvents();
    window.dispatchEvent(new ErrorEvent('error', { error: new Error('private stack detail') }));
    rejectInBrowser(new ApiError('network'));
    expect(notify).toHaveBeenCalledTimes(2);
    expect(notify).toHaveBeenLastCalledWith({
      kind: 'bug',
      message: createI18n('en').t('notifications.unexpectedError'),
      id: 'unhandled-browser-error',
    });
    window.dispatchEvent(
      new ErrorEvent('error', { error: new DOMException('cancelled', 'AbortError') }),
    );
    rejectInBrowser(new DOMException('cancelled', 'AbortError'));
    rejectInBrowser(new CancelledError());
    expect(notify).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(notify.mock.calls)).not.toContain('private stack detail');
  });

  it('removes browser listeners and the cache subscription on unmount', async () => {
    const { view, read } = renderEvents();
    const removeListener = vi.spyOn(window, 'removeEventListener');
    view.unmount();
    for (const type of ['offline', 'online', 'error', 'unhandledrejection']) {
      expect(removeListener).toHaveBeenCalledWith(type, expect.any(Function));
    }
    window.dispatchEvent(new Event('offline'));
    window.dispatchEvent(new Event('online'));
    await read('after-unmount', undefined, new ApiError('network'));
    expect(notify).not.toHaveBeenCalled();
  });
});
