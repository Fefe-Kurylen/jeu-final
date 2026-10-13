#!/usr/bin/env node
// ============================================================================
// build-assets.cjs — every graphic asset of the game is generated from code:
//   - city view: 39 isometric building sprites × 6 faction palettes, 12 field sprites (SVG)
//   - world map: city / resource / unit sprites (SVG rendered to PNG)
//   - app: logo (SVG), launcher icons and splash screens for Android and iOS (PNG)
//
//   node tools/build-assets.cjs            -> SVG only (no dependency)
//   node tools/build-assets.cjs --png      -> also renders the PNGs with Playwright (chromium)
// ============================================================================
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'frontend', 'assets', 'images');
const WANT_PNG = process.argv.includes('--png');

// ---------------------------------------------------------------------------
// Isometric projection. Tile = 2×2 units, centre at (100,70), width 100, height 50
// ---------------------------------------------------------------------------
const CX = 100, CY = 70, UX = 25, UY = 12.5, UZ = 24;
const P = (ix, iy, iz = 0) => [CX + (ix - iy) * UX, CY + (ix + iy) * UY - iz * UZ];
const f1 = (v) => (Math.round(v * 10) / 10).toString();
const pts = (arr) => arr.map(p => `${f1(p[0])},${f1(p[1])}`).join(' ');
const poly = (arr, fill, extra = '') => `<polygon points="${pts(arr)}" fill="${fill}" ${extra}/>`;
const ell = (x, y, rx, ry, fill, extra = '') => `<ellipse cx="${f1(x)}" cy="${f1(y)}" rx="${f1(rx)}" ry="${f1(ry)}" fill="${fill}" ${extra}/>`;
const rect = (x, y, w, h, fill, extra = '') => `<rect x="${f1(x)}" y="${f1(y)}" width="${f1(w)}" height="${f1(h)}" fill="${fill}" ${extra}/>`;
const circ = (x, y, r, fill, extra = '') => `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r)}" fill="${fill}" ${extra}/>`;
const line = (x1, y1, x2, y2, stroke, w = 1.5, extra = '') => `<line x1="${f1(x1)}" y1="${f1(y1)}" x2="${f1(x2)}" y2="${f1(y2)}" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round" ${extra}/>`;

function shade(hex, pct) {
  const n = parseInt(hex.slice(1), 16);
  const c = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.max(0, Math.min(255, Math.round(v + (pct / 100) * 255))));
  return '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
}
// Deterministic pseudo-random so that every build produces the same files
let seed = 1;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const resetSeed = (s) => { seed = s; };

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------
const GROUND = {
  grass: ['#5c8a3c', '#4e7a32'], sand: ['#d8c48a', '#c4ae74'], stone: ['#9a948a', '#847e74'],
  dirt: ['#8a6a44', '#765836'], water: ['#3f7fbf', '#2f6aa8']
};
function ground(kind = 'grass', spread = 1) {
  const [c1, c2] = GROUND[kind] || GROUND.grass;
  const s = spread;
  return poly([P(-s, -s), P(s, -s), P(s, s), P(-s, s)], c1) +
    poly([P(-s, -s), P(s, -s), P(s, s), P(-s, s)], 'none', `stroke="${c2}" stroke-width="1.5"`) +
    `<polygon points="${pts([P(-s, -s), P(s, -s), P(s, s), P(-s, s)])}" fill="url(#gtex)" opacity="0.35"/>`;
}

