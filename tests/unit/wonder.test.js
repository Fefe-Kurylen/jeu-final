// Cycle du serveur et Merveille (décision du 28 octobre 2026) : calendrier du monde, coût et durée des niveaux, Immortels
require('./_env');
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://unit:unit@localhost:5432/unit';   // le client Prisma est créé, jamais interrogé
const test = require('node:test');
const assert = require('node:assert/strict');
const W = require('../../src/services/wonderService');
const HOF = require('../../src/services/hallOfFameService');
const { world } = require('../../src/config');

const DAY = 86400000;
const opened = new Date('2026-01-01T00:00:00Z');

test('calendrier : inscriptions 60 jours, sites au jour 120, plans au jour 150', () => {
  const p1 = W.phaseOf({ readyAt: opened, number: 3 }, new Date(opened.getTime() + 2 * 3600000), 10);
  assert.equal(p1.day, 1);
  assert.equal(p1.world, 3);
  assert.equal(p1.registration.open, true);
  assert.equal(p1.wonderSitesAt.getTime(), opened.getTime() + (world.wonderSitesDay - 1) * DAY);
  assert.equal(p1.wonderPlansAt.getTime(), opened.getTime() + (world.wonderPlansDay - 1) * DAY);
  const p60 = W.phaseOf({ readyAt: opened }, new Date(opened.getTime() + 59.5 * DAY), 10);
  assert.equal(p60.day, 60);
  assert.equal(p60.registration.open, true);
  const p61 = W.phaseOf({ readyAt: opened }, new Date(opened.getTime() + 60.5 * DAY), 10);
  assert.equal(p61.registration.open, false);
  // complet à 5 000 joueurs, fermé quand le monde est fini
  assert.equal(W.phaseOf({ readyAt: opened }, opened, world.maxPlayers).registration.open, false);
  const ended = W.phaseOf({ readyAt: opened, endedAt: opened, winnerName: '[ABC] Alpha' }, opened, 0);
  assert.equal(ended.ended, true);
  assert.equal(ended.registration.open, false);
  assert.equal(ended.winner, '[ABC] Alpha');
});

test('niveaux de la Merveille : coût et durée croissants, niveau 1 au tarif de base', () => {
  assert.deepEqual(W.levelCost(1), world.wonderCostBase);
  const c50 = W.levelCost(50), c100 = W.levelCost(100);
  for (const r of ['wood', 'stone', 'iron', 'food']) {
    assert.ok(c50[r] > world.wonderCostBase[r]);
    assert.ok(c100[r] > c50[r]);
    assert.equal(c100[r], Math.round(world.wonderCostBase[r] * Math.pow(world.wonderCostFactor, 99)));
  }
  assert.equal(W.levelSeconds(1), world.wonderTimeBaseSec);
  assert.ok(W.levelSeconds(100) > W.levelSeconds(50));
});

test('Immortels : armée d\'élite du Sultanat, plus forte pour les plans', () => {
  const units = W.immortalUnits(world.immortalSitePower);
  assert.deepEqual(Object.keys(units).sort(), ['SUL_ARC_PERSE', 'SUL_CAV_MAMELOUK', 'SUL_INF_PALAIS']);
  for (const n of Object.values(units)) assert.ok(n >= 1);
  const bigger = W.immortalUnits(world.immortalPlanPower);
  assert.ok(bigger.SUL_INF_PALAIS > units.SUL_INF_PALAIS);
});

test('nœuds spéciaux : sites de Merveille et plans à part des ressources', () => {
  assert.equal(W.isSpecial({ resourceType: 'WONDER' }), true);
  assert.equal(W.isSpecial({ resourceType: 'PLAN' }), true);
  assert.equal(W.isSpecial({ resourceType: 'WOOD' }), false);
});

test('titres du Panthéon', () => {
  assert.equal(HOF.TITLE.WONDER(2, 1), 'Bâtisseur de la Merveille (monde 2)');
  assert.equal(HOF.TITLE.ATTACK(2, 1), 'Premier attaquant (monde 2)');
  assert.equal(HOF.TITLE.DEFENSE(4, 3), '3e défenseur (monde 4)');
  assert.ok(HOF.GAME_TABLES.includes('City') && !HOF.GAME_TABLES.includes('Account') && !HOF.GAME_TABLES.includes('Player'));
});

