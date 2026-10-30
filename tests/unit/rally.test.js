// Rassemblement d'alliance (décision du 29 octobre 2026) : capacité selon la Place de rassemblement du lanceur
require('./_env');
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://unit:unit@localhost:5432/unit';   // le client Prisma est créé, jamais interrogé
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../../src/services/rallyService');

test('capacité : 3 armées au niveau 1 de la Place de rassemblement, 15 au niveau 20', () => {
  assert.equal(R.capacityFor(0), 3);
  assert.equal(R.capacityFor(1), 3);
  assert.equal(R.capacityFor(10), 8);
  assert.equal(R.capacityFor(20), 15);
  assert.equal(R.capacityFor(25), 15);
  for (let l = 1; l < 20; l++) assert.ok(R.capacityFor(l + 1) >= R.capacityFor(l));
});
test('attentes possibles : 5, 10, 30 ou 60 minutes', () => {
  assert.deepEqual(R.WAITS, [5, 10, 30, 60]);
});

// ---- base factice : le client Prisma est remplacé le temps d'un test (aucune requête réelle) ----
const prisma = require('../../src/config/database');
const bastionService = require('../../src/services/bastionService');
const armyProcessor = require('../../src/game/processors/armyProcessor');
require('../../frontend/js/shared/terrain.js').setWorldSeed(0);   // la carte de référence : terrain dégagé autour de (0, -10)

function matches(row, where = {}) {
  return Object.entries(where).every(([k, v]) => {
    if (v !== null && typeof v === 'object' && !(v instanceof Date)) {
      if ('in' in v) return v.in.includes(row[k]);
      if ('not' in v) return (row[k] ?? null) !== v.not;
      if ('lte' in v) return row[k] != null && new Date(row[k]) <= v.lte;
      throw new Error(`filtre non géré : ${k}`);
    }
    return (row[k] ?? null) === v;
  });
}
function table(rows) {
  const copy = (r) => (r ? { ...r } : null);
  return {
    findUnique: async ({ where }) => copy(rows.find(x => x.id === where.id)),
    findFirst: async ({ where }) => copy(rows.find(x => matches(x, where))),
    findMany: async ({ where } = {}) => rows.filter(x => matches(x, where)).map(copy),
    count: async ({ where } = {}) => rows.filter(x => matches(x, where)).length,
    update: async ({ where, data }) => Object.assign(rows.find(x => x.id === where.id), data),
    updateMany: async ({ where, data }) => { const hit = rows.filter(x => matches(x, where)); for (const x of hit) Object.assign(x, data); return { count: hit.length }; }
  };
}
function fakeDb({ cities = [], armies = [], rallies = [], nodes = [], members = [], bastions = [] }) {
  const names = ['army', 'rally', 'city', 'resourceNode', 'allianceMember', 'bastion', 'notification', '$transaction'];
  const saved = Object.fromEntries(names.map(n => [n, prisma[n]]));
  const notes = [], sentHome = [], hooks = { onRoute: null };
  const db = { army: table(armies), rally: table(rallies), city: table(cities), resourceNode: table(nodes), allianceMember: table(members), bastion: table(bastions) };
  db.notification = { create: async ({ data }) => { notes.push(data); return { id: String(notes.length) }; } };
  const $queryRaw = async (strings, ...values) => {
    if (strings.join('?').includes('"Rally"')) { const r = rallies.find(x => x.id === values[0]); return r ? [{ status: r.status }] : []; }
    return [];
  };
  let chain = Promise.resolve();   // une transaction à la fois : les verrous de ligne (FOR UPDATE) les sérialisent
  const $transaction = (fn) => { const run = chain.then(() => fn({ ...db, $queryRaw })); chain = run.catch(() => {}); return run; };
  Object.assign(prisma, db, { $transaction });
  const savedFns = { home: armyProcessor.sendArmyHome, speed: bastionService.speedPct, rel: bastionService.relationTo };
  armyProcessor.sendArmyHome = async (army, fromX, fromY, extra = {}) => {
    sentHome.push({ id: army.id, fromX, fromY });
    Object.assign(armies.find(a => a.id === army.id), { status: 'RETURNING', missionType: 'RETURN', ...extra });
  };
  // appelé pendant le calcul de chaque route : de quoi glisser un rappel ou un départ concurrent
  bastionService.speedPct = async () => { const f = hooks.onRoute; hooks.onRoute = null; if (f) await f(); return 0; };
  bastionService.relationTo = async () => 'ENEMY';
  return {
    notes, sentHome, hooks, army: (id) => armies.find(a => a.id === id), rally: (id) => rallies.find(r => r.id === id),
    restore: () => { Object.assign(prisma, saved); armyProcessor.sendArmyHome = savedFns.home; bastionService.speedPct = savedFns.speed; bastionService.relationTo = savedFns.rel; }
  };
}
const cityRow = (id, playerId, x, y, extra = {}) => ({ id, playerId, x, y, isSieged: false, ...extra });
const armyRow = (id, ownerId, city, extra = {}) => ({
  id, ownerId, name: id, cityId: city.id, city, status: 'IDLE', missionType: null, rallyId: null, isGarrison: false, x: city.x, y: city.y,
  targetX: null, targetY: null, targetBastionId: null, departedAt: null, arrivalAt: null, claimedAt: null, hero: null,
  units: [{ unitKey: 'ROM_INF_MILICIEN', tier: 'base', count: 50 }], owner: { id: ownerId, name: ownerId, faction: null, technologies: [] }, ...extra
});
const waiting = (city, rallyId) => ({ status: 'RALLY_WAIT', missionType: 'RALLY', rallyId, x: city.x, y: city.y, targetX: city.x, targetY: city.y });
const rallyRow = (extra = {}) => ({ id: 'r1', allianceId: 'A1', leaderId: 'p1', cityId: 'cA', targetNodeId: 'n1', targetBastionId: null, targetX: 10, targetY: -10, waitMinutes: 10, capacity: 3, status: 'GATHERING', launchAt: new Date(), arrivalAt: null, result: null, ...extra });