// Box with footprint ix0..ix0+w, iy0..iy0+d and height h (units); c = base colour
function box(ix0, iy0, w, d, h, c, z0 = 0) {
  const top = shade(c, 22), left = shade(c, 0), right = shade(c, -18);
  const a = P(ix0, iy0 + d, z0), b = P(ix0 + w, iy0 + d, z0), cc = P(ix0 + w, iy0, z0);
  const a2 = P(ix0, iy0 + d, z0 + h), b2 = P(ix0 + w, iy0 + d, z0 + h), c2 = P(ix0 + w, iy0, z0 + h), d2 = P(ix0, iy0, z0 + h);
  return poly([a, b, b2, a2], left) + poly([b, cc, c2, b2], right) + poly([d2, c2, b2, a2], top) +
    `<polyline points="${pts([a2, b2, c2])}" fill="none" stroke="${shade(c, 35)}" stroke-width="1" opacity="0.6"/>`;
}
// Gable roof along x on top of a box (ridge parallel to ix)
function roofGable(ix0, iy0, w, d, z, rh, c) {
  const o = 0.12;
  const bl = P(ix0 - o, iy0 + d + o, z), br = P(ix0 + w + o, iy0 + d + o, z);
  const kl = P(ix0 - o, iy0 - o, z), kr = P(ix0 + w + o, iy0 - o, z);
  const rl = P(ix0 - o, iy0 + d / 2, z + rh), rr = P(ix0 + w + o, iy0 + d / 2, z + rh);
  return poly([kl, kr, rr, rl], shade(c, 12)) + poly([br, kr, rr], shade(c, -22)) + poly([bl, br, rr, rl], c) +
    line(rl[0], rl[1], rr[0], rr[1], shade(c, 30), 1.5);
}
// Hip / pyramid roof
function roofHip(ix0, iy0, w, d, z, rh, c) {
  const o = 0.12;
  const a = P(ix0 - o, iy0 + d + o, z), b = P(ix0 + w + o, iy0 + d + o, z), cc = P(ix0 + w + o, iy0 - o, z), dd = P(ix0 - o, iy0 - o, z);
  const t = P(ix0 + w / 2, iy0 + d / 2, z + rh);
  return poly([dd, cc, t], shade(c, 10)) + poly([a, dd, t], shade(c, 4)) + poly([b, cc, t], shade(c, -22)) + poly([a, b, t], c);
}
function roofFlat(ix0, iy0, w, d, z, c) {
  const o = 0.1;
  return poly([P(ix0 - o, iy0 - o, z), P(ix0 + w + o, iy0 - o, z), P(ix0 + w + o, iy0 + d + o, z), P(ix0 - o, iy0 + d + o, z)], c);
}
// Cylinder of radius r (units) centred on (ix,iy), from z0 to z0+h
function cylinder(ix, iy, r, h, c, z0 = 0) {
  const [cx, cy] = P(ix, iy, z0), [, cyt] = P(ix, iy, z0 + h);
  const rx = r * UX * 1.41, ry = r * UY * 1.41;
  const id = `cyl${Math.round(cx)}${Math.round(cy)}${Math.round(h * 10)}`;
  return `<defs><linearGradient id="${id}" x1="0" x2="1"><stop offset="0" stop-color="${shade(c, 8)}"/><stop offset="0.55" stop-color="${c}"/><stop offset="1" stop-color="${shade(c, -25)}"/></linearGradient></defs>` +
    rect(cx - rx, cyt, rx * 2, cy - cyt, `url(#${id})`) + ell(cx, cy, rx, ry, shade(c, -12)) + rect(cx - rx, cyt, rx * 2, cy - cyt, `url(#${id})`) + ell(cx, cyt, rx, ry, shade(c, 22));
}
function cone(ix, iy, r, z0, h, c) {
  const [cx, cy] = P(ix, iy, z0), [, ty] = P(ix, iy, z0 + h);
  const rx = r * UX * 1.41, ry = r * UY * 1.41;
  return ell(cx, cy, rx, ry, shade(c, -5)) + poly([[cx - rx, cy], [cx, ty], [cx, cy + ry]], shade(c, 8)) + poly([[cx + rx, cy], [cx, ty], [cx, cy + ry]], shade(c, -20)) +
    `<path d="M${f1(cx - rx)},${f1(cy)} A${f1(rx)},${f1(ry)} 0 0 0 ${f1(cx + rx)},${f1(cy)} L${f1(cx)},${f1(ty)} Z" fill="${c}" opacity="0.55"/>`;
}
function dome(ix, iy, r, z0, c) {
  const [cx, cy] = P(ix, iy, z0);
  const rx = r * UX * 1.41, ry = rx * 0.95;
  const id = `dome${Math.round(cx)}${Math.round(cy)}`;
  return `<defs><radialGradient id="${id}" cx="0.4" cy="0.35" r="0.7"><stop offset="0" stop-color="${shade(c, 28)}"/><stop offset="1" stop-color="${shade(c, -22)}"/></radialGradient></defs>` +
    `<path d="M${f1(cx - rx)},${f1(cy)} A${f1(rx)},${f1(ry)} 0 0 1 ${f1(cx + rx)},${f1(cy)} Z" fill="url(#${id})"/>` + ell(cx, cy, rx, r * UY * 1.41, shade(c, -10), 'opacity="0.5"');
}
// Striped tent (pyramid) over a square footprint
function tent(ix, iy, r, h, c1, c2) {
  const a = P(ix - r, iy + r), b = P(ix + r, iy + r), cc = P(ix + r, iy - r), d = P(ix - r, iy - r), t = P(ix, iy, h);
  return poly([d, cc, t], shade(c1, 6)) + poly([a, d, t], shade(c2, 8)) + poly([b, cc, t], shade(c2, -20)) + poly([a, b, t], c1) +
    line(a[0], a[1], t[0], t[1], shade(c1, -30), 1) + line(b[0], b[1], t[0], t[1], shade(c1, -30), 1);
}
// Props (screen coordinates)
function tree(x, y, s, c = '#3f7a2f') {
  return rect(x - s * 0.08, y - s * 0.35, s * 0.16, s * 0.4, '#5a3a1a') +
    poly([[x - s * 0.45, y - s * 0.25], [x + s * 0.45, y - s * 0.25], [x, y - s * 0.75]], shade(c, -8)) +
    poly([[x - s * 0.38, y - s * 0.5], [x + s * 0.38, y - s * 0.5], [x, y - s * 1.0]], c) +
    poly([[x - s * 0.3, y - s * 0.75], [x + s * 0.3, y - s * 0.75], [x, y - s * 1.2]], shade(c, 12));
}
function roundTree(x, y, s, c = '#4a8a34') {
  return rect(x - s * 0.07, y - s * 0.3, s * 0.14, s * 0.35, '#5a3a1a') + circ(x, y - s * 0.55, s * 0.38, shade(c, -10)) + circ(x - s * 0.12, y - s * 0.65, s * 0.3, c) + circ(x + s * 0.1, y - s * 0.72, s * 0.24, shade(c, 14));
}
function palm(x, y, s) {
  let out = `<path d="M${f1(x)},${f1(y)} q${f1(s * 0.15)},${f1(-s * 0.5)} ${f1(s * 0.1)},${f1(-s * 1.1)}" stroke="#7a5a2a" stroke-width="${f1(s * 0.09)}" fill="none"/>`;
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; out += `<path d="M${f1(x + s * 0.1)},${f1(y - s * 1.1)} q${f1(Math.cos(a) * s * 0.35)},${f1(Math.sin(a) * s * 0.18 - s * 0.05)} ${f1(Math.cos(a) * s * 0.6)},${f1(Math.sin(a) * s * 0.3 + s * 0.15)}" stroke="#3f8a34" stroke-width="${f1(s * 0.07)}" fill="none" stroke-linecap="round"/>`; }
  return out;
}
function rock(x, y, s, c = '#8a8a8a') {
  return poly([[x - s * 0.5, y], [x - s * 0.35, y - s * 0.45], [x + s * 0.05, y - s * 0.6], [x + s * 0.5, y - s * 0.2], [x + s * 0.4, y + s * 0.05], [x - s * 0.3, y + s * 0.1]], shade(c, -12)) +
    poly([[x - s * 0.35, y - s * 0.45], [x + s * 0.05, y - s * 0.6], [x + s * 0.15, y - s * 0.25], [x - s * 0.2, y - s * 0.15]], shade(c, 16));
}
function crate(x, y, s) { return rect(x - s / 2, y - s, s, s, '#a07a40') + rect(x - s / 2, y - s, s, s, 'none', `stroke="#6a4a20" stroke-width="1"`) + line(x - s / 2, y - s, x + s / 2, y, '#6a4a20', 1) + line(x + s / 2, y - s, x - s / 2, y, '#6a4a20', 1); }
function barrel(x, y, s) { return rect(x - s * 0.4, y - s, s * 0.8, s, '#7a5230', 'rx="3"') + line(x - s * 0.4, y - s * 0.7, x + s * 0.4, y - s * 0.7, '#4a3018', 1) + line(x - s * 0.4, y - s * 0.3, x + s * 0.4, y - s * 0.3, '#4a3018', 1) + ell(x, y - s, s * 0.4, s * 0.14, '#9a7050'); }
function flag(x, y, h, c) { return line(x, y, x, y - h, '#5a3a1a', 2) + poly([[x, y - h], [x + h * 0.5, y - h * 0.85], [x, y - h * 0.7]], c) + circ(x, y - h, 2, '#e8c547'); }
function chimney(x, y, s) { return rect(x - s * 0.18, y - s, s * 0.36, s, '#6a5a4a') + rect(x - s * 0.22, y - s * 1.08, s * 0.44, s * 0.14, '#4a3a2a') + circ(x + s * 0.05, y - s * 1.35, s * 0.17, '#d8d8d8', 'opacity="0.7"') + circ(x + s * 0.25, y - s * 1.65, s * 0.22, '#e8e8e8', 'opacity="0.55"'); }
function door(x, y, w, h, c = '#3a2a1a') { return `<path d="M${f1(x - w / 2)},${f1(y)} v${f1(-(h - w / 2))} a${f1(w / 2)},${f1(w / 2)} 0 0 1 ${f1(w)},0 v${f1(h - w / 2)} z" fill="${c}"/>`; }
function windowRect(x, y, w, h, c = '#2a2a3a') { return rect(x - w / 2, y - h, w, h, c) + rect(x - w / 2, y - h, w, h * 0.45, '#e8d8a0', 'opacity="0.55"'); }
function torch(x, y, h) { return line(x, y, x, y - h, '#5a3a1a', 2) + circ(x, y - h, 3, '#ff8a20') + circ(x, y - h - 2, 2, '#ffd040'); }
function wheatRows(ix0, iy0, w, d, rows, c = '#d8b840') {
  let out = '';
  for (let i = 1; i <= rows; i++) { const t = iy0 + (d * i) / (rows + 1); const a = P(ix0 + 0.1, t), b = P(ix0 + w - 0.1, t); out += line(a[0], a[1], b[0], b[1], c, 2.2); for (let k = 0; k < 4; k++) { const u = 0.15 + k * 0.23; const q = P(ix0 + 0.1 + (w - 0.2) * u, t); out += line(q[0], q[1], q[0], q[1] - 5, shade(c, 15), 1.5); } }
  return out;
}
function water(ix, iy, rx, ry, z = 0) { const [x, y] = P(ix, iy, z); return ell(x, y, rx, ry, '#3f7fbf') + ell(x - rx * 0.2, y - ry * 0.25, rx * 0.45, ry * 0.3, '#7fb5e8', 'opacity="0.6"'); }
function fence(ix0, iy0, w, d, c = '#8a6a3a') {
  let out = '';
  const corners = [P(ix0, iy0 + d), P(ix0 + w, iy0 + d), P(ix0 + w, iy0)];
  for (let i = 0; i < corners.length - 1; i++) { const a = corners[i], b = corners[i + 1]; out += line(a[0], a[1] - 5, b[0], b[1] - 5, c, 1.5) + line(a[0], a[1] - 9, b[0], b[1] - 9, c, 1.5); for (let k = 0; k <= 3; k++) { const x = a[0] + (b[0] - a[0]) * k / 3, y = a[1] + (b[1] - a[1]) * k / 3; out += line(x, y + 1, x, y - 12, shade(c, -15), 2); } }
  return out;
}
function columns(ix0, iy0, w, h, n, c = '#eae2cc', z0 = 0) {
  let out = '';
  for (let i = 0; i < n; i++) { const [x, y] = P(n > 1 ? ix0 + (w * i) / (n - 1) : ix0, iy0, z0); const top = y - h * UZ; out += rect(x - 2.6, top, 5.2, h * UZ, c) + rect(x - 3.6, top - 2, 7.2, 3, shade(c, -15)) + rect(x - 3.4, y - 2, 6.8, 3, shade(c, -15)); }
  return out;
}
function shield(x, y, s, c) { return `<path d="M${f1(x - s * 0.5)},${f1(y - s)} h${f1(s)} v${f1(s * 0.5)} q0,${f1(s * 0.5)} ${f1(-s * 0.5)},${f1(s * 0.7)} q${f1(-s * 0.5)},${f1(-s * 0.2)} ${f1(-s * 0.5)},${f1(-s * 0.7)} z" fill="${c}" stroke="#2a2018" stroke-width="1"/>` + circ(x, y - s * 0.5, s * 0.12, '#e8c547'); }
function cart(x, y, s) { return rect(x - s * 0.5, y - s * 0.55, s, s * 0.4, '#8a6a3a') + circ(x - s * 0.3, y - s * 0.1, s * 0.16, '#4a3a2a') + circ(x + s * 0.3, y - s * 0.1, s * 0.16, '#4a3a2a') + line(x + s * 0.5, y - s * 0.4, x + s * 0.85, y - s * 0.35, '#6a4a2a', 2); }
function anvil(x, y, s) { return rect(x - s * 0.3, y - s * 0.25, s * 0.6, s * 0.25, '#3a3a44') + rect(x - s * 0.45, y - s * 0.5, s * 0.9, s * 0.22, '#55555f') + poly([[x + s * 0.45, y - s * 0.5], [x + s * 0.7, y - s * 0.45], [x + s * 0.45, y - s * 0.3]], '#55555f'); }
function wheel(x, y, r) { let out = circ(x, y, r, 'none', `stroke="#5a3a1a" stroke-width="2.5"`); for (let i = 0; i < 4; i++) { const a = i * Math.PI / 4; out += line(x - Math.cos(a) * r, y - Math.sin(a) * r, x + Math.cos(a) * r, y + Math.sin(a) * r, '#5a3a1a', 1.5); } return out; }
function coins(x, y, s) { let out = ''; for (let i = 0; i < 5; i++) out += ell(x + (i - 2) * s * 0.35, y - (i % 2) * s * 0.3, s * 0.3, s * 0.12, '#e8c547', 'stroke="#a07a20" stroke-width="0.8"'); return out; }
function horse(x, y, s, c = '#6a4a2a') { return `<path d="M${f1(x - s * 0.5)},${f1(y)} v${f1(-s * 0.45)} q0,${f1(-s * 0.25)} ${f1(s * 0.25)},${f1(-s * 0.25)} h${f1(s * 0.45)} q${f1(s * 0.25)},0 ${f1(s * 0.3)},${f1(-s * 0.3)} l${f1(s * 0.15)},${f1(s * 0.05)} l${f1(-s * 0.05)},${f1(s * 0.35)} q${f1(-s * 0.1)},${f1(s * 0.2)} ${f1(-s * 0.3)},${f1(s * 0.2)} v${f1(s * 0.45)} h${f1(-s * 0.12)} v${f1(-s * 0.3)} h${f1(-s * 0.4)} v${f1(s * 0.3)} z" fill="${c}"/>` + `<path d="M${f1(x + s * 0.15)},${f1(y - s * 0.7)} q${f1(s * 0.2)},${f1(-s * 0.15)} ${f1(s * 0.45)},${f1(-s * 0.3)}" stroke="#2a1a0a" stroke-width="${f1(s * 0.08)}" fill="none"/>`; }

