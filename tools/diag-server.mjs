/**
 * A loopback-only diagnostic server that mirrors the plugin's real routes.
 *
 * It exists because the Harness Web GUI needs a browser credential, so a headless
 * Chromium cannot reach the live app to check the panel. This server serves the
 * SAME handlers the plugin registers — same paths, same response shapes — on
 * 127.0.0.1 with no authentication, so a real browser can drive the real
 * client.js against real rendered pages.
 *
 * It is never started by the plugin; it is a development tool.
 *
 *   node tools/diag-server.mjs <port> <document path>
 */
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';

import { apply } from '../index.js';

const port = Number(process.argv[2] ?? 0);
const document = process.argv[3];

const routes = new Map();
const apiRoutes = new Map();

const ctx = {
  get(name) {
    if (name === 'webServer') {
      return {
        register(route) {
          routes.set(route.path, route.handler);
          return () => routes.delete(route.path);
        },
      };
    }
    if (name === 'connection') {
      // Mirror the Host's trusted /api channel: these routes are what the
      // browser can actually reach.
      return {
        fetch: {
          register(route) {
            apiRoutes.set(route.path, route);
            return () => apiRoutes.delete(route.path);
          },
        },
      };
    }
    return undefined;
  },
  /**
   * The probe stands in for the Harness.
   *
   * No Office provider is offered here: the plugin falls back to calling the
   * renderer itself, which is the path that must keep working on a host
   * without the conversion service.
   */
  inject() {},
  logger: { warn: (message) => console.error('[warn]', message) },
  effect: (fn) => { const disposer = fn(); return () => { if (typeof disposer === 'function') disposer(); }; },
  agents: {},
  tools: { register: () => () => {} },
};

apply(ctx, {});

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');

  const apiRoute = apiRoutes.get(url.pathname);
  if (apiRoute !== undefined) {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    const request = new Request(url.href, {
      method: req.method,
      headers: req.headers,
      body: body.length > 0 ? body : undefined,
    });
    let response;
    try {
      response = await apiRoute.fetch(request);
    } catch (error) {
      console.error('[probe] the handler threw:', error instanceof Error ? error.message : String(error));
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: { code: 'threw', message: String(error) } }));
      return;
    }
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
    return;
  }

  const handler = routes.get(url.pathname);
  if (handler === undefined) {
    if (url.pathname === '/probe.html') {
      const body = Buffer.from(
        readFileSync(new URL('./probe.html', import.meta.url), 'utf8')
          .replace('__TARGET__', JSON.stringify(document ?? '')),
        'utf8',
      );
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(body);
      return;
    }
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('no route');
    return;
  }
  try {
    await handler(req, res);
  } catch (error) {
    res.writeHead(500, { 'content-type': 'text/plain' });
    res.end(error instanceof Error ? error.message : String(error));
  }
});

server.listen(port, '127.0.0.1', () => {
  const address = server.address();
  console.log(JSON.stringify({
    port: address.port,
    document: document ?? null,
    routes: [...routes.keys()],
    apiRoutes: [...apiRoutes.keys()],
  }));
});
