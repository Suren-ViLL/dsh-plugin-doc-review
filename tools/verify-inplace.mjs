/**
 * Check both views of a document: the picture, with the text laid over it,
 * and the text itself, one paragraph per row.
 *
 *   node tools/verify-inplace.mjs <doc path> <out.png>
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
const out = process.argv[3] ?? 'inplace.png';

const server = spawn('node', [join(HERE, 'diag-server.mjs'), '0', document], {
  stdio: ['ignore', 'pipe', 'pipe'],
  env: {
    ...process.env,
    DSH_DOC_REVIEW_CLI: join(
      process.env.LOCALAPPDATA ?? '',
      'Programs', 'DeepSeek Harness', 'resources', 'app.asar.unpacked', 'dsh',
      'node_modules', '@deepseek-ai', 'libreoffice-kit', 'lib', 'cli.js',
    ),
    DSH_DOC_REVIEW_NODE: join(
      process.env.LOCALAPPDATA ?? '',
      'Programs', 'DeepSeek Harness', 'resources', 'runtime', 'primary-runtime',
      'dependencies', 'node', 'bin', 'node.exe',
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
const page = await browser.newPage({ viewport: { width: 900, height: 800 } });
const consoleLines = [];
page.on('console', (m) => consoleLines.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => consoleLines.push(`[pageerror] ${e.message}`));

await page.goto(`http://127.0.0.1:${info.port + 1}/probe.html`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__done === true', { timeout: 45000 });
await page.waitForSelector('.dr-page', { timeout: 40000 });

await page.getByText('审阅', { exact: true }).first().click();
await page.waitForTimeout(1500);
await page.waitForFunction('document.querySelectorAll(".dr-para").length > 0', { timeout: 40000 })
  .catch(() => console.log('! no paragraph layer appeared'));

console.log('--- the picture view');
console.log(JSON.stringify(await page.evaluate(`(() => ({
  shapes: document.querySelectorAll('.dr-shape').length,
  paras: document.querySelectorAll('.dr-para').length,
}))()`)));
console.log(JSON.stringify(await page.evaluate(`(() => ({
  paras: document.querySelectorAll('.dr-para').length,
  editable: [...document.querySelectorAll('.dr-para')].filter((e) => e.isContentEditable).length,
}))()`), null, 1));

// A slide is edited one block at a time; a page is edited paragraph by
// paragraph. The probe follows whichever the document offers.
const slideBlocks = await page.locator('.dr-shape').count();
if (slideBlocks > 0) {
  console.log('--- click a slide block');
  await page.locator('.dr-shape').first().click();
  await page.waitForTimeout(900);
  console.log(JSON.stringify(await page.evaluate(`(() => ({
    selected: document.querySelectorAll('.dr-shape.selected').length,
    popover: document.querySelectorAll('.dr-pop, .dr-editpop').length,
    popText: (document.querySelector('.dr-pop textarea, .dr-editpop textarea') || {}).value?.slice(0, 70) || '',
  }))()`), null, 1));

  console.log('--- change it in the window');
  const area = page.locator('.dr-pop textarea, .dr-editpop textarea').first();
  if (await area.count() > 0) {
    await area.click();
    await page.waitForTimeout(200);
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    await page.keyboard.type('ABC456');
    await page.waitForTimeout(600);
    console.log('after fill:', JSON.stringify(await page.evaluate(`(() => ({
      value: (document.querySelector('.dr-pop textarea') || {}).value || '',
      old: (document.querySelector('.dr-popOld') || {}).textContent || '',
      disabled: (document.querySelector('.dr-popBtn.primary') || {}).disabled,
    }))()`)));
    const confirm = page.locator('.dr-pop button, .dr-editpop button').last();
    if (await confirm.count() > 0) await confirm.click();
    await page.waitForTimeout(800);
  }
  console.log(JSON.stringify(await page.evaluate(`(() => ({
    changed: document.querySelectorAll('.dr-shape.changed').length,
    toolbar: [...document.querySelectorAll('.dr-toolbar .dr-btn')].map((b) => b.textContent),
  }))()`), null, 1));
} else {
  console.log('--- edit on the picture');
  // The way a person does it: pick the block, change it in the window.
  await page.locator('.dr-para').nth(2).click();
  await page.waitForTimeout(700);
  const paraArea = page.locator('.dr-pop textarea').first();
  if (await paraArea.count() > 0) {
    await paraArea.click();
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    await page.keyboard.type('ABCDEF');
    await page.waitForTimeout(500);
    const ok = page.locator('.dr-pop button').last();
    if (await ok.count() > 0) await ok.click();
    await page.waitForTimeout(700);
  }
  console.log(JSON.stringify(await page.evaluate(`(() => ({
    changed: document.querySelectorAll('.dr-para.changed').length,
    changedText: (document.querySelector('.dr-para.changed') || {}).textContent || '',
    toolbar: [...document.querySelectorAll('.dr-toolbar .dr-btn')].map((b) => b.textContent),
  }))()`), null, 1));
}

console.log('--- the text view');
await page.getByText('看文字', { exact: true }).first().click();
await page.waitForTimeout(1500);
console.log(JSON.stringify(await page.evaluate(`(() => ({
  rows: document.querySelectorAll('.dr-paraRow').length,
  inputs: document.querySelectorAll('.dr-paraInput').length,
  style: document.querySelector('.dr-paras')?.className || '',
  pages: document.querySelectorAll('.dr-paraPage').length,
  font: getComputedStyle(document.querySelector('.dr-paraInput') || document.body).fontFamily.slice(0, 40),
}))()`), null, 1));

const input = page.locator('.dr-paraInput').nth(4);
await input.click();
await page.keyboard.press('Control+A');
await page.keyboard.type('文字视图改写的整段');
await page.waitForTimeout(700);
console.log(JSON.stringify(await page.evaluate(`(() => ({
  changed: document.querySelectorAll('.dr-paraRow.changed').length,
  changedText: (document.querySelector('.dr-paraRow.changed .dr-paraInput') || {}).value || '',
  toolbar: [...document.querySelectorAll('.dr-toolbar .dr-btn')].map((b) => b.textContent),
}))()`), null, 1));

console.log('--- the zoom');
await page.getByTitle('放大').click();
await page.getByTitle('放大').click();
await page.waitForTimeout(400);
console.log(JSON.stringify(await page.evaluate(`(() => ({
  zoom: (document.querySelector('.dr-zoomValue') || {}).textContent || '',
  pageWidth: document.querySelector('.dr-page')?.style.width || '',
}))()`), null, 1));

console.log('--- save');
const save = page.locator('.dr-toolbar .dr-btn', { hasText: '保存' }).first();
if (await save.count() > 0) {
  await save.click();
  await page.waitForTimeout(14000);
}
console.log(JSON.stringify(await page.evaluate(`(() => ({
  status: (document.querySelector('.dr-status') || {}).textContent || '',
}))()`), null, 1));

await page.screenshot({ path: out });
console.log('screenshot', out);
if (consoleLines.length > 0) {
  console.log('--- console ---');
  for (const line of consoleLines.slice(-8)) console.log(line);
}

await browser.close();
extra.close();
server.kill();
