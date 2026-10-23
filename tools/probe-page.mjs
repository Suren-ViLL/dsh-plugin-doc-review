/**
 * The page the client probe drives.
 *
 * It loads the plugin's real client module, gives it a stub of the Harness
 * client runtime, and renders the body cell the plugin registered. Every
 * element type is checked, so an invalid one is reported by name.
 */
const target = '__TARGET__';

const page = `<!doctype html>
<html><head><base href="./"><meta charset="utf-8"></head>
<body style="margin:0;height:100vh;overflow:hidden">
<div id="root" style="height:100%"></div>
<script src="react.js"></script>
<script src="react-dom.js"></script>
<script>
window.__errors = [];
window.onerror = (message) => { window.__errors.push(String(message)); };
</script>
<script>
const registry = new Map();
window.__ModuleLoader__ = {
  load(definition) { registry.set(definition.id, definition); window.__loaded = definition; },
};
window.__host = {
  slots: {
    register(cell, render) { (window.__slots = window.__slots || []).push({ cell, render }); return () => {}; },
    inject(key, fn) { (window.__injected = window.__injected || []).push([key, fn]); return () => {}; },
  },
  locale: { register() { return () => {}; }, bind: () => (k) => k },
  get(name) {
    if (name === 'documentPreviews') {
      return {
        registered: new Map(),
        getSnapshot() { return [...this.registered.values()]; },
        register(definition) { this.registered.set(definition.id, definition); return () => this.registered.delete(definition.id); },
      };
    }
    return undefined;
  },
  inject(deps, fn) { (window.__hostInject = window.__hostInject || []).push([deps, fn]); return () => {}; },
  effect(fn) { const d = fn(); return () => { if (typeof d === 'function') d(); }; },
  logger: { warn() {}, error() {} },
};
</script>
<script src="client.js"></script>
<script>
(async () => {
  try {
    const React = window.React;
    const original = React.createElement;
    React.createElement = function (type, ...rest) {
      if (typeof type !== 'string' && typeof type !== 'function') {
        const stack = (new Error().stack || '').split('\\n').slice(1, 4).join(' | ');
        window.__errors.push('bad element type: ' + String(type) + ' @ ' + stack);
        return original.call(this, 'div', ...rest);
      }
      return original.call(this, type, ...rest);
    };
    const root = window.ReactDOM.createRoot(document.getElementById('root'));
    const def = window.__loaded;
    const factory = (name) => {
      if (name === 'react') return React;
      if (name === 'react-dom') return window.ReactDOM;
      throw new Error('unknown module: ' + name);
    };
    const exported = def.factory(factory);
    exported.apply(window.__host);
    for (const entry of (window.__injected || [])) {
      try { entry[1](); } catch (e) { window.__errors.push('inject ' + entry[0] + ': ' + e.message); }
    }
    for (const entry of (window.__hostInject || [])) {
      try { entry[1](window.__host); } catch (e) { window.__errors.push('hostInject ' + entry[0] + ': ' + e.message); }
    }
    const body = (window.__slots || []).find((c) => c.cell.name === 'sidebar.right.tab.document');
    if (!body) { window.__errors.push('no body cell registered'); window.__done = true; return; }
    window.__bodyType = typeof body.render;
    const props = {
      resourceAddress: 'dsh-resource://file/absolute/' + ${JSON.stringify(target)}.split('/').map((s) => encodeURIComponent(s).replace(/%3A/gi, ':')).join('/'),
      content: { kind: 'renderer', revision: 1, loaded() {}, failed() {}, reload() {} },
      wrap: false,
    };
    root.render(React.createElement(body.render, props));
    await new Promise((r) => setTimeout(r, 9000));
  } catch (e) {
    window.__errors.push('fatal: ' + (e && e.stack ? e.stack : String(e)));
  }
  window.__done = true;
})();
</script>
</body></html>`;

export default page;
