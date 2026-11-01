// Économie (décisions du 30 octobre 2026, rapport économie) : stock partagé entre les villes d'un joueur (répartition d'une
// dépense et d'un remboursement, message de ce qui manque), coût et durée d'un niveau (champs ×1,45 en coût, champs et
// Bâtiment principal ×1,30 en temps), recrutement, plafonds des quêtes sans les Grands, soins payants, marché porté par des
// armées (plus de marchands ni de routes entre ses villes, décision du 31 octobre 2026).
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

// ---- plafonds des quêtes sans les Grands (recommandation 12, option A) ----
test('quêtes : plafonds calculés sur le Dépôt et le Silo seuls, sans le Grand dépôt ni le Grand silo', () => {
  const q = require('../../src/services/questService');
  const plain = [{ key: 'WAREHOUSE', level: 20 }, { key: 'SILO', level: 10 }];
  const great = [...plain, { key: 'GREAT_WAREHOUSE', level: 20 }, { key: 'GREAT_SILO', level: 20 }];
  assert.deepEqual(calc.storageCapsWithoutGreat(great), calc.cityStorageCaps(plain));
  assert.ok(calc.cityStorageCaps(great).maxStorage > calc.cityStorageCaps(plain).maxStorage);
  const cap = q.rewardCap([{ buildings: great }, { buildings: [{ key: 'WAREHOUSE', level: 5 }] }]);
  assert.equal(cap.wood, calc.getStorageAtLevel('WAREHOUSE', 20, buildingsData) / 2, 'la moitié du plus grand dépôt');
  assert.equal(cap.food, calc.getStorageAtLevel('SILO', 10, buildingsData) / 2);
  assert.deepEqual(q.rewardCap([{ buildings: [] }]), { wood: 500, stone: 500, iron: 500, food: 500 }, 'sans dépôt : la réserve de base');
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

// ---- marché porté par des armées (décision du 31 octobre 2026) : plus de marchands ni de routes entre ses villes ----
const Terrain = require('../../frontend/js/shared/terrain.js');
const MS = require('../../src/services/marketService');
const { factionsData } = require('../../src/config/gamedata');
// Le trajet lit les villes et les points de la carte (pathfinding.getObjectCells), le Bastion l'alliance du joueur : ici une
// carte sans villes ni points, sans alliance ; aucune requête réelle
async function onEmptyMap(fn) {
  const prisma = require('../../src/config/database');
  const saved = { city: prisma.city, resourceNode: prisma.resourceNode, allianceMember: prisma.allianceMember };
  Object.assign(prisma, { city: { findMany: async () => [] }, resourceNode: { findMany: async () => [] }, allianceMember: { findUnique: async () => null } });
  Terrain.setWorldSeed(0);
  try { return await fn(); } finally { Object.assign(prisma, saved); }
}
// transaction factice du marché : stock des villes débité et crédité comme debitCity / creditCity, armées, offres ; les
// verrous sont notés dans l'ordre
function marketDb({ cities = {}, armies = [], offers = [], capital = [] } = {}) {
  const locks = [];
  const match = (row, where) => Object.entries(where).every(([k, v]) => row[k] === v);
  return {
    locks, cities, armies, offers,
    $queryRaw: async (strings, ...values) => { locks.push(values[0]); return []; },
    $executeRaw: async (strings, ...values) => {
      const c = cities[values[4]];
      if (!c) return 0;
      if (strings.join('?').includes('GREATEST')) { db.RESOURCES.forEach((r, i) => { c[r] = Math.max(c[r], Math.min(c[r] + values[i], r === 'food' ? c.maxFoodStorage : c.maxStorage)); }); return 1; }
      if (db.RESOURCES.some((r, i) => c[r] < values[i])) return 0;
      db.RESOURCES.forEach((r, i) => { c[r] -= values[i]; });
      return 1;
    },
    city: { findUnique: async ({ where }) => cities[where.id] || null, findMany: async () => [{ isCapital: true, buildings: capital }] },
    cityBuilding: { findMany: async () => [] },
    playerTechnology: { findMany: async () => [] },
    army: {
      findMany: async ({ where }) => armies.filter(a => match(a, where)),
      findFirst: async ({ where }) => armies.find(a => match(a, where)) || null,
      updateMany: async ({ where, data }) => { const a = armies.find(x => match(x, where)); if (!a) return { count: 0 }; Object.assign(a, data); return { count: 1 }; }
    },
    marketOffer: {
      create: async ({ data }) => { const o = { id: `o${offers.length + 1}`, ...data }; offers.push(o); return o; },
      updateMany: async ({ where, data }) => { const o = offers.find(x => match(x, where)); if (!o) return { count: 0 }; Object.assign(o, data); return { count: 1 }; },
      findMany: async ({ where }) => offers.filter(o => match(o, where))
    }
  };
}
const SLAVE = unitsData.find(u => u.key === 'EGY_INF_ESCLAVE');
const marketArmy = (id, count, extra = {}) => ({ id, name: `Armée ${id}`, ownerId: 'p1', cityId: 'a', status: 'IDLE', isGarrison: false, x: 0, y: 0, units: [{ unitKey: SLAVE.key, tier: SLAVE.tier, count }], hero: null, ...extra });
const marketCity = (id, playerId, x, stock = 0) => ({ id, playerId, name: `Ville ${id}`, x, y: 0, buildings: [], wood: stock, stone: stock, iron: stock, food: stock, maxStorage: 100000, maxFoodStorage: 100000 });

test('marché : plus de marchands ni de routes, taxe des échanges 30 % (5 % avec Comptoir 20 et Chambre au Trésor 20)', async () => {
  assert.equal(config.market.merchants, undefined);
  assert.equal(config.market.routes, undefined);
  assert.equal(def('MARKET').effects.merchantsPerLevel, undefined);
  for (const k of ['MARKET', 'TRADE_OFFICE', 'SULTAN_DESERT_OUTPOST']) assert.doesNotMatch(def(k).description, /marchands/, k);
  assert.equal(config.market.p2pTaxPctBase, 30);
  const tax = (capital) => MS.p2pTaxPct({ city: { findUnique: async () => ({ playerId: 'p1', buildings: [] }), findMany: async () => [{ isCapital: true, buildings: capital }] } }, 'a');
  assert.equal(await tax([]), 30);
  assert.equal(await tax([{ key: 'TRADE_OFFICE', level: 20 }, { key: 'TREASURE_CHAMBER', level: 20 }]), 5);
  assert.equal(await tax([{ key: 'TRADE_OFFICE', level: 7 }]), 23, 'chaque niveau du Comptoir compte');
  // la même règle sans requête (outils de simulation) : 30 → 25 (Chambre 20) → 5 (les deux au 20), jamais sous 0
  assert.deepEqual([[], [{ key: 'TREASURE_CHAMBER', level: 20 }], [{ key: 'TRADE_OFFICE', level: 20 }, { key: 'TREASURE_CHAMBER', level: 20 }], [{ key: 'TRADE_OFFICE', level: 40 }]].map(MS.p2pTaxPctOf), [30, 25, 5, 0]);
  assert.equal(MS.afterTax(1000, 30), 700);
});

test('marché : armées libres de la ville et leur charge (civilisation, Marché, Comptoir et Poste du Désert de la capitale), la plus petite qui suffit', () => onEmptyMap(async () => {
  const home = marketCity('a', 'p1', 0);
  const capital = [{ key: 'MARKET', level: 10 }, { key: 'TRADE_OFFICE', level: 5 }, { key: 'SULTAN_DESERT_OUTPOST', level: 4 }];
  const armies = [marketArmy('big', 100), marketArmy('small', 10), marketArmy('hero', 5, { heroId: 'h1' }), marketArmy('garrison', 500, { isGarrison: true }), marketArmy('away', 500, { x: 9 }), marketArmy('busy', 500, { status: 'MARKET' }), marketArmy('empty', 0)];
  const tx = marketDb({ cities: { a: home }, capital, armies });
  assert.equal(fx.transportBonusPct(capital), 10 * 5 + 5 + 4, 'Marché +5 %, Comptoir +1 %, Poste du Désert +1 % par niveau');
  const mult = (1 + calc.getFactionBonus('EGYPT', 'transportCapacity', factionsData) / 100) * (1 + fx.transportBonusPct(capital) / 100);
  const cap = (n) => Math.floor(calc.getArmyCarryCapacity([{ unitKey: SLAVE.key, count: n }], unitsData) * mult);
  assert.equal(await MS.transportMult(capital, 'EGYPT', 'p1'), mult);
  const free = await MS.freeTransportArmies(tx, home, 'p1', 'EGYPT');
  assert.deepEqual(free.map(f => [f.army.id, f.capacity]), [['hero', cap(5)], ['small', cap(10)], ['big', cap(100)]], 'en ville, hors garnison, avec des soldats, la plus petite d\'abord');
  assert.equal((await MS.pickTransportArmy(tx, home, 'p1', 'EGYPT', cap(5))).army.id, 'small', 'sans le héros quand une autre armée suffit (une offre la retient 48 h)');
  assert.equal((await MS.pickTransportArmy(tx, home, 'p1', 'EGYPT', cap(10))).army.id, 'small');
  assert.equal((await MS.pickTransportArmy(tx, home, 'p1', 'EGYPT', cap(10) + 1)).army.id, 'big');
  assert.equal((await MS.pickTransportArmy(tx, home, 'p1', 'EGYPT', 1, 'big')).army.id, 'big', 'l\'armée choisie');
  assert.equal((await MS.pickTransportArmy(tx, home, 'p1', 'EGYPT', cap(100) + 1)).error, `Capacité de transport insuffisante : ${cap(100) + 1} à porter, ${cap(100)} au mieux`);
  assert.equal((await MS.pickTransportArmy(tx, home, 'p1', 'EGYPT', 1, 'busy')).error, 'Cette armée n\'est pas libre en ville');
  assert.match((await MS.pickTransportArmy(marketDb({ cities: { a: home } }), home, 'p1', 'EGYPT', 1)).error, /^Aucune armée libre en ville/);
}));

test('envoi à un joueur : stock de la ville débité, une armée part avec la cargaison (retour aussi long que l\'aller) ; refus sans rien écrire', () => onEmptyMap(async () => {
  const from = marketCity('a', 'p1', 0, 5000), to = marketCity('b', 'p2', 12);
  const tx = marketDb({ cities: { a: from, b: to }, armies: [marketArmy('small', 10), marketArmy('big', 100)] });
  const small = Math.floor(calc.getArmyCarryCapacity([{ unitKey: SLAVE.key, count: 10 }], unitsData) * (1 + calc.getFactionBonus('EGYPT', 'transportCapacity', factionsData) / 100));
  const now = new Date('2026-10-31T12:00:00Z');
  const out = await MS.sendResources(tx, { playerId: 'p1', faction: 'EGYPT', fromCity: from, toCity: to, resources: { wood: small, iron: 1 }, now });
  assert.deepEqual(Object.keys(out).sort(), ['armyId', 'armyName', 'arrivalAt', 'returnAt', 'travelTime']);
  assert.equal(out.armyId, 'big', 'la plus petite armée qui porte tout');
  assert.ok(out.travelTime > 0 && out.arrivalAt - now === out.travelTime * 1000 && out.returnAt - now === 2 * out.travelTime * 1000);
  const big = tx.armies.find(a => a.id === 'big');
  assert.deepEqual([big.status, big.missionType, big.targetCityId, big.carryWood, big.carryIron, big.carryStone], ['TRANSPORTING', 'TRANSPORT', 'b', small, 1, 0]);
  assert.deepEqual([from.wood, from.iron], [5000 - small, 4999]);
  assert.deepEqual(tx.locks, ['a'], 'la ville de départ verrouillée');
  // trop lourd pour l'armée restante : rien ne bouge
  assert.equal((await MS.sendResources(tx, { playerId: 'p1', faction: 'EGYPT', fromCity: from, toCity: to, resources: { wood: small + 1 }, now })).error, `Capacité de transport insuffisante : ${small + 1} à porter, ${small} au mieux`);
  assert.equal((await MS.sendResources(tx, { playerId: 'p1', faction: 'EGYPT', fromCity: from, toCity: to, resources: {}, now })).status, 400);
  // pas assez de stock dans la ville : refusé, l'armée reste
  const empty = marketCity('a', 'p1', 0, 0);
  const poor = marketDb({ cities: { a: empty, b: to }, armies: [marketArmy('small', 10)] });
  assert.deepEqual(await MS.sendResources(poor, { playerId: 'p1', faction: 'EGYPT', fromCity: empty, toCity: to, resources: { food: 1 }, now }), { error: 'Ressources insuffisantes', status: 400 });
  assert.equal(poor.armies[0].status, 'IDLE');
}));

test('offre : l\'armée du vendeur attend avec les marchandises ; échange : chaque armée part avec sa part moins la taxe ; retrait : tout est rendu', () => onEmptyMap(async () => {
  const seller = marketCity('a', 'p1', 0, 5000), buyer = marketCity('b', 'p2', 12, 5000);
  const tx = marketDb({ cities: { a: seller, b: buyer }, armies: [marketArmy('s1', 100), marketArmy('s2', 100), marketArmy('b1', 100, { ownerId: 'p2', cityId: 'b', x: 12 })] });
  const now = new Date('2026-10-31T12:00:00Z');
  const created = await MS.createOffer(tx, { playerId: 'p1', faction: 'EGYPT', city: seller, sellResource: 'wood', sellAmount: 1200, buyResource: 'iron', buyAmount: 900, now });
  assert.deepEqual([created.armyId, created.offer.armyId, created.offer.status, created.offer.expiresAt - now], ['s1', 's1', 'ACTIVE', config.market.offerHours * 3600000]);
  assert.deepEqual([tx.armies[0].status, tx.armies[0].missionType, seller.wood], ['MARKET', 'MARKET_OFFER', 3800], 'l\'armée attend en ville, les marchandises sont prises');
  const deal = await MS.acceptOffer(tx, { offer: created.offer, buyerId: 'p2', buyerFaction: 'EGYPT', buyerCity: buyer, sellerCity: seller, sellerFaction: 'EGYPT', now });
  const tax = config.market.p2pTaxPctBase;
  assert.deepEqual([deal.toBuyer, deal.toSeller, deal.sellerTax, deal.buyerTax], [Math.floor(1200 * (1 - tax / 100)), Math.floor(900 * (1 - tax / 100)), tax, tax]);
  assert.deepEqual([deal.seller.armyId, deal.buyer.armyId, created.offer.status, buyer.iron], ['s1', 'b1', 'COMPLETED', 4100]);
  const [s1, , b1] = tx.armies;
  assert.deepEqual([s1.status, s1.missionType, s1.targetCityId, s1.carryWood], ['TRANSPORTING', 'MARKET_DELIVERY', 'b', deal.toBuyer]);
  assert.deepEqual([b1.status, b1.missionType, b1.targetCityId, b1.carryIron], ['TRANSPORTING', 'MARKET_DELIVERY', 'a', deal.toSeller]);
  assert.ok(deal.buyer.returnAt > deal.buyer.arrivalAt, 'l\'acheteur sait quand son armée rentre');
  // offre déjà prise : l'armée du vendeur est partie
  const again = await MS.acceptOffer(tx, { offer: created.offer, buyerId: 'p2', buyerFaction: 'EGYPT', buyerCity: buyer, sellerCity: seller, sellerFaction: 'EGYPT', now });
  assert.deepEqual([again.error, again.status], ['L\'armée du vendeur n\'est plus disponible', 409]);
  // offre retirée : marchandises rendues, armée libre
  const other = await MS.createOffer(tx, { playerId: 'p1', faction: 'EGYPT', city: seller, sellResource: 'stone', sellAmount: 100, buyResource: 'iron', buyAmount: 100, now });
  assert.equal(tx.armies[1].status, 'MARKET');
  assert.equal(await MS.closeOffer(tx, other.offer, 'CANCELLED'), true);
  assert.deepEqual([tx.armies[1].status, tx.armies[1].missionType, seller.stone, other.offer.status], ['IDLE', null, 5000, 'CANCELLED']);
  assert.equal(await MS.closeOffer(tx, other.offer, 'CANCELLED'), false, 'déjà fermée');
}));

test('échange : une armée partie entre-temps annule tout ; celle de l\'acheteur « army busy » (409 Armée déjà en mission), celle du vendeur « offer raced »', () => onEmptyMap(async () => {
  const now = new Date('2026-10-31T12:00:00Z');
  // une autre requête vient de faire partir l'armée `gone` : sa transition échoue, la transaction de l'appelant est annulée
  async function race(gone) {
    const seller = marketCity('a', 'p1', 0, 5000), buyer = marketCity('b', 'p2', 12, 5000);
    const tx = marketDb({ cities: { a: seller, b: buyer }, armies: [marketArmy('s1', 100), marketArmy('b1', 100, { ownerId: 'p2', cityId: 'b', x: 12 })] });
    const { offer } = await MS.createOffer(tx, { playerId: 'p1', faction: 'EGYPT', city: seller, sellResource: 'wood', sellAmount: 1000, buyResource: 'iron', buyAmount: 800, now });
    const update = tx.army.updateMany;
    tx.army.updateMany = async (q) => (q.where.id === gone ? { count: 0 } : update(q));
    return MS.acceptOffer(tx, { offer, buyerId: 'p2', buyerFaction: 'EGYPT', buyerCity: buyer, sellerCity: seller, sellerFaction: 'EGYPT', now });
  }
  await assert.rejects(race('b1'), /^Error: army busy$/);
  await assert.rejects(race('s1'), /^Error: offer raced$/);
  const route = require('fs').readFileSync(require('path').join(__dirname, '../../src/routes/market.js'), 'utf8');
  const accept = route.slice(route.indexOf('router.post(\'/offer/:id/accept\''), route.indexOf('router.delete(\'/offer/:id\''));
  assert.match(accept, /e\.message === 'army busy'\) return res\.status\(409\)\.json\(\{ error: 'Armée déjà en mission' \}\)/);
}));

test('offre expirée : verrou de l\'offre puis de sa ville (même ordre que l\'acceptation), marchandises rendues, armée libre', async () => {
  const prisma = require('../../src/config/database');
  const home = marketCity('a', 'p1', 0, 0);
  const offer = { id: 'o1', sellerId: 'p1', cityId: 'a', sellResource: 'wood', sellAmount: 700, buyResource: 'iron', buyAmount: 500, status: 'ACTIVE', armyId: 's1', expiresAt: new Date(0) };
  const tx = marketDb({ cities: { a: home }, offers: [offer], armies: [marketArmy('s1', 100, { status: 'MARKET', missionType: 'MARKET_OFFER' })] });
  const saved = { marketOffer: prisma.marketOffer, $transaction: prisma.$transaction, notification: prisma.notification };
  Object.assign(prisma, {
    marketOffer: { findMany: async () => tx.offers.filter(o => o.status === 'ACTIVE' && o.expiresAt <= new Date()) },
    $transaction: async (fn) => fn(tx),
    notification: { create: async () => ({ id: 'n1' }) }
  });
  try {
    assert.equal(await MS.expireOffers(new Date()), 1);
    assert.deepEqual(tx.locks, ['o1', 'a'], 'l\'offre puis la ville');
    assert.deepEqual([offer.status, home.wood, tx.armies[0].status, tx.armies[0].missionType], ['EXPIRED', 700, 'IDLE', null]);
    assert.equal(await MS.expireOffers(new Date()), 0, 'déjà rendue');
  } finally { Object.assign(prisma, saved); }
});

test('purge horaire : les offres closes depuis 30 jours partent, expirées comprises (simulation du 1er novembre 2026 : 221 gardées)', async () => {
  const prisma = require('../../src/config/database');
  const { purgeOldRecords } = require('../../src/game/processors/worldProcessor');
  const asked = {};
  const del = (name) => ({ deleteMany: async ({ where }) => { asked[name] = where; return { count: 0 }; } });
  const models = ['spyReport', 'expedition', 'marketOffer', 'analyticsEvent', 'rateLimitBucket', 'authToken', 'notification'];
  const saved = Object.fromEntries([...models, '$executeRaw'].map(k => [k, prisma[k]]));
  Object.assign(prisma, Object.fromEntries(models.map(m => [m, del(m)])), { $executeRaw: async () => 0 });
  // purges des autres services : aucune requête
  const services = [['chatService', 'purgeOldMessages'], ['allianceHelpService', 'purgeOld'], ['questService', 'purgeOld']].map(([file, fn]) => [require(`../../src/services/${file}`), fn]);
  const savedFns = services.map(([mod, fn]) => mod[fn]);
  for (const [mod, fn] of services) mod[fn] = async () => 0;
  try {
    const now = new Date('2027-06-01T12:00:00Z');
    await purgeOldRecords(now);
    assert.deepEqual(asked.marketOffer.status.in.sort(), ['CANCELLED', 'COMPLETED', 'EXPIRED']);
    assert.equal(asked.marketOffer.createdAt.lt.getTime(), now.getTime() - config.tick.retentionDays.offers * 86400000);
  } finally {
    Object.assign(prisma, saved);
    services.forEach(([mod, fn], i) => { mod[fn] = savedFns[i]; });
  }
});

test('migration 0033 : marchands et routes retirés, armée réservée de nouveau sur les offres, marchandises rendues jusqu\'au plafond, rejouable', () => {
  const sql = require('fs').readFileSync(require('path').join(__dirname, '../../prisma/migrations/0033_sans_marchands/migration.sql'), 'utf8');
  assert.match(sql, /ALTER TABLE "MarketOffer" ADD COLUMN IF NOT EXISTS "armyId" TEXT;/);
  assert.match(sql, /UPDATE "MarketOffer" SET status = 'CANCELLED' WHERE status = 'ACTIVE' AND "armyId" IS NULL;/);
  assert.ok(sql.indexOf('LEAST(c.wood  + o.wood,  c."maxStorage")') < sql.indexOf('SET status = \'CANCELLED\''), 'marchandises rendues avant l\'annulation');
  // remboursements comme creditCity (utils/db.js) : jamais un stock qui baisse, jamais au-dessus du dépôt ou du silo
  for (const t of ['o', 't']) {
    for (const r of ['wood', 'stone', 'iron']) assert.match(sql, new RegExp(`${r}\\s+= GREATEST\\(c\\.${r},\\s+LEAST\\(c\\.${r}\\s+\\+ ${t}\\.${r},\\s+c\\."maxStorage"\\)\\)`), `${t}.${r}`);
    assert.match(sql, new RegExp(`food\\s+= GREATEST\\(c\\.food,\\s+LEAST\\(c\\.food\\s+\\+ ${t}\\.food,\\s+c\\."maxFoodStorage"\\)\\)`), `${t}.food`);
  }
  assert.doesNotMatch(sql, /= c\.(wood|stone|iron|food) \+/, 'aucun remboursement sans plafond');
  assert.match(sql, /ALTER TABLE "MarketOffer" DROP COLUMN IF EXISTS "merchants";/);
  assert.match(sql, /UPDATE "Army" SET status = 'IDLE', "missionType" = NULL\s+WHERE status = 'MARKET' AND id NOT IN \(SELECT "armyId" FROM "MarketOffer" WHERE status = 'ACTIVE' AND "armyId" IS NOT NULL\);/);
  assert.match(sql, /IF to_regclass\('"TradeConvoy"'\) IS NOT NULL THEN[\s\S]+FROM "TradeConvoy" v[\s\S]+DROP TABLE "TradeConvoy";/, 'chargement des marchands rendu avant de supprimer la table');
  assert.match(sql, /DROP TABLE IF EXISTS "TradeRoute";/);
  // chaque instruction se rejoue : rien n'est créé ou supprimé sans IF (NOT) EXISTS hors du bloc gardé
  for (const line of sql.split('\n').filter(l => /^(ALTER|DROP|CREATE)/.test(l))) assert.match(line, /IF (NOT )?EXISTS/, line);
  const schema = require('fs').readFileSync(require('path').join(__dirname, '../../prisma/schema.prisma'), 'utf8');
  assert.doesNotMatch(schema, /model Trade(Route|Convoy)|merchants/);
  assert.match(schema, /armyId\s+String\?/);
});

// ---- armées du marché dans routes/armies.js : ni départ, ni garnison, ni rappel tant que l'échange n'est pas fini ----
const armiesRouter = require('../../src/routes/armies');
const MARKET_BUSY = 'Armée réservée pour une offre du marché : annulez l\'offre pour la libérer';
const routeOf = (router, method, routePath) => router.stack.find(l => l.route && l.route.path === routePath && l.route.methods[method]).route.stack.at(-1).handle;
const replyOf = () => {
  const r = { statusCode: 200, body: null };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
};
// l'armée vue par loadArmy (propriétaire, héros, ville) ; une seule armée dans la transaction factice
const routedArmy = (extra = {}) => ({ ...marketArmy('s1', 100), owner: { faction: 'EGYPT', name: 'Vendeur', technologies: [], alliance: null, cities: [] }, city: { id: 'a', x: 0, y: 0, isCapital: true, name: 'Capitale' }, ...extra });
function armyRouteDb(army) {
  const prisma = require('../../src/config/database');
  const updates = [];
  const tx = {
    $queryRaw: async () => [],
    army: {
      findFirst: async ({ where }) => (where.isGarrison ? { id: 'garrison', units: [] } : army),
      update: async ({ data }) => { updates.push(data); Object.assign(army, data); return army; },
      updateMany: async ({ data }) => { updates.push(data); Object.assign(army, data); return { count: 1 }; }
    }
  };
  // bonus de vitesse du Bastion (lu en arrière-plan par speedPctSync) : aucune alliance
  const saved = { $transaction: prisma.$transaction, army: prisma.army, bastion: prisma.bastion };
  Object.assign(prisma, { $transaction: async (fn) => fn(tx), army: tx.army, bastion: { findMany: async () => [] } });
  return { updates, restore: () => Object.assign(prisma, saved) };
}

test('armée réservée par une offre (MARKET) : aucun départ, refus clair ; une armée libre part', () => {
  const { readyToLeave } = armiesRouter;
  assert.deepEqual(readyToLeave(routedArmy({ status: 'MARKET', missionType: 'MARKET_OFFER' }), 'partir'), { status: 400, error: MARKET_BUSY });
  assert.deepEqual(readyToLeave(routedArmy({ status: 'TRANSPORTING', missionType: 'MARKET_DELIVERY' }), 'partir'), { status: 400, error: 'Armée déjà en mission' });
  assert.equal(readyToLeave(routedArmy(), 'partir'), null);
});

test('rappel : refusé pour une armée réservée au marché ou qui livre un échange conclu ; un simple transport se rappelle', () => onEmptyMap(async () => {
  const recall = routeOf(armiesRouter, 'post', '/:id/return');
  const cases = [
    [{ status: 'MARKET', missionType: 'MARKET_OFFER' }, 400, MARKET_BUSY],
    [{ status: 'TRANSPORTING', missionType: 'MARKET_DELIVERY', targetX: 12, targetY: 0, targetCityId: 'b', departedAt: new Date(Date.now() - 60000), arrivalAt: new Date(Date.now() + 60000) }, 400, 'Armée d\'un échange conclu : elle livre puis rentre seule, on ne peut pas la rappeler'],
    [{ status: 'TRANSPORTING', missionType: 'TRANSPORT', targetX: 12, targetY: 0, targetCityId: 'b', departedAt: new Date(Date.now() - 60000), arrivalAt: new Date(Date.now() + 60000) }, 200, null]
  ];
  for (const [state, status, error] of cases) {
    const army = routedArmy(state);
    const db = armyRouteDb(army);
    try {
      const res = replyOf();
      await recall({ params: { id: 's1' }, user: { playerId: 'p1' } }, res);
      assert.equal(res.statusCode, status, `${state.status} / ${state.missionType} : ${JSON.stringify(res.body)}`);
      if (error) {
        assert.equal(res.body.error, error);
        assert.deepEqual(db.updates, [], 'rien n\'est écrit');
        assert.equal(army.status, state.status);
      } else {
        assert.deepEqual([army.status, army.missionType], ['RETURNING', 'RETURN'], 'le transport rentre avec sa cargaison');
      }
    } finally { db.restore(); }
  }
}));

test('armée réservée par une offre : ni troupes ajoutées ou retirées, ni dissolution, ni héros joint ou retiré (refus clair)', async () => {
  for (const [method, routePath, body] of [['post', '/:id/adjust-unit', { unitKey: SLAVE.key, delta: 5 }], ['post', '/:id/set-unit', { unitKey: SLAVE.key, count: 5 }], ['delete', '/:id/disband', {}], ['post', '/:id/assign-hero', {}], ['post', '/:id/unassign-hero', {}]]) {
    const army = routedArmy({ status: 'MARKET', missionType: 'MARKET_OFFER' });
    const db = armyRouteDb(army);
    try {
      const res = replyOf();
      await routeOf(armiesRouter, method, routePath)({ params: { id: 's1' }, body, user: { playerId: 'p1' } }, res);
      assert.deepEqual([res.statusCode, res.body.error], [400, MARKET_BUSY], routePath);
      assert.deepEqual(db.updates, []);
    } finally { db.restore(); }
  }
});

test('expédition : une armée réservée par une offre (MARKET) ne part pas, avec le même refus que tout départ', async () => {
  const prisma = require('../../src/config/database');
  const start = routeOf(require('../../src/routes/expeditions'), 'post', '/:id/start');
  const saved = prisma.$transaction;
  const tx = {
    expedition: { findFirst: async () => ({ id: 'e1', duration: 3600, status: 'AVAILABLE' }) },
    army: { findFirst: async () => ({ status: 'MARKET' }), findMany: async () => { throw new Error('aucune armée libre ne doit être cherchée'); } }
  };
  prisma.$transaction = async (fn) => fn(tx);
  try {
    const res = replyOf();
    await start({ params: { id: 'e1' }, body: { armyId: 's1' }, user: { playerId: 'p1' } }, res);
    assert.deepEqual([res.statusCode, res.body.error], [400, MARKET_BUSY]);
  } finally { prisma.$transaction = saved; }
});

test('transport par armée : refusé vers une de ses villes (stock commun), comme /api/trade/send ; permis vers sa Ville Merveille', async () => {
  const prisma = require('../../src/config/database');
  const transport = routeOf(armiesRouter, 'post', '/:id/transport');
  let target = null, opened = 0;
  const saved = { city: prisma.city, $transaction: prisma.$transaction };
  Object.assign(prisma, { city: { findUnique: async () => target }, $transaction: async () => { opened++; return { error: 'suite du transport', status: 418 }; } });
  try {
    target = { id: 'col', playerId: 'p1', name: 'Colonie', x: 12, y: 0, isWonder: false };
    const res = replyOf();
    await transport({ params: { id: 's1' }, body: { targetCityId: 'col', wood: 100 }, user: { playerId: 'p1' } }, res);
    assert.deepEqual([res.statusCode, res.body.error, opened], [400, MS.OWN_CITIES_SHARE_STOCK, 0], 'refus avant toute transaction');
    assert.equal(MS.OWN_CITIES_SHARE_STOCK, 'Vos villes partagent leur stock : rien à transporter entre elles');
    target = { ...target, isWonder: true };
    const wonder = replyOf();
    await transport({ params: { id: 's1' }, body: { targetCityId: 'col', wood: 100 }, user: { playerId: 'p1' } }, wonder);
    assert.deepEqual([wonder.statusCode, opened], [418, 1], 'sa Ville Merveille reçoit les transports de ses armées');
  } finally { Object.assign(prisma, saved); }
});

// ---- chute d'une ville et marché (conquestService) ----
// transaction factice de la chute : les requêtes SQL brutes sont notées dans l'ordre, les armées et les offres gardées en mémoire
function fallDb({ cities, armies = [], offers = [] }) {
  const sql = [], deleted = [], credits = [];
  const match = (row, where) => Object.entries(where).every(([k, v]) => (v && typeof v === 'object' && !(v instanceof Date) ? true : row[k] === v));
  const raw = (kind) => async (strings, ...values) => {
    const text = strings.join('?');
    sql.push(`${kind} ${text.replace(/\s+/g, ' ').trim()}`);
    if (text.includes('UPDATE "City"')) credits.push({ cityId: values[4], gain: values.slice(0, 4) });
    if (text.includes('FROM "City" WHERE "playerId"')) return Object.values(cities).map(c => ({ ...c }));
    return kind === 'exec' ? 1 : [];
  };
  const tx = {
    $queryRaw: raw('query'), $executeRaw: raw('exec'),
    city: {
      findUnique: async ({ where }) => (cities[where.id] ? { ...cities[where.id], armies: armies.filter(a => a.cityId === where.id) } : null),
      findFirst: async ({ where }) => (where.isCapital ? Object.values(cities).find(c => c.isCapital && c.playerId === where.playerId) || null : null),
      update: async ({ where, data }) => Object.assign(cities[where.id], data),
      delete: async ({ where }) => { deleted.push(`city:${where.id}`); }
    },
    player: { findUnique: async () => ({ faction: 'ROME' }) },
    hero: { updateMany: async () => ({ count: 0 }) },
    bastion: { findFirst: async () => null },
    resourceNode: { findFirst: async () => null, updateMany: async () => ({ count: 0 }) },
    researchQueueItem: { findMany: async () => [], count: async () => 0, findFirst: async () => null },
    army: {
      findMany: async () => [],
      findFirst: async () => null,
      findUnique: async ({ where }) => armies.find(a => a.id === where.id) || null,
      delete: async ({ where }) => { deleted.push(`army:${where.id}`); armies.splice(armies.findIndex(a => a.id === where.id), 1); },
      update: async ({ where, data }) => Object.assign(armies.find(a => a.id === where.id), data),
      updateMany: async ({ where, data }) => { const a = where.id && armies.find(x => match(x, where)); if (!a) return { count: 0 }; Object.assign(a, data); return { count: 1 }; },
      count: async () => 0
    },
    marketOffer: {
      findMany: async ({ where }) => offers.filter(o => match(o, where)),
      updateMany: async ({ where, data }) => { const o = offers.find(x => match(x, where)); if (!o) return { count: 0 }; Object.assign(o, data); return { count: 1 }; }
    }
  };
  const prisma = require('../../src/config/database');
  const saved = prisma.$transaction;
  prisma.$transaction = async (fn) => fn(tx);
  return { sql, deleted, credits, armies, offers, restore: () => { prisma.$transaction = saved; } };
}

test('colonie rasée : l\'armée réservée par une offre tombe avec la ville, l\'offre est annulée et ses marchandises vont à la capitale', async () => {
  const { razeCity } = require('../../src/services/conquestService');
  const capital = { id: 'cap', playerId: 'p1', isCapital: true, x: -150, y: -150, wood: 0, stone: 0, iron: 0, food: 0, maxStorage: 1e6, maxFoodStorage: 1e6 };
  const colony = { id: 'col', playerId: 'p1', name: 'Colonie', isCapital: false, wallStructure: 0, x: 20, y: 20 };
  const armies = [
    marketArmy('reserved', 50, { cityId: 'col', x: 20, y: 20, status: 'MARKET', missionType: 'MARKET_OFFER', slot: 1, name: 'Armée 1' }),
    marketArmy('idle', 50, { cityId: 'col', x: 20, y: 20, slot: 2, name: 'Armée 2' }),
    marketArmy('away', 50, { cityId: 'col', x: 40, y: 20, status: 'MOVING', missionType: 'MOVE', slot: 3, name: 'Armée 3' })
  ];
  const offers = [{ id: 'o1', sellerId: 'p1', cityId: 'col', sellResource: 'iron', sellAmount: 700, buyResource: 'wood', buyAmount: 500, status: 'ACTIVE', armyId: 'reserved' }];
  const db = fallDb({ cities: { cap: capital, col: colony }, armies, offers });
  try {
    await razeCity('col', null);
    assert.deepEqual(db.deleted.filter(d => d.startsWith('army:')).sort(), ['army:idle', 'army:reserved'], 'l\'armée réservée attendait en ville : elle tombe avec elle');
    assert.deepEqual(db.armies.map(a => [a.id, a.cityId]), [['away', 'cap']], 'celle en mission passe à la capitale');
    assert.deepEqual([offers[0].status, offers[0].cityId], ['CANCELLED', 'cap']);
    assert.deepEqual(db.credits, [{ cityId: 'cap', gain: [0, 0, 700, 0] }], 'les marchandises de l\'offre vont à la capitale');
    assert.match(db.sql[0], /FROM "MarketOffer" WHERE "cityId" = \? AND status = 'ACTIVE' ORDER BY id FOR UPDATE/, 'les offres d\'abord');
  } finally { db.restore(); }
});

test('capitale tombée : les offres de la ville verrouillées avant la ville (ordre du marché) ; elle reste sur son côté de la carte', async () => {
  const { relocateCapital } = require('../../src/services/conquestService');
  const { sideAt } = require('../../src/utils/spawn');
  Terrain.setWorldSeed(0);
  for (const [x, y] of [[-150, -150], [150, -150], [150, 150], [-150, 150]]) {
    const capital = { id: 'cap', playerId: 'p1', name: 'Capitale', isCapital: true, wallStructure: 0, wallMaxHp: 0, x, y };
    const offers = [{ id: 'o1', sellerId: 'p1', cityId: 'cap', sellResource: 'wood', sellAmount: 300, buyResource: 'iron', buyAmount: 300, status: 'ACTIVE', armyId: 'reserved' }];
    const db = fallDb({ cities: { cap: capital }, armies: [marketArmy('reserved', 50, { cityId: 'cap', x, y, status: 'MARKET', missionType: 'MARKET_OFFER' })], offers });
    try {
      const out = await relocateCapital('cap', null);
      const offerLock = db.sql.findIndex(q => /FROM "MarketOffer" WHERE "cityId" = \? AND status = 'ACTIVE' ORDER BY id FOR UPDATE/.test(q));
      const cityLock = db.sql.findIndex(q => /FROM "City" WHERE id = \? FOR UPDATE/.test(q));
      assert.ok(offerLock >= 0 && cityLock > offerLock, `offres (${offerLock}) puis ville (${cityLock})`);
      assert.equal(sideAt(out.to.x, out.to.y), sideAt(x, y), `capitale de (${x}, ${y}) replacée en (${out.to.x}, ${out.to.y})`);
      assert.deepEqual([offers[0].status, db.armies[0].status, db.armies[0].x, db.armies[0].y], ['CANCELLED', 'IDLE', out.to.x, out.to.y], 'offre annulée, armée libre à la nouvelle place');
    } finally { db.restore(); }
  }
});
