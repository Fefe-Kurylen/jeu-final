// Carte pour 2 000 joueurs et côté de la carte à l'inscription (décisions D1 et D2 du 31 octobre 2026, rapport de
// vérification) : taille selon le générateur de la carte, semis des points là où une ville tient, capitales à 3 cases des
// gisements (repli sur la règle d'avant), côté choisi (repli sur les autres), capacité mesurée avec le vrai code.
// Aucune requête réelle : une base en mémoire (tools/measure-map-capacity.cjs) ou des tables factices.
require('./_env');
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://unit:unit@localhost:5432/unit';   // le client Prisma est créé, jamais interrogé
const test = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../../src/config/database');
const config = require('../../src/config');
const Terrain = require('../../frontend/js/shared/terrain.js');
const spawn = require('../../src/utils/spawn');
const { planResourceNodes } = require('../../src/game/seed');
const { measure, memoryDb } = require('../../tools/measure-map-capacity.cjs');

// tirage fixé (mulberry32)
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function fakeRes() {
  const r = { statusCode: 200, body: null };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.set = () => r;
  return r;
}
const handlerOf = (router, method, path) => router.stack.find(l => l.route && l.route.path === path && l.route.methods[method]).route.stack.at(-1).handle;
function swapPrisma(tables) {
  const saved = Object.fromEntries(Object.keys(tables).map(k => [k, prisma[k]]));
  Object.assign(prisma, tables);
  return () => Object.assign(prisma, saved);
}
const newMap = (seed = 0) => Terrain.setWorldSeed(seed, Terrain.NEW_GENERATOR);

test('taille de la carte et longueurs qui en découlent : celles d\'avant sur une carte de 374, à l\'échelle sur celle de 420', () => {
  Terrain.setWorldSeed(0);
  assert.deepEqual([config.map.worldSize, config.map.minCoord, config.map.maxCoord, config.map.spawnEdgeDelta], [374, -187, 186, 100]);
  assert.deepEqual(config.invasion.rings, { 1: [150, 178], 2: [120, 150], 3: [90, 120], 4: [55, 90], 5: [22, 55] });
  Terrain.setWorldSeed(61029, 3);
  assert.equal(config.map.worldSize, 374, 'un monde au hasard ouvert avant le 31 octobre garde sa taille');
  newMap();
  assert.deepEqual([config.map.worldSize, config.map.minCoord, config.map.maxCoord], [420, -210, 209]);
  assert.equal(config.map.spawnEdgeDelta, Math.round(100 * 420 / 374));
  for (const [level, [a, b]] of Object.entries(config.invasion.rings)) {
    const [ra, rb] = config.invasion.ringsRef[level];
    assert.deepEqual([a, b], [Math.round(ra * 420 / 374), Math.round(rb * 420 / 374)], `anneau du niveau ${level}`);
  }
  assert.ok(config.invasion.rings[1][1] < config.map.maxCoord, 'les donjons de niveau 1 restent dans la carte');
});

test('côtés de la carte : valeurs acceptées, quart de chaque côté, bande de départ', () => {
  assert.equal(spawn.parseSide(undefined), 'RANDOM');
  assert.equal(spawn.parseSide(''), 'RANDOM');
  assert.equal(spawn.parseSide('n'), 'N');
  assert.equal(spawn.parseSide('RANDOM'), 'RANDOM');
  assert.equal(spawn.parseSide('NE'), null);
  assert.equal(spawn.parseSide(3), null);
  newMap();
  const { minCoord: MIN, maxCoord: MAX, spawnEdgeDelta: DELTA } = config.map;
  const random = rng(7);
  for (const side of spawn.SIDES) {
    for (let i = 0; i < 400; i++) {
      const p = spawn.randomEdgePosition(side, random);
      assert.equal(spawn.sideAt(p.x, p.y), side, `${side} : (${p.x}, ${p.y})`);
      assert.ok(Math.min(p.x - MIN, MAX - 1 - p.x, p.y - MIN, MAX - 1 - p.y) < DELTA, 'dans la bande de départ');
      assert.ok(p.x >= MIN && p.x < MAX && p.y >= MIN && p.y < MAX, 'les 4 cases de la ville dans la carte');
    }
  }
  // au hasard : les 4 côtés
  const seen = new Set();
  for (let i = 0; i < 200; i++) { const p = spawn.randomEdgePosition(null, random); seen.add(spawn.sideAt(p.x, p.y)); }
  assert.deepEqual([...seen].sort(), ['E', 'N', 'S', 'W']);
  // vu sur l'écran isométrique : le nord en haut (x + y petit, la neige), le sud en bas (le désert)
  assert.equal(Terrain.getBiome(MIN, MIN), 'snow');
  assert.equal(spawn.sideAt(MIN, MIN), 'N');
  assert.equal(Terrain.getBiome(MAX, MAX), 'desert');
  assert.equal(spawn.sideAt(MAX, MAX), 'S');
});

