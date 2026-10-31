// Routes de la revue des bâtiments (décisions du 31 octobre 2026) : emplacements de l'anneau selon le type de ville,
// Bâtiment principal 20 partout, Mur des colonies au niveau 15, or des unités d'élite payé avec les ressources et rendu à
// l'annulation, vision des armées dans le rayon de la Tour de guet, plafond de membres selon l'Ambassade du chef, taille
// des rassemblements. Aucune requête réelle : le client Prisma est remplacé le temps de chaque test.
require('./_env');
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://unit:unit@localhost:5432/unit';   // le client Prisma est créé, jamais interrogé
const test = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../../src/config/database');
const config = require('../../src/config');
const fx = require('../../src/utils/buildingEffects');
const { unitsData, buildingsData } = require('../../src/config/gamedata');
const citiesRouter = require('../../src/routes/cities');
const mapRouter = require('../../src/routes/map');
const allianceRouter = require('../../src/routes/alliance');
const rallyRouter = require('../../src/routes/rally');
const playerRouter = require('../../src/routes/player');
const R = require('../../src/services/rallyService');
const { resolveSlot } = citiesRouter;

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
const def = (key) => buildingsData.find(b => b.key === key);
const unitOf = (faction, cls, tier) => unitsData.find(u => u.faction === faction && u.class === cls && u.tier === tier);

// ---- Décision 13 : emplacements de l'anneau selon le type de ville ----
test('anneau : capitale 18 emplacements, colonie 12, Ville Merveille comme une colonie', () => {
  const { capital, colony } = config.city.ringSlots;
  const fill = (isCapital, n) => ({ isCapital, buildings: [{ key: 'MAIN_HALL', slot: 0, level: 20 }, ...Array.from({ length: n }, (_, i) => ({ key: `B${i}`, slot: i + 1, level: 1 }))], buildQueue: [] });
  for (const [label, isCapital, isWonder, ring] of [['capitale', true, false, capital], ['colonie', false, false, colony], ['Ville Merveille', false, true, colony]]) {
    const empty = { ...fill(isCapital, 0), isWonder };
    assert.equal(resolveSlot('ACADEMY', ring, null, empty), ring, `${label} : le dernier emplacement de l'anneau`);
    assert.equal(resolveSlot('ACADEMY', ring + 1, null, empty), null, `${label} : rien au-delà de ${ring}`);
    const almost = { ...fill(isCapital, ring - 1), isWonder };
    assert.equal(resolveSlot('ACADEMY', null, null, almost), ring, `${label} : la dernière place libre est donnée`);
    assert.equal(resolveSlot('ACADEMY', null, null, { ...fill(isCapital, ring), isWonder }), null, `${label} : anneau plein`);
    // un chantier en file occupe sa place
    assert.equal(resolveSlot('ACADEMY', null, null, { ...almost, buildQueue: [{ buildingKey: 'SILO', slot: ring }] }), null, `${label} : place prise par un chantier`);
  }
  assert.ok(capital > colony);
  assert.ok(config.city.wallSlot > capital, 'le Mur reste hors de l\'anneau');
});

test('anneau : autant d\'emplacements que de bâtiments possibles dans chaque type de ville', () => {
  const FIELDS = Object.keys(config.city.fieldSlots);
  for (const faction of config.validFactions) {
    for (const [isCapital, ring] of [[true, config.city.ringSlots.capital], [false, config.city.ringSlots.colony]]) {
      const keys = buildingsData.filter(d => !FIELDS.includes(d.key) && d.key !== 'MAIN_HALL' && d.key !== 'WALL' && (!d.faction || d.faction === faction)
        && (isCapital ? !fx.notInCapital(d.key) : !fx.capitalOnly(d.key))).map(d => d.key);
      assert.equal(keys.length, ring, `${faction} ${isCapital ? 'capitale' : 'colonie'}`);
      const city = { isCapital, buildings: [{ key: 'MAIN_HALL', slot: 0, level: 20 }], buildQueue: [] };
      for (const key of keys) {
        const slot = resolveSlot(key, null, null, city);
        assert.ok(slot >= 1 && slot <= ring, `${key} trouve sa place`);
        city.buildings.push({ key, slot, level: 1 });
      }
      assert.equal(resolveSlot('WALL', null, null, city), config.city.wallSlot, 'le Mur va toujours sur l\'enceinte');
    }
  }
});

