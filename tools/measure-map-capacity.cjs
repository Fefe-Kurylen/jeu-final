#!/usr/bin/env node
// Capacité de la carte d'un monde neuf (décision du 31 octobre 2026, rapport de vérification) : avec le vrai code du jeu,
// sans base de données (une base en mémoire répond aux mêmes requêtes que PostgreSQL), pour chaque graine :
//  1. la carte : taille, part de terre où l'on marche, terre ferme principale, cases où une ville 2 × 2 tient ;
//  2. le semis des points (src/game/seed.js planResourceNodes) : points posés, or, niveaux, zones ;
//  3. les gisements fondables (src/utils/spawn.js footprintFree, le contrôle de la fondation) avant les capitales ;
//  4. les capitales (findFreeSpawn, comme à l'inscription) : posées loin des gisements ou avec la règle d'avant (repli) ;
//  5. les gisements encore fondables après les capitales, par niveau et par zone, puis les colonies vraiment fondées une à
//     une (2 par joueur, config.city.maxSecondaryCities), chaque colonie fondée comptant pour les suivantes ;
//  6. la place qui reste (villes 2 × 2 encore possibles), puis les vrais placements de la fin de partie et des invasions sur
//     cette carte pleine : sites et plans de Merveille (src/services/wonderService.js spawnNodes), donjons d'une invasion
//     (src/services/hordeService.js placeLevel), posés ou non.
// Objectif : au moins (2 × joueurs) × 1,15 gisements fondables après les capitales (4 600 pour 2 000 joueurs).
//   node tools/measure-map-capacity.cjs [--seeds=0,61029,123456] [--players=2000] [--generator=4] [--side=N]
//   essais : --size=<côté> (taille d'essai du générateur), --per-cell=<points par case>, --json
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'measure-only-secret-0123456789abcdef0123456789';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://measure:measure@localhost:5432/measure';   // jamais ouverte
const path = require('path');
const ROOT = path.join(__dirname, '..');
const config = require(path.join(ROOT, 'src', 'config'));
const Terrain = require(path.join(ROOT, 'frontend', 'js', 'shared', 'terrain.js'));
const { planResourceNodes } = require(path.join(ROOT, 'src', 'game', 'seed'));
const { footprintFree, findFreeSpawn, cityGroundOk, CITY_GAP, SIDES, parseSide, sideAt } = require(path.join(ROOT, 'src', 'utils', 'spawn'));
const { NODE_RESOURCE } = require(path.join(ROOT, 'src', 'utils', 'buildingEffects'));
const prisma = require(path.join(ROOT, 'src', 'config', 'database'));
const WS = require(path.join(ROOT, 'src', 'services', 'wonderService'));
const H = require(path.join(ROOT, 'src', 'services', 'hordeService'));

const ARGS = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v === undefined ? true : v]));
const OPT = {
  seeds: String(ARGS.seeds || '0,61029,123456').split(',').map(Number),
  players: Number(ARGS.players || 2000),
  generator: Number(ARGS.generator || Terrain.NEW_GENERATOR),
  side: parseSide(ARGS.side) || 'RANDOM',
  size: ARGS.size ? Number(ARGS.size) : null,
  perCell: ARGS['per-cell'] ? Number(ARGS['per-cell']) : null,
  json: !!ARGS.json
};
const MARGIN = 1.15;   // 15 % de gisements en plus des colonies voulues (décision du 31 octobre 2026)

