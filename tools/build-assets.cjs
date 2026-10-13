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
// Primitives — painted isometric style with warm edges. Every primitive consults the palette of
// the faction being generated (CUR) so that walls, roofs, doors, flags, columns and ornaments
// follow its architecture: ROME terracotta tiles & columns, GAUL thatch & timber, GREEK marble &
// pediments, EGYPT sandstone & flat roofs with merlons, HUN felt tents & hides, SULTAN domes & mosaics.
// ---------------------------------------------------------------------------
const STYLE = { line: '#3a2414', lineW: 0.9, lineOp: 0.62, hi: '#fff6d8' };
const OL = (w = STYLE.lineW, op = STYLE.lineOp) => `stroke="${STYLE.line}" stroke-width="${f1(w)}" stroke-opacity="${op}" stroke-linejoin="round" stroke-linecap="round"`;
let CUR = null;                                   // palette of the faction being generated (null = neutral)
let BIOME = 'forest';                             // 'forest' | 'desert' | 'snow': plots, trees and props of the sprites being generated
const BIOME_GROUND = { forest: null, desert: 'sand', snow: 'snow' };
const fid = () => (CUR && CUR.id) || 'ROME';
const WALL_TEX = { ROME: 'stone', GREEK: 'marble', GAUL: 'plank', EGYPT: 'sand', HUN: 'hide', SULTAN: 'plaster' };

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

const GROUND = {
  grass: ['#72ae40', '#4a822a', '#95cc58'], sand: ['#e8d08e', '#c4a65e', '#f6e4ad'], stone: ['#aaa498', '#7c7465', '#c8c1b4'],
  dirt: ['#9e7040', '#6d4824', '#bb8b5b'], water: ['#49a0e6', '#2a6fb5', '#8cd0ff'],
  snow: ['#e6edf4', '#b5c4d2', '#ffffff']
};
// Ground kind actually drawn in the current biome ('crop' = irrigated field, always green)
function biomeGround(kind) {
  if (kind === 'crop') return 'grass';
  if (BIOME_GROUND[BIOME] && kind !== 'water' && kind !== 'stone') return BIOME_GROUND[BIOME];
  return kind;
}
// Closed path through the given points with rounded corners (k = fraction of each edge kept straight)
function roundedPath(points, k) {
  const n = points.length;
  let d = '';
  for (let i = 0; i < n; i++) {
    const p0 = points[i], p1 = points[(i + 1) % n];
    const a = [p0[0] + (p1[0] - p0[0]) * k, p0[1] + (p1[1] - p0[1]) * k], b = [p1[0] - (p1[0] - p0[0]) * k, p1[1] - (p1[1] - p0[1]) * k];
    d += (i === 0 ? `M${f1(a[0])},${f1(a[1])} ` : `Q${f1(p0[0])},${f1(p0[1])} ${f1(a[0])},${f1(a[1])} `) + `L${f1(b[0])},${f1(b[1])} `;
  }
  const p0 = points[0], a = [p0[0] + (points[1][0] - p0[0]) * k, p0[1] + (points[1][1] - p0[1]) * k];
  return d + `Q${f1(p0[0])},${f1(p0[1])} ${f1(a[0])},${f1(a[1])} Z`;
}
// Ground plot: rounded diamond, radial light, painted edge, scattered tufts / pebbles / ripples
function ground(kind = 'grass', spread = 1) {
  kind = biomeGround(kind);
  const [c, dark, light] = GROUND[kind] || GROUND.grass;
  const s = spread;
  const plot = roundedPath([P(-s, -s), P(s, -s), P(s, s), P(-s, s)], 0.16);
  let out = `<path d="${plot}" fill="${rgrad(light, c, 0.5, 0.42, 0.75)}"/><path d="${plot}" fill="url(#gtex)" opacity="0.28"/>` +
    `<path d="${plot}" fill="none" stroke="${dark}" stroke-width="3" stroke-opacity="0.45"/><path d="${plot}" fill="none" ${OL(1.1, 0.55)}/>`;
  resetSeed(5);
  for (let i = 0; i < 8; i++) {
    const [x, y] = P((rnd() * 2 - 1) * s * 0.78, (rnd() * 2 - 1) * s * 0.78);
    if (kind === 'grass') out += `<path d="M${f1(x - 3)},${f1(y)} q1.5,-4.5 3,0 q1.5,-5 3,0" stroke="${dark}" stroke-width="1.1" fill="none" opacity="0.75"/>`;
    else if (kind === 'sand') out += `<path d="M${f1(x - 4)},${f1(y)} q4,-2.5 8,0" stroke="${dark}" stroke-width="1" fill="none" opacity="0.5"/>`;
    else if (kind === 'water') out += ell(x, y, 5, 1.6, light, 'opacity="0.65"');
    else if (kind === 'snow') out += ell(x, y, 3.5, 1.4, i % 2 ? '#ffffff' : dark, i % 2 ? 'opacity="0.9"' : 'opacity="0.35"');
    else out += ell(x, y, 2.2, 1.3, i % 2 ? dark : light, 'opacity="0.75"');
  }
  return out;
}
// Soft contact shadow for objects standing on the ground
function groundShadow(ix, iy, rx, ry) { const [x, y] = P(ix + 0.12, iy + 0.12); return ell(x, y, rx, ry, '#1a0e04', 'opacity="0.22"'); }