// ---- vagues : seuls les engins abîment le mur (décision du 30 octobre 2026) ----
const { resolveCombatDetailed } = require('../../src/services/combatService');
const { unitsData } = require('../../src/config/gamedata');
test('vagues d\'Immortels × 5 (recommandation 8) : immortalWaveBase × niveau^immortalWaveExp, réglée dans la configuration', () => {
  assert.equal(W.wavePower(1), world.immortalWaveBase);
  assert.equal(W.wavePower(50), Math.round(world.immortalWaveBase * Math.pow(50, world.immortalWaveExp)));
  assert.ok(Math.abs(W.wavePower(50) - 3.93e6) < 0.01e6 && Math.abs(W.wavePower(100) - 10.0e6) < 0.05e6, `${W.wavePower(50)} / ${W.wavePower(100)}`);
});

test('vagues d\'Immortels : 15 % de mangonneaux, la puissance de la vague inchangée', () => {
  for (const level of [1, 10, 50, 100]) {
    const units = W.waveUnits(level);
    assert.ok(units.SUL_SIEGE_MANGONNEAU >= 1, `niveau ${level}`);
    const lines = W.immortalLines(units);
    assert.equal(lines.find(l => l.unitKey === 'SUL_SIEGE_MANGONNEAU').tier, 'siege');
    assert.ok(lines.filter(l => l.unitKey !== 'SUL_SIEGE_MANGONNEAU').every(l => l.tier === 'elite'));
    const p = W.immortalPower(units);
    assert.ok(Math.abs(p - W.wavePower(level)) / W.wavePower(level) < 0.05, `niveau ${level} : ${p}`);
  }
  assert.equal(unitsData.find(u => u.key === 'SUL_SIEGE_MANGONNEAU').class, 'SIEGE');
  // les garnisons des sites et des plans restent sans engins
  assert.ok(!('SUL_SIEGE_MANGONNEAU' in W.immortalUnits(world.immortalSitePower)));
});

test('vagues d\'Immortels : sans engins un mur ne tombe jamais ; avec, il tient tôt et tombe plus tard', () => {
  const wall = { hp: 20000, maxHp: 20000 };   // mur 20
  const defenders = (power) => [['ROM_INF_LEGIONNAIRE', 0.4], ['ROM_ARC_ELITE', 0.3], ['ROM_CAV_LOURDE', 0.3]].map(([unitKey, s]) => ({ unitKey, tier: 'elite', count: Math.round(power * s / 220) }));
  const fight = (atk, level) => resolveCombatDetailed(atk, defenders(W.wavePower(level) * 0.5), 20, 'Immortels', 'D', null, null, 'SULTAN', 'ROME', 0, null, { ...wall });
  // l'ancienne vague (soldats seuls) : le mur reste debout quelle que soit sa force, la Merveille ne perdrait jamais de niveau
  const soldiersOnly = fight(W.immortalLines(W.immortalUnits(W.wavePower(60))), 60);
  assert.equal(soldiersOnly.wallHpEnd, 20000);
  assert.equal(soldiersOnly.attackerWon, false);
  // avec ses mangonneaux : le mur 20 tient au niveau 1, tombe au niveau 30 face à une défense faible
  const early = fight(W.immortalLines(W.waveUnits(1)), 1);
  assert.ok(early.wallHpEnd > 0);
  assert.equal(early.attackerWon, false);
  const late = fight(W.immortalLines(W.waveUnits(30)), 30);
  assert.equal(late.wallHpEnd, 0);
  assert.equal(late.attackerWon, true);
});

// ---- base factice : le client Prisma est remplacé le temps d'un test (aucune requête réelle) ----
const prisma = require('../../src/config/database');
const RK = require('../../src/services/rankingService');
const WD = require('../../src/services/woundedService');
function stubPrisma(models) {
  const saved = Object.fromEntries(Object.keys(models).map(k => [k, prisma[k]]));
  Object.assign(prisma, models);
  return () => Object.assign(prisma, saved);
}

test('vague contre une Ville Merveille murée : le mur tombe sous les mangonneaux, la Merveille perd un niveau', async () => {
  const writes = [], reports = [];
  const city = { id: 'c1', name: 'Merveille', x: 1, y: 2, playerId: 'p1', isWonder: true, wonderLevel: 30, wallMaxHp: 20000, wallHp: 20000, wallStructure: 1,
    buildings: [{ key: 'WALL', level: 20 }], player: { name: 'Aulus', faction: 'ROME' },
    armies: [{ x: 1, y: 2, status: 'IDLE', units: [{ id: 'u1', unitKey: 'ROM_INF_LEGIONNAIRE', tier: 'elite', count: 50 }] }] };
  const tx = {
    $queryRaw: async () => [],
    city: { findUnique: async () => city, update: async ({ data }) => { writes.push(data); return { ...city, ...data }; } },
    army: { findMany: async () => [] },
    armyUnit: { deleteMany: async () => ({}), update: async () => ({}) },
    battleReport: { create: async ({ data }) => { reports.push(data); return { id: 'r1' }; } }
  };
  const savedRecord = RK.recordCombat; RK.recordCombat = async () => {};
  const restore = stubPrisma({ $transaction: async (fn) => fn(tx), notification: { create: async () => ({ id: 'n' }) } });
  try {
    const out = await W.immortalWave({ id: 'c1', wonderLevel: 30 }, new Date());
    assert.equal(out.won, false);
    assert.deepEqual([out.lost.before, out.lost.after], [30, 29]);
    assert.ok(writes.some(d => d.wonderLevel === 29));
    assert.equal(reports[0].loot.wallBroken, true);
    assert.ok(reports[0].attackerUnits.some(u => u.key === 'SUL_SIEGE_MANGONNEAU'));
  } finally { restore(); RK.recordCombat = savedRecord; }
});

