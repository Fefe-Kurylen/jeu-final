#!/usr/bin/env node
// ============================================================================
// build-assets.cjs — ressources vectorielles de l'application, générées depuis le code :
//   - terrain/<grass|dirt|sand|snow>.svg : tuiles 128×128 répétables (sols des vues ville, champs, carte)
//   - ui/<close|info|left|right|menu|minus|plus|moon|sun>.svg : glyphes d'interface
//   - logo.svg, logo-text.svg, splash.svg ; avec --png : icône 1024, icônes de lanceur et splashs Android/iOS
// Les sprites 2.5D du jeu (bâtiments, champs, carte, figurines, icônes 3D, habillage, scènes) sont rendus en 3D
// par tools/build-3d.cjs dans frontend/assets/images/3d/.
//
//   node tools/build-assets.cjs            -> SVG seulement (aucune dépendance)
//   node tools/build-assets.cjs --png      -> rend aussi les PNG avec Playwright (chromium)
// ============================================================================
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'frontend', 'assets', 'images');
const WANT_PNG = process.argv.includes('--png');

// ---------------------------------------------------------------------------
// Primitives SVG
// ---------------------------------------------------------------------------

const f1 = (v) => (Math.round(v * 10) / 10).toString();
const pts = (arr) => arr.map(p => `${f1(p[0])},${f1(p[1])}`).join(' ');
const poly = (arr, fill, extra = '') => `<polygon points="${pts(arr)}" fill="${fill}" ${extra}/>`;
const ell = (x, y, rx, ry, fill, extra = '') => `<ellipse cx="${f1(x)}" cy="${f1(y)}" rx="${f1(rx)}" ry="${f1(ry)}" fill="${fill}" ${extra}/>`;
const rect = (x, y, w, h, fill, extra = '') => `<rect x="${f1(x)}" y="${f1(y)}" width="${f1(w)}" height="${f1(h)}" fill="${fill}" ${extra}/>`;
const circ = (x, y, r, fill, extra = '') => `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r)}" fill="${fill}" ${extra}/>`;
const line = (x1, y1, x2, y2, stroke, w = 1.5, extra = '') => `<line x1="${f1(x1)}" y1="${f1(y1)}" x2="${f1(x2)}" y2="${f1(y2)}" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round" ${extra}/>`;

// Deterministic pseudo-random so that every build produces the same files
let seed = 1;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const resetSeed = (s) => { seed = s; };

// Style « peint » : trait brun, lumière chaude
const STYLE = { line: '#3a2414', lineW: 0.9, lineOp: 0.62, hi: '#fff6d8' };
const OL = (w = STYLE.lineW, op = STYLE.lineOp) => `stroke="${STYLE.line}" stroke-width="${f1(w)}" stroke-opacity="${op}" stroke-linejoin="round" stroke-linecap="round"`;

// Per-document gradient store, emitted by svgDoc / mapSvg through takeDefs()
const _defs = new Map();
function grad(c1, c2, x1 = 0, y1 = 0, x2 = 0, y2 = 1) {
  const key = `l|${c1}|${c2}|${x1},${y1},${x2},${y2}`;
  if (!_defs.has(key)) { const id = `g${_defs.size}`; _defs.set(key, { id, markup: `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient>` }); }
  return `url(#${_defs.get(key).id})`;
}
function rgrad(c1, c2, cx = 0.5, cy = 0.5, r = 0.7) {
  const key = `r|${c1}|${c2}|${cx},${cy},${r}`;
  if (!_defs.has(key)) { const id = `g${_defs.size}`; _defs.set(key, { id, markup: `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></radialGradient>` }); }
  return `url(#${_defs.get(key).id})`;
}
function takeDefs() { const out = [..._defs.values()].map(d => d.markup).join(''); _defs.clear(); return out; }

