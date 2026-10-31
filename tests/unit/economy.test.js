// Économie (décisions du 30 octobre 2026, rapport économie) : stock partagé entre les villes d'un joueur (répartition d'une
// dépense et d'un remboursement, message de ce qui manque), coût et durée d'un niveau (champs ×1,45 en coût, champs et
// Bâtiment principal ×1,30 en temps), recrutement, plafonds des quêtes et des routes sans les Grands, soins payants.
// Aucune requête réelle : les transactions sont factices.
require('./_env');
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://unit:unit@localhost:5432/unit';   // le client Prisma est créé, jamais interrogé
const test = require('node:test');
const assert = require('node:assert/strict');
const config = require('../../src/config');
const { buildingsData, unitsData } = require('../../src/config/gamedata');
const db = require('../../src/utils/db');
const calc = require('../../src/utils/calculations');
const fx = require('../../src/utils/buildingEffects');
const W = require('../../src/services/woundedService');

const city = (id, stock, { cap = 10000, foodCap = cap, isCapital = false } = {}) => ({ id, isCapital, wood: stock, stone: stock, iron: stock, food: stock, maxStorage: cap, maxFoodStorage: foodCap });
const def = (key) => buildingsData.find(b => b.key === key);
const unit = (faction, cls, tier) => unitsData.find(u => u.faction === faction && u.class === cls && u.tier === tier);
// transaction factice : chaque écriture SQL (debitCity, creditCity) est notée avec ses valeurs
function fakeTx(extra = {}) {
  const writes = [];
  return { writes, $executeRaw: async (strings, ...values) => { writes.push({ sql: strings.join('?'), values }); return 1; }, ...extra };
}

// ---- stock partagé : dépense ----
test('dépense : la ville de l\'action d\'abord, puis les autres villes par stock décroissant, ressource par ressource', () => {
  const cities = [city('a', 100), city('b', 500), city('c', 300)];
  const plan = db.planDebit(cities, 'a', { wood: 700, stone: 50, food: 0 });
  assert.equal(plan.ok, true);
  assert.deepEqual(plan.missing, {});
  assert.deepEqual(plan.tooSmall, []);
  assert.deepEqual(plan.takenByCity.a, { wood: 100, stone: 50, iron: 0, food: 0 });
  assert.deepEqual(plan.takenByCity.b, { wood: 500, stone: 0, iron: 0, food: 0 }, 'la ville la plus riche ensuite');
  assert.deepEqual(plan.takenByCity.c, { wood: 100, stone: 0, iron: 0, food: 0 });
  assert.equal(cities[0].wood, 100, 'le plan seul ne touche à rien');
});

