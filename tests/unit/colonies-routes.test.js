// Routes des colonies (décisions du 30 octobre 2026) : Mur sur l'enceinte (emplacement fixe), palier de recrutement lu sur la
// Grande caserne / Grande écurie de la colonie, recrutement lancé depuis la capitale avec l'id de la colonie, gisement et vies
// dans GET /api/cities, filtre « Sites libres », transactions de dépense rejouées après un interblocage, colonie sans garnison.
// Aucune requête réelle : le client Prisma est remplacé le temps de chaque test.
require('./_env');
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://unit:unit@localhost:5432/unit';   // le client Prisma est créé, jamais interrogé
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const prisma = require('../../src/config/database');
const config = require('../../src/config');
const fx = require('../../src/utils/buildingEffects');
const { unitsData, buildingsData } = require('../../src/config/gamedata');
const { baseTrainSecondsFor, getArmyTravelTime } = require('../../src/utils/calculations');
const { assaultsToFall } = require('../../src/services/conquestService');
const citiesRouter = require('../../src/routes/cities');
const mapRouter = require('../../src/routes/map');
const { resolveSlot, recruitBlocker } = citiesRouter;

const fakeRes = () => {
  const r = { statusCode: 200, body: null };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
};
const handlerOf = (router, method, routePath) => router.stack.find(l => l.route && l.route.path === routePath && l.route.methods[method]).route.stack.at(-1).handle;
function swapPrisma(tables) {
  const saved = Object.fromEntries(Object.keys(tables).map(k => [k, prisma[k]]));
  Object.assign(prisma, tables);
  return () => Object.assign(prisma, saved);
}
const deadlock = () => Object.assign(new Error('Transaction failed due to a write conflict or a deadlock'), { code: 'P2034' });

// ---- Mur sur l'enceinte (décision 6 ; emplacements de l'anneau par type de ville : tests/unit/batiments-routes.test.js) ----

test('Mur : toujours sur l\'emplacement fixe de l\'enceinte, quel que soit l\'emplacement envoyé', () => {
  const wallSlot = config.city.wallSlot;
  assert.ok(wallSlot > config.city.ringSlots.capital && !Object.values(config.city.fieldSlots).flat().includes(wallSlot), 'hors de l\'anneau et des champs');
  const city = { buildings: [{ key: 'MAIN_HALL', slot: 0, level: 5 }], buildQueue: [] };
  for (const sent of [null, 1, 5, config.city.ringSlots.capital, wallSlot, 101]) assert.equal(resolveSlot('WALL', sent, null, city), wallSlot, `emplacement envoyé : ${sent}`);
  // niveau suivant d'un Mur déjà bâti, ou encore dans la file
  const wall = { key: 'WALL', slot: wallSlot, level: 3 };
  assert.equal(resolveSlot('WALL', 4, wall, { ...city, buildings: [...city.buildings, wall] }), wallSlot);
  assert.equal(resolveSlot('WALL', null, null, { ...city, buildQueue: [{ buildingKey: 'WALL', slot: wallSlot }] }), wallSlot);
  // l'enceinte n'est pas un emplacement de l'anneau : aucun autre bâtiment n'y va
  assert.equal(resolveSlot('MARKET', wallSlot, null, city), null);
});

// ---- Palier de recrutement d'une colonie (décision 7) ----
const unitOf = (faction, cls, tier) => unitsData.find(u => u.faction === faction && u.class === cls && u.tier === tier);
const colony = (buildings) => ({ name: 'Ostie', isCapital: false, buildings });
const capital = (buildings) => ({ name: 'Rome', isCapital: true, buildings });
const tierLevel = (key, tier) => buildingsData.find(b => b.key === key).effects[{ base: 'unlockBaseTier', intermediate: 'unlockIntermediateTier', elite: 'unlockEliteTier' }[tier]];