test('capitale : à 3 cases au moins d\'un gisement où fonder, sinon la règle d\'avant, sinon un autre côté', async () => {
  newMap();
  // un gisement toutes les 3 cases dans le quart nord : aucune case à 3 cases d'un gisement, mais de la place entre eux
  const crowd = [];
  for (let y = -3; y >= config.map.minCoord; y -= 3) for (let x = -3; x >= config.map.minCoord; x -= 3) crowd.push({ id: `${x},${y}`, x, y, resourceType: 'WOOD' });
  const db = memoryDb(crowd);
  const strict = await spawn.findFreeSpawn({ db: memoryDb([]), side: 'N', random: rng(1) });
  assert.equal(spawn.sideAt(strict.x, strict.y), 'N');
  const p = await spawn.findFreeSpawn({ db, side: 'N', random: rng(2) });
  assert.equal(spawn.sideAt(p.x, p.y), 'N', 'côté gardé avec la règle d\'avant');
  assert.ok(crowd.some(n => Math.abs(n.x - p.x) < spawn.CITY_GAP && Math.abs(n.y - p.y) < spawn.CITY_GAP), 'repli : près d\'un gisement');
  assert.ok(!crowd.some(n => n.x >= p.x && n.x <= p.x + 1 && n.y >= p.y && n.y <= p.y + 1), 'jamais sur un gisement');
  // ailleurs, la même règle garde les gisements libres
  const nodes = [];
  for (let y = -60; y <= 60; y += 4) for (let x = 100; x < 200; x += 4) nodes.push({ id: `${x},${y}`, x, y, resourceType: 'FOOD' });
  const roomy = memoryDb(nodes);
  for (let i = 0; i < 30; i++) {
    const c = await spawn.findFreeSpawn({ db: roomy, side: 'E', random: rng(100 + i) });
    assert.ok(!nodes.some(n => Math.abs(n.x - c.x) < spawn.CITY_GAP && Math.abs(n.y - c.y) < spawn.CITY_GAP), `(${c.x}, ${c.y}) à 3 cases au moins`);
    roomy.city.add({ id: 'c' + i, x: c.x, y: c.y });
  }
  // côté plein (une ville partout au nord) : ses voisins d'abord, jamais l'opposé tant qu'ils ont de la place
  const full = memoryDb([]);
  full.city.findFirst = async ({ where }) => (where.x.lte < 2 && where.y.lte < 2 ? { id: 'mur' } : null);
  const q = await spawn.findFreeSpawn({ db: full, side: 'N', random: rng(3) });
  assert.ok(['E', 'W'].includes(spawn.sideAt(q.x, q.y)), `voisin du nord : ${spawn.sideAt(q.x, q.y)}`);
  // carte pleine : 503
  const none = memoryDb([]);
  none.city.findFirst = async () => ({ id: 'mur' });
  await assert.rejects(spawn.findFreeSpawn({ db: none, side: 'S', random: rng(4) }), (e) => e.status === 503);
});

test('semis d\'un monde neuf : chaque point là où une ville tient, à 3 cases des autres, 13 % d\'or, plus de niveau 3 au centre', () => {
  newMap(123456);
  const cities = [{ x: 0, y: 0 }];
  const nodes = planResourceNodes({ cities, random: rng(9) });
  const S = config.map.nodeSeeding;
  const res = Math.min(S.max, Math.floor(420 * 420 * S.perCell));
  const gold = nodes.filter(n => n.resourceType === 'GOLD');
  assert.equal(nodes.length - gold.length, res);
  assert.equal(gold.length, Math.floor(res * S.goldPct / 100));
  assert.ok(nodes.slice(0, res).every(n => ['WOOD', 'STONE', 'IRON', 'FOOD'].includes(n.resourceType)), 'les ressources puis l\'or');
  const at = new Set(nodes.map(n => n.x + ',' + n.y));
  for (const n of nodes) {
    assert.ok(spawn.cityGroundOk(n.x, n.y), `(${n.x}, ${n.y}) : une ville y tient`);
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (dx || dy) assert.ok(!at.has((n.x + dx) + ',' + (n.y + dy)), `(${n.x}, ${n.y}) : un autre point à moins de 3 cases`);
    assert.ok(Math.abs(n.x) > 2 || Math.abs(n.y) > 2, 'à 3 cases d\'une ville déjà posée');
  }
  const radius = 210 * config.map.centerRadiusPct / 100;
  const share3 = (list) => list.filter(n => n.level === 3).length / list.length;
  const inner = nodes.filter(n => Math.hypot(n.x, n.y) < radius), outer = nodes.filter(n => Math.hypot(n.x, n.y) >= radius);
  assert.ok(share3(inner) > 0.5 && share3(outer) < 0.15, `niveau 3 : ${share3(inner).toFixed(2)} au centre, ${share3(outer).toFixed(2)} ailleurs`);
});

