/**
 * Document Review — Host half.
 *
 * Every route lives on the Harness' trusted `/api` channel (`connection.fetch`),
 * because that is the only channel a browser's own credential reaches; a route
 * on the generic web server is refused by the trust fence.
 *
 *   GET  /api/dsh-doc-review/render?path=<abs>   → page metadata for a document
 *   GET  /api/dsh-doc-review/page?token=&index=   → one rendered page as PNG
 *   GET  /api/dsh-doc-review/raw?token=          → an image or an HTML file
 *   GET  /api/dsh-doc-review/text?path=<abs>     → editable text blocks
 *   POST /api/dsh-doc-review/apply               → write edited blocks back
 *   POST /api/dsh-doc-review/locate              → map a rectangle onto blocks
 *   GET  /api/dsh-doc-review/recent?cwd=<abs>    → openable files near the user
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { open } from 'node:fs/promises';
import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const APPLYTEXT_TOOL = join(HERE, 'tools', 'doc_apply_text.py');
const HTML_TOOL = join(HERE, 'tools', 'doc_html.py');
const TEXTBLOCKS_TOOL = join(HERE, 'tools', 'doc_textblocks.py');

const PAGES = '/api/dsh-doc-review?action=page';
const RENDER = '/api/dsh-doc-review?action=render';
const RAW = '/api/dsh-doc-review?action=raw';
const TEXT = '/api/dsh-doc-review?action=text';
const APPLY = '/api/dsh-doc-review?action=apply';
const LOCATE = '/api/dsh-doc-review?action=locate';
const RECENT = '/api/dsh-doc-review?action=recent';
const REPORT = '/api/dsh-doc-review?action=report';
const TEXTLAYER = '/api/dsh-doc-review?action=text-layer';
const EDITTEXT = '/api/dsh-doc-review?action=edit-text';
const TEXTBLOCKS = '/api/dsh-doc-review?action=text-blocks';
const HTMLTEXT = '/api/dsh-doc-review?action=html-text';
const HTMLAPPLY = '/api/dsh-doc-review?action=html-apply';
const SELFCHECK = '/api/dsh-doc-review?action=selfcheck';

const OFFICE = new Set(['doc', 'docx', 'odt', 'rtf', 'txt', 'md', 'ppt', 'pptx', 'odp', 'xls', 'xlsx', 'ods', 'csv']);
const RASTER = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg']);
const WEB = new Set(['html', 'htm']);
/** Files that are shown and edited as plain text. */
const PLAIN = new Set(['md', 'markdown', 'txt', 'text', 'log']);
const OPENABLE = [...OFFICE, ...RASTER, ...WEB, 'pdf'];
const SKIP_DIRS = new Set([
  'node_modules', '.git', '.dsh', '.venv', '__pycache__', 'dist', 'build', '.next',
  'assets', 'public', 'static', 'images', 'img', 'icons', 'fonts', 'vendor',
]);

const MIME = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
  gif: 'image/gif', bmp: 'image/bmp', svg: 'image/svg+xml',
  html: 'text/html; charset=utf-8', htm: 'text/html; charset=utf-8',
};

const MAX_UPLOAD = 256 * 1024 * 1024;

function optionalService(ctx, name) {
  try {
    const getter = ctx.get;
    if (typeof getter !== 'function') return undefined;
    return getter.call(ctx, name) ?? undefined;
  } catch {
    return undefined;
  }
}

function resourcesRoots() {
  const out = [];
  if (typeof process.resourcesPath === 'string' && process.resourcesPath !== '') out.push(process.resourcesPath);
  out.push(join(dirname(process.execPath), 'resources'));
  out.push(join(dirname(dirname(process.execPath)), 'resources'));
  return [...new Set(out.filter((value) => value !== ''))];
}

function rendererCandidates() {
  const out = [];
  const explicit = process.env.DSH_DOC_REVIEW_CLI;
  if (typeof explicit === 'string' && explicit !== '') out.push(explicit);
  for (const base of resourcesRoots()) {
    out.push(join(base, 'app.asar.unpacked', 'dsh', 'node_modules', '@deepseek-ai', 'libreoffice-kit', 'lib', 'cli.js'));
  }
  return [...new Set(out)];
}

function nodeCandidates() {
  const out = [];
  const explicit = process.env.DSH_DOC_REVIEW_NODE;
  if (typeof explicit === 'string' && explicit !== '') out.push(explicit);
  const bin = process.platform === 'win32' ? 'node.exe' : 'node';
  for (const base of resourcesRoots()) {
    out.push(join(base, 'runtime', 'primary-runtime', 'dependencies', 'node', 'bin', bin));
  }
  out.push(process.execPath);
  return [...new Set(out)];
}

/**
 * List a directory, synchronously.
 *
 * The runtime's module loader does not always provide the named `readdirSync`
 * binding, so the function is reached through a created `require` instead.
 */
function listDirectory(dir) {
  try {
    return createRequire(import.meta.url)('node:fs').readdirSync(dir);
  } catch {
    return [];
  }
}

/** The runtime roots found by the last directory scan. */
let runtimeEntries;

export function pythonCandidates() {
  const out = [];
  const explicit = process.env.DSH_DOC_REVIEW_PYTHON;
  if (typeof explicit === 'string' && explicit !== '') out.push(explicit);

  // The interpreter ships beside the Node runtime the Harness uses, so the
  // Node location is the reliable lead to it.
  const runtimeRoots = [];
  for (const base of resourcesRoots()) {
    runtimeRoots.push(join(base, 'runtime', 'primary-runtime', 'dependencies'));
  }
  // The runtime directory is listed once and cached, so this stays synchronous.
  const home = process.env.DSH_HOME;
  if (typeof home === 'string' && home !== '' && runtimeEntries === undefined) {
    const found = [];
    for (const entry of listDirectory(join(home, 'dsh-runtimes'))) {
      found.push(join(home, 'dsh-runtimes', entry, 'dependencies'));
    }
    runtimeEntries = found;
  }
  if (runtimeEntries !== undefined) runtimeRoots.push(...runtimeEntries);
  for (const root of runtimeRoots) {
    out.push(join(root, 'python', 'python.exe'));
    out.push(join(root, 'python', 'bin', 'python3'));
    out.push(join(root, 'python', 'Scripts', 'python.exe'));
  }
  for (const base of resourcesRoots()) {
    out.push(join(base, 'runtime', 'primary-runtime', 'dependencies', 'python', 'python.exe'));
    out.push(join(base, 'runtime', 'primary-runtime', 'dependencies', 'python', 'bin', 'python3'));
  }
  out.push('python.exe', 'python3', 'python');
  return [...new Set(out)];
}