test('recrutement en colonie : le palier se lit sur SA Grande caserne / Grande écurie, jamais sur la Caserne de la capitale', () => {
  const [inf, inter, elite] = ['base', 'intermediate', 'elite'].map(t => unitOf('ROME', 'INFANTRY', t));
  // une Caserne 20 (ce que la capitale aurait) ne sert à rien dans une colonie
  assert.match(recruitBlocker(inf, colony([{ key: 'BARRACKS', level: 20 }])), /Grande Caserne nécessaire à Ostie/);
  assert.equal(recruitBlocker(inf, colony([{ key: 'GREAT_BARRACKS', level: 1 }])), null);
  const interLevel = tierLevel('GREAT_BARRACKS', 'intermediate'), eliteLevel = tierLevel('GREAT_BARRACKS', 'elite');
  assert.match(recruitBlocker(inter, colony([{ key: 'GREAT_BARRACKS', level: interLevel - 1 }])), new RegExp(`Grande Caserne niveau ${interLevel} nécessaire à Ostie pour les unités intermédiaires`));
  assert.equal(recruitBlocker(inter, colony([{ key: 'GREAT_BARRACKS', level: interLevel }])), null);
  assert.match(recruitBlocker(elite, colony([{ key: 'GREAT_BARRACKS', level: eliteLevel - 1 }, { key: 'BARRACKS', level: 20 }])), /unités d'élite/);
  assert.equal(recruitBlocker(elite, colony([{ key: 'GREAT_BARRACKS', level: eliteLevel }])), null);
  // la cavalerie à la Grande écurie, pas à la Grande caserne ; pas d'engins de siège en colonie
  const cav = unitOf('ROME', 'CAVALRY', 'base');
  assert.match(recruitBlocker(cav, colony([{ key: 'GREAT_BARRACKS', level: 20 }])), /Grande Écurie nécessaire/);
  assert.equal(recruitBlocker(cav, colony([{ key: 'GREAT_STABLE', level: 1 }])), null);
  assert.match(recruitBlocker(unitOf('ROME', 'SIEGE', 'siege'), colony([{ key: 'WORKSHOP', level: 20 }])), /Atelier de la capitale/);
});

test('recrutement dans la capitale : Caserne, Écurie et Atelier, paliers de leurs données', () => {
  const inter = unitOf('GAUL', 'INFANTRY', 'intermediate'), siege = unitOf('GAUL', 'SIEGE', 'siege');
  const interLevel = tierLevel('BARRACKS', 'intermediate');
  assert.match(recruitBlocker(inter, capital([{ key: 'GREAT_BARRACKS', level: 20 }])), /Caserne nécessaire à Rome/);
  assert.match(recruitBlocker(inter, capital([{ key: 'BARRACKS', level: interLevel - 1 }])), new RegExp(`Caserne niveau ${interLevel}`));
  assert.equal(recruitBlocker(inter, capital([{ key: 'BARRACKS', level: interLevel }])), null);
  assert.match(recruitBlocker(siege, capital([{ key: 'WORKSHOP', level: config.recruit.siegeWorkshopLevel - 1 }])), new RegExp(`Atelier niveau ${config.recruit.siegeWorkshopLevel} nécessaire à Rome pour les engins de siège`));
  assert.equal(recruitBlocker(siege, capital([{ key: 'WORKSHOP', level: config.recruit.siegeWorkshopLevel }])), null);
});

// Transaction factice : villes verrouillées (lockPlayerCities), dépense (debitCity), lignes créées
function fakeRecruitDb({ city, failures = 0 }) {
  const created = [];
  let calls = 0;
  const rows = [{ id: 'cap', isCapital: true, wood: 1e6, stone: 1e6, iron: 1e6, food: 1e6, maxStorage: 2e6, maxFoodStorage: 2e6 }, { id: city.id, isCapital: false, wood: 0, stone: 0, iron: 0, food: 0, maxStorage: 1e6, maxFoodStorage: 1e6 }];
  const tx = {
    $queryRaw: async () => rows.map(r => ({ ...r })),
    $executeRaw: async () => 1,
    city: { findFirst: async ({ where }) => (where.id === city.id ? city : null) },
    playerTechnology: { findMany: async () => [] },
    recruitQueueItem: { create: async ({ data }) => { created.push(data); return { id: 'q1', ...data }; } }
  };
  const $transaction = async (fn) => { calls++; if (calls <= failures) throw deadlock(); return fn(tx); };
  return { created, calls: () => calls, restore: swapPrisma({ $transaction }) };
}

test('recruter pour une colonie depuis la capitale : file de la colonie, temps de SA Grande caserne, rejoué après un interblocage', async () => {
  const recruit = handlerOf(citiesRouter, 'post', '/:id/recruit');
  const unit = unitOf('ROME', 'INFANTRY', 'intermediate');
  const level = tierLevel('GREAT_BARRACKS', 'intermediate');
  const city = { id: 'col', name: 'Ostie', isCapital: false, playerId: 'p1', recruitQueue: [], buildings: [{ key: 'MAIN_HALL', level: 10 }, { key: 'GREAT_BARRACKS', level }], player: { faction: 'ROME' } };
  const db = fakeRecruitDb({ city, failures: 1 });
  try {
    const res = fakeRes();
    await recruit({ params: { id: 'col' }, body: { unitKey: unit.key, count: 10 }, user: { playerId: 'p1' } }, res);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(db.calls(), 2, 'la transaction annulée par l\'interblocage est relancée');
    assert.equal(db.created.length, 1);
    assert.equal(db.created[0].cityId, 'col', 'le lot est dans la file de la colonie');
    assert.equal(db.created[0].buildingKey, 'BARRACKS', 'même ligne de file que la Caserne (lue par le client)');
    const perUnit = Math.round(baseTrainSecondsFor(unit) * (1 - fx.trainTimeReductionPct(city.buildings, unit.class) / 100));
    assert.equal(res.body.timePerUnit, perUnit);
    assert.ok(perUnit < baseTrainSecondsFor(unit), 'la Grande caserne de la colonie raccourcit la formation');
    assert.match(res.body.message, /Ostie.*capitale/);
  } finally { db.restore(); }
});

test('recruter dans une colonie sans Grande caserne : refusé, rien n\'est payé', async () => {
  const recruit = handlerOf(citiesRouter, 'post', '/:id/recruit');
  const city = { id: 'col', name: 'Ostie', isCapital: false, playerId: 'p1', recruitQueue: [], buildings: [{ key: 'MAIN_HALL', level: 10 }], player: { faction: 'ROME' } };
  const db = fakeRecruitDb({ city });
  try {
    const res = fakeRes();
    await recruit({ params: { id: 'col' }, body: { unitKey: unitOf('ROME', 'INFANTRY', 'base').key, count: 1 }, user: { playerId: 'p1' } }, res);
    assert.equal(res.statusCode, 400);
    assert.match(res.body.error, /Grande Caserne nécessaire à Ostie/);
    assert.equal(db.created.length, 0);
  } finally { db.restore(); }
});

test('un interblocage qui se répète finit en erreur après trois essais', async () => {
  const recruit = handlerOf(citiesRouter, 'post', '/:id/recruit');
  const city = { id: 'col', name: 'Ostie', isCapital: false, playerId: 'p1', recruitQueue: [], buildings: [{ key: 'GREAT_BARRACKS', level: 1 }], player: { faction: 'ROME' } };
  const db = fakeRecruitDb({ city, failures: 99 });
  const quiet = console.error;
  console.error = () => {};
  try {
    const res = fakeRes();
    await recruit({ params: { id: 'col' }, body: { unitKey: unitOf('ROME', 'INFANTRY', 'base').key, count: 1 }, user: { playerId: 'p1' } }, res);
    assert.equal(res.statusCode, 500);
    assert.equal(db.calls(), 3, 'trois essais au plus');
  } finally { db.restore(); console.error = quiet; }
});

test('construire le Mur : le chantier va sur l\'enceinte même si un emplacement de l\'anneau est envoyé', async () => {
  const build = handlerOf(citiesRouter, 'post', '/:id/build');
  const city = { id: 'col', name: 'Ostie', isCapital: false, playerId: 'p1', buildings: [{ key: 'MAIN_HALL', slot: 0, level: 5 }], buildQueue: [], player: { faction: 'ROME' } };
  const created = [];
  const tx = {
    $queryRaw: async () => [{ id: 'col', isCapital: false, wood: 1e6, stone: 1e6, iron: 1e6, food: 1e6, maxStorage: 2e6, maxFoodStorage: 2e6 }],
    $executeRaw: async () => 1,
    city: { findFirst: async () => city, findMany: async () => [{ isCapital: true, buildings: [] }, city] },   // bâtiments partagés : ceux de la capitale
    playerTechnology: { findMany: async () => [] },
    buildQueueItem: { create: async ({ data }) => { created.push(data); return data; } }
  };
  const restore = swapPrisma({ $transaction: async (fn) => fn(tx) });
  try {
    const res = fakeRes();
    await build({ params: { id: 'col' }, body: { buildingKey: 'WALL', slot: 3 }, user: { playerId: 'p1' } }, res);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(created[0].slot, config.city.wallSlot);
    assert.equal(created[0].targetLevel, 1);
  } finally { restore(); }
});

// ---- Toutes les dépenses qui verrouillent les villes du joueur sont rejouées après un interblocage ----
test('routes : chaque transaction qui verrouille toutes les villes du joueur passe par withDeadlockRetry', () => {
  const dir = path.join(__dirname, '../../src/routes');
  let wrapped = 0;
  for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.js'))) {
    const code = fs.readFileSync(path.join(dir, file), 'utf8');
    const marker = 'prisma.$transaction(async (tx) => {';
    for (let i = code.indexOf(marker); i >= 0; i = code.indexOf(marker, i + 1)) {
      if (!code.slice(i, i + 600).includes('lockPlayerCities(')) continue;
      assert.ok(code.slice(i - 30, i).endsWith('withDeadlockRetry(() => '), `${file} : transaction sans withDeadlockRetry (position ${i})`);
      wrapped++;
    }
  }
  assert.ok(wrapped >= 10, `transactions de dépense trouvées : ${wrapped}`);
  // la résurrection du héros ouvre sa transaction dans heroService
  assert.match(fs.readFileSync(path.join(dir, 'hero.js'), 'utf8'), /withDeadlockRetry\(\(\) => heroService\.startRevive/);
});

// ---- GET /api/cities : gisement et vies (vue « Mes villes ») ----
test('GET /api/cities : gisement de chaque colonie (aucun pour la capitale ni la Ville Merveille) et vies de chaque ville', async () => {
  const list = handlerOf(citiesRouter, 'get', '/');
  const city = (id, extra) => ({ id, name: id, playerId: 'p1', wood: 0, stone: 0, iron: 0, food: 0, maxStorage: 1000, maxFoodStorage: 1000, wallStructure: 1, buildings: [], buildQueue: [], recruitQueue: [], armies: [], ...extra });
  const cities = [city('cap', { isCapital: true }), city('col', { isCapital: false, wallStructure: 0.5 }), city('won', { isCapital: false, isWonder: true })];
  const restore = swapPrisma({
    buildQueueItem: { count: async () => 0 },
    recruitQueueItem: { count: async () => 0 },
    city: { findMany: async () => cities },
    $queryRaw: async () => [],   // bilans de nourriture (resourceProcessor.foodBalance), sans intérêt ici
    army: { findMany: async () => [] },
    resourceNode: { findMany: async ({ where }) => [{ cityId: 'col', resourceType: 'IRON', level: 3 }, { cityId: 'won', resourceType: 'WONDER', level: 3 }].filter(n => where.cityId.in.includes(n.cityId)) },
    player: { findUnique: async () => ({ faction: 'EGYPT' }) }
  });
  try {
    const res = fakeRes();
    await list({ user: { playerId: 'p1' } }, res);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    const by = Object.fromEntries(res.body.map(c => [c.id, c]));
    const perLevel = buildingsData.find(b => b.key === 'RESIDENCE').effects.colonyNodeBonusPctPerNodeLevel;
    assert.deepEqual(by.col.site, { type: 'IRON', level: 3, bonusPct: 3 * perLevel, otherPct: fx.colonyOtherResourcesPct() });
    assert.equal(by.cap.site, null);
    assert.equal(by.won.site, null);
    const colonyLives = assaultsToFall({ isCapital: false }, 'EGYPT');
    assert.deepEqual(by.col.lives, { total: colonyLives, left: Math.round(0.5 * colonyLives) });
    assert.deepEqual(by.cap.lives, { total: assaultsToFall({ isCapital: true }, 'EGYPT'), left: assaultsToFall({ isCapital: true }, 'EGYPT') });
  } finally { restore(); }
});

// ---- GET /api/map/free-sites ----
// Cases où une ville 2 × 2 tient (terrain seul : la base factice est vide), trouvées autour d'un point de départ
async function terrainSpots(x0, y0, n) {
  const { footprintFree } = require('../../src/utils/spawn');
  const empty = { findFirst: async () => null };
  const db = { city: empty, bastion: empty, army: empty, resourceNode: empty };
  const out = [];
  for (let r = 0; r < 40 && out.length < n; r++) {
    for (let dx = -r; dx <= r && out.length < n; dx += 3) {
      for (const dy of [-r, r]) {
        const x = x0 + dx, y = y0 + dy;
        if (out.length < n && !out.some(p => Math.abs(p.x - x) < 4 && Math.abs(p.y - y) < 4) && await footprintFree(x, y, { db })) out.push({ x, y });
      }
    }
  }
  assert.equal(out.length, n, 'cases libres trouvées pour le test');
  return out;
}

test('sites libres : gisements où fonder, du plus proche au plus lointain depuis la capitale', async () => {
  const [cap, a, b, c, d] = await terrainSpots(100, 100, 5);
  const [central] = await terrainSpots(5, 5, 1);
  const nodes = [
    { id: 'near', x: a.x, y: a.y, resourceType: 'WOOD', level: 1, hasDefenders: true, defenderPower: 900, cityId: null, hasPlayerArmy: false },
    { id: 'promised', x: b.x, y: b.y, resourceType: 'FOOD', level: 2, hasDefenders: false, defenderPower: 0, cityId: null, hasPlayerArmy: false },
    { id: 'crowded', x: c.x, y: c.y, resourceType: 'STONE', level: 2, hasDefenders: false, defenderPower: 0, cityId: null, hasPlayerArmy: false },
    { id: 'gold', x: d.x, y: d.y, resourceType: 'GOLD', level: 3, hasDefenders: true, defenderPower: 50, cityId: null, hasPlayerArmy: false },
    { id: 'taken', x: d.x, y: d.y, resourceType: 'IRON', level: 1, hasDefenders: false, defenderPower: 0, cityId: 'x', hasPlayerArmy: false },
    { id: 'held', x: d.x, y: d.y, resourceType: 'IRON', level: 1, hasDefenders: false, defenderPower: 0, cityId: null, hasPlayerArmy: true },
    { id: 'centre', x: central.x, y: central.y, resourceType: 'IRON', level: 3, hasDefenders: true, defenderPower: 40000, cityId: null, hasPlayerArmy: false }
  ];
  const near = (where, p) => p.x >= where.x.gte && p.x <= where.x.lte && p.y >= where.y.gte && p.y <= where.y.lte;
  const owner = { faction: 'ROME', technologies: [], alliance: null, cities: [{ isCapital: false, x: 0, y: 0, buildings: [] }, { isCapital: true, x: cap.x, y: cap.y, buildings: [] }] };
  let nodeQueries = 0;
  const restore = swapPrisma({
    player: { findUnique: async () => owner },
    resourceNode: {
      findMany: async ({ where }) => { nodeQueries++; return nodes.filter(n => where.resourceType.in.includes(n.resourceType) && n.cityId === where.cityId && n.hasPlayerArmy === where.hasPlayerArmy); },
      findFirst: async () => null
    },
    army: { findMany: async () => [{ targetResourceId: 'promised' }], findFirst: async () => null },
    city: { findFirst: async ({ where }) => (near(where, c) ? { id: 'neighbour' } : null) },   // une ville juste à côté du point « crowded »
    bastion: { findFirst: async () => null }
  });
  try {
    const sites = await mapRouter.freeSitesFor('p1', 10);
    assert.deepEqual(sites.map(s => s.id), ['near', 'centre'], 'ni or, ni ville, ni armée, ni colon en route, ni point sans place');
    const [s1, s2] = sites;
    const perLevel = buildingsData.find(x => x.key === 'RESIDENCE').effects.colonyNodeBonusPctPerNodeLevel;
    assert.deepEqual({ type: s1.type, level: s1.level, bonusPct: s1.bonusPct, tribePower: s1.tribePower }, { type: 'WOOD', level: 1, bonusPct: perLevel, tribePower: 900 });
    assert.equal(s2.bonusPct, 3 * perLevel);
    const escort = [{ unitKey: unitOf('ROME', 'INFANTRY', 'base').key, count: 1 }];
    assert.equal(s1.travelSec, getArmyTravelTime(escort, cap.x, cap.y, a.x, a.y, 'ROME'));
    assert.ok(s1.travelSec < s2.travelSec, 'du plus proche au plus lointain');
    assert.equal(s1.central, false);
    assert.equal(s2.central, true, 'cercle du centre disputé');
    assert.deepEqual((await mapRouter.freeSitesFor('p1', 1)).map(s => s.id), ['near'], 'limite');

    // la route garde la liste de chaque joueur quelques secondes
    const route = handlerOf(mapRouter, 'get', '/map/free-sites');
    const before = nodeQueries;
    const r1 = fakeRes(), r2 = fakeRes();
    await route({ query: { limit: '5' }, user: { playerId: 'p-cache' } }, r1);
    await route({ query: { limit: '5' }, user: { playerId: 'p-cache' } }, r2);
    assert.deepEqual(r1.body.map(s => s.id), ['near', 'centre']);
    assert.deepEqual(r2.body, r1.body);
    assert.equal(nodeQueries, before + 1, 'la deuxième demande vient du cache');
  } finally { restore(); }
});

test('sites libres : rien sans capitale', async () => {
  const restore = swapPrisma({ player: { findUnique: async () => ({ faction: 'ROME', technologies: [], alliance: null, cities: [] }) } });
  try { assert.deepEqual(await mapRouter.freeSitesFor('p1', 10), []); } finally { restore(); }
});

// ---- Colonie sans garnison (§ 1 bis) : une armée qui y stationne ne dépose ni ne prend de troupes ----
test('armée dans une colonie sans garnison : refus clair au lieu de « Garnison introuvable »', async () => {
  const armiesRouter = require('../../src/routes/armies');
  const adjust = handlerOf(armiesRouter, 'post', '/:id/adjust-unit');
  const colonyCity = { id: 'col', x: 10, y: 10, isCapital: false };
  const army = { id: 'a1', ownerId: 'p1', cityId: 'col', isGarrison: false, status: 'IDLE', x: 10, y: 10, units: [], owner: { faction: 'ROME', technologies: [], alliance: null, cities: [] }, hero: null, city: colonyCity };
  const tx = {
    $queryRaw: async () => [],
    army: { findFirst: async ({ where }) => (where.isGarrison ? null : army) }
  };
  const restore = swapPrisma({ $transaction: async (fn) => fn(tx) });
  try {
    const res = fakeRes();
    await adjust({ params: { id: 'a1' }, body: { unitKey: 'ROM_INF_MILICIEN', delta: 5 }, user: { playerId: 'p1' } }, res);
    assert.equal(res.statusCode, 400);
    assert.match(res.body.error, /colonie n'a pas de garnison/);
  } finally { restore(); }
});

// Dissoudre une armée dont la ville est une colonie sans garnison : vide, elle disparaît (sinon elle resterait pour
// toujours) ; avec des troupes, refus clair (pas de garnison où les poser) ; la capitale garde son erreur
function fakeDisbandDb(army) {
  const deleted = [], upserts = [];
  const tx = {
    $queryRaw: async () => [],
    army: { findFirst: async ({ where }) => (where.isGarrison ? null : army), delete: async ({ where }) => { deleted.push(where.id); } },
    armyUnit: { upsert: async (q) => { upserts.push(q); }, deleteMany: async () => ({ count: 0 }) },
    hero: { update: async () => ({}) }
  };
  return { deleted, upserts, restore: swapPrisma({ $transaction: async (fn) => fn(tx) }) };
}
test('dissoudre une armée d\'une colonie sans garnison : vide, elle disparaît ; avec des troupes, refus clair', async () => {
  const disband = handlerOf(require('../../src/routes/armies'), 'delete', '/:id/disband');
  const armyIn = (city, units) => ({ id: 'a1', ownerId: 'p1', cityId: city.id, isGarrison: false, status: 'IDLE', x: city.x, y: city.y, heroId: null, units, owner: { faction: 'ROME', technologies: [], alliance: null, cities: [] }, hero: null, city });
  const colonyCity = { id: 'col', x: 10, y: 10, isCapital: false };
  const cases = [
    [armyIn(colonyCity, []), 200],
    [armyIn(colonyCity, [{ unitKey: 'ROM_INF_MILICIEN', tier: 'base', count: 0 }]), 200],
    [armyIn(colonyCity, [{ unitKey: 'ROM_INF_MILICIEN', tier: 'base', count: 4 }]), 400],
    [armyIn({ id: 'cap', x: 0, y: 0, isCapital: true }, []), 404]
  ];
  for (const [army, status] of cases) {
    const db = fakeDisbandDb(army);
    try {
      const res = fakeRes();
      await disband({ params: { id: 'a1' }, user: { playerId: 'p1' } }, res);
      assert.equal(res.statusCode, status, JSON.stringify(res.body));
      assert.equal(db.upserts.length, 0, 'aucune troupe posée nulle part');
      assert.deepEqual(db.deleted, status === 200 ? ['a1'] : []);
      if (status === 400) assert.match(res.body.error, /colonie n'a pas de garnison/);
    } finally { db.restore(); }
  }
});