// ---- Décisions 1 et 14 : niveaux maximum ----
// Transaction factice de construction : une ville du joueur, de quoi payer
function fakeBuildDb(city) {
  const created = [];
  const tx = {
    $queryRaw: async () => [{ id: city.id, isCapital: city.isCapital, wood: 1e9, stone: 1e9, iron: 1e9, food: 1e9, maxStorage: 2e9, maxFoodStorage: 2e9 }],
    $executeRaw: async () => 1,
    city: { findFirst: async () => city, findMany: async () => [{ isCapital: true, buildings: [] }] },
    playerTechnology: { findMany: async () => [] },
    buildQueueItem: { create: async ({ data }) => { created.push(data); return data; } }
  };
  return { created, restore: swapPrisma({ $transaction: async (fn) => fn(tx) }) };
}
async function build(city, buildingKey, slot = null) {
  const db = fakeBuildDb(city);
  try {
    const res = fakeRes();
    await handlerOf(citiesRouter, 'post', '/:id/build')({ params: { id: city.id }, body: { buildingKey, slot }, user: { playerId: 'p1' } }, res);
    return { res, created: db.created };
  } finally { db.restore(); }
}
const cityWith = (isCapital, buildings) => ({ id: isCapital ? 'cap' : 'col', name: isCapital ? 'Rome' : 'Ostie', isCapital, playerId: 'p1', buildings, buildQueue: [], recruitQueue: [], player: { faction: 'ROME' } });

test('construire : le Mur d\'une colonie s\'arrête au niveau 15, celui de la capitale continue', async () => {
  const wall = (level) => ({ key: 'WALL', slot: config.city.wallSlot, level });
  const mainHall = { key: 'MAIN_HALL', slot: 0, level: 20 };
  {
    assert.equal(def('WALL').effects.colonyMaxLevel, 15);
    const { res, created } = await build(cityWith(false, [mainHall, wall(15)]), 'WALL');
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, 'Le Mur d\'une colonie ne dépasse pas le niveau 15');
    assert.equal(created.length, 0);
  }
  {
    const { res, created } = await build(cityWith(false, [mainHall, wall(14)]), 'WALL');
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(created[0].targetLevel, 15);
  }
  {
    const { res, created } = await build(cityWith(true, [mainHall, wall(15)]), 'WALL');
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(created[0].targetLevel, 16);
  }
  {
    // la Ville Merveille suit la colonie
    const { res } = await build({ ...cityWith(false, [mainHall, wall(15)]), isWonder: true }, 'WALL');
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, `Le Mur d'une colonie ne dépasse pas le niveau ${def('WALL').effects.colonyMaxLevel}`);
  }
});

test('construire : le Bâtiment principal monte jusqu\'au 20 dans une colonie comme dans la capitale, jamais au-delà', async () => {
  assert.equal(def('MAIN_HALL').maxLevel, 20);
  for (const isCapital of [true, false]) {
    const ok = await build(cityWith(isCapital, [{ key: 'MAIN_HALL', slot: 0, level: 19 }]), 'MAIN_HALL');
    assert.equal(ok.res.statusCode, 200, JSON.stringify(ok.res.body));
    assert.equal(ok.created[0].targetLevel, 20);
    const over = await build(cityWith(isCapital, [{ key: 'MAIN_HALL', slot: 0, level: 20 }]), 'MAIN_HALL');
    assert.equal(over.res.statusCode, 400);
    assert.equal(over.res.body.error, 'Niveau max atteint (20)');
  }
});

test('construire : un emplacement au-delà de l\'anneau de la colonie est refusé', async () => {
  const { res, created } = await build(cityWith(false, [{ key: 'MAIN_HALL', slot: 0, level: 10 }]), 'WAREHOUSE', config.city.ringSlots.colony + 1);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /Emplacement invalide/);
  assert.equal(created.length, 0);
});

