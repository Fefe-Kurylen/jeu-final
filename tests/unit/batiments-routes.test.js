// Routes de la revue des bâtiments (décisions du 31 octobre 2026) : emplacements de l'anneau selon le type de ville,
// Bâtiment principal 20 partout, Mur des colonies au niveau 15, or des unités d'élite payé avec les ressources et rendu à
// l'annulation, formation dans la capitale accélérée par les Grandes casernes / écuries, vision des armées dans le rayon de
// la Tour de guet, plafond de membres selon l'Ambassade du chef, taille des rassemblements, Marché de la capitale et
// marchands. Aucune requête réelle : le client Prisma (et, pour le marché, le service des marchands) est remplacé le temps
// de chaque test.
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

test('économie du joueur : emplacements par type de ville et marchands pour le client', async () => {
  const capital = [{ key: 'MARKET', level: 10 }, { key: 'TRADE_OFFICE', level: 5 }, { key: 'SULTAN_DESERT_OUTPOST', level: 4 }];
  const restore = swapPrisma({
    player: { findUnique: async () => ({ id: 'p1', faction: 'SULTAN', cities: [], alliance: null, account: null }) },
    playerTechnology: { findMany: async () => [] },
    city: { findMany: async ({ where }) => (where.playerId === 'p1' ? [{ isCapital: true, buildings: capital }, { isCapital: false, buildings: [] }] : []) }
  });
  try {
    const res = fakeRes();
    await handlerOf(playerRouter, 'get', '/me')({ user: { playerId: 'p1' } }, res);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    const { economy } = res.body;
    assert.deepEqual(economy.city, { ringSlots: config.city.ringSlots, wallSlot: config.city.wallSlot });
    assert.deepEqual(economy.alliance, { maxMembers: config.alliance.maxMembers }, 'plafond général de la taille d\'une alliance (client : allianceMaxMembersAt)');
    const M = config.market.merchants;
    const bonus = 5 * def('TRADE_OFFICE').effects.armyTransportCapacityBonusPctPerLevel + 4 * def('SULTAN_DESERT_OUTPOST').effects.armyTransportCapacityBonusPctPerLevel;
    assert.deepEqual(economy.market.merchants, {
      capacityByFaction: M.capacity, speedByFaction: M.speed,
      total: 10 * def('MARKET').effects.merchantsPerLevel,
      capacity: Math.floor(M.capacity.SULTAN * (1 + bonus / 100)), speed: M.speed.SULTAN
    });
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

// Filtre Prisma lu comme PostgreSQL le ferait (AND, OR, in, gte, lte ; une comparaison avec NULL n'est jamais vraie)
function matchesWhere(row, where) {
  return Object.entries(where).every(([key, cond]) => {
    if (key === 'AND') return cond.every(w => matchesWhere(row, w));
    if (key === 'OR') return cond.some(w => matchesWhere(row, w));
    const v = row[key];
    if (cond === null || typeof cond !== 'object') return v === cond;
    if (v === null || v === undefined) return false;
    return (cond.in === undefined || cond.in.includes(v)) && (cond.gte === undefined || v >= cond.gte) && (cond.lte === undefined || v <= cond.lte);
  });
}

test('carte : une armée qui traverse la zone affichée sans y partir ni y arriver se voit dans le rayon de vision', async () => {
  const watchtower = 2;
  const radius = fx.visionRadius(watchtower);
  const now = Date.now();
  const army = (id, ownerId, x, y, targetX, targetY, extra = {}) => ({
    id, name: id, ownerId, status: 'ATTACKING', missionType: 'ATTACK', x, y, targetX, targetY, targetCityId: null, targetBastionId: null,
    departedAt: new Date(now - 3600000), arrivalAt: new Date(now + 3600000), heroId: null, owner: { name: ownerId, faction: 'ROME' }, units: [], ...extra
  });
  // ma capitale en (40, -40) ; zone affichée autour d'elle (rayon 30, élargi de 5 par le cache : 5 à 75 et -75 à -5)
  const armies = [
    army('crossing', 'enemy', -100, -40, 180, -40),                  // à mi-chemin : juste devant ma capitale
    army('edge', 'enemy', -100, -40 - (radius + 10), 180, -40 - (radius + 10)),   // traverse la zone hors de mon rayon
    army('mine', 'me', -100, -50, 180, -50),                         // la mienne traverse aussi
    army('away', 'enemy', 150, 150, 170, 150),                       // loin de la zone
    army('beside', 'enemy', 100, -40, 100, -40, { status: 'HARVESTING', missionType: 'HARVEST', arrivalAt: null }),   // arrêtée hors de la zone
    army('no-target', 'enemy', 41, -40, null, null, { status: 'MOVING', arrivalAt: null })                          // sans cible : sa case seule
  ];
  const loaded = [];
  const restore = swapPrisma({
    city: { findMany: async ({ where }) => (where.playerId === 'me' ? [{ x: 40, y: -40, isCapital: true, buildings: [{ key: 'WATCHTOWER', level: watchtower }] }] : []) },
    resourceNode: { findMany: async () => [] },
    army: { findMany: async ({ where }) => { const rows = armies.filter(a => matchesWhere(a, where)); loaded.push(...rows.map(a => a.id)); return rows; } },
    bastion: { findMany: async () => [] },
    player: { findMany: async () => [] },
    allianceMember: { findMany: async () => [], findUnique: async () => null }
  });
  try {
    const res = fakeRes();
    await handlerOf(mapRouter, 'get', '/map/viewport')({ user: { playerId: 'me' }, query: { x: '40', y: '-40', radius: '30' } }, res);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.deepEqual(loaded.sort(), ['crossing', 'edge', 'mine', 'no-target'], 'les trajets qui touchent la zone, rien d\'autre');
    assert.deepEqual(res.body.armies.map(a => a.id).sort(), ['crossing', 'mine', 'no-target'], 'les autres seulement dans mon rayon');
  } finally { restore(); }
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
    const card = fakeRes();
    await handlerOf(allianceRouter, 'get', '/:id')({ user: { playerId: 'p1' }, params: { id: 'A1' } }, card);
    assert.equal(card.body.maxMembers, fx.allianceMaxMembers(level), 'fiche publique de l\'alliance');
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

// ---- Décisions 3 et 4 : Marché de la capitale, marchands pour toutes les livraisons du marché ----
const marketRouter = require('../../src/routes/market');
const MS = require('../../src/services/marketService');
const questService = require('../../src/services/questService');
const pushService = require('../../src/services/pushService');
// Remplace des fonctions d'un module le temps d'un test
function swapFns(mod, fns) {
  const saved = Object.fromEntries(Object.keys(fns).map(k => [k, mod[k]]));
  Object.assign(mod, fns);
  return () => Object.assign(mod, saved);
}
// Base factice du marché : villes du joueur (capitale et colonie), Marché de la capitale au niveau `market`
function fakeMarketDb({ market = 5, cities = null, offer = null } = {}) {
  const own = cities || [
    { id: 'cap', name: 'Rome', playerId: 'p1', isCapital: true, x: 0, y: 0, wood: 5000, stone: 5000, iron: 5000, food: 5000, maxStorage: 9000, maxFoodStorage: 9000, player: { faction: 'GAUL', name: 'Aulus' } },
    { id: 'col', name: 'Ostie', playerId: 'p1', isCapital: false, x: 30, y: 0, wood: 5000, stone: 5000, iron: 5000, food: 5000, maxStorage: 9000, maxFoodStorage: 9000, player: { faction: 'GAUL', name: 'Aulus' } }
  ];
  const others = [{ id: 'far', name: 'Massalia', playerId: 'p2', isCapital: true, x: 60, y: 0, wood: 0, stone: 0, iron: 0, food: 0, maxStorage: 9000, maxFoodStorage: 9000, player: { faction: 'GREEK', name: 'Kleon' } }];
  const all = [...own, ...others];
  const capitalOf = (playerId) => [{ isCapital: true, buildings: playerId === 'p1' ? (market ? [{ key: 'MARKET', level: market }] : []) : [{ key: 'MARKET', level: 3 }] }];
  const db = {
    $queryRaw: async () => [],
    $executeRaw: async () => 1,
    army: { count: async () => 0 },
    allianceMember: { findUnique: async () => null },
    city: {
      findFirst: async ({ where }) => (where.id ? all.find(c => c.id === where.id && (!where.playerId || c.playerId === where.playerId)) : all.find(c => c.x >= where.x.gte && c.x <= where.x.lte && c.y >= where.y.gte && c.y <= where.y.lte)) || null,
      findUnique: async ({ where }) => all.find(c => c.id === where.id) || null,
      findMany: async ({ where }) => capitalOf(where.playerId)
    },
    marketOffer: { count: async () => 0, findUnique: async () => offer }
  };
  return swapPrisma({ ...db, $transaction: async (fn) => fn(db) });
}
const sendHandler = handlerOf(marketRouter.tradeRouter, 'post', '/trade/send');
const quiet = () => swapFns(questService, { bumpLater: () => {} });

test('marché : envoi depuis une colonie avec les marchands du Marché de la capitale ; réponse { merchantsUsed, arrivalAt, returnAt }', async () => {
  const arrivalAt = new Date(Date.now() + 600000), returnAt = new Date(Date.now() + 1200000);
  const calls = [];
  const restore = [fakeMarketDb(), quiet(), swapFns(MS, { sendResources: async (tx, args) => { calls.push(args); return { merchantsUsed: 3, arrivalAt, returnAt }; } })];
  try {
    const res = fakeRes();
    await sendHandler({ user: { playerId: 'p1' }, body: { fromCityId: 'col', targetX: 60, targetY: 0, resources: { wood: 1000, iron: 500 } } }, res);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(res.body.merchantsUsed, 3);
    assert.equal(res.body.arrivalAt, arrivalAt);
    assert.equal(res.body.returnAt, returnAt);
    assert.match(res.body.message, /3 marchands en route vers Massalia/);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].fromCity.id, 'col', 'les marchandises partent de la ville choisie');
    assert.equal(calls[0].toCity.id, 'far');
    assert.equal(calls[0].faction, 'GAUL');
    assert.deepEqual(calls[0].resources, { wood: 1000, stone: 0, iron: 500, food: 0 });
  } finally { restore.forEach(r => r()); }
});

test('marché : sans Marché dans la capitale, refus ; pas assez de marchands libres, le refus du service est rendu tel quel', async () => {
  {
    let called = false;
    const restore = [fakeMarketDb({ market: 0 }), quiet(), swapFns(MS, { sendResources: async () => { called = true; return {}; } })];
    try {
      const res = fakeRes();
      await sendHandler({ user: { playerId: 'p1' }, body: { fromCityId: 'cap', targetX: 60, targetY: 0, resources: { wood: 100 } } }, res);
      assert.equal(res.statusCode, 400);
      assert.equal(res.body.error, 'Construisez un Marché dans la capitale (niveau 1 minimum) pour commercer');
      assert.equal(called, false);
    } finally { restore.forEach(r => r()); }
  }
  {
    const refusal = { error: 'Pas assez de marchands libres (1 libres, 3 nécessaires)', status: 400 };
    const restore = [fakeMarketDb(), quiet(), swapFns(MS, { sendResources: async () => refusal })];
    try {
      const res = fakeRes();
      await sendHandler({ user: { playerId: 'p1' }, body: { fromCityId: 'cap', targetX: 60, targetY: 0, resources: { wood: 2000 } } }, res);
      assert.equal(res.statusCode, 400);
      assert.equal(res.body.error, refusal.error);
    } finally { restore.forEach(r => r()); }
  }
});

test('marché : une offre réserve les marchands du vendeur ; l\'acheteur reçoit ses marchands, l\'arrivée et le retour', async () => {
  {
    const restore = [fakeMarketDb(), swapFns(MS, {
      createOffer: async (tx, args) => ({ offer: { id: 'o1', ...args, merchants: 2 }, merchantsUsed: 2, arrivalAt: null, returnAt: null }),
      p2pTaxPct: async () => 7
    })];
    try {
      const res = fakeRes();
      await handlerOf(marketRouter, 'post', '/offer')({ user: { playerId: 'p1' }, body: { sellResource: 'wood', sellAmount: 1200, buyResource: 'iron', buyAmount: 1000, cityId: 'cap' } }, res);
      assert.equal(res.statusCode, 200, JSON.stringify(res.body));
      assert.equal(res.body.merchantsUsed, 2);
      assert.equal(res.body.arrivalAt, null);
      assert.equal(res.body.returnAt, null);
      assert.equal(res.body.taxPct, 7);
      assert.match(res.body.message, /2 marchands attendent en ville/);
    } finally { restore.forEach(r => r()); }
  }
  {
    const offer = { id: 'o1', sellerId: 'p2', cityId: 'far', sellResource: 'wood', sellAmount: 1000, buyResource: 'iron', buyAmount: 800, status: 'ACTIVE', merchants: 2 };
    const now = Date.now();
    const seller = { merchantsUsed: 2, arrivalAt: new Date(now + 900000), returnAt: new Date(now + 1800000) };
    const buyer = { merchantsUsed: 1, arrivalAt: new Date(now + 700000), returnAt: new Date(now + 1400000) };
    const pushes = [];
    const restore = [fakeMarketDb({ offer }), swapFns(pushService, { notify: (...a) => pushes.push(a) }), swapFns(MS, {
      acceptOffer: async () => ({ toBuyer: 900, toSeller: 720, sellerTax: 10, buyerTax: 10, seller, buyer })
    })];
    try {
      const res = fakeRes();
      await handlerOf(marketRouter, 'post', '/offer/:id/accept')({ user: { playerId: 'p1' }, params: { id: 'o1' }, body: { cityId: 'col' } }, res);
      assert.equal(res.statusCode, 200, JSON.stringify(res.body));
      assert.equal(res.body.merchantsUsed, 1, 'les marchands de l\'acheteur');
      assert.equal(res.body.arrivalAt, seller.arrivalAt, 'ses marchandises arrivent avec les marchands du vendeur');
      assert.equal(res.body.returnAt, buyer.returnAt, 'ses marchands rentrent');
      assert.equal(res.body.offer, undefined);
      assert.equal(pushes.length, 1);
      assert.equal(pushes[0][0], 'p2');
    } finally { restore.forEach(r => r()); }
  }
});

test('marché : retirer une offre rend les marchandises et libère ses marchands', async () => {
  const offer = { id: 'o1', sellerId: 'p1', cityId: 'cap', sellResource: 'wood', sellAmount: 1000, buyResource: 'iron', buyAmount: 800, status: 'ACTIVE', merchants: 2 };
  const closed = [];
  const restore = [fakeMarketDb({ offer }), swapFns(MS, { closeOffer: async (tx, o, status) => { closed.push([o.id, status]); return true; } })];
  try {
    const res = fakeRes();
    await handlerOf(marketRouter, 'delete', '/offer/:id')({ user: { playerId: 'p1' }, params: { id: 'o1' } }, res);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.deepEqual(closed, [['o1', 'CANCELLED']]);
    assert.equal(res.body.merchantsFreed, 2);
  } finally { restore.forEach(r => r()); }
});

test('marché : l\'état du marché donne la taxe et les marchands du joueur { total, free, capacity, speed }', async () => {
  const restore = [fakeMarketDb(), swapFns(MS, { p2pTaxPct: async () => 6.5, merchantState: async (db, playerId) => ({ total: 5, busy: 2, free: 3, capacity: 750, speed: 100, playerId }) })];
  try {
    for (const path of ['/state', '/tax']) {
      const res = fakeRes();
      const route = marketRouter.stack.find(l => l.route && [].concat(l.route.path).includes(path) && l.route.methods.get).route.stack.at(-1).handle;
      await route({ user: { playerId: 'p1' }, query: { cityId: 'col' } }, res);
      assert.equal(res.statusCode, 200, JSON.stringify(res.body));
      assert.deepEqual(res.body, { taxPct: 6.5, basePct: config.market.p2pTaxPctBase, offerHours: config.market.offerHours, merchants: { total: 5, free: 3, capacity: 750, speed: 100 } });
    }
  } finally { restore.forEach(r => r()); }
});

test('marchand du serveur : dans une colonie aussi, sans marchand, avec la taxe du Marché de la capitale', async () => {
  const db = {
    $queryRaw: async () => [], $executeRaw: async () => 1,
    city: {
      findFirst: async () => ({ id: 'col', playerId: 'p1' }),
      findUnique: async () => ({ id: 'col', wood: 5000, stone: 0, iron: 0, food: 0, maxStorage: 9000, maxFoodStorage: 9000 }),
      findMany: async () => [{ isCapital: true, buildings: [{ key: 'MARKET', level: 11 }] }, { isCapital: false, buildings: [] }]
    }
  };
  const restore = swapPrisma({ ...db, $transaction: async (fn) => fn(db) });
  try {
    const res = fakeRes();
    await handlerOf(marketRouter, 'post', '/npc-trade')({ user: { playerId: 'p1' }, body: { cityId: 'col', giveResource: 'wood', receiveResource: 'iron', giveAmount: 1000 } }, res);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(res.body.taxPct, fx.npcMarketTaxPct(11));
    assert.equal(res.body.received, Math.floor(1000 * (1 - fx.npcMarketTaxPct(11) / 100)));
  } finally { restore(); }
});

// ---- 2 colonies par joueur : le palier suivant de la Résidence vient de ses données ----
test('colons : le refus donne le niveau de Résidence qui débloque le colon suivant, puis la limite des colonies', async () => {
  const settle = handlerOf(citiesRouter, 'post', '/:id/settlers');
  const run = async ({ residence, colonies, settlers = 0 }) => {
    const tx = {
      $queryRaw: async () => [], $executeRaw: async () => 1,
      city: {
        findFirst: async () => ({ id: 'cap', isCapital: true, playerId: 'p1', settlers, buildings: [{ key: 'RESIDENCE', level: residence }], recruitQueue: [] }),
        count: async ({ where }) => (where.isWonder ? 0 : colonies)
      },
      army: { aggregate: async () => ({ _sum: { settlers: 0 } }) }
    };
    const restore = swapPrisma({ $transaction: async (fn) => fn(tx) });
    try { const res = fakeRes(); await settle({ params: { id: 'cap' }, user: { playerId: 'p1' } }, res); return res; } finally { restore(); }
  };
  const first = [10, 15, 20].find(l => fx.settlerSlots(l) >= 1), second = [10, 15, 20].find(l => fx.settlerSlots(l) >= 2);
  assert.ok(second > first);
  const one = await run({ residence: first, colonies: 0, settlers: 1 });   // un colon attend déjà
  assert.equal(one.statusCode, 400);
  assert.equal(one.body.error, `Tous vos colons sont engagés (1) : Résidence niveau ${second} pour le suivant`);
  const full = await run({ residence: 20, colonies: config.city.maxSecondaryCities, settlers: 1 });
  assert.equal(full.statusCode, 400);
  assert.equal(full.body.error, `Limite atteinte : ${config.city.maxSecondaryCities} villes secondaires au plus`);
});