test('départ : la ville du lanceur a disparu, le rassemblement est annulé et chaque armée rentre d\'où elle attend', async () => {
  const colony = cityRow('cA', 'p1', 0, -10), capital = cityRow('cA2', 'p1', 0, -14), home = cityRow('cB', 'p2', 4, -12);
  const db = fakeDb({
    cities: [capital, home], nodes: [{ id: 'n1', x: 10, y: -10 }], rallies: [rallyRow()],
    armies: [armyRow('a1', 'p1', capital, waiting(colony, 'r1')), armyRow('a2', 'p2', home, waiting(colony, 'r1'))]   // colonie rasée : armée du lanceur rattachée à la capitale
  });
  try {
    assert.equal(await R.depart(db.rally('r1')), null);
    assert.equal(db.rally('r1').status, 'CANCELLED');
    assert.equal(db.rally('r1').result.reason, 'la ville du lanceur a disparu');
    for (const id of ['a1', 'a2']) { assert.equal(db.army(id).status, 'RETURNING'); assert.equal(db.army(id).rallyId, null); }
    assert.deepEqual(db.sentHome.map(s => [s.id, s.fromX, s.fromY]), [['a1', 0, -10], ['a2', 0, -10]]);
    assert.ok(db.notes.some(n => n.playerId === 'p2' && /annulé/.test(n.title)));
  } finally { db.restore(); }
});

test('départ : ville du lanceur assiégée — « Partir maintenant » refusé, au départ prévu le rassemblement est annulé', async () => {
  const leader = cityRow('cA', 'p1', 0, -10, { isSieged: true }), home = cityRow('cB', 'p2', 4, -12);
  const db = fakeDb({
    cities: [leader, home], nodes: [{ id: 'n1', x: 10, y: -10 }], rallies: [rallyRow()],
    armies: [armyRow('a1', 'p1', leader, waiting(leader, 'r1')), armyRow('a2', 'p2', home, waiting(leader, 'r1'))]
  });
  try {
    await assert.rejects(R.launchNow('p1', 'r1'), (e) => e.status === 400 && /assiégée/.test(e.message));
    assert.equal(db.rally('r1').status, 'GATHERING');
    assert.equal(await R.depart(db.rally('r1')), null);
    assert.equal(db.rally('r1').status, 'CANCELLED');
    assert.equal(db.rally('r1').result.reason, 'la ville du lanceur est assiégée');
    assert.equal(db.army('a1').status, 'IDLE');   // l'armée du lanceur reste dans ses murs
    assert.equal(db.army('a1').rallyId, null);
    assert.equal(db.army('a2').status, 'RETURNING');
  } finally { db.restore(); }
});

