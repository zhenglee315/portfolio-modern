import { createServer } from 'node:http';
import { endpointFixture, portfolioSelectorError } from './portfolio.ts';
import { managementEndpointFixture } from './management.ts';
import { monitorEndpointFixture } from './monitor.ts';

/** Serve public synthetic DTOs for repeatable SSR and browser tests, without a database. */
const server = createServer((request, response) => {
  const url = new URL(request.url || '/', 'http://example.test');
  const previewId = url.pathname.startsWith('/management/preview/')
    ? Number(url.searchParams.get('site_id'))
    : undefined;
  if (previewId) {
    url.pathname = url.pathname.replace('/management/preview/', '/portfolio/');
    url.searchParams.set('site_id', previewId === 114 ? '1' : '2');
  }
  const selectorError = portfolioSelectorError(url);
  if (selectorError) {
    response.writeHead(400, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    return response.end(JSON.stringify({ detail: selectorError }));
  }
  // Fail public reads if the SSR renderer ever forwards the browser's private session.
  const privateSession =
    url.pathname.startsWith('/portfolio/') &&
    request.headers.cookie?.includes('private-identity-sentinel');
  if (
    (url.pathname === '/portfolio/site' && url.searchParams.get('user') === 'unavailable') ||
    privateSession
  ) {
    response.writeHead(503, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    return response.end(JSON.stringify({ detail: 'PRIVATE_UPSTREAM_SENTINEL' }));
  }
  let data =
    url.pathname === '/health'
      ? { ok: true }
      : url.pathname === '/authority/session'
        ? null
        : (monitorEndpointFixture(url) ?? managementEndpointFixture(url) ?? endpointFixture(url));
  if (previewId && url.pathname === '/portfolio/site' && data)
    data = {
      ...data,
      site_id: previewId,
      user: previewId === 114 ? 'operator' : 'avery',
      profile: { ...data.profile, firstName: previewId === 114 ? 'Operator' : 'Avery' },
    };
  response.writeHead(data !== undefined ? 200 : 404, {
    'content-type': 'application/json',
    'cache-control': 'no-store',
  });
  response.end(JSON.stringify(data === undefined ? { detail: 'NOT_FOUND' } : data));
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