const DEFS = `<defs>
  <pattern id="gtex" width="6" height="6" patternUnits="userSpaceOnUse"><circle cx="1.5" cy="1.5" r="0.8" fill="#000" opacity="0.18"/><circle cx="4.5" cy="4" r="0.6" fill="#fff" opacity="0.18"/></pattern>
  <pattern id="stripes" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="4" height="8" fill="#fff" opacity="0.35"/></pattern>
  <linearGradient id="ao" x1="0" y1="0" x2="0" y2="1"><stop offset="0.55" stop-color="#1a0e04" stop-opacity="0"/><stop offset="1" stop-color="#1a0e04" stop-opacity="0.3"/></linearGradient>
  <pattern id="stonetex" width="12" height="7" patternUnits="userSpaceOnUse"><path d="M0,3.5 h12 M6,0 v3.5 M0,3.5 v3.5 M12,3.5 v3.5" stroke="#000" stroke-width="0.9" fill="none" opacity="0.16"/></pattern>
  <pattern id="marbletex" width="16" height="16" patternUnits="userSpaceOnUse"><path d="M0,10 q4,-3 8,0 t8,0 M-2,3 q5,2 10,-1 t8,1" stroke="#000" stroke-width="0.6" fill="none" opacity="0.08"/></pattern>
  <pattern id="sandtex" width="14" height="8" patternUnits="userSpaceOnUse"><path d="M0,4 h14 M7,0 v4 M0,4 v4 M14,4 v4" stroke="#000" stroke-width="0.8" fill="none" opacity="0.13"/></pattern>
  <pattern id="hidetex" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M0,5 h10" stroke="#000" stroke-width="0.7" opacity="0.16" stroke-dasharray="1.5 2"/><path d="M5,0 v10" stroke="#000" stroke-width="0.7" opacity="0.1" stroke-dasharray="1.5 2"/></pattern>
  <pattern id="plastertex" width="9" height="9" patternUnits="userSpaceOnUse"><circle cx="2" cy="3" r="0.6" fill="#000" opacity="0.08"/><circle cx="6.5" cy="7" r="0.5" fill="#fff" opacity="0.14"/></pattern>
  <pattern id="thatchtex" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(75)"><path d="M0,3 h6" stroke="#000" stroke-width="0.9" opacity="0.16"/><path d="M0,0.8 h6" stroke="#fff" stroke-width="0.5" opacity="0.12"/></pattern>
  <pattern id="mosaictex" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="2" height="2" fill="#fff" opacity="0.3"/><rect x="2" y="2" width="2" height="2" fill="#000" opacity="0.14"/></pattern>
  <pattern id="tiletex" width="6" height="4" patternUnits="userSpaceOnUse"><path d="M0,4 a3,3 0 0 1 6,0" stroke="#000" stroke-width="0.6" fill="none" opacity="0.14"/></pattern>
  <pattern id="planktex" width="12" height="5" patternUnits="userSpaceOnUse"><path d="M0,2.5 h12" stroke="#000" stroke-width="0.9" opacity="0.18"/><path d="M0,4.6 h12" stroke="#fff" stroke-width="0.6" opacity="0.12"/></pattern>
</defs>`;

function writeFile(p, content) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, content); }