/**
 * First candidate that exists as a file.
 *
 * A bare command name is only accepted when no absolute path works: the
 * Python on PATH is usually the system one, which has neither python-docx nor
 * pypdf, while the Harness' own runtime has all of them.
 */
async function firstExisting(paths) {
  let fallback;
  for (const candidate of paths) {
    if (!candidate.includes('/') && !candidate.includes('\\') && !isAbsolute(candidate)) {
      if (fallback === undefined) fallback = candidate;
      continue;
    }
    try {
      const info = await stat(candidate);
      if (info.isFile()) return candidate;
    } catch { /* next */ }
  }
  return fallback;
}

async function findRendererCli() {
  const tried = rendererCandidates();
  const found = await firstExisting(tried);
  if (found !== undefined) return { path: found };
  const relative = join('resources', 'app.asar.unpacked', 'dsh', 'node_modules', '@deepseek-ai', 'libreoffice-kit', 'lib', 'cli.js');
  const roots = [];
  const home = process.env.DSH_HOME;
  if (typeof home === 'string' && home !== '') {
    roots.push(join(home, 'profiles'), home);
  }
  roots.push(dirname(process.execPath));
  for (const root of roots) {
    let current = root;
    for (let depth = 0; depth < 5; depth += 1) {
      const candidate = join(current, relative);
      tried.push(candidate);
      try {
        const info = await stat(candidate);
        if (info.isFile()) return { path: candidate };
      } catch { /* keep walking */ }
      current = dirname(current);
    }
  }
  return { path: undefined, tried };
}

function runCli(nodePath, cliPath, args, timeoutMs = 240_000) {
  return new Promise((resolvePromise, rejectPromise) => {
    const env = { ...process.env };
    if (process.versions.electron !== undefined) env.ELECTRON_RUN_AS_NODE = '1';
    const child = spawn(nodePath, [cliPath, ...args], { env, windowsHide: true });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => { child.kill(); }, timeoutMs);
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', (error) => { clearTimeout(timer); rejectPromise(error); });
    child.on('close', (code) => {
      clearTimeout(timer);
      const text = stdout.trim();
      if (text === '') {
        rejectPromise(new Error(stderr.trim() !== '' ? stderr.trim() : `renderer exited with code ${String(code)}`));
        return;
      }
      try {
        resolvePromise(JSON.parse(text));
      } catch {
        rejectPromise(new Error(`renderer printed non-JSON: ${text.slice(0, 200)}`));
      }
    });
  });
}

/**
 * Run a tool that needs the renderer's paths.
 *
 * The paragraph reader and the text layer both convert the document with the
 * engine that drew the page images, so they are told where that engine is.
 */
function runWithRenderer(script, documentPath, extra = {}) {
  return new Promise(async (resolvePromise, rejectPromise) => {
    const python = await firstExisting(pythonCandidates());
    if (python === undefined) {
      rejectPromise(new Error('no Python with pypdf support was found'));
      return;
    }
    const renderer = await findRendererCli();
    const nodePath = (await firstExisting(nodeCandidates())) ?? process.execPath;
    // A setting that is already known wins: the tool needs the renderer, and
    // a host that already knows where it is should not be second-guessed.
    const env = {
      ...process.env,
      DSH_DOC_REVIEW_CLI: process.env.DSH_DOC_REVIEW_CLI ?? renderer.path ?? '',
      DSH_DOC_REVIEW_NODE: process.env.DSH_DOC_REVIEW_NODE ?? nodePath,
      ...extra,
    };
    const child = spawn(python, [script, documentPath], { windowsHide: true, env });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill(), 300_000);
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', (error) => { clearTimeout(timer); rejectPromise(error); });
    child.on('close', () => {
      clearTimeout(timer);
      const text = stdout.trim();
      if (text === '') {
        rejectPromise(new Error(stderr.trim() !== '' ? stderr.trim() : 'the tool produced no output'));
        return;
      }
      try {
        const parsed = JSON.parse(text);
        if (parsed?.ok !== true) {
          rejectPromise(new Error(parsed?.error ?? 'the tool refused'));
          return;
        }
        resolvePromise(parsed);
      } catch {
        rejectPromise(new Error(`the tool printed non-JSON: ${text.slice(0, 200)}`));
      }
    });
  });
}

function runPython(script, args, input) {
  return new Promise(async (resolvePromise, rejectPromise) => {
    const python = await firstExisting(pythonCandidates());
    if (python === undefined) {
      rejectPromise(new Error('no Python with docx/pptx/openpyxl support was found'));
      return;
    }
    const child = spawn(python, [script, ...args], { windowsHide: true });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill(), 60_000);
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', (error) => { clearTimeout(timer); rejectPromise(error); });
    child.on('close', () => {
      clearTimeout(timer);
      const text = stdout.trim();
      if (text === '') {
        rejectPromise(new Error(stderr.trim() !== '' ? stderr.trim() : 'tool produced no output'));
        return;
      }
      try {
        const parsed = JSON.parse(text);
        if (parsed?.ok !== true) {
          rejectPromise(new Error(parsed?.error ?? 'tool refused'));
          return;
        }
        resolvePromise(parsed);
      } catch {
        rejectPromise(new Error(`tool printed non-JSON: ${text.slice(0, 200)}`));
      }
    });
    if (input !== undefined) {
      child.stdin.write(JSON.stringify(input));
      child.stdin.end();
    } else {
      child.stdin.end();
    }
  });
}

/**
 * Run the page-mapping tool.
 *
 * It converts the document to PDF with the same engine that produced the
 * page images, so a block's page is the page the human actually saw.
 */

/**
 * The pixel size of an image.
 *
 * The width and height live in the first bytes of the file, so they are read
 * directly rather than through an image library.
 */
async function imageSize(filePath) {
  const handle = await open(filePath, 'r');
  try {
    const head = Buffer.alloc(32);
    await handle.read(head, 0, 32, 0);
    // PNG: the IHDR chunk carries the size.
    if (head.slice(0, 8).toString('hex') === '89504e470d0a1a0a') {
      return { width: head.readUInt32BE(16), height: head.readUInt32BE(20) };
    }
    // GIF: the logical screen descriptor.
    if (head.slice(0, 3).toString('ascii') === 'GIF') {
      return { width: head.readUInt16LE(6), height: head.readUInt16LE(8) };
    }
    // JPEG: walk the segment markers to the frame header.
    if (head[0] === 0xff && head[1] === 0xd8) {
      let offset = 2;
      const buffer = Buffer.alloc(4);
      while (offset < head.length - 8) {
        await handle.read(buffer, 0, 4, offset);
        if (buffer[0] !== 0xff) break;
        const marker = buffer[1];
        const length = buffer.readUInt16BE(2);
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          const frame = Buffer.alloc(5);
          await handle.read(frame, 0, 5, offset + 4);
          return { height: frame.readUInt16BE(1), width: frame.readUInt16BE(3) };
        }
        offset += 2 + length;
      }
    }
    // WebP: the VP8/VP8L/VP8X headers each carry the size.
    if (head.slice(0, 4).toString('ascii') === 'RIFF' && head.slice(8, 12).toString('ascii') === 'WEBP') {
      const kind = head.slice(12, 16).toString('ascii');
      if (kind === 'VP8X') {
        return { width: 1 + (head[24] | (head[25] << 8) | (head[26] << 16)), height: 1 + (head[27] | (head[28] << 8) | (head[29] << 16)) };
      }
      if (kind === 'VP8 ') {
        return { width: head.readUInt16LE(26) & 0x3fff, height: head.readUInt16LE(28) & 0x3fff };
      }
      if (kind === 'VP8L') {
        const bits = head.readUInt32LE(21);
        return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
      }
    }
  } catch { /* fall through */ }
  finally {
    await handle.close();
  }
  return { width: 0, height: 0 };
}