test('départ : une armée arrivée depuis le dernier tick part avec le groupe ; une armée rappelée pendant le calcul des routes n\'est pas réenrôlée', async () => {
  const leader = cityRow('cA', 'p1', 0, -10), homeB = cityRow('cB', 'p2', 4, -12), homeC = cityRow('cC', 'p3', 0, -14);
  const now = new Date();
  const db = fakeDb({
    cities: [leader, homeB, homeC], nodes: [{ id: 'n1', x: 10, y: -10 }], rallies: [rallyRow()],
    armies: [
      armyRow('a1', 'p1', leader, waiting(leader, 'r1')),
      armyRow('a2', 'p2', homeB, { status: 'RALLY_JOIN', missionType: 'RALLY', rallyId: 'r1', targetX: 0, targetY: -10, departedAt: new Date(now - 60000), arrivalAt: new Date(now - 5000) }),   // arrivée, pas encore vue par le tick
      armyRow('a3', 'p3', homeC, waiting(leader, 'r1'))
    ]
  });
  // a3 est rappelée (POST /army/:id/return) pendant que le départ calcule les routes
  db.hooks.onRoute = async () => Object.assign(db.army('a3'), { status: 'RETURNING', missionType: 'RETURN', rallyId: null, targetX: 0, targetY: -14 });
  try {
    const r = await R.depart(db.rally('r1'), now);
    assert.equal(r.armies, 2);
    assert.equal(db.rally('r1').status, 'MARCHING');
    for (const id of ['a1', 'a2']) {
      assert.equal(db.army(id).status, 'RALLY_MARCH');
      assert.deepEqual([db.army(id).x, db.army(id).y, db.army(id).targetX, db.army(id).targetY], [0, -10, 10, -10]);
    }
    assert.equal(db.army('a3').status, 'RETURNING');   // pas écrasée en RALLY_MARCH sans rassemblement
    assert.equal(db.army('a3').rallyId, null);
    assert.ok(!db.notes.some(n => n.playerId === 'p2' && /sans vous/.test(n.title)));
  } finally { db.restore(); }
});

test('tick : une armée arrivée attend sur la case du lanceur dès sa conversion ; une armée qui y attend déjà n\'est plus déplacée', async () => {
  const leader = cityRow('cA', 'p1', 0, -10), homeB = cityRow('cB', 'p2', 4, -12), homeC = cityRow('cC', 'p3', 0, -14);
  const now = new Date();
  const joining = (arrivalAt) => ({ status: 'RALLY_JOIN', missionType: 'RALLY', rallyId: 'r1', targetX: 0, targetY: -10, departedAt: new Date(now - 60000), arrivalAt });
  const db = fakeDb({
    cities: [leader, homeB, homeC], nodes: [{ id: 'n1', x: 10, y: -10 }], rallies: [rallyRow({ launchAt: new Date(now.getTime() + 600000) })],
    armies: [armyRow('a1', 'p1', leader, waiting(leader, 'r1')), armyRow('a2', 'p2', homeB, joining(new Date(now - 1000))), armyRow('a3', 'p3', homeC, joining(new Date(now.getTime() + 60000)))]
  });
  try {
    await R.processRallies(now);
    assert.deepEqual([db.army('a2').status, db.army('a2').x, db.army('a2').y, db.army('a2').arrivalAt], ['RALLY_WAIT', 0, -10, null]);
    assert.deepEqual([db.army('a3').status, db.army('a3').x, db.army('a3').y], ['RALLY_JOIN', 0, -14]);
    assert.equal(db.rally('r1').status, 'GATHERING');
    // déjà dans la ville du lanceur : seule la case où elle se trouve compte, pas une ancienne case cible
    Object.assign(db.army('a3'), { status: 'RALLY_WAIT', arrivalAt: null, x: 0, y: -10, targetX: 0, targetY: -14 });
    const r = await R.depart(db.rally('r1'), now);
    assert.equal(r.armies, 3);
    assert.deepEqual(['a1', 'a2', 'a3'].map(id => db.army(id).status), ['RALLY_MARCH', 'RALLY_MARCH', 'RALLY_MARCH']);
  } finally { db.restore(); }
});

test('départ : capitale du lanceur déplacée — les armées restées à l\'ancienne place rentrent de là-bas, sans téléportation', async () => {
  const moved = cityRow('cA', 'p1', 0, -14), oldSite = { x: 0, y: -10 }, home = cityRow('cB', 'p2', 4, -12);
  const db = fakeDb({
    cities: [moved, home], nodes: [{ id: 'n1', x: 10, y: -10 }], rallies: [rallyRow()],
    armies: [
      armyRow('a1', 'p1', moved, { rallyId: 'r1' }),   // téléportée avec la capitale, à l'arrêt
      armyRow('a2', 'p2', home, waiting(oldSite, 'r1'))
    ]
  });
  try {
    assert.equal(await R.depart(db.rally('r1')), null);
    assert.equal(db.rally('r1').status, 'CANCELLED');
    assert.deepEqual(db.sentHome, [{ id: 'a2', fromX: 0, fromY: -10 }]);
    assert.deepEqual([db.army('a2').x, db.army('a2').y], [0, -10]);
    assert.ok(db.notes.some(n => n.playerId === 'p2' && /déplacée/.test(n.body)));
  } finally { db.restore(); }
});

