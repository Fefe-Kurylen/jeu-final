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
test('vagues d\'Immortels : immortalWaveBase × niveau^immortalWaveExp, réglée dans la configuration (base 14 000 depuis le 31 octobre 2026)', () => {
  assert.equal(W.wavePower(1), world.immortalWaveBase);
  assert.equal(W.wavePower(50), Math.round(world.immortalWaveBase * Math.pow(50, world.immortalWaveExp)));
  assert.equal(world.immortalWaveBase, 14000);
  assert.equal(world.immortalWaveExp, 1.35);
  assert.ok(Math.abs(W.wavePower(50) - 2.75e6) < 0.01e6 && Math.abs(W.wavePower(100) - 7.02e6) < 0.01e6, `${W.wavePower(50)} / ${W.wavePower(100)}`);
});

test('fin de partie réglée pour une alliance de 15 à 20 joueurs (décision du 31 octobre 2026) : site 3 M, plan 5,75 M, Merveille à moitié prix', () => {
  assert.equal(world.immortalSitePower, 3000000);
  assert.equal(world.immortalPlanPower, 5750000);
  assert.deepEqual(world.wonderCostBase, { wood: 125000, stone: 125000, iron: 125000, food: 37500 });
  assert.equal(world.wonderCostFactor, 1.05);
  // la Merveille entière : ≈ 1,08 G (avant 2,15 G)
  let total = 0;
  for (let l = 1; l <= world.wonderMaxLevel; l++) total += Object.values(W.levelCost(l)).reduce((t, n) => t + n, 0);
  assert.ok(Math.abs(total - 1.077e9) < 0.005e9, String(total));
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

// le Mur d'une Ville Merveille (pas une capitale) s'arrête à WALL.effects.colonyMaxLevel : 15
const fx = require('../../src/utils/buildingEffects');
const WONDER_WALL = fx.maxLevelIn('WALL', false);
const wonderWallHp = require('../../src/config').combat.wallHpPerLevel * WONDER_WALL;
test('vagues d\'Immortels : sans engins un mur ne tombe jamais ; avec, il tient tôt et tombe plus tard', () => {
  assert.equal(WONDER_WALL, 15);
  const wall = { hp: wonderWallHp, maxHp: wonderWallHp };   // mur 15, le plus haut d'une Ville Merveille
  const defenders = (power) => [['ROM_INF_LEGIONNAIRE', 0.4], ['ROM_ARC_ELITE', 0.3], ['ROM_CAV_LOURDE', 0.3]].map(([unitKey, s]) => ({ unitKey, tier: 'elite', count: Math.round(power * s / 220) }));
  const fight = (atk, level) => resolveCombatDetailed(atk, defenders(W.wavePower(level) * 0.5), WONDER_WALL, 'Immortels', 'D', null, null, 'SULTAN', 'ROME', 0, null, { ...wall });
  // l'ancienne vague (soldats seuls) : le mur reste debout quelle que soit sa force, la Merveille ne perdrait jamais de niveau
  const soldiersOnly = fight(W.immortalLines(W.immortalUnits(W.wavePower(60))), 60);
  assert.equal(soldiersOnly.wallHpEnd, wonderWallHp);
  assert.equal(soldiersOnly.attackerWon, false);
  // avec ses mangonneaux : le mur tient au niveau 1, tombe au niveau 30 face à une défense faible
  const early = fight(W.immortalLines(W.waveUnits(1)), 1);
  assert.ok(early.wallHpEnd > 0);
  assert.equal(early.attackerWon, false);
  const late = fight(W.immortalLines(W.waveUnits(30)), 30);
  assert.equal(late.wallHpEnd, 0);
  assert.equal(late.attackerWon, true);
});

test('vagues (base 14 000, décision du 31 octobre 2026) contre le mur 15 d\'une Ville Merveille sans défenseurs : il tient jusqu\'au niveau 2, tombe au 2e round au niveau 10, au 1er dès le 17', () => {
  const fight = (level) => resolveCombatDetailed(W.immortalLines(W.waveUnits(level)), [], WONDER_WALL, 'Immortels', 'D', null, null, 'SULTAN', 'GREEK', 0, null, { hp: wonderWallHp, maxHp: wonderWallHp });
  const fallRound = (level) => fight(level).rounds.findIndex(r => r.wallHp === 0) + 1;   // 0 : debout à la fin
  assert.equal(fight(2).attackerWon, false);
  assert.equal(fight(3).attackerWon, true);
  assert.ok(fallRound(9) > 2);
  assert.equal(fallRound(10), 2);
  assert.ok(fallRound(16) > 1);
  assert.equal(fallRound(17), 1);
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
  const city = { id: 'c1', name: 'Merveille', x: 1, y: 2, playerId: 'p1', isWonder: true, wonderLevel: 30, wallMaxHp: wonderWallHp, wallHp: wonderWallHp, wallStructure: 1,
    buildings: [{ key: 'WALL', level: WONDER_WALL }], player: { name: 'Aulus', faction: 'ROME' },
    armies: [{ x: 1, y: 2, status: 'IDLE', units: [{ id: 'u1', unitKey: 'ROM_INF_LEGIONNAIRE', tier: 'elite', count: 50 }] }] };
  const tx = {
    $queryRaw: async () => [],
    city: { findUnique: async () => city, update: async ({ data }) => { writes.push(data); return { ...city, ...data }; }, findMany: async () => [] },   // capitale sans Forge
    army: { findMany: async () => [] },
    armyUnit: { deleteMany: async () => ({}), update: async () => ({}) },
    playerTechnology: { findMany: async () => [] },
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
    // Forge (décision du 31 octobre 2026) : chaque joueur qui défend la Ville Merveille a celle de sa capitale (p1 aucune,
    // l'allié p2 au niveau 20)
    city: { findUnique: async () => city, update: async () => ({}), findMany: async ({ where }) => { asked.push(where); return [{ isCapital: true, buildings: where.playerId === 'p2' ? [{ key: 'FORGE', level: 20 }] : [] }]; } },
    army: { findMany: async ({ where }) => { asked.push(where); return guests; } },
    armyUnit: { deleteMany: async ({ where }) => { hit.push(where.id); return {}; }, update: async ({ where }) => { hit.push(where.id); return {}; } },
    playerTechnology: { findMany: async () => [] },
    battleReport: { create: async ({ data }) => { reports.push(data); return { id: 'r1' }; } }
  };
  const savedRecord = RK.recordCombat; RK.recordCombat = async () => {};
  const CS = require('../../src/services/combatService');
  const savedCombat = CS.resolveCombatDetailed, mods = [];
  CS.resolveCombatDetailed = (...args) => { mods.push(args[10]); return savedCombat(...args); };
  // après la vague : les armées venues d'ailleurs qui n'ont plus de soldats rentrent (ici les deux ont survécu)
  const relooked = [], moved = [];
  const restore = stubPrisma({ $transaction: async (fn) => fn(tx), notification: { create: async () => ({ id: 'n' }) },
    army: { findUnique: async ({ where }) => { relooked.push(where.id); return guests.find(g => g.id === where.id) || null; }, update: async ({ where }) => { moved.push(where.id); return {}; } },
    armyUnit: { count: async () => 1 },
    city: { findFirst: async () => null } });   // capitales sans Tente de soins : pas de blessés ici
  try {
    const out = await W.immortalWave({ id: 'w1', wonderLevel: 1 }, new Date());
    assert.deepEqual(relooked.sort(), ['ally', 'cap'], 'les défenseurs venus d\'ailleurs sont relus');
    assert.deepEqual(moved, [], 'avec des soldats, ils restent');
    assert.deepEqual(asked[0].OR[0], { ownerId: 'p1', cityId: { not: 'w1' }, isGarrison: false, status: 'IDLE', x: 1, y: 2 }, 'ses armées des autres villes');
    assert.deepEqual(asked[0].OR[1], { status: 'STATIONED', targetCityId: 'w1', NOT: { ownerId: 'p1' } }, 'les renforts alliés');
    assert.equal(reports[0].defenderUnits.reduce((n, u) => n + u.count, 0), 800, 'les 800 soldats présents, pas l\'armée en marche');
    assert.ok(!hit.includes('u0'), 'l\'armée en marche ne perd rien');
    assert.equal(out.won, true);
    // 400 soldats sans Forge et 400 renforts à Forge 20 (+10 %) : +5 % pour les défenseurs, rien pour les Immortels
    assert.deepEqual(mods[0], { attacker: { atk: 1, def: 1 }, defender: { atk: 1.05, def: 1.05 } }, 'chaque joueur garde sa Forge, moyenne selon les soldats');
  } finally { restore(); RK.recordCombat = savedRecord; CS.resolveCombatDetailed = savedCombat; }
});

// ---- vague d'Immortels défendue comme une ville (simulation de 200 jours, novembre 2026) : technologies du propriétaire,
// héros qui commande la défense, blessés ramenés par chaque armée, héros d'une armée anéantie tombé ----
// Transaction factice d'une vague : lignes d'unités tenues à jour (pertes, blessés ramenés), armées et héros lus par id
function waveTx({ city, guests, techs = {}, heroes = [] }) {
  const store = guests.flatMap(g => g.units.map(u => ({ ...u, armyId: g.id })));
  const log = { mods: [], heroArg: [], heroUpdates: [], armyUpdates: {} };
  const tx = {
    $queryRaw: async () => [],
    city: { findUnique: async () => city, update: async () => ({}), findMany: async () => [{ isCapital: true, buildings: [] }] },   // capitales sans Forge
    army: {
      findMany: async () => guests.map(g => ({ ...g, units: store.filter(u => u.armyId === g.id).map(u => ({ ...u })) })),
      findUnique: async ({ where }) => guests.find(g => g.id === where.id) || null,
      update: async ({ where, data }) => { Object.assign(log.armyUpdates[where.id] ||= {}, data); return {}; },
      updateMany: async ({ where, data }) => { const g = guests.find(x => x.id === where.id && x.heroId === where.heroId); if (!g) return { count: 0 }; Object.assign(g, data); return { count: 1 }; }
    },
    armyUnit: {
      deleteMany: async ({ where }) => { const i = store.findIndex(u => u.id === where.id); if (i >= 0) store.splice(i, 1); return {}; },
      update: async ({ where, data }) => { store.find(u => u.id === where.id).count = data.count; return {}; },
      aggregate: async ({ where }) => ({ _sum: { count: store.filter(u => u.armyId === where.armyId && u.count > (where.count?.gt ?? -1)).reduce((t, u) => t + u.count, 0) } })
    },
    playerTechnology: { findMany: async ({ where }) => techs[where.playerId] || [] },
    hero: { findUnique: async ({ where }) => heroes.find(h => h.id === where.id) || null, update: async ({ where, data }) => { log.heroUpdates.push({ id: where.id, ...data }); return {}; } },
    battleReport: { create: async () => ({ id: 'r1' }) }
  };
  return { tx, store, log };
}
async function runWave(w, level) {
  const CS = require('../../src/services/combatService');
  const savedCombat = CS.resolveCombatDetailed, savedRecord = RK.recordCombat;
  CS.resolveCombatDetailed = (...args) => { w.log.mods.push(args[10]); w.log.heroArg.push(args[6]); return savedCombat(...args); };
  RK.recordCombat = async () => {};
  const restore = stubPrisma({ $transaction: async (fn) => fn(w.tx), notification: { create: async () => ({ id: 'n' }) },
    city: { findFirst: async () => ({ buildings: [{ key: 'HEALING_TENT', level: 5 }] }), findUnique: async () => null },   // Tente 5 dans chaque capitale : 45 %
    army: { findUnique: async ({ where }) => w.tx.army.findUnique({ where }), update: async () => ({}) },
    armyUnit: { count: async ({ where }) => w.store.filter(u => u.armyId === where.armyId && u.count > 0).length } });
  try { return await W.immortalWave({ id: 'w1', wonderLevel: level }, new Date()); } finally { restore(); CS.resolveCombatDetailed = savedCombat; RK.recordCombat = savedRecord; }
}
const wonderCity = () => ({ id: 'w1', name: 'Merveille', x: 1, y: 2, playerId: 'p1', isWonder: true, wonderLevel: 4, wallMaxHp: 0, wallHp: 0, wallStructure: 1, buildings: [], player: { name: 'Aulus', faction: 'ROME' }, armies: [] });
const legion = (id, count) => [{ id, unitKey: 'ROM_INF_LEGIONNAIRE', tier: 'elite', count }];

test('vague tenue : chaque armée venue d\'ailleurs ramène ses blessés (Médecine de son joueur), Discipline du propriétaire, héros de la défense', async () => {
  const hero = { id: 'h2', name: 'Léonidas', playerId: 'p2', diedAt: null, talents: {}, items: [] };
  const guests = [
    { id: 'cap', ownerId: 'p1', cityId: 'capitale', x: 1, y: 2, status: 'IDLE', heroId: null, hero: null, owner: { id: 'p1', faction: 'ROME', technologies: [{ techKey: 'DISCIPLINE', level: 20 }] }, units: legion('u1', 400) },
    { id: 'ally', ownerId: 'p2', cityId: 'ailleurs', x: 1, y: 2, status: 'STATIONED', heroId: 'h2', hero, owner: { id: 'p2', faction: 'ROME', technologies: [{ techKey: 'MEDICINE', level: 10 }] }, units: legion('u2', 400) }
  ];
  const w = waveTx({ city: wonderCity(), guests, techs: { p1: [{ techKey: 'DISCIPLINE', level: 20 }] }, heroes: [hero] });
  const out = await runWave(w, 4);
  assert.equal(out.won, true, 'la vague est repoussée');
  assert.deepEqual(w.log.mods[0], { attacker: { atk: 1, def: 1 }, defender: { atk: 1, def: 1.05 } }, 'Discipline 20 du propriétaire : +5 % de défense (sans Forge)');
  assert.equal(w.log.heroArg[0]?.id, 'h2', 'le héros d\'une armée qui défend commande la défense');
  const lost = (unitId) => 400 - w.store.find(u => u.id === unitId).count;
  assert.ok(lost('u1') > 0 && lost('u2') > 0, 'les défenseurs ont perdu des soldats');
  const WD = require('../../src/services/woundedService');
  const rate = (medicine) => WD.woundedRate([{ key: 'HEALING_TENT', level: 5 }], 'ROME', medicine * 0.5);
  assert.deepEqual(w.log.armyUpdates.cap?.woundedCarry, [{ unitKey: 'ROM_INF_LEGIONNAIRE', count: Math.floor(lost('u1') * rate(0)) }], 'l\'armée du propriétaire venue de sa capitale');
  assert.deepEqual(w.log.armyUpdates.ally?.woundedCarry, [{ unitKey: 'ROM_INF_LEGIONNAIRE', count: Math.floor(lost('u2') * rate(10)) }], 'le renfort allié, avec la Médecine de son joueur');
  assert.deepEqual(w.log.heroUpdates, [], 'son armée a survécu : le héros reste debout');
});

test('vague perdue : la garde anéantie perd son héros (résurrection au Domus) et ne ramène aucun blessé', async () => {
  const hero = { id: 'h9', name: 'Brennus', playerId: 'p2', diedAt: null, talents: {}, items: [] };
  const guests = [{ id: 'g', ownerId: 'p2', cityId: 'ailleurs', x: 1, y: 2, status: 'STATIONED', heroId: 'h9', hero, owner: { id: 'p2', faction: 'ROME', technologies: [] }, units: legion('u9', 50) }];
  const w = waveTx({ city: { ...wonderCity(), wonderLevel: 30 }, guests, heroes: [hero] });
  const out = await runWave(w, 30);
  assert.equal(out.won, false);
  assert.equal(w.store.length, 0, 'la garde est anéantie');
  assert.deepEqual(w.log.heroUpdates.map(h => [h.id, h.diedAt instanceof Date]), [['h9', true]], 'son héros tombe');
  assert.equal(guests[0].heroId, null, 'il quitte son armée');
  assert.equal(w.log.armyUpdates.g?.woundedCarry, undefined, 'une armée sans survivant ne ramène personne');
});

// règle commune (woundedService.carryArmiesWounded) : assaut de Bastion des deux côtés, vague d'Immortels
test('blessés de plusieurs armées : chacune les siens, ramenés chez elle ; dans sa propre ville, posés aussitôt ; technologies lues une fois par joueur', async () => {
  const WD = require('../../src/services/woundedService');
  const left = { far: 10, mine: 10, wiped: 0, again: 10 };   // soldats restants après le combat
  const techReads = [], upserts = [], carried = {};
  const tx = {
    armyUnit: { aggregate: async ({ where }) => ({ _sum: { count: left[where.armyId] } }) },
    army: { findUnique: async () => ({ woundedCarry: [] }), update: async ({ where, data }) => { carried[where.id] = data.woundedCarry; return {}; } },
    playerTechnology: { findMany: async ({ where }) => { techReads.push(where.playerId); return where.playerId === 'p2' ? [{ techKey: 'MEDICINE', level: 10 }] : []; } },
    woundedUnit: { upsert: async ({ where, update }) => { upserts.push([where.cityId_unitKey.cityId, where.cityId_unitKey.unitKey, update.waiting.increment]); return {}; } }
  };
  const TENT = [{ key: 'HEALING_TENT', level: 5 }];
  const restore = stubPrisma({ city: { findFirst: async () => ({ buildings: TENT }) } });
  const killed = [{ key: 'ROM_INF_LEGIONNAIRE', killed: 100 }];
  try {
    await WD.carryArmiesWounded(tx, [
      [{ id: 'far', ownerId: 'p2', cityId: 'c2', owner: { faction: 'ROME' } }, killed],   // renfort venu d'ailleurs
      [{ id: 'mine', ownerId: 'p1', cityId: 'w1', owner: { faction: 'ROME', technologies: [] } }, killed],   // rattachée à la ville du combat
      [{ id: 'wiped', ownerId: 'p2', cityId: 'c2', owner: { faction: 'ROME' } }, killed],   // anéantie
      [{ id: 'again', ownerId: 'p2', cityId: 'c2', owner: { faction: 'ROME' } }, []],   // rien perdu
      [{ id: 'nohome', ownerId: 'p3', cityId: null }, killed]   // sans ville : rien
    ], { homeCityId: 'w1' });
    const n = (medicine) => Math.floor(100 * WD.woundedRate(TENT, 'ROME', medicine * 0.5));
    assert.deepEqual(carried, { far: [{ unitKey: 'ROM_INF_LEGIONNAIRE', count: n(10) }] }, 'seul le renfort qui a des survivants ramène les siens (Médecine de son joueur)');
    assert.deepEqual(upserts, [['w1', 'ROM_INF_LEGIONNAIRE', n(0)]], 'l\'armée de la ville les pose aussitôt chez elle');
    assert.deepEqual(techReads, ['p2'], 'une lecture par joueur ; celles déjà chargées avec l\'armée servent telles quelles');
    // une erreur n'arrête pas le combat
    await WD.carryArmiesWounded({ ...tx, playerTechnology: { findMany: async () => { throw new Error('panne'); } } }, [[{ id: 'far', ownerId: 'p9', cityId: 'c9' }, killed]]);
  } finally { restore(); }
});

// ---- rassemblement contre les Immortels d'un site ou d'un plan (décision du 30 octobre 2026) ----
function groupTx({ node, armies, leader = { id: 'p1', name: 'Aulus' } }) {
  const log = { reports: [], nodeUpdates: [], deleted: [], plans: [], unitWrites: [], forgeOf: [] };
  const tx = {
    $queryRaw: async () => (node ? [{ ...node }] : []),
    army: { findMany: async ({ where }) => armies.filter(a => where.id.in.includes(a.id)) },
    player: { findUnique: async ({ where }) => (leader && where.id === leader.id ? leader : null) },
    playerTechnology: { findMany: async () => [] },
    city: { findMany: async ({ where }) => { log.forgeOf.push(where.playerId); return []; } },   // Forge de la capitale de chaque joueur
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
  assert.deepEqual(log.forgeOf, ['p1', 'p2'], 'technologies du lanceur, Forge de chaque joueur du rassemblement (moyenne selon les soldats)');
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

// ---- site de Merveille réservé (décision du 1er novembre 2026, simulation de 200 jours, E6) ----
const HOUR = 3600000;
// transaction factice : l'alliance des joueurs, la colonne reservedAllianceId lue et écrite en SQL
function reserveDb({ members = {}, reserved = null, tags = { A1: 'AQL' } } = {}) {
  const log = { writes: [], notes: [] };
  const db = {
    allianceMember: {
      findUnique: async ({ where }) => (members[where.playerId] ? { allianceId: members[where.playerId] } : null),
      findMany: async ({ where }) => Object.entries(members).filter(([, a]) => a === where.allianceId).map(([playerId]) => ({ playerId }))
    },
    $executeRaw: async (sql, allianceId, nodeId) => { log.writes.push({ allianceId, nodeId }); reserved = allianceId; return 1; },
    $queryRaw: async () => [{ allianceId: reserved, tag: reserved ? tags[reserved] : null }]
  };
  return { db, log };
}
const freedSite = (lastDefeat) => ({ id: 'n1', x: 5, y: 6, resourceType: 'WONDER', hasDefenders: false, cityId: null, lastDefeat });

test('site libéré (E6) : réservé 6 h à l\'alliance du vainqueur, toute l\'alliance est prévenue', async () => {
  assert.equal(world.wonderSiteReserveHours, 6);
  const { db, log } = reserveDb({ members: { p1: 'A1', p2: 'A1', p3: 'A2' } });
  const restore = stubPrisma({ notification: { create: async ({ data }) => { log.notes.push(data); return { id: 'n' }; } } });
  try {
    const out = await W.onImmortalsBeaten(db, { id: 'n1', x: 5, y: 6, resourceType: 'WONDER' }, 'p1');
    assert.equal(out.reservedAllianceId, 'A1');
    assert.deepEqual(log.writes, [{ allianceId: 'A1', nodeId: 'n1' }]);
    await new Promise(r => setImmediate(r));
    assert.deepEqual(log.notes.map(n => n.playerId).sort(), ['p1', 'p2'], 'les membres de l\'alliance du vainqueur, pas les autres');
    assert.ok(log.notes.every(n => n.body.includes('pendant 6 h, seule votre alliance peut y fonder sa Ville Merveille')), JSON.stringify(log.notes.map(n => n.body)));
    // vainqueur sans alliance : rien de réservé
    const solo = reserveDb({});
    assert.deepEqual(await W.onImmortalsBeaten(solo.db, { id: 'n2', x: 1, y: 1, resourceType: 'WONDER' }, 'p9'), {});
    assert.deepEqual(solo.log.writes, [{ allianceId: null, nodeId: 'n2' }]);
  } finally { restore(); }
});

test('fondation sur un site réservé (E6) : seule l\'alliance qui a battu les Immortels pendant 6 h, puis toute alliance', async () => {
  const beaten = new Date('2026-11-01T12:00:00Z');
  const { db } = reserveDb({ members: { p1: 'A1', p3: 'A2' }, reserved: 'A1' });
  const at = (h) => new Date(beaten.getTime() + h * HOUR);
  const r = await W.siteReserve(db, freedSite(beaten), at(1));
  assert.deepEqual(r, { allianceId: 'A1', tag: 'AQL', until: at(6) });
  assert.equal(await W.siteClosedFor(db, freedSite(beaten), 'p1', at(1)), null, 'l\'alliance qui a vaincu fonde');
  const refusal = await W.siteClosedFor(db, freedSite(beaten), 'p3', at(1));
  assert.match(refusal, /^Site réservé à l'alliance \[AQL\], qui a battu les Immortels, jusqu'au .+ : ensuite, toute alliance pourra y fonder sa Ville Merveille$/);
  assert.notEqual(await W.siteClosedFor(db, freedSite(beaten), 'p9', at(5.9)), null, 'un joueur sans alliance non plus');
  assert.equal(await W.siteClosedFor(db, freedSite(beaten), 'p3', at(6)), null, 'six heures passées : ouvert à tous');
  // site gardé, bâti, plan, jamais battu : pas de réservation
  for (const node of [{ ...freedSite(beaten), hasDefenders: true }, { ...freedSite(beaten), cityId: 'c1' }, { ...freedSite(beaten), resourceType: 'PLAN' }, freedSite(null)]) assert.equal(await W.siteReserve(db, node, at(1)), null);
  // site battu par un joueur sans alliance : ouvert à tous
  assert.equal(await W.siteClosedFor(reserveDb({ members: { p3: 'A2' } }).db, freedSite(beaten), 'p3', at(1)), null);
});

test('site réservé (E6) : une alliance dissoute depuis ne bloque plus le site, comme la liste de la carte', async () => {
  const beaten = new Date('2026-11-01T12:00:00Z'), at = new Date(beaten.getTime() + HOUR);
  const sqls = [];
  // la jointure ne rend aucune ligne : l'alliance notée sur le site n'existe plus
  const db = { $queryRaw: async (sql) => { sqls.push(sql.join('?')); return []; }, allianceMember: { findUnique: async () => ({ allianceId: 'A2' }) } };
  assert.equal(await W.siteReserve(db, freedSite(beaten), at), null);
  assert.equal(await W.siteClosedFor(db, freedSite(beaten), 'p3', at), null, 'toute alliance peut fonder');
  await W.reservedSites(at, db);
  assert.ok(sqls.length === 3 && sqls.every(s => /\bJOIN "Alliance"/.test(s) && !/LEFT JOIN/.test(s)), sqls.join('\n'));
});

test('état du monde (E6) : les sites réservés en ce moment, une fois les sites apparus', async () => {
  const now = new Date('2026-11-01T15:00:00Z');
  const rows = [{ id: 'n1', x: 5, y: 6, lastDefeat: new Date(now.getTime() - 2 * HOUR), allianceId: 'A1', tag: 'AQL' }];
  let since = null;
  const list = await W.reservedSites(now, { $queryRaw: async (sql, s) => { since = s; return rows; } });
  assert.equal(since.getTime(), now.getTime() - 6 * HOUR);
  assert.deepEqual(list, [{ nodeId: 'n1', x: 5, y: 6, allianceId: 'A1', allianceTag: 'AQL', until: new Date(now.getTime() + 4 * HOUR) }]);
  for (const [sitesSpawnedAt, expected] of [[null, 0], [opened, 1]]) {
    const restore = stubPrisma({ worldConfig: { findUnique: async () => ({ id: 1, readyAt: opened, sitesSpawnedAt }) }, player: { count: async () => 10 }, $queryRaw: async () => rows });
    try {
      const st = await W.worldState(now);
      assert.equal(st.wonderSites.reserveHours, 6);
      assert.equal(st.wonderSites.reserved.length, expected, `sites apparus : ${!!sitesSpawnedAt}`);
    } finally { restore(); }
  }
});
