import { createServer, request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { loadEnvFile } from 'node:process';
import sirv from 'sirv';

/** Preview static deployment with a separate /api route, never a SPA API fallback.
 * Environment files remain local; the browser receives only relative /api URLs.
 */
try {
  loadEnvFile('.env.local');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const origin = new URL(process.env.API_PROXY_TARGET || 'http://127.0.0.1:8080');
const serve = sirv('build/client', { single: '__spa-fallback.html', dev: true });
const files = sirv('build/client', { dev: true });
const server = createServer((incoming, outgoing) => {
  const path = incoming.url || '/';
  if (/^\/assets\//.test(path) || path.split('?')[0].endsWith('.data'))
    return files(incoming, outgoing, () => {
      outgoing.writeHead(404);
      outgoing.end();
    });
  if (!/^\/api(?:\/|\?|$)/.test(path)) return serve(incoming, outgoing);
  if (!['GET', 'HEAD'].includes(incoming.method)) {
    outgoing.writeHead(405);
    return outgoing.end();
  }
  const suffix = path.replace(/^\/api(?=\/|\?|$)/, '').replace(/^\/+/, '');
  const target = new URL(`${origin.href.replace(/\/$/, '')}/${suffix}`);
  const send = target.protocol === 'https:' ? httpsRequest : httpRequest;
  const proxy = send(
    target,
    { method: incoming.method, headers: { accept: 'application/json' } },
    (response) => {
      outgoing.writeHead(response.statusCode || 502, {
        'content-type': response.headers['content-type'] || 'application/json',
        'cache-control': 'no-store',
      });
      response.pipe(outgoing);
    },
  );
  proxy.setTimeout(10_000, () => proxy.destroy());
  proxy.on('error', () => {
    if (!outgoing.headersSent) outgoing.writeHead(502, { 'content-type': 'application/json' });
    outgoing.end('{"detail":"UPSTREAM_UNAVAILABLE"}');
  });
  outgoing.on('close', () => {
    if (!outgoing.writableEnded) proxy.destroy();
  });
  proxy.end();
});
server.listen(4173, '127.0.0.1', () => console.log('Static preview ready on local port 4173.'));
/** Allow test runners and development shells to release the preview port cleanly. */
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    server.close();
    server.closeAllConnections();
  });
