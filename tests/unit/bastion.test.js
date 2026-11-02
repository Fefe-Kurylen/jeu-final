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

test('mur bouclier : 1,8 fois un mur de niveau 20, réparé en 12 h (décision du 2 novembre 2026, G2 ; 3 fois avant), garnison de 10 armées au plus', () => {
  assert.equal(config.bastion.wallMultiplier, 1.8);
  assert.equal(bastion.wallMaxHp(), config.combat.wallHpPerLevel * 20 * 1.8);
  assert.equal(bastion.wallMaxHp(), 36000);
  assert.equal(config.bastion.wallRepairHours, 12);
  assert.equal(config.bastion.maxGarrisonArmies, 10);
});

// E3 (décision du 1er novembre 2026, simulation de 200 jours) : aucune vie ne revient pendant 24 h après un assaut gagné
const H = 3600000;
test('vies : rien ne remonte pendant 24 h après la dernière vie perdue, puis de 0 à 10 en 72 h, jamais au-delà (E3)', () => {
  assert.equal(config.bastion.regenPauseHours, 24);
  assert.equal(config.bastion.regenHours, 72);
  const at = new Date('2026-10-26T00:00:00Z');
  const b = { structure: 0.5, structureAt: at };
  assert.equal(bastion.structureNow(b, at.getTime()), 0.5);
  assert.equal(bastion.structureNow(b, at.getTime() + 23.9 * H), 0.5, 'pendant la pause, rien ne revient');
  assert.equal(bastion.structureNow(b, at.getTime() + 24 * H), 0.5);
  assert.ok(Math.abs(bastion.structureNow(b, at.getTime() + (24 + 36) * H) - 1) < 1e-9);   // 36 h = la moitié de 72 h
  assert.equal(bastion.structureNow(b, at.getTime() + 200 * H), 1);
  assert.ok(Math.abs(bastion.structureNow({ structure: 0, structureAt: at }, at.getTime() + (24 + 7.2) * H) - 0.1) < 1e-9);   // une vie en 7,2 h après la pause
  assert.equal(bastion.structureNow({ structure: 1, structureAt: at }, at.getTime()), 1, 'toutes les vies là');
});

test('vies : fin de la pause et prochaine vie pour le panneau et la carte (E3)', () => {
  const at = new Date('2026-11-01T00:00:00Z').getTime();
  const b = { status: 'ACTIVE', structure: 0.7, structureAt: new Date(at) };   // 7 vies, la 3e perdue à `at`
  let v = bastion.regenView(b, at + 1 * H);
  assert.equal(v.regenPausedUntil.getTime(), at + 24 * H);
  assert.equal(v.nextLifeAt.getTime(), at + 24 * H + 7.2 * H);
  v = bastion.regenView(b, at + 30 * H);   // la pause finie, la 8e vie remonte
  assert.equal(v.regenPausedUntil, null);
  assert.ok(Math.abs(v.nextLifeAt.getTime() - (at + 31.2 * H)) < 1000);
  v = bastion.regenView(b, at + 32 * H);   // 8 vies : la 9e
  assert.equal(bastion.livesOf(bastion.structureNow(b, at + 32 * H)), 8);
  assert.ok(Math.abs(v.nextLifeAt.getTime() - (at + 38.4 * H)) < 1000);
  assert.deepEqual(bastion.regenView({ ...b, structure: 1 }, at), { regenPausedUntil: null, nextLifeAt: null }, 'toutes les vies là');
  assert.deepEqual(bastion.regenView({ ...b, status: 'FUNDING' }, at), { regenPausedUntil: null, nextLifeAt: null }, 'un chantier n\'a pas de vies');
  assert.deepEqual(bastion.regenView(b, at + 100 * H), { regenPausedUntil: null, nextLifeAt: null }, 'remonté');
});

