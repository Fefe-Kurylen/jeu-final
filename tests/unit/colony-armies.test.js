// Armées rattachées aux colonies (décision du 1er novembre 2026, simulation de 200 jours, E2) : rattacher une armée à
// l'arrêt dans sa colonie (emplacement libre de la colonie, son héros la suit), la renvoyer à la capitale (emplacement de la
// capitale pris dès le départ), ni troupes ajoutées ni retirées en colonie, dissolution seulement vide, armée libérée quand
// la colonie tombe, retour qui crédite le stock commun, transport payé sur le stock commun (E1).
// Aucune requête réelle : le client Prisma est remplacé le temps de chaque test.
require('./_env');
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://unit:unit@localhost:5432/unit';   // le client Prisma est créé, jamais interrogé
const test = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../../src/config/database');
const config = require('../../src/config');
const armiesRouter = require('../../src/routes/armies');
const { MARKET_BUSY } = require('../../src/services/marketService');
const { Terrain } = require('../../src/utils/pathfinding');
const { attachRefusal, detachRefusal, attachedColonyOf, firstFreeSlot, nameForSlot } = armiesRouter;

const fakeRes = () => {
  const r = { statusCode: 200, body: null };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
};
const handlerOf = (method, routePath) => armiesRouter.stack.find(l => l.route && l.route.path === routePath && l.route.methods[method]).route.stack.at(-1).handle;
function swapPrisma(tables) {
  const all = { bastion: { findMany: async () => [], findFirst: async () => null }, ...tables };   // aucun Bastion actif (bonus de marche et de charge)
  const saved = Object.fromEntries(Object.keys(all).map(k => [k, prisma[k]]));
  Object.assign(prisma, all);
  return () => Object.assign(prisma, saved);
}
const SOLDIER = { unitKey: 'ROM_INF_MILICIEN', tier: 'base', count: 40 };
const RALLY = (level) => [{ key: 'RALLY_POINT', level }];
const owner = { faction: 'ROME', technologies: [], alliance: null, cities: [{ isCapital: true, buildings: RALLY(10) }] };