// ---------------------------------------------------------------------------
// Faction palettes (walls / roofs / accents) for the city view
// ---------------------------------------------------------------------------
const PALETTES = {
  ROME:   { wall: '#d8c9a3', roof: '#b8502a', accent: '#8b1a1a', trim: '#6a4a2a', ground: 'grass' },
  GAUL:   { wall: '#a8926a', roof: '#6a7a34', accent: '#2f5f2a', trim: '#4a3a20', ground: 'grass' },
  GREEK:  { wall: '#ece4d2', roof: '#4a6e94', accent: '#2f5a8a', trim: '#8a8070', ground: 'grass' },
  EGYPT:  { wall: '#e2cf9e', roof: '#3a8a8a', accent: '#c9a227', trim: '#8a7040', ground: 'sand' },
  HUN:    { wall: '#9a8468', roof: '#6a3a2a', accent: '#8a2a10', trim: '#4a3020', ground: 'dirt' },
  SULTAN: { wall: '#ead9b6', roof: '#2a7a6a', accent: '#c9a227', trim: '#6a5a40', ground: 'sand' }
};

// ---------------------------------------------------------------------------
// Buildings (each returns SVG markup in the 200×120 cell; p = palette)
// ---------------------------------------------------------------------------
const B = {};
B.MAIN_HALL = (p) => ground(p.ground) + box(-0.9, -0.6, 1.8, 1.2, 1.6, p.wall) + columns(-0.8, 0.6, 1.6, 1.6, 4, shade(p.wall, 10)) + roofHip(-0.9, -0.6, 1.8, 1.2, 1.6, 0.6, p.roof) + windowRect(P(0.9, 0.0, 0.9)[0], P(0.9, 0.0, 0.9)[1], 5, 8) + door(P(0.1, 0.6, 0)[0], P(0.1, 0.6, 0)[1] + 1, 9, 15) + flag(P(0, 0, 2.2)[0], P(0, 0, 2.2)[1], 18, p.accent);
B.FARM = (p) => ground('grass') + wheatRows(-0.9, -0.9, 1.8, 1.8, 4) + fence(-0.95, -0.95, 1.9, 1.9) + box(0.3, -0.9, 0.55, 0.45, 0.5, p.trim) + roofGable(0.3, -0.9, 0.55, 0.45, 0.5, 0.35, p.roof);
B.LUMBER = (p) => ground('grass') + tree(P(-0.6, -0.5)[0], P(-0.6, -0.5)[1], 30) + tree(P(0.5, -0.7)[0], P(0.5, -0.7)[1], 26) + tree(P(-0.1, 0.1)[0], P(-0.1, 0.1)[1], 32) + box(0.2, 0.3, 0.7, 0.5, 0.45, p.trim) + roofGable(0.2, 0.3, 0.7, 0.5, 0.45, 0.3, '#6a4a2a') + rect(P(-0.7, 0.7)[0] - 10, P(-0.7, 0.7)[1] - 8, 20, 8, '#8a6a3a', 'rx="2"');
B.QUARRY = (p) => ground('stone') + rock(P(-0.4, -0.3)[0], P(-0.4, -0.3)[1], 28) + rock(P(0.4, 0.2)[0], P(0.4, 0.2)[1], 24, '#9a9a9a') + rock(P(0.1, -0.6)[0], P(0.1, -0.6)[1], 18, '#a0a0a0') + line(P(-0.6, 0.6)[0], P(-0.6, 0.6)[1], P(-0.6, 0.6)[0] + 12, P(-0.6, 0.6)[1] - 34, '#6a4a2a', 3) + line(P(-0.6, 0.6)[0] + 12, P(-0.6, 0.6)[1] - 34, P(-0.6, 0.6)[0] + 30, P(-0.6, 0.6)[1] - 24, '#6a4a2a', 3) + crate(P(0.6, 0.7)[0], P(0.6, 0.7)[1], 9);
B.IRON_MINE = (p) => ground('dirt') + poly([P(-0.9, -0.9), P(0.9, -0.9), P(0.9, 0), P(-0.9, 0)], '#6a5a4a') + poly([P(-0.9, -0.9), P(0.9, -0.9), P(0.6, -0.9, 1.1), P(-0.6, -0.9, 1.1)], '#7a6a5a') + `<path d="M${f1(P(-0.1, -0.2)[0] - 11)},${f1(P(-0.1, -0.2)[1] + 2)} v-12 a11,11 0 0 1 22,0 v12 z" fill="#1a1410"/>` + line(P(-0.8, 0.5)[0], P(-0.8, 0.5)[1], P(0.8, 0.5)[0], P(0.8, 0.5)[1], '#5a4a3a', 2) + line(P(-0.8, 0.7)[0], P(-0.8, 0.7)[1], P(0.8, 0.7)[0], P(0.8, 0.7)[1], '#5a4a3a', 2) + cart(P(0.3, 0.6)[0], P(0.3, 0.6)[1], 18) + rock(P(0.7, -0.4)[0], P(0.7, -0.4)[1] - 6, 12, '#7a7a8a');
B.WAREHOUSE = (p) => ground(p.ground) + box(-0.9, -0.7, 1.8, 1.4, 1.0, p.trim) + roofGable(-0.9, -0.7, 1.8, 1.4, 1.0, 0.6, shade(p.roof, -10)) + door(P(0.1, 0.7)[0], P(0.1, 0.7)[1] + 1, 12, 16, '#2a1a0a') + crate(P(0.8, 0.95)[0], P(0.8, 0.95)[1], 9) + crate(P(-0.9, 0.85)[0] - 2, P(-0.9, 0.85)[1], 8);
B.SILO = (p) => ground(p.ground) + cylinder(0, 0, 0.7, 1.8, p.wall) + cone(0, 0, 0.78, 1.8, 0.7, p.roof) + door(P(0.5, 0.5)[0], P(0.5, 0.5)[1] + 1, 8, 12) + wheatRows(-0.95, 0.6, 0.5, 0.35, 1);
B.RALLY_POINT = (p) => ground('dirt') + poly([P(-0.6, -0.6), P(0.6, -0.6), P(0.6, 0.6), P(-0.6, 0.6)], '#9a8a6a') + flag(P(0, 0)[0], P(0, 0)[1], 42, p.accent) + torch(P(-0.7, 0.7)[0], P(-0.7, 0.7)[1], 16) + torch(P(0.7, -0.7)[0], P(0.7, -0.7)[1], 16) + shield(P(0.6, 0.4)[0], P(0.6, 0.4)[1], 12, p.accent) + line(P(-0.5, 0.75)[0], P(-0.5, 0.75)[1], P(-0.5, 0.75)[0] + 10, P(-0.5, 0.75)[1] - 26, '#8a6a3a', 2);
B.BARRACKS = (p) => ground(p.ground) + box(-0.9, -0.5, 1.8, 1.0, 1.1, shade(p.wall, -10)) + roofGable(-0.9, -0.5, 1.8, 1.0, 1.1, 0.45, p.accent) + door(P(0.1, 0.5)[0], P(0.1, 0.5)[1] + 1, 10, 14) + flag(P(-0.9, -0.5, 1.6)[0], P(-0.9, -0.5, 1.6)[1], 16, p.accent) + shield(P(0.95, 0.1, 0.55)[0], P(0.95, 0.1, 0.55)[1], 10, p.accent) + line(P(-0.5, 0.9)[0], P(-0.5, 0.9)[1], P(-0.5, 0.9)[0], P(-0.5, 0.9)[1] - 22, '#aaa', 2) + line(P(-0.35, 0.95)[0], P(-0.35, 0.95)[1], P(-0.35, 0.95)[0], P(-0.35, 0.95)[1] - 20, '#aaa', 2);
B.STABLE = (p) => ground('grass') + box(-0.9, -0.7, 1.5, 1.0, 0.9, p.trim) + roofGable(-0.9, -0.7, 1.5, 1.0, 0.9, 0.5, shade(p.roof, -15)) + fence(0.4, -0.2, 0.6, 1.1) + horse(P(0.75, 0.4)[0], P(0.75, 0.4)[1], 20) + door(P(-0.2, 0.3)[0], P(-0.2, 0.3)[1] + 1, 14, 16, '#3a2a1a') + rect(P(-0.9, 0.9)[0] - 8, P(-0.9, 0.9)[1] - 6, 16, 6, '#d8b840');
B.WORKSHOP = (p) => ground('dirt') + box(-0.9, -0.6, 1.5, 1.2, 1.2, '#6a5a4a') + roofFlat(-0.9, -0.6, 1.5, 1.2, 1.2, '#4a4a4a') + chimney(P(-0.5, -0.4, 1.2)[0], P(-0.5, -0.4, 1.2)[1], 14) + wheel(P(0.95, 0.45)[0] + 2, P(0.95, 0.45)[1] - 14, 10) + rect(P(0.5, -0.9, 0.0)[0] - 6, P(0.5, -0.9)[1] - 22, 12, 22, '#8a6a3a') + door(P(0.1, 0.6)[0], P(0.1, 0.6)[1] + 1, 12, 15);
B.ACADEMY = (p) => ground(p.ground) + box(-0.9, -0.7, 1.8, 1.4, 1.1, shade(p.wall, 6)) + columns(-0.8, 0.7, 1.6, 1.1, 5, shade(p.wall, 12)) + roofGable(-0.9, -0.7, 1.8, 1.4, 1.1, 0.5, p.roof) + windowRect(P(0.9, 0.0, 0.7)[0], P(0.9, 0.0, 0.7)[1], 5, 8) + rect(P(0, 0, 1.6)[0] - 6, P(0, 0, 1.6)[1] - 14, 12, 14, '#e8d8a0') + line(P(0, 0, 1.6)[0] - 4, P(0, 0, 1.6)[1] - 10, P(0, 0, 1.6)[0] + 4, P(0, 0, 1.6)[1] - 10, '#8a6a3a', 1) + line(P(0, 0, 1.6)[0] - 4, P(0, 0, 1.6)[1] - 6, P(0, 0, 1.6)[0] + 4, P(0, 0, 1.6)[1] - 6, '#8a6a3a', 1);
B.FORGE = (p) => ground('dirt') + box(-0.9, -0.5, 1.4, 1.0, 1.0, '#5a4a3a') + roofGable(-0.9, -0.5, 1.4, 1.0, 1.0, 0.45, '#3a3a3a') + chimney(P(0.2, -0.3, 1.0)[0], P(0.2, -0.3, 1.0)[1], 16) + anvil(P(0.7, 0.6)[0], P(0.7, 0.6)[1], 18) + circ(P(-0.2, 0.5)[0], P(-0.2, 0.5)[1] - 8, 6, '#ff7a20') + circ(P(-0.2, 0.5)[0], P(-0.2, 0.5)[1] - 9, 3.5, '#ffd040');
B.HIDEOUT = (p) => ground('grass') + ell(P(0.2, 0.2)[0], P(0.2, 0.2)[1], 34, 16, '#4a3a2a') + `<path d="M${f1(P(0.2, 0.2)[0] - 12)},${f1(P(0.2, 0.2)[1] + 2)} v-10 a12,12 0 0 1 24,0 v10 z" fill="#15100a"/>` + roundTree(P(-0.7, -0.5)[0], P(-0.7, -0.5)[1], 28) + roundTree(P(0.8, -0.6)[0], P(0.8, -0.6)[1], 22) + rock(P(-0.6, 0.6)[0], P(-0.6, 0.6)[1], 14, '#7a8a6a') + crate(P(0.8, 0.7)[0], P(0.8, 0.7)[1], 7);
B.HEALING_TENT = (p) => ground(p.ground) + tent(0, 0, 0.9, 1.6, '#f0ece0', '#dcd6c6') + rect(P(0.15, 0.95, 0.75)[0] - 2, P(0.15, 0.95, 0.75)[1] - 9, 4, 12, '#c0202a') + rect(P(0.15, 0.95, 0.75)[0] - 6, P(0.15, 0.95, 0.75)[1] - 5, 12, 4, '#c0202a') + barrel(P(-0.95, 0.7)[0], P(-0.95, 0.7)[1], 12);
B.MARKET = (p) => ground(p.ground) + poly([P(-0.9, -0.9), P(0.9, -0.9), P(0.9, 0.9), P(-0.9, 0.9)], '#b8a888') + box(-0.8, -0.8, 1.0, 0.7, 0.5, p.wall) + poly([P(-0.95, -0.95, 0.9), P(0.35, -0.95, 0.9), P(0.35, 0.05, 0.6), P(-0.95, 0.05, 0.6)], p.accent) + poly([P(-0.95, -0.95, 0.9), P(0.35, -0.95, 0.9), P(0.35, 0.05, 0.6), P(-0.95, 0.05, 0.6)], 'url(#stripes)') + crate(P(0.6, 0.4)[0], P(0.6, 0.4)[1], 10) + crate(P(0.75, 0.75)[0], P(0.75, 0.75)[1], 9) + barrel(P(0.25, 0.8)[0], P(0.25, 0.8)[1], 12) + ell(P(-0.5, 0.6)[0], P(-0.5, 0.6)[1] - 3, 10, 5, '#d8b840');
B.WALL = (p) => ground(p.ground) + box(-1.0, -0.35, 2.0, 0.5, 1.0, shade(p.wall, -22)) + box(-1.0, -0.4, 0.45, 0.6, 1.45, shade(p.wall, -14)) + box(0.55, -0.4, 0.45, 0.6, 1.45, shade(p.wall, -14)) + [-0.45, -0.15, 0.15, 0.45].map(ix => box(ix - 0.1, -0.3, 0.2, 0.2, 0.25, shade(p.wall, -8), 1.0)).join('') + torch(P(-0.78, 0.25, 1.45)[0], P(-0.78, 0.25, 1.45)[1], 10) + torch(P(0.78, 0.25, 1.45)[0], P(0.78, 0.25, 1.45)[1], 10) + door(P(0, 0.15)[0], P(0, 0.15)[1] + 1, 14, 20, '#1a1410');
B.MOAT = (p) => ground('grass') + poly([P(-1, -1), P(1, -1), P(1, 1), P(-1, 1)], '#3f7fbf') + poly([P(-0.55, -0.55), P(0.55, -0.55), P(0.55, 0.55), P(-0.55, 0.55)], '#8a9a6a') + poly([P(-0.1, -1), P(0.1, -1), P(0.1, -0.55), P(-0.1, -0.55)], '#8a6a3a') + ell(P(-0.6, 0.7)[0], P(-0.6, 0.7)[1], 8, 3, '#9fd0ff', 'opacity="0.7"') + ell(P(0.7, -0.3)[0], P(0.7, -0.3)[1], 10, 4, '#9fd0ff', 'opacity="0.6"') + line(P(-1, 0.1)[0], P(-1, 0.1)[1] - 3, P(-0.55, 0.1)[0], P(-0.55, 0.1)[1] - 3, '#8a6a3a', 3);
B.MILL = (p) => ground('grass') + cylinder(0.1, 0.1, 0.55, 1.5, p.wall) + cone(0.1, 0.1, 0.62, 1.5, 0.55, p.roof) + (() => { const [x, y] = P(0.1, 0.1, 1.4); const x0 = x - 18, y0 = y + 4; let o = circ(x0, y0, 3, '#5a3a1a'); for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.4; o += line(x0, y0, x0 + Math.cos(a) * 26, y0 + Math.sin(a) * 26, '#8a6a3a', 2.5) + poly([[x0 + Math.cos(a) * 8, y0 + Math.sin(a) * 8], [x0 + Math.cos(a) * 26, y0 + Math.sin(a) * 26], [x0 + Math.cos(a + 0.35) * 24, y0 + Math.sin(a + 0.35) * 24]], '#e8e0d0'); } return o; })() + door(P(0.55, 0.55)[0], P(0.55, 0.55)[1] + 1, 8, 12);
B.BAKERY = (p) => ground(p.ground) + box(-0.8, -0.6, 1.4, 1.1, 0.9, p.wall) + roofGable(-0.8, -0.6, 1.4, 1.1, 0.9, 0.45, p.roof) + chimney(P(0.3, -0.4, 0.9)[0], P(0.3, -0.4, 0.9)[1], 13) + door(P(0, 0.5)[0], P(0, 0.5)[1] + 1, 10, 13) + ell(P(0.75, 0.3)[0], P(0.75, 0.3)[1] - 3, 7, 4, '#d8a050') + ell(P(0.75, 0.6)[0], P(0.75, 0.6)[1] - 3, 7, 4, '#d8a050') + windowRect(P(0.8, -0.2, 0.55)[0], P(0.8, -0.2, 0.55)[1], 5, 7);
B.GREAT_SILO = (p) => ground(p.ground) + cylinder(-0.45, 0.1, 0.55, 1.9, p.wall) + cylinder(0.5, -0.3, 0.55, 2.2, shade(p.wall, -6)) + cone(-0.45, 0.1, 0.62, 1.9, 0.6, p.roof) + cone(0.5, -0.3, 0.62, 2.2, 0.6, p.roof) + door(P(0, 0.6)[0], P(0, 0.6)[1] + 1, 8, 12) + wheatRows(-0.95, 0.65, 0.7, 0.3, 1);
B.GREAT_WAREHOUSE = (p) => ground(p.ground) + box(-1.0, -0.8, 2.0, 1.6, 1.3, shade(p.trim, 5)) + roofGable(-1.0, -0.8, 2.0, 1.6, 1.3, 0.7, shade(p.roof, -12)) + door(P(0.1, 0.8)[0], P(0.1, 0.8)[1] + 1, 14, 18, '#2a1a0a') + crate(P(0.9, 1.0)[0], P(0.9, 1.0)[1], 9) + crate(P(0.9, 1.0)[0], P(0.9, 1.0)[1] - 9, 9) + barrel(P(-1.0, 0.95)[0], P(-1.0, 0.95)[1], 12);
B.GREAT_BARRACKS = (p) => ground(p.ground) + box(-1.0, -0.7, 2.0, 1.4, 1.4, shade(p.wall, -14)) + roofGable(-1.0, -0.7, 2.0, 1.4, 1.4, 0.5, p.accent) + flag(P(-1.0, -0.7, 1.9)[0], P(-1.0, -0.7, 1.9)[1], 16, p.accent) + flag(P(1.0, -0.7, 1.9)[0], P(1.0, -0.7, 1.9)[1], 16, p.accent) + door(P(0, 0.7)[0], P(0, 0.7)[1] + 1, 12, 16) + shield(P(1.05, -0.2, 0.75)[0], P(1.05, -0.2, 0.75)[1], 10, p.accent) + shield(P(1.05, 0.3, 0.75)[0], P(1.05, 0.3, 0.75)[1], 10, p.accent);
B.GREAT_STABLE = (p) => ground('grass') + box(-1.0, -0.8, 1.5, 1.6, 1.0, p.trim) + roofGable(-1.0, -0.8, 1.5, 1.6, 1.0, 0.6, shade(p.roof, -15)) + fence(0.5, -0.8, 0.5, 1.7) + horse(P(0.75, -0.3)[0], P(0.75, -0.3)[1], 18) + horse(P(0.8, 0.5)[0], P(0.8, 0.5)[1], 18, '#8a6a4a') + door(P(-0.3, 0.8)[0], P(-0.3, 0.8)[1] + 1, 14, 16, '#3a2a1a');
B.EMBASSY = (p) => ground(p.ground) + box(-0.9, -0.6, 1.8, 1.2, 1.4, shade(p.wall, 8)) + columns(-0.8, 0.6, 1.6, 1.4, 4, shade(p.wall, 14)) + roofHip(-0.9, -0.6, 1.8, 1.2, 1.4, 0.5, p.roof) + flag(P(-0.9, -0.6, 1.9)[0], P(-0.9, -0.6, 1.9)[1], 16, p.accent) + flag(P(0.9, -0.6, 1.9)[0], P(0.9, -0.6, 1.9)[1], 16, '#2f5a8a') + door(P(0.1, 0.6)[0], P(0.1, 0.6)[1] + 1, 10, 16);
B.TREASURE_CHAMBER = (p) => ground('stone') + box(-0.8, -0.6, 1.6, 1.2, 1.1, '#8a8a92') + roofFlat(-0.8, -0.6, 1.6, 1.2, 1.1, '#6a6a72') + [-0.5, 0, 0.5].map(ix => box(ix - 0.12, -0.6, 0.24, 0.24, 0.25, '#9a9aa2', 1.1)).join('') + door(P(0.1, 0.6)[0], P(0.1, 0.6)[1] + 1, 12, 15, '#2a2a30') + rect(P(0.1, 0.6)[0] - 6, P(0.1, 0.6)[1] - 14, 12, 15, 'none', 'stroke="#c9a227" stroke-width="1.5"') + coins(P(-0.6, 0.85)[0], P(-0.6, 0.85)[1], 10);
B.HERO_MANSION = (p) => ground(p.ground) + box(-0.9, -0.5, 1.4, 1.0, 1.2, shade(p.wall, 4)) + box(0.5, -0.5, 0.5, 0.5, 1.7, shade(p.wall, -6)) + roofHip(-0.9, -0.5, 1.4, 1.0, 1.2, 0.45, p.roof) + cone(0.75, -0.25, 0.4, 1.7, 0.6, p.roof) + flag(P(0.75, -0.25, 2.3)[0], P(0.75, -0.25, 2.3)[1], 14, p.accent) + door(P(-0.2, 0.5)[0], P(-0.2, 0.5)[1] + 1, 10, 14) + windowRect(P(0.5, 0.0, 0.7)[0] + 8, P(0.5, 0.0, 0.7)[1], 5, 8) + roundTree(P(-0.8, 0.8)[0], P(-0.8, 0.8)[1], 18);
B.WATCHTOWER = (p) => ground('stone') + box(-0.35, -0.35, 0.7, 0.7, 2.6, shade(p.wall, -18)) + box(-0.45, -0.45, 0.9, 0.9, 0.35, shade(p.wall, -8), 2.6) + roofHip(-0.45, -0.45, 0.9, 0.9, 2.95, 0.5, p.roof) + windowRect(P(0.35, 0.0, 2.0)[0], P(0.35, 0.0, 2.0)[1], 5, 8) + windowRect(P(0.35, 0.0, 1.2)[0], P(0.35, 0.0, 1.2)[1], 5, 8) + torch(P(-0.45, 0.45, 2.95)[0], P(-0.45, 0.45, 2.95)[1], 10) + door(P(0.0, 0.35)[0], P(0.0, 0.35)[1] + 1, 8, 12);
B.FOUNDRY = (p) => ground('dirt') + box(-0.9, -0.6, 1.5, 1.2, 1.1, '#5a4a40') + roofGable(-0.9, -0.6, 1.5, 1.2, 1.1, 0.4, '#3a3634') + chimney(P(-0.4, -0.4, 1.1)[0], P(-0.4, -0.4, 1.1)[1], 20) + chimney(P(0.2, -0.4, 1.1)[0], P(0.2, -0.4, 1.1)[1], 16) + circ(P(0.65, 0.4)[0], P(0.65, 0.4)[1] - 6, 7, '#ff6a10') + circ(P(0.65, 0.4)[0], P(0.65, 0.4)[1] - 7, 4, '#ffd040') + rect(P(0.85, 0.85)[0] - 10, P(0.85, 0.85)[1] - 5, 20, 5, '#7a7a86') + rect(P(0.85, 0.85)[0] - 8, P(0.85, 0.85)[1] - 10, 16, 5, '#8a8a96');
B.STONEMASON = (p) => ground('stone') + box(-0.9, -0.4, 1.3, 0.9, 0.9, shade(p.wall, -10)) + roofGable(-0.9, -0.4, 1.3, 0.9, 0.9, 0.4, p.trim) + rect(P(0.7, 0.3)[0] - 9, P(0.7, 0.3)[1] - 8, 18, 8, '#b0b0b0') + rect(P(0.7, 0.3)[0] - 7, P(0.7, 0.3)[1] - 15, 14, 7, '#c4c4c4') + rect(P(0.5, 0.75)[0] - 8, P(0.5, 0.75)[1] - 7, 16, 7, '#a8a8a8') + line(P(-0.7, 0.8)[0], P(-0.7, 0.8)[1], P(-0.7, 0.8)[0] + 6, P(-0.7, 0.8)[1] - 16, '#6a4a2a', 2.5) + rect(P(-0.7, 0.8)[0] + 3, P(-0.7, 0.8)[1] - 20, 8, 6, '#555');
B.SAWMILL = (p) => ground('grass') + box(-0.9, -0.5, 1.5, 1.0, 0.8, p.trim) + roofGable(-0.9, -0.5, 1.5, 1.0, 0.8, 0.45, '#6a4a2a') + wheel(P(0.9, 0.2)[0], P(0.9, 0.2)[1] - 12, 11) + rect(P(-0.5, 0.75)[0] - 14, P(-0.5, 0.75)[1] - 6, 28, 6, '#a07a40', 'rx="3"') + rect(P(-0.5, 0.75)[0] - 12, P(-0.5, 0.75)[1] - 12, 24, 6, '#b08a50', 'rx="3"') + tree(P(0.5, 0.75)[0], P(0.5, 0.75)[1], 18);
B.RESIDENCE = (p) => ground(p.ground) + box(-0.9, -0.5, 1.6, 1.0, 1.1, shade(p.wall, 6)) + roofHip(-0.9, -0.5, 1.6, 1.0, 1.1, 0.5, p.roof) + columns(-0.7, 0.5, 1.2, 1.1, 3, shade(p.wall, 12)) + windowRect(P(0.75, 0.0, 0.7)[0], P(0.75, 0.0, 0.7)[1], 5, 8) + door(P(-0.1, 0.5)[0], P(-0.1, 0.5)[1] + 1, 9, 13) + roundTree(P(0.85, 0.8)[0], P(0.85, 0.8)[1], 16) + roundTree(P(-0.9, 0.85)[0], P(-0.9, 0.85)[1], 14);
B.TRADE_OFFICE = (p) => ground(p.ground) + box(-0.9, -0.6, 1.4, 1.2, 1.2, p.wall) + roofHip(-0.9, -0.6, 1.4, 1.2, 1.2, 0.4, p.accent) + poly([P(-0.95, 0.6, 0.75), P(0.55, 0.6, 0.75), P(0.55, 0.95, 0.55), P(-0.95, 0.95, 0.55)], p.accent) + crate(P(0.8, 0.5)[0], P(0.8, 0.5)[1], 9) + crate(P(0.8, 0.9)[0], P(0.8, 0.9)[1], 9) + cart(P(-0.6, 0.95)[0], P(-0.6, 0.95)[1], 16) + windowRect(P(0.5, -0.2, 0.7)[0] + 4, P(0.5, -0.2, 0.7)[1], 5, 8);
B.ROMAN_THERMAE = (p) => ground('stone') + box(-0.9, -0.9, 1.8, 0.8, 1.0, '#ece4d4') + columns(-0.8, -0.1, 1.6, 1.0, 5, '#f4ecdc') + roofGable(-0.9, -0.9, 1.8, 0.8, 1.0, 0.4, '#b8a090') + water(0, 0.5, 40, 18) + dome(0, -0.5, 0.45, 1.4, '#c8b8a8');
B.GALLIC_BREWERY = (p) => ground('grass') + box(-0.9, -0.6, 1.4, 1.0, 0.9, '#a08060') + roofGable(-0.9, -0.6, 1.4, 1.0, 0.9, 0.5, '#8b5a2b') + chimney(P(0.2, -0.4, 0.9)[0], P(0.2, -0.4, 0.9)[1], 12) + barrel(P(0.7, 0.3)[0], P(0.7, 0.3)[1], 13) + barrel(P(0.85, 0.7)[0], P(0.85, 0.7)[1], 13) + barrel(P(0.45, 0.8)[0], P(0.45, 0.8)[1], 12) + door(P(-0.2, 0.4)[0], P(-0.2, 0.4)[1] + 1, 10, 14, '#3a2a1a');
B.GREEK_TEMPLE = (p) => ground('stone') + poly([P(-1, -0.8), P(1, -0.8), P(1, 0.8), P(-1, 0.8)], '#e4dccc') + box(-0.9, -0.7, 1.8, 1.4, 0.25, '#ede6d6') + columns(-0.8, 0.7, 1.6, 1.3, 6, '#faf6ec', 0.25) + columns(0.8, -0.6, 0, 1.3, 1, '#faf6ec', 0.25) + box(-0.6, -0.6, 1.2, 1.1, 1.3, '#f6f2e8', 0.25) + roofGable(-0.95, -0.75, 1.9, 1.5, 1.55, 0.45, '#e0d8c8') + rect(P(0.95, 0.0, 1.0)[0] - 3, P(0.95, 0.0, 1.0)[1] - 10, 6, 10, '#d4af37');
B.EGYPTIAN_IRRIGATION = (p) => ground('sand') + poly([P(-1, -0.2), P(1, -0.2), P(1, 0.2), P(-1, 0.2)], '#3f7fbf') + poly([P(-0.2, -1), P(0.2, -1), P(0.2, 1), P(-0.2, 1)], '#3f7fbf') + ell(P(0.6, 0.0)[0], P(0.6, 0.0)[1] - 1, 9, 3, '#9fd0ff', 'opacity="0.7"') + palm(P(-0.65, -0.6)[0], P(-0.65, -0.6)[1], 26) + palm(P(0.7, 0.65)[0], P(0.7, 0.65)[1], 22) + wheatRows(-0.95, 0.3, 0.7, 0.6, 2, '#7fb050') + wheatRows(0.3, -0.95, 0.6, 0.6, 2, '#7fb050') + wheel(P(0.0, 0.0)[0], P(0.0, 0.0)[1] - 10, 9);
B.HUN_WAR_TENT = (p) => ground('dirt') + tent(0, 0, 1.0, 1.7, '#9b7355', '#7b5a44') + tent(-0.75, 0.55, 0.35, 0.8, '#8a6a4a', '#6b5344') + flag(P(0, 0, 1.7)[0], P(0, 0, 1.7)[1], 16, '#8a2a10') + shield(P(0.85, 0.75)[0], P(0.85, 0.75)[1], 11, '#8a2a10') + line(P(0.6, 0.95)[0], P(0.6, 0.95)[1], P(0.6, 0.95)[0] + 4, P(0.6, 0.95)[1] - 26, '#5a3a1a', 2) + torch(P(-0.9, -0.5)[0], P(-0.9, -0.5)[1], 14);
B.SULTAN_DESERT_OUTPOST = (p) => ground('sand') + box(-0.9, -0.6, 1.5, 1.2, 1.1, '#e4c8a6') + roofFlat(-0.9, -0.6, 1.5, 1.2, 1.1, '#d4b896') + dome(-0.15, 0.0, 0.5, 1.1, '#2a7a6a') + cylinder(0.75, -0.55, 0.18, 2.4, '#ead9b6') + dome(0.75, -0.55, 0.22, 2.4, '#2a7a6a') + door(P(0.1, 0.6)[0], P(0.1, 0.6)[1] + 1, 10, 15, '#3a2a1a') + palm(P(0.9, 0.8)[0], P(0.9, 0.8)[1], 22) + flag(P(0.75, -0.55, 2.75)[0], P(0.75, -0.55, 2.75)[1], 10, '#c9a227');

