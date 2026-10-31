// Bastion d'alliance (décision du 26 octobre 2026) : règles de config, vies qui remontent, mur bouclier, bonus sans Bastion ;
// un assaut = un rassemblement ou une armée seule, garnison de 17 armées au plus (décision du 31 octobre 2026)
require('./_env');
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://unit:unit@localhost:5432/unit';   // le client Prisma est créé, jamais interrogé
const test = require('node:test');
const assert = require('node:assert/strict');
const config = require('../../src/config');
const bastion = require('../../src/services/bastionService');

test('règles décidées : 15 membres, coût, 3 jours, 7 jours de répit, 10 assauts, bonus', () => {
  const B = config.bastion;
  assert.equal(B.minMembers, 15);
  assert.deepEqual(B.cost, { wood: 500000, stone: 500000, iron: 500000, food: 250000 });
  assert.equal(B.buildDays, 3);
  assert.equal(B.cooldownDays, 7);
  assert.equal(B.assaults, 10);
  assert.deepEqual(B.bonuses, { productionPct: 10, armySpeedPct: 5, carryPct: 10, garrisonDefensePct: 10 });
});

test('mur bouclier : 3 fois un mur de niveau 20 (décision du 31 octobre 2026, 10 avant), garnison de 17 armées au plus', () => {
  assert.equal(config.bastion.wallMultiplier, 3);
  assert.equal(bastion.wallMaxHp(), config.combat.wallHpPerLevel * 20 * 3);
  assert.equal(bastion.wallMaxHp(), 60000);
  assert.equal(config.bastion.maxGarrisonArmies, 17);
});

test('vies : elles remontent de 0 à 10 en 72 h, jamais au-delà', () => {
  const at = new Date('2026-10-26T00:00:00Z');
  const b = { structure: 0.5, structureAt: at };
  assert.equal(bastion.structureNow(b, at.getTime()), 0.5);
  assert.ok(Math.abs(bastion.structureNow(b, at.getTime() + 36 * 3600000) - 1) < 1e-9);   // 36 h = la moitié de 72 h
  assert.equal(bastion.structureNow(b, at.getTime() + 100 * 3600000), 1);
  assert.ok(Math.abs(bastion.structureNow({ structure: 0, structureAt: at }, at.getTime() + 7.2 * 3600000) - 0.1) < 1e-9);   // une vie en 7,2 h
});

test('sans alliance ou sans Bastion debout : aucun bonus', () => {
  assert.equal(bastion.activeSync(null), false);
  assert.equal(bastion.speedPctSync(null), 0);
  assert.equal(bastion.carryMultSync(null), 1);
  assert.equal(bastion.carryMultSync('alliance-sans-bastion'), 1);
});

test('vies entières : une vie compte une fois remontée, le dernier assaut rase même avec un reste de remontée', () => {
  assert.equal(bastion.livesOf(1), 10);
  assert.equal(bastion.livesOf(0.9), 9);
  assert.equal(bastion.livesOf(0.95), 9);
  assert.equal(bastion.livesOf(0.1001), 1);
  assert.equal(bastion.livesOf(0.0999), 0);
});

test('assaut d\'un rassemblement : seul un rassemblement parti vers ce Bastion désigne le héros (un ancien rallyId est ignoré)', () => {
  assert.equal(bastion.campingRally({ status: 'DONE', targetBastionId: 'b1' }, 'b1'), true);
  assert.equal(bastion.campingRally({ status: 'DONE', targetBastionId: 'b2' }, 'b1'), false, 'un rassemblement vers un autre Bastion');
  assert.equal(bastion.campingRally({ status: 'DONE', targetBastionId: null }, 'b1'), false, 'un rassemblement contre un donjon');
  assert.equal(bastion.campingRally({ status: 'CANCELLED', targetBastionId: 'b1' }, 'b1'), false);
  assert.equal(bastion.campingRally({ status: 'GATHERING', targetBastionId: 'b1' }, 'b1'), false);
  assert.equal(bastion.campingRally(undefined, 'b1'), false, 'un rassemblement introuvable');
});