// ---- Décision 15 : or des unités d'élite ----
// Transaction factice de recrutement : villes verrouillées, or du joueur pris sous condition, lignes créées
function fakeRecruitDb({ city, gold, goldAfterCheck = gold, playerCities = [] }) {
  const created = [], playerUpdates = [], asked = [];
  let goldNow = gold, debited = false;
  const rows = [{ id: city.id, isCapital: city.isCapital, wood: 1e9, stone: 1e9, iron: 1e9, food: 1e9, maxStorage: 2e9, maxFoodStorage: 2e9 }];
  const tx = {
    $queryRaw: async () => rows.map(r => ({ ...r })),
    $executeRaw: async () => { debited = true; return 1; },
    city: { findFirst: async () => ({ ...city, player: { ...city.player, gold } }) },
    // bâtiments du type demandé dans les villes du joueur (Grandes casernes / Grandes écuries)
    cityBuilding: { findMany: async ({ where }) => { asked.push(where); return playerCities.flatMap(c => c.buildings.filter(b => b.key === where.key)); } },
    playerTechnology: { findMany: async () => [] },
    player: {
      // l'or a pu être dépensé ailleurs entre la lecture du joueur et la dépense (goldAfterCheck)
      updateMany: async ({ where, data }) => { goldNow = goldAfterCheck; if (goldNow < where.gold.gte) return { count: 0 }; goldNow -= data.gold.decrement; playerUpdates.push(data); return { count: 1 }; }
    },
    recruitQueueItem: { create: async ({ data }) => { created.push(data); return { id: 'q1', ...data }; } }
  };
  return { created, playerUpdates, asked, gold: () => goldNow, debited: () => debited, restore: swapPrisma({ $transaction: async (fn) => fn(tx) }) };
}
const romeCapital = () => cityWith(true, [{ key: 'MAIN_HALL', slot: 0, level: 20 }, { key: 'BARRACKS', slot: 1, level: 20 }, { key: 'STABLE', slot: 2, level: 20 }]);
async function recruit(db, unitKey, count, cityId = 'cap') {
  const res = fakeRes();
  await handlerOf(citiesRouter, 'post', '/:id/recruit')({ params: { id: cityId }, body: { unitKey, count }, user: { playerId: 'p1' } }, res);
  return res;
}

test('or : chaque unité d\'élite coûte de l\'or en plus de ses ressources, les autres paliers rien', async () => {
  const perElite = config.recruit.goldPerUnit.elite;
  assert.ok(perElite > 0);
  const elite = unitOf('ROME', 'INFANTRY', 'elite'), inter = unitOf('ROME', 'INFANTRY', 'intermediate');
  {
    const db = fakeRecruitDb({ city: romeCapital(), gold: 1000 });
    try {
      const res = await recruit(db, elite.key, 10);
      assert.equal(res.statusCode, 200, JSON.stringify(res.body));
      assert.equal(res.body.gold, 10 * perElite);
      assert.equal(db.gold(), 1000 - 10 * perElite);
      assert.equal(db.created.length, 1);
    } finally { db.restore(); }
  }
  {
    const db = fakeRecruitDb({ city: romeCapital(), gold: 0 });
    try {
      const res = await recruit(db, inter.key, 10);
      assert.equal(res.statusCode, 200, JSON.stringify(res.body));
      assert.equal(res.body.gold, 0);
      assert.equal(db.playerUpdates.length, 0, 'aucun or demandé');
    } finally { db.restore(); }
  }
});

test('or : pas assez d\'or, refus « Il faut N or » et rien n\'est payé ; or dépensé entre-temps, la transaction est annulée', async () => {
  const elite = unitOf('ROME', 'INFANTRY', 'elite');
  const need = 10 * config.recruit.goldPerUnit.elite;
  {
    const db = fakeRecruitDb({ city: romeCapital(), gold: need - 1 });
    try {
      const res = await recruit(db, elite.key, 10);
      assert.equal(res.statusCode, 400);
      assert.match(res.body.error, new RegExp(`^Il faut ${need} or`));
      assert.equal(db.debited(), false, 'aucune ressource prise');
      assert.equal(db.created.length, 0);
    } finally { db.restore(); }
  }
  {
    const db = fakeRecruitDb({ city: romeCapital(), gold: need, goldAfterCheck: need - 1 });
    try {
      const res = await recruit(db, elite.key, 10);
      assert.equal(res.statusCode, 400);
      assert.match(res.body.error, new RegExp(`^Il faut ${need} or`));
      assert.equal(db.created.length, 0, 'l\'erreur lancée annule toute la transaction (ressources comprises)');
    } finally { db.restore(); }
  }
});