// Field sprites: growth by tier (1: L1-6, 2: L7-13, 3: L14-20)
const F = {
  FARM: (t) => ground('grass') + wheatRows(-0.95, -0.95, 1.9, 1.9, 2 + t * 2) + (t >= 2 ? fence(-1, -1, 2, 2) : '') + (t >= 3 ? box(0.45, -0.95, 0.5, 0.4, 0.5, '#8a6a3a') + roofGable(0.45, -0.95, 0.5, 0.4, 0.5, 0.3, '#b8502a') : ''),
  LUMBER: (t) => ground('grass') + [[-0.6, -0.6, 30], [0.5, -0.7, 26], [-0.1, 0.1, 32], [0.6, 0.4, 24], [-0.7, 0.5, 22], [0.1, -0.9, 20]].slice(0, 2 + t * 1.4 | 0).map(([ix, iy, s]) => tree(P(ix, iy)[0], P(ix, iy)[1], s)).join('') + (t >= 2 ? rect(P(0.7, 0.85)[0] - 12, P(0.7, 0.85)[1] - 7, 24, 7, '#8a6a3a', 'rx="2"') : '') + (t >= 3 ? box(-0.95, 0.5, 0.5, 0.4, 0.4, '#6a4a2a') + roofGable(-0.95, 0.5, 0.5, 0.4, 0.4, 0.25, '#4a3a2a') : ''),
  QUARRY: (t) => ground('stone') + rock(P(-0.4, -0.3)[0], P(-0.4, -0.3)[1], 20 + t * 5) + (t >= 2 ? rock(P(0.4, 0.2)[0], P(0.4, 0.2)[1], 22, '#9a9a9a') + rock(P(0.1, -0.7)[0], P(0.1, -0.7)[1], 16, '#a4a4a4') : '') + (t >= 3 ? line(P(-0.6, 0.6)[0], P(-0.6, 0.6)[1], P(-0.6, 0.6)[0] + 12, P(-0.6, 0.6)[1] - 34, '#6a4a2a', 3) + line(P(-0.6, 0.6)[0] + 12, P(-0.6, 0.6)[1] - 34, P(-0.6, 0.6)[0] + 30, P(-0.6, 0.6)[1] - 24, '#6a4a2a', 3) + crate(P(0.7, 0.7)[0], P(0.7, 0.7)[1], 9) : ''),
  IRON_MINE: (t) => ground('dirt') + poly([P(-0.9, -0.9), P(0.9, -0.9), P(0.9, 0), P(-0.9, 0)], '#6a5a4a') + poly([P(-0.9, -0.9), P(0.9, -0.9), P(0.6, -0.9, 0.8 + t * 0.2), P(-0.6, -0.9, 0.8 + t * 0.2)], '#7a6a5a') + `<path d="M${f1(P(-0.1, -0.2)[0] - 10)},${f1(P(-0.1, -0.2)[1] + 2)} v-11 a10,10 0 0 1 20,0 v11 z" fill="#1a1410"/>` + (t >= 2 ? line(P(-0.8, 0.5)[0], P(-0.8, 0.5)[1], P(0.8, 0.5)[0], P(0.8, 0.5)[1], '#5a4a3a', 2) + line(P(-0.8, 0.7)[0], P(-0.8, 0.7)[1], P(0.8, 0.7)[0], P(0.8, 0.7)[1], '#5a4a3a', 2) + cart(P(0.3, 0.6)[0], P(0.3, 0.6)[1], 16) : '') + (t >= 3 ? rock(P(0.7, -0.4)[0], P(0.7, -0.4)[1] - 6, 12, '#7a7a8a') + rock(P(-0.75, 0.2)[0], P(-0.75, 0.2)[1], 10, '#8a8a9a') : '')
};

