// Routes et services (décisions du 30 octobre 2026 et retouches de l'audit) : plafond de 60 membres d'alliance compté
// sous le verrou de l'alliance, invitation refusée quand elle est pleine, prédicats d'alliance partagés, place libre d'une
// ville, erreurs métier, marche (Irrigation, Bastion) et charge complète d'une armée, convoi du marché.
// Aucune requête réelle : le client Prisma est remplacé le temps de chaque test.
require('./_env');
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://unit:unit@localhost:5432/unit';   // le client Prisma est créé, jamais interrogé
const test = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../../src/config/database');
const config = require('../../src/config');
const fx = require('../../src/utils/buildingEffects');
const { unitsData, factionsData } = require('../../src/config/gamedata');
const { getArmyCarryCapacity, getFactionBonus } = require('../../src/utils/calculations');
const { sameAllianceAs, outsideAlliance, allianceRowsOf } = require('../../src/services/diplomacyService');
const { httpError, sendFail } = require('../../src/utils/httpError');
const MS = require('../../src/services/marketService');
const bastionService = require('../../src/services/bastionService');
const allianceRouter = require('../../src/routes/alliance');
const armiesRouter = require('../../src/routes/armies');

// réponse Express factice
function fakeRes() {
  const r = { statusCode: 200, body: null };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
}
// dernier maillon d'une route (après le middleware d'authentification)
const handlerOf = (router, method, path) => router.stack.find(l => l.route && l.route.path === path && l.route.methods[method]).route.stack.at(-1).handle;
// remplace des tables du client Prisma, rendues par restore()
function swapPrisma(tables) {
  const saved = Object.fromEntries(Object.keys(tables).map(k => [k, prisma[k]]));
  Object.assign(prisma, tables);
  return () => Object.assign(prisma, saved);
}

// ---- alliance : 60 membres au plus (D3) ----
// Base factice : chaque lecture laisse passer les autres requêtes (setImmediate), et `SELECT … FOR UPDATE` sur la ligne
// Alliance est tenu jusqu'à la fin de la transaction, comme dans PostgreSQL
function fakeAllianceDb({ alliances, members, invites, players = [] }) {
  const tick = () => new Promise(r => setImmediate(r));
  const locks = new Map(), lockLog = [];
  const db = {
    alliance: { findUnique: async ({ where }) => { await tick(); return alliances.find(a => a.id === where.id) || null; } },
    allianceMember: {
      findUnique: async ({ where }) => { await tick(); return members.find(m => m.playerId === where.playerId) || null; },
      count: async ({ where }) => { await tick(); return members.filter(m => m.allianceId === where.allianceId).length; },
      create: async ({ data }) => { await tick(); members.push({ ...data }); return data; }
    },
    allianceInvite: {
      findUnique: async ({ where }) => invites.find(i => i.allianceId === where.allianceId_playerId.allianceId && i.playerId === where.allianceId_playerId.playerId) || null,
      deleteMany: async ({ where }) => { const n = invites.length; for (let i = n - 1; i >= 0; i--) if (invites[i].playerId === where.playerId) invites.splice(i, 1); return { count: n - invites.length }; },
      upsert: async ({ create }) => { invites.push({ ...create }); return create; }
    },
    cityBuilding: { findMany: async () => [{ level: 20 }] },   // Ambassade suffisante
    player: { findUnique: async ({ where }) => players.find(p => p.name === where.name) || null }
  };
  const $transaction = async (fn) => {
    const held = [];
    const $queryRaw = async (strings, ...values) => {
      const sql = strings.join('?');
      if (sql.includes('"Alliance"') && sql.includes('FOR UPDATE')) {
        const id = values[0], prev = locks.get(id) || Promise.resolve();
        let release;
        const mine = new Promise(r => { release = r; });
        locks.set(id, prev.then(() => mine));
        await prev;
        held.push(release);
        lockLog.push(id);
      }
      return [];
    };
    try { return await fn({ ...db, $queryRaw }); } finally { held.forEach(r => r()); }
  };
  return { lockLog, restore: swapPrisma({ ...db, $transaction }) };
}
const membersOf = (allianceId, n) => Array.from({ length: n }, (_, i) => ({ allianceId, playerId: `m${i}`, role: i ? 'MEMBER' : 'LEADER' }));

test('alliance : 60 membres au plus (décision du 30 octobre 2026)', () => {
  assert.equal(config.alliance.maxMembers, 60);
});