// ---- base factice : le client Prisma est remplacé le temps d'un test (aucune requête réelle) ----
const prisma = require('../../src/config/database');
function matches(row, where = {}) {
  return Object.entries(where).every(([k, v]) => {
    if (k === 'OR') return v.some(w => matches(row, w));
    if (v !== null && typeof v === 'object' && !(v instanceof Date)) {
      if ('in' in v) return v.in.includes(row[k]);
      if ('not' in v) return (row[k] ?? null) !== v.not;
      throw new Error(`filtre non géré : ${k}`);
    }
    return (row[k] ?? null) === v;
  });
}
function table(rows) {
  return {
    findUnique: async ({ where }) => { const r = rows.find(x => matches(x, where)); return r ? { ...r } : null; },
    findFirst: async ({ where }) => { const r = rows.find(x => matches(x, where)); return r ? { ...r } : null; },
    findMany: async ({ where } = {}) => rows.filter(x => matches(x, where)).map(r => ({ ...r })),
    count: async ({ where } = {}) => rows.filter(x => matches(x, where)).length,
    update: async ({ where, data }) => Object.assign(rows.find(x => x.id === where.id), data),
    updateMany: async ({ where, data }) => { const hit = rows.filter(x => matches(x, where)); for (const x of hit) Object.assign(x, data); return { count: hit.length }; }
  };
}
function fakeDb({ armies = [], rallies = [], bastions = [], members = [] }) {
  const names = ['army', 'rally', 'bastion', 'allianceMember', 'city', 'resourceNode', 'notification', '$transaction'];
  const saved = Object.fromEntries(names.map(n => [n, prisma[n]]));
  const notes = [];
  // villes et points : lus par le calcul du trajet (utils/pathfinding), aucun ici
  const db = { army: table(armies), rally: table(rallies), bastion: table(bastions), allianceMember: table(members), city: table([]), resourceNode: table([]), notification: { create: async ({ data }) => { notes.push(data); return { id: String(notes.length) }; } } };
  const tx = { ...db, $queryRaw: async () => [] };
  Object.assign(prisma, db, { $transaction: (fn) => fn(tx) });
  return { tx, notes, army: (id) => armies.find(a => a.id === id), restore: () => Object.assign(prisma, saved) };
}
const camp = (id, ownerId, extra = {}) => ({ id, ownerId, name: id, status: 'BESIEGING', missionType: 'BASTION_ATTACK', targetBastionId: 'b1', rallyId: null, claimedAt: null, units: [], owner: { id: ownerId }, hero: null, ...extra });

test('assaut (décision du 31 octobre 2026) : un rassemblement ou une armée seule, jamais les autres camps de l\'alliance', async () => {
  const now = new Date();
  const db = fakeDb({
    rallies: [{ id: 'r1', leaderId: 'p1', status: 'DONE', targetBastionId: 'b1' }, { id: 'old', leaderId: 'p1', status: 'DONE', targetBastionId: 'b9' }],
    armies: [
      camp('lead', 'p1', { rallyId: 'r1' }), camp('mate', 'p2', { rallyId: 'r1' }), camp('late', 'p3', { rallyId: 'r1', claimedAt: now }),
      camp('solo', 'p4'), camp('solo2', 'p2'), camp('stale', 'p5', { rallyId: 'old' }), camp('other', 'p6', { rallyId: 'r1', targetBastionId: 'b2' })
    ]
  });
  try {
    // le rassemblement : ses armées seules (celle déjà réservée et celle devant un autre Bastion restent à part), réservées
    const r = await bastion.assaultGroup(db.tx, db.army('lead'), 'b1', now);
    assert.equal(r.rally.id, 'r1');
    assert.deepEqual(r.group.map(g => g.id), ['lead', 'mate']);
    assert.equal(db.army('mate').claimedAt, now);
    assert.equal(db.army('solo').claimedAt, null, 'un camp de la même alliance qui finit au même instant livre son propre assaut');
    assert.equal(db.army('solo2').claimedAt, null, 'même celui d\'un membre du rassemblement');
    // une armée seule : elle seule ; un ancien rallyId (rassemblement vers un autre Bastion) ne regroupe rien
    for (const id of ['solo', 'stale']) {
      const one = await bastion.assaultGroup(db.tx, db.army(id), 'b1', now);
      assert.deepEqual(one.group.map(g => g.id), [id]);
      assert.equal(one.rally, null);
    }
  } finally { db.restore(); }
});

