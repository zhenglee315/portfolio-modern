import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMonitorSocket } from '@/features/monitoring/useMonitorSocket';

const { io } = vi.hoisted(() => ({ io: vi.fn() }));
vi.mock('socket.io-client', () => ({ io }));

type Listener = (...args: unknown[]) => void;

function socketFixture() {
  const listeners = new Map<string, Listener>();
  const socket = {
    connected: false,
    on: vi.fn((event: string, listener: Listener) => listeners.set(event, listener)),
    emit: vi.fn(),
    timeout: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    removeAllListeners: vi.fn(),
  };
  socket.timeout.mockReturnValue(socket);
  socket.connect.mockImplementation(() => {
    socket.connected = true;
    listeners.get('connect')?.();
    return socket;
  });
  socket.disconnect.mockImplementation(() => {
    socket.connected = false;
    listeners.get('disconnect')?.('io client disconnect');
    return socket;
  });
  socket.removeAllListeners.mockImplementation(() => listeners.clear());
  return {
    socket,
    send: (event: string, value?: unknown) => act(() => listeners.get(event)?.(value)),
  };
}

function snapshot(topic = 'requests', revision = '1') {
  return {
    schema: 1,
    topic,
    revision,
    sampled_at: 123,
    cycle_seconds: 2,
    data: {
      workers: [],
      requests: [],
      window_seconds: 60,
      health_basis: 'lifespan_heartbeat',
      summary: { running_workers: 0, expected_workers: 0, restarts: 0 },
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  io.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('monitor socket ownership', () => {
  it('subscribes to both topics with cookies over one WebSocket-only connection', () => {
    const fixture = socketFixture();
    io.mockReturnValue(fixture.socket);
    const { unmount } = renderHook(() => useMonitorSocket(true, false, 7));
    expect(io).toHaveBeenCalledTimes(1);
    expect(io.mock.calls[0]?.[1]).toMatchObject({
      transports: ['websocket'],
      withCredentials: true,
    });
    expect(fixture.socket.emit).toHaveBeenCalledWith(
      'monitor_subscribe',
      { topics: ['requests', 'workers'] },
      expect.any(Function),
    );
    unmount();
    expect(fixture.socket.emit).toHaveBeenCalledWith('monitor_unsubscribe');
    expect(fixture.socket.removeAllListeners).toHaveBeenCalledOnce();
    expect(fixture.socket.disconnect).toHaveBeenCalledOnce();
  });

  it('compares large revisions per topic and resets the baseline on reconnect', () => {
    const fixture = socketFixture();
    io.mockReturnValue(fixture.socket);
    const { result } = renderHook(() => useMonitorSocket(true, false, 7));
    fixture.send('monitor_snapshot', snapshot('requests', '9007199254740993'));
    fixture.send('monitor_snapshot', snapshot('requests', '9007199254740992'));
    fixture.send('monitor_snapshot', snapshot('workers', '0'));
    expect(result.current.requests?.snapshot.revision).toBe('9007199254740993');
    expect(result.current.workers?.snapshot.revision).toBe('0');
    fixture.send('disconnect', 'transport close');
    expect(result.current.status).toBe('offline');
    expect(result.current.requests).toBeDefined();
    fixture.send('connect');
    fixture.send('monitor_snapshot', snapshot('requests', '0'));
    expect(result.current.requests?.snapshot.revision).toBe('0');
    expect(result.current.status).toBe('live');
  });

  it('clears denied observations and rejects late snapshots without retrying', () => {
    const fixture = socketFixture();
    io.mockReturnValue(fixture.socket);
    const { result } = renderHook(() => useMonitorSocket(true, false, 7));
    fixture.send('monitor_snapshot', snapshot());
    fixture.send('monitor_status', { status: 'denied' });
    fixture.send('monitor_snapshot', snapshot('requests', '2'));
    act(() => vi.advanceTimersByTime(20_000));
    expect(result.current.status).toBe('denied');
    expect(result.current.requests).toBeUndefined();
    expect(fixture.socket.connect).toHaveBeenCalledOnce();
  });

  it('freezes on pause and clears private data on identity changes or disabling', () => {
    const first = socketFixture(),
      second = socketFixture();
    io.mockReturnValueOnce(first.socket).mockReturnValue(second.socket);
    const { result, rerender } = renderHook(
      ({ paused, id, enabled }) => useMonitorSocket(enabled, paused, id),
      { initialProps: { paused: false, id: 7, enabled: true } },
    );
    first.send('monitor_snapshot', snapshot());
    rerender({ paused: true, id: 7, enabled: true });
    expect(first.socket.disconnect).toHaveBeenCalledOnce();
    expect(result.current.requests).toBeDefined();
    rerender({ paused: false, id: 8, enabled: true });
    expect(result.current.requests).toBeUndefined();
    second.send('monitor_snapshot', snapshot());
    rerender({ paused: false, id: 8, enabled: false });
    expect(result.current.requests).toBeUndefined();
  });

  it('keeps a full server retryable instead of reporting a permission denial', () => {
    const fixture = socketFixture();
    io.mockReturnValue(fixture.socket);
    const { result } = renderHook(() => useMonitorSocket(true, false, 7));
    fixture.socket.connected = false;
    fixture.send('connect_error', {
      message: 'Connection rejected by server',
      data: { code: 'MONITOR_UNAVAILABLE' },
    });
    expect(result.current.status).toBe('unavailable');
    act(() => vi.advanceTimersByTime(5000));
    expect(fixture.socket.connect).toHaveBeenCalledTimes(2);
    fixture.send('monitor_snapshot', snapshot());
    expect(result.current.status).toBe('live');
  });

  it('retains a frozen snapshot on malformed updates and retries a server disconnect', () => {
    const fixture = socketFixture();
    io.mockReturnValue(fixture.socket);
    const { result } = renderHook(() => useMonitorSocket(true, false, 7, 'workers'));
    expect(fixture.socket.emit).toHaveBeenCalledWith(
      'monitor_subscribe',
      { topics: ['workers'] },
      expect.any(Function),
    );
    fixture.send('monitor_snapshot', snapshot('workers'));
    fixture.send('monitor_snapshot', { ...snapshot(), revision: 'invalid' });
    expect(result.current.status).toBe('unavailable');
    expect(result.current.workers).toBeDefined();
    fixture.socket.connected = false;
    fixture.send('disconnect', 'io server disconnect');
    act(() => vi.advanceTimersByTime(5000));
    expect(fixture.socket.connect).toHaveBeenCalledTimes(2);
  });
});