// ---------------------------------------------------------------------------
// Tuiles de terrain
// ---------------------------------------------------------------------------
// Seamless 128×128 terrain tiles: every element is drawn again shifted by ±128 so the edges match
function terrainTile(kind) {
  const T = 128;
  const spec = {
    grass: { base: '#6aa63c', blobs: ['#5e9a32', '#7cb848', '#8ac656', '#558e2c'], tufts: '#3f7a22', dots: ['#f4e27a', '#f8f8f8'] },
    dirt: { base: '#b08a5c', blobs: ['#a07a4c', '#bf9a6c', '#c8a878', '#946e42'], tufts: '#7a5a34', dots: ['#8a8a86', '#6a5a4a'] },
    sand: { base: '#dcc38a', blobs: ['#d2b87c', '#e6d09a', '#ecd8a4', '#c9ad6e'], tufts: '#b89a5e', dots: ['#f6e8b8', '#a88a50'] },
    snow: { base: '#eef3f8', blobs: ['#e2eaf2', '#f6f9fc', '#dbe4ee', '#ffffff'], tufts: '#c0cfdc', dots: ['#ffffff', '#b8c8d8'] }
  }[kind];
  resetSeed({ grass: 21, dirt: 33, sand: 45, snow: 57 }[kind] || 11);
  let inner = '';
  const put = (fn) => { for (const dx of [-T, 0, T]) for (const dy of [-T, 0, T]) inner += fn(dx, dy); };
  for (let i = 0; i < 26; i++) { const x = rnd() * T, y = rnd() * T, rx = 8 + rnd() * 18, ry = rx * (0.35 + rnd() * 0.3), c = spec.blobs[i % spec.blobs.length], rot = rnd() * 180; put((dx, dy) => `<ellipse cx="${f1(x + dx)}" cy="${f1(y + dy)}" rx="${f1(rx)}" ry="${f1(ry)}" fill="${c}" opacity="0.5" transform="rotate(${f1(rot)} ${f1(x + dx)} ${f1(y + dy)})"/>`); }
  for (let i = 0; i < (kind === 'grass' ? 70 : 24); i++) { const x = rnd() * T, y = rnd() * T, h = 2.5 + rnd() * 3; put((dx, dy) => kind === 'grass' ? `<path d="M${f1(x + dx - 2)},${f1(y + dy)} q1,${f1(-h)} 2,0 q1,${f1(-h - 1)} 2,0" stroke="${spec.tufts}" stroke-width="1" fill="none" opacity="0.6"/>` : kind === 'sand' ? `<path d="M${f1(x + dx - 5)},${f1(y + dy)} q5,-2.5 10,0" stroke="${spec.tufts}" stroke-width="0.9" fill="none" opacity="0.45"/>` : `<ellipse cx="${f1(x + dx)}" cy="${f1(y + dy)}" rx="${f1(h * 0.5)}" ry="${f1(h * 0.3)}" fill="${spec.tufts}" opacity="${kind === 'snow' ? 0.35 : 0.5}"/>`); }
  for (let i = 0; i < 10; i++) { const x = rnd() * T, y = rnd() * T, c = spec.dots[i % spec.dots.length]; put((dx, dy) => `<circle cx="${f1(x + dx)}" cy="${f1(y + dy)}" r="1.1" fill="${c}" opacity="0.7"/>`); }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${T} ${T}" width="${T}" height="${T}"><rect width="${T}" height="${T}" fill="${spec.base}"/>${inner}</svg>\n`;
}