function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

function fail(code, message, status = 200) {
  return json({ ok: false, error: { code, message } }, status);
}

/* ── Rendering ─────────────────────────────────────────────────────────────── */

const cache = new Map();
const CACHE_LIMIT = 12;

/** The render in flight for each token, so two requests do not collide. */
const rendering = new Map();

function tokenFor(key) {
  return createHash('sha256').update(key).digest('hex').slice(0, 24);
}

function cachePut(token, entry) {
  cache.set(token, { ...entry, lastUsed: Date.now() });
  while (cache.size > CACHE_LIMIT) {
    let oldestToken;
    let oldestUse = Infinity;
    for (const [key, value] of cache) {
      if (key === token) continue;
      if (value.lastUsed < oldestUse) { oldestUse = value.lastUsed; oldestToken = key; }
    }
    if (oldestToken === undefined) break;
    const dropped = cache.get(oldestToken);
    cache.delete(oldestToken);
    if (dropped?.kind === 'pages' && dropped.dir.includes('dsh-doc-review')) {
      rm(dropped.dir, { recursive: true, force: true }).catch(() => {});
    }
  }
  return cache.get(token);
}

/**
 * Render a document that already exists on disk.
 *
 * The export exists so a diagnostic can exercise the same path the route uses.
 */
/**
 * The PDF of a document.
 *
 * The Harness ships an Office conversion provider that caches by content,
 * keeps the font fallbacks in one place and bounds how many conversions run
 * at once. Using it means the desk does not start a LibreOffice of its own,
 * and a document that was converted once is converted never again.
 */
const pdfCache = new Map();

/** The conversion in flight for each document, so it happens only once. */
const pdfPending = new Map();

/** The page being drawn, so the renderer is asked for one page at a time. */
let pageQueue = Promise.resolve();

/**
 * The Office conversion provider, once the Harness has provided it.
 *
 * The service is a hard dependency of the plugin only when the desk needs
 * it, so it is picked up when it appears rather than demanded at load time.
 */
let officeService = null;

/** The provider, from the context or from the dependency it was injected as. */
function officeProvider(ctx) {
  const direct = optionalService(ctx, 'officeToPdf');
  if (direct !== undefined && typeof direct.convert === 'function') return direct;
  return officeService ?? undefined;
}

/**
 * The PDF bytes of a document.
 *
 * @param {object} ctx - the plugin context.
 * @param {string} filePath - the document on disk.
 * @returns {Promise<{ pdf: Uint8Array, missingFonts: string[] }>}
 */
/**
 * Turn a document into a PDF with the renderer itself.
 *
 * This is the path taken when the Harness does not offer its conversion
 * service; it is slower, because nothing is cached between calls, but it
 * needs nothing beyond the renderer that is already installed.
 */
async function convertWithRenderer(filePath, info) {
  const renderer = await findRendererCli();
  if (renderer.path === undefined) {
    throw new Error('LibreOffice Kit renderer not found beside the Harness install');
  }
  const nodePath = (await firstExisting(nodeCandidates())) ?? process.execPath;
  const workdir = join(
    tmpdir(), 'dsh-doc-review-local',
    `${createHash('sha1').update(`${filePath}:${String(info.mtimeMs)}`).digest('hex')}-${String(Date.now())}`,
  );
  await mkdir(workdir, { recursive: true });
  const out = join(workdir, 'document.pdf');
  const manifest = await runCli(nodePath, renderer.path, [
    'convert', '--input', filePath, '--output', out,
  ]);
  if (manifest?.code === 'failed') throw new Error(manifest.error ?? 'conversion failed');
  return { pdf: await readFile(out), missingFonts: [] };
}

/**
 * Every paragraph of a document, with the box it occupies on its page.
 *
 * Reading them costs a PDF conversion, so the answer is kept until the file
 * changes: the panel asks for it once, and pointing an annotation at a
 * paragraph asks for it again.
 */
const paragraphCache = new Map();

/** The paragraphs of a document, read once per version of the file. */
async function paragraphsFor(ctx, filePath) {
  const info = await stat(filePath);
  const key = `${filePath}:${String(info.size)}:${String(info.mtimeMs)}`;
  const hit = paragraphCache.get(key);
  if (hit !== undefined) {
    hit.lastUsed = Date.now();
    return hit.blocks;
  }
  const converted = await pdfBytes(ctx, filePath);
  const workdir = join(
    tmpdir(), 'dsh-doc-review-para',
    `${String(Date.now())}-${String(process.pid)}`,
  );
  await mkdir(workdir, { recursive: true });
  const pdfPath = join(workdir, 'document.pdf');
  await writeFile(pdfPath, converted.pdf);
  const result = await runWithRenderer(TEXTBLOCKS_TOOL, filePath, { DSH_DOC_REVIEW_PDF: pdfPath });
  const pages = new Map((result.pages ?? []).map((page) => [page.index, page]));
  const blocks = (result.blocks ?? []).map((block) => {
    const page = pages.get(block.page);
    return { ...block, pageWidth: page?.width ?? 0, pageHeight: page?.height ?? 0 };
  });
  paragraphCache.set(key, { blocks, lastUsed: Date.now() });
  while (paragraphCache.size > 4) {
    const oldest = [...paragraphCache.entries()].sort((a, b) => a[1].lastUsed - b[1].lastUsed)[0];
    if (oldest === undefined) break;
    paragraphCache.delete(oldest[0]);
  }
  return blocks;
}

