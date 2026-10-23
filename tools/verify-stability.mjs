/**
 * The stability check: the panel must never be blank.
 *
 * Every failure this desk has had came down to the same thing — something in
 * the panel had no height, so the document was on screen but invisible. This
 * probe asserts the invariants that catch that: each page frame has a real
 * height, the scrollable area is tall enough to hold them, and at least one
 * picture arrived.
 *
 *   node tools/verify-stability.mjs <document> [out.png]
 */
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import probePage from './probe-page.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const given = process.argv[2];
const out = process.argv[3] ?? 'stability.png';

const server = spawn('node', [join(HERE, 'diag-server.mjs'), '0', given], {
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

const clientSource = await readFile(join(HERE, '..', 'client.js'), 'utf8');
const posix = given.split(String.fromCharCode(92)).join('/');
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
  if (url.pathname === '/client.js') return send('text/javascript; charset=utf-8', clientSource);
  if (url.pathname === '/react.js') {
    return send('text/javascript; charset=utf-8', await readFile(join(HERE, 'vendor', 'react.js')));
  }
  if (url.pathname === '/react-dom.js') {
    return send('text/javascript; charset=utf-8', await readFile(join(HERE, 'vendor', 'react-dom.js')));
  }
  if (url.pathname.startsWith('/api/dsh-doc-review')) {
    const upstream = await fetch(`http://127.0.0.1:${info.port}${url.pathname}${url.search}`, {
      method: req.method,
      headers: { 'content-type': 'application/json' },
      body: req.method === 'POST' ? await readBody(req) : undefined,
    });
    const body = await upstream.arrayBuffer();
    res.writeHead(upstream.status, { 'content-type': upstream.headers.get('content-type') ?? 'application/json' });
    res.end(Buffer.from(body));
    return;
  }
  res.writeHead(404);
  res.end();
});
await new Promise((resolve) => extra.listen(info.port + 1, '127.0.0.1', resolve));

const { chromium } = await import('playwright-core');
const browser = await chromium.launch({ headless: true, args: ['--disable-gpu'] });
const page = await browser.newPage({ viewport: { width: 900, height: 820 } });
const consoleLines = [];
page.on('console', (m) => consoleLines.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => consoleLines.push(`[pageerror] ${e.message}`));

const measure = () => page.evaluate(`(() => {
  const frames = [...document.querySelectorAll('.dr-page')];
  const heights = frames.map((f) => Math.round(f.getBoundingClientRect().height));
  const scroll = document.querySelector('.dr-scroll');
  return {
    frames: frames.length,
    heights,
    zeroHeight: heights.filter((h) => h < 40).length,
    images: document.querySelectorAll('.dr-page img').length,
    placeholders: document.querySelectorAll('.dr-ph').length,
    // A report is shown in a frame and a text file in a field; either counts
    // as the document having been drawn, the way a page image does.
    iframes: document.querySelectorAll('iframe').length,
    fields: document.querySelectorAll('textarea').length,
    scrollHeight: scroll === null ? 0 : Math.round(scroll.scrollHeight),
    clientHeight: scroll === null ? 0 : Math.round(scroll.clientHeight),
    failed: [...document.querySelectorAll('.dr-phFailed')].map((n) => n.textContent),
  };
})()`);

await page.goto(`http://127.0.0.1:${info.port + 1}/probe.html`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__done === true', { timeout: 60000 });
// Long enough for the first pages to be drawn and their frames to settle.
await page.waitForTimeout(12000);

const state = await measure();
const errors = await page.evaluate('window.__errors || []');

const checks = [
  ['no page frame collapsed', state.frames === 0 || state.zeroHeight === 0],
  ['the panel has height', state.scrollHeight > 200],
  ['something was drawn', state.images > 0 || state.iframes > 0 || state.fields > 0],
  ['nothing failed to draw', state.failed.length === 0],
  ['no client error', errors.length === 0],
];

console.log('--- the panel');
console.log(JSON.stringify({ ...state, errors }, null, 1));
console.log('--- the invariants');
let bad = 0;
for (const [name, ok] of checks) {
  if (!ok) bad += 1;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}`);
}
if (consoleLines.length > 0) {
  console.log('--- console');
  for (const line of consoleLines.slice(-6)) console.log(line);
}

await page.screenshot({ path: out });
console.log(bad === 0 ? 'STABLE' : `UNSTABLE (${String(bad)} failed)`);
console.log('screenshot', out);

await browser.close();
extra.close();
server.kill();
process.exitCode = bad === 0 ? 0 : 1;