test('briser le siège ensemble (E4) : les armées de la même minute, réglé dans la configuration', () => {
  assert.equal(config.bastion.breakGroupSeconds, 60);
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
      if ('lt' in v) return row[k] < v.lt;
      if ('lte' in v) return row[k] <= v.lte;
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
    aggregate: async ({ where }) => ({ _sum: { count: units.filter(u => matches(u, where)).reduce((t, u) => t + u.count, 0) } }),   // blessés ramenés, chute du héros
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

// Un camp chassé rentre : en marche s'il lui reste des soldats ; anéanti (le moteur de bataille va souvent jusqu'au bout,
// décision du 2 novembre 2026, G3), il ne marche plus et sendArmyHome le pose aussitôt dans sa ville. Jamais vide devant le Bastion.
function chased(db, id, sentHome) {
  const a = db.army(id);
  const men = (a.units || []).some(u => u.count > 0);
  return a.rallyId === null && a.targetBastionId === null && (men ? a.status === 'RETURNING' && a.missionType === 'RETURN' : a.status === 'IDLE' && sentHome.includes(id));
}

test('briser le siège gagné : le camp (rassemblement de plusieurs joueurs ou armée seule) rentre, le Bastion n\'est plus assiégé, l\'assaut n\'a pas lieu', async () => {
  require('../../frontend/js/shared/terrain.js').setWorldSeed(0);
  for (const camp of [[siegeCamp('lead', 'p7', 30, 'r1'), siegeCamp('mate', 'p8', 30, 'r1'), siegeCamp('mate2', 'p9', 30, 'r1')], [siegeCamp('solo', 'p7', 30)]]) {
    const army = breaker('a-p2', 'p2', 3000, { status: 'ATTACKING', missionType: 'BASTION_BREAK', targetBastionId: 'b1', targetX: 4, targetY: -10, x: 4 });
    const db = breakDb({ armies: [...camp, army], bastions: [{ ...BASTION }], members: MEMBERS, diplomacy: DIPLOMACY, units: army.units.map(u => ({ ...u })) });
    const sentHome = [];
    try {
      const stale = camp.map(c => ({ ...c }));   // lus par le tick avant le combat
      await bastion.handleBreakArrival(army, new Date(), async (a) => { sentHome.push(a.id); });
      for (const c of camp) assert.ok(chased(db, c.id, sentHome), `${c.id} rentre, sorti du rassemblement : ${JSON.stringify(db.army(c.id))}`);
      assert.equal((await db.tx.bastion.findUnique({ where: { id: 'b1' } })).isSieged, false, 'plus de camp : plus de siège');
      assert.deepEqual([db.army('a-p2').status, db.army('a-p2').x, db.army('a-p2').targetBastionId], ['IDLE', 4, null], 'le vainqueur garde le Bastion devant ses murs');
      assert.ok(sentHome.every(id => camp.some(c => c.id === id)), 'seules les armées anéanties du camp sont posées chez elles');
      const homeCount = sentHome.length;
      assert.equal(db.reports.length, 1 + camp.length, 'un rapport par joueur');
      // l'heure du camp passée, le tick (qui l'avait lu avant) n'en tire aucun assaut : le Bastion ne perd rien
      for (const c of stale) await bastion.handleBastionBattle(c, new Date(), async (a) => { sentHome.push(a.id); });
      assert.equal(sentHome.length, homeCount, 'aucune armée renvoyée une seconde fois');
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

// ---- décisions du 1er novembre 2026 (simulation de 200 jours) ----
// E1 : un convoi vers le Bastion se paie sur le stock commun du joueur, sous les verrous de ses villes puis du Bastion
test('ravitaillement (E1) : la ville de l\'armée d\'abord, puis la plus pleine des autres ; villes verrouillées avant le Bastion', async () => {
  require('../../frontend/js/shared/terrain.js').setWorldSeed(0);
  const city = { id: 'c1', x: 0, y: -10, isSieged: false, buildings: [] };
  const army = { id: 'a1', ownerId: 'p1', name: 'Convoi', cityId: 'c1', city, isGarrison: false, status: 'IDLE', x: 0, y: -10, hero: null,
    units: [{ unitKey: 'ROM_INF_MILICIEN', tier: 'base', count: 500 }], owner: { id: 'p1', faction: 'ROME', technologies: [], alliance: { allianceId: 'A1' }, cities: [] } };
  // la capitale (ville de l'armée) a peu de bois ; c2 est la plus pleine (90 %), c3 la plus riche (30 %)
  const stock = (id, wood, maxStorage, isCapital = false) => ({ id, wood, stone: 0, iron: 0, food: 0, maxStorage, maxFoodStorage: 10000, isCapital });
  for (const [wood, ok] of [[1000, true], [5000, false]]) {
    const db = fakeDb({ armies: [{ ...army }], bastions: [{ id: 'b1', allianceId: 'A1', status: 'FUNDING', isSieged: false, x: 4, y: -10, wood: 0, stone: 0, iron: 0, food: 0, alliance: { tag: 'TAG', name: 'Alliance' } }], members: [{ playerId: 'p1', allianceId: 'A1' }] });
    const locks = [], debits = [];
    db.tx.$queryRaw = async (sql) => {
      const text = sql.join('?');
      locks.push(text.includes('"playerId"') ? 'villes' : text.includes('"Bastion"') ? 'bastion' : text.includes('"City"') ? 'ville' : '?');
      return text.includes('"playerId"') ? [stock('c1', 100, 10000, true), stock('c2', 900, 1000), stock('c3', 3000, 10000)] : [];
    };
    db.tx.$executeRaw = async (sql, w, s, i, f, cityId) => { debits.push([cityId, w]); return 1; };
    try {
      const send = bastion.send('p1', 'b1', { armyId: 'a1', mission: 'SUPPLY', resources: { wood } });
      if (!ok) {
        await assert.rejects(send, (e) => e.status === 400 && /^Ressources insuffisantes : il manque .+ de bois \(toutes vos villes comprises\)$/.test(e.message));
        assert.deepEqual(debits, [], 'rien n\'est débité');
        assert.equal(db.army('a1').status, 'IDLE');
        continue;
      }
      await send;
      assert.deepEqual(debits, [['c1', 100], ['c2', 900]], 'la ville de l\'armée, puis la plus pleine');
      assert.deepEqual([db.army('a1').status, db.army('a1').missionType, db.army('a1').carryWood], ['TRANSPORTING', 'BASTION_SUPPLY', 1000]);
      assert.equal(locks[0], 'villes', 'toutes les villes du joueur d\'abord');
      assert.ok(locks.indexOf('bastion') > 0, 'puis le Bastion');
    } finally { db.restore(); }
  }
});

// E3 : un assaut repoussé n'écrit rien ; un assaut gagné ôte une vie et relance la pause de 24 h
test('assaut (E3) : repoussé, ni les vies ni la pause ne changent ; gagné, une vie de moins et la pause repart de l\'assaut', async () => {
  require('../../frontend/js/shared/terrain.js').setWorldSeed(0);
  const before = new Date(Date.now() - 10 * H);   // 5 vies, la dernière perdue il y a 10 h : en pause
  for (const [won, atk, guards] of [[false, 5, 500], [true, 2000, 2]]) {
    const units = [{ id: 'u-s', armyId: 'solo', unitKey: 'GAU_INF_GUERRIER', tier: 'base', count: atk }, { id: 'r-s', armyId: 'solo', unitKey: 'GAU_SIEGE_BELIER', tier: 'base', count: won ? 1000 : 1 },
      { id: 'u-g', armyId: 'g', unitKey: 'ROM_INF_LEGIONNAIRE', tier: 'elite', count: guards }];
    const attacker = siegeCamp('solo', 'p7', 0);
    delete attacker.units;
    withUnits(attacker, units);
    const db = breakDb({ armies: [attacker, garrisonRow('g', 'p1', units)], bastions: [{ ...BASTION, structure: 0.5, structureAt: before }], members: MEMBERS, diplomacy: DIPLOMACY, units });
    const now = new Date();
    try {
      await bastion.handleBastionBattle(db.army('solo'), now, async () => {});
      await new Promise(r => setImmediate(r));
      const b = await db.tx.bastion.findUnique({ where: { id: 'b1' } });
      assert.equal(db.reports[0].winner, won ? 'ATTACKER' : 'DEFENDER');
      assert.deepEqual(db.reports[0].loot.lives, { before: 5, after: won ? 4 : 5, total: 10, fallen: false });
      if (won) assert.deepEqual([b.structure, b.structureAt], [0.4, now], 'une vie de moins, la pause repart');
      else assert.deepEqual([b.structure, b.structureAt], [0.5, before], 'la pause continue depuis la dernière vie perdue');
      if (won) assert.ok(db.notes.some(n => n.playerId === 'p7' && n.body.includes('aucune ne revient avant 24 h sans assaut gagné')), JSON.stringify(db.notes.map(n => n.body)));
    } finally { db.restore(); }
  }
});

// E4 : les armées du côté du Bastion qui atteignent le camp dans la même minute se battent ensemble
const T0 = Date.now();
const breakArrival = (id, ownerId, count, inSeconds, extra = {}) => breaker(id, ownerId, count, { status: 'ATTACKING', missionType: 'BASTION_BREAK', targetBastionId: 'b1', targetX: 4, targetY: -10, x: 0, claimedAt: null, arrivalAt: new Date(T0 + inSeconds * 1000), ...extra });
const sortieArrival = (id, ownerId, count, inSeconds) => breakArrival(id, ownerId, count, inSeconds, { missionType: 'BASTION_SORTIE', x: 4 });
// une armée d'un joueur d'une alliance neutre (ni du côté du Bastion, ni de celui du camp)
const neutralArrival = (id, count, inSeconds) => ({ ...breakArrival(id, 'p1', count, inSeconds), ownerId: 'p6', owner: { id: 'p6', name: 'p6', faction: 'ROME', technologies: [], alliance: { allianceId: 'N1' }, cities: [] } });
const rallyCamp = () => [siegeCamp('lead', 'p7', 100, 'r1'), siegeCamp('mate', 'p8', 100, 'r1'), siegeCamp('mate2', 'p9', 100, 'r1')];
function groupBreakDb(breakers, cities = []) {
  const now = new Date(T0);
  breakers[0].claimedAt = now;   // l'armée qui arrive la première, réservée par le tick
  const db = breakDb({ armies: [...rallyCamp(), ...breakers], bastions: [{ ...BASTION }], members: [...MEMBERS, { playerId: 'p6', allianceId: 'N1' }], diplomacy: DIPLOMACY, units: breakers.flatMap(a => a.units.map(u => ({ ...u }))), cities });
  return { db, now };
}
const unitsOf = (db, id) => db.units.filter(u => u.armyId === id).reduce((t, u) => t + u.count, 0);

test('briser le siège ensemble (E4) : une armée et une sortie alliée dans la même minute chassent un camp que chacune seule ne chasse pas', async () => {
  require('../../frontend/js/shared/terrain.js').setWorldSeed(0);
  // 50 légionnaires seuls perdent contre 300 guerriers ; 2 × 50 gagnent
  const lead = breakArrival('a-p1', 'p1', 50, 0);
  const breakers = [lead, sortieArrival('g-p2', 'p2', 50, 20), breakArrival('late', 'p1', 50, 120), neutralArrival('n-p6', 50, 10)];
  const { db, now } = groupBreakDb(breakers);
  const sentHome = [];
  try {
    await bastion.handleBreakArrival({ ...lead }, now, async (a) => { sentHome.push(a.id); });
    for (const c of ['lead', 'mate', 'mate2']) assert.ok(chased(db, c, sentHome), `${c} chassé`);
    assert.equal((await db.tx.bastion.findUnique({ where: { id: 'b1' } })).isSieged, false);
    assert.deepEqual([db.army('a-p1').status, db.army('a-p1').x, db.army('a-p1').targetBastionId], ['IDLE', 4, null], 'l\'armée du dehors garde le Bastion');
    assert.deepEqual([db.army('g-p2').status, db.army('g-p2').missionType, db.army('g-p2').targetBastionId], ['STATIONED', 'BASTION_GARRISON', 'b1'], 'la sortie rentre au Bastion');
    assert.deepEqual([db.army('late').status, db.army('late').claimedAt], ['ATTACKING', null], 'arrivée 2 min après : elle se battra seule');
    assert.deepEqual([db.army('n-p6').status, db.army('n-p6').claimedAt], ['ATTACKING', null], 'un joueur d\'une alliance neutre se bat seul');
    assert.ok(sentHome.every(id => ['lead', 'mate', 'mate2'].includes(id)), 'seules les armées anéanties du camp sont posées chez elles');
    // un seul combat : un rapport par joueur (les deux du groupe, les trois du camp) ; chaque armée perd la même part
    assert.equal(db.reports.length, 5);
    assert.equal(db.reports[0].loot.armies, 2);
    assert.equal(db.reports[0].attackerUnits[0].count, 100, 'les soldats des deux armées ensemble');
    const left = unitsOf(db, 'a-p1');
    assert.ok(left > 0 && left < 50);
    assert.ok(Math.abs(unitsOf(db, 'g-p2') - left) <= 1, 'la même part de pertes (les morts d\'un type se partagent au plus fort reste, G3)');
    for (const id of ['p1', 'p2']) assert.ok(db.notes.some(n => n.playerId === id && n.title === '⚔️ Siège brisé' && n.body.includes('(2 armées ensemble)')), id);
  } finally { db.restore(); }
});

test('briser le siège ensemble (E4) : la même sortie 2 min plus tard ne se joint pas, l\'armée seule est repoussée', async () => {
  require('../../frontend/js/shared/terrain.js').setWorldSeed(0);
  const lead = breakArrival('a-p1', 'p1', 50, 0);
  const { db, now } = groupBreakDb([lead, sortieArrival('g-p2', 'p2', 50, 120)]);
  const sentHome = [];
  try {
    await bastion.handleBreakArrival({ ...lead }, now, async (a) => { sentHome.push(a.id); });
    assert.deepEqual(sentHome, ['a-p1'], 'vaincue, elle rentre');
    assert.deepEqual(['lead', 'mate', 'mate2'].map(c => db.army(c).status), ['BESIEGING', 'BESIEGING', 'BESIEGING']);
    assert.deepEqual([db.army('g-p2').status, db.army('g-p2').claimedAt], ['ATTACKING', null]);
    assert.equal(db.reports.length, 4, 'un attaquant, trois joueurs du camp');
    assert.equal(db.reports[0].loot.armies, undefined);
  } finally { db.restore(); }
});

test('briser le siège ensemble (E4) : un groupe vaincu, chaque armée rentre (la sortie à sa capitale si une place y est libre)', async () => {
  require('../../frontend/js/shared/terrain.js').setWorldSeed(0);
  const lead = breakArrival('a-p1', 'p1', 20, 0);
  const capital = { id: 'cap-p2', playerId: 'p2', name: 'Roma', x: -30, y: -10, isCapital: true, buildings: [{ key: 'RALLY_POINT', level: 1 }] };
  const { db, now } = groupBreakDb([lead, sortieArrival('g-p2', 'p2', 20, 30)], [capital]);
  const sentHome = [];
  try {
    await bastion.handleBreakArrival({ ...lead }, now, async (a) => { sentHome.push([a.id, a.cityId]); });
    assert.deepEqual(sentHome, [['a-p1', 'c-p1'], ['g-p2', 'cap-p2']]);
    assert.deepEqual([db.army('g-p2').cityId, db.army('g-p2').slot], ['cap-p2', 1], 'la sortie prend la place libre de sa capitale');
    assert.equal(db.reports.length, 5, 'un seul combat pour les deux armées');
    assert.ok(db.notes.some(n => n.playerId === 'p2' && n.body.includes('(2 armées ensemble) : les survivants rentrent à Roma')), JSON.stringify(db.notes.map(n => n.body)));
    assert.deepEqual(['lead', 'mate', 'mate2'].map(c => db.army(c).status), ['BESIEGING', 'BESIEGING', 'BESIEGING']);
  } finally { db.restore(); }
});

// E2 (armées rattachées aux colonies) : une sortie vaincue d'une armée de colonie rentre à sa colonie, elle n'est pas
// détachée en prenant la place libre de la capitale (seul « Renvoyer à la capitale » le fait)
test('briser le siège ensemble (E4, E2) : une sortie vaincue rattachée à une colonie rentre à sa colonie, pas à la capitale', async () => {
  require('../../frontend/js/shared/terrain.js').setWorldSeed(0);
  const lead = breakArrival('a-p1', 'p1', 20, 0);
  const sortie = { ...sortieArrival('g-p2', 'p2', 20, 30), slot: 3 };
  const capital = { id: 'cap-p2', playerId: 'p2', name: 'Roma', x: -30, y: -10, isCapital: true, buildings: [{ key: 'RALLY_POINT', level: 1 }] };
  const colony = { id: 'c-p2', playerId: 'p2', name: 'Ostia', x: -20, y: -10, isCapital: false, buildings: [] };
  const { db, now } = groupBreakDb([lead, sortie], [capital, colony]);
  const sentHome = [];
  try {
    await bastion.handleBreakArrival({ ...lead }, now, async (a) => { sentHome.push([a.id, a.cityId]); });
    assert.deepEqual(sentHome, [['a-p1', 'c-p1'], ['g-p2', 'c-p2']]);
    assert.deepEqual([db.army('g-p2').cityId, db.army('g-p2').slot], ['c-p2', 3], 'toujours rattachée à sa colonie, même emplacement');
    assert.ok(db.notes.some(n => n.playerId === 'p2' && /\(2 armées ensemble\) : les survivants rentrent\.$/.test(n.body)), JSON.stringify(db.notes.map(n => n.body)));
  } finally { db.restore(); }
});

// ---- règle des blessés (simulation de 200 jours, novembre 2026) : un assaut de Bastion en donne aux deux camps, comme
// l'assaut d'une ville et le camp brisé ; chaque armée ramène les siens chez elle, une armée anéantie ne ramène personne ----
test('assaut : blessés des deux camps, ramenés par chaque armée (Tente de la capitale, Médecine de son joueur) ; une armée anéantie n\'en ramène pas', async () => {
  require('../../frontend/js/shared/terrain.js').setWorldSeed(0);
  const WD = require('../../src/services/woundedService');
  const TENT = [{ key: 'HEALING_TENT', level: 5 }];   // 45 % : sous le plafond de 70 %, la Médecine se voit
  const rateOf = (faction, medicine = 0) => WD.woundedRate(TENT, faction, medicine * 0.5);
  // garnison chargée comme en vrai : propriétaire sans ses technologies (lues à part)
  const guard = (id, ownerId, units) => garrisonRow(id, ownerId, units, { owner: { id: ownerId, name: ownerId, faction: 'ROME', alliance: { allianceId: MEMBERS.find(m => m.playerId === ownerId).allianceId } } });
  for (const won of [true, false]) {
    // gagné : 600 légionnaires (p1) tombent tous ; repoussé : 1200 (p1) et 800 (p2, Médecine 10) perdent des soldats quand le mur tombe
    const units = [{ id: 'u-s', armyId: 'solo', unitKey: 'GAU_INF_GUERRIER', tier: 'base', count: 2000 }, { id: 'r-s', armyId: 'solo', unitKey: 'GAU_SIEGE_BELIER', tier: 'base', count: 1000 },
      ...(won ? [['g1', 600]] : [['g1', 1200], ['g2', 800]]).map(([armyId, count]) => ({ id: `u-${armyId}`, armyId, unitKey: 'ROM_INF_LEGIONNAIRE', tier: 'elite', count }))];
    const before = Object.fromEntries(units.map(u => [u.id, u.count]));
    const attacker = siegeCamp('solo', 'p7', 0);
    delete attacker.units;
    withUnits(attacker, units);
    const garrison = won ? [guard('g1', 'p1', units)] : [guard('g1', 'p1', units), guard('g2', 'p2', units)];
    const db = breakDb({ armies: [attacker, ...garrison], bastions: [{ ...BASTION, structure: 0.5, structureAt: new Date(Date.now() - 30 * H) }], members: MEMBERS, diplomacy: DIPLOMACY, units });
    prisma.city.findFirst = async () => ({ buildings: TENT });   // capitale de chaque joueur (calculateWoundedUnits)
    db.tx.playerTechnology = { findMany: async ({ where }) => (where.playerId === 'p2' ? [{ techKey: 'MEDICINE', level: 10 }] : []) };
    try {
      await bastion.handleBastionBattle(db.army('solo'), new Date(), async () => {});
      await new Promise(r => setImmediate(r));
      assert.equal(db.reports[0].winner, won ? 'ATTACKER' : 'DEFENDER');
      const lost = (id) => before[id] - (db.units.find(u => u.id === id)?.count || 0);
      const carried = (armyId) => Object.fromEntries((db.army(armyId).woundedCarry || []).map(w => [w.unitKey, w.count]));
      if (won) {
        assert.ok(lost('u-s') > 0 && lost('r-s') > 0, 'l\'assaillant a perdu des soldats');
        assert.deepEqual(carried('solo'), { GAU_INF_GUERRIER: Math.floor(lost('u-s') * rateOf('GAUL')), GAU_SIEGE_BELIER: Math.floor(lost('r-s') * rateOf('GAUL')) }, 'l\'assaillant ramène ses blessés');
        assert.deepEqual(carried('g1'), {}, 'garnison anéantie : personne à ramener');
      } else {
        assert.deepEqual(carried('solo'), {}, 'assaillant anéanti : personne à ramener');
        assert.ok(lost('u-g1') > 0 && lost('u-g2') > 0, 'le mur tombé, la garnison a perdu des soldats');
        assert.deepEqual(carried('g1'), { ROM_INF_LEGIONNAIRE: Math.floor(lost('u-g1') * rateOf('ROME')) });
        assert.deepEqual(carried('g2'), { ROM_INF_LEGIONNAIRE: Math.floor(lost('u-g2') * rateOf('ROME', 10)) }, 'la Médecine de son propre joueur');
        assert.ok(carried('g2').ROM_INF_LEGIONNAIRE > Math.floor(lost('u-g2') * rateOf('ROME')));
      }
    } finally { db.restore(); }
  }
});

// ---- G2 (décision du 2 novembre 2026, deuxième simulation de 200 jours) : mur de 36 000 PV qui garde ses dégâts et
// redevient plein 12 h après le dernier, en ligne droite ; lu par l'assaut, le panneau et la carte ----
test('mur (G2) : il garde ses dégâts et se répare en ligne droite, plein 12 h après le dernier dégât', () => {
  const max = bastion.wallMaxHp(), at = new Date('2026-11-02T00:00:00Z').getTime();
  assert.equal(bastion.wallNow({ status: 'ACTIVE', wallHp: null, wallAt: null }, at), max, 'jamais touché : plein');
  const b = { status: 'ACTIVE', wallHp: 6000, wallAt: new Date(at) };
  assert.equal(bastion.wallNow(b, at), 6000);
  assert.equal(bastion.wallNow(b, at + 6 * H), 21000, '6 h : la moitié des 30 000 PV manquants');
  assert.equal(bastion.wallNow(b, at + 12 * H), max);
  assert.equal(bastion.wallNow(b, at + 40 * H), max);
  assert.equal(bastion.wallNow({ ...b, wallHp: 0 }, at + 3 * H), 9000, 'abattu : un quart en 3 h');
  assert.equal(bastion.wallNow({ ...b, wallHp: 99999 }, at), max, 'jamais au-delà du plein (multiplicateur baissé depuis)');
  assert.equal(bastion.wallFullAt(b, at + H).getTime(), at + 12 * H);
  assert.equal(bastion.wallFullAt(b, at + 12 * H), null);
  assert.deepEqual(bastion.wallView(b, at + 6 * H), { wallHp: 21000, wallMaxHp: max, wallFullAt: new Date(at + 12 * H) });
  assert.deepEqual(bastion.wallView({ status: 'ACTIVE' }, at), { wallHp: max, wallMaxHp: max, wallFullAt: null });
  assert.deepEqual(bastion.wallView({ ...b, status: 'FUNDING' }, at), { wallHp: null, wallMaxHp: max, wallFullAt: null }, 'un chantier n\'a pas de mur');
});

test('assaut (G2) : repoussé ou gagné, le mur garde ses dégâts (PV et instant notés) ; les vies ne changent qu\'avec un assaut gagné', async () => {
  require('../../frontend/js/shared/terrain.js').setWorldSeed(0);
  const before = new Date(Date.now() - 10 * H);
  for (const [won, atk, rams, guards] of [[false, 5, 1, 500], [true, 2000, 1000, 2]]) {
    const units = [{ id: 'u-s', armyId: 'solo', unitKey: 'GAU_INF_GUERRIER', tier: 'base', count: atk }, { id: 'r-s', armyId: 'solo', unitKey: 'GAU_SIEGE_BELIER', tier: 'base', count: rams },
      { id: 'u-g', armyId: 'g', unitKey: 'ROM_INF_LEGIONNAIRE', tier: 'elite', count: guards }];
    const attacker = siegeCamp('solo', 'p7', 0);
    delete attacker.units;
    withUnits(attacker, units);
    const db = breakDb({ armies: [attacker, garrisonRow('g', 'p1', units)], bastions: [{ ...BASTION, structure: 0.5, structureAt: before, wallHp: null, wallAt: null }], members: MEMBERS, diplomacy: DIPLOMACY, units });
    const now = new Date();
    try {
      await bastion.handleBastionBattle(db.army('solo'), now, async () => {});
      await new Promise(r => setImmediate(r));
      const b = await db.tx.bastion.findUnique({ where: { id: 'b1' } });
      const loot = db.reports[0].loot;
      assert.equal(db.reports[0].winner, won ? 'ATTACKER' : 'DEFENDER');
      assert.equal(loot.wallHpStart, 36000, 'un mur jamais touché part plein (les vies n\'y entrent plus)');
      assert.ok(loot.wallHpEnd < 36000, `mur abîmé : ${loot.wallHpEnd}`);
      if (won) assert.equal(loot.wallHpEnd, 0, 'abattu');
      assert.deepEqual([Math.round(b.wallHp), b.wallAt], [loot.wallHpEnd, now], 'ses PV et l\'instant du dégât sont notés');
      assert.equal(loot.wallFullAt.getTime(), now.getTime() + 12 * H, 'de nouveau plein 12 h après');
      assert.deepEqual([b.structure, b.structureAt], won ? [0.4, now] : [0.5, before], 'une vie de moins seulement si l\'assaut est gagné');
      for (const id of ['p7', 'p1']) assert.ok(db.notes.some(n => n.playerId === id && n.body.includes(`Le mur garde ses dégâts : ${loot.wallHpEnd.toLocaleString('fr-FR')} / 36\u202f000 PV, de nouveau plein dans 12 h s'il n'est plus touché.`)), JSON.stringify(db.notes.map(n => n.body)));
    } finally { db.restore(); }
  }
});

test('assaut (G2) : le suivant part du mur réparé depuis ; un assaut sans engin ne l\'abîme pas et n\'arrête pas la réparation', async () => {
  require('../../frontend/js/shared/terrain.js').setWorldSeed(0);
  const now = new Date(), hitAt = new Date(now.getTime() - 6 * H);   // 10 000 PV il y a 6 h : 23 000 maintenant
  for (const rams of [1, 0]) {
    const units = [{ id: 'u-s', armyId: 'solo', unitKey: 'GAU_INF_GUERRIER', tier: 'base', count: 5 }, ...(rams ? [{ id: 'r-s', armyId: 'solo', unitKey: 'GAU_SIEGE_BELIER', tier: 'base', count: rams }] : []),
      { id: 'u-g', armyId: 'g', unitKey: 'ROM_INF_LEGIONNAIRE', tier: 'elite', count: 500 }];
    const attacker = siegeCamp('solo', 'p7', 0);
    delete attacker.units;
    withUnits(attacker, units);
    const db = breakDb({ armies: [attacker, garrisonRow('g', 'p1', units)], bastions: [{ ...BASTION, wallHp: 10000, wallAt: hitAt }], members: MEMBERS, diplomacy: DIPLOMACY, units });
    try {
      await bastion.handleBastionBattle(db.army('solo'), now, async () => {});
      await new Promise(r => setImmediate(r));
      const b = await db.tx.bastion.findUnique({ where: { id: 'b1' } });
      const loot = db.reports[0].loot;
      assert.equal(loot.wallHpStart, 23000, 'la moitié des 26 000 PV manquants réparée en 6 h');
      if (rams) {
        assert.ok(loot.wallHpEnd < 23000);
        assert.deepEqual([Math.round(b.wallHp), b.wallAt], [loot.wallHpEnd, now], 'la réparation repart de cet assaut');
      } else {
        assert.equal(loot.wallHpEnd, 23000, 'les soldats ne frappent pas le mur');
        assert.deepEqual([b.wallHp, b.wallAt], [10000, hitAt], 'rien n\'est écrit : la réparation commencée il y a 6 h continue');
        assert.equal(loot.wallFullAt.getTime(), hitAt.getTime() + 12 * H);
      }
    } finally { db.restore(); }
  }
});

test('vue du Bastion et carte (G2) : PV du mur maintenant, au plus, et heure où il sera plein ; règles avec la réparation', async () => {
  const hitAt = new Date(Date.now() - 6 * H);
  const b = { id: 'b1', allianceId: 'A1', status: 'ACTIVE', isSieged: false, x: 5, y: 5, structure: 1, structureAt: new Date(), wallHp: 6000, wallAt: hitAt, alliance: { id: 'A1', tag: 'DEF', name: 'Défenseurs', leaderId: 'p1' } };
  const db = fakeDb({ bastions: [b], members: [{ playerId: 'p1', allianceId: 'A1', role: 'MEMBER', alliance: { bastion: b, _count: { members: 16 } } }] });
  const savedPlayer = prisma.player;
  prisma.player = { findMany: async () => [{ id: 'p1', faction: 'ROME' }] };
  try {
    const v = await bastion.bastionFor('p1');
    assert.ok(Math.abs(v.bastion.wallHp - 21000) <= 1, String(v.bastion.wallHp));
    assert.equal(v.bastion.wallMaxHp, 36000);
    assert.equal(v.bastion.wallFullAt.getTime(), hitAt.getTime() + 12 * H);
    assert.equal(v.rules.wallRepairHours, 12);
    assert.equal(v.rules.wallMaxHp, 36000);
    const [tile] = await bastion.bastionsIn(0, 10, 0, 10);
    assert.ok(Math.abs(tile.wallHp - 21000) <= 1);
    assert.deepEqual([tile.wallMaxHp, tile.wallFullAt.getTime()], [36000, hitAt.getTime() + 12 * H]);
  } finally { prisma.player = savedPlayer; db.restore(); }
});

test('chantier achevé (G2) : toutes ses vies et un mur neuf, même abîmé pendant le chantier', async () => {
  const b = { id: 'b1', allianceId: 'A1', status: 'BUILDING', buildEndsAt: new Date(Date.now() - 1000), structure: 0.3, structureAt: new Date(0), wallHp: 100, wallAt: new Date(), isSieged: false, x: 1, y: 1 };
  const db = fakeDb({ bastions: [b], members: [{ playerId: 'p1', allianceId: 'A1' }] });
  const saved = prisma.$executeRaw;
  prisma.$executeRaw = async () => 0;   // drapeaux de siège recalculés (syncSieged)
  try {
    await bastion.processBastions(new Date());
    assert.deepEqual([b.status, b.structure, b.wallHp, b.wallAt], ['ACTIVE', 1, null, null]);
    assert.equal(bastion.wallNow(b), bastion.wallMaxHp());
  } finally { prisma.$executeRaw = saved; db.restore(); }
});
