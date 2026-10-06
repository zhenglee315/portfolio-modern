import { createServer } from 'node:http';
import { endpointFixture } from './portfolio.ts';

/** Serve public synthetic DTOs for repeatable SSG and browser tests, without a database. */
const server = createServer((request, response) => {
  const url = new URL(request.url || '/', 'http://example.test');
  const data = url.pathname === '/health' ? { ok: true } : endpointFixture(url);
  response.writeHead(data ? 200 : 404, {
    'content-type': 'application/json',
    'cache-control': 'no-store',
  });
  response.end(JSON.stringify(data ?? { detail: 'NOT_FOUND' }));
});
server.listen(4181, '127.0.0.1', () =>
  console.log('Synthetic public API ready on local port 4181.'),
);
/** Release the fixture port when Playwright terminates its managed web servers. */
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    server.close();
    server.closeAllConnections();
  });