// Box with footprint ix0..ix0+w, iy0..iy0+d and height h (units); c = base colour; opts.tex overrides the faction wall texture
function box(ix0, iy0, w, d, h, c, z0 = 0, opts = {}) {
  const f = fid();
  const top = shade(c, 28), left = c, right = shade(c, -22);
  const a = P(ix0, iy0 + d, z0), b = P(ix0 + w, iy0 + d, z0), cc = P(ix0 + w, iy0, z0);
  const a2 = P(ix0, iy0 + d, z0 + h), b2 = P(ix0 + w, iy0 + d, z0 + h), c2 = P(ix0 + w, iy0, z0 + h), d2 = P(ix0, iy0, z0 + h);
  let out = z0 === 0 ? groundShadow(ix0 + w / 2, iy0 + d / 2, (w + d) * UX * 0.52, (w + d) * UY * 0.52) : '';
  out += poly([a, b, b2, a2], grad(shade(left, 12), shade(left, -12))) + poly([b, cc, c2, b2], grad(shade(right, 6), shade(right, -14))) + poly([d2, c2, b2, a2], top);
  const tex = opts.tex || WALL_TEX[f];
  if (tex && tex !== 'none') out += poly([a, b, b2, a2], `url(#${tex}tex)`) + poly([b, cc, c2, b2], `url(#${tex}tex)`);
  out += poly([a, b, b2, a2], 'url(#gtex)', 'opacity="0.14"') + poly([b, cc, c2, b2], 'url(#gtex)', 'opacity="0.14"') + poly([a, b, b2, a2], 'url(#ao)') + poly([b, cc, c2, b2], 'url(#ao)');
  // Decorative frieze under the roof line: Egyptian gold band, Greek meander, Sultan mosaic
  if (h >= 0.7 && !opts.plain && (f === 'EGYPT' || f === 'GREEK' || f === 'SULTAN')) {
    const zb = z0 + h * 0.8, zt = z0 + h * 0.92;
    const fill = f === 'EGYPT' ? CUR.accent : f === 'GREEK' ? CUR.roof : CUR.accent;
    const L = [P(ix0, iy0 + d, zb), P(ix0 + w, iy0 + d, zb), P(ix0 + w, iy0 + d, zt), P(ix0, iy0 + d, zt)], R = [P(ix0 + w, iy0 + d, zb), P(ix0 + w, iy0, zb), P(ix0 + w, iy0, zt), P(ix0 + w, iy0 + d, zt)];
    out += poly(L, fill, 'opacity="0.85"') + poly(R, shade(fill, -18), 'opacity="0.85"');
    if (f === 'SULTAN') out += poly(L, 'url(#mosaictex)') + poly(R, 'url(#mosaictex)');
    else { const m1 = P(ix0, iy0 + d, (zb + zt) / 2), m2 = P(ix0 + w, iy0 + d, (zb + zt) / 2); out += `<line x1="${f1(m1[0])}" y1="${f1(m1[1])}" x2="${f1(m2[0])}" y2="${f1(m2[1])}" stroke="${f === 'EGYPT' ? '#1a4a8a' : '#f6f2e8'}" stroke-width="1" stroke-dasharray="2 1.5" opacity="0.8"/>`; }
  }
  out += line(b[0], b[1], b2[0], b2[1], shade(c, -42), 1, 'opacity="0.55"') + `<polyline points="${pts([a2, b2, c2])}" fill="none" stroke="${STYLE.hi}" stroke-width="1.3" opacity="0.55"/>`;
  out += poly([a, b, cc, c2, d2, a2], 'none', OL());
  return out;
}
// Flat roof with a parapet of merlons along the two visible edges (Egypt, Sultanate)
function roofFlatParapet(ix0, iy0, w, d, z, c) {
  const o = 0.1;
  const q = [P(ix0 - o, iy0 - o, z), P(ix0 + w + o, iy0 - o, z), P(ix0 + w + o, iy0 + d + o, z), P(ix0 - o, iy0 + d + o, z)];
  const wall = CUR ? CUR.wall : c;
  const top = fid() === 'EGYPT' ? shade(wall, -10) : c;   // Egyptian roofs are sandstone terraces, not coloured
  let out = poly(q, grad(shade(top, 6), shade(top, -12))) + poly(q, 'url(#gtex)', 'opacity="0.14"') + poly(q, 'none', OL());
  const m = 0.14, mh = 0.16;
  const nx = Math.max(2, Math.round(w / 0.42)), ny = Math.max(2, Math.round(d / 0.42));
  for (let i = 0; i < nx; i++) { const ix = ix0 - o + (w + 2 * o - m) * i / (nx - 1); out += box(ix, iy0 + d + o - m, m, m, mh, shade(wall, -6), z, { plain: true, tex: 'none' }); }
  for (let i = 0; i < ny; i++) { const iy = iy0 - o + (d + 2 * o - m) * i / (ny - 1); out += box(ix0 + w + o - m, iy, m, m, mh, shade(wall, -6), z, { plain: true, tex: 'none' }); }
  return out;
}
// Ornament on top of a dome or spire (Sultan crescent, Egyptian gold tip, plain finial elsewhere)
function finial(x, y, s = 1) {
  const f = fid();
  if (f === 'SULTAN') return line(x, y, x, y - 5 * s, '#8a6414', 1.4) + `<path d="M${f1(x - 2.6 * s)},${f1(y - 7 * s)} a${f1(3 * s)},${f1(3 * s)} 0 1 1 ${f1(5.2 * s)},0 a${f1(2.2 * s)},${f1(2.2 * s)} 0 1 0 ${f1(-5.2 * s)},0 z" fill="#e8c547" ${OL(0.8)}/>`;
  if (f === 'EGYPT') return poly([[x - 2 * s, y], [x + 2 * s, y], [x, y - 5 * s]], '#e8c547', OL(0.8));
  return circ(x, y - 1.5 * s, 2 * s, '#e8c547', OL(0.8));
}
// Gable roof along x on top of a box (ridge parallel to ix), faction-styled
function roofGable(ix0, iy0, w, d, z, rh, c) {
  const f = fid();
  if (f === 'EGYPT') return roofFlatParapet(ix0, iy0, w, d, z, c);
  if (f === 'SULTAN') { const r = Math.min(w, d) * 0.3; const [tx, ty] = P(ix0 + w / 2, iy0 + d / 2, z + 0.1); return roofFlatParapet(ix0, iy0, w, d, z, shade(c, 25)) + dome(ix0 + w / 2, iy0 + d / 2, r, z + 0.1, c) + finial(tx, ty - r * UX * 1.41 * 1.05, 0.8); }
  const o = f === 'GAUL' ? 0.3 : 0.2;
  const RH = rh * (f === 'GREEK' ? 0.8 : f === 'GAUL' ? 1.35 : f === 'HUN' ? 1.2 : 1.12);
  const rc = f === 'GAUL' ? CUR.thatch : f === 'HUN' ? CUR.hide : c;
  const bl = P(ix0 - o, iy0 + d + o, z), br = P(ix0 + w + o, iy0 + d + o, z), kr = P(ix0 + w + o, iy0 - o, z);
  const rl = P(ix0 - o, iy0 + d / 2, z + RH), rr = P(ix0 + w + o, iy0 + d / 2, z + RH);
  let out = poly([br, kr, rr], f === 'GREEK' ? grad(shade(CUR.wall, 8), shade(CUR.wall, -14)) : grad(shade(rc, -12), shade(rc, -34))) + poly([bl, br, rr, rl], grad(shade(rc, 20), shade(rc, -14))) + poly([bl, br, rr, rl], 'url(#gtex)', 'opacity="0.12"');
  if (f === 'GAUL') {
    out += poly([bl, br, rr, rl], 'url(#thatchtex)') + poly([br, kr, rr], 'url(#thatchtex)');
    for (const [e, r] of [[bl, rl], [br, rr]]) { const t = 1.12; const p = [e[0] + (r[0] - e[0]) * t, e[1] + (r[1] - e[1]) * t]; out += line(r[0] - 3, p[1] + 2, r[0] + 3, p[1] - 6, '#5a3a1a', 1.6) + line(r[0] + 3, p[1] + 2, r[0] - 3, p[1] - 6, '#5a3a1a', 1.6); }
  } else if (f === 'HUN') {
    out += poly([bl, br, rr, rl], 'url(#hidetex)') + poly([br, kr, rr], 'url(#hidetex)');
    for (let i = 1; i <= 3; i++) { const t = i / 4; out += line(bl[0] + (br[0] - bl[0]) * t, bl[1] + (br[1] - bl[1]) * t, rl[0] + (rr[0] - rl[0]) * t, rl[1] + (rr[1] - rl[1]) * t, '#3a2414', 0.9, 'opacity="0.55"'); }
  } else if (f === 'GREEK') {
    const k = 0.22, tri = [[br[0] + (kr[0] - br[0]) * k * 0.6 + (rr[0] - br[0]) * k * 0.5, br[1] + (kr[1] - br[1]) * k * 0.6 + (rr[1] - br[1]) * k * 0.5], [kr[0] + (br[0] - kr[0]) * k * 0.6 + (rr[0] - kr[0]) * k * 0.5, kr[1] + (br[1] - kr[1]) * k * 0.6 + (rr[1] - kr[1]) * k * 0.5], [rr[0], rr[1] + (br[1] - rr[1]) * k]];
    out += poly(tri, shade(CUR.roof, -5), 'opacity="0.85"') + poly(tri, 'none', OL(0.8));
    for (let i = 1; i <= 6; i++) { const t = i / 7; const x = br[0] + (kr[0] - br[0]) * t, y = br[1] + (kr[1] - br[1]) * t; out += rect(x - 1, y - 3.5, 2, 2.5, shade(CUR.wall, -20)); }
    for (let i = 1; i <= 4; i++) { const t = i / 5; out += line(bl[0] + (rl[0] - bl[0]) * t, bl[1] + (rl[1] - bl[1]) * t, br[0] + (rr[0] - br[0]) * t, br[1] + (rr[1] - br[1]) * t, i % 2 ? shade(rc, -28) : STYLE.hi, 0.8, i % 2 ? 'opacity="0.4"' : 'opacity="0.25"'); }
  } else {
    out += poly([bl, br, rr, rl], 'url(#tiletex)');
    for (let i = 1; i <= 5; i++) { const t = i / 6; out += line(bl[0] + (rl[0] - bl[0]) * t, bl[1] + (rl[1] - bl[1]) * t, br[0] + (rr[0] - br[0]) * t, br[1] + (rr[1] - br[1]) * t, i % 2 ? shade(rc, -34) : STYLE.hi, 0.8, i % 2 ? 'opacity="0.42"' : 'opacity="0.22"'); }
  }
  out += line(rl[0], rl[1], rr[0], rr[1], f === 'GAUL' ? shade(rc, -40) : STYLE.hi, f === 'GAUL' ? 2.4 : 1.8, 'opacity="0.7"');
  out += poly([bl, br, kr, rr, rl], 'none', OL()) + line(br[0], br[1], rr[0], rr[1], STYLE.line, 1.1, `opacity="${STYLE.lineOp}"`);
  return out;
}
// Hip / pyramid roof, faction-styled (Egypt flat, Sultan onion dome, Hun felt yurt, Gaul thatch)
function roofHip(ix0, iy0, w, d, z, rh, c) {
  const f = fid();
  if (f === 'EGYPT') return roofFlatParapet(ix0, iy0, w, d, z, c);
  if (f === 'SULTAN') { const r = Math.min(w, d) * 0.42; const [tx, ty] = P(ix0 + w / 2, iy0 + d / 2, z + 0.08); return roofFlatParapet(ix0, iy0, w, d, z, shade(c, 25)) + dome(ix0 + w / 2, iy0 + d / 2, r, z + 0.08, c) + finial(tx, ty - r * UX * 1.41 * 1.05, 0.9); }
  if (f === 'HUN') return cone(ix0 + w / 2, iy0 + d / 2, Math.max(w, d) * 0.74, z, rh * 0.9, CUR.hide, 'hidetex');
  const o = f === 'GAUL' ? 0.3 : 0.2, RH = rh * (f === 'GREEK' ? 0.8 : f === 'GAUL' ? 1.35 : 1.12);
  const rc = f === 'GAUL' ? CUR.thatch : c;
  const a = P(ix0 - o, iy0 + d + o, z), b = P(ix0 + w + o, iy0 + d + o, z), cc = P(ix0 + w + o, iy0 - o, z), dd = P(ix0 - o, iy0 - o, z);
  const t = P(ix0 + w / 2, iy0 + d / 2, z + RH);
  let out = poly([dd, cc, t], shade(rc, 10)) + poly([a, dd, t], shade(rc, 4)) + poly([b, cc, t], grad(shade(rc, -10), shade(rc, -30))) + poly([a, b, t], grad(shade(rc, 20), shade(rc, -12)));
  const tex = f === 'GAUL' ? 'thatchtex' : 'tiletex';
  out += poly([a, b, t], `url(#${tex})`) + poly([b, cc, t], `url(#${tex})`);
  out += line(a[0], a[1], t[0], t[1], STYLE.hi, 1.3, 'opacity="0.5"');
  out += poly([a, b, cc, dd], 'none', OL()) + line(a[0], a[1], t[0], t[1], STYLE.line, 1.1, `opacity="${STYLE.lineOp}"`) + line(b[0], b[1], t[0], t[1], STYLE.line, 1.1, `opacity="${STYLE.lineOp}"`) + line(cc[0], cc[1], t[0], t[1], STYLE.line, 1.1, `opacity="${STYLE.lineOp}"`);
  if (f !== 'GAUL') out += finial(t[0], t[1], 0.7);
  return out;
}
function roofFlat(ix0, iy0, w, d, z, c) {
  const f = fid();
  if (f === 'EGYPT' || f === 'SULTAN') return roofFlatParapet(ix0, iy0, w, d, z, c);
  const o = 0.12;
  const q = [P(ix0 - o, iy0 - o, z), P(ix0 + w + o, iy0 - o, z), P(ix0 + w + o, iy0 + d + o, z), P(ix0 - o, iy0 + d + o, z)];
  return poly(q, grad(shade(c, 12), shade(c, -6))) + poly(q, 'url(#gtex)', 'opacity="0.14"') + poly(q, 'none', OL());
}
// Cylinder of radius r (units) centred on (ix,iy), from z0 to z0+h
function cylinder(ix, iy, r, h, c, z0 = 0, opts = {}) {
  const [cx, cy] = P(ix, iy, z0), [, cyt] = P(ix, iy, z0 + h);
  const rx = r * UX * 1.41, ry = r * UY * 1.41;
  const tex = opts.tex || WALL_TEX[fid()];
  let out = z0 === 0 ? groundShadow(ix, iy, rx * 1.15, ry * 1.15) : '';
  const body = `M${f1(cx - rx)},${f1(cyt)} v${f1(cy - cyt)} a${f1(rx)},${f1(ry)} 0 0 0 ${f1(rx * 2)},0 v${f1(cyt - cy)} z`;
  out += `<path d="${body}" fill="${grad(shade(c, 16), shade(c, -30), 0, 0, 1, 0)}" ${OL()}/>`;
  if (tex && tex !== 'none') out += `<path d="${body}" fill="url(#${tex}tex)"/>`;
  out += `<path d="${body}" fill="url(#ao)"/>`;
  out += ell(cx, cyt, rx, ry, shade(c, 26), OL()) + line(cx - rx * 0.55, cyt + ry * 0.6, cx - rx * 0.55, cy - ry * 0.4, STYLE.hi, 2.2, 'opacity="0.35"');
  return out;
}
// Cone roof (Gaul thatch, Hun felt, Sultan onion dome, Egypt granary dome)
function cone(ix, iy, r, z0, h, c, tex = null) {
  const f = fid();
  if (f === 'EGYPT' && !tex) return dome(ix, iy, r * 0.95, z0, CUR.wall);
  if (f === 'SULTAN' && !tex) { const [cx, cy] = P(ix, iy, z0); const rx = r * UX * 1.41; return onionDome(ix, iy, r, z0, h * 1.25, c) + finial(cx, cy - h * 1.25 * UZ - rx * 0.1, 0.8); }
  const [cx, cy] = P(ix, iy, z0);
  const rc = f === 'GAUL' && !tex ? CUR.thatch : c;
  const H = h * (f === 'GAUL' && !tex ? 1.35 : 1.2);
  const [, ty] = P(ix, iy, z0 + H);
  const rx = r * UX * 1.41 * (f === 'GAUL' && !tex ? 1.12 : 1), ry = r * UY * 1.41 * (f === 'GAUL' && !tex ? 1.12 : 1);
  const body = `M${f1(cx - rx)},${f1(cy)} a${f1(rx)},${f1(ry)} 0 0 0 ${f1(rx * 2)},0 L${f1(cx)},${f1(ty)} z`;
  let out = `<path d="${body}" fill="${grad(shade(rc, 18), shade(rc, -28), 0, 0, 1, 0)}" ${OL()}/>`;
  const t = tex || (f === 'GAUL' ? 'thatchtex' : f === 'HUN' ? 'hidetex' : 'tiletex');
  out += `<path d="${body}" fill="url(#${t})"/>`;
  out += line(cx - rx * 0.5, cy - ry * 0.1, cx - rx * 0.1, ty + (cy - ty) * 0.25, STYLE.hi, 1.6, 'opacity="0.5"');
  if (f === 'GAUL' && !tex) out += line(cx - 4, ty + 6, cx + 4, ty - 4, '#5a3a1a', 1.6) + line(cx + 4, ty + 6, cx - 4, ty - 4, '#5a3a1a', 1.6);
  return out;
}
function onionDome(ix, iy, r, z0, h, c) {
  const [cx, cy] = P(ix, iy, z0);
  const rx = r * UX * 1.41, ryb = r * UY * 1.41, H = h * UZ;
  const d = `M${f1(cx - rx)},${f1(cy)} C${f1(cx - rx * 1.18)},${f1(cy - H * 0.38)} ${f1(cx - rx * 0.3)},${f1(cy - H * 0.72)} ${f1(cx)},${f1(cy - H)} C${f1(cx + rx * 0.3)},${f1(cy - H * 0.72)} ${f1(cx + rx * 1.18)},${f1(cy - H * 0.38)} ${f1(cx + rx)},${f1(cy)} a${f1(rx)},${f1(ryb)} 0 0 1 ${f1(-rx * 2)},0 z`;
  return `<path d="${d}" fill="${rgrad(shade(c, 30), shade(c, -24), 0.38, 0.3, 0.75)}" ${OL()}/>` + `<path d="${d}" fill="url(#mosaictex)" opacity="0.35"/>` + ell(cx - rx * 0.35, cy - H * 0.5, rx * 0.14, H * 0.16, STYLE.hi, 'opacity="0.45"');
}
function dome(ix, iy, r, z0, c) {
  const f = fid();
  const [cx, cy] = P(ix, iy, z0);
  const rx = r * UX * 1.41, ryt = rx * (f === 'SULTAN' ? 1.15 : 0.95), ryb = r * UY * 1.41;
  let out = `<path d="M${f1(cx - rx)},${f1(cy)} a${f1(rx)},${f1(ryt)} 0 0 1 ${f1(rx * 2)},0 a${f1(rx)},${f1(ryb)} 0 0 1 ${f1(-rx * 2)},0 z" fill="${rgrad(shade(c, 30), shade(c, -24), 0.38, 0.3, 0.75)}" ${OL()}/>`;
  if (f === 'SULTAN') out += `<path d="M${f1(cx - rx)},${f1(cy)} a${f1(rx)},${f1(ryt)} 0 0 1 ${f1(rx * 2)},0 a${f1(rx)},${f1(ryb)} 0 0 1 ${f1(-rx * 2)},0 z" fill="url(#mosaictex)" opacity="0.35"/>`;
  out += ell(cx - rx * 0.35, cy - ryt * 0.55, rx * 0.16, ryt * 0.22, STYLE.hi, 'opacity="0.5"');
  return out;
}
// Striped tent (pyramid) over a square footprint
function tent(ix, iy, r, h, c1, c2) {
  const f = fid();
  const a = P(ix - r, iy + r), b = P(ix + r, iy + r), cc = P(ix + r, iy - r), d = P(ix - r, iy - r), t = P(ix, iy, h * 1.15);
  let out = groundShadow(ix, iy, r * UX * 1.6, r * UY * 1.6);
  out += poly([d, cc, t], shade(c1, 6)) + poly([a, d, t], shade(c2, 8)) + poly([b, cc, t], grad(shade(c2, -8), shade(c2, -26))) + poly([a, b, t], grad(shade(c1, 14), shade(c1, -10)));
  if (f === 'HUN') out += poly([a, b, t], 'url(#hidetex)') + poly([b, cc, t], 'url(#hidetex)');
  out += poly([a, b, cc, d], 'none', OL()) + line(a[0], a[1], t[0], t[1], STYLE.line, 1.1, `opacity="${STYLE.lineOp}"`) + line(b[0], b[1], t[0], t[1], STYLE.line, 1.2, `opacity="${STYLE.lineOp}"`) + line(cc[0], cc[1], t[0], t[1], STYLE.line, 1.1, `opacity="${STYLE.lineOp}"`);
  out += finial(t[0], t[1], 0.8);
  return out;
}
// Props (screen coordinates)
function tree(x, y, s, c = '#3f9430') {
  const dark = shade(c, -18), light = shade(c, 18);
  let out = ell(x + 2, y + 1, s * 0.3, s * 0.1, '#1a0e04', 'opacity="0.22"');
  out += `<path d="M${f1(x - s * 0.1)},${f1(y)} q${f1(-s * 0.02)},${f1(-s * 0.3)} ${f1(s * 0.1)},${f1(-s * 0.42)} q${f1(s * 0.12)},${f1(s * 0.12)} ${f1(s * 0.1)},${f1(s * 0.42)} z" fill="#6b4423" ${OL(1.1)}/>`;
  for (const [b, t, hw] of [[0.25, 0.55, 0.44], [0.5, 0.82, 0.37], [0.72, 1.1, 0.28]]) {
    out += `<path d="M${f1(x - s * hw)},${f1(y - s * b)} q${f1(s * hw * 0.55)},${f1(-s * (t - b) * 0.4)} ${f1(s * hw)},${f1(-s * (t - b))} q${f1(s * hw * 0.45)},${f1(s * (t - b) * 0.6)} ${f1(s * hw)},${f1(s * (t - b))} q${f1(-s * hw * 0.3)},${f1(s * 0.06)} ${f1(-s * hw)},${f1(s * 0.04)} q${f1(-s * hw * 0.7)},${f1(s * 0.02)} ${f1(-s * hw)},${f1(-s * 0.04)} z" fill="${grad(light, dark, 0, 0, 1, 0)}" ${OL(1.2)}/>`;
  }
  out += `<path d="M${f1(x - s * 0.22)},${f1(y - s * 0.5)} q${f1(s * 0.08)},${f1(-s * 0.22)} ${f1(s * 0.2)},${f1(-s * 0.45)}" stroke="${STYLE.hi}" stroke-width="${f1(s * 0.05)}" fill="none" opacity="0.4" stroke-linecap="round"/>`;
  return out;
}
function roundTree(x, y, s, c = '#4f9e36') {
  const dark = shade(c, -16), light = shade(c, 20);
  let out = ell(x + 2, y + 1, s * 0.3, s * 0.1, '#1a0e04', 'opacity="0.22"') + rect(x - s * 0.07, y - s * 0.38, s * 0.14, s * 0.4, '#6b4423', OL(1.1) + ' rx="2"');
  for (const [bx, by, r] of [[0, -0.56, 0.4], [-0.22, -0.7, 0.3], [0.2, -0.74, 0.27], [0, -0.88, 0.24]]) out += circ(x + s * bx, y + s * by, s * r, rgrad(light, dark, 0.4, 0.35, 0.7), OL(1.2));
  out += circ(x - s * 0.12, y - s * 0.8, s * 0.07, STYLE.hi, 'opacity="0.5"');
  return out;
}
// Tall narrow cypress (Greek / Roman landscapes)
function cypress(x, y, s, c = '#2f6a2a') {
  return ell(x + 2, y + 1, s * 0.2, s * 0.07, '#1a0e04', 'opacity="0.22"') + `<path d="M${f1(x - s * 0.16)},${f1(y)} C${f1(x - s * 0.24)},${f1(y - s * 0.5)} ${f1(x - s * 0.1)},${f1(y - s * 1.1)} ${f1(x)},${f1(y - s * 1.3)} C${f1(x + s * 0.1)},${f1(y - s * 1.1)} ${f1(x + s * 0.24)},${f1(y - s * 0.5)} ${f1(x + s * 0.16)},${f1(y)} z" fill="${grad(shade(c, 18), shade(c, -18), 0, 0, 1, 0)}" ${OL(1.1)}/>`;
}
// Olive tree: silvery-green canopy on a twisted trunk
function olive(x, y, s) { return roundTree(x, y, s, '#7f9c62'); }
function palm(x, y, s) {
  const trunk = `M${f1(x)},${f1(y)} q${f1(s * 0.15)},${f1(-s * 0.5)} ${f1(s * 0.1)},${f1(-s * 1.1)}`;
  let out = ell(x + 2, y + 1, s * 0.25, s * 0.08, '#1a0e04', 'opacity="0.22"') + `<path d="${trunk}" stroke="${STYLE.line}" stroke-width="${f1(s * 0.15)}" fill="none" stroke-linecap="round" stroke-opacity="${STYLE.lineOp}"/><path d="${trunk}" stroke="#8a6230" stroke-width="${f1(s * 0.09)}" fill="none" stroke-linecap="round"/>`;
  const fronds = [];
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; fronds.push(`M${f1(x + s * 0.1)},${f1(y - s * 1.1)} q${f1(Math.cos(a) * s * 0.35)},${f1(Math.sin(a) * s * 0.18 - s * 0.05)} ${f1(Math.cos(a) * s * 0.62)},${f1(Math.sin(a) * s * 0.3 + s * 0.15)}`); }
  out += fronds.map(fd => `<path d="${fd}" stroke="${STYLE.line}" stroke-width="${f1(s * 0.14)}" fill="none" stroke-linecap="round" stroke-opacity="${STYLE.lineOp}"/>`).join('') + fronds.map(fd => `<path d="${fd}" stroke="#46a040" stroke-width="${f1(s * 0.08)}" fill="none" stroke-linecap="round"/>`).join('');
  return out;
}
// Snow-capped pine, snowy rock, cactus, dune, mountain, ruins
function snowPine(x, y, s) {
  let out = tree(x, y, s, '#2f6a3a');
  for (const [b, t, hw] of [[0.25, 0.55, 0.44], [0.5, 0.82, 0.37], [0.72, 1.1, 0.28]]) {
    out += `<path d="M${f1(x - s * hw * 0.78)},${f1(y - s * b - s * (t - b) * 0.22)} q${f1(s * hw * 0.4)},${f1(-s * (t - b) * 0.5)} ${f1(s * hw * 0.78)},${f1(-s * (t - b) * 0.78)} q${f1(s * hw * 0.38)},${f1(s * (t - b) * 0.28)} ${f1(s * hw * 0.78)},${f1(s * (t - b) * 0.78)} q${f1(-s * hw * 0.3)},${f1(s * 0.05)} ${f1(-s * hw * 0.55)},0 q${f1(-s * hw * 0.25)},${f1(-s * 0.05)} ${f1(-s * hw * 0.5)},0 q${f1(-s * hw * 0.3)},${f1(s * 0.05)} ${f1(-s * hw * 0.51)},0 z" fill="${grad('#ffffff', '#d8e4ee', 0, 0, 0, 1)}" ${OL(0.9, 0.4)}/>`;
  }
  return out;
}
function snowRock(x, y, s, c = '#8a93a0') {
  return rock(x, y, s, c) + poly([[x - s * 0.35, y - s * 0.45], [x + s * 0.05, y - s * 0.6], [x + s * 0.15, y - s * 0.25], [x - s * 0.2, y - s * 0.15]], '#f4f8fc', OL(0.8, 0.4)) + poly([[x - s * 0.5, y], [x - s * 0.35, y - s * 0.45], [x - s * 0.2, y - s * 0.15], [x - s * 0.3, y + s * 0.1]], '#ffffff', 'opacity="0.55"');
}
function cactus(x, y, s, c = '#4f9a48') {
  const arm = (dx, h, dir) => `<path d="M${f1(x + dx)},${f1(y - s * 0.45)} h${f1(dir * s * 0.22)} v${f1(-h)} a${f1(s * 0.08)},${f1(s * 0.08)} 0 0 1 ${f1(dir * s * 0.16)},0 v${f1(h + s * 0.16)} h${f1(-dir * s * 0.38)} z" fill="${grad(shade(c, 14), shade(c, -16), 0, 0, 1, 0)}" ${OL(1)}/>`;
  return ell(x + 2, y + 1, s * 0.3, s * 0.1, '#1a0e04', 'opacity="0.22"') + arm(-s * 0.1, s * 0.3, -1) + arm(s * 0.1, s * 0.22, 1) +
    `<rect x="${f1(x - s * 0.13)}" y="${f1(y - s * 1.05)}" width="${f1(s * 0.26)}" height="${f1(s * 1.05)}" rx="${f1(s * 0.13)}" fill="${grad(shade(c, 16), shade(c, -18), 0, 0, 1, 0)}" ${OL(1)}/>` +
    line(x - s * 0.04, y - s * 0.95, x - s * 0.04, y - s * 0.1, shade(c, -24), 0.8, 'opacity="0.6"') + line(x + s * 0.05, y - s * 0.95, x + s * 0.05, y - s * 0.1, shade(c, 18), 0.8, 'opacity="0.6"');
}
function dune(x, y, s, c = '#e2c98a') {
  return `<path d="M${f1(x - s)},${f1(y)} q${f1(s * 0.55)},${f1(-s * 0.55)} ${f1(s * 1.1)},${f1(-s * 0.42)} q${f1(s * 0.5)},${f1(s * 0.1)} ${f1(s * 0.9)},${f1(s * 0.42)} z" fill="${grad(shade(c, 14), shade(c, -10), 0, 0, 1, 0)}" ${OL(0.9, 0.45)}/>` +
    `<path d="M${f1(x - s * 0.1)},${f1(y - s * 0.42)} q${f1(s * 0.5)},${f1(s * 0.1)} ${f1(s * 0.9)},${f1(s * 0.42)} L${f1(x - s * 0.1)},${f1(y)} z" fill="${shade(c, -18)}" opacity="0.55"/>` +
    `<path d="M${f1(x - s * 0.8)},${f1(y - s * 0.1)} q${f1(s * 0.3)},${f1(-s * 0.2)} ${f1(s * 0.65)},${f1(-s * 0.3)}" stroke="${shade(c, 28)}" stroke-width="1.2" fill="none" opacity="0.7"/>`;
}
function mountain(x, y, s, icy = false) {
  const c = icy ? '#b8c8d8' : '#8a8478';
  return ell(x + 2, y + 3, s * 0.62, s * 0.18, '#1a0e04', 'opacity="0.22"') +
    poly([[x - s * 0.62, y], [x - s * 0.1, y - s * 0.9], [x + s * 0.12, y - s * 0.55], [x + s * 0.6, y]], grad(shade(c, 12), shade(c, -14), 0, 0, 1, 0), OL(1.1)) +
    poly([[x - s * 0.1, y - s * 0.9], [x + s * 0.12, y - s * 0.55], [x + s * 0.6, y], [x + s * 0.3, y]], shade(c, -26), 'opacity="0.8"') +
    poly([[x - s * 0.1, y - s * 0.9], [x - s * 0.3, y - s * 0.55], [x - s * 0.18, y - s * 0.5], [x - s * 0.04, y - s * 0.6], [x + s * 0.08, y - s * 0.5], [x + s * 0.12, y - s * 0.55]], icy ? '#ffffff' : '#f4f8fc', OL(0.9, 0.4));
}
function ruins() {
  let out = '';
  for (const [ix, iy, h] of [[-0.6, 0.3, 0.9], [-0.2, 0.3, 0.5], [0.2, 0.3, 1.1], [0.6, 0.3, 0.3]]) { const [x, y] = P(ix, iy); out += rect(x - 3.5, y - h * UZ, 7, h * UZ, grad('#e4d4b0', '#b89a6a', 0, 0, 1, 0), OL(1)) + rect(x - 4.5, y - h * UZ - 2, 9, 2.6, '#c9ad80', OL(0.9)); }
  const [bx, by] = P(0.1, -0.5);
  return out + box(-0.1, -0.7, 0.9, 0.35, 0.3, '#d4c096', 0, { plain: true, tex: 'sand' }) + rock(bx + 20, by + 8, 14, '#c9b48a');
}
// Tree of the current biome / faction landscape
function biomeTree(x, y, s, i = 0) {
  if (BIOME === 'desert') return i % 3 === 2 ? cactus(x, y, s * 0.75) : palm(x, y, s * 0.85);
  if (BIOME === 'snow') return snowPine(x, y, s);
  return factionTree(x, y, s, i);
}
// Tree of the current faction's landscape
function factionTree(x, y, s, i = 0) {
  const f = fid();
  if (f === 'EGYPT' || f === 'SULTAN') return palm(x, y, s * 0.85);
  if (f === 'GREEK') return i % 2 ? cypress(x, y, s * 0.8) : olive(x, y, s * 0.9);
  if (f === 'ROME') return i % 3 === 2 ? cypress(x, y, s * 0.8) : roundTree(x, y, s * 0.9);
  if (f === 'HUN') return i % 2 ? tree(x, y, s * 0.9, '#5a8a34') : roundTree(x, y, s * 0.8, '#6a9a3c');
  return tree(x, y, s);
}
function rock(x, y, s, c = '#8f8f8f') {
  return ell(x + 1, y + 2, s * 0.5, s * 0.14, '#1a0e04', 'opacity="0.2"') +
    poly([[x - s * 0.5, y], [x - s * 0.35, y - s * 0.45], [x + s * 0.05, y - s * 0.6], [x + s * 0.5, y - s * 0.2], [x + s * 0.4, y + s * 0.05], [x - s * 0.3, y + s * 0.1]], grad(shade(c, -4), shade(c, -24)), OL(1.2)) +
    poly([[x - s * 0.35, y - s * 0.45], [x + s * 0.05, y - s * 0.6], [x + s * 0.15, y - s * 0.25], [x - s * 0.2, y - s * 0.15]], shade(c, 22));
}
function crate(x, y, s) { return rect(x - s / 2, y - s, s, s, grad('#b8904c', '#9a7238'), OL(1.1)) + line(x - s / 2, y - s, x + s / 2, y, '#6a4a20', 1.1) + line(x + s / 2, y - s, x - s / 2, y, '#6a4a20', 1.1); }
function barrel(x, y, s) { return `<path d="M${f1(x - s * 0.4)},${f1(y - s * 0.85)} q${f1(-s * 0.1)},${f1(s * 0.42)} 0,${f1(s * 0.85)} h${f1(s * 0.8)} q${f1(s * 0.1)},${f1(-s * 0.43)} 0,${f1(-s * 0.85)} z" fill="${grad('#9a6a3c', '#6a4424', 0, 0, 1, 0)}" ${OL(1.1)}/>` + line(x - s * 0.44, y - s * 0.62, x + s * 0.44, y - s * 0.62, '#3a2414', 1.6, 'opacity="0.8"') + line(x - s * 0.44, y - s * 0.25, x + s * 0.44, y - s * 0.25, '#3a2414', 1.6, 'opacity="0.8"') + ell(x, y - s * 0.85, s * 0.4, s * 0.14, '#b08454', OL(1)); }
function amphora(x, y, s) { return ell(x + 1, y + 1, s * 0.3, s * 0.1, '#1a0e04', 'opacity="0.2"') + `<path d="M${f1(x - s * 0.12)},${f1(y)} q${f1(-s * 0.3)},${f1(-s * 0.35)} ${f1(-s * 0.18)},${f1(-s * 0.72)} q${f1(s * 0.05)},${f1(-s * 0.18)} ${f1(s * 0.3)},${f1(-s * 0.2)} q${f1(s * 0.25)},${f1(s * 0.02)} ${f1(s * 0.3)},${f1(s * 0.2)} q${f1(s * 0.12)},${f1(s * 0.37)} ${f1(-s * 0.18)},${f1(s * 0.72)} z" fill="${grad('#c9955a', '#8a5a30', 0, 0, 1, 0)}" ${OL(1)}/>` + `<path d="M${f1(x - s * 0.22)},${f1(y - s * 0.82)} q${f1(-s * 0.16)},${f1(s * 0.12)} ${f1(-s * 0.02)},${f1(s * 0.3)} M${f1(x + s * 0.22)},${f1(y - s * 0.82)} q${f1(s * 0.16)},${f1(s * 0.12)} ${f1(s * 0.02)},${f1(s * 0.3)}" stroke="#6a4424" stroke-width="${f1(s * 0.07)}" fill="none"/>` + line(x - s * 0.22, y - s * 0.55, x + s * 0.22, y - s * 0.55, '#3a2414', 1, 'opacity="0.5"'); }
function obelisk(x, y, s) { return ell(x + 1, y + 1, s * 0.22, s * 0.08, '#1a0e04', 'opacity="0.2"') + poly([[x - s * 0.12, y], [x + s * 0.12, y], [x + s * 0.07, y - s * 1.1], [x - s * 0.07, y - s * 1.1]], grad('#e8d4a0', '#b89860', 0, 0, 1, 0), OL(1)) + poly([[x - s * 0.07, y - s * 1.1], [x + s * 0.07, y - s * 1.1], [x, y - s * 1.3]], '#e8c547', OL(0.9)) + line(x, y - s * 0.2, x, y - s * 0.95, '#8a6a30', 0.8, 'stroke-dasharray="1.5 1.5" opacity="0.8"'); }
function spears(x, y, s) { let out = ''; for (const [dx, a] of [[-4, -12], [0, 0], [4, 12]]) { const r = a * Math.PI / 180; const tx = x + dx + Math.sin(r) * s, ty = y - Math.cos(r) * s; out += line(x + dx, y, tx, ty, STYLE.line, 2.2) + line(x + dx, y, tx, ty, '#8a6230', 1) + poly([[tx - 1.6, ty + 2], [tx + 1.6, ty + 2], [tx, ty - 4]], '#c8c8d0', OL(0.7)); } return out; }
function campfire(x, y, s) { let out = ''; for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; out += ell(x + Math.cos(a) * s * 0.5, y + Math.sin(a) * s * 0.22, s * 0.14, s * 0.09, '#8a8a8a', OL(0.7)); } return out + `<path d="M${f1(x - s * 0.2)},${f1(y)} q${f1(-s * 0.05)},${f1(-s * 0.35)} ${f1(s * 0.2)},${f1(-s * 0.6)} q${f1(s * 0.25)},${f1(s * 0.25)} ${f1(s * 0.2)},${f1(s * 0.6)} z" fill="#ff8a20" ${OL(0.8)}/>` + `<path d="M${f1(x - s * 0.08)},${f1(y)} q0,${f1(-s * 0.2)} ${f1(s * 0.08)},${f1(-s * 0.32)} q${f1(s * 0.08)},${f1(s * 0.12)} ${f1(s * 0.08)},${f1(s * 0.32)} z" fill="#ffe060"/>`; }
function lanternPost(x, y, s) { return line(x, y, x, y - s, STYLE.line, 2.6) + line(x, y, x, y - s, '#8a6230', 1.2) + rect(x - s * 0.14, y - s * 1.25, s * 0.28, s * 0.3, '#ffd060', OL(0.9) + ' rx="1"') + circ(x, y - s * 1.1, s * 0.3, '#ffb020', 'opacity="0.25"') + finial(x, y - s * 1.25, 0.5); }
function stakes(x, y, s) { let out = ''; for (let i = 0; i < 4; i++) { const px = x + i * s * 0.32, py = y - i * s * 0.08; out += line(px, py, px, py - s * (0.7 + (i % 2) * 0.15), STYLE.line, 3.2) + line(px, py, px, py - s * (0.7 + (i % 2) * 0.15), '#9a7340', 1.6) + poly([[px - 1.6, py - s * (0.7 + (i % 2) * 0.15)], [px + 1.6, py - s * (0.7 + (i % 2) * 0.15)], [px, py - s * (0.82 + (i % 2) * 0.15)]], '#9a7340', OL(0.7)); } return out; }
function flag(x, y, h, c) {
  const f = fid();
  const pole = line(x, y, x, y - h, STYLE.line, 3) + line(x, y, x, y - h, '#a0764a', 1.2);
  if (f === 'ROME') { const w = h * 0.55; return pole + line(x - w * 0.55, y - h, x + w * 0.55, y - h, '#8a6414', 1.8) + rect(x - w * 0.5, y - h + 1, w, h * 0.42, grad(shade(c, 14), shade(c, -14)), OL(1)) + line(x - w * 0.5, y - h + 1 + h * 0.42, x + w * 0.5, y - h + 1 + h * 0.42, '#e8c547', 1.4, 'stroke-dasharray="1.5 1"') + circ(x, y - h - 2, 2.4, '#e8c547', OL(0.9)); }
  if (f === 'HUN') { let out = pole + circ(x, y - h, 3, '#e8c547', OL(0.9)); for (const dx of [-3, 0, 3]) out += `<path d="M${f1(x + dx)},${f1(y - h + 2)} q${f1(dx * 0.6 + 2)},${f1(h * 0.2)} ${f1(dx * 1.4 + 3)},${f1(h * 0.42)}" stroke="#2a1a0a" stroke-width="1.3" fill="none" stroke-linecap="round"/>`; return out; }
  if (f === 'EGYPT') { const w = h * 0.3; return pole + `<path d="M${f1(x)},${f1(y - h)} q${f1(w * 0.5)},${f1(-h * 0.05)} ${f1(w)},${f1(0)} l${f1(-w * 0.15)},${f1(h * 0.62)} q${f1(-w * 0.45)},${f1(-h * 0.05)} ${f1(-w * 0.85)},${f1(0)} z" fill="${grad(c, CUR.accent, 0, 0, 0, 1)}" ${OL(1)}/>` + finial(x, y - h, 0.7); }
  const w = h * 0.75;
  return pole + `<path d="M${f1(x)},${f1(y - h)} q${f1(w * 0.5)},${f1(-h * 0.12)} ${f1(w)},${f1(h * 0.02)} l${f1(-w * 0.1)},${f1(h * 0.38)} q${f1(-w * 0.45)},${f1(-h * 0.12)} ${f1(-w * 0.9)},${f1(-h * 0.02)} z" fill="${grad(shade(c, 14), shade(c, -14), 0, 0, 1, 0)}" ${OL(1.1)}/>` + (f === 'SULTAN' ? finial(x, y - h, 0.7) : circ(x, y - h, 2.5, '#f0c940', OL(1)));
}
function chimney(x, y, s) {
  return rect(x - s * 0.2, y - s, s * 0.4, s, grad('#8a7362', '#5e4a3a', 0, 0, 1, 0), OL(1.1)) + rect(x - s * 0.26, y - s * 1.1, s * 0.52, s * 0.16, '#4a3626', OL(1)) +
    circ(x + s * 0.05, y - s * 1.4, s * 0.19, '#e8e2da', OL(1) + ' opacity="0.85"') + circ(x + s * 0.28, y - s * 1.72, s * 0.25, '#f2eee8', OL(1) + ' opacity="0.8"') + circ(x + s * 0.55, y - s * 2.08, s * 0.3, '#f8f6f2', OL(1) + ' opacity="0.7"');
}
function door(x, y, w, h, c = '#3a2414') {
  const f = fid();
  let d;
  if (f === 'SULTAN') d = `M${f1(x - w / 2)},${f1(y)} V${f1(y - (h - w / 2))} Q${f1(x - w / 2)},${f1(y - h)} ${f1(x)},${f1(y - h - w * 0.14)} Q${f1(x + w / 2)},${f1(y - h)} ${f1(x + w / 2)},${f1(y - (h - w / 2))} V${f1(y)} z`;
  else if (f === 'EGYPT') d = `M${f1(x - w / 2)},${f1(y)} L${f1(x - w * 0.4)},${f1(y - h)} L${f1(x + w * 0.4)},${f1(y - h)} L${f1(x + w / 2)},${f1(y)} z`;
  else d = `M${f1(x - w / 2)},${f1(y)} v${f1(-(h - w / 2))} a${f1(w / 2)},${f1(w / 2)} 0 0 1 ${f1(w)},0 v${f1(h - w / 2)} z`;
  let out = `<path d="${d}" fill="${c}" ${OL(1.4)}/>`;
  if (f === 'EGYPT') out += rect(x - w * 0.6, y - h - 2.5, w * 1.2, 2.5, CUR.accent, OL(0.9));
  else if (f === 'GAUL' || f === 'HUN') out += line(x - w * 0.17, y, x - w * 0.17, y - h * 0.8, '#8a6230', 0.8, 'opacity="0.7"') + line(x + w * 0.17, y, x + w * 0.17, y - h * 0.8, '#8a6230', 0.8, 'opacity="0.7"');
  else out += `<path d="M${f1(x - w / 2 + 1.5)},${f1(y)} v${f1(-(h - w / 2) + 0.5)} a${f1(w / 2 - 1.5)},${f1(w / 2 - 1.5)} 0 0 1 ${f1(w - 3)},0" fill="none" stroke="#a07a44" stroke-width="1" opacity="0.6"/>`;
  return out;
}
function windowRect(x, y, w, h, c = '#2a2a3a') {
  const f = fid();
  if (f === 'SULTAN') return `<path d="M${f1(x - w / 2)},${f1(y)} V${f1(y - h + w / 2)} Q${f1(x - w / 2)},${f1(y - h)} ${f1(x)},${f1(y - h - w * 0.12)} Q${f1(x + w / 2)},${f1(y - h)} ${f1(x + w / 2)},${f1(y - h + w / 2)} V${f1(y)} z" fill="${grad('#f6e4a6', c, 0, 0, 0, 1)}" ${OL(1.2)}/>`;
  if (f === 'EGYPT') return rect(x - w * 0.25, y - h, w * 0.5, h, grad('#f6e4a6', c, 0, 0, 0, 1), OL(1.1));
  return rect(x - w / 2, y - h, w, h, grad('#f6e4a6', c, 0, 0, 0, 1), OL(1.2)) + line(x, y - h, x, y, '#3a2414', 0.9, 'opacity="0.7"');
}
function torch(x, y, h) {
  return line(x, y, x, y - h, STYLE.line, 3.2) + line(x, y, x, y - h, '#8a6230', 1.4) + circ(x, y - h, h * 0.42, '#ffb020', 'opacity="0.25"') +
    `<path d="M${f1(x - 3)},${f1(y - h + 1)} q0,-4 3,-7 q3,3 3,7 q0,3 -3,3 q-3,0 -3,-3 z" fill="#ff8a20" ${OL(1)}/>` + `<path d="M${f1(x - 1.4)},${f1(y - h + 1)} q0,-2 1.4,-3.6 q1.4,1.6 1.4,3.6 q0,1.6 -1.4,1.6 q-1.4,0 -1.4,-1.6 z" fill="#ffe060"/>`;
}
function wheatRows(ix0, iy0, w, d, rows, c = '#e8c248') {
  let out = '';
  for (let i = 1; i <= rows; i++) { const t = iy0 + (d * i) / (rows + 1); const a = P(ix0 + 0.1, t), b = P(ix0 + w - 0.1, t); out += line(a[0], a[1], b[0], b[1], shade(c, -30), 2.8, 'opacity="0.5"') + line(a[0], a[1], b[0], b[1], c, 2.2); for (let k = 0; k < 4; k++) { const u = 0.15 + k * 0.23; const q = P(ix0 + 0.1 + (w - 0.2) * u, t); out += line(q[0], q[1], q[0], q[1] - 5.5, shade(c, 12), 1.6); } }
  return out;
}
// Irrigation channels between crop rows (Egypt, Sultanate)
function channels(ix0, iy0, w, d, rows) {
  let out = '';
  for (let i = 0; i <= rows; i++) { const t = iy0 + (d * (i + 0.5)) / (rows + 1); const a = P(ix0, t), b = P(ix0 + w, t); out += line(a[0], a[1], b[0], b[1], '#2a6fb5', 2.2, 'opacity="0.8"') + line(a[0], a[1], b[0], b[1], '#8cd0ff', 0.9, 'opacity="0.7"'); }
  return out;
}
function water(ix, iy, rx, ry, z = 0) { const [x, y] = P(ix, iy, z); return ell(x, y, rx, ry, rgrad('#7cc6f4', '#2f78c2', 0.4, 0.35, 0.8), OL(1.2)) + ell(x - rx * 0.25, y - ry * 0.3, rx * 0.4, ry * 0.26, '#b8e6ff', 'opacity="0.6"') + ell(x + rx * 0.3, y + ry * 0.2, rx * 0.2, ry * 0.14, '#b8e6ff', 'opacity="0.45"'); }
function fence(ix0, iy0, w, d, c = '#9a7340') {
  let out = '';
  const corners = [P(ix0, iy0 + d), P(ix0 + w, iy0 + d), P(ix0 + w, iy0)];
  for (let i = 0; i < corners.length - 1; i++) {
    const a = corners[i], b = corners[i + 1];
    for (const dy of [5, 9]) out += line(a[0], a[1] - dy, b[0], b[1] - dy, STYLE.line, 2.6, 'opacity="0.85"') + line(a[0], a[1] - dy, b[0], b[1] - dy, c, 1.3);
    for (let k = 0; k <= 3; k++) { const x = a[0] + (b[0] - a[0]) * k / 3, y = a[1] + (b[1] - a[1]) * k / 3; out += line(x, y + 1, x, y - 13, STYLE.line, 3.4, 'opacity="0.85"') + line(x, y + 1, x, y - 13, shade(c, -8), 1.8); }
  }
  return out;
}
// Colonnade: Greek fluted marble, Roman plain, Egyptian lotus columns with coloured bands, Sultan arcade, timber posts elsewhere
function columns(ix0, iy0, w, h, n, c = '#efe6d0', z0 = 0) {
  const f = fid();
  const col = f === 'GAUL' || f === 'HUN' ? '#9a7340' : c;
  let out = '';
  const tops = [];
  for (let i = 0; i < n; i++) {
    const [x, y] = P(n > 1 ? ix0 + (w * i) / (n - 1) : ix0, iy0, z0); const top = y - h * UZ;
    tops.push([x, top]);
    out += rect(x - 2.8, top, 5.6, h * UZ, grad(shade(col, 6), shade(col, -16), 0, 0, 1, 0), OL(1.1));
    if (f === 'GREEK') out += line(x - 1.2, top + 3, x - 1.2, y - 3, shade(col, -14), 0.7) + line(x + 1.2, top + 3, x + 1.2, y - 3, shade(col, -14), 0.7) + rect(x - 4.2, top - 2.4, 8.4, 3.4, shade(col, -8), OL(1)) + rect(x - 3.7, y - 2.2, 7.4, 3.2, shade(col, -12), OL(1));
    else if (f === 'EGYPT') out += rect(x - 2.8, top + 4, 5.6, 2.2, CUR.accent) + rect(x - 2.8, top + 8, 5.6, 1.6, CUR.roof) + rect(x - 4, top - 2.6, 8, 3.6, shade(col, -10), OL(1) + ' rx="2"') + rect(x - 3.7, y - 2.2, 7.4, 3.2, shade(col, -12), OL(1));
    else if (f === 'GAUL' || f === 'HUN') out += rect(x - 2.8, top, 5.6, h * UZ, 'url(#planktex)') + rect(x - 3.4, top - 2, 6.8, 2.6, shade(col, -12), OL(1));
    else out += rect(x - 3.9, top - 2.2, 7.8, 3.2, shade(col, -12), OL(1)) + rect(x - 3.7, y - 2.2, 7.4, 3.2, shade(col, -12), OL(1));
  }
  if (f === 'SULTAN') for (let i = 0; i + 1 < tops.length; i++) { const [x1, y1] = tops[i], [x2, y2] = tops[i + 1]; const mx = (x1 + x2) / 2, my = (y1 + y2) / 2; out += `<path d="M${f1(x1)},${f1(y1 + 6)} Q${f1(mx)},${f1(my - 10)} ${f1(x2)},${f1(y2 + 6)}" fill="none" stroke="${shade(col, -18)}" stroke-width="2.2"/>`; }
  return out;
}
function shield(x, y, s, c) { return `<path d="M${f1(x - s * 0.5)},${f1(y - s)} h${f1(s)} v${f1(s * 0.5)} q0,${f1(s * 0.5)} ${f1(-s * 0.5)},${f1(s * 0.7)} q${f1(-s * 0.5)},${f1(-s * 0.2)} ${f1(-s * 0.5)},${f1(-s * 0.7)} z" fill="${grad(shade(c, 12), shade(c, -14))}" ${OL(1.3)}/>` + circ(x, y - s * 0.5, s * 0.14, '#f0c940', OL(0.9)); }
function cart(x, y, s) { return rect(x - s * 0.5, y - s * 0.55, s, s * 0.4, grad('#a07a48', '#7a5830'), OL(1.1)) + circ(x - s * 0.3, y - s * 0.1, s * 0.17, '#5a3a22', OL(1.1)) + circ(x + s * 0.3, y - s * 0.1, s * 0.17, '#5a3a22', OL(1.1)) + line(x + s * 0.5, y - s * 0.4, x + s * 0.85, y - s * 0.35, '#3a2414', 2.4); }
function anvil(x, y, s) { return rect(x - s * 0.3, y - s * 0.25, s * 0.6, s * 0.25, '#3a3a44', OL(1.1)) + rect(x - s * 0.45, y - s * 0.5, s * 0.9, s * 0.22, grad('#6a6a76', '#4a4a56'), OL(1.1)) + poly([[x + s * 0.45, y - s * 0.5], [x + s * 0.7, y - s * 0.45], [x + s * 0.45, y - s * 0.3]], '#55555f', OL(1)); }
function wheel(x, y, r) { let out = circ(x, y, r, '#c8a060', 'opacity="0.25"') + circ(x, y, r, 'none', `stroke="${STYLE.line}" stroke-width="4" stroke-opacity="0.9"`) + circ(x, y, r, 'none', `stroke="#8a6230" stroke-width="2"`); for (let i = 0; i < 4; i++) { const a = i * Math.PI / 4; out += line(x - Math.cos(a) * r, y - Math.sin(a) * r, x + Math.cos(a) * r, y + Math.sin(a) * r, '#5a3a1a', 1.6); } return out + circ(x, y, r * 0.22, '#3a2414'); }
function coins(x, y, s) { let out = ''; for (let i = 0; i < 5; i++) out += ell(x + (i - 2) * s * 0.35, y - (i % 2) * s * 0.3, s * 0.3, s * 0.13, '#f0c940', OL(0.9)); return out; }
function horse(x, y, s, c = '#7a5230') {
  const body = `M${f1(x - s * 0.5)},${f1(y)} v${f1(-s * 0.45)} q0,${f1(-s * 0.25)} ${f1(s * 0.25)},${f1(-s * 0.25)} h${f1(s * 0.45)} q${f1(s * 0.25)},0 ${f1(s * 0.3)},${f1(-s * 0.3)} l${f1(s * 0.15)},${f1(s * 0.05)} l${f1(-s * 0.05)},${f1(s * 0.35)} q${f1(-s * 0.1)},${f1(s * 0.2)} ${f1(-s * 0.3)},${f1(s * 0.2)} v${f1(s * 0.45)} h${f1(-s * 0.12)} v${f1(-s * 0.3)} h${f1(-s * 0.4)} v${f1(s * 0.3)} z`;
  return `<path d="${body}" fill="${grad(shade(c, 14), shade(c, -14))}" ${OL(1.2)}/>` + `<path d="M${f1(x + s * 0.15)},${f1(y - s * 0.7)} q${f1(s * 0.2)},${f1(-s * 0.15)} ${f1(s * 0.45)},${f1(-s * 0.3)}" stroke="#2a1a0a" stroke-width="${f1(s * 0.09)}" fill="none" stroke-linecap="round"/>` + circ(x + s * 0.56, y - s * 0.86, s * 0.045, '#1a0e04');
}
// Small ornaments at the front corners of the plot, by faction (skipped for walls, water, open yards and fields)
const NO_FLOURISH = new Set(['WALL', 'MOAT', 'FARM', 'LUMBER', 'QUARRY', 'IRON_MINE', 'EGYPTIAN_IRRIGATION', 'RALLY_POINT', 'HIDEOUT', 'MARKET']);
function factionFlourish(key) {
  if (NO_FLOURISH.has(key)) return '';
  const f = fid();
  const [lx, ly] = P(-0.9, 0.45), [bx, by] = P(0.52, 0.9);
  const btree = (x, y, sz) => BIOME === 'desert' ? palm(x, y, sz * 1.1) : BIOME === 'snow' ? snowPine(x, y, sz) : null;
  if (f === 'ROME') return amphora(lx, ly, 12) + (btree(bx + 6, by - 2, 14) || roundTree(bx + 6, by - 2, 14, '#4f8e36'));
  if (f === 'GAUL') return stakes(lx - 4, ly, 14) + barrel(bx + 4, by, 9);
  if (f === 'GREEK') return (btree(lx, ly, 18) || olive(lx, ly, 18)) + amphora(bx + 6, by, 11);
  if (f === 'EGYPT') return palm(lx, ly, 20) + obelisk(bx + 8, by, 16);
  if (f === 'HUN') return spears(lx, ly, 20) + campfire(bx + 6, by, 10);
  if (f === 'SULTAN') return palm(lx, ly, 18) + lanternPost(bx + 8, by, 14);
  return '';
}