test('dépense : refusée seulement si la somme des villes ne suffit pas ; le manque est donné par ressource', () => {
  const cities = [city('a', 100.9), city('b', 200)];
  const plan = db.planDebit(cities, 'b', { wood: 400, iron: 300 });
  assert.equal(plan.ok, false);
  assert.deepEqual(plan.missing, { wood: 100 }, 'les stocks comptent à l\'unité près (100 + 200) ; le fer est payé');
  assert.deepEqual(plan.tooSmall, []);
  assert.equal(db.missingMessage(plan), `Ressources insuffisantes : il manque ${(100).toLocaleString('fr-FR')} de bois (toutes vos villes comprises)`);
  const both = db.planDebit(cities, 'a', { wood: 1500, stone: 1300 });
  assert.match(db.missingMessage(both), /il manque 1.200 de bois et 1.000 de pierre \(toutes vos villes comprises\)$/);
  const three = db.planDebit(cities, 'a', { wood: 1500, stone: 1300, food: 400 });
  assert.match(db.missingMessage(three), /il manque 1.200 de bois, 1.000 de pierre et 100 de nourriture \(/, 'virgules, puis « et » avant le dernier');
});

test('dépense : un prix plus grand que le stockage de toutes les villes réunies demande plus de capacité (recommandation 14)', () => {
  const cities = [city('a', 1000, { cap: 1200, foodCap: 5000 }), city('b', 1000, { cap: 3000, foodCap: 1000 })];
  const plan = db.planDebit(cities, 'a', { wood: 4500, food: 2500 });
  assert.equal(plan.ok, false);
  assert.deepEqual(plan.tooSmall, ['wood'], 'bois : 4 500 > 1 200 + 3 000 ; nourriture : 2 500 < 6 000');
  assert.match(db.missingMessage(plan), /^Stockage trop petit \(bois\) : il faut plus de capacité/);
});

test('debitPlayer : une écriture par ville qui paie, stocks verrouillés mis à jour ; rien n\'est écrit si la somme manque', async () => {
  const cities = [city('a', 100), city('b', 500)];
  const tx = fakeTx();
  const paid = await db.debitPlayer(tx, 'p1', 'a', { wood: 300, iron: 50 }, cities);
  assert.equal(paid.ok, true);
  assert.equal(tx.writes.length, 2);
  assert.deepEqual(tx.writes.map(w => w.values.slice(0, 5)), [[100, 0, 50, 0, 'a'], [200, 0, 0, 0, 'b']], 'bois, pierre, fer, nourriture, ville');
  assert.deepEqual([cities[0].wood, cities[0].iron, cities[1].wood], [0, 50, 300]);
  const refused = await db.debitPlayer(tx, 'p1', 'a', { stone: 5000 }, cities);
  assert.equal(refused.ok, false);
  assert.equal(tx.writes.length, 2, 'aucune écriture de plus');
});

// ---- stock partagé : remboursement ----
test('remboursement : la ville jusqu\'à son plafond, puis les autres selon leur place libre ; ce qui ne tient nulle part est perdu', () => {
  const cities = [city('a', 900, { cap: 1000 }), city('b', 200, { cap: 1000 }), city('c', 600, { cap: 1000 })];
  const plan = db.planCredit(cities, 'a', { wood: 1500, food: 50 });
  assert.deepEqual(plan.credited.a, { wood: 100, stone: 0, iron: 0, food: 50 });
  assert.deepEqual(plan.credited.b, { wood: 800, stone: 0, iron: 0, food: 0 }, 'la ville qui a le plus de place ensuite');
  assert.deepEqual(plan.credited.c, { wood: 400, stone: 0, iron: 0, food: 0 });
  assert.deepEqual(plan.lost, { wood: 200, stone: 0, iron: 0, food: 0 });
  assert.deepEqual(cities.map(c => c.wood), [1000, 1000, 1000]);
  // une ville au-dessus de son plafond (3 000 de départ d'une colonie) ne reçoit rien et ne perd rien
  const over = [city('a', 3000, { cap: 1200 }), city('b', 0, { cap: 1200 })];
  assert.deepEqual(db.planCredit(over, 'a', { stone: 500 }).credited, { b: { wood: 0, stone: 500, iron: 0, food: 0 } });
});

test('remboursement : le message dit ce qui n\'a tenu dans aucune ville, rien sinon', () => {
  assert.equal(db.lostNote({ wood: 0, stone: 0, iron: 0, food: 0 }), '');
  assert.equal(db.lostNote({ wood: 200, stone: 0, iron: 0, food: 30 }), ' ; plus de place dans vos villes : 200 de bois et 30 de nourriture perdus');
  const full = [city('a', 1000, { cap: 1000 })];
  assert.equal(`Construction annulée${db.lostNote(db.planCredit(full, 'a', { iron: 50 }).lost)}`, 'Construction annulée ; plus de place dans vos villes : 50 de fer perdus');
});

test('creditPlayer : une écriture creditCity par ville créditée (GREATEST : jamais un stock qui baisse)', async () => {
  const tx = fakeTx();
  const out = await db.creditPlayer(tx, 'p1', 'a', { wood: 300 }, [city('a', 900, { cap: 1000 }), city('b', 0, { cap: 1000 })]);
  assert.deepEqual(out.lost, { wood: 0, stone: 0, iron: 0, food: 0 });
  assert.equal(tx.writes.length, 2);
  assert.ok(tx.writes.every(w => /wood {2}= GREATEST\(wood, {2}LEAST\(wood {2}\+ \?, "maxStorage"\)\)/.test(w.sql)));
  assert.deepEqual(tx.writes.map(w => [w.values[0], w.values.at(-1)]), [[100, 'a'], [200, 'b']]);
});

test('stock de toutes les villes : somme des stocks (arrondie) et des plafonds', () => {
  assert.deepEqual(db.stockTotals([city('a', 100.6, { cap: 1200, foodCap: 2000 }), city('b', 50, { cap: 3000, foodCap: 1000 })]),
    { wood: 150, stone: 150, iron: 150, food: 150, maxStorage: 4200, maxFoodStorage: 3000 });
  assert.deepEqual(db.stockTotals([]), { wood: 0, stone: 0, iron: 0, food: 0, maxStorage: 0, maxFoodStorage: 0 });
  // 100,6 + 50,6 : 150 comme planDebit (qui prend chaque ville à l'unité près), pas 151
  const halves = [city('a', 100.6), city('b', 50.6)];
  assert.equal(db.stockTotals(halves).wood, 150);
  assert.equal(db.planDebit(halves, 'a', { wood: 151 }).ok, false);
  assert.equal(db.planDebit(halves, 'a', { wood: 150 }).ok, true);
});

test('bâtiments d\'une ville : les siens, et ceux réservés à la capitale (Marché et Comptoir compris) lus dans la capitale (une requête)', async () => {
  let asked = null;
  // l'include charge les seuls bâtiments « capitale seulement » de chaque ville (fx.CAPITAL_BUILDINGS)
  const rows = [{ isCapital: true, buildings: [{ key: 'ACADEMY', level: 10 }, { key: 'MARKET', level: 20 }, { key: 'TRADE_OFFICE', level: 7 }] }, { isCapital: false, buildings: [{ key: 'TRADE_OFFICE', level: 12 }] }];
  const tx = { city: { findMany: async (q) => { asked = q; return rows; } } };
  // Marché et Comptoir restés dans une colonie (d'avant la migration 0032) : ils ne comptent plus
  const colony = { playerId: 'p1', isCapital: false, buildings: [{ key: 'MARKET', level: 5 }, { key: 'ACADEMY', level: 3 }, { key: 'TRADE_OFFICE', level: 4 }, { key: 'MILL', level: 2 }] };
  const got = await db.buildingsWithCapital(tx, colony);
  assert.deepEqual(asked.where, { playerId: 'p1' });
  assert.deepEqual(got, [{ key: 'MILL', level: 2 }, { key: 'ACADEMY', level: 10 }, { key: 'MARKET', level: 20 }, { key: 'TRADE_OFFICE', level: 7 }],
    'le Moulin de la colonie, l\'Académie, le Marché et le Comptoir de la capitale');
  assert.equal(fx.levelOf(got, 'TRADE_OFFICE'), 7, 'celui de la capitale, plus le meilleur des villes');
  assert.deepEqual(await db.buildingsWithCapital({ city: { findMany: async () => assert.fail('pas de requête sans joueur') } }, { buildings: [] }), []);
});

test('Grandes casernes / Grandes écuries du joueur : bonus de formation de la capitale lu en une requête ; rien pour les engins', async () => {
  let asked = null;
  const tx = { cityBuilding: { findMany: async (q) => { asked = q; return [{ key: 'GREAT_BARRACKS', level: 20 }, { key: 'GREAT_BARRACKS', level: 12 }]; } } };
  assert.equal(await db.capitalTrainBoostOf(tx, 'p1', 'INFANTRY'), 32 * fx.effectOf('GREAT_BARRACKS', 'capitalTrainTimeReductionPctPerLevel'));
  assert.deepEqual(asked.where, { key: 'GREAT_BARRACKS', city: { playerId: 'p1' } });
  await db.capitalTrainBoostOf(tx, 'p1', 'CAVALRY');
  assert.equal(asked.where.key, 'GREAT_STABLE');
  const none = { cityBuilding: { findMany: async () => assert.fail('aucune requête') } };
  assert.equal(await db.capitalTrainBoostOf(none, 'p1', 'SIEGE'), 0);
  assert.equal(await db.capitalTrainBoostOf(none, null, 'INFANTRY'), 0);
});

test('or du joueur : débit conditionnel « or ≥ prix » (rien n\'est changé s\'il manque), crédit des remboursements', async () => {
  const calls = [];
  const tx = { player: {
    updateMany: async (q) => { calls.push(['debit', q]); return { count: q.where.gold.gte <= 10 ? 1 : 0 }; },
    update: async (q) => { calls.push(['credit', q]); return {}; }
  } };
  assert.equal(await db.debitGold(tx, 'p1', 10), true);
  assert.deepEqual(calls[0][1], { where: { id: 'p1', gold: { gte: 10 } }, data: { gold: { decrement: 10 } } });
  assert.equal(await db.debitGold(tx, 'p1', 11), false);
  assert.equal(await db.debitGold(tx, 'p1', 0), true, 'rien à payer : aucune écriture');
  await db.creditGold(tx, 'p1', 3.7);
  assert.deepEqual(calls.at(-1), ['credit', { where: { id: 'p1' }, data: { gold: { increment: 3 } } }]);
  await db.creditGold(tx, 'p1', 0);
  assert.equal(calls.length, 3, 'rien à rendre : aucune écriture');
});

// ---- coût et durée d'un niveau (recommandations 3 et 4) ----
test('coût d\'un niveau : champs ×1,45, autres bâtiments ×1,28 ; niveau 1 = coût des données', () => {
  const B = config.build;
  for (const key of ['FARM', 'LUMBER', 'QUARRY', 'IRON_MINE', 'MAIN_HALL', 'ACADEMY', 'WAREHOUSE']) {
    const d = def(key);
    assert.deepEqual(calc.buildCostFor(d, 1), Object.fromEntries(Object.entries({ wood: 0, stone: 0, iron: 0, food: 0, ...d.costL1 }).map(([r, v]) => [r, Math.floor(v)])), `${key} niveau 1`);
    const growth = B.fieldCostKeys.includes(key) ? B.fieldCostMultiplier : B.costMultiplierBase;
    for (const L of [2, 10, 20]) assert.equal(calc.buildCostFor(d, L).wood, Math.floor(d.costL1.wood * Math.pow(growth, L - 1)), `${key} niveau ${L}`);
  }
  assert.equal(B.fieldCostMultiplier, 1.45);
  assert.ok(calc.buildCostFor(def('FARM'), 20).wood > 3 * Math.floor(def('FARM').costL1.wood * Math.pow(1.28, 19)), 'un champ 20 coûte bien plus qu\'avant');
});

test('durée d\'un niveau : champs et Bâtiment principal ×1,30, autres bâtiments ×1,2', () => {
  const B = config.build;
  assert.deepEqual(B.slowTimeKeys, ['FARM', 'LUMBER', 'QUARRY', 'IRON_MINE', 'MAIN_HALL']);
  for (const key of ['FARM', 'MAIN_HALL', 'BARRACKS', 'WAREHOUSE']) {
    const d = def(key), growth = B.slowTimeKeys.includes(key) ? B.slowTimeMultiplier : B.timeMultiplierBase;
    assert.equal(calc.buildSecondsFor(d, 1), d.timeL1Sec);
    for (const L of [5, 15, 20]) assert.equal(calc.buildSecondsFor(d, L), Math.floor(d.timeL1Sec * Math.pow(growth, L - 1)), `${key} niveau ${L}`);
  }
});

// ---- recrutement ----
test('recrutement : prix d\'un lot et temps de base, les mêmes que les fiches des unités ; l\'élite coûte de l\'or et moins de ressources', () => {
  const R = config.recruit;
  for (const u of unitsData) {
    // élite (décision du 31 octobre 2026) : ressources × eliteResourceCostMult, arrondies à l'unité
    const mult = u.tier === 'elite' ? R.eliteResourceCostMult : 1;
    assert.deepEqual(calc.recruitCostFor(u, 1), Object.fromEntries(Object.entries(u.recruitCost).filter(([r]) => r !== 'gold').map(([r, v]) => [r, Math.round(v * mult)])), u.key);
    assert.equal(calc.recruitGoldFor(u, 1), R.goldPerUnit[u.tier] || 0, u.key);
    assert.equal(Math.round(calc.baseTrainSecondsFor(u)), u.recruitTimeSec, u.key);
  }
  const inf = unit('ROME', 'INFANTRY', 'base');
  assert.deepEqual(calc.recruitCostFor(inf, 10), { wood: 300, stone: 200, iron: 550, food: 200 });
  assert.equal(calc.recruitGoldFor(inf, 10), 0, 'seule l\'élite demande de l\'or');
  assert.equal(calc.recruitGoldFor(unit('ROME', 'SIEGE', 'siege'), 4), 0, 'les engins non plus');
  // un lot = le prix d'une unité × le nombre : la fiche (prix d'une unité) et le serveur tombent d'accord
  const elite = unit('ROME', 'INFANTRY', 'elite');
  const one = calc.recruitCostFor(elite, 1);
  assert.deepEqual(calc.recruitCostFor(elite, 7), Object.fromEntries(Object.entries(one).map(([r, v]) => [r, v * 7])));
  assert.equal(calc.recruitGoldFor(elite, 7), 7 * R.goldPerUnit.elite);
  assert.ok(one.iron < elite.recruitCost.iron, 'moins de ressources pour l\'élite');
  // le catalogue /api/units donne ces prix
  const priced = calc.withRecruitPrice(elite);
  assert.deepEqual([priced.key, priced.recruitCost, priced.recruitGold], [elite.key, one, R.goldPerUnit.elite]);
  assert.deepEqual(calc.withRecruitPrice(inf).recruitGold, 0);
  // soins : 30 % du prix de recrutement, baisse de l'élite comprise
  assert.deepEqual(W.healCostFor(elite, 10), Object.fromEntries(Object.entries(one).map(([r, v]) => [r, Math.ceil(v * 10 * config.wounded.healCostPct / 100)])));
});

test('emplacements de l\'anneau : 18 dans la capitale, 12 dans une colonie ou la Ville Merveille', () => {
  assert.deepEqual(config.city.ringSlots, { capital: 18, colony: 12 });
  assert.equal(calc.ringSlotsOf({ isCapital: true }), 18);
  assert.equal(calc.ringSlotsOf({ isCapital: false }), 12);
  assert.equal(calc.ringSlotsOf({ isCapital: false, isWonder: true }), 12);
  assert.ok(config.city.wallSlot > config.city.ringSlots.capital, 'le Mur reste hors de l\'anneau');
  // autant d'emplacements que de bâtiments possibles dans l'anneau (ni Bâtiment principal, ni champs, ni Mur)
  const ringKeys = buildingsData.filter(b => !['MAIN_HALL', 'WALL'].includes(b.key) && !config.city.fieldSlots[b.key]);
  const factions = new Set(ringKeys.filter(b => b.faction).map(b => b.faction));
  const capital = ringKeys.filter(b => !fx.notInCapital(b.key) && !b.faction).length + (factions.size ? 1 : 0);
  const colony = ringKeys.filter(b => !fx.capitalOnly(b.key)).length;
  assert.equal(capital, config.city.ringSlots.capital);
  assert.equal(colony, config.city.ringSlots.colony);
});

// ---- plafonds des quêtes et des routes sans les Grands (recommandation 12, option A) ----
test('quêtes et routes : plafonds calculés sur le Dépôt et le Silo seuls, sans le Grand dépôt ni le Grand silo', () => {
  const q = require('../../src/services/questService');
  const MS = require('../../src/services/marketService');
  const plain = [{ key: 'WAREHOUSE', level: 20 }, { key: 'SILO', level: 10 }];
  const great = [...plain, { key: 'GREAT_WAREHOUSE', level: 20 }, { key: 'GREAT_SILO', level: 20 }];
  assert.deepEqual(calc.storageCapsWithoutGreat(great), calc.cityStorageCaps(plain));
  assert.ok(calc.cityStorageCaps(great).maxStorage > calc.cityStorageCaps(plain).maxStorage);
  const cap = q.rewardCap([{ buildings: great }, { buildings: [{ key: 'WAREHOUSE', level: 5 }] }]);
  assert.equal(cap.wood, calc.getStorageAtLevel('WAREHOUSE', 20, buildingsData) / 2, 'la moitié du plus grand dépôt');
  assert.equal(cap.food, calc.getStorageAtLevel('SILO', 10, buildingsData) / 2);
  assert.deepEqual(q.rewardCap([{ buildings: [] }]), { wood: 500, stone: 500, iron: 500, food: 500 }, 'sans dépôt : la réserve de base');
  const send = MS.routeSendCap(great);
  assert.equal(send.other, Math.floor(calc.getStorageAtLevel('WAREHOUSE', 20, buildingsData) * MS.routePct()));
  assert.equal(send.food, Math.floor(calc.getStorageAtLevel('SILO', 10, buildingsData) * MS.routePct()));
  assert.equal(q.buildCost('FARM', 12).wood, calc.buildCostFor(def('FARM'), 12).wood, 'les récompenses suivent le prix réel');
});

// ---- soins (recommandation 6) ----
const tent = (level, extra = []) => [{ key: 'HEALING_TENT', level }, ...extra];

test('soins : 30 % du recrutement (38 pour un fantassin de base), lits, soin immédiat 1 / 2 / 3 / 3 or', () => {
  const inf = unit('ROME', 'INFANTRY', 'base');
  const cost = W.healCostFor(inf, 1);
  assert.deepEqual(cost, { wood: 9, stone: 6, iron: 17, food: 6 });
  assert.equal(Object.values(cost).reduce((a, b) => a + b, 0), 38);
  assert.deepEqual(W.healCostFor(inf, 100), { wood: 900, stone: 600, iron: 1650, food: 600 });
  const engine = unitsData.find(u => u.class === 'SIEGE');
  assert.equal(Object.values(W.healCostFor(engine, 1)).reduce((a, b) => a + b, 0), 648);
  assert.equal(W.bedsFor(tent(20)), 20 * config.wounded.bedsPerLevel);
  assert.equal(W.bedsFor([]), 0);
  assert.deepEqual(['base', 'intermediate', 'elite', 'siege'].map(t => W.instantHealGold({ tier: t }, 10)), [10, 20, 30, 30]);
});

test('soins : 10 % de la formation de base par unité × 0,95^(tente − 1), Thermes de la capitale compris ; 15 h pour 4 000 lits à la tente 20', () => {
  const inf = unit('ROME', 'INFANTRY', 'base');
  assert.equal(W.healSecondsPerUnit(inf, tent(1)), 36);
  assert.ok(Math.abs(W.healSecondsPerUnit(inf, tent(20)) - 13.6) < 0.05, String(W.healSecondsPerUnit(inf, tent(20))));
  const hours = W.healSecondsFor(inf, 4000, tent(20)) / 3600;
  assert.ok(hours > 15 && hours < 15.2, `${hours} h`);
  const thermae = W.healSecondsPerUnit(inf, tent(20, [{ key: 'ROMAN_THERMAE', level: 10 }]));
  assert.ok(Math.abs(thermae - W.healSecondsPerUnit(inf, tent(20)) * 0.85) < 1e-9, 'Thermes 10 : −15 %');
  assert.equal(W.healSecondsFor(inf, 1, tent(20)), 14, 'arrondi à la seconde au-dessus');
  assert.equal(W.healSecondsPerUnit(inf, []), 36, 'sans tente : la durée du niveau 1');
});

test('blessés : part des pertes selon la tente de la capitale, la civilisation, la Médecine et les bâtiments de faction, plafonnée', () => {
  const Wc = config.wounded;
  assert.equal(W.woundedRate(tent(5), 'ROME'), Wc.baseRate + 5 * Wc.bonusPerHealingLevel);
  assert.ok(Math.abs(W.woundedRate(tent(5), 'ROME', 2) - (Wc.baseRate + 5 * Wc.bonusPerHealingLevel + 0.02)) < 1e-9);
  assert.equal(W.woundedRate(tent(20, [{ key: 'ROMAN_THERMAE', level: 20 }]), 'GREEK', 10), Wc.maxRate);
});

// ---- soins : lancement (transaction factice) ----
function healDb({ rows, capital, nowHealing = [] }) {
  const updates = [];
  const tx = fakeTx({
    city: { findMany: async () => [{ isCapital: true, buildings: capital }] },
    woundedUnit: {
      findFirst: async ({ where }) => rows.find(r => r.cityId === where.cityId && r.unitKey === where.unitKey) || null,
      findMany: async () => nowHealing,
      update: async ({ where, data }) => { updates.push({ where, data }); return {}; }
    }
  });
  return { tx, updates };
}

test('lancer un soin : paie sur toutes les villes (la capitale d\'abord), prend les lits libres, finit après les soins en cours', async () => {
  const inf = unit('ROME', 'INFANTRY', 'base');
  const busyUntil = Date.now() + 3600000;
  const { tx, updates } = healDb({ rows: [{ id: 'w1', cityId: 'col', unitKey: inf.key, count: 0, waiting: 300 }], capital: tent(1), nowHealing: [{ count: 50, healsAt: new Date(busyUntil) }] });
  const cities = [city('cap', 10000, { isCapital: true }), city('col', 10000)];
  const out = await W.startHealing(tx, 'p1', 'col', inf.key, undefined, cities);
  assert.equal(out.started, 150, '200 lits à la tente 1, 50 déjà pris');
  assert.deepEqual(out.cost, W.healCostFor(inf, 150));
  assert.equal(tx.writes.length, 1);
  assert.equal(tx.writes[0].values[4], 'cap', 'payé dans la capitale');
  assert.deepEqual(updates[0].data.count, { increment: 150 });
  assert.deepEqual(updates[0].data.waiting, { decrement: 150 });
  assert.ok(Math.abs(out.healsAt.getTime() - (busyUntil + 150 * 36 * 1000)) < 2000, 'après les soins déjà lancés');
});

test('lancer un soin : refus clairs (pas de tente, lits pleins, ressources) et rien d\'écrit', async () => {
  const inf = unit('ROME', 'INFANTRY', 'base');
  const row = { id: 'w1', cityId: 'cap', unitKey: inf.key, count: 0, waiting: 10 };
  const cities = () => [city('cap', 10000, { isCapital: true })];
  await assert.rejects(W.startHealing(healDb({ rows: [row], capital: [] }).tx, 'p1', 'cap', inf.key, 5, cities()), /Construisez la Tente de soins/);
  await assert.rejects(W.startHealing(healDb({ rows: [row], capital: tent(1), nowHealing: [{ count: 200, healsAt: new Date() }] }).tx, 'p1', 'cap', inf.key, 5, cities()), /lits de la Tente de soins sont occupés/);
  await assert.rejects(W.startHealing(healDb({ rows: [], capital: tent(1) }).tx, 'p1', 'cap', inf.key, 5, cities()), (e) => e.status === 404);
  const poor = healDb({ rows: [row], capital: tent(1) });
  await assert.rejects(W.startHealing(poor.tx, 'p1', 'cap', inf.key, 5, [city('cap', 10, { isCapital: true })]), /il manque .* \(toutes vos villes comprises\)/);
  assert.equal(poor.tx.writes.length + poor.updates.length, 0);
});

test('soins : la fin d\'un soin vient après les soins en cours ; la liste des blessés montre ce délai complet', async () => {
  const inf = unit('ROME', 'INFANTRY', 'base');
  const now = Date.parse('2026-10-30T12:00:00Z');
  assert.equal(W.healEndsAt(0, inf, 10, tent(1), now).getTime(), now + 360 * 1000, 'tente libre : 10 × 36 s');
  assert.equal(W.healEndsAt(now + 3600000, inf, 10, tent(1), now).getTime(), now + 3600000 + 360 * 1000, 'après l\'heure de soins déjà lancée');
  // GET /wounded : 150 lits libres sur 200 à la tente 1, une heure de soins en cours
  const prisma = require('../../src/config/database');
  const busy = new Date(Date.now() + 3600000);
  const saved = { woundedUnit: prisma.woundedUnit, city: prisma.city };
  let stock = [{ wood: 50000, stone: 50000, iron: 50000, food: 50000 }];
  Object.assign(prisma, {
    woundedUnit: { findMany: async ({ where }) => (where.count ? [{ count: 50, healsAt: busy }] : [{ id: 'w1', cityId: 'col', unitKey: inf.key, count: 0, waiting: 300, healsAt: W.NO_HEAL, city: { name: 'Colonie' } }]) },
    city: { findMany: async (q) => (q.select.buildings ? [{ isCapital: true, buildings: tent(1) }] : stock) }
  });
  try {
    const [row] = await W.woundedView('p1');
    assert.equal(row.cityName, 'Colonie');
    assert.equal(row.healable, 150);
    assert.deepEqual(row.healCost, W.healCostFor(inf, 150));
    assert.ok(Math.abs(row.healSeconds - (3600 + 150 * 36)) <= 2, `${row.healSeconds} s : l'heure en cours, puis 150 × 36 s`);
    assert.equal(row.instantGold, 0, 'personne au lit : pas de soin à l\'or');
    // stock de deux villes qui ne paie que 40 soins : le bouton en soigne 40
    const c40 = W.healCostFor(inf, 40);
    stock = [{ wood: c40.wood, stone: c40.stone, iron: 0, food: c40.food }, { wood: 0, stone: 0, iron: c40.iron + 5, food: 0 }];
    const [part] = await W.woundedView('p1');
    assert.equal(part.healable, 40);
    assert.deepEqual(part.healCost, c40);
    // rien de payable : tous les lits libres, pour montrer ce qui manque
    stock = [{ wood: 0, stone: 0, iron: 0, food: 0 }];
    assert.equal((await W.woundedView('p1'))[0].healable, 150);
  } finally { Object.assign(prisma, saved); }
});

// ---- marchands (décision du 31 octobre 2026) : toutes les livraisons du marché, occupés à l'aller et au retour ----
const Terrain = require('../../frontend/js/shared/terrain.js');
// Le trajet des marchands lit les villes et les points de la carte (pathfinding.getObjectCells) : ici une carte sans villes
// ni points, aucune requête réelle
async function onEmptyMap(fn) {
  const prisma = require('../../src/config/database');
  const saved = { city: prisma.city, resourceNode: prisma.resourceNode };
  Object.assign(prisma, { city: { findMany: async () => [] }, resourceNode: { findMany: async () => [] } });
  try { return await fn(); } finally { Object.assign(prisma, saved); }
}
// transaction factice du marché : villes, offres et convois de marchands en mémoire ; chaque écriture SQL est notée
function marketDb({ cities = {}, convoys = [], offers = [], players = {}, capital = [] } = {}) {
  const log = [];
  const sum = (rows) => rows.reduce((t, r) => t + (r.merchants || 0), 0);
  const tx = {
    log, convoys, offers,
    $executeRaw: async (strings, ...values) => { log.push([strings.join('?').trim().split(/\s+/).slice(0, 2).join(' '), ...values]); return 1; },
    $queryRaw: async (strings, ...values) => {
      const sql = strings.join('?');
      if (sql.includes('DELETE FROM "TradeConvoy"')) { const k = convoys.findIndex(c => c.id === values[0] && c.deliveredAt); if (k < 0) return []; const [c] = convoys.splice(k, 1); return [c]; }
      // marchands occupés : convois du joueur et ses offres actives, dans la même requête (comme PostgreSQL : un BigInt)
      if (sql.includes('AS busy')) { log.push(['busy', ...values]); return [{ busy: BigInt(sum(convoys.filter(c => c.playerId === values[0])) + sum(offers.filter(o => o.sellerId === values[1] && o.status === 'ACTIVE'))) }]; }
      log.push(['lock', values[0]]); return [];
    },
    city: {
      findUnique: async ({ where }) => cities[where.id] || null,
      findFirst: async ({ where }) => Object.values(cities).find(c => (where.id ? c.id === where.id : true) && (where.playerId ? c.playerId === where.playerId : true) && (where.isCapital ? c.isCapital : true)) || null,
      findMany: async () => [{ isCapital: true, buildings: capital }]
    },
    player: { findUnique: async ({ where }) => players[where.id] || null },
    allianceMember: { findUnique: async () => null },
    tradeConvoy: {
      create: async ({ data }) => { const c = { id: `cv${convoys.length + 1}`, deliveredAt: null, ...data }; convoys.push(c); return c; },
      updateMany: async ({ where, data }) => { const c = convoys.find(x => x.id === where.id && x.deliveredAt === null); if (!c) return { count: 0 }; Object.assign(c, data); return { count: 1 }; },
      update: async ({ where, data }) => Object.assign(convoys.find(x => x.id === where.id), data)
    },
    marketOffer: {
      create: async ({ data }) => { const o = { id: `o${offers.length + 1}`, ...data }; offers.push(o); return o; },
      updateMany: async ({ where, data }) => { const o = offers.find(x => x.id === where.id && x.status === where.status); if (!o) return { count: 0 }; Object.assign(o, data); return { count: 1 }; },
      findMany: async ({ where }) => offers.filter(o => o.cityId === where.cityId && o.status === where.status)
    }
  };
  return tx;
}
const MS = require('../../src/services/marketService');
const MC = config.market.merchants;

test('marchands : autant que de niveaux du Marché de la capitale ; charge selon la civilisation (+ Comptoir et Poste du Désert) ; occupés en route et dans les offres', async () => {
  Terrain.setWorldSeed(0);
  const tx = marketDb({ capital: [{ key: 'MARKET', level: 10 }, { key: 'TRADE_OFFICE', level: 10 }], convoys: [{ playerId: 'p1', merchants: 3 }, { playerId: 'p2', merchants: 9 }], offers: [{ sellerId: 'p1', status: 'ACTIVE', merchants: 2 }, { sellerId: 'p1', status: 'COMPLETED', merchants: 5 }], players: { p1: { faction: 'GAUL' } } });
  const st = await MS.merchantState(tx, 'p1');
  assert.deepEqual(st, { total: 10, busy: 5, free: 5, capacity: Math.floor(MC.capacity.GAUL * 1.1), speed: MC.speed.GAUL });
  assert.deepEqual(tx.log.filter(([k]) => k === 'busy'), [['busy', 'p1', 'p1']], 'convois et offres comptés dans une seule requête (une seule photo de la base)');
  assert.equal(MS.merchantCapacity('SULTAN', [{ key: 'SULTAN_DESERT_OUTPOST', level: 20 }]), Math.floor(MC.capacity.SULTAN * 1.2), 'Poste du Désert : +1 % par niveau');
  assert.ok(MC.speed.GAUL === Math.max(...Object.values(MC.speed)) && MC.speed.SULTAN === Math.min(...Object.values(MC.speed)), 'la Gaule la plus rapide, le Sultanat le plus lent');
  assert.equal(MS.merchantsFor(1, 500), 1);
  assert.equal(MS.merchantsFor(1001, 500), 3);
  // refus clair quand il en manque
  const r = await MS.reserveMerchants(tx, 'p1', 6 * st.capacity, 'GAUL');
  assert.deepEqual([r.error, r.status], ['Pas assez de marchands libres (5 libres, 6 nécessaires)', 400]);
  assert.ok(tx.log.some(([sql, key]) => sql === 'SELECT pg_advisory_xact_lock(hashtext(?))' && key === 'merchants:p1'), 'verrou des marchands du joueur');
  assert.equal((await MS.reserveMerchants(tx, 'p1', st.capacity * 5, 'GAUL')).needed, 5);
});

test('envoi par marchands : stock de la ville débité, marchands occupés jusqu\'au retour (aller + retour), refus s\'il en manque', () => onEmptyMap(async () => {
  Terrain.setWorldSeed(0);
  const from = { id: 'a', playerId: 'p1', x: 0, y: 0, wood: 5000, stone: 0, iron: 0, food: 0 };
  const to = { id: 'b', playerId: 'p2', x: 12, y: 0 };
  const tx = marketDb({ cities: { a: from, b: to }, capital: [{ key: 'MARKET', level: 2 }] });
  const now = new Date('2026-10-31T12:00:00Z');
  const out = await MS.sendResources(tx, { playerId: 'p1', faction: 'ROME', fromCity: from, toCity: to, resources: { wood: MC.capacity.ROME + 1 }, now });
  assert.equal(out.merchantsUsed, 2);
  const secs = (out.arrivalAt - now) / 1000;
  assert.ok(secs > 0 && out.returnAt - now === 2 * secs * 1000, 'le retour dure autant que l\'aller');
  assert.deepEqual(Object.keys(out).sort(), ['arrivalAt', 'merchantsUsed', 'returnAt']);
  assert.equal(tx.convoys.length, 1);
  assert.deepEqual([tx.convoys[0].kind, tx.convoys[0].merchants, tx.convoys[0].wood, tx.convoys[0].fromCityId, tx.convoys[0].toCityId], ['SEND', 2, MC.capacity.ROME + 1, 'a', 'b']);
  assert.ok(tx.log.some(([sql, ...v]) => sql === 'UPDATE "City"' && v.includes('a')), 'stock de la ville de départ débité');
  // plus un seul marchand libre : refusé, rien n'est écrit
  const again = await MS.sendResources(tx, { playerId: 'p1', faction: 'ROME', fromCity: from, toCity: to, resources: { wood: 10 }, now });
  assert.equal(again.error, 'Pas assez de marchands libres (0 libres, 1 nécessaires)');
  assert.equal(tx.convoys.length, 1);
  assert.equal((await MS.sendResources(tx, { playerId: 'p1', faction: 'ROME', fromCity: from, toCity: to, resources: {}, now })).status, 400);
}));

test('offre : marchands du vendeur réservés avec les marchandises ; échange : chaque côté part avec ses marchands, taxe déduite', () => onEmptyMap(async () => {
  Terrain.setWorldSeed(0);
  const seller = { id: 'a', playerId: 'p1', x: 0, y: 0, wood: 5000, stone: 0, iron: 0, food: 0, buildings: [] };
  const buyer = { id: 'b', playerId: 'p2', x: 12, y: 0, wood: 0, stone: 0, iron: 3000, food: 0, buildings: [] };
  const tx = marketDb({ cities: { a: seller, b: buyer }, capital: [{ key: 'MARKET', level: 5 }] });
  const created = await MS.createOffer(tx, { playerId: 'p1', faction: 'ROME', city: seller, sellResource: 'wood', sellAmount: 1200, buyResource: 'iron', buyAmount: 900 });
  assert.deepEqual([created.merchantsUsed, created.offer.merchants, created.offer.status, created.arrivalAt], [3, 3, 'ACTIVE', null]);
  assert.equal((await MS.merchantState(tx, 'p1', 'ROME')).free, 2, 'les marchands de l\'offre attendent');
  const deal = await MS.acceptOffer(tx, { offer: created.offer, buyerId: 'p2', buyerFaction: 'GAUL', buyerCity: buyer, sellerCity: seller, sellerFaction: 'ROME' });
  const tax = config.market.p2pTaxPctBase;
  assert.deepEqual([deal.toBuyer, deal.toSeller, deal.seller.merchantsUsed, deal.buyer.merchantsUsed], [Math.floor(1200 * (1 - tax / 100)), Math.floor(900 * (1 - tax / 100)), 3, 2]);
  assert.equal(created.offer.status, 'COMPLETED');
  assert.deepEqual(tx.convoys.map(c => [c.playerId, c.kind, c.fromCityId, c.toCityId, c.merchants]), [['p1', 'TRADE', 'a', 'b', 3], ['p2', 'TRADE', 'b', 'a', 2]]);
  assert.equal((await MS.merchantState(tx, 'p1', 'ROME')).free, 2, 'les mêmes marchands, désormais en route');
  await assert.rejects(MS.acceptOffer(tx, { offer: created.offer, buyerId: 'p2', buyerFaction: 'GAUL', buyerCity: buyer, sellerCity: seller, sellerFaction: 'ROME' }), /offer raced/);
  // offre retirée : marchandises rendues, marchands libres
  const other = await MS.createOffer(tx, { playerId: 'p1', faction: 'ROME', city: seller, sellResource: 'wood', sellAmount: 100, buyResource: 'iron', buyAmount: 100 });
  assert.equal(await MS.closeOffer(tx, other.offer, 'CANCELLED'), true);
  assert.equal(await MS.closeOffer(tx, other.offer, 'CANCELLED'), false, 'déjà fermée');
  assert.equal((await MS.merchantState(tx, 'p1', 'ROME')).free, 2);
}));

test('arrivée des marchands : livrés jusqu\'au plafond de la ville, le reste rentre avec eux ; au retour il entre dans la ville de départ et les marchands sont libres', async () => {
  const prisma = require('../../src/config/database');
  const cities = { a: { id: 'a', playerId: 'p1', name: 'A', isCapital: true, wood: 0, stone: 0, iron: 0, food: 0, maxStorage: 5000, maxFoodStorage: 5000 }, b: { id: 'b', playerId: 'p1', name: 'B', wood: 900, stone: 0, iron: 0, food: 0, maxStorage: 1000, maxFoodStorage: 1000 } };
  const now = new Date('2026-10-31T12:00:00Z');
  const convoy = { id: 'cv1', playerId: 'p1', kind: 'ROUTE', fromCityId: 'a', toCityId: 'b', wood: 300, stone: 0, iron: 0, food: 0, merchants: 1, departedAt: new Date(now - 60000), arrivalAt: now, returnAt: new Date(now.getTime() + 60000), deliveredAt: null };
  const tx = marketDb({ cities, convoys: [convoy] });
  const saved = { tradeRoute: prisma.tradeRoute, tradeConvoy: prisma.tradeConvoy, $transaction: prisma.$transaction };
  Object.assign(prisma, {
    tradeRoute: { findMany: async () => [] },
    tradeConvoy: { findMany: async ({ where }) => tx.convoys.filter(c => (where.deliveredAt === null ? !c.deliveredAt && c.arrivalAt <= where.arrivalAt.lte : !!c.deliveredAt && c.returnAt <= where.returnAt.lte)) },
    $transaction: async (fn) => fn(tx)
  });
  try {
    await MS.processTradeRoutes(now);
    assert.ok(convoy.deliveredAt, 'livré');
    assert.deepEqual([convoy.wood, tx.convoys.length], [200, 1], '100 tiennent à B, 200 restent chargés ; les marchands rentrent');
    assert.ok(tx.log.some(([sql, ...v]) => sql === 'UPDATE "City"' && v.at(-1) === 'b' && v.includes(100)), '100 crédités à B');
    assert.deepEqual(tx.log.filter(([k]) => k === 'lock').map(([, id]) => id), ['b'], 'seule la ville d\'arrivée est verrouillée à la livraison');
    await MS.processTradeRoutes(new Date(now.getTime() + 60000));
    assert.equal(tx.convoys.length, 0, 'rentrés : marchands libres');
    assert.ok(tx.log.some(([sql, ...v]) => sql === 'UPDATE "City"' && v.at(-1) === 'a' && v.includes(200)), 'les 200 reviennent à A');
  } finally { Object.assign(prisma, saved); }
});

test('arrivée chez un ennemi ou dans une ville disparue : rien n\'est livré, tout rentre ; la Ville Merveille prend tout', async () => {
  const cities = { w: { id: 'w', playerId: 'p1', name: 'Merveille', isWonder: true, wood: 0, maxStorage: 10, maxFoodStorage: 10 } };
  const tx = marketDb({ cities, convoys: [
    { id: 'cv1', playerId: 'p1', kind: 'SEND', fromCityId: 'a', toCityId: 'gone', wood: 500, stone: 0, iron: 0, food: 0, merchants: 1, deliveredAt: null },
    { id: 'cv2', playerId: 'p1', kind: 'ROUTE', fromCityId: 'a', toCityId: 'w', wood: 5000, stone: 0, iron: 0, food: 0, merchants: 10, deliveredAt: null }
  ] });
  const prisma = require('../../src/config/database');
  const saved = { $transaction: prisma.$transaction };
  const deposits = [];
  tx.city.update = async (q) => { deposits.push(q); return {}; };
  prisma.$transaction = async (fn) => fn(tx);
  try {
    const gone = await MS.deliverConvoy(tx.convoys[0]);
    assert.deepEqual([gone.open, tx.convoys[0].wood], [false, 500], 'tout rentre');
    const wonder = await MS.deliverConvoy(tx.convoys[1]);
    assert.equal(wonder.open, true);
    assert.equal(deposits.length, 1, 'au stock du chantier de la Merveille, sans plafond');
    assert.equal(tx.convoys[1].wood, 0, 'rien ne reste chargé');
    assert.equal(await MS.deliverConvoy(tx.convoys[1]), null, 'livré une seule fois');
  } finally { Object.assign(prisma, saved); }
});

test('offre expirée : verrou de l\'offre puis de sa ville (même ordre que l\'acceptation), marchandises rendues, marchands libres', async () => {
  const prisma = require('../../src/config/database');
  const cities = { a: { id: 'a', playerId: 'p1', wood: 0, maxStorage: 5000, maxFoodStorage: 5000 } };
  const offer = { id: 'o1', sellerId: 'p1', cityId: 'a', sellResource: 'wood', sellAmount: 700, buyResource: 'iron', buyAmount: 500, status: 'ACTIVE', merchants: 2, expiresAt: new Date(0) };
  const tx = marketDb({ cities, offers: [offer], capital: [{ key: 'MARKET', level: 5 }], players: { p1: { faction: 'ROME' } } });
  const saved = { marketOffer: prisma.marketOffer, $transaction: prisma.$transaction, notification: prisma.notification };
  Object.assign(prisma, {
    marketOffer: { findMany: async () => tx.offers.filter(o => o.status === 'ACTIVE' && o.expiresAt <= new Date()) },
    $transaction: async (fn) => fn(tx),
    notification: { create: async () => ({ id: 'n1' }) }
  });
  try {
    assert.equal((await MS.merchantState(tx, 'p1')).free, 3, 'les marchands de l\'offre attendent');
    assert.equal(await MS.expireOffers(new Date()), 1);
    assert.deepEqual(tx.log.filter(([k]) => k === 'lock').map(([, id]) => id), ['o1', 'a'], 'l\'offre puis la ville');
    assert.equal(offer.status, 'EXPIRED');
    assert.ok(tx.log.some(([sql, ...v]) => sql === 'UPDATE "City"' && v.at(-1) === 'a' && v.includes(700)), 'les 700 de bois reviennent dans la ville');
    assert.equal((await MS.merchantState(tx, 'p1')).free, 5, 'marchands libres');
    assert.equal(await MS.expireOffers(new Date()), 0, 'déjà rendue');
  } finally { Object.assign(prisma, saved); }
});

test('route commerciale : la charge se réduit à ce que les marchands libres portent ; sans marchand libre, rien ne part', () => {
  assert.deepEqual(MS.fitLoad({ wood: 600, stone: 0, iron: 0, food: 400 }, 2000), { wood: 600, stone: 0, iron: 0, food: 400 });
  assert.deepEqual(MS.fitLoad({ wood: 600, stone: 0, iron: 0, food: 400 }, 500), { wood: 300, stone: 0, iron: 0, food: 200 });
  assert.deepEqual(MS.fitLoad({ wood: 600, stone: 0, iron: 0, food: 400 }, 0), { wood: 0, stone: 0, iron: 0, food: 0 });
});
