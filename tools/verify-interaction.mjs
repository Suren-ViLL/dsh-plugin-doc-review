/**
 * Drive the review desk's interactions in a real browser.
 *
 * It enters review mode, draws a box on the first page, opens the source
 * editor, and checks that the outline appears, that the annotation is located
 * onto a paragraph, and that the editor and the note link up.
 *
 *   node tools/verify-interaction.mjs <doc path> <out.png>
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
const out = process.argv[3] ?? 'interaction.png';

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
const browser = await chromium.launch({ headless: true, args: ['--disable-gpu'] });
const page = await browser.newPage({ viewport: { width: 760, height: 760 } });
const consoleLines = [];
page.on('console', (m) => consoleLines.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => consoleLines.push(`[pageerror] ${e.message}`));

await page.goto(`http://127.0.0.1:${info.port + 1}/probe.html`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__done === true', { timeout: 45000 });

const step = async (name, fn) => {
  const result = await fn();
  console.log(`--- ${name}`);
  console.log(JSON.stringify(result, null, 1));
  return result;
};

// 1. Enter review mode.
await step('review mode', async () => {
  await page.waitForTimeout(6000);
  console.log('body:', JSON.stringify((await page.evaluate(`document.body.innerText`)).slice(0, 300)));
  console.log('console:', consoleLines.slice(-5));
  await page.waitForSelector('.dr-page', { timeout: 40000 });
  await page.getByText('审阅', { exact: true }).first().click();
  await page.waitForTimeout(1200);
  return page.evaluate(`(() => ({
    layer: document.querySelectorAll('.dr-layer').length,
    panel: document.querySelectorAll('.dr-panel').length,
    toolbar: document.querySelectorAll('.dr-toolbar').length,
  }))()`);
});

// 2. Draw a box on the first page.
await step('draw a box', async () => {
  await page.waitForSelector('.dr-page', { timeout: 30000 });
  const pageBox = await page.locator('.dr-page').first().boundingBox();
  await page.mouse.move(pageBox.x + 40, pageBox.y + 60);
  await page.mouse.down();
  await page.mouse.move(pageBox.x + 320, pageBox.y + 130, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(2500);
  return page.evaluate(`(() => ({
    boxes: document.querySelectorAll('.dr-box').length,
    notes: document.querySelectorAll('.dr-note').length,
    jump: document.querySelectorAll('.dr-jump').length,
    jumpText: (document.querySelector('.dr-jump') || {}).textContent || '',
  }))()`);
});

// 3. The paragraph layer over the picture.
await step('paragraph layer', async () => {
  await page.waitForTimeout(2000);
  return page.evaluate(`(() => ({
    paras: document.querySelectorAll('.dr-para').length,
    editable: [...document.querySelectorAll('.dr-para')].filter((e) => e.isContentEditable).length,
    pointed: document.querySelectorAll('.dr-para.pointed').length,
    noteText: (document.querySelector('.dr-note') || {}).textContent || '',
    jump: document.querySelectorAll('.dr-jump').length,
    located: (() => {
      try { return JSON.parse(document.getElementById('__probe')?.textContent ?? 'null'); } catch { return null; }
    })(),
  }))()`);
});

// 4. The outline in the side panel.
await step('outline', async () => {
  const tab = page.locator('.dr-kind', { hasText: '改字' }).first();
  await tab.click();
  await page.waitForTimeout(1200);
  return page.evaluate(`(() => ({
    outline: document.querySelectorAll('.dr-outlineItem').length,
    outlineFirst: (document.querySelector('.dr-outlineItem') || {}).textContent || '',
  }))()`);
});

// 5. Edit a paragraph in the picture and check the pending count.
await step('edit a paragraph', async () => {
  const area = page.locator('.dr-para').first();
  await area.dblclick();
  await page.waitForTimeout(300);
  await page.keyboard.press('Control+A');
  await page.keyboard.type('改写后的第一段');
  await page.waitForTimeout(500);
  await page.locator('.dr-para').nth(3).click();
  await page.waitForTimeout(500);
  return page.evaluate(`(() => ({
    changed: document.querySelectorAll('.dr-para.changed').length,
    changedText: (document.querySelector('.dr-para.changed') || {}).textContent || '',
    marks: document.querySelectorAll('.dr-mark').length,
    commit: [...document.querySelectorAll('.dr-toolbar .dr-btn')].map((b) => b.textContent),
  }))()`);
});

await page.screenshot({ path: out });
console.log('screenshot', out);
if (consoleLines.length > 0) {
  console.log('--- console ---');
  for (const line of consoleLines.slice(-10)) console.log(line);
}

await browser.close();
extra.close();
server.kill();