async function pdfBytes(ctx, filePath) {
  const info = await stat(filePath);
  const key = `${filePath}:${String(info.size)}:${String(info.mtimeMs)}`;
  const hit = pdfCache.get(key);
  if (hit !== undefined) {
    hit.lastUsed = Date.now();
    return hit;
  }
  const running = pdfPending.get(key);
  if (running !== undefined) return running;

  const provider = officeProvider(ctx);
  const extension = extname(filePath).slice(1).toLowerCase();
  const version = `${String(info.size)}:${String(info.mtimeMs)}`;
  const conversion = (async () => {
    // The shipped provider is used when the Harness offers it: it caches by
    // content and keeps the font settings in one place. When it is not there
    // — an older build, or a profile without the web bundle — the renderer is
    // called directly, so the desk never depends on one way of converting.
    if (provider === undefined) {
      return convertWithRenderer(filePath, info);
    }
    const result = await provider.convert({
      extension,
      priority: 'foreground',
      source: {
        key: filePath,
        version,
        bytes: info.size,
        read: async () => ({ bytes: await readFile(filePath), version }),
      },
    });
    const entry = { pdf: result.pdf, missingFonts: result.missingFonts ?? [], lastUsed: Date.now() };
    pdfCache.set(key, entry);
    while (pdfCache.size > 4) {
      const oldest = [...pdfCache.entries()].sort((a, b) => a[1].lastUsed - b[1].lastUsed)[0];
      if (oldest === undefined) break;
      pdfCache.delete(oldest[0]);
    }
    return entry;
  })();
  pdfPending.set(key, conversion);
  try {
    return await conversion;
  } finally {
    pdfPending.delete(key);
  }
}


export async function renderPath(ctx, filePath, maxPagePixels = 2_400_000, dpi = 144) {
  const info = await stat(filePath);
  if (!info.isFile()) throw new Error('not a file');
  const ext = extname(filePath).slice(1).toLowerCase();
  const key = `${filePath}:${String(info.size)}:${String(info.mtimeMs)}`;
  return renderDocument(ctx, filePath, key, ext, maxPagePixels, dpi);
}

/**
 * Draw one page of a document that was not drawn when it opened.
 *
 * Only the first page is prepared up front; the rest are drawn when the human
 * scrolls to them, so opening a long document does not wait for pages nobody
 * has looked at. The renderer serves one drawing at a time, so a page waits
 * its turn rather than starting a second renderer beside the first.
 */
async function drawPage(entry, index) {
  const previous = pageQueue;
  let release;
  pageQueue = new Promise((resolve) => { release = resolve; });
  await previous;
  try {
    return await drawPageNow(entry, index);
  } finally {
    release();
  }
}

/** The drawing itself, once this page's turn has come. */
async function drawPageNow(entry, index) {
  // The renderer creates the folder and refuses one that exists, so each
  // attempt is given a name of its own.
  const outDir = join(dirname(entry.pdfPath), `page-${String(index)}-${String(Date.now())}`);
  const manifest = await runCli(entry.nodePath, entry.rendererPath, [
    'render', '--input', entry.pdfPath, '--output-dir', outDir,
    '--pages', String(index), '--max-image-resolution', String(entry.dpi),
  ]);
  if (manifest?.code === 'failed') return undefined;
  // The renderer numbers the images it produced, not the pages of the
  // document: asking for page five yields one image, numbered one.
  const image = (manifest.images ?? [])[0];
  if (image === undefined) return undefined;
  const page = { index, width: image.width, height: image.height, path: image.path };
  entry.pages.push(page);
  entry.pages.sort((a, b) => a.index - b.index);
  return page;
}

async function renderDocument(ctx, filePath, cacheKey, ext, maxPagePixels, dpi = 144) {
  const info = await stat(filePath);
  const token = tokenFor(`${cacheKey}:${String(dpi)}:${String(maxPagePixels)}`);
  const hit = cache.get(token);
  if (hit !== undefined) {
    hit.lastUsed = Date.now();
    return { token, entry: hit };
  }

  // The source identity, so the panel can tell that the file moved on while
  // the human was reviewing it.
  const stamp = `${String(info.size)}:${String(info.mtimeMs)}`;

  if (PLAIN.has(ext)) {
    // A plain-text file is shown as its own text, which the human edits
    // directly; the file's own line endings are kept when it is written back.
    const content = await readFile(filePath, 'utf8');
    const entry = cachePut(token, {
      dir: dirname(filePath), file: filePath, kind: 'text', pages: [],
      pageCount: 1, missingFonts: [], stamp,
      text: content,
    });
    return { token, entry };
  }
  if (RASTER.has(ext)) {
    // An image is one page of its own, so it is annotated like a document page;
    // its size is read so a box on it has the right proportions.
    const size = await imageSize(filePath);
    const entry = cachePut(token, {
      dir: dirname(filePath), file: filePath, kind: 'image', pages: [],
      pageCount: 1, missingFonts: [], stamp,
      image: { width: size.width, height: size.height, path: filePath },
    });
    return { token, entry };
  }
  if (WEB.has(ext)) {
    const entry = cachePut(token, {
      dir: dirname(filePath), file: filePath, kind: 'html', pages: [],
      pageCount: 1, missingFonts: [], stamp,
    });
    return { token, entry };
  }
  if (!OFFICE.has(ext) && ext !== 'pdf') throw new Error(`unsupported extension: .${ext}`);

  const renderer = await findRendererCli();
  if (renderer.path === undefined) {
    throw new Error('LibreOffice Kit renderer not found beside the Harness install');
  }
  const nodePath = (await firstExisting(nodeCandidates())) ?? process.execPath;
  // The document is turned into a PDF once, by the shipped provider, and the
  // same PDF is used for the page images and for the paragraph positions.
  const converted = await pdfBytes(ctx, filePath);
  const workdir = join(tmpdir(), 'dsh-doc-review', `${token}-${String(Date.now())}-${String(process.pid)}`);
  await mkdir(workdir, { recursive: true });
  const pdfPath = join(workdir, 'document.pdf');
  await writeFile(pdfPath, converted.pdf);
  // The renderer creates the output directory itself and refuses one that
  // already exists, so the folder is only named here, never made. Each attempt
  // gets its own name, so a leftover from an earlier run cannot block a new one.
  // Only the first page is drawn now: the panel shows that one at once, and
  // the rest are drawn when the human scrolls to them. Drawing all ten pages
  // before showing anything made the panel wait for work nobody had asked for.
  const outDir = join(workdir, 'pages');
  const manifest = await runCli(nodePath, renderer.path, [
    'render', '--input', pdfPath, '--output-dir', outDir, '--pages', '1',
    '--max-image-resolution', String(dpi),
  ]);
  if (manifest?.code === 'failed') throw new Error(manifest.error ?? 'render failed');

  const images = Array.isArray(manifest?.images) ? manifest.images : [];
  const pages = images.map((image) => ({
    index: image.index, width: image.width, height: image.height, path: image.path,
  }));
  const entry = cachePut(token, {
    // The directory the renderer actually wrote into.
    dir: dirname(pages[0]?.path ?? outDir),
    file: filePath,
    kind: 'pages',
    pages,
    pageCount: typeof manifest?.pageCount === 'number' && manifest.pageCount > 0
      ? Math.max(manifest.pageCount, pages.length)
      : pages.length,
    // The PDF the pages are drawn from, so a page that was not drawn yet can
    // be drawn when it is needed. The first page's size stands for the
    // document, so the layout is right before the other pages exist.
    pageWidth: pages[0]?.width ?? 0,
    pageHeight: pages[0]?.height ?? 0,
    pdfPath,
    nodePath,
    nodePath,
    rendererPath: renderer.path,
    dpi,
    missingFonts: converted.missingFonts,
  });
  return { token, entry };
}

