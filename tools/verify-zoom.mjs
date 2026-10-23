/**
 * Drive the new zoom controls and the block edit window in a real browser.
 *
 *   node tools/verify-zoom.mjs <doc path> <out.png>
 */
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import probePage from './probe-page.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const document = process.argv[2];
const out = process.argv[3] ?? 'zoom.png';

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
const page = await browser.newPage({ viewport: { width: 900, height: 820 } });
const consoleLines = [];
page.on('console', (m) => consoleLines.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => consoleLines.push(`[pageerror] ${e.message}`));

await page.goto(`http://127.0.0.1:${info.port + 1}/probe.html`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__done === true', { timeout: 45000 });
await page.waitForTimeout(5000);
await page.waitForSelector('.dr-page', { timeout: 45000 }).catch(async () => {
  console.log('no page appeared; the panel says:');
  console.log(JSON.stringify(await page.evaluate(`(() => ({
    errors: window.__errors || [],
    body: (document.getElementById('root') || {}).innerText?.slice(0, 240) || '',
    done: window.__done === true,
  }))()`), null, 1));
  console.log('console:', consoleLines.slice(-6));
});
await page.waitForTimeout(1500);

const readZoom = () => page.evaluate(`(() => {
  const v = document.querySelector('.dr-zoomValue');
  const p = document.querySelector('.dr-page');
  const box = document.querySelector('.dr-scroll');
  const img = p === null ? null : p.querySelector('img');
  const pr = p === null ? null : p.getBoundingClientRect();
  return {
    label: v === null ? null : v.textContent,
    fit: v === null ? null : v.className,
    pageWidth: pr === null ? 0 : Math.round(pr.width),
    pageHeight: pr === null ? 0 : Math.round(pr.height),
    // 图片的自然宽度：缩放与否它不变，用来对比页面是否真的跟着缩
    natural: img === null ? 0 : img.naturalWidth,
    cssVar: box === null ? null : getComputedStyle(box).getPropertyValue('--dr-zoom').trim(),
    scrollWidth: box === null ? 0 : Math.round(box.scrollWidth),
    scrollLeft: box === null ? 0 : Math.round(box.scrollLeft),
    toast: document.querySelector('.dr-zoomToast.on') !== null,
  };
})()`);

const report = {};
const step = async (name, fn) => {
  const value = await fn();
  report[name] = value;
  console.log(`--- ${name}`);
  console.log(JSON.stringify(value, null, 1));
  return value;
};

// ---------- 1. 初始 ----------
const base = await step('initial', readZoom);

// ---------- 2. + 按钮 ----------
await step('plus button', async () => {
  await page.locator('.dr-zoomBtn').last().click();
  await page.waitForTimeout(500);
  return readZoom();
});

// ---------- 3. − 按钮 ----------
await step('minus button', async () => {
  await page.locator('.dr-zoomBtn').first().click();
  await page.locator('.dr-zoomBtn').first().click();
  await page.waitForTimeout(500);
  return readZoom();
});

// ---------- 4. 打开比例菜单，选 150% ----------
await step('the factor menu offers 150%', async () => {
  await page.locator('.dr-zoomValue').click();
  await page.waitForSelector('.dr-zoomMenu', { timeout: 4000 });
  const items = await page.locator('.dr-zoomItem').allTextContents();
  await page.locator('.dr-zoomItem', { hasText: '150%' }).first().click();
  await page.waitForTimeout(600);
  const after = await readZoom();
  return { items, ...after };
});

// ---------- 5. 适应宽度（菜单里） ----------
await step('fit width', async () => {
  await page.locator('.dr-zoomValue').click();
  await page.waitForSelector('.dr-zoomMenu', { timeout: 4000 });
  await page.locator('.dr-zoomItem', { hasText: '适应宽度' }).first().click();
  await page.waitForTimeout(700);
  return readZoom();
});

// ---------- 6. 整页（菜单里） ----------
await step('fit page', async () => {
  await page.locator('.dr-zoomValue').click();
  await page.waitForSelector('.dr-zoomMenu', { timeout: 4000 });
  await page.locator('.dr-zoomItem', { hasText: '适应页面' }).first().click();
  await page.waitForTimeout(700);
  return readZoom();
});

// ---------- 7. Ctrl+0 复位 ----------
await step('ctrl+0 reset', async () => {
  await page.keyboard.press('Control+0');
  await page.waitForTimeout(500);
  return readZoom();
});

// ---------- 8. Ctrl+滚轮缩放 ----------
await step('ctrl+wheel', async () => {
  const box = await page.locator('.dr-scroll').first().boundingBox();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.4);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -240);
  await page.keyboard.up('Control');
  await page.waitForTimeout(600);
  return readZoom();
});