test('arrivée : un rassemblement contre un Bastion dont toutes les armées ont été rappelées n\'alerte pas le Bastion', async () => {
  const db = fakeDb({
    rallies: [rallyRow({ status: 'MARCHING', targetNodeId: null, targetBastionId: 'b1', arrivalAt: new Date(Date.now() - 1000) })],
    bastions: [{ id: 'b1', allianceId: 'A2', status: 'ACTIVE', x: 10, y: -10, alliance: { tag: 'ENN' } }],
    members: [{ playerId: 'd1', allianceId: 'A2' }, { playerId: 'd2', allianceId: 'A2' }]
  });
  try {
    assert.deepEqual(await R.fight(db.rally('r1')), { gone: true });
    assert.equal(db.rally('r1').status, 'DONE');
    assert.equal(db.rally('r1').result.gone, true);
    assert.equal(db.notes.length, 0);
  } finally { db.restore(); }
});

test('rejoindre : deux envois simultanés du même joueur — un seul passe ; un envoi pendant le départ est refusé', async () => {
  const leader = cityRow('cA', 'p1', 0, -10), homeB = cityRow('cB', 'p2', 4, -12), homeC = cityRow('cC', 'p3', 0, -14);
  const db = fakeDb({
    cities: [leader, homeB, homeC], rallies: [rallyRow({ launchAt: new Date(Date.now() + 30 * 60000) })],
    members: [{ playerId: 'p2', allianceId: 'A1' }, { playerId: 'p3', allianceId: 'A1' }],
    armies: [armyRow('a1', 'p1', leader, waiting(leader, 'r1')), armyRow('b1', 'p2', homeB), armyRow('b2', 'p2', homeB), armyRow('c1', 'p3', homeC)]
  });
  try {
    const both = await Promise.allSettled([R.join('p2', 'r1', 'b1'), R.join('p2', 'r1', 'b2')]);
    assert.equal(both.filter(x => x.status === 'fulfilled').length, 1);
    assert.match(both.find(x => x.status === 'rejected').reason.message, /déjà une armée/);
    assert.equal(['b1', 'b2'].filter(id => db.army(id).rallyId === 'r1').length, 1);
    db.hooks.onRoute = async () => { db.rally('r1').status = 'MARCHING'; };   // le lanceur part pendant l'envoi
    await assert.rejects(R.join('p3', 'r1', 'c1'), (e) => e.status === 400 && /déjà parti/.test(e.message));
    assert.equal(db.army('c1').status, 'IDLE');
    assert.equal(db.army('c1').rallyId, null);
  } finally { db.restore(); }
});

// ---- rencontres : les armées d'un rassemblement marchent comme les autres ----
const enc = require('../../src/game/processors/encounterProcessor');
test('rencontres : les marches d\'un rassemblement sont candidates, la garde d\'un Bastion combat le rassemblement qui vient l\'assiéger', () => {
  const at = (status, extra = {}) => ({ id: status, ownerId: 'x', status, missionType: 'RALLY', isGarrison: false, claimedAt: null, units: [{ count: 10 }], x: 0, y: -10, targetX: 10, targetY: -10, targetBastionId: null, departedAt: new Date(Date.now() - 1000), arrivalAt: new Date(Date.now() + 60000), city: { x: 4, y: -12 }, ...extra });
  for (const s of ['RALLY_JOIN', 'RALLY_MARCH']) { assert.ok(enc.isCandidate(at(s)), s); assert.ok(enc.isMarching(at(s)), s); }
  const b = { id: 'b1', x: 10, y: -10 };
  const guard = { status: 'IDLE', x: 10, y: -10 };
  assert.ok(enc.allowedOnBastion(b, guard, at('RALLY_MARCH', { targetBastionId: 'b1' })));
  assert.ok(enc.allowedOnBastion(b, at('RALLY_MARCH', { targetBastionId: 'b1' }), guard));
  assert.ok(enc.allowedOnBastion(b, guard, at('ATTACKING', { missionType: 'BASTION_ATTACK' })));   // l'armée seule, comme avant
  assert.ok(!enc.allowedOnBastion(b, guard, at('RALLY_MARCH', { targetBastionId: 'b2' })));
  assert.ok(!enc.allowedOnBastion(b, guard, at('RALLY_JOIN')));
  assert.ok(!enc.allowedOnCity({ x: 0, y: -10, playerId: 'p1' }, { status: 'IDLE', x: 0, y: -10, ownerId: 'g' }, at('RALLY_JOIN', { targetX: 0, targetY: -10 })));   // la case d'une ville reste aux règles du siège
});