test('capacité mesurée (vrai code) : 2 000 capitales laissent au moins 4 600 gisements fondables, 4 000 colonies fondées', async () => {
  const r = await measure(0);
  assert.equal(r.size, 420);
  assert.equal(r.capitals.placed, 2000);
  assert.equal(r.capitals.failed, 0);
  assert.ok(r.foundableAfter.total >= 4600, `${r.foundableAfter.total} fondables`);
  assert.equal(r.foundableAfter.goal, 4600);
  assert.equal(r.colonies.founded, 4000);
  assert.equal(r.foundableBefore.total, r.nodes.resources, 'tout gisement semé est fondable');
  // carte pleine (capitales et colonies) : le vrai code pose tous les sites, tous les plans et tous les donjons d'une invasion
  for (const [k, o] of Object.entries(r.wonder)) assert.equal(o.placed, o.need, `${k} de Merveille posés (anneau ${o.ring})`);
  for (const [level, d] of Object.entries(r.dungeons)) assert.equal(d.placed, d.need, `donjons du niveau ${level} posés (anneau ${d.ring})`);
});

test('inscription : côté refusé s\'il n\'existe pas, transmis à la pose de la capitale, côté réel dans la réponse', async () => {
  newMap();
  const authRouter = require('../../src/routes/auth');
  const startService = require('../../src/services/startService');
  const register = handlerOf(authRouter, 'post', '/register');
  const body = { email: 'side@test.fr', password: 'motdepasse1', name: 'Cotier', faction: 'GAUL' };
  const bad = fakeRes();
  await register({ body: { ...body, side: 'NORD-EST' } }, bad);
  assert.equal(bad.statusCode, 400);
  assert.match(bad.body.error, /Côté de la carte invalide/);
  const open = { id: 1, seed: Terrain.worldSeed, generator: Terrain.generator, readyAt: new Date(Date.now() - 86400000), number: 1 };
  const tx = {
    worldConfig: { findUnique: async () => open }, player: { count: async () => 0, create: async ({ data }) => ({ id: 'p1', ...data }) },
    account: { create: async ({ data }) => ({ id: 'a1', ...data }) }, $executeRaw: async () => 0
  };
  const restore = swapPrisma({
    account: { findUnique: async () => null }, player: { findFirst: async () => null, count: async () => 0 },
    worldConfig: { findUnique: async () => open }, $transaction: async (fn) => fn(tx)
  });
  const savedStart = startService.createStart;
  const asked = [];
  startService.createStart = async (db, args) => { asked.push(args); return { id: 'c1', x: 150, y: -170 }; };
  try {
    const res = fakeRes();
    await register({ body: { ...body, side: 'w' } }, res);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(asked[0].side, 'W');
    assert.equal(res.body.player.side, 'E', 'le côté où la capitale est vraiment posée (repli)');
    const def = fakeRes();
    await register({ body: { ...body, email: 'side2@test.fr', name: 'Cotier2' } }, def);
    assert.equal(asked[1].side, 'RANDOM', 'par défaut : au hasard');
  } finally { startService.createStart = savedStart; restore(); }
});

test('GET /api/world/info : taille, générateur et côtés de la carte de ce monde', async () => {
  const mapRouter = require('../../src/routes/map');
  const info = handlerOf(mapRouter, 'get', '/world/info');
  newMap(4242);
  const row = { id: 1, seed: 4242, generator: Terrain.NEW_GENERATOR, readyAt: new Date() };
  const restore = swapPrisma({ worldConfig: { findUnique: async () => row }, player: { count: async () => 12 }, resourceNode: { count: async () => 6780 } });
  try {
    const res = fakeRes();
    await info({}, res);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    const b = res.body;
    assert.deepEqual([b.worldSize, b.minCoord, b.maxCoord, b.totalTiles], [420, -210, 209, 420 * 420]);
    assert.deepEqual([b.worldSeed, b.worldGenerator, b.terrainVersion], [4242, 4, 4]);
    assert.deepEqual(b.sides, ['N', 'E', 'S', 'W']);
    assert.equal(b.playerCount, 12);
  } finally { restore(); }
});