test('vague contre une Ville Merveille sans troupes propres : les armées du joueur venues de sa capitale et les renforts alliés la défendent', async () => {
  const reports = [], asked = [], hit = [];
  const city = { id: 'w1', name: 'Merveille', x: 1, y: 2, playerId: 'p1', isWonder: true, wonderLevel: 1, wallMaxHp: 0, wallHp: 0, wallStructure: 1,
    buildings: [], player: { name: 'Aulus', faction: 'ROME' },
    armies: [{ id: 'away', x: 9, y: 9, status: 'MOVING', units: [{ id: 'u0', unitKey: 'ROM_INF_LEGIONNAIRE', tier: 'elite', count: 500 }] }] };   // en marche : ne défend pas
  const guests = [
    { id: 'cap', ownerId: 'p1', cityId: 'capitale', x: 1, y: 2, status: 'IDLE', units: [{ id: 'u1', unitKey: 'ROM_INF_LEGIONNAIRE', tier: 'elite', count: 400 }] },
    { id: 'ally', ownerId: 'p2', cityId: 'ailleurs', x: 1, y: 2, status: 'STATIONED', units: [{ id: 'u2', unitKey: 'ROM_INF_LEGIONNAIRE', tier: 'elite', count: 400 }] }
  ];
  const tx = {
    $queryRaw: async () => [],
    city: { findUnique: async () => city, update: async () => ({}) },
    army: { findMany: async ({ where }) => { asked.push(where); return guests; } },
    armyUnit: { deleteMany: async ({ where }) => { hit.push(where.id); return {}; }, update: async ({ where }) => { hit.push(where.id); return {}; } },
    battleReport: { create: async ({ data }) => { reports.push(data); return { id: 'r1' }; } }
  };
  const savedRecord = RK.recordCombat; RK.recordCombat = async () => {};
  const restore = stubPrisma({ $transaction: async (fn) => fn(tx), notification: { create: async () => ({ id: 'n' }) } });
  try {
    const out = await W.immortalWave({ id: 'w1', wonderLevel: 1 }, new Date());
    assert.deepEqual(asked[0].OR[0], { ownerId: 'p1', cityId: { not: 'w1' }, isGarrison: false, status: 'IDLE', x: 1, y: 2 }, 'ses armées des autres villes');
    assert.deepEqual(asked[0].OR[1], { status: 'STATIONED', targetCityId: 'w1', NOT: { ownerId: 'p1' } }, 'les renforts alliés');
    assert.equal(reports[0].defenderUnits.reduce((n, u) => n + u.count, 0), 800, 'les 800 soldats présents, pas l\'armée en marche');
    assert.ok(!hit.includes('u0'), 'l\'armée en marche ne perd rien');
    assert.equal(out.won, true);
  } finally { restore(); RK.recordCombat = savedRecord; }
});