// ---------- 9. Ctrl+1 适应宽度 / Ctrl+2 整页 ----------
await step('ctrl+1 width then ctrl+2 page', async () => {
  await page.keyboard.press('Control+1');
  await page.waitForTimeout(700);
  const a = await readZoom();
  await page.keyboard.press('Control+2');
  await page.waitForTimeout(700);
  const b = await readZoom();
  return { width: a.label, page: b.label };
});

// ---------- 10. 单击文字块 -> 改字窗 ----------
await step('click a text block opens the edit window', async () => {
  // 回到 100% 再看文字块
  await page.keyboard.press('Control+0');
  await page.waitForTimeout(600);
  const has = await page.evaluate(`document.querySelectorAll('.dr-para').length`);
  if (has === 0) return { paras: 0, note: 'this document has no text layer' };
  await page.locator('.dr-para').first().click();
  await page.waitForTimeout(500);
  return page.evaluate(`(() => {
    const pop = document.querySelector('.dr-pop');
    const sel = document.querySelectorAll('.dr-para.selected').length;
    return {
      paras: document.querySelectorAll('.dr-para').length,
      popover: pop !== null,
      selected: sel,
      old: pop === null ? null : (pop.querySelector('.dr-popOld')?.textContent ?? '').slice(0, 40),
      value: pop === null ? null : pop.querySelector('.dr-popInput')?.value.slice(0, 40),
      buttons: pop === null ? [] : [...pop.querySelectorAll('.dr-popBtn')].map(b => b.textContent),
    };
  })()`);
});

// ---------- 11. 改字窗输入并应用 ----------
await step('type in popover and apply', async () => {
  const pop = await page.$('.dr-pop');
  if (pop === null) return { skipped: true };
  const input = await page.$('.dr-popInput');
  const before = await input.evaluate((n) => n.value);
  await input.click();
  await page.keyboard.press('Control+End');
  await input.evaluate((n) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    setter.call(n, n.value + '【改】');
    n.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(300);
  const after = await input.evaluate((n) => n.value);
  const applyBtn = await page.$('.dr-popBtn.primary');
  const disabled = applyBtn === null ? null : await applyBtn.isDisabled();
  if (applyBtn !== null && disabled === false) await applyBtn.click();
  await page.waitForTimeout(600);
  return page.evaluate(`(() => ({
    changed: document.querySelectorAll('.dr-para.changed').length,
    popoverGone: document.querySelector('.dr-pop') === null,
    editedBadge: (document.body.innerText.match(/改字\\s*\\d+/g) || []).join(','),
  }))()`);
});

// ---------- 12. Esc 取消 ----------
await step('esc cancels the window', async () => {
  await page.locator('.dr-para').nth(1).click({force:true});
  await page.waitForTimeout(400);
  const opened = await page.evaluate(`document.querySelector('.dr-pop') !== null`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  const closed = await page.evaluate(`document.querySelector('.dr-pop') === null`);
  return { opened, closed };
});

// ---------- 13. 双击仍可原地改 ----------
await step('double click still edits in place', async () => {
  const para = page.locator('.dr-para').nth(2);
  await para.dblclick();
  await page.waitForTimeout(400);
  return page.evaluate(`(() => ({
    editable: document.querySelectorAll('.dr-para[contenteditable="true"]').length,
    popover: document.querySelector('.dr-pop') !== null,
  }))()`);
});

await page.screenshot({ path: out, fullPage: false });
console.log('screenshot', out);
console.log('--- console ---');
console.log(consoleLines.slice(-14).join('\n'));

const errors = consoleLines.filter((l) => l.startsWith('[pageerror]') || l.includes('[error]'));
console.log('\n==== summary ====');
console.log('page errors:', errors.length);
if (errors.length > 0) errors.forEach((e) => console.log('  ', e));

await browser.close();
server.kill();
extra.close();
