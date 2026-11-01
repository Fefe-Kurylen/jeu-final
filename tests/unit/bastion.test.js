// Bastion d'alliance (décision du 26 octobre 2026) : règles de config, vies qui remontent, mur bouclier, bonus sans Bastion ;
// un assaut = un rassemblement ou une armée seule, garnison de 10 armées au plus (décision du 31 octobre 2026) ; le camp
// devant un Bastion se brise comme un siège de ville (renforts de l'alliance et de ses alliés, sortie de la garnison)
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

test('mur bouclier : 3 fois un mur de niveau 20 (décision du 31 octobre 2026, 10 avant), garnison de 10 armées au plus', () => {
  assert.equal(config.bastion.wallMultiplier, 3);
  assert.equal(bastion.wallMaxHp(), config.combat.wallHpPerLevel * 20 * 3);
  assert.equal(bastion.wallMaxHp(), 60000);
  assert.equal(config.bastion.maxGarrisonArmies, 10);
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
    if (k === 'NOT') return !matches(row, v);
    if (v !== null && typeof v === 'object' && !(v instanceof Date)) {
      if ('in' in v) return v.in.includes(row[k]);
      if ('not' in v) return (row[k] ?? null) !== v.not;
      if ('gt' in v) return row[k] > v.gt;
      // filtres sur une relation (lignes d'unités d'une armée)
      if ('some' in v) return (row[k] || []).some(x => matches(x, v.some));
      if ('none' in v) return !(row[k] || []).some(x => matches(x, v.none));
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
function fakeDb({ armies = [], rallies = [], bastions = [], members = [], cities = [] }) {
  const names = ['army', 'rally', 'bastion', 'allianceMember', 'city', 'resourceNode', 'notification', '$transaction'];
  const saved = Object.fromEntries(names.map(n => [n, prisma[n]]));
  const notes = [];
  // villes et points : lus par le calcul du trajet (utils/pathfinding) ; villes : celles où rentrent les armées
  const db = { army: table(armies), rally: table(rallies), bastion: table(bastions), allianceMember: table(members), city: table(cities), resourceNode: table([]), notification: { create: async ({ data }) => { notes.push(data); return { id: String(notes.length) }; } } };
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

const SOLDIERS = [{ unitKey: 'ROM_INF_MILICIEN', tier: 'base', count: 10 }];
test('garnison : 10 armées au plus, celles en route et une sortie en cours comprises (décision du 31 octobre 2026)', async () => {
  const where = bastion.garrisonWhere('b1');
  const row = (status, missionType, targetBastionId = 'b1', units = SOLDIERS) => ({ status, missionType, targetBastionId, units });
  assert.ok(matches(row('STATIONED', 'BASTION_GARRISON'), where));
  assert.ok(matches(row('SUPPORTING', 'BASTION_GARRISON'), where), 'en route pour y entrer');
  assert.ok(matches(row('ATTACKING', 'BASTION_SORTIE'), where), 'une sortie y revient victorieuse');
  assert.ok(!matches(row('ATTACKING', 'BASTION_ATTACK'), where), 'un assaillant');
  assert.ok(!matches(row('BESIEGING', 'BASTION_ATTACK'), where), 'un camp ennemi');
  assert.ok(!matches(row('TRANSPORTING', 'BASTION_SUPPLY'), where), 'un ravitaillement');
  assert.ok(!matches(row('STATIONED', 'BASTION_GARRISON', 'b2'), where), 'un autre Bastion');
  // une armée postée sans soldats (anéantie dans un assaut) ne prend plus de place
  assert.ok(!matches(row('STATIONED', 'BASTION_GARRISON', 'b1', []), where), 'aucune ligne d\'unités');
  assert.ok(!matches(row('STATIONED', 'BASTION_GARRISON', 'b1', [{ unitKey: 'ROM_INF_MILICIEN', count: 0 }]), where), 'des lignes à 0');
  // à l'arrivée : refusée quand 10 armées sont déjà dedans, elle rentre ; acceptée à 9, ou quand les 10 sont vides
  const B = config.bastion;
  for (const [inside, enters, units] of [[B.maxGarrisonArmies, false, SOLDIERS], [B.maxGarrisonArmies - 1, true, SOLDIERS], [B.maxGarrisonArmies, true, []]]) {
    const armies = Array.from({ length: inside }, (_, i) => ({ id: `g${i}`, ownerId: 'p2', status: 'STATIONED', missionType: 'BASTION_GARRISON', targetBastionId: 'b1', units }));
    armies.push({ id: 'new', ownerId: 'p1', name: 'Cohorte', status: 'SUPPORTING', missionType: 'BASTION_GARRISON', targetBastionId: 'b1', targetX: 5, targetY: 5, x: 5, y: 5 });
    const db = fakeDb({ armies, bastions: [{ id: 'b1', allianceId: 'A1', status: 'ACTIVE', isSieged: false, x: 5, y: 5 }], members: [{ playerId: 'p1', allianceId: 'A1' }] });
    const home = [];
    try {
      await bastion.handleGarrisonArrival(db.army('new'), async (army) => { home.push(army.id); });
      await new Promise(r => setImmediate(r));
      assert.equal(db.army('new').status, enters ? 'STATIONED' : 'SUPPORTING', `${inside} armées dedans${units.length ? '' : ', vides'}`);
      assert.deepEqual(home, enters ? [] : ['new']);
      if (!enters) assert.ok(db.notes.some(n => n.body.includes(`garnison complète : ${B.maxGarrisonArmies} armées au plus`)), JSON.stringify(db.notes));
    } finally { db.restore(); }
  }
});

test('envoi en garnison : refusé quand 10 armées y sont ou y vont, accepté à 9', async () => {
  require('../../frontend/js/shared/terrain.js').setWorldSeed(0);   // la carte de référence (calcul du trajet)
  const B = config.bastion;
  for (const [taken, ok] of [[B.maxGarrisonArmies, false], [B.maxGarrisonArmies - 1, true]]) {
    // la moitié dedans, la moitié en route
    const armies = Array.from({ length: taken }, (_, i) => ({ id: `g${i}`, ownerId: 'p2', status: i % 2 ? 'SUPPORTING' : 'STATIONED', missionType: 'BASTION_GARRISON', targetBastionId: 'b1', units: SOLDIERS }));
    const city = { id: 'c1', x: 0, y: -10, isSieged: false, buildings: [] };
    armies.push({ id: 'a1', ownerId: 'p1', name: 'Cohorte', cityId: 'c1', city, isGarrison: false, status: 'IDLE', x: 0, y: -10, hero: null,
      units: [{ unitKey: 'ROM_INF_MILICIEN', tier: 'base', count: 50 }], owner: { id: 'p1', faction: 'ROME', technologies: [], alliance: { allianceId: 'A1' }, cities: [] } });
    const db = fakeDb({ armies, bastions: [{ id: 'b1', allianceId: 'A1', status: 'ACTIVE', isSieged: false, x: 4, y: -10, alliance: { tag: 'TAG', name: 'Alliance' } }], members: [{ playerId: 'p1', allianceId: 'A1' }] });
    try {
      const send = bastion.send('p1', 'b1', { armyId: 'a1', mission: 'GARRISON' });
      if (ok) { await send; assert.equal(db.army('a1').status, 'SUPPORTING'); }
      else await assert.rejects(send, (e) => e.status === 400 && e.message === 'Garnison du Bastion complète : 10 armées au plus, celles en route comprises');
    } finally { db.restore(); }
  }
});

test('envoi au Bastion : une armée réservée par une offre du marché (MARKET) ne part pas, refus clair', async () => {
  require('../../frontend/js/shared/terrain.js').setWorldSeed(0);
  const city = { id: 'c1', x: 0, y: -10, isSieged: false, buildings: [] };
  for (const mission of ['GARRISON', 'SUPPLY']) {
    const armies = [{ id: 'a1', ownerId: 'p1', name: 'Cohorte', cityId: 'c1', city, isGarrison: false, status: 'MARKET', missionType: 'MARKET_OFFER', x: 0, y: -10, hero: null,
      units: [{ unitKey: 'ROM_INF_MILICIEN', tier: 'base', count: 50 }], owner: { id: 'p1', faction: 'ROME', technologies: [], alliance: { allianceId: 'A1' }, cities: [] } }];
    const db = fakeDb({ armies, bastions: [{ id: 'b1', allianceId: 'A1', status: mission === 'SUPPLY' ? 'FUNDING' : 'ACTIVE', isSieged: false, x: 4, y: -10, alliance: { tag: 'TAG', name: 'Alliance' } }], members: [{ playerId: 'p1', allianceId: 'A1' }] });
    try {
      await assert.rejects(bastion.send('p1', 'b1', { armyId: 'a1', mission, resources: { wood: 10 } }), (e) => e.status === 400 && e.message === require('../../src/services/marketService').MARKET_BUSY, mission);
      assert.equal(db.army('a1').status, 'MARKET');
    } finally { db.restore(); }
  }
});

test('vue du Bastion : les règles (mur, vies, garnison au plus) même sans alliance', async () => {
  const db = fakeDb({});
  try {
    const v = await bastion.bastionFor('p1');
    assert.equal(v.inAlliance, false);
    assert.equal(v.rules.maxGarrisonArmies, 10);
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
      army('camp', 'BESIEGING', 'BASTION_ATTACK', { ownerId: 'p9' }), army('ailleurs', 'STATIONED', 'BASTION_GARRISON', { targetBastionId: 'b2' }),
      army('vide', 'STATIONED', 'BASTION_GARRISON', { units: [] })],   // anéantie : elle rentre, plus listée
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

// ---- briser le siège d'un Bastion (propriétaire, 31 octobre 2026 : « les assaillants peuvent être attaqués par les
// renforts, comme les sièges ») : renforts de l'alliance et de ses alliés, sortie de la garnison, contre un rassemblement
// ou une armée seule ----
// Base factice plus large : unités des armées, diplomatie, rapports ; tout autre modèle lit vide et accepte les écritures
// (classements, blessés, technologies)
function breakDb({ armies = [], bastions = [], members = [], diplomacy = [], units = [], cities = [] }) {
  const base = fakeDb({ armies, bastions, members, cities });
  const reports = [];
  const unitTable = {
    findMany: async ({ where }) => units.filter(u => u.armyId === where.armyId).map(u => ({ ...u })),
    count: async ({ where }) => units.filter(u => matches(u, where)).length,
    // pertes d'un combat en terrain ouvert (decrement) ou d'un assaut (nouvel effectif)
    update: async ({ where, data }) => { const u = units.find(x => x.id === where.id); if (u) u.count = typeof data.count === 'number' ? data.count : u.count - data.count.decrement; return u; },
    deleteMany: async ({ where }) => { const i = units.findIndex(x => x.id === where.id); if (i >= 0) units.splice(i, 1); return { count: i >= 0 ? 1 : 0 }; }
  };
  const extra = { allianceDiplomacy: table(diplomacy), armyUnit: unitTable, battleReport: { create: async ({ data }) => { reports.push(data); return { id: `rep${reports.length}` }; } } };
  const saved = Object.fromEntries(Object.keys(extra).map(k => [k, prisma[k]]));
  Object.assign(prisma, extra);
  const anyModel = { findMany: async () => [], findFirst: async () => null, findUnique: async () => null, count: async () => 0, aggregate: async () => ({ _sum: { count: 0 } }), create: async ({ data }) => ({ id: 'x', ...data }), update: async () => ({}), upsert: async () => ({}), updateMany: async () => ({ count: 0 }), deleteMany: async () => ({ count: 0 }) };
  const tx = new Proxy({ ...base.tx, ...extra, $executeRaw: async () => 1, $executeRawUnsafe: async () => 1 }, { get: (t, k) => (k in t ? t[k] : anyModel) });
  prisma.$transaction = (fn) => fn(tx);
  return { ...base, tx, reports, units, restore: () => { Object.assign(prisma, saved); base.restore(); } };
}
// Bastion DEF (alliance A1, alliée de A2) assiégé par l'alliance E1 (alliée de A3) ; la carte de référence pour les trajets
const BASTION = { id: 'b1', allianceId: 'A1', status: 'ACTIVE', isSieged: true, x: 4, y: -10, structure: 1, structureAt: new Date(), alliance: { id: 'A1', tag: 'DEF', name: 'Défenseurs' } };
const MEMBERS = [['p1', 'A1'], ['p2', 'A2'], ['p7', 'E1'], ['p8', 'E1'], ['p9', 'E1'], ['p5', 'A3']].map(([playerId, allianceId]) => ({ playerId, allianceId }));
const DIPLOMACY = [['A1', 'A2'], ['A2', 'A1'], ['E1', 'A3'], ['A3', 'E1']].map(([allianceId, targetAllianceId]) => ({ allianceId, targetAllianceId, status: 'ALLY' }));
const home = (id, x) => ({ id, x, y: -10, isSieged: false, isCapital: true, buildings: [] });
// camp d'un rassemblement (rallyId, plusieurs propriétaires) ou d'une armée seule, devant le Bastion
const siegeCamp = (id, ownerId, count, rallyId = null) => ({ id, ownerId, name: id, status: 'BESIEGING', missionType: 'BASTION_ATTACK', targetBastionId: 'b1', rallyId, claimedAt: null, x: 4, y: -10, cityId: `c-${ownerId}`, city: home(`c-${ownerId}`, -20),
  arrivalAt: new Date(Date.now() + 1800000), heroId: null, hero: null, owner: { id: ownerId, name: ownerId, faction: 'GAUL', technologies: [], alliance: { allianceId: 'E1' } }, units: [{ id: `u-${id}`, unitKey: 'GAU_INF_GUERRIER', tier: 'base', count }] });
const breaker = (id, ownerId, count, extra = {}) => ({ id, ownerId, name: id, cityId: `c-${ownerId}`, city: home(`c-${ownerId}`, 0), isGarrison: false, status: 'IDLE', x: 0, y: -10, heroId: null, hero: null,
  units: [{ id: `u-${id}`, armyId: id, unitKey: 'ROM_INF_LEGIONNAIRE', tier: 'elite', count }], owner: { id: ownerId, name: ownerId, faction: 'ROME', technologies: [], alliance: { allianceId: MEMBERS.find(m => m.playerId === ownerId).allianceId }, cities: [] }, ...extra });

test('briser le siège : renforts de l\'alliance du Bastion et de ses alliés, sortie de la garnison ; jamais le camp lui-même ni ses alliés', async () => {
  require('../../frontend/js/shared/terrain.js').setWorldSeed(0);
  const cases = [
    ['p1', breaker('a-p1', 'p1', 50), 'BASTION_BREAK', null],
    ['p2', breaker('a-p2', 'p2', 50), 'BASTION_BREAK', null],
    ['p2', breaker('g-p2', 'p2', 50, { status: 'STATIONED', missionType: 'BASTION_GARRISON', targetBastionId: 'b1', x: 4 }), 'BASTION_SORTIE', null],
    ['p8', breaker('a-p8', 'p8', 50), null, 'Les armées qui assiègent ce Bastion sont de votre alliance ou d\'une alliance alliée'],
    ['p5', breaker('a-p5', 'p5', 50), null, 'Les armées qui assiègent ce Bastion sont de votre alliance ou d\'une alliance alliée']
  ];
  for (const [playerId, army, missionType, refusal] of cases) {
    const camp = [siegeCamp('lead', 'p7', 100, 'r1'), siegeCamp('mate', 'p8', 100, 'r1'), siegeCamp('mate2', 'p9', 100, 'r1')];
    const db = breakDb({ armies: [...camp, army], bastions: [{ ...BASTION }], members: MEMBERS, diplomacy: DIPLOMACY });
    try {
      const send = bastion.send(playerId, 'b1', { armyId: army.id, mission: 'BREAK' });
      if (refusal) { await assert.rejects(send, (e) => e.status === 400 && e.message === refusal, playerId); continue; }
      const out = await send;
      assert.deepEqual([db.army(army.id).status, db.army(army.id).missionType, db.army(army.id).targetBastionId], ['ATTACKING', missionType, 'b1'], `${playerId} ${army.id}`);
      assert.equal(out.sortie, missionType === 'BASTION_SORTIE');
      if (out.sortie) assert.equal(out.travelTime, config.bastion.sortieSeconds, 'la sortie frappe 30 s après');
      // les trois propriétaires du camp du rassemblement sont prévenus
      assert.deepEqual(db.notes.filter(n => n.kind === 'attack_incoming').map(n => n.playerId).sort(), ['p7', 'p8', 'p9']);
    } finally { db.restore(); }
  }
});

test('briser le siège gagné : le camp (rassemblement de plusieurs joueurs ou armée seule) rentre, le Bastion n\'est plus assiégé, l\'assaut n\'a pas lieu', async () => {
  require('../../frontend/js/shared/terrain.js').setWorldSeed(0);
  for (const camp of [[siegeCamp('lead', 'p7', 30, 'r1'), siegeCamp('mate', 'p8', 30, 'r1'), siegeCamp('mate2', 'p9', 30, 'r1')], [siegeCamp('solo', 'p7', 30)]]) {
    const army = breaker('a-p2', 'p2', 3000, { status: 'ATTACKING', missionType: 'BASTION_BREAK', targetBastionId: 'b1', targetX: 4, targetY: -10, x: 4 });
    const db = breakDb({ armies: [...camp, army], bastions: [{ ...BASTION }], members: MEMBERS, diplomacy: DIPLOMACY, units: army.units.map(u => ({ ...u })) });
    const sentHome = [];
    try {
      const stale = camp.map(c => ({ ...c }));   // lus par le tick avant le combat
      await bastion.handleBreakArrival(army, new Date(), async (a) => { sentHome.push(a.id); });
      for (const c of camp) {
        const row = db.army(c.id);
        assert.deepEqual([row.status, row.missionType, row.rallyId, row.targetBastionId], ['RETURNING', 'RETURN', null, null], `${c.id} rentre, sorti du rassemblement`);
      }
      assert.equal((await db.tx.bastion.findUnique({ where: { id: 'b1' } })).isSieged, false, 'plus de camp : plus de siège');
      assert.deepEqual([db.army('a-p2').status, db.army('a-p2').x, db.army('a-p2').targetBastionId], ['IDLE', 4, null], 'le vainqueur garde le Bastion devant ses murs');
      assert.deepEqual(sentHome, []);
      assert.equal(db.reports.length, 1 + camp.length, 'un rapport par joueur');
      // l'heure du camp passée, le tick (qui l'avait lu avant) n'en tire aucun assaut : le Bastion ne perd rien
      for (const c of stale) await bastion.handleBastionBattle(c, new Date(), async (a) => { sentHome.push(a.id); });
      assert.deepEqual(sentHome, [], 'aucune armée renvoyée une seconde fois');
      assert.equal(db.reports.length, 1 + camp.length, 'aucun rapport d\'assaut');
      assert.equal((await db.tx.bastion.findUnique({ where: { id: 'b1' } })).structure, 1, 'aucune vie perdue');
      assert.ok(db.notes.some(n => n.playerId === 'p1' && n.title === '🏰 Siège du Bastion brisé'), 'l\'alliance du Bastion est prévenue');
    } finally { db.restore(); }
  }
});

test('briser le siège perdu : le camp du rassemblement reste et le Bastion reste assiégé ; l\'armée vaincue rentre', async () => {
  require('../../frontend/js/shared/terrain.js').setWorldSeed(0);
  const camp = [siegeCamp('lead', 'p7', 2000, 'r1'), siegeCamp('mate', 'p8', 2000, 'r1')];
  const army = breaker('a-p1', 'p1', 5, { status: 'ATTACKING', missionType: 'BASTION_BREAK', targetBastionId: 'b1', targetX: 4, targetY: -10, x: 4 });
  const db = breakDb({ armies: [...camp, army], bastions: [{ ...BASTION }], members: MEMBERS, diplomacy: DIPLOMACY, units: army.units.map(u => ({ ...u })) });
  const sentHome = [];
  try {
    await bastion.handleBreakArrival(army, new Date(), async (a) => { sentHome.push(a.id); });
    assert.deepEqual(camp.map(c => [db.army(c.id).status, db.army(c.id).rallyId]), [['BESIEGING', 'r1'], ['BESIEGING', 'r1']]);
    assert.equal((await db.tx.bastion.findUnique({ where: { id: 'b1' } })).isSieged, true);
    assert.deepEqual(sentHome, ['a-p1']);
  } finally { db.restore(); }
});

// ---- garnison anéantie (simulation du 1er novembre 2026 : 18 armées vides gardaient 9 et 10 places sur 10) ----
// Les lignes d'unités vivent dans une table à part ; une armée les lit à chaque lecture (comme l'include de Prisma)
function withUnits(row, units) {
  Object.defineProperty(row, 'units', { enumerable: true, get: () => units.filter(u => u.armyId === row.id) });
  return row;
}
const garrisonRow = (id, ownerId, units, extra = {}) => withUnits({ id, ownerId, name: id, cityId: `c-${ownerId}`, isGarrison: false, status: 'STATIONED', missionType: 'BASTION_GARRISON', targetBastionId: 'b1', x: 4, y: -10, heroId: null, hero: null,
  owner: { id: ownerId, name: ownerId, faction: 'ROME', technologies: [], alliance: { allianceId: MEMBERS.find(m => m.playerId === ownerId)?.allianceId || null } }, ...extra }, units);

test('garnison anéantie par un assaut : ses armées rentrent, leur place est libérée et une 11e armée entre', async () => {
  require('../../frontend/js/shared/terrain.js').setWorldSeed(0);
  const B = config.bastion;
  const units = [{ id: 'u-solo', armyId: 'solo', unitKey: 'GAU_INF_GUERRIER', tier: 'base', count: 2000 }, { id: 'r-solo', armyId: 'solo', unitKey: 'GAU_SIEGE_BELIER', tier: 'base', count: 1000 }];
  // 9 armées de 2 miliciens (membre p1 et allié p2) et une armée déjà vide (anéantie avant ce correctif) : 10 sur 10
  const garrison = Array.from({ length: B.maxGarrisonArmies - 1 }, (_, i) => {
    units.push({ id: `u-g${i}`, armyId: `g${i}`, unitKey: 'ROM_INF_MILICIEN', tier: 'base', count: 2 });
    return garrisonRow(`g${i}`, i % 2 ? 'p2' : 'p1', units);
  });
  garrison.push(garrisonRow('vieille', 'p6', units));
  const attacker = siegeCamp('solo', 'p7', 0);
  delete attacker.units;
  withUnits(attacker, units);
  const city = { id: 'c-p1', x: 0, y: -10, isSieged: false, buildings: [] };
  const newcomer = withUnits({ id: 'a11', ownerId: 'p1', name: 'Cohorte', cityId: 'c-p1', city, isGarrison: false, status: 'IDLE', x: 0, y: -10, heroId: null, hero: null,
    owner: { id: 'p1', faction: 'ROME', technologies: [], alliance: { allianceId: 'A1' }, cities: [] } }, units);
  units.push({ id: 'u-a11', armyId: 'a11', unitKey: 'ROM_INF_MILICIEN', tier: 'base', count: 50 });
  const db = breakDb({ armies: [attacker, ...garrison, newcomer], bastions: [{ ...BASTION }], members: MEMBERS, diplomacy: DIPLOMACY, units });
  const sentHome = [];
  // armyProcessor.sendArmyHome : sans soldats, posée aussitôt dans sa ville ; sinon en route
  const sendArmyHome = async (a) => {
    sentHome.push(a.id);
    const row = db.army(a.id);
    Object.assign(row, row.units.some(u => u.count > 0) ? { status: 'RETURNING', missionType: 'RETURN', targetBastionId: null } : { status: 'IDLE', missionType: null, targetBastionId: null, x: 0, y: -10 });
  };
  try {
    assert.equal(await db.tx.army.count({ where: bastion.garrisonWhere('b1') }), B.maxGarrisonArmies - 1, 'l\'armée déjà vide ne compte plus');
    await bastion.handleBastionBattle(db.army('solo'), new Date(), sendArmyHome);
    await new Promise(r => setImmediate(r));
    assert.equal(db.units.filter(u => u.armyId.startsWith('g')).length, 0, 'la garnison est anéantie');
    assert.deepEqual(sentHome.sort(), ['solo', 'vieille', ...garrison.slice(0, -1).map(g => g.id)].sort(), 'l\'assaillant et toutes les armées vides rentrent');
    for (const g of garrison) assert.deepEqual([db.army(g.id).status, db.army(g.id).targetBastionId], ['IDLE', null], g.id);
    for (const owner of ['p1', 'p2', 'p6']) assert.ok(db.notes.some(n => n.playerId === owner && n.body.includes('sa place en garnison est libérée')), owner);
    assert.ok(!db.reports.some(r => r.playerId === 'p6'), 'l\'armée déjà vide n\'a pas combattu : pas de rapport');
    assert.equal(await db.tx.army.count({ where: bastion.garrisonWhere('b1') }), 0, 'plus aucune place prise');
    // une 11e armée part pour le Bastion, puis y entre
    await bastion.send('p1', 'b1', { armyId: 'a11', mission: 'GARRISON' });
    assert.equal(db.army('a11').status, 'SUPPORTING');
    await bastion.handleGarrisonArrival(db.army('a11'), sendArmyHome);
    assert.equal(db.army('a11').status, 'STATIONED');
  } finally { db.restore(); }
});

test('tick : une armée de la garnison déjà vide (monde d\'avant le correctif) rentre dans sa ville ; une armée avec des soldats reste', async () => {
  const units = [{ id: 'u-pleine', armyId: 'pleine', unitKey: 'ROM_INF_MILICIEN', tier: 'base', count: 10 }];
  const cities = [home('c-p1', 0), home('c-p2', -30)].map(c => ({ ...c, playerId: c.id.slice(2) }));
  const armies = [garrisonRow('vide1', 'p1', units), garrisonRow('vide2', 'p2', units), garrisonRow('pleine', 'p1', units)];
  const db = breakDb({ armies, bastions: [{ ...BASTION, isSieged: false }], members: MEMBERS, diplomacy: DIPLOMACY, units, cities });
  try {
    assert.equal(await bastion.releaseOrphanGarrisons(), 2);
    await new Promise(r => setImmediate(r));
    for (const [id, x] of [['vide1', 0], ['vide2', -30]]) {
      const a = db.army(id);
      assert.deepEqual([a.status, a.targetBastionId, a.missionType, a.x, a.y], ['IDLE', null, null, x, -10], `${id} posée dans sa ville`);
    }
    assert.deepEqual([db.army('pleine').status, db.army('pleine').targetBastionId], ['STATIONED', 'b1']);
    for (const owner of ['p1', 'p2']) assert.ok(db.notes.some(n => n.playerId === owner && n.body.includes('sa place en garnison est libérée')), owner);
  } finally { db.restore(); }
});