// ---------------------------------------------------------------------------
// Glyphes d'interface (64×64) -> frontend/assets/images/ui/<nom>.svg ; les icônes figuratives sont en 3D (assets/images/3d/ui)
// ---------------------------------------------------------------------------
const GOLD = '#e8c547', GOLD_D = '#9a6a14', LEATHER = '#8a5a30';
const I = {};
const ring = (x, y, r, c, w = 2) => circ(x, y, r, 'none', `stroke="${c}" stroke-width="${w}"`);
I.close = () => circ(32, 32, 22, grad('#c0241e', '#7a1a14', 0, 0, 0, 1), OL(1.8)) + line(22, 22, 42, 42, '#fff6d8', 4.5) + line(42, 22, 22, 42, '#fff6d8', 4.5);
I.left = () => `<path d="M40,12 L18,32 L40,52" fill="none" stroke="${STYLE.line}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/><path d="M40,12 L18,32 L40,52" fill="none" stroke="${GOLD}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`;
I.right = () => `<path d="M24,12 L46,32 L24,52" fill="none" stroke="${STYLE.line}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/><path d="M24,12 L46,32 L24,52" fill="none" stroke="${GOLD}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`;
I.menu = () => { let o = ''; for (const [x, y] of [[20, 20], [44, 20], [20, 44], [44, 44]]) o += rect(x - 8, y - 8, 16, 16, grad('#ffe08a', '#c9a227', 0, 0, 0, 1), OL(1.6) + ' rx="4"'); return o; };
I.sun = () => { let o = ''; for (let i = 0; i < 8; i++) o += line(32 + Math.cos(i * Math.PI / 4) * 20, 32 + Math.sin(i * Math.PI / 4) * 20, 32 + Math.cos(i * Math.PI / 4) * 27, 32 + Math.sin(i * Math.PI / 4) * 27, '#f0c940', 3.5); return o + circ(32, 32, 14, rgrad('#fff4b0', '#f0b020', 0.4, 0.35, 0.7), OL(1.6)); };
I.moon = () => `<path d="M34,8 A24,24 0 1 0 34,56 A30,30 0 1 1 34,8 z" fill="${grad('#f6f0d8', '#c8c0a0', 0, 0, 0, 1)}" ${OL(1.6)}/>` + circ(50, 14, 2, '#fff6d8') + circ(56, 28, 1.5, '#fff6d8') + circ(48, 44, 1.2, '#fff6d8');
I.plus = () => circ(32, 32, 22, grad('#5ab040', '#2f7a2a', 0, 0, 0, 1), OL(1.8)) + line(20, 32, 44, 32, '#fff6d8', 5) + line(32, 20, 32, 44, '#fff6d8', 5);
I.minus = () => circ(32, 32, 22, grad('#c0241e', '#7a1a14', 0, 0, 0, 1), OL(1.8)) + line(20, 32, 44, 32, '#fff6d8', 5);
I.info = () => circ(32, 32, 22, grad('#4a7fb8', '#2d5c9c', 0, 0, 0, 1), OL(1.8)) + circ(32, 21, 3.5, '#fff6d8') + rect(28.5, 28, 7, 20, '#fff6d8', 'rx="2"');
function iconDoc(inner) { return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" shape-rendering="geometricPrecision">${DEFS}<defs>${takeDefs()}</defs>${inner}</svg>\n`; }
function buildIcons() {
  let n = 0;
  for (const [name, fn] of Object.entries(I)) { resetSeed(13); CUR = null; const inner = fn(); writeFile(path.join(OUT, 'ui', `${name}.svg`), iconDoc(inner)); n++; }
  writeFile(path.join(OUT, 'ui', 'manifest.json'), JSON.stringify({ icons: Object.keys(I), size: 64 }, null, 2));
  return n;
}


// ---------------------------------------------------------------------------
// Logo, icône et splash
// ---------------------------------------------------------------------------
function laurel(cx, cy, r, side) {
  const a0 = 100 * Math.PI / 180, a1 = -40 * Math.PI / 180;
  const px = (a) => cx + side * r * Math.cos(a), py = (a) => cy + r * Math.sin(a);
  let out = `<path d="M${f1(px(a0))},${f1(py(a0))} A${f1(r)},${f1(r)} 0 0 ${side === 1 ? 0 : 1} ${f1(px(a1))},${f1(py(a1))}" stroke="#a8842a" stroke-width="${f1(r * 0.045)}" fill="none" stroke-linecap="round"/>`;
  const n = 9, len = r * 0.21, wid = r * 0.08;
  const leaf = (x, y, ang, fill) =>
    `<path d="M0,0 q${f1(len * 0.5)},${f1(-wid)} ${f1(len)},0 q${f1(-len * 0.5)},${f1(wid)} ${f1(-len)},0 z" fill="${fill}" transform="translate(${f1(x)},${f1(y)}) rotate(${f1(ang)})"/>` +
    `<path d="M0,0 l${f1(len * 0.8)},0" stroke="#8a6414" stroke-width="${f1(wid * 0.18)}" opacity="0.7" transform="translate(${f1(x)},${f1(y)}) rotate(${f1(ang)})"/>`;
  for (let i = 0; i < n; i++) {
    const a = a0 + (a1 - a0) * (i + 0.5) / n;
    const x = px(a), y = py(a);
    const dir = Math.atan2(-Math.cos(a), side * Math.sin(a)) * 180 / Math.PI;   // direction of the branch (upwards)
    out += leaf(x, y, dir + side * 40, '#c9a227') + leaf(x, y, dir - side * 40, '#e2c04a');
  }
  return out;
}
// Corinthian helmet in profile, facing left: bowl, neck guard, cheek guard, eye slit, red crest
function helmet(cx, cy, s) {
  const t = (x, y) => `${f1(cx + x * s)},${f1(cy + y * s)}`;
  const edge = '#5a3e0a', sw = f1(s * 0.016);
  let out = `<path d="M${t(-0.30, -0.36)} C${t(-0.18, -0.92)} ${t(0.40, -1.02)} ${t(0.70, -0.46)} C${t(0.80, -0.26)} ${t(0.74, -0.04)} ${t(0.58, 0.10)} L${t(0.50, 0.0)} C${t(0.60, -0.26)} ${t(0.46, -0.64)} ${t(0.08, -0.62)} C${t(-0.06, -0.60)} ${t(-0.18, -0.50)} ${t(-0.24, -0.40)} Z" fill="#b8261a" stroke="#6a1410" stroke-width="${sw}"/>`;
  for (let i = 1; i <= 6; i++) {   // plume strands
    const u = i / 7;
    out += `<path d="M${t(-0.24 + 0.72 * u, -0.42 - 0.22 * Math.sin(u * Math.PI))} L${t(-0.26 + 0.92 * u, -0.50 - 0.50 * Math.sin(u * Math.PI))}" stroke="#7a1a10" stroke-width="${f1(s * 0.012)}" opacity="0.55"/>`;
  }
  out += `<path d="M${t(-0.46, 0.02)} C${t(-0.48, -0.60)} ${t(0.48, -0.60)} ${t(0.46, 0.02)} Z" fill="url(#gold)" stroke="${edge}" stroke-width="${sw}"/>`;   // bowl
  out += `<path d="M${t(0.24, -0.02)} L${t(0.46, -0.02)} L${t(0.62, 0.30)} C${t(0.62, 0.38)} ${t(0.50, 0.40)} ${t(0.44, 0.34)} L${t(0.28, 0.12)} Z" fill="url(#gold)" stroke="${edge}" stroke-width="${sw}"/>`;   // neck guard
  out += `<path d="M${t(-0.46, 0.0)} L${t(-0.10, 0.0)} L${t(-0.08, 0.32)} C${t(-0.08, 0.50)} ${t(-0.22, 0.58)} ${t(-0.34, 0.54)} L${t(-0.42, 0.34)} Z" fill="url(#gold)" stroke="${edge}" stroke-width="${sw}"/>`;   // cheek guard
  out += `<ellipse cx="${f1(cx - 0.30 * s)}" cy="${f1(cy + 0.10 * s)}" rx="${f1(s * 0.11)}" ry="${f1(s * 0.045)}" fill="#1a1208" transform="rotate(-12 ${f1(cx - 0.30 * s)} ${f1(cy + 0.10 * s)})"/>`;   // eye slit
  out += `<path d="M${t(-0.30, -0.38)} Q${t(0.04, -0.66)} ${t(0.40, -0.34)}" stroke="#8a6414" stroke-width="${f1(s * 0.05)}" fill="none" stroke-linecap="round"/>`;   // crest holder
  out += `<path d="M${t(-0.36, -0.10)} Q${t(-0.22, -0.46)} ${t(0.06, -0.52)}" stroke="#fff3c0" stroke-width="${f1(s * 0.03)}" fill="none" stroke-linecap="round" opacity="0.55"/>`;   // highlight
  return out;
}
function logoSvg(size, withText = false, bg = true) {
  // With the title underneath, the medallion is smaller and raised to leave room for the text
  const cx = size / 2, cy = withText ? size * 0.40 : size / 2, r = size * (withText ? 0.35 : 0.44);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
<defs>
  <radialGradient id="bg" cx="0.5" cy="0.42" r="0.7"><stop offset="0" stop-color="#3a3228"/><stop offset="0.7" stop-color="#1f1a12"/><stop offset="1" stop-color="#120e08"/></radialGradient>
  <linearGradient id="gold" x1="0" y1="0" x2="0.3" y2="1"><stop offset="0" stop-color="#ffe08a"/><stop offset="0.45" stop-color="#d4af37"/><stop offset="1" stop-color="#8a6414"/></linearGradient>
</defs>
${bg ? `<circle cx="${cx}" cy="${cy}" r="${r + size * 0.04}" fill="url(#bg)"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="url(#gold)" stroke-width="${f1(size * 0.025)}"/><circle cx="${cx}" cy="${cy}" r="${f1(r * 0.93)}" fill="none" stroke="#8a6414" stroke-width="${f1(size * 0.006)}" opacity="0.7"/>` : ''}
${laurel(cx, cy, r * 0.74, 1)}${laurel(cx, cy, r * 0.74, -1)}
${helmet(cx, cy + size * 0.02, size * 0.34)}
${withText ? `<text x="${cx}" y="${f1(size * 0.86)}" text-anchor="middle" font-family="Cinzel, 'Times New Roman', serif" font-weight="700" font-size="${f1(size * 0.075)}" fill="url(#gold)" letter-spacing="${f1(size * 0.006)}">IMPERIVM ANTIQVITAS</text>` : ''}
</svg>
`;
}
function splashSvg(w, h) {
  const s = Math.min(w, h);
  const logo = logoSvg(s * 0.52, false, true).replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').replace(/<defs>[\s\S]*?<\/defs>/, '');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
<defs>
  <radialGradient id="sbg" cx="0.5" cy="0.45" r="0.75"><stop offset="0" stop-color="#2e2619"/><stop offset="1" stop-color="#120e08"/></radialGradient>
  <radialGradient id="bg" cx="0.5" cy="0.42" r="0.7"><stop offset="0" stop-color="#3a3228"/><stop offset="0.7" stop-color="#1f1a12"/><stop offset="1" stop-color="#120e08"/></radialGradient>
  <linearGradient id="gold" x1="0" y1="0" x2="0.3" y2="1"><stop offset="0" stop-color="#ffe08a"/><stop offset="0.45" stop-color="#d4af37"/><stop offset="1" stop-color="#8a6414"/></linearGradient>
</defs>
<rect width="${w}" height="${h}" fill="url(#sbg)"/>
<g transform="translate(${f1(w / 2 - s * 0.26)},${f1(h / 2 - s * 0.32)})">${logo}</g>
<text x="${f1(w / 2)}" y="${f1(h / 2 + s * 0.30)}" text-anchor="middle" font-family="Cinzel, 'Times New Roman', serif" font-weight="700" font-size="${f1(s * 0.062)}" fill="url(#gold)" letter-spacing="${f1(s * 0.008)}">IMPERIVM ANTIQVITAS</text>
<text x="${f1(w / 2)}" y="${f1(h / 2 + s * 0.355)}" text-anchor="middle" font-family="'Crimson Text', Georgia, serif" font-style="italic" font-size="${f1(s * 0.03)}" fill="#c9b07a">Conquérez. Dominez. Régnez.</text>
</svg>
`;
}


// ---------------------------------------------------------------------------
// Rendu PNG (Playwright / chromium)
// ---------------------------------------------------------------------------
async function renderPngs() {
  let chromium;
  try { ({ chromium } = require('playwright')); } catch (e) { console.error('playwright introuvable: npm i -D playwright (ou NODE_PATH vers une installation globale)'); process.exit(1); }
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 256, height: 256 }, deviceScaleFactor: 1 });
  async function shot(svg, w, h, file, transparent, pg = page) {
    await pg.setViewportSize({ width: w, height: h });
    await pg.setContent(`<!doctype html><html><body style="margin:0;background:${transparent ? 'transparent' : '#120e08'}">${svg}</body></html>`);
    await pg.screenshot({ path: file, omitBackground: transparent, clip: { x: 0, y: 0, width: w, height: h } });
  }
  let n = 0;
  // App icon
  const ANDROID = path.join(ROOT, 'android', 'app', 'src', 'main', 'res');
  const IOS = path.join(ROOT, 'ios', 'App', 'App', 'Assets.xcassets');
  await shot(logoSvg(1024), 1024, 1024, path.join(OUT, 'icon-1024.png'), false); n++;
  if (fs.existsSync(IOS)) { await shot(logoSvg(1024), 1024, 1024, path.join(IOS, 'AppIcon.appiconset', 'AppIcon-512@2x.png'), false); n++; }
  for (const [dir, size] of [['mipmap-mdpi', 48], ['mipmap-hdpi', 72], ['mipmap-xhdpi', 96], ['mipmap-xxhdpi', 144], ['mipmap-xxxhdpi', 192]]) {
    if (!fs.existsSync(path.join(ANDROID, dir))) continue;
    await shot(logoSvg(size), size, size, path.join(ANDROID, dir, 'ic_launcher.png'), false);
    await shot(logoSvg(size), size, size, path.join(ANDROID, dir, 'ic_launcher_round.png'), false);
    // adaptive foreground: 108dp canvas with the 72dp safe zone (logo scaled to 66%)
    const fg = Math.round(size * 2.25);
    await shot(`<svg xmlns="http://www.w3.org/2000/svg" width="${fg}" height="${fg}"><g transform="translate(${f1(fg * 0.17)},${f1(fg * 0.17)})">${logoSvg(fg * 0.66, false, true).replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '')}</g></svg>`, fg, fg, path.join(ANDROID, dir, 'ic_launcher_foreground.png'), true);
    n += 3;
  }
  // Splash screens
  if (fs.existsSync(IOS)) for (const f of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) { await shot(splashSvg(2732, 2732), 2732, 2732, path.join(IOS, 'Splash.imageset', f), false); n++; }
  const splashes = [['drawable', 480, 320], ['drawable-port-mdpi', 320, 480], ['drawable-port-hdpi', 480, 800], ['drawable-port-xhdpi', 720, 1280], ['drawable-port-xxhdpi', 960, 1600], ['drawable-port-xxxhdpi', 1280, 1920], ['drawable-land-mdpi', 480, 320], ['drawable-land-hdpi', 800, 480], ['drawable-land-xhdpi', 1280, 720], ['drawable-land-xxhdpi', 1600, 960], ['drawable-land-xxxhdpi', 1920, 1280]];
  for (const [dir, w, h] of splashes) { if (!fs.existsSync(path.join(ANDROID, dir))) continue; await shot(splashSvg(w, h), w, h, path.join(ANDROID, dir, 'splash.png'), false); n++; }
  await browser.close();
  return n;
}

(async () => {
  for (const kind of ['grass', 'dirt', 'sand', 'snow']) writeFile(path.join(OUT, 'terrain', `${kind}.svg`), terrainTile(kind));
  console.log(`4 tuiles de terrain, ${buildIcons()} glyphes d'interface (SVG)`);
  writeFile(path.join(OUT, 'logo.svg'), logoSvg(240, false, true));
  writeFile(path.join(OUT, 'logo-text.svg'), logoSvg(400, true, true));
  writeFile(path.join(OUT, 'splash.svg'), splashSvg(1024, 1024));
  console.log('logo, logo-text, splash (SVG)');
  if (WANT_PNG) console.log(`${await renderPngs()} PNG rendus (icônes, splash)`);
})().catch(e => { console.error(e); process.exit(1); });