test('or : annuler un recrutement d\'élite rend la moitié de l\'or avec la moitié des ressources', async () => {
  const elite = unitOf('ROME', 'INFANTRY', 'elite');
  const item = { id: 'q1', cityId: 'cap', unitKey: elite.key, count: 10, buildingKey: 'BARRACKS', status: 'RUNNING', startedAt: new Date(), endsAt: new Date(Date.now() + 3600000) };
  const playerUpdates = [];
  const tx = {
    $queryRaw: async () => [{ id: 'cap', isCapital: true, wood: 0, stone: 0, iron: 0, food: 0, maxStorage: 1e9, maxFoodStorage: 1e9 }],
    $executeRaw: async () => 1,
    recruitQueueItem: { findFirst: async () => item, deleteMany: async () => ({ count: 1 }), findMany: async () => [], update: async () => ({}) },
    player: { update: async ({ data }) => { playerUpdates.push(data); return {}; } }
  };
  const restore = swapPrisma({ $transaction: async (fn) => fn(tx) });
  try {
    const res = fakeRes();
    await handlerOf(citiesRouter, 'delete', '/:id/recruit/:itemId')({ params: { id: 'cap', itemId: 'q1' }, user: { playerId: 'p1' } }, res);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    const gold = Math.floor(10 * config.recruit.goldPerUnit.elite * 0.5);
    assert.equal(res.body.gold, gold);
    assert.deepEqual(playerUpdates, gold > 0 ? [{ gold: { increment: gold } }] : []);
  } finally { restore(); }
});

test('économie du joueur : emplacements par type de ville et or des unités d\'élite pour le client', async () => {
  const restore = swapPrisma({
    player: { findUnique: async () => ({ id: 'p1', cities: [], alliance: null, account: null }) },
    playerTechnology: { findMany: async () => [] }
  });
  try {
    const res = fakeRes();
    await handlerOf(playerRouter, 'get', '/me')({ user: { playerId: 'p1' } }, res);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.deepEqual(res.body.economy.city, { ringSlots: config.city.ringSlots, wallSlot: config.city.wallSlot });
    assert.deepEqual(res.body.economy.recruit.goldPerUnit, config.recruit.goldPerUnit);
    assert.equal(res.body.economy.city.maxSlot, undefined);
  } finally { restore(); }
});

// ---- Décision 10 : Grandes casernes et Grandes écuries accélèrent la formation dans la capitale ----
test('formation dans la capitale : les niveaux de toutes les Grandes casernes s\'additionnent pour l\'infanterie, les Grandes écuries pour la cavalerie', async () => {
  const { baseTrainSecondsFor } = require('../../src/utils/calculations');
  const playerCities = [
    { buildings: romeCapital().buildings },
    { buildings: [{ key: 'GREAT_BARRACKS', level: 10 }, { key: 'GREAT_STABLE', level: 4 }] },
    { buildings: [{ key: 'GREAT_BARRACKS', level: 20 }] }
  ];
  const perLevel = (key) => def(key).effects.capitalTrainTimeReductionPctPerLevel;
  for (const [cls, key, levels] of [['INFANTRY', 'GREAT_BARRACKS', 30], ['CAVALRY', 'GREAT_STABLE', 4]]) {
    const unit = unitOf('ROME', cls, 'base');
    const db = fakeRecruitDb({ city: romeCapital(), gold: 0, playerCities });
    try {
      const res = await recruit(db, unit.key, 1);
      assert.equal(res.statusCode, 200, JSON.stringify(res.body));
      const own = fx.trainTimeReductionPct(romeCapital().buildings, cls);
      const boosted = Math.min(60, own + levels * perLevel(key));
      assert.equal(res.body.timePerUnit, Math.max(1, Math.round(baseTrainSecondsFor(unit) * (1 - boosted / 100))), cls);
      assert.ok(boosted > own, `${cls} : plus rapide grâce aux grands bâtiments des colonies`);
      assert.deepEqual(db.asked, [{ key, city: { playerId: 'p1' } }], 'les villes du joueur seulement');
    } finally { db.restore(); }
  }
  // dans une colonie, rien de plus que SA Grande caserne ; pas d'accélération pour les engins
  const colony = { ...cityWith(false, [{ key: 'MAIN_HALL', slot: 0, level: 20 }, { key: 'GREAT_BARRACKS', slot: 1, level: 20 }]), id: 'col' };
  const db = fakeRecruitDb({ city: colony, gold: 0, playerCities });
  try {
    const unit = unitOf('ROME', 'INFANTRY', 'base');
    const res = await recruit(db, unit.key, 1, 'col');
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(res.body.timePerUnit, Math.max(1, Math.round(baseTrainSecondsFor(unit) * (1 - fx.trainTimeReductionPct(colony.buildings, 'INFANTRY') / 100))));
    assert.equal(db.asked.length, 0);
  } finally { db.restore(); }
});