// ---------- base en mémoire : findFirst sur les formes de requête du jeu (plages, OR de cases, in, not, NOT), create ----------
function table(rows = []) {
  const B = 8, grid = new Map();
  let made = 0;
  const key = (x, y) => Math.floor(x / B) + ',' + Math.floor(y / B);
  const add = (r) => { const k = key(r.x, r.y); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(r); return r; };
  rows.forEach(add);
  const val = (c, v) => {
    if (c === null) return v === null || v === undefined;
    if (typeof c !== 'object') return v === c;
    return (!('in' in c) || c.in.includes(v)) && (!('not' in c) || v !== c.not) && (!('gte' in c) || v >= c.gte) && (!('lte' in c) || v <= c.lte);
  };
  const match = (r, w) => Object.entries(w).every(([k, c]) => (k === 'OR' ? c.some(s => match(r, s)) : k === 'NOT' ? !match(r, c) : val(c, r[k])));
  const range = (c) => (typeof c === 'number' ? [c, c] : c && 'gte' in c && 'lte' in c ? [c.gte, c.lte] : null);
  const candidates = (w) => {
    const rx = range(w.x), ry = range(w.y), out = [];
    if (rx && ry) { for (let gx = Math.floor(rx[0] / B); gx <= Math.floor(rx[1] / B); gx++) for (let gy = Math.floor(ry[0] / B); gy <= Math.floor(ry[1] / B); gy++) out.push(...(grid.get(gx + ',' + gy) || [])); return out; }
    if (w.OR && w.OR.every(s => typeof s.x === 'number' && typeof s.y === 'number')) return [...new Set(w.OR.flatMap(s => grid.get(key(s.x, s.y)) || []))];
    return [...grid.values()].flat();
  };
  return { add, findFirst: async ({ where = {} } = {}) => candidates(where).find(r => match(r, where)) || null, create: async ({ data }) => add({ id: 'nouveau' + (++made), ...data }) };
}
const memoryDb = (nodes) => ({ city: table(), resourceNode: table(nodes), bastion: table(), army: table(), horde: table() });
// Le code du jeu qui lit la base sans la recevoir en paramètre (placements de la fin de partie et des invasions) lit ici la
// base en mémoire ; son tirage au hasard (Math.random) suit celui de la mesure
async function withMemoryDb(db, random, fn) {
  const models = { city: db.city, resourceNode: db.resourceNode, bastion: db.bastion, army: db.army, horde: db.horde };
  const swapped = { ...models, $transaction: async (work) => work(models) };
  const saved = Object.fromEntries(Object.keys(swapped).map(k => [k, prisma[k]]));
  const savedRandom = Math.random;
  Object.assign(prisma, swapped);
  Math.random = random;
  try { return await fn(); } finally { Object.assign(prisma, saved); Math.random = savedRandom; }
}

// ---------- tirage fixé par graine (mulberry32) : deux mesures de la même graine donnent les mêmes chiffres ----------
function rng(seed) { let a = (seed ^ 0x2545f491) >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const FOUNDABLE = new Set(Object.keys(NODE_RESOURCE));
const byLevel = (list) => [1, 2, 3].map(l => list.filter(n => n.level === l).length);
// zones : cercle du centre (config.map.centerRadiusPct), bande de départ des capitales (config.map.spawnEdgeDelta depuis un
// bord), et l'entre-deux
function zoneOf(x, y) {
  const { minCoord: MIN, maxCoord: MAX, spawnEdgeDelta: DELTA, centerRadiusPct } = config.map;
  if (Math.hypot(x, y) < Math.floor(Terrain.WORLD_SIZE / 2) * centerRadiusPct / 100) return 'centre';
  return Math.min(x - MIN, MAX - x, y - MIN, MAX - y) < DELTA ? 'bord' : 'milieu';
}
const ZONES = ['centre', 'milieu', 'bord'];
const byZone = (list) => ZONES.map(z => list.filter(n => zoneOf(n.x, n.y) === z).length);
async function foundable(nodes, db) {
  const out = [];
  for (const n of nodes) if (FOUNDABLE.has(n.resourceType) && !n.cityId && (await footprintFree(n.x, n.y, { ignoreNodeId: n.id, db }))) out.push(n);
  return out;
}
// cases où une ville 2 × 2 tiendrait encore
async function freeSpots(db) {
  const out = [];
  for (let y = Terrain.MIN_COORD; y <= Terrain.MAX_COORD; y++) for (let x = Terrain.MIN_COORD; x <= Terrain.MAX_COORD; x++) {
    if (!cityGroundOk(x, y) || !(await footprintFree(x, y, { db }))) continue;
    out.push({ x, y });
  }
  return out;
}
// villes de plus que la carte tient encore, posées une à une sur les cases libres dans un ordre au hasard
function moreCities(spots, random) {
  const taken = new Set();
  let n = 0;
  for (const p of [...spots].sort(() => random() - 0.5)) {
    let clash = false;
    for (let dy = 1 - CITY_GAP; dy < CITY_GAP && !clash; dy++) for (let dx = 1 - CITY_GAP; dx < CITY_GAP; dx++) if (taken.has((p.x + dx) + ',' + (p.y + dy))) { clash = true; break; }
    if (!clash) { taken.add(p.x + ',' + p.y); n++; }
  }
  return n;
}
// gisement libre le plus proche d'une capitale (recherche par carrés de 16 cases autour d'elle)
function nearestFinder(list) {
  const G = 16, grid = new Map();
  for (const n of list) { const k = Math.floor(n.x / G) + ',' + Math.floor(n.y / G); if (!grid.has(k)) grid.set(k, new Set()); grid.get(k).add(n); }
  const maxR = Math.ceil(Terrain.WORLD_SIZE / G) + 1;
  return {
    remove: (n) => grid.get(Math.floor(n.x / G) + ',' + Math.floor(n.y / G))?.delete(n),
    nearest(c) {
      const bx = Math.floor(c.x / G), by = Math.floor(c.y / G);
      let best = null, bestD = Infinity;
      for (let r = 0; r <= maxR && !(best && (r - 1) * G > bestD); r++) {
        for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          for (const n of grid.get((bx + dx) + ',' + (by + dy)) || []) { const d = Math.hypot(n.x - c.x, n.y - c.y); if (d < bestD) { bestD = d; best = n; } }
        }
      }
      return best;
    }
  };
}