function describe(token, entry) {
  const ext = extname(entry.file).slice(1).toLowerCase();
  const base = {
    ok: true,
    token,
    file: entry.file,
    name: basename(entry.file),
    kind: entry.kind,
    ext,
    pageCount: entry.pageCount,
    missingFonts: entry.missingFonts,
    stamp: entry.stamp ?? null,
    text: entry.text ?? null,
    // What can be reviewed in this document, so the panel offers the right
    // actions instead of one generic set.
    capabilities: {
      annotate: entry.kind === 'pages' || entry.kind === 'image',
      editText: entry.kind === 'pages' && (OFFICE.has(ext) || ext === 'pdf'),
      editHtml: entry.kind === 'html',
      editImage: entry.kind === 'image',
    },
  };
  if (entry.kind === 'pages') {
    // Every page is described, even when only the first one has been drawn:
    // the panel asks for a page's image when it scrolls to it. The size of a
    // page that was not drawn yet comes from the PDF, so the layout is right
    // before its pixels exist.
    const drawn = new Map(entry.pages.map((page) => [page.index, page]));
    const total = Math.max(entry.pageCount ?? 0, entry.pages.length);
    base.pages = [];
    for (let index = 1; index <= total; index += 1) {
      const page = drawn.get(index);
      base.pages.push({
        index,
        width: page?.width ?? entry.pageWidth ?? 0,
        height: page?.height ?? entry.pageHeight ?? 0,
        drawn: page !== undefined,
        url: `${PAGES}&token=${token}&index=${String(index)}`,
      });
    }
  } else {
    base.pages = [{
      index: 1,
      width: entry.image?.width ?? 0,
      height: entry.image?.height ?? 0,
      url: `${RAW}&token=${token}`,
    }];
  }
  return base;
}

/* ── Path resolution ───────────────────────────────────────────────────────── */

/**
 * Resolve a path the browser sent.
 *
 * A preview tab addresses a file as `dsh-resource://file/session/<id>/<path>`,
 * and that path is relative to the session's working directory. The Host
 * therefore resolves it against the session it belongs to; an absolute path is
 * taken as it is.
 */
function makeResolver(ctx) {
  const query = optionalService(ctx, 'sessionQuery');
  return async (path, sessionId) => {
    if (isAbsolute(path)) return resolve(path);
    if (query !== undefined && typeof query.readSession === 'function'
      && typeof sessionId === 'string' && sessionId !== '') {
      try {
        const snapshot = await query.readSession(sessionId);
        const cwd = snapshot?.session?.cwd;
        if (typeof cwd === 'string' && cwd !== '') return resolve(cwd, path);
      } catch { /* try the next source */ }
      // The directory the running session works in.
      try {
        const service = optionalService(ctx, 'workingDirectory');
        const agent = ctx.agents?.currentInitiator?.() ?? ctx.agents?.roots?.()[0];
        if (service !== undefined && agent !== undefined && typeof service.get === 'function') {
          const cwd = service.get(agent.session);
          if (typeof cwd === 'string' && cwd !== '') return resolve(cwd, path);
        }
      } catch { /* fall through */ }
    }
    return resolve(path);
  };
}

/* ── Recent files ──────────────────────────────────────────────────────────── */

async function scanDirectory(root, depth, budget, out) {
  if (depth <= 0 || budget.left <= 0) return;
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch { return; }
  for (const entry of entries) {
    if (budget.left <= 0) return;
    if (entry.name.startsWith('.')) continue;
    const full = join(root, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      await scanDirectory(full, depth - 1, budget, out);
      continue;
    }
    if (!entry.isFile()) continue;
    const ext = extname(entry.name).slice(1).toLowerCase();
    if (!OPENABLE.includes(ext)) continue;
    try {
      const info = await stat(full);
      if (info.size > MAX_UPLOAD) continue;
      budget.left -= 1;
      out.push({ path: full, name: entry.name, ext, size: info.size, mtime: info.mtimeMs });
    } catch { /* skip */ }
  }
}

/* ── Plugin ────────────────────────────────────────────────────────────────── */

/**
 * The services this plugin needs.
 *
 * `fs` is the Harness' own filesystem, so the plugin writes inside the same
 * sandbox as an agent would and gets the version guard for free. The Office
 * conversion is the shipped provider: it caches by content, keeps the font
 * fallbacks in one place and bounds how many conversions run at once.
 */
export const inject = ['fs'];

