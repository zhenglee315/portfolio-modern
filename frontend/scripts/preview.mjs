import { createServer, request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { loadEnvFile } from 'node:process';
import sirv from 'sirv';
import { createRequestListener } from '@react-router/node';

/** Serve dynamic public documents and a separate browser API proxy.
 * @remarks Environment files and the server build remain outside the public directory.
 * Hashed assets are immutable; document and route-data responses always recheck visibility.
 */
try {
  loadEnvFile('.env.local');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const origin = new URL(process.env.API_PROXY_TARGET || 'http://127.0.0.1:8080');
const build = await import(new URL('../build/server/index.js', import.meta.url).href);
const render = createRequestListener({ build, mode: 'production' });
const files = sirv('build/client', {
  etag: true,
  gzip: true,
  setHeaders(response, path) {
    response.setHeader(
      'cache-control',
      /\/assets\//.test(path) ? 'public, max-age=31536000, immutable' : 'no-cache',
    );
  },
});
const server = createServer((incoming, outgoing) => {
  const path = incoming.url || '/';
  if (!/^\/api(?:\/|\?|$)/.test(path))
    return files(incoming, outgoing, () => {
      const pathname = path.split('?')[0];
      // A missing asset keeps its 404; .data requests belong to the dynamic router.
      if (
        pathname.startsWith('/assets/') ||
        (/\.[^/]+$/.test(pathname) && !pathname.endsWith('.data'))
      ) {
        outgoing.writeHead(404, { 'cache-control': 'no-store' });
        return outgoing.end();
      }
      outgoing.setHeader('cache-control', 'no-store');
      render(incoming, outgoing);
    });
  if (!['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'].includes(incoming.method)) {
    outgoing.writeHead(405, { 'cache-control': 'no-store' });
    return outgoing.end();
  }
  const suffix = path.replace(/^\/api(?=\/|\?|$)/, '').replace(/^\/+/, '');
  const target = new URL(`${origin.href.replace(/\/$/, '')}/${suffix}`);
  const send = target.protocol === 'https:' ? httpsRequest : httpRequest;
  const proxy = send(
    target,
    {
      method: incoming.method,
      headers: {
        accept: incoming.headers.accept || 'application/json',
        ...(incoming.headers['content-type'] && {
          'content-type': incoming.headers['content-type'],
        }),
        ...(incoming.headers['content-length'] && {
          'content-length': incoming.headers['content-length'],
        }),
        ...(!incoming.headers['content-length'] &&
          incoming.headers['transfer-encoding'] && { 'transfer-encoding': 'chunked' }),
        ...(incoming.headers.cookie && { cookie: incoming.headers.cookie }),
      },
    },
    (response) => {
      outgoing.writeHead(response.statusCode || 502, {
        'content-type': response.headers['content-type'] || 'application/json',
        'cache-control': 'no-store',
        // Keep each cookie separate so session rotation reaches the browser intact.
        ...(response.headers['set-cookie'] && { 'set-cookie': response.headers['set-cookie'] }),
        ...(response.headers['retry-after'] && { 'retry-after': response.headers['retry-after'] }),
      });
      response.on('error', () => outgoing.destroy());
      response.pipe(outgoing);
    },
  );
  proxy.setTimeout(10_000, () => proxy.destroy());
  proxy.on('error', () => {
    if (outgoing.destroyed) return;
    if (outgoing.headersSent) return outgoing.destroy();
    outgoing.writeHead(502, {
      'content-type': 'application/json',
      'cache-control': 'no-store',
    });
    outgoing.end('{"detail":"UPSTREAM_UNAVAILABLE"}');
  });
  incoming.on('aborted', () => proxy.destroy());
  incoming.on('error', () => proxy.destroy());
  outgoing.on('close', () => {
    if (!outgoing.writableEnded) proxy.destroy();
  });
  incoming.pipe(proxy);
});
const port = Number(process.env.PORT ?? 5173);
if (!Number.isInteger(port) || port < 1 || port > 65_535)
  throw new Error('PORT must be a valid TCP port.');
const host = process.env.HOST ?? '127.0.0.1';
server.listen(port, host, () => console.log(`Dynamic portfolio ready on ${host}:${port}.`));
/** Allow test runners and development shells to release the runtime port cleanly. */
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    server.close();
    server.closeAllConnections();
  });
