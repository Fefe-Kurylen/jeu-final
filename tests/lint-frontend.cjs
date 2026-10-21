// Static check of the frontend (npm run lint): every identifier used must be declared somewhere in the shared
// global scope (all files share one scope in index.html), be a browser global, or a Capacitor/plugin global.
// This is the check that catches a typo like "u.unitKey" in a function where only "unitKey" exists.
const path = require('path');
const fs = require('fs');
let ESLint;
try { ({ ESLint } = require('eslint')); } catch (e) { ({ ESLint } = require(path.join(process.env.ESLINT_HOME || '/opt/node-tools/node_modules', 'eslint'))); }
const root = path.join(__dirname, '..', 'frontend');
const files = ['js/shared/terrain.js', 'js/analytics.js', 'js/store.js', 'js/mobile.js', ...fs.readdirSync(root + '/js/app').filter(f => f.endsWith('.js')).sort().map(f => 'js/app/' + f), 'js/map.js'].map(f => path.join(root, f));
// Top-level declarations of every file become shared globals
const declared = new Set();
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  for (const m of src.matchAll(/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm)) declared.add(m[1]);
  // "let a = 1, b = f(x, y), c;" at top level: identifiers are the names right after the keyword or after a top-level comma
  for (const m of src.matchAll(/^(?:let|const|var)\s+([^;\n]+)/gm)) {
    let depth = 0, expectName = true, buf = '';
    for (const ch of m[1] + ',') {
      if ('([{'.includes(ch)) depth++; else if (')]}'.includes(ch)) depth--;
      if (depth === 0 && ch === ',') { if (buf) declared.add(buf); buf = ''; expectName = true; continue; }
      if (expectName) { if (/[A-Za-z_$\w]/.test(ch) && depth === 0) buf += ch; else if (buf) expectName = false; }
    }
    if (buf) declared.add(buf);   // "const X = {" spanning several lines
  }
  for (const m of src.matchAll(/\bwindow\.([A-Za-z_$][\w$]*)\s*=[^=]/g)) declared.add(m[1]);
}
const inlineHtml = fs.readFileSync(root + '/index.html', 'utf8');
for (const m of inlineHtml.matchAll(/(?:let|const|var|function)\s+([A-Za-z_$][\w$]*)/g)) declared.add(m[1]);
const globals = Object.fromEntries([...declared].map(n => [n, 'writable']));
(async () => {
  const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: [{
      files: ['**/*.js'],
      languageOptions: { ecmaVersion: 2022, sourceType: 'script', globals: { ...globals, Terrain: 'readonly', module: 'readonly', window: 'readonly', document: 'readonly', navigator: 'readonly', localStorage: 'readonly', sessionStorage: 'readonly', fetch: 'writable', console: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly', setInterval: 'readonly', clearInterval: 'readonly', requestAnimationFrame: 'readonly', cancelAnimationFrame: 'readonly', performance: 'readonly', Image: 'readonly', AbortController: 'readonly', URL: 'readonly', URLSearchParams: 'readonly', Blob: 'readonly', FileReader: 'readonly', Intl: 'readonly', CanvasRenderingContext2D: 'readonly', OffscreenCanvas: 'readonly', HTMLCanvasElement: 'readonly', HTMLElement: 'readonly', Element: 'readonly', Node: 'readonly', MutationObserver: 'readonly', ResizeObserver: 'readonly', IntersectionObserver: 'readonly', devicePixelRatio: 'readonly', screen: 'readonly', location: 'readonly', history: 'readonly', alert: 'readonly', confirm: 'readonly', prompt: 'readonly', getComputedStyle: 'readonly', matchMedia: 'readonly', Audio: 'readonly', Event: 'readonly', CustomEvent: 'readonly', KeyboardEvent: 'readonly', TouchEvent: 'readonly', PointerEvent: 'readonly', Capacitor: 'readonly', Path2D: 'readonly', ImageData: 'readonly', createImageBitmap: 'readonly', structuredClone: 'readonly', queueMicrotask: 'readonly', globalThis: 'readonly', self: 'readonly', crypto: 'readonly', atob: 'readonly', btoa: 'readonly', TextEncoder: 'readonly', TextDecoder: 'readonly', WebSocket: 'readonly', Notification: 'readonly', visualViewport: 'readonly', innerWidth: 'readonly', innerHeight: 'readonly', scrollTo: 'readonly', open: 'readonly', close: 'readonly', addEventListener: 'readonly', removeEventListener: 'readonly', dispatchEvent: 'readonly', requestIdleCallback: 'readonly', DOMParser: 'readonly', FormData: 'readonly', Headers: 'readonly', Request: 'readonly', Response: 'readonly', AbortSignal: 'readonly', Worker: 'readonly', ImageBitmap: 'readonly', WebGLRenderingContext: 'readonly', DOMMatrix: 'readonly', Touch: 'readonly', MouseEvent: 'readonly', WheelEvent: 'readonly', DragEvent: 'readonly', HTMLImageElement: 'readonly', HTMLInputElement: 'readonly', Promise: 'readonly', Map: 'readonly', Set: 'readonly', WeakMap: 'readonly', Symbol: 'readonly', Proxy: 'readonly', Reflect: 'readonly', JSON: 'readonly', Math: 'readonly', Date: 'readonly', Number: 'readonly', String: 'readonly', Array: 'readonly', Object: 'readonly', Error: 'readonly', RegExp: 'readonly', parseInt: 'readonly', parseFloat: 'readonly', isNaN: 'readonly', isFinite: 'readonly', encodeURIComponent: 'readonly', decodeURIComponent: 'readonly', Boolean: 'readonly', Infinity: 'readonly', NaN: 'readonly', undefined: 'readonly', Function: 'readonly', Uint8Array: 'readonly', Uint8ClampedArray: 'readonly', Float32Array: 'readonly', Int32Array: 'readonly', Uint32Array: 'readonly', ArrayBuffer: 'readonly', DataView: 'readonly' } },
      rules: { 'no-undef': 'error', 'no-unused-vars': 'off', 'no-redeclare': 'off', 'no-dupe-keys': 'error', 'no-dupe-args': 'error', 'no-unreachable': 'warn', 'no-constant-condition': 'off', 'use-isnan': 'error', 'valid-typeof': 'error', 'no-self-assign': 'warn', 'no-func-assign': 'error', 'no-import-assign': 'error', 'no-const-assign': 'error', 'no-dupe-else-if': 'error', 'no-duplicate-case': 'error', 'no-empty-pattern': 'error', 'no-obj-calls': 'error', 'no-unsafe-negation': 'error', 'no-loss-of-precision': 'error', 'no-sparse-arrays': 'error', 'no-unexpected-multiline': 'error', 'no-cond-assign': 'warn' }
    }]
  });
  const results = await eslint.lintFiles(files);
  let errors = 0;
  for (const r of results) for (const m of r.messages) { if (m.severity === 2) errors++; console.log(`${m.severity === 2 ? 'ERR ' : 'warn'} ${path.relative(root, r.filePath)}:${m.line}:${m.column} ${m.ruleId} ${m.message}`); }
  console.log(`\n${errors} error(s), ${declared.size} shared globals`);
  process.exit(errors ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