async function measure(seed) {
  Terrain.setWorldSeed(seed, OPT.generator);
  const N = Terrain.WORLD_SIZE, cells = N * N, random = rng(seed + 1);
  let walk = 0, main = 0, fit = 0;
  for (let y = Terrain.MIN_COORD; y <= Terrain.MAX_COORD; y++) for (let x = Terrain.MIN_COORD; x <= Terrain.MAX_COORD; x++) {
    if (!Terrain.isBlocked(x, y)) walk++;
    if (Terrain.isMainland(x, y)) main++;
    if (cityGroundOk(x, y)) fit++;
  }
  const stats = Terrain.worldStats();
  // 2. semis
  const nodes = planResourceNodes({ random }).map((n, i) => ({ ...n, id: 'n' + i }));
  const res = nodes.filter(n => FOUNDABLE.has(n.resourceType));
  const db = memoryDb(nodes);
  // 3. fondables sur la carte vide
  const before = await foundable(nodes, db);
  // 4. capitales
  const capitals = [];
  let failed = 0;
  for (let i = 0; i < OPT.players; i++) {
    try { const p = await findFreeSpawn({ db, side: OPT.side, random }); capitals.push(db.city.add({ id: 'cap' + i, x: p.x, y: p.y, isCapital: true })); } catch (e) { failed++; }
  }
  const nearNode = (c) => res.some(n => Math.abs(n.x - c.x) < CITY_GAP && Math.abs(n.y - c.y) < CITY_GAP);
  const fallback = capitals.filter(nearNode).length;
  const perSide = Object.fromEntries(SIDES.map(s => [s, capitals.filter(c => sideAt(c.x, c.y) === s).length]));
  // 5. après les capitales, puis les colonies fondées une à une : chaque joueur prend le gisement libre le plus proche de sa
  // capitale, tour après tour
  const after = await foundable(nodes, db);
  const want = capitals.length * config.city.maxSecondaryCities;
  let founded = 0, missing = 0;
  const free = nearestFinder(after);
  for (let round = 0; round < config.city.maxSecondaryCities; round++) {
    for (const c of capitals) {
      let n = free.nearest(c);
      while (n && !(await footprintFree(n.x, n.y, { ignoreNodeId: n.id, db }))) { free.remove(n); n = free.nearest(c); }
      if (!n) { missing++; continue; }
      free.remove(n);
      db.city.add({ id: 'col' + n.id, x: n.x, y: n.y }); n.cityId = 'col' + n.id; founded++;
    }
  }
  // 6. place qui reste, puis la fin de partie et une invasion posées par le vrai code sur cette carte pleine
  const spots = await freeSpots(db);
  const moreCitiesCount = moreCities(spots, random);
  const W = config.world, I = config.invasion;
  const { wonder, dungeons } = await withMemoryDb(db, random, async () => {
    const sites = { ring: W.wonderSiteRing, placed: await WS.spawnNodes('WONDER', W.wonderSites, ...W.wonderSiteRing, W.immortalSitePower), need: W.wonderSites };
    const plans = { ring: W.wonderPlanRing, placed: await WS.spawnNodes('PLAN', W.wonderPlans, ...W.wonderPlanRing, W.immortalPlanPower), need: W.wonderPlans };
    const placed = {};
    for (const [level, need] of Object.entries(I.counts)) placed[level] = { ring: I.rings[level], placed: await H.placeLevel('mesure', Number(level), need), need };
    return { wonder: { sites, plans }, dungeons: placed };
  });
  return {
    seed, generator: Terrain.generator, size: N, playable: Terrain.worldStatsOk(stats),
    land: { walkablePct: 100 * walk / cells, mainlandPct: 100 * main / cells, cityFitsPct: 100 * fit / cells },
    nodes: { resources: res.length, gold: nodes.length - res.length, byLevel: byLevel(res), byZone: byZone(res) },
    foundableBefore: { total: before.length, byLevel: byLevel(before), byZone: byZone(before) },
    capitals: { placed: capitals.length, failed, nearNode: fallback, perSide },
    foundableAfter: { total: after.length, byLevel: byLevel(after), byZone: byZone(after), goal: Math.ceil(want * MARGIN) },
    colonies: { want, founded, missing },
    freeSpots: spots.length, moreCities: moreCitiesCount, wonder, dungeons
  };
}