test('monde neuf : le générateur des nouveaux mondes (graine 0 comprise) ; monde déjà peuplé : la carte de référence', async () => {
  const world = require('../../src/game/world');
  const run = async ({ cities = 0, worldSeed = null }) => {
    let row = null;
    const inserted = [];
    const savedSeed = config.map.worldSeed;
    config.map.worldSeed = worldSeed;
    const restore = swapPrisma({
      worldConfig: { findUnique: async () => row },
      city: { count: async () => cities, findMany: async () => [] }, resourceNode: { count: async () => 0, findMany: async () => [] }, player: { count: async () => 0 },
      $executeRaw: async (strings, ...values) => { inserted.push(values); row = { id: 1, seed: values[0], generator: values[1], readyAt: values[2] }; return 1; }
    });
    try { await world.loadWorldSeed({ setup: true }); } finally { restore(); config.map.worldSeed = savedSeed; }
    return { inserted: inserted[0], size: Terrain.WORLD_SIZE, generator: Terrain.generator };
  };
  const fresh = await run({ worldSeed: '0' });
  assert.deepEqual(fresh.inserted.slice(0, 2), [0, Terrain.NEW_GENERATOR], 'WORLD_SEED=0 sur un serveur neuf');
  assert.equal(fresh.size, 420);
  const legacy = await run({ cities: 3 });
  assert.deepEqual(legacy.inserted.slice(0, 2), [0, 2], 'monde peuplé sans graine : la carte de référence');
  assert.equal(legacy.size, 374);
  const legacyRandom = await run({ cities: 3, worldSeed: '61029' });
  assert.deepEqual(legacyRandom.inserted.slice(0, 2), [61029, 3], 'graine rendue à un monde d\'avant : son générateur 3');
});

test('carte relue par les autres processus : même graine mais autre générateur (WORLD_SEED=0 : carte de référence puis nouveau monde)', () => {
  const WS = require('../../src/services/wonderService');
  Terrain.setWorldSeed(0);
  assert.equal(config.map.worldSize, 374);
  const log = console.log; console.log = () => {};
  try {
    assert.equal(WS.syncWorldSeed({ seed: 0, generator: Terrain.NEW_GENERATOR }), true);
    assert.deepEqual([Terrain.worldSeed, Terrain.generator, config.map.worldSize], [0, Terrain.NEW_GENERATOR, 420], 'la carte du nouveau monde');
    assert.equal(WS.syncWorldSeed({ seed: 0, generator: 2 }), true);
    assert.deepEqual([Terrain.generator, config.map.worldSize], [2, 374]);
  } finally { console.log = log; }
});

test('rejoindre le nouveau monde : côté refusé s\'il n\'existe pas, transmis à la pose de la capitale, côté réel dans la réponse', async () => {
  newMap();
  const wonderRouter = require('../../src/routes/wonder');
  const HF = require('../../src/services/hallOfFameService');
  const startService = require('../../src/services/startService');
  const join = handlerOf(wonderRouter, 'post', '/world/join');
  const bad = fakeRes();
  await join({ body: { faction: 'GAUL', side: 'centre' }, user: { playerId: 'p1' } }, bad);
  assert.equal(bad.statusCode, 400);
  assert.equal(bad.body.error, spawn.SIDE_ERROR);
  // la route passe le côté au service
  const savedJoin = HF.joinWorld;
  const calls = [];
  HF.joinWorld = async (...args) => { calls.push(args); return { message: 'ok', cityId: 'c1', side: 'N' }; };
  try {
    const res = fakeRes();
    await join({ body: { faction: 'gaul', side: 's' }, user: { playerId: 'p1' } }, res);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    const def = fakeRes();
    await join({ body: { faction: 'GAUL' }, user: { playerId: 'p1' } }, def);
    assert.deepEqual(calls, [['p1', 'GAUL', 'S'], ['p1', 'GAUL', 'RANDOM']]);
  } finally { HF.joinWorld = savedJoin; }
  // le service le passe à la pose de la capitale et répond le côté où elle est posée
  const open = { id: 1, seed: Terrain.worldSeed, generator: Terrain.generator, readyAt: new Date(Date.now() - 86400000), number: 1 };
  const tx = {
    $executeRaw: async () => 0, worldConfig: { findUnique: async () => open }, city: { count: async () => 0 },
    player: { count: async () => 0, findUnique: async () => ({ id: 'p1', name: 'Revenant' }), update: async () => ({}) }
  };
  const restore = swapPrisma({ worldConfig: { findUnique: async () => open }, player: { count: async () => 0 }, $transaction: async (fn) => fn(tx) });
  const savedStart = startService.createStart;
  const asked = [];
  startService.createStart = async (db, args) => { asked.push(args); return { id: 'c1', name: 'Capitale de Revenant', x: -160, y: 120 }; };
  try {
    const out = await HF.joinWorld('p1', 'GAUL', 'E');
    assert.equal(asked[0].side, 'E');
    assert.equal(out.side, 'W', 'le côté où la capitale est vraiment posée (repli)');
    assert.equal(out.cityId, 'c1');
  } finally { startService.createStart = savedStart; restore(); }
});