// ---- Décision 7 : la carte se voit partout, les armées des autres seulement dans le rayon de vision ----
test('carte : armées des autres visibles seulement dans le rayon de la Tour de guet autour de chacune de mes villes', async () => {
  const { viewFor } = mapRouter;
  const watchtower = 4;
  const radius = fx.effectOf('WATCHTOWER', 'visionRangeL1') + fx.effectOf('WATCHTOWER', 'visionRangePerLevel') * watchtower;
  const now = Date.parse('2026-10-31T12:00:00Z');
  const marching = (id, x, y, targetX, targetY, extra = {}) => ({ id, ownerId: 'enemy', ownerAllianceId: 'B', status: 'ATTACKING', x, y, targetX, targetY, departedAt: new Date(now - 3600000), arrivalAt: new Date(now + 3600000), realSquads: 3, ...extra });
  const shared = {
    cities: [], bastions: [], cityOwner: { mycol: { id: 'me', alliance: 'A' } }, bastionAlliance: {},
    resourceNodes: [],
    armies: [
      marching('near-cap', 0, radius - 1, 0, radius - 1),                      // à l'arrêt dans le rayon de la capitale
      marching('far', 500, 500, 520, 500),                                     // loin de tout
      marching('half-way', 300 - 2 * radius, 0, 300, 0),                       // à mi-chemin : à radius cases de la colonie
      marching('starting', 300 - 4 * radius, 0, 300, 0, { departedAt: new Date(now), arrivalAt: new Date(now + 7200000) }),   // vient de partir, loin encore
      marching('camp', 300, 0, 300, 0, { status: 'BESIEGING', targetCityId: 'mycol' }),
      { ...marching('ally', 900, 900, 950, 900), ownerId: 'friend', ownerAllianceId: 'A' },
      { ...marching('mine', 900, 900, 950, 900), ownerId: 'me', ownerAllianceId: 'A' }
    ]
  };
  const restore = swapPrisma({
    allianceMember: { findUnique: async () => ({ allianceId: 'A' }) },
    city: { findMany: async () => [{ x: 0, y: 0, isCapital: true, buildings: [{ key: 'WATCHTOWER', level: watchtower }] }, { x: 300, y: 0, isCapital: false, buildings: [] }] }
  });
  try {
    const view = await viewFor('me', shared, now);
    const ids = view.armies.map(a => a.id).sort();
    assert.deepEqual(ids, ['ally', 'camp', 'half-way', 'mine', 'near-cap']);
    const camp = view.armies.find(a => a.id === 'camp');
    assert.ok(camp.arrivalAt, 'le camp devant ma ville : l\'heure du combat est donnée');
    assert.equal(view.armies.find(a => a.id === 'mine').squads, 3, 'ma colonne : sa vraie taille');
  } finally { restore(); }
  // sans Tour de guet : le rayon de base seulement
  const restore2 = swapPrisma({
    allianceMember: { findUnique: async () => null },
    city: { findMany: async () => [{ x: 0, y: 0, isCapital: true, buildings: [] }] }
  });
  try {
    const base = fx.effectOf('WATCHTOWER', 'visionRangeL1');
    const view = await viewFor('me', { ...shared, armies: [marching('in', 0, base, 0, base), marching('out', 0, base + 1, 0, base + 1)] }, now);
    assert.deepEqual(view.armies.map(a => a.id), ['in']);
  } finally { restore2(); }
});