// ---------------------------------------------------------------------------
// Faction palettes (walls / roofs / accents) for the city view
// ---------------------------------------------------------------------------
const PALETTES = {
  ROME:   { id: 'ROME',   wall: '#e6d4ab', roof: '#d4532c', accent: '#b22a22', trim: '#80552e', ground: 'grass', thatch: '#c2a24e', hide: '#6e5038' },
  GAUL:   { id: 'GAUL',   wall: '#c0a470', roof: '#769a34', accent: '#2f7a3a', trim: '#5e4024', ground: 'grass', thatch: '#c8a85a', hide: '#6e5038' },
  GREEK:  { id: 'GREEK',  wall: '#f2eadb', roof: '#4a7fb8', accent: '#2d5c9c', trim: '#948468', ground: 'grass', thatch: '#c2a24e', hide: '#6e5038' },
  EGYPT:  { id: 'EGYPT',  wall: '#ecd69c', roof: '#2f9e98', accent: '#d9ad2e', trim: '#8e6b36', ground: 'sand', thatch: '#d2b56a', hide: '#8a6a44' },
  HUN:    { id: 'HUN',    wall: '#ae8f6e', roof: '#8e3c26', accent: '#b8341c', trim: '#56351f', ground: 'dirt', thatch: '#b08c4e', hide: '#7a5a3c' },
  SULTAN: { id: 'SULTAN', wall: '#f0e0ba', roof: '#259a86', accent: '#d9ad2e', trim: '#80603c', ground: 'sand', thatch: '#d2b56a', hide: '#8a6a44' }
};

