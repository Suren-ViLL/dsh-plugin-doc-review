/**
 * Check the HTML report review: the report is shown, its text is editable in
 * place, and the change can be written back to the file.
 *
 *   node tools/verify-html.mjs <html path> <out.png>
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
const out = process.argv[3] ?? 'html.png';

const server = spawn('node', [join(HERE, 'diag-server.mjs'), '0', document], {
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env },
});
server.stderr.on('data', (chunk) => process.stderr.write(`[diag] ${chunk}`));
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
    const text = Buffer.from(body).toString('utf8');
    console.error(`[probe] ${req.method} ${url.pathname} -> ${upstream.status} ${text.slice(0, 110)}`);
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
const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
const consoleLines = [];
page.on('console', (m) => consoleLines.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => consoleLines.push(`[pageerror] ${e.message}`));
page.on('framenavigated', (f) => { if (f !== page.mainFrame()) consoleLines.push('[frame] navigated ' + f.url().slice(0, 60)); });

await page.goto(`http://127.0.0.1:${info.port + 1}/probe.html`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__done === true', { timeout: 45000 });
await page.waitForTimeout(2500);

// Review mode, where the report's text is editable.
await page.getByText('审阅', { exact: true }).first().click();
await page.waitForTimeout(2500);

console.log('--- the report');
console.log('console so far:', consoleLines.slice(-6));
console.log(JSON.stringify(await page.evaluate(`(() => {
  const frame = document.querySelector('iframe');
  let inner = null;
  try { inner = frame?.contentDocument?.body?.innerText?.slice(0, 120) ?? null; } catch (e) { inner = 'blocked: ' + e.message; }
  return {
    frames: document.querySelectorAll('iframe').length,
    status: (document.querySelector('.dr-status') || {}).textContent || '',
    inner,
    marked: (() => { try { return frame?.contentDocument?.querySelectorAll('[data-dr-run]').length ?? -1; } catch { return -1; } })(),
  };
})()`), null, 1));

// Edit the report's first marked text.
await page.evaluate(`(() => {
  window.__messages = [];
  window.addEventListener('message', (e) => window.__messages.push(e.data));
})()`);

const edited = await page.evaluate(`(() => {
  const frame = document.querySelector('iframe');
  let host = null;
  try { host = frame?.contentDocument?.querySelector('[data-dr-run]') ?? null; } catch { return 'blocked'; }
  if (host === null) return 'no marked node';
  // The marked element holds a text node; that is what the human edits.
  const node = host.firstChild;
  host.focus();
  node.nodeValue = '改过的标题';
  host.dispatchEvent(new frame.contentWindow.Event('blur'));
  return {
    result: 'edited: ' + node.nodeValue,
    original: host.getAttribute('data-dr-original'),
    current: node.nodeValue,
    id: host.getAttribute('data-dr-run'),
  };
})()`);
console.log('--- edit in the report');
console.log(edited);
console.log('messages:', JSON.stringify(await page.evaluate('window.__messages ?? []')));
await page.waitForTimeout(1500);

console.log(JSON.stringify(await page.evaluate(`(() => ({
  status: (document.querySelector('.dr-status') || {}).textContent || '',
  toolbar: [...document.querySelectorAll('.dr-toolbar .dr-btn')].map((b) => b.textContent),
}))()`), null, 1));

console.log('--- save it');
const save = page.locator('.dr-toolbar .dr-btn', { hasText: '保存' }).first();
if (await save.count() > 0) {
  await save.click();
  await page.waitForTimeout(4000);
}
console.log(JSON.stringify(await page.evaluate(`(() => ({
  status: (document.querySelector('.dr-status') || {}).textContent || '',
}))()`), null, 1));

// The file the panel wrote is read back, so the save is proven and not just
// reported.
const written = await readFile(document, 'utf8');
console.log('--- the saved file');
console.log(written.replace(/\s+/g, ' ').slice(0, 220));

await page.screenshot({ path: out });
console.log('screenshot', out);
if (consoleLines.length > 0) {
  console.log('--- console ---');
  for (const line of consoleLines.slice(-10)) console.log(line);
}

await browser.close();
extra.close();
server.kill();