// ---- rassemblement contre les Immortels d'un site ou d'un plan (décision du 30 octobre 2026) ----
function groupTx({ node, armies, leader = { id: 'p1', name: 'Aulus' } }) {
  const log = { reports: [], nodeUpdates: [], deleted: [], plans: [], unitWrites: [] };
  const tx = {
    $queryRaw: async () => (node ? [{ ...node }] : []),
    army: { findMany: async ({ where }) => armies.filter(a => where.id.in.includes(a.id)) },
    player: { findUnique: async ({ where }) => (leader && where.id === leader.id ? leader : null) },
    playerTechnology: { findMany: async () => [] },
    armyUnit: { delete: async (q) => log.unitWrites.push(['delete', q.where.id]), update: async (q) => log.unitWrites.push(['update', q.where.id, q.data]) },
    battleReport: { create: async ({ data }) => { log.reports.push(data); return { id: `r${log.reports.length}` }; } },
    resourceNode: { update: async ({ data }) => { log.nodeUpdates.push(data); return {}; }, delete: async ({ where }) => { log.deleted.push(where.id); return {}; } },
    wonderPlan: { create: async ({ data }) => { log.plans.push(data); return { id: 'plan1', ...data }; } }
  };
  return { tx, log };
}
const groupArmy = (id, ownerId, count, extra = {}) => ({ id, ownerId, name: id, cityId: null, heroId: null, hero: null, owner: { id: ownerId, name: ownerId, faction: 'ROME' }, units: [{ id: `${id}-u`, unitKey: 'ROM_INF_LEGIONNAIRE', tier: 'elite', count }], ...extra });
async function withGroupStubs(tx, fn) {
  const saved = { rk: RK.recordCombat, wd: WD.calculateWoundedUnits };
  RK.recordCombat = async () => {};
  WD.calculateWoundedUnits = async () => [];
  const restore = stubPrisma({ $transaction: async (f) => f(tx), notification: { create: async () => ({ id: 'n' }) } });
  try { return await fn(); } finally { restore(); RK.recordCombat = saved.rk; WD.calculateWoundedUnits = saved.wd; }
}

test('rassemblement contre un plan : un seul combat de groupe, le plan revient au lanceur', async () => {
  const immortals = { SUL_INF_PALAIS: 40, SUL_ARC_PERSE: 30, SUL_CAV_MAMELOUK: 20 };
  const node = { id: 'n1', x: 30, y: 40, resourceType: 'PLAN', hasDefenders: true, cityId: null, defenderUnits: immortals, defenderPower: W.immortalPower(immortals) };
  // le lanceur (p1) n'amène pas la plus grosse armée : la prise est quand même à lui
  const armies = [groupArmy('a2', 'p2', 600), groupArmy('a1', 'p1', 200)];
  const { tx, log } = groupTx({ node, armies });
  const r = await withGroupStubs(tx, () => W.attackImmortalsGroup(['a1', 'a2'], 'n1', 'p1'));
  assert.equal(r.won, true);
  assert.equal(r.kind, 'PLAN');
  assert.equal(r.captorId, 'p1');
  assert.equal(r.plan, true);
  assert.deepEqual(log.plans.map(p => p.holderId), ['p1']);
  assert.deepEqual(log.deleted, ['n1']);   // le plan pris, le point disparaît (comme pour une armée seule)
  assert.equal(log.reports.length, 2);   // un rapport par armée
  assert.deepEqual(r.armies.map(a => a.ownerId), ['p1', 'p2']);   // l'armée du lanceur d'abord
  assert.match(log.reports[0].loot.attackerName, /Rassemblement de Aulus \(2 armées\)/);
  // chaque armée perd la même part de ses soldats
  const rate = log.reports[0].attackerLosses.rate;
  assert.equal(log.reports[1].attackerLosses.rate, rate);
  assert.equal(r.armies[0].lost, Math.floor(200 * rate));
  assert.equal(r.armies[1].lost, Math.floor(600 * rate));
});

test('rassemblement contre un site : repoussé, les Immortels gardent leurs pertes ; site déjà libre = rien à combattre', async () => {
  const immortals = W.immortalUnits(world.immortalSitePower);
  const node = { id: 'n2', x: 5, y: 6, resourceType: 'WONDER', hasDefenders: true, cityId: null, defenderUnits: immortals, defenderPower: W.immortalPower(immortals) };
  const { tx, log } = groupTx({ node, armies: [groupArmy('a1', 'p1', 100)] });
  const r = await withGroupStubs(tx, () => W.attackImmortalsGroup(['a1'], 'n2', 'p1'));
  assert.equal(r.won, false);
  assert.equal(log.plans.length, 0);
  assert.equal(log.deleted.length, 0);
  const left = log.nodeUpdates[0];
  assert.equal(left.hasDefenders, undefined);   // toujours gardé
  assert.ok(left.defenderPower > 0 && left.defenderPower <= node.defenderPower);
  // déjà libéré par une autre armée, ou plan déjà pris : pas de combat
  const freed = groupTx({ node: { ...node, hasDefenders: false }, armies: [groupArmy('a1', 'p1', 100)] });
  assert.deepEqual(await withGroupStubs(freed.tx, () => W.attackImmortalsGroup(['a1'], 'n2', 'p1')), { gone: true, kind: 'WONDER' });
  const taken = groupTx({ node: null, armies: [] });
  assert.equal((await withGroupStubs(taken.tx, () => W.attackImmortalsGroup(['a1'], 'n3', 'p1'))).gone, true);
});