// ---------------------------------------------------------------------------
// Buildings (each returns SVG markup in the 200×120 cell; p = palette)
// ---------------------------------------------------------------------------
const B = {};
B.MAIN_HALL = (p) => ground(p.ground) + box(-0.9, -0.6, 1.8, 1.2, 1.6, p.wall) + columns(-0.8, 0.6, 1.6, 1.6, 4, shade(p.wall, 10)) + roofHip(-0.9, -0.6, 1.8, 1.2, 1.6, 0.6, p.roof) + windowRect(P(0.9, 0.0, 0.9)[0], P(0.9, 0.0, 0.9)[1], 5, 8) + door(P(0.1, 0.6, 0)[0], P(0.1, 0.6, 0)[1] + 1, 9, 15) + flag(P(0, 0, 2.2)[0], P(0, 0, 2.2)[1], 18, p.accent);
B.FARM = (p) => ground('grass') + wheatRows(-0.9, -0.9, 1.8, 1.8, 4) + fence(-0.95, -0.95, 1.9, 1.9) + box(0.3, -0.9, 0.55, 0.45, 0.5, p.trim) + roofGable(0.3, -0.9, 0.55, 0.45, 0.5, 0.35, p.roof);
B.LUMBER = (p) => ground('grass') + biomeTree(P(-0.6, -0.5)[0], P(-0.6, -0.5)[1], 30) + biomeTree(P(0.5, -0.7)[0], P(0.5, -0.7)[1], 26) + biomeTree(P(-0.1, 0.1)[0], P(-0.1, 0.1)[1], 32) + box(0.2, 0.3, 0.7, 0.5, 0.45, p.trim, 0, { tex: 'plank' }) + roofGable(0.2, 0.3, 0.7, 0.5, 0.45, 0.3, '#6a4a2a') + rect(P(-0.7, 0.7)[0] - 10, P(-0.7, 0.7)[1] - 8, 20, 8, '#8a6a3a', 'rx="2"');
B.QUARRY = (p) => ground('stone') + rock(P(-0.4, -0.3)[0], P(-0.4, -0.3)[1], 28) + rock(P(0.4, 0.2)[0], P(0.4, 0.2)[1], 24, '#9a9a9a') + rock(P(0.1, -0.6)[0], P(0.1, -0.6)[1], 18, '#a0a0a0') + line(P(-0.6, 0.6)[0], P(-0.6, 0.6)[1], P(-0.6, 0.6)[0] + 12, P(-0.6, 0.6)[1] - 34, '#6a4a2a', 3) + line(P(-0.6, 0.6)[0] + 12, P(-0.6, 0.6)[1] - 34, P(-0.6, 0.6)[0] + 30, P(-0.6, 0.6)[1] - 24, '#6a4a2a', 3) + crate(P(0.6, 0.7)[0], P(0.6, 0.7)[1], 9);
B.IRON_MINE = (p) => ground('dirt') + poly([P(-0.9, -0.9), P(0.9, -0.9), P(0.9, 0), P(-0.9, 0)], '#6a5a4a', OL(1.3)) + poly([P(-0.9, -0.9), P(0.9, -0.9), P(0.6, -0.9, 1.1), P(-0.6, -0.9, 1.1)], '#7a6a5a', OL(1.3)) + `<path d="M${f1(P(-0.1, -0.2)[0] - 11)},${f1(P(-0.1, -0.2)[1] + 2)} v-12 a11,11 0 0 1 22,0 v12 z" fill="#1a1410"/>` + line(P(-0.8, 0.5)[0], P(-0.8, 0.5)[1], P(0.8, 0.5)[0], P(0.8, 0.5)[1], '#5a4a3a', 2) + line(P(-0.8, 0.7)[0], P(-0.8, 0.7)[1], P(0.8, 0.7)[0], P(0.8, 0.7)[1], '#5a4a3a', 2) + cart(P(0.3, 0.6)[0], P(0.3, 0.6)[1], 18) + rock(P(0.7, -0.4)[0], P(0.7, -0.4)[1] - 6, 12, '#7a7a8a');
B.WAREHOUSE = (p) => ground(p.ground) + box(-0.9, -0.7, 1.8, 1.4, 1.0, p.trim, 0, { tex: 'plank' }) + roofGable(-0.9, -0.7, 1.8, 1.4, 1.0, 0.6, shade(p.roof, -10)) + door(P(0.1, 0.7)[0], P(0.1, 0.7)[1] + 1, 12, 16, '#2a1a0a') + crate(P(0.8, 0.95)[0], P(0.8, 0.95)[1], 9) + crate(P(-0.9, 0.85)[0] - 2, P(-0.9, 0.85)[1], 8);
B.SILO = (p) => ground(p.ground) + cylinder(0, 0, 0.7, 1.8, p.wall) + cone(0, 0, 0.78, 1.8, 0.7, p.roof) + door(P(0.5, 0.5)[0], P(0.5, 0.5)[1] + 1, 8, 12) + wheatRows(-0.95, 0.6, 0.5, 0.35, 1);
B.RALLY_POINT = (p) => ground('dirt') + poly([P(-0.6, -0.6), P(0.6, -0.6), P(0.6, 0.6), P(-0.6, 0.6)], '#9a8a6a') + flag(P(0, 0)[0], P(0, 0)[1], 42, p.accent) + torch(P(-0.7, 0.7)[0], P(-0.7, 0.7)[1], 16) + torch(P(0.7, -0.7)[0], P(0.7, -0.7)[1], 16) + shield(P(0.6, 0.4)[0], P(0.6, 0.4)[1], 12, p.accent) + line(P(-0.5, 0.75)[0], P(-0.5, 0.75)[1], P(-0.5, 0.75)[0] + 10, P(-0.5, 0.75)[1] - 26, '#8a6a3a', 2);
B.BARRACKS = (p) => ground(p.ground) + box(-0.9, -0.5, 1.8, 1.0, 1.1, shade(p.wall, -10)) + roofGable(-0.9, -0.5, 1.8, 1.0, 1.1, 0.45, p.accent) + door(P(0.1, 0.5)[0], P(0.1, 0.5)[1] + 1, 10, 14) + flag(P(-0.9, -0.5, 1.6)[0], P(-0.9, -0.5, 1.6)[1], 16, p.accent) + shield(P(0.95, 0.1, 0.55)[0], P(0.95, 0.1, 0.55)[1], 10, p.accent) + line(P(-0.5, 0.9)[0], P(-0.5, 0.9)[1], P(-0.5, 0.9)[0], P(-0.5, 0.9)[1] - 22, '#aaa', 2) + line(P(-0.35, 0.95)[0], P(-0.35, 0.95)[1], P(-0.35, 0.95)[0], P(-0.35, 0.95)[1] - 20, '#aaa', 2);
B.STABLE = (p) => ground('grass') + box(-0.9, -0.7, 1.5, 1.0, 0.9, p.trim, 0, { tex: 'plank' }) + roofGable(-0.9, -0.7, 1.5, 1.0, 0.9, 0.5, shade(p.roof, -15)) + fence(0.4, -0.2, 0.6, 1.1) + horse(P(0.75, 0.4)[0], P(0.75, 0.4)[1], 20) + door(P(-0.2, 0.3)[0], P(-0.2, 0.3)[1] + 1, 14, 16, '#3a2a1a') + rect(P(-0.9, 0.9)[0] - 8, P(-0.9, 0.9)[1] - 6, 16, 6, '#d8b840');
B.WORKSHOP = (p) => ground('dirt') + box(-0.9, -0.6, 1.5, 1.2, 1.2, '#6a5a4a') + roofFlat(-0.9, -0.6, 1.5, 1.2, 1.2, '#4a4a4a') + chimney(P(-0.5, -0.4, 1.2)[0], P(-0.5, -0.4, 1.2)[1], 14) + wheel(P(0.95, 0.45)[0] + 2, P(0.95, 0.45)[1] - 14, 10) + rect(P(0.5, -0.9, 0.0)[0] - 6, P(0.5, -0.9)[1] - 22, 12, 22, '#8a6a3a') + door(P(0.1, 0.6)[0], P(0.1, 0.6)[1] + 1, 12, 15);
B.ACADEMY = (p) => ground(p.ground) + box(-0.9, -0.7, 1.8, 1.4, 1.1, shade(p.wall, 6)) + columns(-0.8, 0.7, 1.6, 1.1, 5, shade(p.wall, 12)) + roofGable(-0.9, -0.7, 1.8, 1.4, 1.1, 0.5, p.roof) + windowRect(P(0.9, 0.0, 0.7)[0], P(0.9, 0.0, 0.7)[1], 5, 8) + rect(P(0, 0, 1.6)[0] - 6, P(0, 0, 1.6)[1] - 14, 12, 14, '#e8d8a0') + line(P(0, 0, 1.6)[0] - 4, P(0, 0, 1.6)[1] - 10, P(0, 0, 1.6)[0] + 4, P(0, 0, 1.6)[1] - 10, '#8a6a3a', 1) + line(P(0, 0, 1.6)[0] - 4, P(0, 0, 1.6)[1] - 6, P(0, 0, 1.6)[0] + 4, P(0, 0, 1.6)[1] - 6, '#8a6a3a', 1);
B.FORGE = (p) => ground('dirt') + box(-0.9, -0.5, 1.4, 1.0, 1.0, '#5a4a3a') + roofGable(-0.9, -0.5, 1.4, 1.0, 1.0, 0.45, '#3a3a3a') + chimney(P(0.2, -0.3, 1.0)[0], P(0.2, -0.3, 1.0)[1], 16) + anvil(P(0.7, 0.6)[0], P(0.7, 0.6)[1], 18) + circ(P(-0.2, 0.5)[0], P(-0.2, 0.5)[1] - 8, 6, '#ff7a20') + circ(P(-0.2, 0.5)[0], P(-0.2, 0.5)[1] - 9, 3.5, '#ffd040');
B.HIDEOUT = (p) => ground('grass') + ell(P(0.2, 0.2)[0], P(0.2, 0.2)[1], 34, 16, '#4a3a2a') + `<path d="M${f1(P(0.2, 0.2)[0] - 12)},${f1(P(0.2, 0.2)[1] + 2)} v-10 a12,12 0 0 1 24,0 v10 z" fill="#15100a"/>` + biomeTree(P(-0.7, -0.5)[0], P(-0.7, -0.5)[1], 28) + biomeTree(P(0.8, -0.6)[0], P(0.8, -0.6)[1], 22) + rock(P(-0.6, 0.6)[0], P(-0.6, 0.6)[1], 14, '#7a8a6a') + crate(P(0.8, 0.7)[0], P(0.8, 0.7)[1], 7);
B.HEALING_TENT = (p) => ground(p.ground) + tent(0, 0, 0.9, 1.6, '#f0ece0', '#dcd6c6') + rect(P(0.15, 0.95, 0.75)[0] - 2, P(0.15, 0.95, 0.75)[1] - 9, 4, 12, '#c0202a') + rect(P(0.15, 0.95, 0.75)[0] - 6, P(0.15, 0.95, 0.75)[1] - 5, 12, 4, '#c0202a') + barrel(P(-0.95, 0.7)[0], P(-0.95, 0.7)[1], 12);
B.MARKET = (p) => ground(p.ground) + poly([P(-0.9, -0.9), P(0.9, -0.9), P(0.9, 0.9), P(-0.9, 0.9)], '#b8a888') + box(-0.8, -0.8, 1.0, 0.7, 0.5, p.wall) + poly([P(-0.95, -0.95, 0.9), P(0.35, -0.95, 0.9), P(0.35, 0.05, 0.6), P(-0.95, 0.05, 0.6)], p.accent, OL()) + poly([P(-0.95, -0.95, 0.9), P(0.35, -0.95, 0.9), P(0.35, 0.05, 0.6), P(-0.95, 0.05, 0.6)], 'url(#stripes)') + crate(P(0.6, 0.4)[0], P(0.6, 0.4)[1], 10) + crate(P(0.75, 0.75)[0], P(0.75, 0.75)[1], 9) + barrel(P(0.25, 0.8)[0], P(0.25, 0.8)[1], 12) + ell(P(-0.5, 0.6)[0], P(-0.5, 0.6)[1] - 3, 10, 5, '#d8b840');
B.WALL = (p) => ground(p.ground) + box(-1.0, -0.35, 2.0, 0.5, 1.0, shade(p.wall, -22), 0, { tex: 'stone' }) + box(-1.0, -0.4, 0.45, 0.6, 1.45, shade(p.wall, -14), 0, { tex: 'stone' }) + box(0.55, -0.4, 0.45, 0.6, 1.45, shade(p.wall, -14), 0, { tex: 'stone' }) + [-0.45, -0.15, 0.15, 0.45].map(ix => box(ix - 0.1, -0.3, 0.2, 0.2, 0.25, shade(p.wall, -8), 1.0)).join('') + torch(P(-0.78, 0.25, 1.45)[0], P(-0.78, 0.25, 1.45)[1], 10) + torch(P(0.78, 0.25, 1.45)[0], P(0.78, 0.25, 1.45)[1], 10) + door(P(0, 0.15)[0], P(0, 0.15)[1] + 1, 14, 20, '#1a1410');
B.MOAT = (p) => ground('grass') + poly([P(-1, -1), P(1, -1), P(1, 1), P(-1, 1)], '#3f7fbf') + poly([P(-0.55, -0.55), P(0.55, -0.55), P(0.55, 0.55), P(-0.55, 0.55)], '#8a9a6a', OL(1.3)) + poly([P(-0.1, -1), P(0.1, -1), P(0.1, -0.55), P(-0.1, -0.55)], '#8a6a3a') + ell(P(-0.6, 0.7)[0], P(-0.6, 0.7)[1], 8, 3, '#9fd0ff', 'opacity="0.7"') + ell(P(0.7, -0.3)[0], P(0.7, -0.3)[1], 10, 4, '#9fd0ff', 'opacity="0.6"') + line(P(-1, 0.1)[0], P(-1, 0.1)[1] - 3, P(-0.55, 0.1)[0], P(-0.55, 0.1)[1] - 3, '#8a6a3a', 3);
B.MILL = (p) => ground('grass') + cylinder(0.1, 0.1, 0.55, 1.5, p.wall) + cone(0.1, 0.1, 0.62, 1.5, 0.55, p.roof) + (() => { const [x, y] = P(0.1, 0.1, 1.4); const x0 = x - 18, y0 = y + 4; let o = circ(x0, y0, 3, '#5a3a1a'); for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.4; o += line(x0, y0, x0 + Math.cos(a) * 26, y0 + Math.sin(a) * 26, '#8a6a3a', 2.5) + poly([[x0 + Math.cos(a) * 8, y0 + Math.sin(a) * 8], [x0 + Math.cos(a) * 26, y0 + Math.sin(a) * 26], [x0 + Math.cos(a + 0.35) * 24, y0 + Math.sin(a + 0.35) * 24]], '#e8e0d0'); } return o; })() + door(P(0.55, 0.55)[0], P(0.55, 0.55)[1] + 1, 8, 12);
B.BAKERY = (p) => ground(p.ground) + box(-0.8, -0.6, 1.4, 1.1, 0.9, p.wall) + roofGable(-0.8, -0.6, 1.4, 1.1, 0.9, 0.45, p.roof) + chimney(P(0.3, -0.4, 0.9)[0], P(0.3, -0.4, 0.9)[1], 13) + door(P(0, 0.5)[0], P(0, 0.5)[1] + 1, 10, 13) + ell(P(0.75, 0.3)[0], P(0.75, 0.3)[1] - 3, 7, 4, '#d8a050') + ell(P(0.75, 0.6)[0], P(0.75, 0.6)[1] - 3, 7, 4, '#d8a050') + windowRect(P(0.8, -0.2, 0.55)[0], P(0.8, -0.2, 0.55)[1], 5, 7);
B.GREAT_SILO = (p) => ground(p.ground) + cylinder(-0.45, 0.1, 0.55, 1.9, p.wall) + cylinder(0.5, -0.3, 0.55, 2.2, shade(p.wall, -6)) + cone(-0.45, 0.1, 0.62, 1.9, 0.6, p.roof) + cone(0.5, -0.3, 0.62, 2.2, 0.6, p.roof) + door(P(0, 0.6)[0], P(0, 0.6)[1] + 1, 8, 12) + wheatRows(-0.95, 0.65, 0.7, 0.3, 1);
B.GREAT_WAREHOUSE = (p) => ground(p.ground) + box(-1.0, -0.8, 2.0, 1.6, 1.3, shade(p.trim, 5), 0, { tex: 'plank' }) + roofGable(-1.0, -0.8, 2.0, 1.6, 1.3, 0.7, shade(p.roof, -12)) + door(P(0.1, 0.8)[0], P(0.1, 0.8)[1] + 1, 14, 18, '#2a1a0a') + crate(P(0.9, 1.0)[0], P(0.9, 1.0)[1], 9) + crate(P(0.9, 1.0)[0], P(0.9, 1.0)[1] - 9, 9) + barrel(P(-1.0, 0.95)[0], P(-1.0, 0.95)[1], 12);
B.GREAT_BARRACKS = (p) => ground(p.ground) + box(-1.0, -0.7, 2.0, 1.4, 1.4, shade(p.wall, -14)) + roofGable(-1.0, -0.7, 2.0, 1.4, 1.4, 0.5, p.accent) + flag(P(-1.0, -0.7, 1.9)[0], P(-1.0, -0.7, 1.9)[1], 16, p.accent) + flag(P(1.0, -0.7, 1.9)[0], P(1.0, -0.7, 1.9)[1], 16, p.accent) + door(P(0, 0.7)[0], P(0, 0.7)[1] + 1, 12, 16) + shield(P(1.05, -0.2, 0.75)[0], P(1.05, -0.2, 0.75)[1], 10, p.accent) + shield(P(1.05, 0.3, 0.75)[0], P(1.05, 0.3, 0.75)[1], 10, p.accent);
B.GREAT_STABLE = (p) => ground('grass') + box(-1.0, -0.8, 1.5, 1.6, 1.0, p.trim) + roofGable(-1.0, -0.8, 1.5, 1.6, 1.0, 0.6, shade(p.roof, -15)) + fence(0.5, -0.8, 0.5, 1.7) + horse(P(0.75, -0.3)[0], P(0.75, -0.3)[1], 18) + horse(P(0.8, 0.5)[0], P(0.8, 0.5)[1], 18, '#8a6a4a') + door(P(-0.3, 0.8)[0], P(-0.3, 0.8)[1] + 1, 14, 16, '#3a2a1a');
B.EMBASSY = (p) => ground(p.ground) + box(-0.9, -0.6, 1.8, 1.2, 1.4, shade(p.wall, 8)) + columns(-0.8, 0.6, 1.6, 1.4, 4, shade(p.wall, 14)) + roofHip(-0.9, -0.6, 1.8, 1.2, 1.4, 0.5, p.roof) + flag(P(-0.9, -0.6, 1.9)[0], P(-0.9, -0.6, 1.9)[1], 16, p.accent) + flag(P(0.9, -0.6, 1.9)[0], P(0.9, -0.6, 1.9)[1], 16, '#2f5a8a') + door(P(0.1, 0.6)[0], P(0.1, 0.6)[1] + 1, 10, 16);
B.TREASURE_CHAMBER = (p) => ground('stone') + box(-0.8, -0.6, 1.6, 1.2, 1.1, '#8a8a92', 0, { tex: 'stone' }) + roofFlat(-0.8, -0.6, 1.6, 1.2, 1.1, '#6a6a72') + [-0.5, 0, 0.5].map(ix => box(ix - 0.12, -0.6, 0.24, 0.24, 0.25, '#9a9aa2', 1.1)).join('') + door(P(0.1, 0.6)[0], P(0.1, 0.6)[1] + 1, 12, 15, '#2a2a30') + rect(P(0.1, 0.6)[0] - 6, P(0.1, 0.6)[1] - 14, 12, 15, 'none', 'stroke="#c9a227" stroke-width="1.5"') + coins(P(-0.6, 0.85)[0], P(-0.6, 0.85)[1], 10);
B.HERO_MANSION = (p) => ground(p.ground) + box(-0.9, -0.5, 1.4, 1.0, 1.2, shade(p.wall, 4)) + box(0.5, -0.5, 0.5, 0.5, 1.7, shade(p.wall, -6)) + roofHip(-0.9, -0.5, 1.4, 1.0, 1.2, 0.45, p.roof) + cone(0.75, -0.25, 0.4, 1.7, 0.6, p.roof) + flag(P(0.75, -0.25, 2.3)[0], P(0.75, -0.25, 2.3)[1], 14, p.accent) + door(P(-0.2, 0.5)[0], P(-0.2, 0.5)[1] + 1, 10, 14) + windowRect(P(0.5, 0.0, 0.7)[0] + 8, P(0.5, 0.0, 0.7)[1], 5, 8) + biomeTree(P(-0.8, 0.8)[0], P(-0.8, 0.8)[1], 18);
B.WATCHTOWER = (p) => ground('stone') + box(-0.35, -0.35, 0.7, 0.7, 2.6, shade(p.wall, -18), 0, { tex: 'stone' }) + box(-0.45, -0.45, 0.9, 0.9, 0.35, shade(p.wall, -8), 2.6) + roofHip(-0.45, -0.45, 0.9, 0.9, 2.95, 0.5, p.roof) + windowRect(P(0.35, 0.0, 2.0)[0], P(0.35, 0.0, 2.0)[1], 5, 8) + windowRect(P(0.35, 0.0, 1.2)[0], P(0.35, 0.0, 1.2)[1], 5, 8) + torch(P(-0.45, 0.45, 2.95)[0], P(-0.45, 0.45, 2.95)[1], 10) + door(P(0.0, 0.35)[0], P(0.0, 0.35)[1] + 1, 8, 12);
B.FOUNDRY = (p) => ground('dirt') + box(-0.9, -0.6, 1.5, 1.2, 1.1, '#5a4a40') + roofGable(-0.9, -0.6, 1.5, 1.2, 1.1, 0.4, '#3a3634') + chimney(P(-0.4, -0.4, 1.1)[0], P(-0.4, -0.4, 1.1)[1], 20) + chimney(P(0.2, -0.4, 1.1)[0], P(0.2, -0.4, 1.1)[1], 16) + circ(P(0.65, 0.4)[0], P(0.65, 0.4)[1] - 6, 7, '#ff6a10') + circ(P(0.65, 0.4)[0], P(0.65, 0.4)[1] - 7, 4, '#ffd040') + rect(P(0.85, 0.85)[0] - 10, P(0.85, 0.85)[1] - 5, 20, 5, '#7a7a86') + rect(P(0.85, 0.85)[0] - 8, P(0.85, 0.85)[1] - 10, 16, 5, '#8a8a96');
B.STONEMASON = (p) => ground('stone') + box(-0.9, -0.4, 1.3, 0.9, 0.9, shade(p.wall, -10)) + roofGable(-0.9, -0.4, 1.3, 0.9, 0.9, 0.4, p.trim) + rect(P(0.7, 0.3)[0] - 9, P(0.7, 0.3)[1] - 8, 18, 8, '#b0b0b0') + rect(P(0.7, 0.3)[0] - 7, P(0.7, 0.3)[1] - 15, 14, 7, '#c4c4c4') + rect(P(0.5, 0.75)[0] - 8, P(0.5, 0.75)[1] - 7, 16, 7, '#a8a8a8') + line(P(-0.7, 0.8)[0], P(-0.7, 0.8)[1], P(-0.7, 0.8)[0] + 6, P(-0.7, 0.8)[1] - 16, '#6a4a2a', 2.5) + rect(P(-0.7, 0.8)[0] + 3, P(-0.7, 0.8)[1] - 20, 8, 6, '#555');
B.SAWMILL = (p) => ground('grass') + box(-0.9, -0.5, 1.5, 1.0, 0.8, p.trim, 0, { tex: 'plank' }) + roofGable(-0.9, -0.5, 1.5, 1.0, 0.8, 0.45, '#6a4a2a') + wheel(P(0.9, 0.2)[0], P(0.9, 0.2)[1] - 12, 11) + rect(P(-0.5, 0.75)[0] - 14, P(-0.5, 0.75)[1] - 6, 28, 6, '#a07a40', 'rx="3"') + rect(P(-0.5, 0.75)[0] - 12, P(-0.5, 0.75)[1] - 12, 24, 6, '#b08a50', 'rx="3"') + biomeTree(P(0.5, 0.75)[0], P(0.5, 0.75)[1], 18);
B.RESIDENCE = (p) => ground(p.ground) + box(-0.9, -0.5, 1.6, 1.0, 1.1, shade(p.wall, 6)) + roofHip(-0.9, -0.5, 1.6, 1.0, 1.1, 0.5, p.roof) + columns(-0.7, 0.5, 1.2, 1.1, 3, shade(p.wall, 12)) + windowRect(P(0.75, 0.0, 0.7)[0], P(0.75, 0.0, 0.7)[1], 5, 8) + door(P(-0.1, 0.5)[0], P(-0.1, 0.5)[1] + 1, 9, 13) + biomeTree(P(0.85, 0.8)[0], P(0.85, 0.8)[1], 16) + biomeTree(P(-0.9, 0.85)[0], P(-0.9, 0.85)[1], 14);
B.TRADE_OFFICE = (p) => ground(p.ground) + box(-0.9, -0.6, 1.4, 1.2, 1.2, p.wall) + roofHip(-0.9, -0.6, 1.4, 1.2, 1.2, 0.4, p.accent) + poly([P(-0.95, 0.6, 0.75), P(0.55, 0.6, 0.75), P(0.55, 0.95, 0.55), P(-0.95, 0.95, 0.55)], p.accent, OL()) + crate(P(0.8, 0.5)[0], P(0.8, 0.5)[1], 9) + crate(P(0.8, 0.9)[0], P(0.8, 0.9)[1], 9) + cart(P(-0.6, 0.95)[0], P(-0.6, 0.95)[1], 16) + windowRect(P(0.5, -0.2, 0.7)[0] + 4, P(0.5, -0.2, 0.7)[1], 5, 8);
B.ROMAN_THERMAE = (p) => ground('stone') + box(-0.9, -0.9, 1.8, 0.8, 1.0, '#ece4d4') + columns(-0.8, -0.1, 1.6, 1.0, 5, '#f4ecdc') + roofGable(-0.9, -0.9, 1.8, 0.8, 1.0, 0.4, '#b8a090') + water(0, 0.5, 40, 18) + dome(0, -0.5, 0.45, 1.4, '#c8b8a8');
B.GALLIC_BREWERY = (p) => ground('grass') + box(-0.9, -0.6, 1.4, 1.0, 0.9, '#a08060', 0, { tex: 'plank' }) + roofGable(-0.9, -0.6, 1.4, 1.0, 0.9, 0.5, '#8b5a2b') + chimney(P(0.2, -0.4, 0.9)[0], P(0.2, -0.4, 0.9)[1], 12) + barrel(P(0.7, 0.3)[0], P(0.7, 0.3)[1], 13) + barrel(P(0.85, 0.7)[0], P(0.85, 0.7)[1], 13) + barrel(P(0.45, 0.8)[0], P(0.45, 0.8)[1], 12) + door(P(-0.2, 0.4)[0], P(-0.2, 0.4)[1] + 1, 10, 14, '#3a2a1a');
B.GREEK_TEMPLE = (p) => ground('stone') + poly([P(-1, -0.8), P(1, -0.8), P(1, 0.8), P(-1, 0.8)], '#e4dccc') + box(-0.9, -0.7, 1.8, 1.4, 0.25, '#ede6d6') + columns(-0.8, 0.7, 1.6, 1.3, 6, '#faf6ec', 0.25) + columns(0.8, -0.6, 0, 1.3, 1, '#faf6ec', 0.25) + box(-0.6, -0.6, 1.2, 1.1, 1.3, '#f6f2e8', 0.25) + roofGable(-0.95, -0.75, 1.9, 1.5, 1.55, 0.45, '#e0d8c8') + rect(P(0.95, 0.0, 1.0)[0] - 3, P(0.95, 0.0, 1.0)[1] - 10, 6, 10, '#d4af37');
B.EGYPTIAN_IRRIGATION = (p) => ground('sand') + poly([P(-1, -0.2), P(1, -0.2), P(1, 0.2), P(-1, 0.2)], '#3f7fbf') + poly([P(-0.2, -1), P(0.2, -1), P(0.2, 1), P(-0.2, 1)], '#3f7fbf') + ell(P(0.6, 0.0)[0], P(0.6, 0.0)[1] - 1, 9, 3, '#9fd0ff', 'opacity="0.7"') + palm(P(-0.65, -0.6)[0], P(-0.65, -0.6)[1], 26) + palm(P(0.7, 0.65)[0], P(0.7, 0.65)[1], 22) + wheatRows(-0.95, 0.3, 0.7, 0.6, 2, '#7fb050') + wheatRows(0.3, -0.95, 0.6, 0.6, 2, '#7fb050') + wheel(P(0.0, 0.0)[0], P(0.0, 0.0)[1] - 10, 9);
B.HUN_WAR_TENT = (p) => ground('dirt') + tent(0, 0, 1.0, 1.7, '#9b7355', '#7b5a44') + tent(-0.75, 0.55, 0.35, 0.8, '#8a6a4a', '#6b5344') + flag(P(0, 0, 1.7)[0], P(0, 0, 1.7)[1], 16, '#8a2a10') + shield(P(0.85, 0.75)[0], P(0.85, 0.75)[1], 11, '#8a2a10') + line(P(0.6, 0.95)[0], P(0.6, 0.95)[1], P(0.6, 0.95)[0] + 4, P(0.6, 0.95)[1] - 26, '#5a3a1a', 2) + torch(P(-0.9, -0.5)[0], P(-0.9, -0.5)[1], 14);
B.SULTAN_DESERT_OUTPOST = (p) => ground('sand') + box(-0.9, -0.6, 1.5, 1.2, 1.1, '#e4c8a6') + roofFlat(-0.9, -0.6, 1.5, 1.2, 1.1, '#d4b896') + dome(-0.15, 0.0, 0.5, 1.1, '#2a7a6a') + cylinder(0.75, -0.55, 0.18, 2.4, '#ead9b6') + dome(0.75, -0.55, 0.22, 2.4, '#2a7a6a') + door(P(0.1, 0.6)[0], P(0.1, 0.6)[1] + 1, 10, 15, '#3a2a1a') + palm(P(0.9, 0.8)[0], P(0.9, 0.8)[1], 22) + flag(P(0.75, -0.55, 2.75)[0], P(0.75, -0.55, 2.75)[1], 10, '#c9a227');