test('carte : un camp hors de ma ville et de mon alliance, dans mon rayon, se voit sans l\'heure du combat', async () => {
  const { viewFor } = mapRouter;
  const now = Date.now();
  const shared = {
    cities: [], cityOwner: { other: { id: 'x', alliance: 'C' } }, bastionAlliance: {}, resourceNodes: [],
    armies: [{ id: 'camp', ownerId: 'enemy', ownerAllianceId: 'B', status: 'BESIEGING', targetCityId: 'other', x: 3, y: 0, targetX: 3, targetY: 0, departedAt: new Date(now), arrivalAt: new Date(now + 3600000), realSquads: 2 }]
  };
  const restore = swapPrisma({
    allianceMember: { findUnique: async () => ({ allianceId: 'A' }) },
    city: { findMany: async () => [{ x: 0, y: 0, isCapital: true, buildings: [] }] }
  });
  try {
    const view = await viewFor('me', shared, now);
    assert.equal(view.armies.length, 1);
    assert.equal(view.armies[0].arrivalAt, null);
  } finally { restore(); }
});

// ---- Décision 8 : plafond de membres selon l'Ambassade du chef ----
function fakeAllianceDb({ members, embassy, invites = [], players = [] }) {
  const alliance = { id: 'A1', name: 'Rome', tag: 'ROM', leaderId: 'chef' };
  const db = {
    alliance: { findUnique: async () => alliance },
    allianceMember: {
      findUnique: async ({ where }) => members.find(m => m.playerId === where.playerId) || null,
      count: async () => members.length,
      create: async ({ data }) => { members.push({ ...data }); return data; }
    },
    allianceInvite: {
      findUnique: async ({ where }) => invites.find(i => i.playerId === where.allianceId_playerId.playerId) || null,
      deleteMany: async () => ({ count: 0 }),
      upsert: async ({ create }) => { invites.push({ ...create }); return create; }
    },
    // Ambassade du chef (la seule lue pour le plafond) ; les autres joueurs ont l'Ambassade qu'il faut pour entrer
    cityBuilding: { findMany: async ({ where }) => [{ level: where.city.playerId === 'chef' ? embassy : 20 }] },
    player: { findUnique: async ({ where }) => players.find(p => p.name === where.name) || null }
  };
  return swapPrisma({ ...db, $transaction: async (fn) => fn({ ...db, $queryRaw: async () => [] }) });
}
const membersOf = (n) => Array.from({ length: n }, (_, i) => ({ allianceId: 'A1', playerId: i ? `m${i}` : 'chef', role: i ? 'MEMBER' : 'LEADER' }));

test('alliance : le plafond suit l\'Ambassade du chef, jamais au-dessus du plafond général', () => {
  assert.equal(fx.allianceMaxMembers(0), 0);
  assert.ok(fx.allianceMaxMembers(fx.allianceCreateLevel()) > 1, 'une alliance qui vient d\'être fondée peut grandir');
  assert.ok(fx.allianceMaxMembers(10) > fx.allianceMaxMembers(9));
  assert.equal(fx.allianceMaxMembers(20), Math.min(config.alliance.maxMembers, fx.allianceMaxMembers(20)));
  assert.ok(fx.allianceMaxMembers(99) <= config.alliance.maxMembers);
});