export function apply(ctx, config = {}) {
  /**
   * The routes live on the Connection's Fetch channel.
   *
   * The service is reached through an injected dependency, because that is
   * how the Harness hands out a service that is provided by another plugin;
   * the direct lookup is the fallback for a host that exposes it that way.
   */
  let apiFetch = null;
  const direct = optionalService(ctx, 'connection');
  if (direct !== undefined && typeof direct.fetch?.register === 'function') {
    apiFetch = direct.fetch;
  }

  const maxPagePixels = typeof config?.maxPagePixels === 'number' && config.maxPagePixels > 0
    ? Math.floor(config.maxPagePixels)
    : 2400000;
  // The dots per inch the page images are drawn at. 144 is the kit default and
  // what the shipped preview uses; a larger value only makes the panel wait.
  const dpi = typeof config?.dpi === 'number' && config.dpi > 0
    ? Math.floor(config.dpi)
    : 96;

  // The conversion provider is picked up when the Harness provides it.
  if (typeof ctx.inject === 'function') {
    ctx.inject(['officeToPdf'], (scope) => {
      const service = scope?.officeToPdf;
      if (service !== undefined && typeof service.convert === 'function') {
        officeService = service;
        ctx.logger?.info?.('doc-review: the Office conversion service is available');
      }
    });
  }

  const resolveTarget = makeResolver(ctx);

  /**
   * Register one route on the trusted Fetch channel.
   *
   * `register` returns a promise that resolves to the disposer, so the effect
   * keeps the disposer rather than the promise: handing a promise to the
   * effect as if it were a cleanup function breaks every route after it.
   */
  /** Every route this plugin registered, for the self-check to report. */
  const apiRoutes = new Map();

  const handlers = new Map();

  /**
   * One action of the plugin's route.
   *
   * The Connection bridge matches a single /api segment, so every action
   * shares the one path and is told apart by its query.
   */
  const register = (path, method, handler) => {
    const action = new URL(path, 'http://x').searchParams.get('action') ?? '';
    handlers.set(action, { method, handler });
    apiRoutes.set(path, method);
  };

  /** Claim the route once every action is known. */
  const claimRoute = () => {
    ctx.effect(() => {
      let disposer;
      let active = true;
      // The contract says the registration returns a promise of the disposer,
      // but a host that hands back the disposer directly is accepted too.
      const outcome = apiFetch.register({
        path: '/api/dsh-doc-review',
        methods: ['GET', 'POST'],
        requestBody: 'buffered',
        fetch: (request) => {
          const url = new URL(request.url, 'http://x');
          const action = url.searchParams.get('action') ?? '';
          const found = handlers.get(action);
          if (found === undefined) {
            return json({
              ok: false,
              error: { code: 'unknown-action', message: `unknown action: ${action}` },
            }, 404);
          }
          return found.handler(request);
        },
      });
      if (outcome !== undefined && typeof outcome.then === 'function') {
        void outcome.then((release) => { disposer = release; }, (error) => {
          active = false;
          ctx.logger?.error?.(`doc-review: the route failed to register: ${error instanceof Error ? error.message : String(error)}`);
        });
      } else if (typeof outcome === 'function') {
        disposer = outcome;
      }
      return () => {
        if (!active) return;
        void disposer?.();
      };
    }, 'doc-review: the /api route');
  };

  /**
   * Register every route on the trusted Fetch channel.
   *
   * The channel is only known once the Connection service is available, so
   * the registrations run from the place that hands the service over; a
   * host that already exposes it registers them straight away.
   */
  const registerRoutes = () => {
    register(RENDER, 'GET', async (request) => {
      const url = new URL(request.url, 'http://x');
      const raw = url.searchParams.get('path');
      if (raw === null || raw === '') return fail('bad-request', 'path is required', 400);
      try {
        const target = await resolveTarget(raw, url.searchParams.get('sessionId') ?? '');
        const rendered = await renderPath(ctx, target, maxPagePixels, dpi);
        return json(describe(rendered.token, rendered.entry));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.logger?.error?.(`doc-review: render failed for ${raw}: ${message}`);
        return fail('render-failed', message);
      }
    });

    register(PAGES, 'GET', async (request) => {
      const url = new URL(request.url, 'http://x');
      const entry = cache.get(url.searchParams.get('token') ?? '');
      if (entry === undefined) return fail('not-found', 'unknown page token', 404);
      const index = Number(url.searchParams.get('index') ?? '1');
      // A page that was not drawn yet is drawn now: only the first one is
      // prepared when the document opens, so the panel shows it at once.
      let page = entry.pages.find((candidate) => candidate.index === index);
      if (page === undefined && typeof entry.pdfPath === 'string') {
        try {
          page = await drawPage(entry, index);
        } catch (error) {
          // A page that cannot be drawn leaves the panel with a placeholder,
          // not with a failed request.
          ctx.logger?.warn?.(`doc-review: page ${String(index)} could not be drawn: ${error instanceof Error ? error.message : String(error)}`);
          page = undefined;
        }
        if (page === undefined) return fail('not-found', 'the page could not be drawn', 404);
      }
      if (page === undefined) return fail('not-found', 'unknown page token or page index', 404);
      // A page drawn on demand lives beside the PDF rather than in the
      // directory the first page was written to, so the whole working folder
      // is the bound, not just that one directory.
      const root = typeof entry.pdfPath === 'string' ? dirname(dirname(entry.pdfPath)) : entry.dir;
      if (!resolve(page.path).startsWith(resolve(root))) {
        return fail('bad-request', 'page path outside the render directory', 400);
      }
      try {
        const bytes = await readFile(page.path);
        return new Response(bytes, { headers: { 'content-type': 'image/png', 'cache-control': 'no-store' } });
      } catch (error) {
        return fail('read-failed', error instanceof Error ? error.message : String(error), 500);
      }
    });

    register(RAW, 'GET', async (request) => {
      const url = new URL(request.url, 'http://x');
      const entry = cache.get(url.searchParams.get('token') ?? '');
      if (entry === undefined) return fail('not-found', 'unknown token', 404);
      if (entry.kind === 'pages') return fail('bad-request', 'this token has page images, not raw content', 400);
      const ext = extname(entry.file).slice(1).toLowerCase();
      try {
        const bytes = await readFile(entry.file);
        return new Response(bytes, {
          headers: { 'content-type': MIME[ext] ?? 'application/octet-stream', 'cache-control': 'no-store' },
        });
      } catch (error) {
        return fail('read-failed', error instanceof Error ? error.message : String(error), 500);
      }
    });

    register(RECENT, 'GET', async (request) => {
      const url = new URL(request.url, 'http://x');
      const roots = [];
      const cwd = url.searchParams.get('cwd');
      if (cwd !== null && cwd !== '' && isAbsolute(cwd)) roots.push(cwd);
      if (roots.length === 0) roots.push(process.cwd());
      const budget = { left: 400 };
      const found = [];
      for (const root of [...new Set(roots)]) {
        await scanDirectory(root, 4, budget, found);
        if (budget.left <= 0) break;
      }
      const rank = (item) => (item.ext === 'svg' || item.ext === 'png' || item.ext === 'ico'
        ? 2
        : (OFFICE.has(item.ext) || item.ext === 'pdf' || WEB.has(item.ext) ? 0 : 1));
      found.sort((a, b) => {
        const delta = rank(a) - rank(b);
        return delta !== 0 ? delta : b.mtime - a.mtime;
      });
      return json({
        ok: true,
        roots: [...new Set(roots)],
        files: found.slice(0, 40).map((item) => ({
          path: item.path, name: item.name, ext: item.ext, size: item.size, mtime: item.mtime,
        })),
      });
    });

    /**
     * A report from the browser.
     *
     * The browser tells the Host what it can see: which preview renderers are
     * registered, and what a failed request actually returned. A registration
     * that did not take is otherwise invisible from the Host side.
     */
    /**
     * The editable text layer of a rendered document.
     *
     * The page images are pictures, so the browser cannot know what text sits
     * where on them. This reports every text run with its position, so the
     * panel can lay a clickable layer over the picture and let the human edit
     * the text where they see it.
     */
    register(TEXTLAYER, 'GET', async (request) => {
      const url = new URL(request.url, 'http://x');
      const raw = url.searchParams.get('path');
      if (raw === null || raw === '') return fail('bad-request', 'path is required', 400);
      try {
        const target = await resolveTarget(raw, url.searchParams.get('sessionId') ?? '');
        const layer = await runWithRenderer(TEXTLAYER_TOOL, target);
        return json({ ok: true, file: target, pages: layer.pages ?? [] });
      } catch (error) {
        return fail('text-layer-failed', error instanceof Error ? error.message : String(error));
      }
    });

    /**
     * Write an edited text run back into the document.
     *
     * The edit names the run's original text and its replacement; the tool
     * finds the paragraph that holds that text and replaces the fragment in
     * place, so the rest of the paragraph keeps its formatting.
     */
    register(EDITTEXT, 'POST', async (request) => {
      let body;
      try {
        body = await request.json();
      } catch (error) {
        return fail('bad-request', error instanceof Error ? error.message : 'bad body', 400);
      }
      if (typeof body?.path !== 'string' || body.path === '') {
        return fail('bad-request', 'path is required', 400);
      }
      const edits = Array.isArray(body?.edits) ? body.edits : [];
      if (edits.length === 0) return fail('bad-request', 'edits must be a non-empty list', 400);
      try {
        const target = await resolveTarget(body.path, body.sessionId ?? '');
        // A file that moved on while the human was editing it is not
        // overwritten without a word: the version the panel was built from is
        // checked first.
        const expected = body.version;
        if (typeof expected === 'string' && expected !== '') {
          const info = await stat(target);
          const now = `${String(info.size)}:${String(info.mtimeMs)}`;
          if (now !== expected) {
            return json({
              ok: false,
              error: { code: 'conflict', message: '文件在磁盘上已被改动，未覆盖。请刷新后重试。' },
              current: now,
            }, 409);
          }
        }
        const result = await runPython(APPLYTEXT_TOOL, [target], { edits });
        for (const [token, entry] of cache) {
          if (resolve(entry.file) === target) cache.delete(token);
        }
        return json({ ok: true, file: result.file, applied: result.applied, backup: result.backup });
      } catch (error) {
        return fail('write-failed', error instanceof Error ? error.message : String(error));
      }
    });

    /**
     * A self-check the browser can call.
     *
     * It answers with what the Host resolves for the panel's own routes, so a
     * failure to reach one is visible in the page itself instead of only in a
     * blank panel.
     */
    /**
   * The panel's own credential, for a diagnostic that must reach the Host.
   *
   * The routes are on the Connection's trusted channel, so a request without
   * the browser's credential is refused; this route hands out a tokenized URL
   * so a tool outside the page can reach them.
   */
  /**
   * The editable paragraphs of a document, with where they sit on the page.
   *
   * One box per paragraph, so the panel can offer a region the human edits the
   * way Office does: the paragraph itself, not a fragment of it.
   */
  register('/api/dsh-doc-review?action=text-blocks', 'GET', async (request) => {
    const url = new URL(request.url, 'http://x');
    const raw = url.searchParams.get('path');
    if (raw === null || raw === '') return fail('bad-request', 'path is required', 400);
    try {
      const target = await resolveTarget(raw, url.searchParams.get('sessionId') ?? '');
      const blocks = await paragraphsFor(ctx, target);
      // The page sizes travel with the blocks, so the panel can place them.
      const pages = [...new Map(blocks.map((block) => [block.page, {
        index: block.page, width: block.pageWidth, height: block.pageHeight,
      }])).values()];
      return json({ ok: true, file: target, pages, blocks });
    } catch (error) {
      return fail('text-blocks-failed', error instanceof Error ? error.message : String(error));
    }
  });

  /**
   * Point an annotation at the paragraphs it covers.
   *
   * The rectangles are a share of the page, and every paragraph of the
   * document is known with the box it occupies, so the answer is arithmetic:
   * the paragraphs of that page whose box overlaps the rectangle, most of it
   * first. Nothing is converted again for this.
   */
  register(LOCATE, 'POST', async (request) => {
    let body;
    try {
      body = await request.json();
    } catch (error) {
      return fail('bad-request', error instanceof Error ? error.message : 'bad body', 400);
    }
    if (typeof body?.path !== 'string' || body.path === '') {
      return fail('bad-request', 'path is required', 400);
    }
    const annotations = Array.isArray(body?.annotations) ? body.annotations : [];
    try {
      const target = await resolveTarget(body.path, body.sessionId ?? '');
      const blocks = await paragraphsFor(ctx, target);
      const located = annotations.map((annotation) => {
        const rect = annotation.rect ?? {};
        const page = Number(annotation.page ?? 1);
        const left = Number(rect.x ?? 0);
        const top = Number(rect.y ?? 0);
        const right = left + Number(rect.w ?? 0);
        const bottom = top + Number(rect.h ?? 0);
        const hits = [];
        for (const block of blocks) {
          if (block.page !== page) continue
          const page_w = block.pageWidth > 0 ? block.pageWidth : 1;
          const page_h = block.pageHeight > 0 ? block.pageHeight : 1;
          const bx0 = block.box.x / page_w;
          const bx1 = (block.box.x + block.box.w) / page_w;
          // The box is measured from the bottom of the page; the rectangle
          // from the top, so the vertical span is mirrored.
          const by0 = (page_h - block.box.y - block.box.h) / page_h;
          const by1 = (page_h - block.box.y) / page_h;
          const overlapX = Math.max(0, Math.min(right, bx1) - Math.max(left, bx0));
          const overlapY = Math.max(0, Math.min(bottom, by1) - Math.max(top, by0));
          const area = overlapX * overlapY;
          if (area <= 0) continue;
          const own = Math.max(1e-6, (bx1 - bx0) * (by1 - by0));
          hits.push({ block, share: area / own });
        }
        hits.sort((a, b) => b.share - a.share);
        return {
          id: annotation.id,
          page,
          blocks: hits.slice(0, 6).map((hit) => ({
            id: hit.block.id,
            label: hit.block.heading === null || hit.block.heading === undefined ? 'Normal' : `H${String(hit.block.heading)}`,
            text: hit.block.text,
            overlap: Math.round(hit.share * 100) / 100,
          })),
        };
      });
      return json({ ok: true, located, strategy: 'paragraphs' });
    } catch (error) {
      return fail('locate-failed', error instanceof Error ? error.message : String(error));
    }
  });

  /**
   * The editable text of an HTML report.
   *
   * The report is shown as it is; this reports where its text runs sit, so
   * the panel can mark them and collect what the human changed.
   */
    /**
     * Write a plain-text file back, keeping the line endings it already uses.
     *
     * A reader that joins the lines with a newline and drops the terminator
     * would turn every CRLF in the file into an LF, so the endings are read
     * from the file itself and put back.
     */
    /**
     * Write a plain-text file back, keeping the line endings it already uses.
     *
     * A reader that joins the lines with a newline and drops the terminator
     * would turn every CRLF in the file into an LF, so the endings are read
     * from the file itself and put back.
     */
    register('/api/dsh-doc-review?action=text-save', 'POST', async (request) => {
      let body;
      try {
        body = await request.json();
      } catch (error) {
        return fail('bad-request', error instanceof Error ? error.message : 'bad body', 400);
      }
      if (typeof body?.path !== 'string' || body.path === '') {
        return fail('bad-request', 'path is required', 400);
      }
      if (typeof body?.content !== 'string') {
        return fail('bad-request', 'content must be a string', 400);
      }
      try {
        const target = await resolveTarget(body.path, body.sessionId ?? '');
        const original = await readFile(target, 'utf8');
        const crlf = original.includes('\r\n');
        const content = crlf
          ? body.content.replace(/\r?\n/g, '\r\n')
          : body.content.replace(/\r\n/g, '\n');
        const backup = `${target}.bak-${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15)}`;
        await copyFile(target, backup);
        await writeFile(target, content, 'utf8');
        for (const [token, entry] of cache) {
          if (resolve(entry.file) === target) cache.delete(token);
        }
        return json({ ok: true, file: target, backup });
      } catch (error) {
        return fail('write-failed', error instanceof Error ? error.message : String(error));
      }
    });

  register('/api/dsh-doc-review?action=html-text', 'GET', async (request) => {
    const url = new URL(request.url, 'http://x');
    const raw = url.searchParams.get('path');
    if (raw === null || raw === '') return fail('bad-request', 'path is required', 400);
    try {
      const target = await resolveTarget(raw, url.searchParams.get('sessionId') ?? '');
      const result = await runPython(HTML_TOOL, ['extract', target]);
      return json({ ok: true, file: result.file, nodes: result.nodes ?? [] });
    } catch (error) {
      return fail('html-text-failed', error instanceof Error ? error.message : String(error));
    }
  });

  /** Write the edited text of an HTML report back into the file. */
  register('/api/dsh-doc-review?action=html-apply', 'POST', async (request) => {
    let body;
    try {
      body = await request.json();
    } catch (error) {
      return fail('bad-request', error instanceof Error ? error.message : 'bad body', 400);
    }
    if (typeof body?.path !== 'string' || body.path === '') {
      return fail('bad-request', 'path is required', 400);
    }
    const edits = Array.isArray(body?.edits) ? body.edits : [];
    if (edits.length === 0) return fail('bad-request', 'edits must be a non-empty list', 400);
    try {
      const target = await resolveTarget(body.path, body.sessionId ?? '');
      const result = await runPython(HTML_TOOL, ['apply', target], { edits });
      for (const [token, entry] of cache) {
        if (resolve(entry.file) === target) cache.delete(token);
      }
      return json({ ok: true, file: result.file, applied: result.applied, backup: result.backup });
    } catch (error) {
      return fail('write-failed', error instanceof Error ? error.message : String(error));
    }
  });

  register('/api/dsh-doc-review?action=credential', 'GET', async (request) => {
    const url = new URL(request.url, 'http://x');
    const base = url.searchParams.get('base') ?? '';
    if (base === '') return fail('bad-request', 'base is required', 400);
    try {
      const tokenized = await connection.authenticatedUrl(base);
      return json({ ok: true, url: tokenized });
    } catch (error) {
      return fail('credential-failed', error instanceof Error ? error.message : String(error));
    }
  });

    /**
     * A self-check the browser can call.
     *
     * It answers with what the Host resolved for the panel's own routes, so a
     * failure to reach one is visible in the page itself instead of only in a
     * blank panel. It does not render the document: the panel is already
     * asking for it, and a second conversion of the same file would only make
     * both of them slower.
     */
    /**
   * The words of a document, without where they sit.
   *
   * The text view only needs the paragraphs themselves, and reading them
   * costs a fraction of the seconds a PDF match takes.
   */
  register('/api/dsh-doc-review?action=text-only', 'GET', async (request) => {
    const url = new URL(request.url, 'http://x');
    const raw = url.searchParams.get('path');
    if (raw === null || raw === '') return fail('bad-request', 'path is required', 400);
    try {
      const target = await resolveTarget(raw, url.searchParams.get('sessionId') ?? '');
      const result = await runPython(TEXTBLOCKS_TOOL, [target, '--text-only']);
      return json({ ok: true, file: result.file, blocks: result.blocks ?? [] });
    } catch (error) {
      return fail('text-only-failed', error instanceof Error ? error.message : String(error));
    }
  });

  register('/api/dsh-doc-review?action=selfcheck', 'GET', async (request) => {
      const url = new URL(request.url, 'http://x');
      const results = { routes: [...apiRoutes.keys()] };
      results.registered = String(apiRoutes.size);
      results.channel = apiFetch === null ? 'none' : 'connected';
      const target = url.searchParams.get('path') ?? '';
      if (target !== '') {
        results.render = 'asked by the panel';
        try {
          const layer = await runWithRenderer(TEXTBLOCKS_TOOL, resolve(target));
          results.textLayer = `ok, ${String((layer.blocks ?? []).length)} paragraphs`;
        } catch (error) {
          results.textLayer = `failed: ${error instanceof Error ? error.message : String(error)}`;
        }
      }
      return json({ ok: true, results });
    });

    register(REPORT, 'POST', async (request) => {
      let body;
      try {
        body = await request.json();
      } catch {
        // The browser may report through the query string instead of a body.
        const url = new URL(request.url, 'http://x');
        body = Object.fromEntries(url.searchParams.entries());
      }
      const line = `${new Date().toISOString()} ${JSON.stringify(body)}\n`;
      try {
        const home = process.env.DSH_HOME;
        if (typeof home === 'string' && home !== '') {
          const dir = join(home, 'doc-review');
          await mkdir(dir, { recursive: true });
          // A probe names its own file, so its noise never buries a real
          // failure in the panel's report.
          const name = process.env.DSH_DOC_REVIEW_REPORT ?? 'client-report.log';
          await writeFile(join(dir, name), line, { flag: 'a' });
        }
      } catch { /* reporting must never break the panel */ }
      return json({ ok: true });
    });
  };

  if (apiFetch !== null) {
    registerRoutes();
    claimRoute();
    ctx.logger?.info?.('doc-review: claimed /api/dsh-doc-review');
  } else {
    ctx.inject(['connection'], (scope) => {
      const service = scope?.connection;
      if (service === undefined || typeof service.fetch?.register !== 'function') {
        ctx.logger?.error?.('doc-review: connection.fetch is unavailable — no route was registered');
        return;
      }
      apiFetch = service.fetch;
      registerRoutes();
      claimRoute();
      ctx.logger?.info?.('doc-review: claimed /api/dsh-doc-review');
    });
  }
}