test('garnison : 17 armées au plus, celles en route et une sortie en cours comprises (décision du 31 octobre 2026)', async () => {
  const where = bastion.garrisonWhere('b1');
  const row = (status, missionType, targetBastionId = 'b1') => ({ status, missionType, targetBastionId });
  assert.ok(matches(row('STATIONED', 'BASTION_GARRISON'), where));
  assert.ok(matches(row('SUPPORTING', 'BASTION_GARRISON'), where), 'en route pour y entrer');
  assert.ok(matches(row('ATTACKING', 'BASTION_SORTIE'), where), 'une sortie y revient victorieuse');
  assert.ok(!matches(row('ATTACKING', 'BASTION_ATTACK'), where), 'un assaillant');
  assert.ok(!matches(row('BESIEGING', 'BASTION_ATTACK'), where), 'un camp ennemi');
  assert.ok(!matches(row('TRANSPORTING', 'BASTION_SUPPLY'), where), 'un ravitaillement');
  assert.ok(!matches(row('STATIONED', 'BASTION_GARRISON', 'b2'), where), 'un autre Bastion');
  // à l'arrivée : refusée quand 17 armées sont déjà dedans, elle rentre ; acceptée à 16
  const B = config.bastion;
  for (const [inside, enters] of [[B.maxGarrisonArmies, false], [B.maxGarrisonArmies - 1, true]]) {
    const armies = Array.from({ length: inside }, (_, i) => ({ id: `g${i}`, ownerId: 'p2', status: 'STATIONED', missionType: 'BASTION_GARRISON', targetBastionId: 'b1' }));
    armies.push({ id: 'new', ownerId: 'p1', name: 'Cohorte', status: 'SUPPORTING', missionType: 'BASTION_GARRISON', targetBastionId: 'b1', targetX: 5, targetY: 5, x: 5, y: 5 });
    const db = fakeDb({ armies, bastions: [{ id: 'b1', allianceId: 'A1', status: 'ACTIVE', isSieged: false, x: 5, y: 5 }], members: [{ playerId: 'p1', allianceId: 'A1' }] });
    const home = [];
    try {
      await bastion.handleGarrisonArrival(db.army('new'), async (army) => { home.push(army.id); });
      await new Promise(r => setImmediate(r));
      assert.equal(db.army('new').status, enters ? 'STATIONED' : 'SUPPORTING', `${inside} armées dedans`);
      assert.deepEqual(home, enters ? [] : ['new']);
      if (!enters) assert.ok(db.notes.some(n => n.body.includes(`garnison complète : ${B.maxGarrisonArmies} armées au plus`)), JSON.stringify(db.notes));
    } finally { db.restore(); }
  }
});

test('envoi en garnison : refusé quand 17 armées y sont ou y vont, accepté à 16', async () => {
  require('../../frontend/js/shared/terrain.js').setWorldSeed(0);   // la carte de référence (calcul du trajet)
  const B = config.bastion;
  for (const [taken, ok] of [[B.maxGarrisonArmies, false], [B.maxGarrisonArmies - 1, true]]) {
    // la moitié dedans, la moitié en route
    const armies = Array.from({ length: taken }, (_, i) => ({ id: `g${i}`, ownerId: 'p2', status: i % 2 ? 'SUPPORTING' : 'STATIONED', missionType: 'BASTION_GARRISON', targetBastionId: 'b1' }));
    const city = { id: 'c1', x: 0, y: -10, isSieged: false, buildings: [] };
    armies.push({ id: 'a1', ownerId: 'p1', name: 'Cohorte', cityId: 'c1', city, isGarrison: false, status: 'IDLE', x: 0, y: -10, hero: null,
      units: [{ unitKey: 'ROM_INF_MILICIEN', tier: 'base', count: 50 }], owner: { id: 'p1', faction: 'ROME', technologies: [], alliance: { allianceId: 'A1' }, cities: [] } });
    const db = fakeDb({ armies, bastions: [{ id: 'b1', allianceId: 'A1', status: 'ACTIVE', isSieged: false, x: 4, y: -10, alliance: { tag: 'TAG', name: 'Alliance' } }], members: [{ playerId: 'p1', allianceId: 'A1' }] });
    try {
      const send = bastion.send('p1', 'b1', { armyId: 'a1', mission: 'GARRISON' });
      if (ok) { await send; assert.equal(db.army('a1').status, 'SUPPORTING'); }
      else await assert.rejects(send, (e) => e.status === 400 && e.message === 'Garnison du Bastion complète : 17 armées au plus, celles en route comprises');
    } finally { db.restore(); }
  }
});