// ---- règles pures ----
test('rattacher : armée à l\'arrêt dans une de ses colonies, jamais la garnison, une armée du marché, la capitale ni la Ville Merveille', () => {
  const colony = { id: 'col', name: 'Ostia', isCapital: false, isWonder: false };
  const army = { id: 'a1', name: 'Armée 2', cityId: 'cap', isGarrison: false, status: 'IDLE', claimedAt: null };
  assert.equal(attachRefusal(army, colony), null);
  assert.equal(attachRefusal(null, colony), 'Armée non trouvée');
  assert.match(attachRefusal({ ...army, isGarrison: true }, colony), /garnison/);
  assert.equal(attachRefusal({ ...army, status: 'MARKET' }, colony), MARKET_BUSY);
  assert.match(attachRefusal({ ...army, status: 'MOVING' }, colony), /déjà en mission/);
  assert.match(attachRefusal({ ...army, claimedAt: new Date() }, colony), /déjà en mission/, 'arrivée en cours de résolution');
  assert.match(attachRefusal(army, null), /une de vos colonies/);
  assert.match(attachRefusal(army, { ...colony, isCapital: true }), /capitale/);
  assert.match(attachRefusal({ ...army, cityId: 'col' }, colony), /déjà rattachée à Ostia/);
  // la Ville Merveille n'est pas une colonie (config.army.colonyArmies.wonderCity)
  assert.equal(config.army.colonyArmies.wonderCity, false);
  assert.match(attachRefusal(army, { ...colony, isWonder: true }), /Ville Merveille n'est pas une colonie/);
  assert.equal(attachRefusal(army, { ...colony, isWonder: true }, { wonderCity: true }), null);
});

test('renvoyer à la capitale : seulement une armée d\'une colonie, à l\'arrêt, avec au moins un soldat', () => {
  const army = { id: 'a1', cityId: 'col', city: { id: 'col', isCapital: false }, isGarrison: false, status: 'IDLE', claimedAt: null, units: [SOLDIER], heroId: null };
  assert.equal(detachRefusal(army), null);
  assert.match(detachRefusal({ ...army, city: { id: 'cap', isCapital: true } }), /appartient déjà à la capitale/);
  assert.equal(detachRefusal({ ...army, status: 'MARKET' }), MARKET_BUSY);
  assert.match(detachRefusal({ ...army, status: 'RETURNING' }), /déjà en mission/);
  assert.match(detachRefusal({ ...army, units: [] }), /Armée vide : dissolvez-la/);
  assert.match(detachRefusal({ ...army, units: [{ ...SOLDIER, count: 0 }], heroId: 'h1' }), /héros nécessite au moins 1 soldat/);
});

test('emplacements : le premier libre jusqu\'au plafond, le nom par défaut suit l\'emplacement', () => {
  assert.equal(firstFreeSlot([1, 3], 3), 2);
  assert.equal(firstFreeSlot([1, 2, 3], 3), null);
  assert.equal(firstFreeSlot([7], 1), 1, 'une armée au-delà du plafond (reprise d\'une colonie rasée) ne bloque rien');
  assert.equal(firstFreeSlot([], 0), null, 'sans Place de rassemblement, aucune armée');
  assert.equal(nameForSlot({ name: 'Armée 4', slot: 4 }, 2), 'Armée 2');
  assert.equal(nameForSlot({ name: 'Garde', slot: 4 }, 2), 'Garde');
});

test('GET /api/armies : attachedColony dit à quelle colonie l\'armée est rattachée (null pour la capitale et la garnison)', async () => {
  assert.deepEqual(attachedColonyOf({ isGarrison: false, city: { id: 'col', name: 'Ostia', isCapital: false, isWonder: false } }), { id: 'col', name: 'Ostia', isWonder: false });
  assert.equal(attachedColonyOf({ isGarrison: false, city: { id: 'cap', isCapital: true } }), null);
  assert.equal(attachedColonyOf({ isGarrison: true, city: { id: 'col', isCapital: false } }), null);
  const restore = swapPrisma({ army: { findMany: async () => [
    { id: 'a1', isGarrison: false, units: [], city: { id: 'col', name: 'Ostia', isCapital: false, isWonder: false } },
    { id: 'a2', isGarrison: false, units: [], city: { id: 'cap', name: 'Roma', isCapital: true } }
  ] } });
  try {
    const res = fakeRes();
    await handlerOf('get', '/')({ user: { playerId: 'p1' } }, res);
    assert.deepEqual(res.body.map(a => [a.id, a.attachedColony?.id ?? null]), [['a1', 'col'], ['a2', null]]);
  } finally { restore(); }
});

// ---- POST /api/army/:id/attach-colony ----
// Transaction factice : requêtes SQL brutes notées dans l'ordre, armées et villes en mémoire
function attachDb({ army, cities, armies = [] }) {
  const sql = [], updates = [], heroes = [];
  const all = [army, ...armies];
  const cityAt = (where) => Object.values(cities).find(c => c.playerId === where.playerId && c.x === where.x && c.y === where.y) || null;
  const tx = {
    $queryRaw: async (strings, ...values) => { sql.push({ text: strings.join('?').replace(/\s+/g, ' ').trim(), values }); return []; },
    army: {
      findFirst: async ({ where, include }) => {
        const a = all.find(x => x.id === where.id && x.ownerId === where.ownerId);
        return a ? { ...a, ...(include?.city ? { city: cities[a.cityId] || null } : {}) } : null;
      },
      findMany: async ({ where }) => all.filter(a => a.cityId === where.cityId && !a.isGarrison).map(a => ({ slot: a.slot })),
      updateMany: async ({ where, data }) => {
        const a = all.find(x => x.id === where.id && x.status === where.status && x.cityId === where.cityId);
        if (!a) return { count: 0 };
        updates.push(data); Object.assign(a, data);
        return { count: 1 };
      }
    },
    city: {
      findFirst: async ({ where }) => cityAt(where),
      findUnique: async ({ where }) => (cities[where.id] ? { ...cities[where.id] } : null),
      findMany: async ({ where }) => Object.values(cities).filter(c => c.playerId === where.playerId)
    },
    hero: { update: async (q) => { heroes.push(q); } }
  };
  return { sql, updates, heroes, restore: swapPrisma({ $transaction: async (fn) => fn(tx) }) };
}
const CITIES = () => ({
  cap: { id: 'cap', name: 'Roma', playerId: 'p1', isCapital: true, isWonder: false, x: 0, y: 0, buildings: RALLY(10) },
  col: { id: 'col', name: 'Ostia', playerId: 'p1', isCapital: false, isWonder: false, x: 20, y: 20, buildings: [] },
  won: { id: 'won', name: 'Merveille', playerId: 'p1', isCapital: false, isWonder: true, x: 40, y: 40, buildings: [] }
});

test('rattacher : l\'armée de la capitale posée dans la colonie prend le premier emplacement libre de la colonie, son héros la suit', async () => {
  const army = { id: 'a1', ownerId: 'p1', name: 'Armée 4', slot: 4, cityId: 'cap', x: 20, y: 20, status: 'IDLE', claimedAt: null, isGarrison: false, heroId: 'h1' };
  const taken = { id: 'g1', ownerId: 'p1', name: 'Garde', slot: 1, cityId: 'col', x: 20, y: 20, status: 'IDLE', isGarrison: false };
  const db = attachDb({ army, cities: CITIES(), armies: [taken] });
  try {
    const res = fakeRes();
    await handlerOf('post', '/:id/attach-colony')({ params: { id: 'a1' }, user: { playerId: 'p1' } }, res);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.deepEqual(db.updates, [{ cityId: 'col', slot: 2, name: 'Armée 2' }], 'emplacement 2 de la colonie (le 1 est pris), le nom par défaut suit');
    assert.deepEqual(db.heroes, [{ where: { id: 'h1' }, data: { cityId: 'col' } }]);
    assert.match(res.body.message, /Armée 2 est rattachée à Ostia : elle la défend et y rentre après chaque mission/);
    assert.equal(res.body.fromCityId, 'cap');
    // verrous : les deux villes en une requête dans l'ordre des id, puis le héros, puis l'armée
    assert.match(db.sql[0].text, /FROM "City" WHERE id = ANY\(\?\) ORDER BY id FOR UPDATE/);
    assert.deepEqual([...db.sql[0].values[0]].sort(), ['cap', 'col']);
    assert.match(db.sql[1].text, /FROM "Hero" WHERE "playerId" = \? FOR UPDATE/);
    assert.match(db.sql[2].text, /FROM "Army" WHERE id = \? FOR UPDATE/);
  } finally { db.restore(); }
});

test('rattacher : refusé quand la colonie n\'a plus d\'emplacement (autant que la Place de rassemblement de la capitale)', async () => {
  const army = { id: 'a1', ownerId: 'p1', name: 'Armée 4', slot: 4, cityId: 'cap', x: 20, y: 20, status: 'IDLE', claimedAt: null, isGarrison: false, heroId: null };
  const full = [1, 2, 3].map(slot => ({ id: `g${slot}`, ownerId: 'p1', slot, cityId: 'col', isGarrison: false, status: 'IDLE' }));
  const db = attachDb({ army, cities: CITIES(), armies: full });
  try {
    const res = fakeRes();
    await handlerOf('post', '/:id/attach-colony')({ params: { id: 'a1' }, user: { playerId: 'p1' } }, res);
    assert.equal(res.statusCode, 400);
    assert.match(res.body.error, /Plus d'emplacement d'armée libre à Ostia \(3 au plus, comme la Place de rassemblement de la capitale\)/);
    assert.equal(db.updates.length, 0);
  } finally { db.restore(); }
});

test('rattacher : ni dans la Ville Merveille, ni hors d\'une de ses villes, ni une armée du marché', async () => {
  const base = { id: 'a1', ownerId: 'p1', name: 'Armée 4', slot: 4, cityId: 'cap', status: 'IDLE', claimedAt: null, isGarrison: false, heroId: null };
  for (const [army, status, pattern] of [
    [{ ...base, x: 40, y: 40 }, 400, /Ville Merveille n'est pas une colonie/],
    [{ ...base, x: 33, y: 7 }, 400, /une de vos colonies/],
    [{ ...base, x: 20, y: 20, status: 'MARKET' }, 400, /offre du marché/],
    [{ ...base, x: 0, y: 0 }, 400, /capitale/]
  ]) {
    const db = attachDb({ army, cities: CITIES() });
    try {
      const res = fakeRes();
      await handlerOf('post', '/:id/attach-colony')({ params: { id: 'a1' }, user: { playerId: 'p1' } }, res);
      assert.equal(res.statusCode, status, JSON.stringify(res.body));
      assert.match(res.body.error, pattern);
      assert.equal(db.updates.length, 0);
    } finally { db.restore(); }
  }
});

// ---- POST /api/army/:id/detach-colony ----
function detachDb({ army, cities, armies = [] }) {
  const sql = [], updates = [], heroes = [];
  const all = [army, ...armies];
  const full = (a) => ({ ...a, units: a.units || [], owner, hero: null, city: cities[a.cityId] || null });
  const tx = {
    $queryRaw: async (strings, ...values) => { sql.push({ text: strings.join('?').replace(/\s+/g, ' ').trim(), values }); return []; },
    $executeRaw: async () => 1,
    army: {
      findFirst: async ({ where }) => { const a = all.find(x => x.id === where.id && x.ownerId === where.ownerId); return a ? full(a) : null; },
      findMany: async ({ where }) => all.filter(a => a.cityId === where.cityId && !a.isGarrison).map(a => ({ slot: a.slot })),
      findUnique: async () => ({ id: army.id, carryWood: 0, carryStone: 0, carryIron: 0, carryFood: 0, carryGold: 0, settlers: 0, woundedCarry: [] }),
      update: async () => ({}),
      updateMany: async ({ where, data }) => {
        const a = all.find(x => x.id === where.id && x.status === where.status && x.cityId === where.cityId);
        if (!a) return { count: 0 };
        updates.push(data); Object.assign(a, data);
        return { count: 1 };
      }
    },
    city: { findUnique: async ({ where }) => (cities[where.id] ? { ...cities[where.id] } : null) },
    hero: { update: async (q) => { heroes.push(q); } }
  };
  const restore = swapPrisma({
    $transaction: async (fn) => fn(tx),
    army: { findFirst: async ({ where }) => { const a = all.find(x => x.id === where.id && x.ownerId === where.ownerId); return a ? { ...a, owner: { faction: 'ROME' } } : null; } },
    city: { findFirst: async ({ where }) => Object.values(cities).find(c => c.playerId === where.playerId && c.isCapital === where.isCapital) || null, findMany: async () => [] },
    resourceNode: { findMany: async () => [] }
  });
  return { sql, updates, heroes, restore };
}

test('renvoyer à la capitale : l\'emplacement libre de la capitale est pris dès le départ, l\'armée y marche comme un retour', async () => {
  Terrain.setWorldSeed(0);
  const cities = { cap: { id: 'cap', name: 'Roma', playerId: 'p1', isCapital: true, x: -150, y: -150, buildings: RALLY(10) }, col: { id: 'col', name: 'Ostia', playerId: 'p1', isCapital: false, x: -140, y: -150, isSieged: false, buildings: [] } };
  const army = { id: 'a1', ownerId: 'p1', name: 'Armée 1', slot: 1, cityId: 'col', x: -140, y: -150, status: 'IDLE', claimedAt: null, isGarrison: false, heroId: 'h1', units: [SOLDIER] };
  const capitalArmies = [1, 2].map(slot => ({ id: `c${slot}`, ownerId: 'p1', slot, cityId: 'cap', isGarrison: false, status: 'IDLE' }));
  const db = detachDb({ army, cities, armies: capitalArmies });
  try {
    const res = fakeRes();
    const before = Date.now();
    await handlerOf('post', '/:id/detach-colony')({ params: { id: 'a1' }, user: { playerId: 'p1' } }, res);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    const u = db.updates[0];
    assert.deepEqual([u.cityId, u.slot, u.name, u.status, u.missionType, u.targetX, u.targetY], ['cap', 3, 'Armée 3', 'RETURNING', 'RETURN', -150, -150]);
    assert.ok(res.body.travelTime > 0 && u.arrivalAt.getTime() >= before + res.body.travelTime * 1000 - 5, 'elle marche jusqu\'à la capitale');
    assert.deepEqual(db.heroes, [{ where: { id: 'h1' }, data: { cityId: 'cap' } }], 'le héros suit son armée');
    assert.match(res.body.message, /Armée 3 rentre à la capitale \(arrivée dans \d+ min\) : l'emplacement 3 l'y attend/);
    // toutes les villes du joueur dans l'ordre des id, avant l'armée (ce qu'elle porte peut aller dans toutes ses villes, E1)
    assert.match(db.sql[0].text, /FROM "City" WHERE "playerId" = \? ORDER BY id FOR UPDATE/);
    assert.deepEqual(db.sql[0].values, ['p1']);
  } finally { db.restore(); }
});

test('renvoyer à la capitale : refusé sans emplacement libre dans la capitale, ou depuis une colonie assiégée', async () => {
  const cities = { cap: { id: 'cap', name: 'Roma', playerId: 'p1', isCapital: true, x: 5, y: 5, buildings: RALLY(10) }, col: { id: 'col', name: 'Ostia', playerId: 'p1', isCapital: false, x: 5, y: 5, isSieged: false, buildings: [] } };
  // déjà sur la case de la capitale (aucun trajet à calculer)
  const army = { id: 'a1', ownerId: 'p1', name: 'Armée 1', slot: 1, cityId: 'col', x: 5, y: 5, status: 'IDLE', claimedAt: null, isGarrison: false, heroId: null, units: [SOLDIER] };
  const full = [1, 2, 3].map(slot => ({ id: `c${slot}`, ownerId: 'p1', slot, cityId: 'cap', isGarrison: false, status: 'IDLE' }));
  let db = detachDb({ army: { ...army }, cities, armies: full });
  try {
    const res = fakeRes();
    await handlerOf('post', '/:id/detach-colony')({ params: { id: 'a1' }, user: { playerId: 'p1' } }, res);
    assert.equal(res.statusCode, 400);
    assert.match(res.body.error, /Aucun emplacement d'armée libre dans la capitale \(3 au plus/);
    assert.equal(db.updates.length, 0);
  } finally { db.restore(); }
  // dans sa colonie assiégée : on ne sort que contre le camp
  const sieged = { ...cities, cap: { ...cities.cap, x: 0, y: 0 }, col: { ...cities.col, isSieged: true } };
  db = detachDb({ army: { ...army }, cities: sieged });
  try {
    const res = fakeRes();
    Terrain.setWorldSeed(0);
    await handlerOf('post', '/:id/detach-colony')({ params: { id: 'a1' }, user: { playerId: 'p1' } }, res);
    if (res.statusCode !== 400 || !/Ville assiégée/.test(res.body.error || '')) assert.fail(JSON.stringify(res.body));
    assert.equal(db.updates.length, 0);
  } finally { db.restore(); }
  // déjà sur la case de la capitale : elle appartient de nouveau à la capitale sans marcher
  db = detachDb({ army: { ...army }, cities });
  try {
    const res = fakeRes();
    await handlerOf('post', '/:id/detach-colony')({ params: { id: 'a1' }, user: { playerId: 'p1' } }, res);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.deepEqual([db.updates[0].cityId, db.updates[0].slot, db.updates[0].status], ['cap', 1, 'IDLE']);
    assert.match(res.body.message, /appartient de nouveau à la capitale \(emplacement 1\)/);
  } finally { db.restore(); }
});

// ---- pas de troupes ajoutées ni retirées en colonie, dissolution seulement vide ----
function unitsDb(army, { colonyGarrison = false } = {}) {
  const deleted = [];
  const tx = {
    $queryRaw: async () => [],
    army: {
      findFirst: async ({ where }) => (where.isGarrison ? (colonyGarrison ? { id: 'gcol', units: [{ ...SOLDIER, count: 500 }] } : null) : army),
      delete: async ({ where }) => { deleted.push(where.id); }
    },
    armyUnit: { upsert: async () => { throw new Error('aucune troupe ne doit bouger'); }, updateMany: async () => { throw new Error('aucune troupe ne doit bouger'); }, deleteMany: async () => ({ count: 0 }) },
    hero: { update: async () => ({}) }
  };
  return { deleted, restore: swapPrisma({ $transaction: async (fn) => fn(tx) }) };
}

test('armée rattachée : ni ajout ni retrait de troupes, même dans une ancienne colonie qui aurait une garnison', async () => {
  const colonyCity = { id: 'col', x: 10, y: 10, isCapital: false };
  const army = { id: 'a1', ownerId: 'p1', cityId: 'col', isGarrison: false, status: 'IDLE', x: 10, y: 10, units: [SOLDIER], owner, hero: null, city: colonyCity };
  for (const [route, body] of [['/:id/adjust-unit', { unitKey: SOLDIER.unitKey, delta: 5 }], ['/:id/set-unit', { unitKey: SOLDIER.unitKey, count: 0 }]]) {
    const db = unitsDb(army, { colonyGarrison: true });
    try {
      const res = fakeRes();
      await handlerOf('post', route)({ params: { id: 'a1' }, body, user: { playerId: 'p1' } }, res);
      assert.equal(res.statusCode, 400, route);
      assert.match(res.body.error, /colonie n'a pas de garnison : une armée rattachée à une colonie ne prend ni ne rend de troupes. Renvoyez-la à la capitale/);
    } finally { db.restore(); }
  }
  // dissoudre : refusé avec des soldats, permis vide
  let db = unitsDb(army, { colonyGarrison: true });
  try {
    const res = fakeRes();
    await handlerOf('delete', '/:id/disband')({ params: { id: 'a1' }, user: { playerId: 'p1' } }, res);
    assert.equal(res.statusCode, 400);
    assert.match(res.body.error, /se dissout vide, ou une fois revenue à la capitale/);
    assert.deepEqual(db.deleted, []);
  } finally { db.restore(); }
  db = unitsDb({ ...army, units: [] }, { colonyGarrison: true });
  try {
    const res = fakeRes();
    await handlerOf('delete', '/:id/disband')({ params: { id: 'a1' }, user: { playerId: 'p1' } }, res);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.deepEqual(db.deleted, ['a1']);
  } finally { db.restore(); }
});

// ---- transport par armée : payé sur le stock commun (E1) ----
test('transport : la charge se prend dans la ville de départ, puis dans la plus pleine ; refus clair si toutes les villes réunies n\'ont pas assez', async () => {
  const transport = handlerOf('post', '/:id/transport');
  const capital = { id: 'cap', playerId: 'p1', isCapital: true, x: -150, y: -150 };
  const target = { id: 'friend', playerId: 'p2', name: 'Athenae', x: -140, y: -150, isWonder: false };
  const rows = () => [
    { id: 'cap', isCapital: true, wood: 100, stone: 0, iron: 0, food: 0, maxStorage: 1000, maxFoodStorage: 1000 },
    { id: 'col', isCapital: false, wood: 900, stone: 0, iron: 0, food: 0, maxStorage: 1000, maxFoodStorage: 1000 }
  ];
  const run = async (wood) => {
    const debits = [], sql = [], moved = [];
    const army = { id: 'a1', ownerId: 'p1', cityId: 'cap', isGarrison: false, status: 'IDLE', heroId: null, units: [{ unitKey: SOLDIER.unitKey, tier: 'base', count: 1000 }], owner: { ...owner, cities: [{ isCapital: true, buildings: [{ key: 'MARKET', level: 1 }, ...RALLY(10)] }] }, hero: null, city: capital, x: -150, y: -150 };
    const tx = {
      $queryRaw: async (strings, ...values) => { sql.push(strings.join('?')); return strings.join('?').includes('"playerId"') ? rows() : []; },
      $executeRaw: async (strings, ...values) => { debits.push({ cityId: values[4], wood: values[0] }); return 1; },
      army: { findFirst: async () => army, updateMany: async ({ data }) => { moved.push(data); return { count: 1 }; } },
      city: { findUnique: async () => capital },
      cityBuilding: { findMany: async () => [] },
      playerTechnology: { findMany: async () => [] }
    };
    const restore = swapPrisma({
      $transaction: async (fn) => fn(tx),
      city: { findUnique: async () => target, findMany: async () => [] },
      resourceNode: { findMany: async () => [] },
      allianceMember: { findUnique: async () => null, findMany: async () => [] },
      diplomacy: { findFirst: async () => null }
    });
    const quests = require('../../src/services/questService'), bump = quests.bumpLater;
    quests.bumpLater = () => {};   // compteur de quête du transport : hors sujet ici
    try {
      const res = fakeRes();
      await transport({ params: { id: 'a1' }, body: { targetCityId: 'friend', wood }, user: { playerId: 'p1' } }, res);
      return { res, debits, sql, moved };
    } finally { restore(); quests.bumpLater = bump; }
  };
  Terrain.setWorldSeed(0);
  const ok = await run(600);
  assert.equal(ok.res.statusCode, 200, JSON.stringify(ok.res.body));
  assert.ok(ok.sql.some(q => /FROM "City" WHERE "playerId" = \? ORDER BY id FOR UPDATE/.test(q)), 'toutes les villes du joueur verrouillées');
  assert.deepEqual(ok.debits, [{ cityId: 'cap', wood: 100 }, { cityId: 'col', wood: 500 }], 'la capitale d\'abord, la colonie pour le reste');
  assert.equal(ok.moved[0].carryWood, 600);
  const short = await run(1500);
  assert.equal(short.res.statusCode, 400);
  assert.match(short.res.body.error, /Ressources insuffisantes : il manque 500 de bois \(toutes vos villes comprises\)/);
  assert.deepEqual(short.debits, [], 'rien n\'est pris');
});

// ---- retour d'une armée rattachée : ce qu'elle rapporte va dans sa colonie, puis dans les autres villes ----
test('retour dans une colonie pleine : le butin va dans la colonie, puis dans la capitale qui a de la place (stock commun)', async () => {
  const { processArmyMovements } = require('../../src/game/processors/armyProcessor');
  const now = new Date();
  const colony = { id: 'col', name: 'Ostia', playerId: 'p1', isCapital: false, x: 20, y: 20 };
  const army = { id: 'a1', name: 'Garde', ownerId: 'p1', cityId: 'col', status: 'RETURNING', missionType: 'RETURN', x: 30, y: 20, targetX: 20, targetY: 20, arrivalAt: now, claimedAt: null, carryWood: 800, carryStone: 0, carryIron: 0, carryFood: 0, carryGold: 0, settlers: 0, units: [SOLDIER], owner: { name: 'César', faction: 'ROME' }, city: colony };
  const credits = [], updates = [];
  const restore = swapPrisma({
    army: {
      findMany: async ({ where }) => (where.claimedAt === null ? [army] : []),
      updateMany: async () => ({ count: 1 }),
      update: async (q) => { updates.push(q.data); return q.data; },
      findUnique: async () => ({ woundedCarry: [] }),
      count: async () => 0
    },
    city: { findUnique: async () => colony },
    $queryRaw: async () => [
      { id: 'cap', isCapital: true, wood: 0, stone: 0, iron: 0, food: 0, maxStorage: 1000, maxFoodStorage: 1000 },
      { id: 'col', isCapital: false, wood: 900, stone: 0, iron: 0, food: 0, maxStorage: 1000, maxFoodStorage: 1000 }
    ],
    $executeRaw: async (strings, ...values) => { credits.push({ cityId: values[4], wood: values[0] }); return 1; }
  });
  try { await processArmyMovements(now); } finally { restore(); }
  assert.deepEqual(credits, [{ cityId: 'col', wood: 100 }, { cityId: 'cap', wood: 700 }], 'la colonie jusqu\'à son plafond, le reste à la capitale');
  assert.ok(updates.some(d => d.status === 'IDLE'), 'l\'armée est rentrée');
});

// ---- chute de la colonie : l'armée rattachée qui la défendait est libérée ----
test('colonie rasée : l\'armée rattachée qui s\'y tenait passe à la capitale (vide : aussitôt chez elle), la garnison tombe', async () => {
  const { razeCity } = require('../../src/services/conquestService');
  const capital = { id: 'cap', playerId: 'p1', isCapital: true, x: -150, y: -150 };
  const colony = { id: 'col', playerId: 'p1', name: 'Ostia', isCapital: false, wallStructure: 0, x: -140, y: -150 };
  const armies = [
    { id: 'old', cityId: 'col', isGarrison: true, status: 'IDLE', x: -140, y: -150, slot: 0, name: 'Garnison', units: [SOLDIER] },
    { id: 'empty', cityId: 'col', isGarrison: false, status: 'IDLE', x: -140, y: -150, slot: 1, name: 'Armée 1', units: [], heroId: 'h1' },
    { id: 'kept', cityId: 'cap', isGarrison: false, status: 'IDLE', x: -150, y: -150, slot: 1, name: 'Armée 1', units: [SOLDIER] }
  ];
  const deleted = [], updates = {}, heroMoves = [];
  const tx = {
    $queryRaw: async (strings) => (strings.join('?').includes('"playerId"') ? [{ id: 'cap', isCapital: true, wood: 0, stone: 0, iron: 0, food: 0, maxStorage: 1e6, maxFoodStorage: 1e6 }, { id: 'col', isCapital: false, wood: 0, stone: 0, iron: 0, food: 0, maxStorage: 1e6, maxFoodStorage: 1e6 }] : []),
    $executeRaw: async () => 1,
    city: {
      findUnique: async ({ where }) => (where.id === 'col' ? { ...colony, armies: armies.filter(a => a.cityId === 'col') } : null),
      findFirst: async ({ where }) => (where.isCapital ? capital : null),
      delete: async () => ({})
    },
    player: { findUnique: async () => ({ faction: 'ROME' }) },
    hero: { updateMany: async (q) => { heroMoves.push(q); return { count: 1 }; } },
    army: {
      findMany: async ({ where }) => (where.cityId === 'cap' ? armies.filter(a => a.cityId === 'cap').map(a => ({ slot: a.slot })) : []),
      delete: async ({ where }) => { deleted.push(where.id); },
      update: async ({ where, data }) => { updates[where.id] = data; },
      updateMany: async () => ({ count: 0 })
    },
    marketOffer: { findMany: async () => [], updateMany: async () => ({ count: 0 }) },
    resourceNode: { updateMany: async () => ({ count: 0 }) },
    researchQueueItem: { findMany: async () => [], findFirst: async () => null, count: async () => 0 }
  };
  const restore = swapPrisma({ $transaction: async (fn) => fn(tx), city: { findMany: async () => [] }, resourceNode: { findMany: async () => [] } });
  try {
    const out = await razeCity('col', null);
    assert.equal(out.released, 1);
    assert.deepEqual(deleted, ['old'], 'la garnison d\'une ancienne colonie tombe avec elle');
    assert.deepEqual(updates.empty, { cityId: 'cap', slot: 2, name: 'Armée 2', x: -150, y: -150 }, 'vide : posée tout de suite dans la capitale, sur l\'emplacement libre suivant (le nom par défaut suit)');
    assert.ok(heroMoves.some(q => q.data.cityId === 'cap'), 'son héros passe à la capitale avec elle');
  } finally { restore(); }
});

// ---- client : onglet Armée et « Mes villes » (07-army.js, 06c-colonies.js) ----
let acorn = null;
try { acorn = require('acorn'); } catch (e) { /* acorn vient avec eslint (dépendance de dev) */ }
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const FRONT = path.join(__dirname, '..', '..', 'frontend', 'js', 'app');
// les déclarations de premier niveau d'un fichier du client qui portent ces noms
function pick(file, names) {
  const code = fs.readFileSync(path.join(FRONT, file), 'utf8');
  const found = new Map();
  for (const node of acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'script' }).body) {
    const name = node.type === 'FunctionDeclaration' ? node.id.name : node.type === 'VariableDeclaration' ? node.declarations[0].id.name : null;
    if (names.includes(name)) found.set(name, code.slice(node.start, node.end));
  }
  assert.deepEqual([...found.keys()].sort(), [...names].sort());
  return [...found.values()].join('\n');
}
const ARMY_UI = ['COLONY_ARMY_RULE', 'armyColonyOf', 'colonyToAttach', 'armiesToAttachIn', 'colonyGuestsHtml', 'renderArmyCardNew'];
function clientContext(extra = {}) {
  const ctx = {
    console, resIconHtml: n => `[${n}]`, escapeHtml: s => String(s), formatNum: n => String(Math.floor(n)), heroPortraitHtml: () => '', unitIconHtml: () => '', sheetKey: k => k,
    siegeTimeLeft: () => '', serverNow: () => Date.now(), unitsData: [], player: { faction: 'ROME' }, currentCity: null, cities: [], armies: [], ...extra
  };
  vm.createContext(ctx);
  return ctx;
}
const ROMA = { id: 'cap', name: 'Roma', isCapital: true, x: 0, y: 0 }, OSTIA = { id: 'col', name: 'Ostia', isCapital: false, isWonder: false, x: 20, y: 20 };

test('client : armée rattachée « Renvoyer à la capitale », armée posée dans une colonie « Rattacher à … », pas de composition en colonie', { skip: acorn ? false : 'acorn absent' }, () => {
  const ctx = clientContext({ cities: [ROMA, OSTIA] });
  vm.runInContext(pick('07-army.js', ARMY_UI), ctx);
  const card = (army) => ctx.renderArmyCardNew(army.slot || 1, { name: 'Armée 1', units: [{ unitKey: SOLDIER.unitKey, count: 40 }], power: 0, status: 'IDLE', ...army }, false, null);
  const attached = card({ id: 'a1', cityId: 'col', x: 20, y: 20, attachedColony: { id: 'col', name: 'Ostia', isWonder: false } });
  assert.match(attached, /Rattachée à Ostia : elle la défend et y rentre/);
  assert.match(attached, /sendArmyBackToCapital\('a1'\)/);
  assert.doesNotMatch(attached, /openArmyComposition/, 'pas de garnison en colonie : rien à composer');
  const empty = card({ id: 'a5', cityId: 'col', x: 20, y: 20, units: [], attachedColony: { id: 'col', name: 'Ostia', isWonder: false } });
  assert.doesNotMatch(empty, /sendArmyBackToCapital\('a5'\)/, 'vide : le serveur refuse le renvoi, elle se dissout dans la colonie');
  assert.match(empty, /disabled title="Armée vide : dissolvez-la dans la colonie"/);
  const guest = card({ id: 'a2', cityId: 'cap', x: 20, y: 20, attachedColony: null });
  assert.match(guest, /attachArmyToColony\('a2'\)/);
  assert.match(guest, /Rattacher à Ostia/);
  const home = card({ id: 'a3', cityId: 'cap', x: 0, y: 0, attachedColony: null });
  assert.match(home, /openArmyComposition\('a3'\)/);
  assert.doesNotMatch(home, /Rattacher|Renvoyer/);
  // en mission, une armée rattachée se rappelle comme les autres (elle rentre dans sa colonie)
  const away = card({ id: 'a4', cityId: 'col', status: 'MOVING', x: 20, y: 20, targetX: 30, targetY: 20, attachedColony: { id: 'col', name: 'Ostia' } });
  assert.match(away, /returnArmy\('a4'\)/);
  // place libre de l'onglet Armée d'une colonie : on rattache, on ne crée pas
  ctx.currentCity = OSTIA;
  assert.match(ctx.renderArmyCardNew(2, null, false, null), /Rattacher une armée/);
  ctx.currentCity = ROMA;
  assert.match(ctx.renderArmyCardNew(2, null, false, null), /Créer une armée/);
});

test('client : la colonie liste les armées posées chez elle à rattacher ; la Ville Merveille n\'en rattache pas', { skip: acorn ? false : 'acorn absent' }, () => {
  const wonder = { id: 'won', name: 'Merveille', isCapital: false, isWonder: true, x: 40, y: 40 };
  const ctx = clientContext({ cities: [ROMA, OSTIA, wonder], armies: [
    { id: 'g1', name: 'Garde', cityId: 'cap', status: 'IDLE', x: 20, y: 20, units: [{ count: 120 }] },
    { id: 'g2', name: 'Convoi', cityId: 'cap', status: 'MOVING', x: 20, y: 20, units: [{ count: 5 }] },
    { id: 'g3', name: 'Déjà là', cityId: 'col', status: 'IDLE', x: 20, y: 20, units: [{ count: 9 }] },
    { id: 'w1', name: 'Garde de la Merveille', cityId: 'cap', status: 'IDLE', x: 40, y: 40, units: [{ count: 9 }] }
  ] });
  vm.runInContext(pick('07-army.js', ARMY_UI), ctx);
  const html = ctx.colonyGuestsHtml(OSTIA, 1);
  assert.match(html, /Garde <small>\(Roma\)<\/small>/);
  assert.match(html, /120 soldats/);
  assert.match(html, /attachArmyToColony\('g1'\)/);
  assert.doesNotMatch(html, /g2|g3/, 'ni une armée en marche, ni une armée déjà rattachée');
  assert.match(ctx.colonyGuestsHtml(OSTIA, 0), /disabled title="Aucune place d'armée libre dans la colonie"/);
  assert.match(ctx.colonyGuestsHtml(wonder, 1), /Ville Merveille n'est pas une colonie/);
  assert.doesNotMatch(ctx.colonyGuestsHtml(wonder, 1), /attachArmyToColony/);
});

test('client : « Mes villes » compte les armées rattachées à chaque colonie', { skip: acorn ? false : 'acorn absent' }, () => {
  const ctx = clientContext({ cities: [ROMA, OSTIA], incomingAttacks: [], RES_KEYS: ['wood', 'stone', 'iron', 'food'], getCityProduction: () => ({ wood: 0, stone: 0, iron: 0, food: 0 }), formatDuration: () => '1h', formatTime: () => 'bientôt', siteBadgeHtml: () => '', protectionHtml: () => '', currentCity: ROMA,
    armies: [{ id: 'a1', name: 'Garde', cityId: 'col', isGarrison: false, status: 'IDLE', x: 20, y: 20, units: [{ count: 30 }] }, { id: 'a2', name: 'Éclaireurs', cityId: 'col', isGarrison: false, status: 'MOVING', x: 20, y: 20, units: [{ count: 5 }] }] });
  vm.runInContext(pick('06c-colonies.js', ['lastEndOf', 'countdownHtml', 'stockBarHtml', 'myCityRowHtml']), ctx);
  const row = ctx.myCityRowHtml({ ...OSTIA, buildQueue: [], recruitQueue: [], maxStorage: 1000, maxFoodStorage: 1000 }, Date.now());
  assert.match(row, /1 armée · 30 soldats · <span title="Garde, Éclaireurs">2 rattachées<\/span>/);
  assert.doesNotMatch(ctx.myCityRowHtml({ ...ROMA, buildQueue: [], recruitQueue: [], maxStorage: 1000, maxFoodStorage: 1000 }, Date.now()), /rattachée/);
});
