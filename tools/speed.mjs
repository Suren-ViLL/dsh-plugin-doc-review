/**
 * Measure what the panel costs: how long the first page takes to appear, and
 * how long the paragraphs take to become editable.
 *
 *   node tools/speed.mjs <doc path>
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
const info = JSON.parse(await new Promise((resolve) => {
  server.stdout.once('data', (chunk) => resolve(chunk.toString()));
}));

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
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 900, height: 800 } });

const t0 = Date.now();
await page.goto(`http://127.0.0.1:${info.port + 1}/probe.html`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.dr-page img', { timeout: 60000 });
console.log('first page drawn:', Date.now() - t0, 'ms');

await page.getByText('审阅', { exact: true }).first().click();
await page.waitForTimeout(500);
const t1 = Date.now();
await page.waitForSelector('.dr-para', { timeout: 60000 }).catch(() => {});
console.log('paragraph boxes:', t1 - t0, 'ms');

await page.getByText('看文字', { exact: true }).first().click();
await page.waitForTimeout(300);
const t2 = Date.now();
await page.waitForSelector('.dr-paraRow', { timeout: 60000 }).catch(() => {});
console.log('text view rows:', t2 - t0, 'ms');

console.log(JSON.stringify(await page.evaluate(`(() => ({
  images: document.querySelectorAll('.dr-page img').length,
  boxes: document.querySelectorAll('.dr-para').length,
  rows: document.querySelectorAll('.dr-paraRow').length,
}))()`)));

await browser.close();
extra.close();
server.kill();