const fmt = (n) => Math.round(n).toLocaleString('fr-FR');
function print(r) {
  const ok = r.foundableAfter.total >= r.foundableAfter.goal;
  console.log(`\n## Graine ${r.seed} — générateur ${r.generator}, carte ${r.size} × ${r.size}${r.playable ? '' : ' (hors contrôle de jouabilité : un serveur neuf en tirerait une autre)'}`);
  console.log(`Terre : ${r.land.walkablePct.toFixed(1)} % des cases où l'on marche, ${r.land.mainlandPct.toFixed(1)} % de terre ferme principale, une ville 2 × 2 tient sur ${r.land.cityFitsPct.toFixed(1)} % des cases.`);
  console.log(`Semis : ${fmt(r.nodes.resources)} gisements (niveaux 1/2/3 : ${r.nodes.byLevel.join(' / ')} ; centre/milieu/bord : ${r.nodes.byZone.join(' / ')}) et ${fmt(r.nodes.gold)} camps d'or.`);
  console.log(`Fondables sur la carte vide : ${fmt(r.foundableBefore.total)} (niveaux ${r.foundableBefore.byLevel.join(' / ')}).`);
  console.log(`Capitales : ${fmt(r.capitals.placed)} posées${r.capitals.failed ? `, ${r.capitals.failed} sans place` : ''}, dont ${r.capitals.nearNode} à moins de ${CITY_GAP} cases d'un gisement (repli sur la règle d'avant) ; par côté N/E/S/O : ${SIDES.map(s => r.capitals.perSide[s]).join(' / ')}.`);
  console.log(`Fondables après les capitales : ${fmt(r.foundableAfter.total)} pour ${fmt(r.foundableAfter.goal)} voulus ${ok ? '✓' : '✗'} (niveaux ${r.foundableAfter.byLevel.join(' / ')} ; centre/milieu/bord ${r.foundableAfter.byZone.join(' / ')}).`);
  console.log(`Colonies fondées une à une (le gisement libre le plus proche de chaque capitale) : ${fmt(r.colonies.founded)} sur ${fmt(r.colonies.want)}${r.colonies.missing ? ` (${r.colonies.missing} sans gisement)` : ''}.`);
  console.log(`Place libre restante (Bastions, capitales déplacées, sites, donjons) : une ville 2 × 2 tient encore sur ${fmt(r.freeSpots)} cases, soit ${fmt(r.moreCities)} villes de plus posées une à une.`);
  const done = (o) => `${o.placed} / ${o.need}${o.placed < o.need ? ' ✗' : ''}`;
  console.log(`Fin de partie, posés par le jeu sur cette carte pleine : sites de Merveille ${done(r.wonder.sites)} (anneau ${r.wonder.sites.ring.join('-')}), plans ${done(r.wonder.plans)} (anneau ${r.wonder.plans.ring.join('-')}).`);
  console.log(`Donjons d'une invasion posés par le jeu, par niveau (anneau) : ${Object.entries(r.dungeons).map(([l, d]) => `${l} (${d.ring.join('-')}) : ${done(d)}`).join(' ; ')}.`);
}

async function main() {
  if (OPT.size) Terrain.SIZE_BY_GENERATOR[OPT.generator] = OPT.size;   // taille d'essai (le jeu garde celle de terrain.js)
  if (OPT.perCell) config.map.nodeSeeding.perCell = OPT.perCell;
  const out = [];
  if (!OPT.json) console.log(`# Capacité de la carte : ${OPT.players} joueurs, ${config.city.maxSecondaryCities} colonies chacun, côté ${OPT.side}, ${config.map.nodeSeeding.perCell} point par case (au plus ${config.map.nodeSeeding.max})`);
  for (const seed of OPT.seeds) { const r = await measure(seed); out.push(r); if (!OPT.json) print(r); }
  if (OPT.json) console.log(JSON.stringify(out, null, 1));
  return out;
}
if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
module.exports = { measure, memoryDb };