const DEFS = `<defs>
  <pattern id="gtex" width="6" height="6" patternUnits="userSpaceOnUse"><circle cx="1.5" cy="1.5" r="0.8" fill="#000" opacity="0.18"/><circle cx="4.5" cy="4" r="0.6" fill="#fff" opacity="0.18"/></pattern>
  <pattern id="stripes" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="4" height="8" fill="#fff" opacity="0.35"/></pattern>
</defs>`;
const SPRITE_VIEWBOX = '35 -16 130 126';   // diamond centre (100,70) sits at (0.5, 0.683) of the box
const svgDoc = (inner, vb = SPRITE_VIEWBOX, w = 130, h = 126) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${w}" height="${h}" shape-rendering="geometricPrecision">${DEFS}${inner}</svg>\n`;

function writeFile(p, content) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, content); }

function buildCitySprites() {
  const keys = Object.keys(B);
  let n = 0;
  for (const [faction, palette] of Object.entries(PALETTES)) {
    for (const key of keys) { resetSeed(7); writeFile(path.join(OUT, 'buildings', faction, `${key}.svg`), svgDoc(B[key](palette))); n++; }
  }
  for (const [type, fn] of Object.entries(F)) for (const tier of [1, 2, 3]) { resetSeed(3); writeFile(path.join(OUT, 'fields', `${type}_${tier}.svg`), svgDoc(fn(tier))); n++; }
  writeFile(path.join(OUT, 'buildings', 'manifest.json'), JSON.stringify({ factions: Object.keys(PALETTES), buildings: keys, fields: Object.keys(F), tiers: 3, viewBox: SPRITE_VIEWBOX, anchor: { x: 0.5, y: 0.683 } }, null, 2));
  return n;
}

