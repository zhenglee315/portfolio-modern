import type { Page } from '@playwright/test';
import { monitorSocketFixture } from './monitor';

/** Exercise the real Socket.IO client through its Engine.IO websocket protocol.
 * @author ZhengLee 2026.10.18
 */
export async function installMonitorSocket(
  page: Page,
  snapshot: (topic: string, revision: string) => unknown = monitorSocketFixture,
) {
  const subscriptions: string[][] = [];
  await page.routeWebSocket(/\/api\/socket\.io\//, (socket) => {
    let topics: string[] = [];
    let revision = 0;
    const publish = () =>
      topics.forEach((topic) =>
        socket.send(
          `42/monitor,${JSON.stringify(['monitor_snapshot', snapshot(topic, String(++revision))])}`,
        ),
      );
    const timer = setInterval(publish, 1000);
    socket.onMessage((message) => {
      const value = String(message);
      if (value.startsWith('40/monitor')) socket.send('40/monitor,{"sid":"fixture-monitor"}');
      if (value.startsWith('42/monitor,')) {
        const match = /^42\/monitor,(\d*)/.exec(value)!;
        const payload = JSON.parse(value.slice(match[0].length)) as [
          string,
          { topics?: string[] }?,
        ];
        if (payload[0] === 'monitor_subscribe') {
          topics = payload[1]?.topics ?? [];
          subscriptions.push(topics);
          if (match[1]) socket.send(`43/monitor,${match[1]}[{"ok":true}]`);
          publish();
        }
        if (payload[0] === 'monitor_unsubscribe') topics = [];
      }
      if (value.startsWith('41')) socket.close();
    });
    socket.onClose(() => clearInterval(timer));
    socket.send(
      '0{"sid":"fixture-engine","upgrades":[],"pingInterval":60000,"pingTimeout":60000,"maxPayload":1000000}',
    );
  });
  return subscriptions;
}