// Field sprites: growth by tier (1: L1-6, 2: L7-13, 3: L14-20)
const F = {
  FARM: (t) => ground('crop') + ((fid() === 'EGYPT' || fid() === 'SULTAN') ? channels(-0.95, -0.95, 1.9, 1.9, 2 + t * 2) : '') + wheatRows(-0.95, -0.95, 1.9, 1.9, 2 + t * 2) + (t >= 2 ? fence(-1, -1, 2, 2) : '') + (t >= 3 ? box(0.45, -0.95, 0.5, 0.4, 0.5, CUR ? CUR.trim : '#8a6a3a') + roofGable(0.45, -0.95, 0.5, 0.4, 0.5, 0.3, CUR ? CUR.roof : '#b8502a') : ''),
  LUMBER: (t) => ground('grass') + [[-0.6, -0.6, 30], [0.5, -0.7, 26], [-0.1, 0.1, 32], [0.6, 0.4, 24], [-0.7, 0.5, 22], [0.1, -0.9, 20]].slice(0, 2 + t * 1.4 | 0).map(([ix, iy, s], i) => biomeTree(P(ix, iy)[0], P(ix, iy)[1], s, i)).join('') + (t >= 2 ? rect(P(0.7, 0.85)[0] - 12, P(0.7, 0.85)[1] - 7, 24, 7, '#8a6a3a', 'rx="2"') : '') + (t >= 3 ? box(-0.95, 0.5, 0.5, 0.4, 0.4, '#6a4a2a') + roofGable(-0.95, 0.5, 0.5, 0.4, 0.4, 0.25, '#4a3a2a') : ''),
  QUARRY: (t) => ground('stone') + rock(P(-0.4, -0.3)[0], P(-0.4, -0.3)[1], 20 + t * 5) + (t >= 2 ? rock(P(0.4, 0.2)[0], P(0.4, 0.2)[1], 22, '#9a9a9a') + rock(P(0.1, -0.7)[0], P(0.1, -0.7)[1], 16, '#a4a4a4') : '') + (t >= 3 ? line(P(-0.6, 0.6)[0], P(-0.6, 0.6)[1], P(-0.6, 0.6)[0] + 12, P(-0.6, 0.6)[1] - 34, '#6a4a2a', 3) + line(P(-0.6, 0.6)[0] + 12, P(-0.6, 0.6)[1] - 34, P(-0.6, 0.6)[0] + 30, P(-0.6, 0.6)[1] - 24, '#6a4a2a', 3) + crate(P(0.7, 0.7)[0], P(0.7, 0.7)[1], 9) : ''),
  IRON_MINE: (t) => ground('dirt') + poly([P(-0.9, -0.9), P(0.9, -0.9), P(0.9, 0), P(-0.9, 0)], '#6a5a4a', OL(1.3)) + poly([P(-0.9, -0.9), P(0.9, -0.9), P(0.6, -0.9, 0.8 + t * 0.2), P(-0.6, -0.9, 0.8 + t * 0.2)], '#7a6a5a', OL(1.3)) + `<path d="M${f1(P(-0.1, -0.2)[0] - 10)},${f1(P(-0.1, -0.2)[1] + 2)} v-11 a10,10 0 0 1 20,0 v11 z" fill="#1a1410"/>` + (t >= 2 ? line(P(-0.8, 0.5)[0], P(-0.8, 0.5)[1], P(0.8, 0.5)[0], P(0.8, 0.5)[1], '#5a4a3a', 2) + line(P(-0.8, 0.7)[0], P(-0.8, 0.7)[1], P(0.8, 0.7)[0], P(0.8, 0.7)[1], '#5a4a3a', 2) + cart(P(0.3, 0.6)[0], P(0.3, 0.6)[1], 16) : '') + (t >= 3 ? rock(P(0.7, -0.4)[0], P(0.7, -0.4)[1] - 6, 12, '#7a7a8a') + rock(P(-0.75, 0.2)[0], P(-0.75, 0.2)[1], 10, '#8a8a9a') : '')
};

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
const SPRITE_VIEWBOX = '35 -22 130 132';   // diamond centre (100,70) sits at (0.5, 0.697) of the box
const SPRITE_ANCHOR_Y = 92 / 132;
const svgDoc = (inner, vb = SPRITE_VIEWBOX, w = 130, h = 132) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${w}" height="${h}" shape-rendering="geometricPrecision">${DEFS}<defs>${takeDefs()}</defs>${inner}</svg>\n`;

