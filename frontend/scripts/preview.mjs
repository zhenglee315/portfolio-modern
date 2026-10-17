import { createServer, request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { loadEnvFile } from 'node:process';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
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
// Share the build-directory override with React Router so browser tests own their artifacts.
const buildDirectory = resolve(
  fileURLToPath(new URL('../', import.meta.url)),
  process.env.PORTFOLIO_BUILD_DIR || 'build',
);
const build = await import(pathToFileURL(resolve(buildDirectory, 'server/index.js')).href);
const render = createRequestListener({ build, mode: 'production' });
const upgradedSockets = new Set();
const files = sirv(resolve(buildDirectory, 'client'), {
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
        ...(incoming.headers.origin && { origin: incoming.headers.origin }),
        ...(incoming.headers['content-encoding'] && {
          'content-encoding': incoming.headers['content-encoding'],
        }),
      },
    },
    (response) => {
      outgoing.writeHead(response.statusCode || 502, {
        'content-type': response.headers['content-type'] || 'application/json',
        'cache-control': 'no-store',
        // Keep each cookie separate so session rotation reaches the browser intact.
        ...(response.headers['set-cookie'] && { 'set-cookie': response.headers['set-cookie'] }),
        ...(response.headers['retry-after'] && { 'retry-after': response.headers['retry-after'] }),
        ...(response.headers['x-management-update-state'] && {
          'x-management-update-state': response.headers['x-management-update-state'],
        }),
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

/** Preserve the authenticated Socket.IO upgrade through the same browser API prefix. */
server.on('upgrade', (incoming, socket, head) => {
  const reject = (status, message) => {
    if (!socket.destroyed)
      socket.end(`HTTP/1.1 ${status} ${message}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  };
  if (!/^\/api\/socket\.io(?:\/|\?|$)/.test(incoming.url || '')) {
    reject(404, 'Not Found');
    return;
  }
  const suffix = incoming.url.replace(/^\/api\//, '');
  const target = new URL(`${origin.href.replace(/\/$/, '')}/${suffix}`);
  const send = target.protocol === 'https:' ? httpsRequest : httpRequest;
  const proxy = send(target, {
    method: 'GET',
    // Keep the public Host and Origin aligned for the backend's same-origin check.
    headers: { ...incoming.headers, host: incoming.headers.host || target.host },
  });
  const timeout = setTimeout(() => proxy.destroy(), 10_000);
  upgradedSockets.add(socket);
  socket.once('close', () => {
    clearTimeout(timeout);
    upgradedSockets.delete(socket);
    proxy.destroy();
  });
  socket.on('error', () => proxy.destroy());
  proxy.on('upgrade', (response, upstream, upstreamHead) => {
    clearTimeout(timeout);
    if (socket.destroyed) {
      upstream.destroy();
      return;
    }
    upgradedSockets.add(upstream);
    upstream.once('close', () => {
      upgradedSockets.delete(upstream);
      socket.destroy();
    });
    upstream.on('error', () => socket.destroy());
    socket.once('close', () => upstream.destroy());
    const headers = [];
    for (let index = 0; index < response.rawHeaders.length; index += 2)
      headers.push(`${response.rawHeaders[index]}: ${response.rawHeaders[index + 1]}`);
    socket.write(`HTTP/1.1 101 Switching Protocols\r\n${headers.join('\r\n')}\r\n\r\n`);
    if (head.length) upstream.write(head);
    if (upstreamHead.length) socket.write(upstreamHead);
    upstream.pipe(socket);
    socket.pipe(upstream);
  });
  proxy.on('response', (response) => {
    clearTimeout(timeout);
    reject(response.statusCode || 502, response.statusMessage || 'Bad Gateway');
    response.resume();
  });
  proxy.on('error', () => {
    clearTimeout(timeout);
    reject(502, 'Bad Gateway');
  });
  proxy.end();
});
const port = Number(process.env.PORT ?? 5173);
if (!Number.isInteger(port) || port < 1 || port > 65_535)
  throw new Error('PORT must be a valid TCP port.');
const host = process.env.HOST ?? '127.0.0.1';
server.listen(port, host, () => console.log(`Dynamic portfolio ready on ${host}:${port}.`));
/** Allow test runners and development shells to release the runtime port cleanly. */
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    for (const socket of upgradedSockets) socket.destroy();
    server.close();
    server.closeAllConnections();
  });
