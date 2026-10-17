import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { monitorSnapshotSchema, type MonitorSnapshot } from './monitor';

type Observation = { snapshot: MonitorSnapshot; receivedAt: number };
type MonitorState = {
  status: 'connecting' | 'live' | 'offline' | 'unavailable' | 'denied';
  workers?: Observation;
  requests?: Observation;
};

/** Own one WebSocket-only Socket.IO connection for the current private page.
 * Request view subscribes to both topics; worker view only needs resources.
 * Pause/unmount/identity changes dispose listeners, retries and the connection.
 * Server denial clears private observations; transport failure retains a frozen view.
 */
export function useMonitorSocket(
  enabled: boolean,
  paused: boolean,
  accountId?: number,
  topic: 'workers' | 'requests' = 'requests',
) {
  const [state, setState] = useState<MonitorState>({ status: 'connecting' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled || paused) return;
    let active = true;
    let subscribed = false;
    let deniedConnection = false;
    let unavailableConnection = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    // Compare revisions per topic without losing precision in Redis-generated IDs.
    // A new connection starts a new subscription baseline, including revision "0".
    const revisions = new Map<string, bigint>();
    const base = new URL(import.meta.env.VITE_API_BASE_URL ?? '/api', window.location.origin);
    const socket = io(`${base.origin}/monitor`, {
      path: `${base.pathname.replace(/\/$/, '')}/socket.io`,
      transports: ['websocket'],
      withCredentials: true,
      autoConnect: false,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10_000,
      timeout: 10_000,
    });
    const update = (status: MonitorState['status'], clear = false) => {
      if (active) setState((previous) => (clear ? { status } : { ...previous, status }));
    };
    const scheduleRetry = (): void => {
      clearTimeout(retryTimer);
      retryTimer = setTimeout(() => {
        if (!active || deniedConnection) return;
        if (socket.connected) subscribe();
        else socket.connect();
      }, 5000);
    };
    const subscribe = (): void => {
      if (subscribed) return;
      subscribed = true;
      socket
        .timeout(10_000)
        .emit(
          'monitor_subscribe',
          { topics: topic === 'requests' ? ['requests', 'workers'] : ['workers'] },
          (error: Error | null, result: { ok?: boolean; error?: string } | undefined) => {
            if (error || !result?.ok) {
              subscribed = false;
              const denied = ['AUTH_REQUIRED', 'PERMISSION_DENIED'].includes(result?.error ?? '');
              deniedConnection = denied;
              update(denied ? 'denied' : 'unavailable', denied);
              if (!denied) scheduleRetry();
            }
          },
        );
    };
    socket.on('connect', () => {
      clearTimeout(retryTimer);
      unavailableConnection = false;
      revisions.clear();
      subscribed = false;
      update('connecting');
      subscribe();
    });
    socket.on('monitor_snapshot', (raw: unknown) => {
      // Validate the transport boundary before any data reaches cards or animation.
      const parsed = monitorSnapshotSchema.safeParse(raw);
      if (!active) return;
      if (!parsed.success) {
        update('unavailable');
        return;
      }
      const value = parsed.data;
      const revision = BigInt(value.revision);
      const previous = revisions.get(value.topic);
      if (previous !== undefined && revision <= previous) return;
      revisions.set(value.topic, revision);
      setState((current) => ({
        ...current,
        status: 'live',
        [value.topic]: { snapshot: value, receivedAt: performance.now() },
      }));
    });
    socket.on('monitor_status', (value: { status?: string }) => {
      if (value.status === 'denied') {
        deniedConnection = true;
        update('denied', true);
        socket.disconnect();
      } else if (value.status === 'unavailable') {
        unavailableConnection = true;
        update('unavailable');
      } else if (value.status === 'ready') {
        subscribed = false;
        revisions.clear();
        subscribe();
      }
    });
    socket.on('disconnect', (reason) => {
      subscribed = false;
      if (!deniedConnection) {
        update(unavailableConnection ? 'unavailable' : 'offline');
        if (reason === 'io server disconnect') scheduleRetry();
      }
    });
    socket.on('connect_error', (error: { message?: string; data?: { code?: string } }) => {
      const unavailable = error.data?.code === 'MONITOR_UNAVAILABLE';
      const denied = !unavailable && error.message === 'Connection rejected by server';
      deniedConnection = denied;
      update(denied ? 'denied' : unavailable ? 'unavailable' : 'offline', denied);
      if (!denied) scheduleRetry();
    });
    socket.connect();
    return () => {
      active = false;
      clearTimeout(retryTimer);
      if (socket.connected) socket.emit('monitor_unsubscribe');
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [enabled, paused, accountId, attempt, topic]);
  return { ...state, retry: () => setAttempt((value) => value + 1) };
}