// ---------------------------------------------------------------------------
// World map sprites: 256×256 box, ground diamond centred at (128, 206), no terrain
// ---------------------------------------------------------------------------
const M = {};
const mapSvg = (inner) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">${DEFS}<g transform="translate(28,136) scale(1.0)">${inner}</g></svg>\n`;
const shadow = (rx = 48, ry = 22) => ell(CX, CY, rx, ry, '#000', 'opacity="0.28"');
const cityBase = (c) => poly([P(-1, -1), P(1, -1), P(1, 1), P(-1, 1)], c, 'opacity="0.9"');
M.cities = {
  rome: () => shadow() + cityBase('#c8b89a') + box(-0.9, 0.0, 0.7, 0.7, 0.7, '#d8c9a3') + roofGable(-0.9, 0.0, 0.7, 0.7, 0.7, 0.35, '#b8502a') + box(0.2, 0.2, 0.7, 0.6, 0.6, '#d0c09a') + roofGable(0.2, 0.2, 0.7, 0.6, 0.6, 0.3, '#b8502a') + box(-0.4, -0.9, 1.1, 0.8, 1.0, '#e8dcc0') + columns(-0.3, -0.1, 0.9, 1.0, 4, '#f2ead8') + roofGable(-0.4, -0.9, 1.1, 0.8, 1.0, 0.4, '#b8502a') + flag(P(0.15, -0.5, 1.4)[0], P(0.15, -0.5, 1.4)[1], 14, '#8b1a1a'),
  gaul: () => shadow() + cityBase('#8aa062') + cylinder(-0.5, 0.2, 0.42, 0.7, '#a8926a') + cone(-0.5, 0.2, 0.5, 0.7, 0.7, '#8a7a3a') + cylinder(0.45, 0.45, 0.35, 0.6, '#a8926a') + cone(0.45, 0.45, 0.42, 0.6, 0.6, '#8a7a3a') + cylinder(0.3, -0.6, 0.5, 0.9, '#a8926a') + cone(0.3, -0.6, 0.6, 0.9, 0.9, '#6a7a34') + fence(-1, -1, 2, 2, '#7a6a3a') + tree(P(-0.8, -0.7)[0], P(-0.8, -0.7)[1], 22),
  greek: () => shadow() + cityBase('#cfc8b4') + box(-0.9, 0.1, 0.7, 0.7, 0.7, '#ece4d2') + roofFlat(-0.9, 0.1, 0.7, 0.7, 0.7, '#4a6e94') + box(0.3, 0.3, 0.6, 0.6, 0.6, '#ece4d2') + roofFlat(0.3, 0.3, 0.6, 0.6, 0.6, '#4a6e94') + box(-0.5, -0.9, 1.3, 0.9, 0.3, '#ede6d6') + columns(-0.4, 0.0, 1.1, 1.0, 5, '#faf6ec', 0.3) + roofGable(-0.55, -0.95, 1.4, 1.0, 1.3, 0.4, '#e0d8c8'),
  egypt: () => shadow() + cityBase('#d8c48a') + poly([P(-0.9, -0.3), P(0.3, -0.3), P(0.3, 0.9), P(-0.9, 0.9)], '#c9b276') + poly([P(-0.9, 0.9), P(0.3, 0.9), P(-0.3, 0.3, 1.5)], '#e8d8a8') + poly([P(0.3, 0.9), P(0.3, -0.3), P(-0.3, 0.3, 1.5)], '#c4a862') + poly([P(-0.9, -0.3), P(-0.9, 0.9), P(-0.3, 0.3, 1.5)], '#dcc88c') + box(0.4, -0.9, 0.6, 0.6, 0.6, '#e2cf9e') + roofFlat(0.4, -0.9, 0.6, 0.6, 0.6, '#d4bd88') + rect(P(0.8, 0.5)[0] - 2, P(0.8, 0.5)[1] - 40, 4, 40, '#e2cf9e') + poly([[P(0.8, 0.5)[0] - 3, P(0.8, 0.5)[1] - 40], [P(0.8, 0.5)[0] + 3, P(0.8, 0.5)[1] - 40], [P(0.8, 0.5)[0], P(0.8, 0.5)[1] - 48]], '#c9a227') + palm(P(-0.6, -0.8)[0], P(-0.6, -0.8)[1], 22),
  hun: () => shadow() + cityBase('#9a8a6a') + tent(-0.5, 0.3, 0.45, 0.9, '#9b7355', '#7b5a44') + tent(0.5, 0.5, 0.38, 0.75, '#8a6a4a', '#6b5344') + tent(0.2, -0.5, 0.55, 1.1, '#9b7355', '#7b5a44') + flag(P(0.2, -0.5, 1.1)[0], P(0.2, -0.5, 1.1)[1], 14, '#8a2a10') + horse(P(-0.75, -0.65)[0], P(-0.75, -0.65)[1], 16) + torch(P(0.9, -0.1)[0], P(0.9, -0.1)[1], 12),
  sultan: () => shadow() + cityBase('#d8c48a') + box(-0.9, -0.2, 0.8, 0.9, 0.7, '#e4c8a6') + roofFlat(-0.9, -0.2, 0.8, 0.9, 0.7, '#d4b896') + dome(-0.5, 0.25, 0.4, 0.7, '#2a7a6a') + box(0.1, 0.1, 0.8, 0.8, 0.6, '#e4c8a6') + roofFlat(0.1, 0.1, 0.8, 0.8, 0.6, '#d4b896') + cylinder(0.7, -0.6, 0.16, 1.9, '#ead9b6') + dome(0.7, -0.6, 0.2, 1.9, '#2a7a6a') + box(-0.5, -0.9, 0.9, 0.6, 0.9, '#e4c8a6') + dome(-0.05, -0.6, 0.45, 0.9, '#c9a227') + palm(P(0.9, 0.85)[0], P(0.9, 0.85)[1], 18),
  capital: () => shadow(56, 26) + cityBase('#b8a888') + box(-1.0, -1.0, 2.0, 0.3, 0.8, '#9a9080') + box(-1.0, -1.0, 0.3, 2.0, 0.8, '#9a9080') + box(0.7, -1.0, 0.3, 2.0, 0.8, '#8a8070') + box(-1.0, 0.7, 2.0, 0.3, 0.8, '#8a8070') + [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => cylinder(x, y, 0.22, 1.2, '#a8a090') + cone(x, y, 0.28, 1.2, 0.4, '#8b1a1a')).join('') + box(-0.5, -0.5, 1.0, 1.0, 1.3, '#e8dcc0') + columns(-0.4, 0.5, 0.8, 1.3, 4, '#f2ead8') + roofHip(-0.5, -0.5, 1.0, 1.0, 1.3, 0.5, '#c9a227') + flag(P(0, 0, 1.8)[0], P(0, 0, 1.8)[1], 18, '#8b1a1a') + door(P(0, 1.0)[0], P(0, 1.0)[1] + 2, 12, 16, '#1a1410'),
  default: () => shadow() + cityBase('#b8a888') + box(-0.8, 0.0, 0.7, 0.7, 0.7, '#c8b89a') + roofGable(-0.8, 0.0, 0.7, 0.7, 0.7, 0.35, '#8a5a2a') + box(0.2, 0.2, 0.7, 0.6, 0.6, '#c8b89a') + roofGable(0.2, 0.2, 0.7, 0.6, 0.6, 0.3, '#8a5a2a') + box(-0.3, -0.8, 0.9, 0.7, 0.9, '#d8c8a8') + roofHip(-0.3, -0.8, 0.9, 0.7, 0.9, 0.4, '#6a4a2a')
};
M.resources = {
  wood: () => shadow(40, 18) + tree(P(-0.5, -0.4)[0], P(-0.5, -0.4)[1], 40) + tree(P(0.5, -0.6)[0], P(0.5, -0.6)[1], 34) + tree(P(0.0, 0.4)[0], P(0.0, 0.4)[1], 44) + tree(P(0.7, 0.5)[0], P(0.7, 0.5)[1], 30),
  stone: () => shadow(40, 18) + rock(P(-0.4, -0.2)[0], P(-0.4, -0.2)[1], 40, '#8a8a8a') + rock(P(0.45, 0.25)[0], P(0.45, 0.25)[1], 34, '#9a9a9a') + rock(P(0.1, -0.7)[0], P(0.1, -0.7)[1], 24, '#a4a4a4') + rock(P(-0.5, 0.6)[0], P(-0.5, 0.6)[1], 20, '#7a7a7a'),
  iron: () => shadow(40, 18) + poly([P(-0.9, -0.9), P(0.9, -0.9), P(0.9, 0.1), P(-0.9, 0.1)], '#6a5a4a') + poly([P(-0.9, -0.9), P(0.9, -0.9), P(0.6, -0.9, 1.2), P(-0.6, -0.9, 1.2)], '#7a6a5a') + `<path d="M${f1(P(-0.05, -0.1)[0] - 13)},${f1(P(-0.05, -0.1)[1] + 2)} v-14 a13,13 0 0 1 26,0 v14 z" fill="#1a1410"/>` + cart(P(0.4, 0.6)[0], P(0.4, 0.6)[1], 20) + rock(P(-0.7, 0.5)[0], P(-0.7, 0.5)[1], 16, '#7a7a8a'),
  food: () => shadow(40, 18) + poly([P(-1, -1), P(1, -1), P(1, 1), P(-1, 1)], '#b8a040') + wheatRows(-1, -1, 2, 2, 6, '#e8c84a') + fence(-1, -1, 2, 2),
  gold: () => shadow(40, 18) + rock(P(-0.3, -0.2)[0], P(-0.3, -0.2)[1], 38, '#8a7a5a') + rock(P(0.45, 0.3)[0], P(0.45, 0.3)[1], 30, '#9a8a6a') + coins(P(0.0, 0.5)[0], P(0.0, 0.5)[1], 12) + circ(P(-0.35, -0.35)[0], P(-0.35, -0.35)[1] - 14, 5, '#ffd040') + circ(P(0.5, 0.2)[0], P(0.5, 0.2)[1] - 10, 4, '#ffd040')
};
const soldier = (x, y, s, c) => ell(x, y, s * 0.45, s * 0.18, '#000', 'opacity="0.3"') + rect(x - s * 0.22, y - s * 0.95, s * 0.44, s * 0.7, c, 'rx="3"') + circ(x, y - s * 1.1, s * 0.18, '#e8c8a0') + rect(x - s * 0.3, y - s * 1.3, s * 0.6, s * 0.16, '#a8a8b0', 'rx="2"');
M.units = {
  hoplite: () => soldier(P(-0.2, 0.2)[0], P(-0.2, 0.2)[1], 42, '#8b1a1a') + shield(P(-0.2, 0.2)[0] - 16, P(-0.2, 0.2)[1] - 24, 18, '#b8502a') + line(P(-0.2, 0.2)[0] + 18, P(-0.2, 0.2)[1], P(-0.2, 0.2)[0] + 18, P(-0.2, 0.2)[1] - 60, '#8a6a3a', 3) + poly([[P(-0.2, 0.2)[0] + 18, P(-0.2, 0.2)[1] - 70], [P(-0.2, 0.2)[0] + 14, P(-0.2, 0.2)[1] - 58], [P(-0.2, 0.2)[0] + 22, P(-0.2, 0.2)[1] - 58]], '#c0c0c8'),
  archer: () => soldier(P(-0.2, 0.2)[0], P(-0.2, 0.2)[1], 42, '#2f5f2a') + `<path d="M${f1(P(-0.2, 0.2)[0] + 16)},${f1(P(-0.2, 0.2)[1] - 52)} q22,20 0,40" stroke="#8a6a3a" stroke-width="3" fill="none"/>` + line(P(-0.2, 0.2)[0] + 16, P(-0.2, 0.2)[1] - 52, P(-0.2, 0.2)[0] + 16, P(-0.2, 0.2)[1] - 12, '#ddd', 1.2),
  cavalry: () => horse(P(-0.3, 0.3)[0] - 10, P(-0.3, 0.3)[1], 46, '#6a4a2a') + rect(P(-0.3, 0.3)[0] - 4, P(-0.3, 0.3)[1] - 62, 16, 26, '#8b1a1a', 'rx="3"') + circ(P(-0.3, 0.3)[0] + 4, P(-0.3, 0.3)[1] - 68, 7, '#e8c8a0') + line(P(-0.3, 0.3)[0] + 14, P(-0.3, 0.3)[1] - 40, P(-0.3, 0.3)[0] + 26, P(-0.3, 0.3)[1] - 80, '#8a6a3a', 3),
  catapult: () => ell(P(0, 0)[0], P(0, 0)[1], 40, 16, '#000', 'opacity="0.3"') + rect(P(0, 0)[0] - 30, P(0, 0)[1] - 18, 60, 10, '#7a5a30') + wheel(P(0, 0)[0] - 22, P(0, 0)[1] - 6, 10) + wheel(P(0, 0)[0] + 22, P(0, 0)[1] - 6, 10) + poly([[P(0, 0)[0] - 10, P(0, 0)[1] - 18], [P(0, 0)[0] + 10, P(0, 0)[1] - 18], [P(0, 0)[0], P(0, 0)[1] - 46]], '#8a6a3a') + line(P(0, 0)[0] - 26, P(0, 0)[1] - 22, P(0, 0)[0] + 18, P(0, 0)[1] - 60, '#6a4a2a', 4) + circ(P(0, 0)[0] + 20, P(0, 0)[1] - 62, 8, '#555'),
  merchant: () => cart(P(0, 0.2)[0], P(0, 0.2)[1], 44) + crate(P(0, 0.2)[0] - 8, P(0, 0.2)[1] - 24, 12) + crate(P(0, 0.2)[0] + 6, P(0, 0.2)[1] - 24, 10) + horse(P(0.6, -0.3)[0] + 6, P(0.6, -0.3)[1] + 4, 30, '#8a6a4a')
};
function buildMapSprites() {
  const manifest = { cities: [], resources: [], units: [] };
  for (const cat of Object.keys(M)) for (const [name, fn] of Object.entries(M[cat])) { resetSeed(11); writeFile(path.join(OUT, 'map', cat, `${name}.svg`), mapSvg(fn())); manifest[cat].push(name); }
  writeFile(path.join(OUT, 'map', 'manifest.json'), JSON.stringify({ ...manifest, format: 'png', size: 256, anchor: 'bottom-center' }, null, 2));
  return manifest;
}

