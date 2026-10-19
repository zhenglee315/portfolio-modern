import { useEffect, useId, useRef, useState, type RefObject } from 'react';
import type { MonitorRequest } from './monitor';
import styles from './MonitoringPanel.module.css';

type Route = { id: string; incoming: string; outgoing: string };
type Pulse = { incoming?: number; outgoing?: number; delay: boolean };

/** Directional pulses follow observed request identities, never simulated traffic. */
export function FlowRoutes({
  root,
  requests,
  animate,
}: {
  root: RefObject<HTMLDivElement | null>;
  requests: MonitorRequest[];
  animate: boolean;
}) {
  const arrowId = `flow-arrow-${useId().replace(/:/g, '')}`;
  const [routes, setRoutes] = useState<Route[]>([]);
  const [pulses, setPulses] = useState<Record<string, Pulse>>({});
  const seen = useRef<Map<string, string> | null>(null);
  const sequence = useRef(0);
  useEffect(() => {
    const container = root.current;
    if (!container) return;
    const measure = () => {
      // Read rendered card bounds so responsive widths and added workers keep the
      // SVG arrows attached to their real endpoints rather than fixed coordinates.
      const bounds = container.getBoundingClientRect();
      const client = container.querySelector('[data-flow-client]')?.getBoundingClientRect();
      if (!client) return;
      const x = client.right - bounds.left;
      const y = client.top + client.height / 2 - bounds.top;
      const returnLabel = container.querySelector('[data-flow-return]')?.getBoundingClientRect();
      const backY = returnLabel ? returnLabel.bottom - bounds.top + 2 : bounds.height - 12;
      const backX = client.left + client.width / 2 - bounds.left;
      const vertical = client.width > bounds.width / 2;
      const service = container.querySelector('[data-flow-server]')?.getBoundingClientRect();
      const result = [...container.querySelectorAll<HTMLElement>('[data-flow-worker]')].map(
        (worker) => {
          const box = worker.getBoundingClientRect();
          const stage = worker.querySelector('[data-flow-stages]')?.getBoundingClientRect() ?? box;
          const left = box.left - bounds.left;
          const right = box.right - bounds.left;
          const center = stage.top + stage.height / 2 - bounds.top;
          if (vertical) {
            // Phone cards stack below the client. Route through the service gutters,
            // keeping observed request pulses off the readable stages and metrics.
            const entryY = box.top - bounds.top + 22;
            const exitY = stage.bottom - bounds.top - 18;
            const branchY = (service?.top ?? box.top) - bounds.top - 8;
            return {
              id: worker.dataset.flowWorker!,
              incoming: `M ${backX} ${client.bottom - bounds.top} V ${branchY} H ${left - 7} V ${entryY} H ${left}`,
              outgoing: `M ${right} ${exitY} H ${bounds.width - 6} V ${y} H ${client.right - bounds.left}`,
            };
          }
          return {
            id: worker.dataset.flowWorker!,
            incoming: `M ${x} ${y} H ${left - 36} V ${center} H ${left}`,
            outgoing: `M ${right} ${center} H ${bounds.width - 12} V ${backY} H ${backX} V ${client.bottom - bounds.top}`,
          };
        },
      );
      setRoutes(result);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    // A replaced process can reuse its slot and PID without changing any visible text or bounds.
    // Observe its identity attribute too, so pulses never remain keyed to the previous process.
    const mutation = new MutationObserver(measure);
    const list = container.querySelector('[data-flow-list]');
    if (list)
      mutation.observe(list, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['data-flow-worker'],
      });
    const frame = requestAnimationFrame(measure);
    return () => {
      observer.disconnect();
      mutation.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [root]);
  useEffect(() => {
    if (!animate) {
      seen.current = null;
      return;
    }
    const previous = seen.current;
    seen.current = new Map(requests.map((row) => [row.request_id, row.status]));
    const next: Record<string, Pulse> = {};
    for (const row of requests) {
      const old = previous?.get(row.request_id);
      // Seed the first snapshot without replaying old completions. A short request
      // first seen completed later gets both directions, with its return delayed.
      const incoming = old === undefined && (previous !== null || row.status === 'processing');
      const outgoing = previous !== null && row.status === 'completed' && old !== 'completed';
      if (!incoming && !outgoing) continue;
      const pulse = next[row.process_uid] ?? { delay: false };
      if (incoming) pulse.incoming = ++sequence.current;
      if (outgoing) pulse.outgoing = ++sequence.current;
      pulse.delay ||= incoming && outgoing;
      next[row.process_uid] = pulse;
    }
    if (Object.keys(next).length) {
      const frame = requestAnimationFrame(() => setPulses((value) => ({ ...value, ...next })));
      return () => cancelAnimationFrame(frame);
    }
  }, [requests, animate]);
  return (
    <svg className={styles.routes} aria-hidden="true" focusable="false" data-animate={animate}>
      <defs>
        {(['incoming', 'outgoing'] as const).map((direction) => (
          <marker
            key={direction}
            id={`${arrowId}-${direction}`}
            className={styles[direction]}
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="10"
            markerHeight="10"
            markerUnits="userSpaceOnUse"
            orient="auto"
          >
            <path className={styles.routeArrow} d="M 1 1 L 8 5 L 1 9 Z" />
          </marker>
        ))}
      </defs>
      {routes.map((route) => (
        <g key={route.id} data-flow-route={route.id}>
          <path
            className={`${styles.routeBase} ${styles.incoming}`}
            d={route.incoming}
            markerEnd={`url(#${arrowId}-incoming)`}
          />
          <path
            className={`${styles.routeBase} ${styles.outgoing}`}
            d={route.outgoing}
            markerEnd={`url(#${arrowId}-outgoing)`}
          />
          {pulses[route.id]?.incoming && (
            <path
              key={`in-${pulses[route.id]?.incoming}`}
              className={styles.incomingPulse}
              data-flow-direction="incoming"
              data-flow-pulse={pulses[route.id]?.incoming}
              d={route.incoming}
              pathLength={100}
            />
          )}
          {pulses[route.id]?.outgoing && (
            <path
              key={`out-${pulses[route.id]?.outgoing}`}
              className={styles.outgoingPulse}
              data-flow-direction="outgoing"
              data-flow-pulse={pulses[route.id]?.outgoing}
              data-delayed={pulses[route.id]?.delay}
              d={route.outgoing}
              pathLength={100}
            />
          )}
        </g>
      ))}
    </svg>
  );
}
