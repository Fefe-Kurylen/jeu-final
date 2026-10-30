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

test('bâtiments d\'une colonie : les siens, et ceux réservés à la capitale lus dans la capitale (une requête)', async () => {
  let asked = null;
  const tx = { city: { findFirst: async (q) => { asked = q.where; return { buildings: [{ key: 'ACADEMY', level: 10 }, { key: 'MARKET', level: 20 }] }; } } };
  const colony = { playerId: 'p1', isCapital: false, buildings: [{ key: 'MARKET', level: 5 }, { key: 'ACADEMY', level: 3 }] };
  const got = await db.buildingsWithCapital(tx, colony);
  assert.deepEqual(asked, { playerId: 'p1', isCapital: true });
  assert.deepEqual(got, [{ key: 'MARKET', level: 5 }, { key: 'ACADEMY', level: 10 }], 'Marché de la colonie, Académie de la capitale');
  const capital = { ...colony, isCapital: true };
  assert.equal(await db.buildingsWithCapital({ city: { findFirst: async () => assert.fail('pas de requête pour la capitale') } }, capital), capital.buildings);
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
test('recrutement : prix d\'un lot et temps de base, les mêmes que les fiches des unités', () => {
  for (const u of unitsData) {
    assert.deepEqual(calc.recruitCostFor(u, 1), u.recruitCost, u.key);
    assert.equal(Math.round(calc.baseTrainSecondsFor(u)), u.recruitTimeSec, u.key);
  }
  const inf = unit('ROME', 'INFANTRY', 'base');
  assert.deepEqual(calc.recruitCostFor(inf, 10), { wood: 300, stone: 200, iron: 550, food: 200 });
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
    city: { findFirst: async () => ({ buildings: capital }) },
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
  Object.assign(prisma, {
    woundedUnit: { findMany: async ({ where }) => (where.count ? [{ count: 50, healsAt: busy }] : [{ id: 'w1', cityId: 'col', unitKey: inf.key, count: 0, waiting: 300, healsAt: W.NO_HEAL, city: { name: 'Colonie' } }]) },
    city: { findFirst: async () => ({ buildings: tent(1) }) }
  });
  try {
    const [row] = await W.woundedView('p1');
    assert.equal(row.cityName, 'Colonie');
    assert.equal(row.healable, 150);
    assert.deepEqual(row.healCost, W.healCostFor(inf, 150));
    assert.ok(Math.abs(row.healSeconds - (3600 + 150 * 36)) <= 2, `${row.healSeconds} s : l'heure en cours, puis 150 × 36 s`);
    assert.equal(row.instantGold, 0, 'personne au lit : pas de soin à l\'or');
  } finally { Object.assign(prisma, saved); }
});

// ---- convoi d'une route commerciale : verrous dans l'ordre des id, comme lockPlayerCities ----
test('livraison d\'un convoi : les villes d\'arrivée et de départ sont verrouillées dans l\'ordre des id (pas d\'interblocage avec une dépense)', async () => {
  const prisma = require('../../src/config/database');
  const MS = require('../../src/services/marketService');
  const locks = [], credits = [];
  const cities = { 'a-from': { id: 'a-from', playerId: 'p1', wood: 0, stone: 0, iron: 0, food: 0, maxStorage: 5000, maxFoodStorage: 5000 }, 'b-to': { id: 'b-to', playerId: 'p1', wood: 900, stone: 0, iron: 0, food: 0, maxStorage: 1000, maxFoodStorage: 1000 } };
  const tx = {
    tradeConvoy: { deleteMany: async () => ({ count: 1 }) },
    city: { findUnique: async ({ where }) => cities[where.id] || null, findFirst: async ({ where }) => cities[where.id] || null },
    $queryRaw: async (strings, ...values) => { locks.push(values[0]); return []; },
    $executeRaw: async (strings, ...values) => { credits.push([values[0], values.at(-1)]); return 1; }
  };
  const saved = { tradeRoute: prisma.tradeRoute, tradeConvoy: prisma.tradeConvoy, $transaction: prisma.$transaction };
  Object.assign(prisma, {
    tradeRoute: { findMany: async () => [] },
    tradeConvoy: { findMany: async () => [{ id: 'cv1', playerId: 'p1', fromCityId: 'a-from', toCityId: 'b-to', wood: 300, stone: 0, iron: 0, food: 0 }] },
    $transaction: async (fn) => fn(tx)
  });
  try {
    await MS.processTradeRoutes(new Date());
    assert.deepEqual(locks, ['a-from', 'b-to'], 'ordre des id, pas l\'ordre arrivée puis départ');
    assert.deepEqual(credits, [[100, 'b-to'], [200, 'a-from']], '100 tiennent à l\'arrivée, 200 reviennent au départ');
  } finally { Object.assign(prisma, saved); }
});
