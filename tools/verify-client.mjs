/**
 * Render the plugin's real client module in a real browser.
 *
 * The Harness Web GUI needs a credential a fresh browser does not have, so the
 * plugin's own client half is loaded here instead: the same file, the same
 * React, the same host handlers — served by the diagnostic server. This shows
 * whether the component throws, which is what an empty panel means.
 *
 *   node tools/verify-client.mjs <doc path> <out.png>
 */
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import probePage from './probe-page.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const given = process.argv[2];
// The probes save through the panel, so they run against a copy: a test must
// never edit the document the human is working on.
const { copyFileSync, mkdtempSync } = await import('node:fs');
const { tmpdir } = await import('node:os');
const workdir = mkdtempSync(join(tmpdir(), 'dsh-doc-probe-'));
const documentUnderTest = join(workdir, given.split(/[\\/]/).pop());
copyFileSync(given, documentUnderTest);
const document = documentUnderTest;
const out = process.argv[3] ?? 'client-check.png';

const server = spawn('node', [join(HERE, 'diag-server.mjs'), '0', document], {
  stdio: ['ignore', 'pipe', 'pipe'],
  env: {
    ...process.env,
    DSH_DOC_REVIEW_CLI: join(
      process.env.LOCALAPPDATA ?? '',
      'Programs', 'DeepSeek Harness', 'resources', 'app.asar.unpacked', 'dsh',
      'node_modules', '@deepseek-ai', 'libreoffice-kit', 'lib', 'cli.js',
    ),
  },
});
server.stderr.on('data', (chunk) => process.stderr.write(`[diag] ${chunk}`));
const info = JSON.parse(await new Promise((resolve) => {
  server.stdout.once('data', (chunk) => resolve(chunk.toString()));
}));
console.log('diag port', info.port, 'api routes', info.apiRoutes.length);

const clientSource = await readFile(join(HERE, '..', 'client.js'), 'utf8');
const posix = document.split(String.fromCharCode(92)).join('/');
const pageHtml = probePage.replace('"__TARGET__"', JSON.stringify(posix));

const readBody = async (req) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
};

const extra = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  const send = (type, body) => {
    res.writeHead(200, { 'content-type': type });
    res.end(body);
  };
  if (url.pathname === '/probe.html') return send('text/html; charset=utf-8', pageHtml);
  // The page lives on another port, so the plugin's own /api calls are
  // forwarded to the diagnostic server that serves them.
  if (url.pathname.startsWith('/api/dsh-doc-review')) {
    console.error('[probe] ' + req.method + ' ' + url.pathname + ' ' + url.search.slice(0, 50));
    console.error('[probe] ' + req.method + ' ' + req.url);
    const upstream = await fetch(`http://127.0.0.1:${info.port}${url.pathname}${url.search}`, {
      method: req.method,
      headers: { 'content-type': 'application/json' },
      body: req.method === 'POST' ? await readBody(req) : undefined,
    });
    const body = await upstream.arrayBuffer();
    if (url.search.includes('action=render')) {
      console.error('[probe] render -> ' + upstream.status + ' ' + Buffer.from(body).toString('utf8').slice(0, 120));
    }
    res.writeHead(upstream.status, { 'content-type': upstream.headers.get('content-type') ?? 'application/json' });
    res.end(Buffer.from(body));
    return;
  }
  if (url.pathname === '/client.js') return send('text/javascript; charset=utf-8', clientSource);
  if (url.pathname === '/react.js') {
    return send('text/javascript; charset=utf-8', await readFile(join(HERE, 'vendor', 'react.js')));
  }
  if (url.pathname === '/react-dom.js') {
    return send('text/javascript; charset=utf-8', await readFile(join(HERE, 'vendor', 'react-dom.js')));
  }
  res.writeHead(404);
  res.end();
});
await new Promise((resolve) => extra.listen(info.port + 1, '127.0.0.1', resolve));

const { chromium } = await import('playwright-core');
const browser = await chromium.launch({ headless: true, args: ['--disable-gpu'] });
const page = await browser.newPage({ viewport: { width: 720, height: 700 } });
const consoleLines = [];
page.on('console', (m) => consoleLines.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => consoleLines.push(`[pageerror] ${e.message}`));

await page.goto(`http://127.0.0.1:${info.port + 1}/probe.html`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__done === true', { timeout: 45000 }).catch(() => {});
// The pages arrive after the document is rendered; the probe waits for them.
await page.waitForSelector('.dr-page img', { timeout: 40000 }).catch(() => {});
await page.waitForTimeout(3000);
const state = await page.evaluate(`(() => ({
  errors: window.__errors || [],
  bodyType: window.__bodyType,
  slots: (window.__slots || []).map((s) => s.cell.name + '#' + (s.cell.key || s.cell.id)),
  bodyText: (document.getElementById('root') || {}).innerText?.slice(0, 200) || '',
  pages: document.querySelectorAll('.dr-page').length,
  canvas: document.querySelector('.dr-root > div:nth-child(3)')?.className || '',
  canvasHtml: (document.querySelector('.dr-root > div:last-child')?.innerHTML || '').slice(0, 200),
  scrolls: document.querySelectorAll('.dr-scroll').length,
  placeholders: document.querySelectorAll('.dr-ph').length,
  images: document.querySelectorAll('.dr-page img').length,
  sized: [...document.querySelectorAll('.dr-page img')].filter((i) => i.naturalHeight > 20).length,
  status: (document.querySelector('.dr-status') || {}).textContent || '',
  text: ((document.getElementById('root') || {}).innerText || '').slice(0, 300),
  boxes: [...document.querySelectorAll('.dr-page')].slice(0, 3).map((el) => {
    const img = el.querySelector('img');
    const eb = el.getBoundingClientRect();
    const ib = img ? img.getBoundingClientRect() : null;
    return {
      page: el.dataset.drPage,
      box: [Math.round(eb.width), Math.round(eb.height)],
      img: ib ? [Math.round(ib.width), Math.round(ib.height)] : null,
      natural: img ? [img.naturalWidth, img.naturalHeight] : null,
      scrollH: el.scrollHeight,
      overflow: getComputedStyle(el).overflow,
    };
  }),
}))()`);
console.log(JSON.stringify(state, null, 1));
if (consoleLines.length > 0) {
  console.log('--- console ---');
  for (const line of consoleLines.slice(-12)) console.log(line);
}
await page.screenshot({ path: out });
console.log('screenshot', out);

await browser.close();
extra.close();
server.kill();