function writeFile(p, content) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, content); }

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

// Scene props for the canvas scenes: transparent 64×84 frame, anchor bottom-centre at (32, 80)
const PROPS = {
  pine: () => tree(32, 78, 48),
  oak: () => roundTree(32, 78, 52),
  rock: () => rock(32, 76, 36),
  palm: () => palm(30, 78, 46),
  cactus: () => cactus(32, 78, 52),
  dune: () => dune(32, 76, 28),
  snowpine: () => snowPine(32, 78, 48),
  snowrock: () => snowRock(32, 76, 36),
  bush: () => circ(22, 73, 9, rgrad('#8ac656', '#4a822a', 0.4, 0.35, 0.7), OL(1.1)) + circ(43, 73, 9, rgrad('#8ac656', '#4a822a', 0.4, 0.35, 0.7), OL(1.1)) + circ(32, 68, 13, rgrad('#9ad25a', '#4e8a2a', 0.4, 0.35, 0.7), OL(1.1)) + circ(28, 62, 3, STYLE.hi, 'opacity="0.5"')
};
function propDoc(inner) { return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 84" width="64" height="84" shape-rendering="geometricPrecision">${DEFS}<defs>${takeDefs()}</defs>${inner}</svg>\n`; }

function buildCitySprites() {
  for (const kind of ['grass', 'dirt', 'sand', 'snow']) writeFile(path.join(OUT, 'terrain', `${kind}.svg`), terrainTile(kind));
  for (const [name, fn] of Object.entries(PROPS)) { resetSeed(9); const inner = fn(); writeFile(path.join(OUT, 'props', `${name}.svg`), propDoc(inner)); }
  const keys = Object.keys(B);
  let n = 0;
  for (const biome of Object.keys(BIOME_GROUND)) {
    BIOME = biome;
    for (const [faction, palette] of Object.entries(PALETTES)) {
      CUR = palette;
      for (const key of keys) { resetSeed(7); const inner = B[key](palette) + factionFlourish(key); writeFile(path.join(OUT, 'buildings', faction, biome, `${key}.svg`), svgDoc(inner)); n++; }
      for (const [type, fn] of Object.entries(F)) for (const tier of [1, 2, 3]) { resetSeed(3); writeFile(path.join(OUT, 'fields', faction, biome, `${type}_${tier}.svg`), svgDoc(fn(tier))); n++; }
    }
  }
  BIOME = 'forest';
  CUR = null;
  writeFile(path.join(OUT, 'buildings', 'manifest.json'), JSON.stringify({ factions: Object.keys(PALETTES), buildings: keys, fields: Object.keys(F), fieldsPerFaction: true, biomes: Object.keys(BIOME_GROUND), tiers: 3, viewBox: SPRITE_VIEWBOX, anchor: { x: 0.5, y: Math.round(SPRITE_ANCHOR_Y * 1000) / 1000 } }, null, 2));
  return n;
}

// ---------------------------------------------------------------------------
// World map sprites: 256×256 box, ground diamond centred at (128, 206), no terrain
// ---------------------------------------------------------------------------
const M = {};
// Diamond centre (CX, CY) of the city frame is placed at (128, MAP_CY) of the 256 box: that is the sprite anchor
const MAP_SCALE = 1.6, MAP_CY = 204;
const mapSvg = (inner) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">${DEFS}<defs>${takeDefs()}</defs><g transform="translate(${f1(128 - CX * MAP_SCALE)},${f1(MAP_CY - CY * MAP_SCALE)}) scale(${MAP_SCALE})">${inner}</g></svg>\n`;
const shadow = (rx = 48, ry = 22) => ell(CX, CY, rx, ry, '#000', 'opacity="0.28"');
const cityBase = (c) => poly([P(-1, -1), P(1, -1), P(1, 1), P(-1, 1)], c, 'opacity="0.95" ' + OL(1.8, 0.8));
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
  iron: () => shadow(40, 18) + poly([P(-0.9, -0.9), P(0.9, -0.9), P(0.9, 0.1), P(-0.9, 0.1)], '#6a5a4a', OL(1.3)) + poly([P(-0.9, -0.9), P(0.9, -0.9), P(0.6, -0.9, 1.2), P(-0.6, -0.9, 1.2)], '#7a6a5a', OL(1.3)) + `<path d="M${f1(P(-0.05, -0.1)[0] - 13)},${f1(P(-0.05, -0.1)[1] + 2)} v-14 a13,13 0 0 1 26,0 v14 z" fill="#1a1410"/>` + cart(P(0.4, 0.6)[0], P(0.4, 0.6)[1], 20) + rock(P(-0.7, 0.5)[0], P(-0.7, 0.5)[1], 16, '#7a7a8a'),
  food: () => shadow(40, 18) + poly([P(-1, -1), P(1, -1), P(1, 1), P(-1, 1)], '#b8a040') + wheatRows(-1, -1, 2, 2, 6, '#e8c84a') + fence(-1, -1, 2, 2),
  gold: () => shadow(40, 18) + rock(P(-0.3, -0.2)[0], P(-0.3, -0.2)[1], 38, '#8a7a5a') + rock(P(0.45, 0.3)[0], P(0.45, 0.3)[1], 30, '#9a8a6a') + coins(P(0.0, 0.5)[0], P(0.0, 0.5)[1], 12) + circ(P(-0.35, -0.35)[0], P(-0.35, -0.35)[1] - 14, 5, '#ffd040') + circ(P(0.5, 0.2)[0], P(0.5, 0.2)[1] - 10, 4, '#ffd040')
};
M.terrain = {
  forest_tree: () => shadow(34, 14) + tree(P(-0.35, 0.15)[0], P(-0.35, 0.15)[1], 44) + roundTree(P(0.4, -0.2)[0], P(0.4, -0.2)[1], 40) + tree(P(0.15, 0.55)[0], P(0.15, 0.55)[1], 34),
  forest_mountain: () => mountain(CX, CY + 8, 72, false),
  desert_dunes: () => dune(P(-0.3, 0.25)[0], P(-0.3, 0.25)[1], 46) + dune(P(0.45, -0.15)[0], P(0.45, -0.15)[1], 36),
  desert_ruins: () => shadow(36, 15) + ruins(),
  desert_rocks: () => shadow(36, 15) + rock(P(-0.35, 0)[0], P(-0.35, 0)[1], 38, '#b07a52') + rock(P(0.4, 0.35)[0], P(0.4, 0.35)[1], 28, '#c48a5e') + cactus(P(0.45, -0.5)[0], P(0.45, -0.5)[1], 34),
  snow_snowtree: () => shadow(34, 14) + snowPine(P(-0.35, 0.15)[0], P(-0.35, 0.15)[1], 44) + snowPine(P(0.4, -0.2)[0], P(0.4, -0.2)[1], 38) + snowRock(P(0.3, 0.6)[0], P(0.3, 0.6)[1], 18),
  snow_icemountain: () => mountain(CX, CY + 8, 72, true)
};
M.resources.wood_desert = () => shadow(40, 18) + palm(P(-0.5, -0.3)[0], P(-0.5, -0.3)[1], 38) + palm(P(0.45, -0.5)[0], P(0.45, -0.5)[1], 32) + palm(P(0.0, 0.45)[0], P(0.0, 0.45)[1], 40) + cactus(P(0.6, 0.5)[0], P(0.6, 0.5)[1], 30);
M.resources.wood_snow = () => shadow(40, 18) + snowPine(P(-0.5, -0.4)[0], P(-0.5, -0.4)[1], 40) + snowPine(P(0.5, -0.6)[0], P(0.5, -0.6)[1], 34) + snowPine(P(0.0, 0.4)[0], P(0.0, 0.4)[1], 44) + snowPine(P(0.7, 0.5)[0], P(0.7, 0.5)[1], 30);
M.resources.stone_snow = () => shadow(40, 18) + snowRock(P(-0.4, -0.2)[0], P(-0.4, -0.2)[1], 40) + snowRock(P(0.45, 0.25)[0], P(0.45, 0.25)[1], 34, '#9aa3b0') + snowRock(P(0.1, -0.7)[0], P(0.1, -0.7)[1], 24, '#a4acb8') + snowRock(P(-0.5, 0.6)[0], P(-0.5, 0.6)[1], 20, '#7a8390');
M.resources.stone_desert = () => shadow(40, 18) + rock(P(-0.4, -0.2)[0], P(-0.4, -0.2)[1], 40, '#b8865a') + rock(P(0.45, 0.25)[0], P(0.45, 0.25)[1], 34, '#c9966a') + rock(P(0.1, -0.7)[0], P(0.1, -0.7)[1], 24, '#d4a070') + rock(P(-0.5, 0.6)[0], P(-0.5, 0.6)[1], 20, '#a07048');
M.resources.food_desert = () => shadow(40, 18) + poly([P(-1, -1), P(1, -1), P(1, 1), P(-1, 1)], '#b8a040') + channels(-1, -1, 2, 2, 6) + wheatRows(-1, -1, 2, 2, 6, '#e8c84a') + palm(P(0.9, -0.9)[0], P(0.9, -0.9)[1], 30);
const soldier = (x, y, s, c) => ell(x, y, s * 0.45, s * 0.18, '#000', 'opacity="0.3"') + rect(x - s * 0.22, y - s * 0.95, s * 0.44, s * 0.7, c, 'rx="3"') + circ(x, y - s * 1.1, s * 0.18, '#e8c8a0') + rect(x - s * 0.3, y - s * 1.3, s * 0.6, s * 0.16, '#a8a8b0', 'rx="2"');
M.units = {
  hoplite: () => soldier(P(-0.2, 0.2)[0], P(-0.2, 0.2)[1], 42, '#8b1a1a') + shield(P(-0.2, 0.2)[0] - 16, P(-0.2, 0.2)[1] - 24, 18, '#b8502a') + line(P(-0.2, 0.2)[0] + 18, P(-0.2, 0.2)[1], P(-0.2, 0.2)[0] + 18, P(-0.2, 0.2)[1] - 60, '#8a6a3a', 3) + poly([[P(-0.2, 0.2)[0] + 18, P(-0.2, 0.2)[1] - 70], [P(-0.2, 0.2)[0] + 14, P(-0.2, 0.2)[1] - 58], [P(-0.2, 0.2)[0] + 22, P(-0.2, 0.2)[1] - 58]], '#c0c0c8'),
  archer: () => soldier(P(-0.2, 0.2)[0], P(-0.2, 0.2)[1], 42, '#2f5f2a') + `<path d="M${f1(P(-0.2, 0.2)[0] + 16)},${f1(P(-0.2, 0.2)[1] - 52)} q22,20 0,40" stroke="#8a6a3a" stroke-width="3" fill="none"/>` + line(P(-0.2, 0.2)[0] + 16, P(-0.2, 0.2)[1] - 52, P(-0.2, 0.2)[0] + 16, P(-0.2, 0.2)[1] - 12, '#ddd', 1.2),
  cavalry: () => horse(P(-0.3, 0.3)[0] - 10, P(-0.3, 0.3)[1], 46, '#6a4a2a') + rect(P(-0.3, 0.3)[0] - 4, P(-0.3, 0.3)[1] - 62, 16, 26, '#8b1a1a', 'rx="3"') + circ(P(-0.3, 0.3)[0] + 4, P(-0.3, 0.3)[1] - 68, 7, '#e8c8a0') + line(P(-0.3, 0.3)[0] + 14, P(-0.3, 0.3)[1] - 40, P(-0.3, 0.3)[0] + 26, P(-0.3, 0.3)[1] - 80, '#8a6a3a', 3),
  catapult: () => ell(P(0, 0)[0], P(0, 0)[1], 40, 16, '#000', 'opacity="0.3"') + rect(P(0, 0)[0] - 30, P(0, 0)[1] - 18, 60, 10, '#7a5a30') + wheel(P(0, 0)[0] - 22, P(0, 0)[1] - 6, 10) + wheel(P(0, 0)[0] + 22, P(0, 0)[1] - 6, 10) + poly([[P(0, 0)[0] - 10, P(0, 0)[1] - 18], [P(0, 0)[0] + 10, P(0, 0)[1] - 18], [P(0, 0)[0], P(0, 0)[1] - 46]], '#8a6a3a') + line(P(0, 0)[0] - 26, P(0, 0)[1] - 22, P(0, 0)[0] + 18, P(0, 0)[1] - 60, '#6a4a2a', 4) + circ(P(0, 0)[0] + 20, P(0, 0)[1] - 62, 8, '#555'),
  merchant: () => cart(P(0, 0.2)[0], P(0, 0.2)[1], 44) + crate(P(0, 0.2)[0] - 8, P(0, 0.2)[1] - 24, 12) + crate(P(0, 0.2)[0] + 6, P(0, 0.2)[1] - 24, 10) + horse(P(0.6, -0.3)[0] + 6, P(0.6, -0.3)[1] + 4, 30, '#8a6a4a')
};
function buildMapSprites() {
  const manifest = { cities: [], resources: [], units: [], terrain: [] };
  const FACTION_OF = { rome: 'ROME', gaul: 'GAUL', greek: 'GREEK', egypt: 'EGYPT', hun: 'HUN', sultan: 'SULTAN' };
  for (const cat of Object.keys(M)) for (const [name, fn] of Object.entries(M[cat])) { resetSeed(11); CUR = cat === 'cities' ? (PALETTES[FACTION_OF[name]] || null) : null; const inner = fn(); writeFile(path.join(OUT, 'map', cat, `${name}.svg`), mapSvg(inner)); manifest[cat].push(name); }
  CUR = null;
  writeFile(path.join(OUT, 'map', 'manifest.json'), JSON.stringify({ ...manifest, format: 'png', size: 512, anchor: { x: 0.5, y: MAP_CY / 256 }, biomes: Object.keys(BIOME_GROUND) }, null, 2));
  return manifest;
}

