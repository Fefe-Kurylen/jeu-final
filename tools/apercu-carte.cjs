#!/usr/bin/env node
// apercu-carte.cjs — dessine la carte du monde d'une graine (vue isométrique du jeu : le nord en haut) et donne ses chiffres.
// Sert à choisir ou vérifier la carte d'un nouveau serveur, sans base de données ni navigateur.
//
//   node tools/apercu-carte.cjs --seed=123456            -> docs/img/cartes/carte-123456.png
//   node tools/apercu-carte.cjs --seeds=0,11,22 --out=dossier
//   node tools/apercu-carte.cjs --random=4               -> 4 graines au hasard (celles qu'un serveur neuf pourrait tirer)
//   node tools/apercu-carte.cjs --server=https://…       -> la carte d'un serveur en service (sa graine, lue dans /api/world/info)
//
// Graine 0 : la carte de référence (celle du serveur déjà ouvert). Les poches de terre qu'aucune armée ne peut atteindre
// sont assombries (ni ville ni point de ressource n'y est posé).
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const Terrain = require('../frontend/js/shared/terrain.js');

const arg = (k) => { const a = process.argv.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : null; };
const outDir = path.resolve(arg('out') || path.join(__dirname, '..', 'docs', 'img', 'cartes'));
const scale = Math.max(1, Math.min(4, Number(arg('scale') || 2)));
let seeds = [];
// une graine valable : un entier de 0 à Terrain.MAX_SEED, comme WORLD_SEED pour le serveur (sinon il la refuserait)
const seedOf = (v) => {
  const n = Number(v);
  if (String(v).trim() === '' || !Number.isInteger(n) || n < 0 || n > Terrain.MAX_SEED) { console.error(`graine « ${v} » refusée : un entier de 0 à ${Terrain.MAX_SEED} est attendu`); process.exit(2); }
  return n;
};
if (arg('seed') !== null) seeds.push(seedOf(arg('seed')));
if (arg('seeds')) seeds.push(...arg('seeds').split(',').map(seedOf));
if (arg('random')) for (let i = 0; i < Number(arg('random')); i++) seeds.push(1 + Math.floor(Math.random() * Terrain.MAX_SEED));

async function main() {
  let serverSignature = null;
  if (arg('server')) {
    const url = arg('server').replace(/\/$/, '') + '/api/world/info';
    let res = await fetch(url);
    for (let i = 0; res.status === 503 && i < 30; i++) { await new Promise(r => setTimeout(r, 2000)); res = await fetch(url); }   // serveur en démarrage
    if (!res.ok) throw new Error(`${url} répond ${res.status}`);
    const info = await res.json();
    if (!Number.isInteger(info.worldSeed)) throw new Error('ce serveur ne publie pas de graine (version d\'avant les cartes au hasard : carte de référence, graine 0)');
    seeds.push(info.worldSeed);
    serverSignature = info.terrainSignature || null;
  }
  if (!seeds.length) { console.log('Usage : node tools/apercu-carte.cjs --seed=<n> | --seeds=a,b,c | --random=<nombre> | --server=<url> [--out=dossier] [--scale=1..4]'); process.exit(0); }

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const FEATURE = {
  river: '#3a76c4', water: '#3a76c4', frozen: '#b4d8f0', oasis: '#3aa0c0', bridge: '#8a5a30', ford: '#c7a86f',
  mountain: '#7a7166', icemountain: '#e4ecf3', mesa: '#b0623a', boulders: '#96918a', tree: '#2e6a2a', snowtree: '#5f8c72',
  dunes: '#dcb873', rocks: '#a3835f', ruins: '#c4ae86'
};
const GROUND = { grass: '#7fae4b', drygrass: '#b9b25a', earth: '#9c7a4e', sand: '#ead59c', snow: '#f3f6f9', ice: '#cde5f4', water: '#3a76c4' };
const BG = hex('#1c2430');

// PNG RGB sans dépendance (zlib de Node)
function png(w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3); }
  const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
  const crc = (b) => { let c = -1; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

function render(seed) {
  Terrain.setWorldSeed(seed);
  const N = Terrain.WORLD_SIZE, W = 2 * N * scale, H = N * scale;
  const rgb = Buffer.alloc(W * H * 3);
  const colorAt = new Map();
  const cell = (x, y) => {
    const k = x + ',' + y;
    let c = colorAt.get(k);
    if (c) return c;
    const t = Terrain.getTerrainType(x, y);
    c = hex(FEATURE[t.feature] || GROUND[Terrain.groundAt(x, y)] || '#7fae4b');
    if (!Terrain.isBlocked(x, y) && !Terrain.isMainland(x, y)) c = c.map(v => Math.round(v * 0.45));   // poche inaccessible
    colorAt.set(k, c);
    return c;
  };
  for (let v = 0; v < H; v++) for (let u = 0; u < W; u++) {
    // écran isométrique du jeu : sx = x - y, sy = (x + y) / 2 ; le nord (x + y petit) en haut
    const sx = u / scale - N, sy = v / scale - N / 2;
    const x = Math.round(sy + sx / 2), y = Math.round(sy - sx / 2);
    const c = Terrain.inWorld(x, y) ? cell(x, y) : BG;
    const o = (v * W + u) * 3; rgb[o] = c[0]; rgb[o + 1] = c[1]; rgb[o + 2] = c[2];
  }
  return png(W, H, rgb);
}

  fs.mkdirSync(outDir, { recursive: true });
  for (const seed of seeds) {
  const file = path.join(outDir, `carte-${seed}.png`);
  fs.writeFileSync(file, render(seed));
  const st = Terrain.worldStats();
  if (serverSignature && seed === seeds[seeds.length - 1] && Terrain.signature !== serverSignature) console.warn(`  ⚠ empreinte ${Terrain.signature} au lieu de ${serverSignature} : ce serveur ne dessine pas la même carte que ce code (version différente)`);
  const pct = (v) => (v * 100).toFixed(1) + ' %';
  console.log(`graine ${seed}${seed === 0 ? ' (carte de référence)' : ''} -> ${path.relative(process.cwd(), file)}`);
  console.log(`  ${Terrain.worldStatsOk(st) ? 'jouable' : 'REFUSÉE par le contrôle'} : neige ${pct(st.snow)}, désert ${pct(st.desert)}, tempéré ${pct(st.temperate)} ; terre ferme d'un seul tenant ${pct(st.mainland)} ; ${st.rivers} rivières, ${st.crossings} passages (${st.bridges} ponts) ; ${st.lakes} lacs, ${st.ranges} chaînes`);
  }
}
main().catch(e => { console.error(e.message); process.exit(1); });