// ---------------------------------------------------------------------------
// Logo, icon and splash
// ---------------------------------------------------------------------------
function laurel(cx, cy, r, flip) {
  const s = flip ? -1 : 1;
  let out = `<path d="M${f1(cx + s * r * 0.15)},${f1(cy + r * 0.95)} A${f1(r)},${f1(r)} 0 0 ${flip ? 0 : 1} ${f1(cx + s * r * 0.95)},${f1(cy - r * 0.35)}" stroke="#c9a227" stroke-width="${f1(r * 0.035)}" fill="none" stroke-linecap="round"/>`;
  for (let i = 0; i < 8; i++) {
    const a = (-0.42 + i * 0.165) * Math.PI;
    const x = cx + s * Math.cos(a - Math.PI / 2 + (flip ? Math.PI : 0)) * r, y = cy + r * 0.3 + Math.sin(a - Math.PI / 2 + (flip ? Math.PI : 0)) * r;
    const ang = (a * 180) / Math.PI * s + (flip ? 180 : 0);
    out += `<ellipse cx="${f1(x)}" cy="${f1(y)}" rx="${f1(r * 0.16)}" ry="${f1(r * 0.06)}" fill="#d8b43a" transform="rotate(${f1(ang + 60 * s)} ${f1(x)} ${f1(y)})"/>`;
    out += `<ellipse cx="${f1(x)}" cy="${f1(y)}" rx="${f1(r * 0.16)}" ry="${f1(r * 0.06)}" fill="#b8942a" transform="rotate(${f1(ang + 120 * s)} ${f1(x)} ${f1(y)})"/>`;
  }
  return out;
}
function helmet(cx, cy, s) {
  return `<path d="M${f1(cx - s * 0.5)},${f1(cy + s * 0.1)} a${f1(s * 0.5)},${f1(s * 0.55)} 0 0 1 ${f1(s)},0 v${f1(s * 0.12)} h${f1(-s)} z" fill="url(#gold)" stroke="#6a4a10" stroke-width="${f1(s * 0.02)}"/>` +
    `<path d="M${f1(cx - s * 0.5)},${f1(cy + s * 0.22)} q${f1(-s * 0.05)},${f1(s * 0.28)} ${f1(s * 0.18)},${f1(s * 0.42)} h${f1(s * 0.14)} v${f1(-s * 0.42)} z" fill="url(#gold)" stroke="#6a4a10" stroke-width="${f1(s * 0.02)}"/>` +
    `<path d="M${f1(cx + s * 0.5)},${f1(cy + s * 0.22)} q${f1(s * 0.05)},${f1(s * 0.28)} ${f1(-s * 0.18)},${f1(s * 0.42)} h${f1(-s * 0.14)} v${f1(-s * 0.42)} z" fill="url(#gold)" stroke="#6a4a10" stroke-width="${f1(s * 0.02)}"/>` +
    `<path d="M${f1(cx - s * 0.52)},${f1(cy + s * 0.22)} h${f1(s * 1.04)} v${f1(s * 0.06)} h${f1(-s * 1.04)} z" fill="#8a6a10"/>` +
    `<path d="M${f1(cx - s * 0.42)},${f1(cy - s * 0.08)} q${f1(s * 0.42)},${f1(-s * 0.62)} ${f1(s * 0.84)},0 q${f1(-s * 0.1)},${f1(-s * 0.08)} ${f1(-s * 0.2)},${f1(-s * 0.1)} q${f1(-s * 0.22)},${f1(-s * 0.38)} ${f1(-s * 0.44)},0 q${f1(-s * 0.1)},${f1(s * 0.02)} ${f1(-s * 0.2)},${f1(s * 0.1)} z" fill="#b22a1a" stroke="#6a1410" stroke-width="${f1(s * 0.015)}"/>` +
    `<path d="M${f1(cx - s * 0.36)},${f1(cy - s * 0.02)} q${f1(s * 0.36)},${f1(-s * 0.42)} ${f1(s * 0.72)},0" stroke="#e8c547" stroke-width="${f1(s * 0.03)}" fill="none" opacity="0.8"/>` +
    `<circle cx="${f1(cx)}" cy="${f1(cy - s * 0.02)}" r="${f1(s * 0.05)}" fill="#e8c547"/>`;
}
function logoSvg(size, withText = false, bg = true) {
  const cx = size / 2, cy = size / 2, r = size * 0.44;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
<defs>
  <radialGradient id="bg" cx="0.5" cy="0.42" r="0.7"><stop offset="0" stop-color="#3a3228"/><stop offset="0.7" stop-color="#1f1a12"/><stop offset="1" stop-color="#120e08"/></radialGradient>
  <linearGradient id="gold" x1="0" y1="0" x2="0.3" y2="1"><stop offset="0" stop-color="#ffe08a"/><stop offset="0.45" stop-color="#d4af37"/><stop offset="1" stop-color="#8a6414"/></linearGradient>
</defs>
${bg ? `<circle cx="${cx}" cy="${cy}" r="${r + size * 0.04}" fill="url(#bg)"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="url(#gold)" stroke-width="${f1(size * 0.025)}"/><circle cx="${cx}" cy="${cy}" r="${f1(r * 0.93)}" fill="none" stroke="#8a6414" stroke-width="${f1(size * 0.006)}" opacity="0.7"/>` : ''}
${laurel(cx, cy, r * 0.74, false)}${laurel(cx, cy, r * 0.74, true)}
${helmet(cx, cy - size * 0.04, size * 0.44)}
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
// PNG rendering (Playwright / chromium)
// ---------------------------------------------------------------------------
async function renderPngs(mapManifest) {
  let chromium;
  try { ({ chromium } = require('playwright')); } catch (e) { console.error('playwright introuvable: npm i -D playwright (ou NODE_PATH vers une installation globale)'); process.exit(1); }
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 256, height: 256 }, deviceScaleFactor: 1 });
  async function shot(svg, w, h, file, transparent) {
    await page.setViewportSize({ width: w, height: h });
    await page.setContent(`<!doctype html><html><body style="margin:0;background:${transparent ? 'transparent' : '#120e08'}">${svg}</body></html>`);
    await page.screenshot({ path: file, omitBackground: transparent, clip: { x: 0, y: 0, width: w, height: h } });
  }
  let n = 0;
  for (const cat of ['cities', 'resources', 'units']) for (const name of mapManifest[cat]) {
    await shot(fs.readFileSync(path.join(OUT, 'map', cat, `${name}.svg`), 'utf8'), 256, 256, path.join(OUT, 'map', cat, `${name}.png`), true); n++;
  }
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
  const nCity = buildCitySprites();
  const mapManifest = buildMapSprites();
  writeFile(path.join(OUT, 'logo.svg'), logoSvg(240, false, true));
  writeFile(path.join(OUT, 'logo-text.svg'), logoSvg(400, true, true));
  writeFile(path.join(OUT, 'splash.svg'), splashSvg(1024, 1024));
  console.log(`${nCity} sprites ville/champs (SVG), ${Object.values(mapManifest).flat().length} sprites carte (SVG), logo/splash (SVG)`);
  if (WANT_PNG) console.log(`${await renderPngs(mapManifest)} PNG rendus (carte, icônes, splash)`);
})().catch(e => { console.error(e); process.exit(1); });