// ---------------------------------------------------------------------------
// Logo, icon and splash
// ---------------------------------------------------------------------------
// Laurel branch: an arc with pairs of tangent leaves, from the base up to the top (side = 1 right, -1 left)
// ---------------------------------------------------------------------------
// UI icons (64×64, painted style, used by the HUD instead of emoji) -> frontend/assets/images/ui/<name>.svg
// ---------------------------------------------------------------------------
const GOLD = '#e8c547', GOLD_D = '#9a6a14', LEATHER = '#8a5a30';
const I = {};
const ring = (x, y, r, c, w = 2) => circ(x, y, r, 'none', `stroke="${c}" stroke-width="${w}"`);
I.wood = () => {
  const log = (x, y, a) => `<g transform="rotate(${a} ${x} ${y})">` + rect(x - 18, y - 7, 32, 14, grad('#b07a44', '#6e4622', 0, 0, 0, 1), OL(1.6) + ' rx="3"') + line(x - 10, y - 3, x + 8, y - 3, '#d8a870', 1.2, 'opacity="0.6"') + ell(x + 14, y, 5, 7, '#e0b47c', OL(1.4)) + ell(x + 14, y, 2.5, 3.5, '#b8864c', OL(1)) + `</g>`;
  return log(30, 40, -18) + log(34, 24, -18);
};
I.stone = () => poly([[14, 28], [36, 18], [54, 28], [32, 40]], grad('#c9c3b6', '#9a948a', 0, 0, 0, 1), OL(1.6)) + poly([[14, 28], [32, 40], [32, 54], [14, 42]], '#8a8478', OL(1.6)) + poly([[32, 40], [54, 28], [54, 42], [32, 54]], '#6e6860', OL(1.6)) + line(22, 31, 29, 27, '#f4f0e8', 1.4, 'opacity="0.6"');
I.iron = () => poly([[12, 44], [20, 26], [50, 26], [56, 44]], grad('#c8d0dc', '#6c7684', 0, 0, 0, 1), OL(1.6)) + poly([[20, 26], [50, 26], [46, 20], [24, 20]], '#dfe5ee', OL(1.4)) + line(20, 30, 46, 30, '#ffffff', 1.5, 'opacity="0.5"');
I.food = () => { let o = ''; for (const [x, a] of [[22, -14], [32, 0], [42, 14]]) { o += `<g transform="rotate(${a} ${x} 52)">` + line(x, 52, x, 24, '#b88a34', 2.2); for (let i = 0; i < 4; i++) { const y = 26 + i * 6; o += ell(x - 4, y, 4, 2.6, grad('#f4d868', '#c9a227', 0, 0, 0, 1), OL(1) + ` transform="rotate(-30 ${x - 4} ${y})"`) + ell(x + 4, y, 4, 2.6, grad('#f4d868', '#c9a227', 0, 0, 0, 1), OL(1) + ` transform="rotate(30 ${x + 4} ${y})"`); } o += '</g>'; } return o; };
I.gold = () => { let o = ''; for (let i = 0; i < 3; i++) o += ell(28, 48 - i * 6, 16, 6, grad('#ffe08a', '#c9a227', 0, 0, 0, 1), OL(1.4)); return o + circ(42, 26, 11, rgrad('#ffe9a0', '#d4af37', 0.4, 0.35, 0.7), OL(1.5)) + ring(42, 26, 7, '#9a6a14', 1.2) + `<path d="M42,21 l1.5,3.3 3.6,0.3 -2.7,2.4 0.8,3.5 -3.2,-1.9 -3.2,1.9 0.8,-3.5 -2.7,-2.4 3.6,-0.3 z" fill="#9a6a14"/>`; };
I.population = () => circ(24, 22, 7, '#e8c8a0', OL(1.4)) + `<path d="M10,46 q0,-14 14,-14 q14,0 14,14 z" fill="${grad('#b22a22', '#7a1a14', 0, 0, 0, 1)}" ${OL(1.4)}/>` + circ(42, 26, 6, '#e8c8a0', OL(1.4)) + `<path d="M30,50 q0,-12 12,-12 q12,0 12,12 z" fill="${grad('#2d5c9c', '#1c3a68', 0, 0, 0, 1)}" ${OL(1.4)}/>`;
I.build = () => `<g transform="rotate(-40 32 32)">` + rect(29, 24, 6, 32, grad('#b07a44', '#6e4622', 0, 0, 1, 0), OL(1.4) + ' rx="2"') + rect(16, 10, 32, 16, grad('#8a94a0', '#4e5660', 0, 0, 0, 1), OL(1.6) + ' rx="3"') + line(20, 14, 44, 14, '#dfe5ee', 1.5, 'opacity="0.6"') + '</g>';
I.army = () => { const sword = (f) => `<g transform="scale(${f},1) translate(${f === -1 ? -64 : 0},0)">` + poly([[18, 50], [42, 14], [46, 18], [22, 54]], grad('#e6ecf2', '#8a94a0', 0, 0, 1, 0), OL(1.4)) + line(14, 46, 26, 58, '#9a6a14', 4) + circ(13, 59, 3, GOLD, OL(1)) + '</g>'; return sword(1) + sword(-1); };
I.recruit = I.army;
I.city = () => poly([[12, 30], [32, 12], [52, 30]], grad('#e45c2c', '#a83a1a', 0, 0, 0, 1), OL(1.6)) + rect(16, 30, 32, 24, grad('#ecd9ac', '#c0a070', 0, 0, 0, 1), OL(1.6)) + rect(28, 40, 8, 14, '#3a2414') + rect(20, 34, 6, 6, '#f6e4a6', OL(1)) + rect(38, 34, 6, 6, '#f6e4a6', OL(1)) + rect(40, 14, 6, 10, '#8a5a30', OL(1.2));
I.fields = () => poly([[6, 40], [32, 26], [58, 40], [32, 54]], grad('#8ac656', '#4e8a2a', 0, 0, 0, 1), OL(1.6)) + (() => { let o = ''; for (const [x, y] of [[20, 40], [32, 34], [44, 40], [32, 46]]) { o += line(x, y, x, y - 14, '#b88a34', 2) + ell(x, y - 15, 4, 5, grad('#f4d868', '#c9a227', 0, 0, 0, 1), OL(1)); } return o; })();
I.map = () => `<path d="M10,14 q12,-6 22,0 q10,6 22,0 v36 q-12,6 -22,0 q-10,-6 -22,0 z" fill="${grad('#f2e2b8', '#c9ad78', 0, 0, 0, 1)}" ${OL(1.6)}/>` + `<path d="M18,44 q8,-10 14,-4 t14,-10" stroke="#8a5a30" stroke-width="1.8" fill="none" stroke-dasharray="3 2"/>` + line(42, 26, 48, 32, '#b22a22', 2.4) + line(48, 26, 42, 32, '#b22a22', 2.4) + circ(22, 24, 3, '#2a6fb5', OL(1));
I.reports = () => rect(16, 14, 32, 40, grad('#f6ecd0', '#d8c190', 0, 0, 0, 1), OL(1.6) + ' rx="3"') + ell(32, 14, 16, 5, '#c9a66a', OL(1.4)) + ell(32, 54, 16, 5, '#c9a66a', OL(1.4)) + line(22, 26, 42, 26, '#8a6a30', 1.6) + line(22, 33, 42, 33, '#8a6a30', 1.6) + line(22, 40, 36, 40, '#8a6a30', 1.6);
I.ranking = () => `<path d="M18,12 h28 v12 q0,14 -14,16 q-14,-2 -14,-16 z" fill="${grad('#ffe08a', '#c9a227', 0, 0, 0, 1)}" ${OL(1.6)}/>` + `<path d="M18,16 q-10,0 -8,10 q2,8 10,8" fill="none" stroke="#3a2414" stroke-width="5" stroke-opacity="0.6"/><path d="M18,16 q-10,0 -8,10 q2,8 10,8" fill="none" stroke="#c9a227" stroke-width="3"/>` + `<path d="M46,16 q10,0 8,10 q-2,8 -10,8" fill="none" stroke="#3a2414" stroke-width="5" stroke-opacity="0.6"/><path d="M46,16 q10,0 8,10 q-2,8 -10,8" fill="none" stroke="#c9a227" stroke-width="3"/>` + rect(28, 40, 8, 8, '#9a6a14', OL(1.2)) + rect(20, 48, 24, 6, grad('#c9a227', '#8a5a10', 0, 0, 0, 1), OL(1.4) + ' rx="2"') + line(26, 18, 26, 30, '#fff6d8', 2, 'opacity="0.6"');
I.inventory = () => `<path d="M16,28 q16,-10 32,0 l4,22 q-20,10 -40,0 z" fill="${grad('#b07a44', '#6e4622', 0, 0, 0, 1)}" ${OL(1.6)}/>` + `<path d="M22,26 q10,-12 20,0" fill="none" stroke="#3a2414" stroke-width="2.2"/>` + line(20, 30, 44, 30, '#f0c940', 2.4) + circ(32, 42, 4, '#f0c940', OL(1));
I.hero = () => helmet(32, 36, 32);
I.alliance = () => shield(26, 48, 24, '#2d5c9c') + shield(40, 50, 24, '#b22a22');
I.market = () => line(32, 12, 32, 54, '#8a5a30', 3) + line(12, 20, 52, 20, '#8a5a30', 3) + rect(22, 50, 20, 6, '#8a5a30', OL(1.2) + ' rx="2"') + line(18, 20, 18, 36, '#3a2414', 1.2) + line(46, 20, 46, 36, '#3a2414', 1.2) + `<path d="M8,36 h20 q0,8 -10,8 q-10,0 -10,-8 z" fill="${grad('#ffe08a', '#c9a227', 0, 0, 0, 1)}" ${OL(1.3)}/>` + `<path d="M36,36 h20 q0,8 -10,8 q-10,0 -10,-8 z" fill="${grad('#ffe08a', '#c9a227', 0, 0, 0, 1)}" ${OL(1.3)}/>`;
I.settings = () => { let d = ''; for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; d += rect(-4, -26, 8, 10, '#9aa4b0', OL(1.2) + ` rx="2" transform="rotate(${i * 45} 32 32) translate(32 32)"`); } return d + circ(32, 32, 17, grad('#c8d0dc', '#6c7684', 0, 0, 0, 1), OL(1.6)) + circ(32, 32, 7, '#3a2414') + circ(32, 32, 4, '#9aa4b0'); };
I.attack = () => shield(26, 50, 26, '#b22a22') + poly([[30, 48], [52, 12], [56, 16], [34, 52]], grad('#e6ecf2', '#8a94a0', 0, 0, 1, 0), OL(1.4)) + line(26, 44, 38, 56, '#9a6a14', 4);
I.defense = () => shield(32, 52, 34, '#2d5c9c') + line(32, 24, 32, 44, '#f0c940', 2);
I.clock = () => rect(18, 10, 28, 5, '#8a5a30', OL(1.2) + ' rx="1.5"') + rect(18, 49, 28, 5, '#8a5a30', OL(1.2) + ' rx="1.5"') + `<path d="M21,15 h22 q0,12 -8,17 q8,5 8,17 h-22 q0,-12 8,-17 q-8,-5 -8,-17 z" fill="rgba(240,230,200,0.5)" ${OL(1.5)}/>` + `<path d="M24,18 h16 q0,8 -8,12 q-8,-4 -8,-12 z" fill="#e8c547"/>` + `<path d="M26,47 h12 q-2,-6 -6,-8 q-4,2 -6,8 z" fill="#e8c547"/>`;
I.expedition = () => circ(32, 32, 22, grad('#f2e2b8', '#c9ad78', 0, 0, 0, 1), OL(1.8)) + ring(32, 32, 17, '#8a5a30', 1.2) + poly([[32, 14], [36, 32], [32, 36], [28, 32]], '#b22a22', OL(1.2)) + poly([[32, 50], [28, 32], [32, 28], [36, 32]], '#e6ecf2', OL(1.2)) + circ(32, 32, 3, GOLD, OL(1));
I.home = () => poly([[10, 32], [32, 12], [54, 32]], '#b22a22', OL(1.6)) + rect(16, 32, 32, 22, grad('#ecd9ac', '#c0a070', 0, 0, 0, 1), OL(1.6)) + rect(27, 40, 10, 14, '#3a2414');
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
// PNG rendering (Playwright / chromium)
// ---------------------------------------------------------------------------
async function renderPngs(mapManifest) {
  let chromium;
  try { ({ chromium } = require('playwright')); } catch (e) { console.error('playwright introuvable: npm i -D playwright (ou NODE_PATH vers une installation globale)'); process.exit(1); }
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 256, height: 256 }, deviceScaleFactor: 1 });
  const page2x = await browser.newPage({ viewport: { width: 256, height: 256 }, deviceScaleFactor: 2 });   // map sprites: 512 px for high-density screens
  async function shot(svg, w, h, file, transparent, pg = page) {
    await pg.setViewportSize({ width: w, height: h });
    await pg.setContent(`<!doctype html><html><body style="margin:0;background:${transparent ? 'transparent' : '#120e08'}">${svg}</body></html>`);
    await pg.screenshot({ path: file, omitBackground: transparent, clip: { x: 0, y: 0, width: w, height: h } });
  }
  let n = 0;
  for (const cat of ['cities', 'resources', 'units', 'terrain']) for (const name of mapManifest[cat]) {
    await shot(fs.readFileSync(path.join(OUT, 'map', cat, `${name}.svg`), 'utf8'), 256, 256, path.join(OUT, 'map', cat, `${name}.png`), true, page2x); n++;
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
  const nIcons = buildIcons();
  console.log(`${nIcons} icônes d'interface (SVG)`);
  const mapManifest = buildMapSprites();
  writeFile(path.join(OUT, 'logo.svg'), logoSvg(240, false, true));
  writeFile(path.join(OUT, 'logo-text.svg'), logoSvg(400, true, true));
  writeFile(path.join(OUT, 'splash.svg'), splashSvg(1024, 1024));
  console.log(`${nCity} sprites ville/champs (SVG), ${Object.values(mapManifest).flat().length} sprites carte (SVG), logo/splash (SVG)`);
  if (WANT_PNG) console.log(`${await renderPngs(mapManifest)} PNG rendus (carte, icônes, splash)`);
})().catch(e => { console.error(e); process.exit(1); });