test('vue du Bastion : les règles (mur, vies, garnison au plus) même sans alliance', async () => {
  const db = fakeDb({});
  try {
    const v = await bastion.bastionFor('p1');
    assert.equal(v.inAlliance, false);
    assert.equal(v.rules.maxGarrisonArmies, 17);
    assert.equal(v.rules.wallMultiplier, config.bastion.wallMultiplier);
    assert.equal(v.rules.assaults, config.bastion.assaults);
  } finally { db.restore(); }
});

test('vue du Bastion : la garnison listée est celle que compte le plafond (dedans, en route, en sortie)', async () => {
  const unit = [{ unitKey: 'ROM_INF_MILICIEN', tier: 'base', count: 10 }];
  const army = (id, status, missionType, extra = {}) => ({ id, name: id, ownerId: 'p2', owner: { id: 'p2', name: 'Bo' }, status, missionType, targetBastionId: 'b1', units: unit, ...extra });
  const b = { id: 'b1', allianceId: 'A1', status: 'ACTIVE', isSieged: true, x: 5, y: 5, structure: 1, structureAt: new Date() };
  const db = fakeDb({
    armies: [army('dedans', 'STATIONED', 'BASTION_GARRISON'), army('en-route', 'SUPPORTING', 'BASTION_GARRISON'), army('sortie', 'ATTACKING', 'BASTION_SORTIE'),
      army('camp', 'BESIEGING', 'BASTION_ATTACK', { ownerId: 'p9' }), army('ailleurs', 'STATIONED', 'BASTION_GARRISON', { targetBastionId: 'b2' })],
    members: [{ playerId: 'p1', allianceId: 'A1', role: 'MEMBER', alliance: { bastion: b, _count: { members: 16 } } }]
  });
  try {
    const v = await bastion.bastionFor('p1');
    assert.deepEqual(v.bastion.garrison.map(g => [g.id, g.status]), [['dedans', 'STATIONED'], ['en-route', 'SUPPORTING'], ['sortie', 'ATTACKING']]);
    assert.equal(v.bastion.maxGarrisonArmies, config.bastion.maxGarrisonArmies);
  } finally { db.restore(); }
});

test('garnison : à l\'arrivée, l\'état du Bastion est relu sous son verrou (un camp installé entre-temps la renvoie)', async () => {
  const db = fakeDb({
    armies: [{ id: 'new', ownerId: 'p1', name: 'Cohorte', status: 'SUPPORTING', missionType: 'BASTION_GARRISON', targetBastionId: 'b1', targetX: 5, targetY: 5, x: 5, y: 5 }],
    bastions: [{ id: 'b1', allianceId: 'A1', status: 'ACTIVE', isSieged: false, x: 5, y: 5 }],
    members: [{ playerId: 'p1', allianceId: 'A1' }]
  });
  db.tx.bastion = table([{ id: 'b1', allianceId: 'A1', status: 'ACTIVE', isSieged: true, x: 5, y: 5 }]);   // relu sous le verrou : assiégé
  const home = [];
  try {
    await bastion.handleGarrisonArrival(db.army('new'), async (army) => { home.push(army.id); });
    await new Promise(r => setImmediate(r));
    assert.equal(db.army('new').status, 'SUPPORTING');
    assert.deepEqual(home, ['new']);
    assert.ok(db.notes.some(n => n.body.includes('(assiégé)')), JSON.stringify(db.notes));
  } finally { db.restore(); }
});