test('alliance : trois adhésions simultanées à 58 membres, deux entrent, la troisième est refusée sous le verrou', async () => {
  const members = membersOf('A1', config.alliance.maxMembers - 2);
  const invites = ['p1', 'p2', 'p3'].map(playerId => ({ allianceId: 'A1', playerId }));
  const db = fakeAllianceDb({ alliances: [{ id: 'A1', name: 'Rome', tag: 'ROM' }], members, invites });
  try {
    const join = handlerOf(allianceRouter, 'post', '/:id/join');
    const out = await Promise.all(['p1', 'p2', 'p3'].map(async (playerId) => {
      const res = fakeRes();
      await join({ params: { id: 'A1' }, user: { playerId }, body: {} }, res);
      return res;
    }));
    assert.deepEqual(out.map(r => r.statusCode).sort(), [200, 200, 400]);
    const refused = out.find(r => r.statusCode === 400);
    assert.match(refused.body.error, /Alliance complète \(60 membres au plus\)/);
    assert.equal(members.filter(m => m.allianceId === 'A1').length, config.alliance.maxMembers);
    assert.equal(db.lockLog.length, 3, 'chaque adhésion prend le verrou de la ligne Alliance');
  } finally { db.restore(); }
});

test('alliance : invitation refusée quand l\'alliance est pleine, acceptée à 59 membres', async () => {
  const invite = handlerOf(allianceRouter, 'post', '/invite');
  const players = [{ id: 'p9', name: 'Titus', alliance: null }];
  {
    const members = membersOf('A1', config.alliance.maxMembers), invites = [];
    const db = fakeAllianceDb({ alliances: [{ id: 'A1' }], members, invites, players });
    try {
      const res = fakeRes();
      await invite({ user: { playerId: 'm0' }, body: { playerName: 'Titus' } }, res);
      assert.equal(res.statusCode, 400);
      assert.match(res.body.error, /Alliance complète \(60 membres au plus\) : impossible d'inviter/);
      assert.equal(invites.length, 0);
    } finally { db.restore(); }
  }
  {
    const members = membersOf('A1', config.alliance.maxMembers - 1), invites = [];
    const db = fakeAllianceDb({ alliances: [{ id: 'A1' }], members, invites, players });
    try {
      const res = fakeRes();
      await invite({ user: { playerId: 'm0' }, body: { playerName: 'Titus' } }, res);
      assert.equal(res.statusCode, 200);
      assert.deepEqual(invites, [{ allianceId: 'A1', playerId: 'p9' }]);
    } finally { db.restore(); }
  }
});

// ---- prédicats d'alliance partagés (routes/armies.js campsOutsideAlliance, routes/cities.js, bastionService) ----
test('diplomatie : même alliance et joueurs hors de l\'alliance, sans alliance jamais « même alliance »', async () => {
  const rows = [{ playerId: 'me', allianceId: 'A' }, { playerId: 'ami', allianceId: 'A' }, { playerId: 'autre', allianceId: 'B' }];
  const same = sameAllianceAs(rows, 'me');
  assert.equal(same('ami'), true);
  assert.equal(same('autre'), false);
  assert.equal(same('seul'), false);
  assert.deepEqual(outsideAlliance(rows, 'me', ['me', 'ami', 'autre', 'seul']), ['autre', 'seul']);
  // sans alliance : tout le monde est dehors, sauf soi
  assert.deepEqual(outsideAlliance([{ playerId: 'ami', allianceId: 'A' }], 'me', ['me', 'ami']), ['ami']);
  assert.equal(sameAllianceAs([], 'me')('me'), false);
  // une seule requête, sans doublon ni vide
  let where = null;
  await allianceRowsOf(['me', 'ami', 'me', null, undefined], { allianceMember: { findMany: async (q) => { where = q.where; return []; } } });
  assert.deepEqual(where.playerId.in, ['me', 'ami']);
});

// ---- marché : place libre de la ville acheteuse ----
test('marché : place libre d\'une ville par ressource (silo pour la nourriture)', () => {
  const city = { wood: 900.6, food: 4000, maxStorage: 1000, maxFoodStorage: 3000 };
  assert.equal(MS.roomFor(city, 'wood'), 99);
  assert.equal(MS.roomFor(city, 'food'), 0);
  assert.equal(MS.roomFor(city, 'stone'), 1000);
  assert.equal(MS.roomFor(null, 'wood'), 0);
  // Ville Merveille : tout va au stock du chantier, jamais d'avertissement
  assert.equal(MS.roomFor({ ...city, isWonder: true }, 'food'), Infinity);
});

// ---- erreurs métier partagées (utils/httpError) ----
test('erreurs : message métier rendu avec son statut, NO_ROUTE en 400 si demandé, sinon 500', () => {
  const e = httpError(403, 'Interdit');
  assert.equal(e.status, 403);
  assert.equal(e.expose, true);
  let res = fakeRes();
  sendFail(res, e);
  assert.deepEqual([res.statusCode, res.body], [403, { error: 'Interdit' }]);
  const noRoute = Object.assign(new Error('Aucun chemin'), { code: 'NO_ROUTE' });
  res = fakeRes();
  sendFail(res, noRoute, { noRoute: true });
  assert.deepEqual([res.statusCode, res.body], [400, { error: 'Aucun chemin' }]);
  const savedError = console.error;
  console.error = () => {};   // la 500 est journalisée
  try {
    res = fakeRes();
    sendFail(res, noRoute);
    assert.equal(res.statusCode, 500);
  } finally { console.error = savedError; }
});

// ---- marche et charge d'une armée (routes/armies.js) ----
const IRRIGATION_20 = [{ key: 'EGYPTIAN_IRRIGATION', level: 20 }];
async function withBastion(allianceIds, fn) {
  const restore = swapPrisma({ bastion: { findMany: async () => allianceIds.map(allianceId => ({ allianceId })) } });
  try {
    await bastionService.activeAllianceIds();   // remplit le cache lu par speedPctSync / carryMultSync
    await fn();
  } finally { restore(); }
}

test('marche : Cartographie, Bastion actif et Irrigation de la ville de l\'armée s\'additionnent', async () => {
  await withBastion(['AL1'], async () => {
    const irrigation = fx.marchSpeedBonusPct(IRRIGATION_20);
    assert.ok(irrigation > 0);
    const owner = (allianceId) => ({ technologies: [], alliance: allianceId ? { allianceId } : null });
    assert.equal(armiesRouter.speedTechPct({ owner: owner(null), city: { buildings: [] } }), 0);
    assert.equal(armiesRouter.speedTechPct({ owner: owner(null), city: { buildings: IRRIGATION_20 } }), irrigation);
    assert.equal(armiesRouter.speedTechPct({ owner: owner('AL1'), city: { buildings: IRRIGATION_20 } }), irrigation + config.bastion.bonuses.armySpeedPct);
    assert.equal(armiesRouter.speedTechPct({ owner: owner('AL1'), city: null }), config.bastion.bonuses.armySpeedPct);
  });
});

test('récolte et transport : charge complète (héros, civilisation, Marché, Bastion)', async () => {
  await withBastion(['AL1'], async () => {
    const unit = unitsData.find(u => u.key === 'EGY_INF_ESCLAVE');
    const army = { units: [{ unitKey: unit.key, tier: unit.tier, count: 100 }], hero: null, owner: { faction: 'EGYPT', alliance: { allianceId: 'AL1' } } };
    const market = [{ key: 'MARKET', level: 10 }];
    const raw = getArmyCarryCapacity(army.units, unitsData, null);
    const expected = Math.floor(raw * (1 + getFactionBonus('EGYPT', 'transportCapacity', factionsData) / 100) * (1 + fx.transportBonusPct(market) / 100) * (1 + config.bastion.bonuses.carryPct / 100));
    assert.equal(armiesRouter.transportCapacity(army, market), expected);
    assert.ok(expected > raw * 1.5, 'Égypte +20 %, Marché 10 +50 %, Bastion +10 %');
    // sans alliance ni bâtiment : la civilisation seule
    assert.equal(armiesRouter.transportCapacity({ ...army, owner: { faction: 'EGYPT', alliance: null } }, []), Math.floor(raw * 1.2));
  });
});

// ---- convoi d'un échange du marché : l'Irrigation de la ville de départ compte, bâtiments chargés ou relus ----
test('marché : le convoi d\'un échange marche plus vite depuis une ville irriguée', async () => {
  const Terrain = require('../../frontend/js/shared/terrain.js');
  Terrain.setWorldSeed(0);
  const restore = swapPrisma({
    city: { findMany: async () => [] }, resourceNode: { findMany: async () => [] },   // aucune case d'objet sur la carte
    allianceMember: { findUnique: async () => null }                                   // pas de Bastion
  });
  try {
    const unit = unitsData.find(u => u.key === 'EGY_INF_ESCLAVE');
    const army = { ownerId: 'p1', units: [{ unitKey: unit.key, tier: unit.tier, count: 10 }], hero: null };
    const to = { x: 12, y: 0 };
    const plain = await MS.travelSecondsBetween(army, { id: 'c1', x: 0, y: 0, buildings: [] }, to, 'EGYPT', []);
    const irrigated = await MS.travelSecondsBetween(army, { id: 'c1', x: 0, y: 0, buildings: IRRIGATION_20 }, to, 'EGYPT', []);
    let asked = null;   // ville sans bâtiments chargés : l'Irrigation est relue dans la transaction
    const reread = await MS.travelSecondsBetween(army, { id: 'c1', x: 0, y: 0 }, to, 'EGYPT', [], { cityBuilding: { findMany: async (q) => { asked = q.where; return IRRIGATION_20; } } });
    assert.ok(irrigated < plain, `${irrigated} < ${plain}`);
    assert.equal(reread, irrigated);
    assert.equal(asked.cityId, 'c1');
  } finally { restore(); }
});