test('alliance : adhésion et invitation refusées quand l\'Ambassade du chef est pleine', async () => {
  const level = fx.allianceCreateLevel();
  const max = fx.allianceMaxMembers(level);
  {
    const members = membersOf(max);
    const restore = fakeAllianceDb({ members, embassy: level, invites: [{ allianceId: 'A1', playerId: 'p1' }] });
    try {
      const res = fakeRes();
      await handlerOf(allianceRouter, 'post', '/:id/join')({ params: { id: 'A1' }, user: { playerId: 'p1' }, body: {} }, res);
      assert.equal(res.statusCode, 400);
      assert.match(res.body.error, new RegExp(`Alliance complète \\(${max} membres au plus`));
      assert.match(res.body.error, /Ambassade du chef/);
      assert.equal(members.length, max);
    } finally { restore(); }
  }
  {
    const invites = [];
    const restore = fakeAllianceDb({ members: membersOf(max), embassy: level, invites, players: [{ id: 'p9', name: 'Titus', alliance: null }] });
    try {
      const res = fakeRes();
      await handlerOf(allianceRouter, 'post', '/invite')({ user: { playerId: 'chef' }, body: { playerName: 'Titus' } }, res);
      assert.equal(res.statusCode, 400);
      assert.match(res.body.error, /impossible d'inviter/);
      assert.equal(invites.length, 0);
    } finally { restore(); }
  }
  {
    // le chef agrandit son Ambassade : une place de plus
    const members = membersOf(max);
    const restore = fakeAllianceDb({ members, embassy: level + 1, invites: [{ allianceId: 'A1', playerId: 'p1' }] });
    try {
      const res = fakeRes();
      await handlerOf(allianceRouter, 'post', '/:id/join')({ params: { id: 'A1' }, user: { playerId: 'p1' }, body: {} }, res);
      assert.equal(res.statusCode, 200, JSON.stringify(res.body));
      assert.equal(members.length, max + 1);
    } finally { restore(); }
  }
});

test('alliance : les vues donnent le plafond de membres', async () => {
  const level = 9;
  const restore = swapPrisma({
    allianceMember: { findUnique: async () => ({ role: 'MEMBER', alliance: { id: 'A1', leaderId: 'chef', members: [] } }) },
    alliance: {
      findUnique: async () => ({ id: 'A1', leaderId: 'chef', members: [] }),
      findMany: async () => [{ id: 'A1', leaderId: 'chef', members: [] }, { id: 'A2', leaderId: 'autre', members: [] }, { id: 'A3', leaderId: null, members: [] }]
    },
    allianceDiplomacy: { findMany: async () => [] },
    cityBuilding: {
      findMany: async ({ where }) => (where.city.playerId.in
        ? [{ level, city: { playerId: 'chef' } }, { level: 3, city: { playerId: 'autre' } }, { level: 12, city: { playerId: 'autre' } }]
        : [{ level }])
    }
  });
  try {
    const mine = fakeRes();
    await handlerOf(allianceRouter, 'get', '/mine')({ user: { playerId: 'p1' } }, mine);
    assert.equal(mine.body.maxMembers, fx.allianceMaxMembers(level));
    const list = fakeRes();
    await handlerOf(allianceRouter, 'get', '/')({ user: { playerId: 'p1' } }, list);
    assert.deepEqual(list.body.map(a => a.maxMembers), [fx.allianceMaxMembers(level), fx.allianceMaxMembers(12), fx.allianceMaxMembers(0)]);
  } finally { restore(); }
});

// ---- Décision 5 : taille des rassemblements ----
test('rassemblements : la liste donne le nombre d\'armées au plus selon la Place de rassemblement de ma capitale', async () => {
  const saved = R.listForPlayer;
  const restore = swapPrisma({ city: { findMany: async () => [{ isCapital: true, buildings: [{ key: 'RALLY_POINT', level: 12 }] }, { isCapital: false, buildings: [] }] } });
  try {
    R.listForPlayer = async () => ({ rallies: [], inAlliance: true });
    const res = fakeRes();
    await handlerOf(rallyRouter, 'get', '/rallies')({ user: { playerId: 'p1' }, query: {} }, res);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(res.body.maxArmies, fx.rallyMaxArmies(12));
    assert.equal(fx.rallyMaxArmies(20), 25, '5 + niveau : 25 au niveau 20');
    assert.deepEqual(res.body.waits, R.WAITS);
  } finally { R.listForPlayer = saved; restore(); }
});
