// Décision finale du 30 octobre 2026 (§ 1 bis) : l'entretien de toutes les troupes d'un joueur puise dans tous ses
// greniers (chaque ville paie d'abord les siennes), la famine ne vient qu'avec leur total vide ; toute unité formée ou
// soignée apparaît dans la garnison de la capitale (pas de garnison propre dans les colonies).
// Aucune requête réelle : le client Prisma est remplacé le temps d'un test.
require('./_env');
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://unit:unit@localhost:5432/unit';   // le client Prisma est créé, jamais interrogé
const test = require('node:test');
const assert = require('node:assert/strict');
const { unitsData } = require('../../src/config/gamedata');
const config = require('../../src/config');
const prisma = require('../../src/config/database');
const pushService = require('../../src/services/pushService');
const questService = require('../../src/services/questService');
const RP = require('../../src/game/processors/resourceProcessor');
const db = require('../../src/utils/db');
const W = require('../../src/services/woundedService');
const { processRecruits } = require('../../src/game/processors/recruitProcessor');

const unit = (tier, cls = 'INFANTRY') => unitsData.find(u => u.faction === 'ROME' && u.class === cls && u.tier === tier);
const UP = config.army.upkeepPerTier;

// remplace des membres du client Prisma, des notifications et des compteurs de quêtes ; renvoie de quoi tout remettre
function stub(over) {
  const saved = Object.fromEntries(Object.keys(over).map(k => [k, prisma[k]]));
  const savedNotify = pushService.notify, savedBump = questService.bumpLater;
  const notes = [];
  Object.assign(prisma, over);
  pushService.notify = async (...args) => { notes.push(args); };
  questService.bumpLater = () => {};
  return { notes, restore: () => { Object.assign(prisma, saved); pushService.notify = savedNotify; questService.bumpLater = savedBump; } };
}
// texte SQL d'une requête Prisma (gabarit et morceaux imbriqués mis à plat, $1… à la place des valeurs)
const { Prisma } = require('@prisma/client');
const sqlOf = (strings, values = []) => Prisma.sql(strings, ...values).sql;

// ---- bilan affiché ----
test('bilan de tout le joueur : somme des bilans de ses villes, heures avant les greniers vides sur le total', () => {
  const capital = { production: 400, consumption: 900 }, colony = { production: 700, consumption: 0 };
  assert.deepEqual(RP.playerFoodBalance([capital, colony], 3000), { production: 1100, consumption: 900, net: 200, hoursLeft: null },
    'la colonie nourrit la capitale : pas d\'alerte');
  const short = RP.playerFoodBalance([capital, { production: 300, consumption: 200 }], 1400);
  assert.equal(short.net, -400);
  assert.equal(short.hoursLeft, 3.5, '1 400 de nourriture dans toutes les villes pour 400/h de manque');
  assert.equal(RP.playerFoodBalance([], 0).hoursLeft, null);
});

// ---- tick : une seule requête ensembliste ----
test('entretien du tick : une seule requête pour tous les joueurs, partage du manque entre les greniers d\'un joueur', async () => {
  const writes = [], reads = [];
  const s = stub({
    army: { findMany: async () => [] },
    $executeRaw: async (strings, ...values) => { writes.push({ sql: sqlOf(strings, values), values: Prisma.sql(strings, ...values).values }); return 0; },
    $queryRaw: async (strings, ...values) => { reads.push(sqlOf(strings, values)); return []; }
  });
  try {
    RP.resetFamineClock();
    await RP.processUpkeep(1 / 120, new Date());
    assert.equal(writes.length, 1, 'un seul UPDATE');
    const { sql, values } = writes[0];
    assert.match(sql, /UPDATE "City" AS c SET food = GREATEST\(0, c\.food - s\.taken\)/, 'écrit en différence, jamais sous 0');
    assert.match(sql, /SUM\(lack\) OVER \(PARTITION BY "playerId"\)/, 'le manque se compte sur tout le joueur');
    assert.match(sql, /ORDER BY spare DESC, id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING/, 'la ville qui a le plus de nourriture donne d\'abord');
    assert.match(sql, /c\."playerId" IN \(SELECT f\."playerId" FROM "City" f WHERE/, 'toutes les villes des joueurs qui nourrissent quelqu\'un');
    assert.ok(values.includes(1 / 120), 'durée du tick');
    // contrôle horaire : agrégé par joueur, pas par ville
    assert.equal(reads.length, 1);
    assert.match(reads[0], /GROUP BY b\."playerId" HAVING SUM\(b\.cons\) > SUM\(b\.prod\)/);
  } finally { s.restore(); RP.resetFamineClock(); }
});

// ---- contrôle horaire : alerte et famine sur le total du joueur ----
function famineDb({ players, cities, armies = [], wounded = [] }) {
  const killed = [], woundedLeft = [], alerts = [];
  const tx = {
    $queryRaw: async () => cities.map(c => ({ ...c })),   // lockPlayerCities
    army: { findMany: async ({ where }) => armies.filter(a => where.cityId.in.includes(a.cityId)) },
    armyUnit: {
      delete: async ({ where }) => killed.push({ id: where.id, all: true }),
      update: async ({ where, data }) => killed.push({ id: where.id, n: data.count.decrement })
    },
    woundedUnit: {
      findMany: async ({ where }) => wounded.filter(w => where.cityId.in.includes(w.cityId)),
      update: async ({ where, data }) => woundedLeft.push({ id: where.id, n: data.waiting.decrement }),
      deleteMany: async () => ({ count: 0 })
    }
  };
  return {
    killed, woundedLeft, alerts,
    over: {
      army: { findMany: async () => [] },
      $executeRaw: async () => 0,
      $queryRaw: async () => players,
      $transaction: async (fn) => fn(tx),
      city: {
        findFirst: async ({ where }) => cities.find(c => c.isCapital && c.playerId === where.playerId) || null,
        updateMany: async ({ where, data }) => { alerts.push({ id: where.id, data }); return { count: 1 }; }
      }
    }
  };
}

test('greniers bientôt vides : une alerte pour tout le joueur, notée sur la capitale', async () => {
  const cities = [{ id: 'cap', playerId: 'p1', isCapital: true, food: 100 }, { id: 'col', playerId: 'p1', isCapital: false, food: 300 }];
  const f = famineDb({ players: [{ playerId: 'p1', food: 400, prod: 100, cons: 300, reductionPct: 0 }], cities });
  const s = stub(f.over);
  try {
    RP.resetFamineClock();
    await RP.processUpkeep(1 / 120, new Date());
    assert.deepEqual(f.alerts.map(a => a.id), ['cap']);
    assert.equal(s.notes.length, 1);
    const [playerId, kind, title, body, link] = s.notes[0];
    assert.deepEqual([playerId, kind, title], ['p1', 'famine', '🌾 Grenier bientôt vide']);
    assert.match(body, /^Vos greniers n'ont plus que 2 h de nourriture : vos troupes consomment 300\/h pour 100\/h produites dans toutes vos villes/);
    assert.deepEqual(link, { to: 'city', cityId: 'cap' });
    assert.equal(f.killed.length, 0, 'personne ne meurt tant qu\'il reste de la nourriture quelque part');
  } finally { s.restore(); RP.resetFamineClock(); }
});

test('famine : tous les greniers vides ; les blessés en attente d\'abord, puis les plus gourmands de toutes les villes', async () => {
  const base = unit('base'), elite = unit('elite');
  const cities = [{ id: 'cap', playerId: 'p1', isCapital: true, food: 0.2 }, { id: 'col', playerId: 'p1', isCapital: false, food: 0.3 }];
  const armies = [
    { id: 'g-cap', cityId: 'cap', status: 'IDLE', x: 1, y: 1, city: { x: 1, y: 1, isSieged: false }, units: [{ id: 'u-base', unitKey: base.key, count: 400 }] },
    { id: 'a-col', cityId: 'col', status: 'IDLE', x: 9, y: 9, city: { x: 9, y: 9, isSieged: false }, units: [{ id: 'u-elite', unitKey: elite.key, count: 50 }] }
  ];
  const wounded = [{ id: 'w1', cityId: 'col', unitKey: base.key, waiting: 4 }];
  // manque : 4 blessés (5 chacun) puis 3 élites (13 chacune) pour 55/h
  const deficit = 4 * UP.base + 3 * UP.elite - 4;
  const f = famineDb({ players: [{ playerId: 'p1', food: 0.5, prod: 1000, cons: 1000 + deficit, reductionPct: 0 }], cities, armies, wounded });
  const s = stub(f.over);
  try {
    RP.resetFamineClock();
    await RP.processUpkeep(1 / 120, new Date());
    assert.deepEqual(f.woundedLeft, [{ id: 'w1', n: 4 }], 'les blessés qui attendent un soin meurent d\'abord');
    assert.deepEqual(f.killed, [{ id: 'u-elite', n: 3 }], 'puis l\'élite de la colonie, juste assez');
    const [, , title, body, link] = s.notes[0];
    assert.equal(title, '💀 Famine');
    assert.match(body, /^Vos greniers sont vides : 4 .*, 3 .* sont morts de faim \(dont 4 blessés qui attendaient un soin\)/);
    assert.deepEqual(link, { to: 'city', cityId: 'cap' });
  } finally { s.restore(); RP.resetFamineClock(); }
});

test('famine : rien ne meurt si un grenier a été rempli entre-temps (relu sous le verrou des villes)', async () => {
  const cities = [{ id: 'cap', playerId: 'p1', isCapital: true, food: 0 }, { id: 'col', playerId: 'p1', isCapital: false, food: 500 }];
  const armies = [{ id: 'g', cityId: 'cap', status: 'IDLE', x: 1, y: 1, city: { x: 1, y: 1 }, units: [{ id: 'u', unitKey: unit('base').key, count: 100 }] }];
  const f = famineDb({ players: [{ playerId: 'p1', food: 0, prod: 0, cons: 500, reductionPct: 0 }], cities, armies });
  const s = stub(f.over);
  try {
    RP.resetFamineClock();
    await RP.processUpkeep(1 / 120, new Date());
    assert.equal(f.killed.length, 0);
    assert.equal(s.notes.length, 0);
  } finally { s.restore(); RP.resetFamineClock(); }
});

// ---- garnison de la capitale ----
function garrisonTx({ capital = { id: 'cap', x: 3, y: 4 }, garrison = null, extra = {} } = {}) {
  const log = [];
  const tx = {
    city: {
      findFirst: async ({ where }) => { log.push(['capital?', where.playerId]); return where.isCapital ? capital : null; },
      findUnique: async ({ where }) => ({ id: where.id, x: 0, y: 0 })
    },
    $queryRaw: async (strings, ...values) => { log.push(['lock', values[0]]); return []; },
    army: {
      findFirst: async ({ where }) => { log.push(['garrison?', where.cityId]); return garrison; },
      create: async ({ data }) => { log.push(['create', data.cityId, data.x, data.y, data.isGarrison]); return { id: `g-${data.cityId}` }; }
    },
    armyUnit: { upsert: async ({ where, create, update }) => { log.push(['add', where.armyId_unitKey.armyId, where.armyId_unitKey.unitKey, update.count.increment, create.tier]); } },
    ...extra
  };
  return { tx, log };
}

test('garnison de la capitale : verrou de la capitale, créée au besoin ; sans capitale, celle de la ville donnée', async () => {
  const { tx, log } = garrisonTx();
  assert.equal(await db.capitalGarrisonId(tx, 'p1', 'col'), 'g-cap');
  assert.deepEqual(log, [['capital?', 'p1'], ['lock', 'cap'], ['garrison?', 'cap'], ['create', 'cap', 3, 4, true]]);
  const found = garrisonTx({ garrison: { id: 'g-old' } });
  assert.equal(await db.capitalGarrisonId(found.tx, 'p1'), 'g-old');
  const none = garrisonTx({ capital: null });
  assert.equal(await db.capitalGarrisonId(none.tx, 'p1', 'col'), 'g-col');
  assert.equal(await db.capitalGarrisonId(garrisonTx({ capital: null }).tx, 'p1'), null);
  const add = garrisonTx();
  await db.addArmyUnits(add.tx, 'g-cap', unit('elite').key, 7);
  await db.addArmyUnits(add.tx, 'g-cap', unit('base').key, 0);
  assert.deepEqual(add.log, [['add', 'g-cap', unit('elite').key, 7, 'elite']], 'rien pour zéro unité');
});

test('recrutement terminé dans une colonie : les unités arrivent dans la garnison de la capitale (verrou avant la file)', async () => {
  const item = { id: 'r1', cityId: 'col', unitKey: unit('intermediate').key, count: 12, city: { playerId: 'p1', x: 9, y: 9 } };
  const { tx, log } = garrisonTx({ garrison: { id: 'g-cap' }, extra: { recruitQueueItem: { deleteMany: async () => { log.push(['take']); return { count: 1 }; } } } });
  const s = stub({ recruitQueueItem: { findMany: async () => [item] }, $transaction: async (fn) => fn(tx) });
  try {
    await processRecruits(new Date());
    assert.deepEqual(log, [['capital?', 'p1'], ['lock', 'cap'], ['garrison?', 'cap'], ['take'], ['add', 'g-cap', item.unitKey, 12, 'intermediate']]);
  } finally { s.restore(); }
});

test('colon formé : il reste dans la ville qui l\'a formé, il n\'entre dans aucune armée', async () => {
  const item = { id: 'r2', cityId: 'cap', unitKey: 'SETTLER', count: 1, city: { playerId: 'p1' } };
  const settled = [];
  const { tx, log } = garrisonTx({ garrison: { id: 'g-cap' }, extra: { recruitQueueItem: { deleteMany: async () => ({ count: 1 }) } } });
  tx.city.update = async ({ where, data }) => settled.push([where.id, data.settlers.increment]);
  const s = stub({ recruitQueueItem: { findMany: async () => [item] }, $transaction: async (fn) => fn(tx) });
  try {
    await processRecruits(new Date());
    assert.deepEqual(settled, [['cap', 1]]);
    assert.ok(!log.some(l => l[0] === 'add'));
  } finally { s.restore(); }
});

test('soins terminés : les guéris de toutes les villes rejoignent la garnison de la capitale ; capitales verrouillées d\'abord', async () => {
  const inf = unit('base'), cav = unit('base', 'CAVALRY');
  const healsAt = new Date(Date.now() - 1000);
  const rows = [
    { id: 'w1', cityId: 'col-a', unitKey: inf.key, count: 30, waiting: 0, healsAt, city: { playerId: 'p1' } },
    { id: 'w2', cityId: 'cap-a', unitKey: cav.key, count: 5, waiting: 2, healsAt, city: { playerId: 'p1' } },
    { id: 'w3', cityId: 'col-b', unitKey: inf.key, count: 8, waiting: 0, healsAt, city: { playerId: 'p2' } }
  ];
  const caps = { p1: { id: 'cap-a', x: 1, y: 1 }, p2: { id: 'cap-b', x: 2, y: 2 } };
  const log = [];
  const tx = {
    $queryRaw: async (strings, ...values) => { log.push(['lock', Array.isArray(values[0]) ? values[0].join(',') : values[0], /ORDER BY id FOR UPDATE/.test(sqlOf(strings, values))]); return []; },
    city: { findFirst: async ({ where }) => caps[where.playerId] },
    army: { findFirst: async ({ where }) => ({ id: `g-${where.cityId}` }) },
    woundedUnit: {
      updateMany: async ({ where }) => { log.push(['bed', where.id]); return { count: 1 }; },
      deleteMany: async () => ({ count: 1 })
    },
    armyUnit: { upsert: async ({ where, update }) => { log.push(['add', where.armyId_unitKey.armyId, update.count.increment]); } }
  };
  const s = stub({ woundedUnit: { findMany: async () => rows }, $transaction: async (fn) => fn(tx) });
  try {
    assert.equal(await W.processHealedUnits(new Date()), 3);
    assert.deepEqual(log[0], ['lock', 'p1,p2', true], 'les capitales des joueurs du lot, dans l\'ordre des id, avant toute ligne');
    assert.deepEqual(log.filter(l => l[0] === 'add'), [['add', 'g-cap-a', 30], ['add', 'g-cap-a', 5], ['add', 'g-cap-b', 8]]);
  } finally { s.restore(); }
});

test('soin immédiat à l\'or : les guéris rejoignent la garnison de la capitale, pas celle de la colonie', async () => {
  const inf = unit('intermediate');
  const row = { id: 'w1', cityId: 'col', unitKey: inf.key, count: 10, waiting: 0, healsAt: new Date() };
  const { tx, log } = garrisonTx({ garrison: { id: 'g-cap' }, extra: {
    woundedUnit: { findFirst: async () => row, updateMany: async () => ({ count: 1 }), deleteMany: async () => ({ count: 1 }) },
    player: { updateMany: async ({ data }) => { log.push(['gold', data.gold.decrement]); return { count: 1 }; } }
  } });
  const out = await W.healNow(tx, 'p1', 'col', inf.key);
  assert.deepEqual(out, { healed: 10, goldSpent: 10 * config.wounded.instantHealGoldPerTier.intermediate });
  assert.deepEqual(log.filter(l => l[0] === 'add'), [['add', 'g-cap', inf.key, 10, 'intermediate']]);
});

// ---- soin partiel quand le stock ne paie pas tout ----
test('soins : le bouton soigne autant de blessés que le stock de toutes les villes en paie', () => {
  const inf = unit('base');
  const one = W.healCostFor(inf, 1);
  const stockFor = (k) => Object.fromEntries(Object.entries(W.healCostFor(inf, k)));
  assert.equal(W.affordableHeal(inf, 300, stockFor(300)), 300);
  assert.equal(W.affordableHeal(inf, 300, stockFor(120)), 120, 'juste le prix de 120 soins');
  assert.equal(W.affordableHeal(inf, 50, stockFor(120)), 50, 'jamais plus que les lits libres');
  assert.equal(W.affordableHeal(inf, 300, { wood: one.wood - 1, stone: 1e6, iron: 1e6, food: 1e6 }), 0);
  assert.equal(W.affordableHeal(inf, 0, stockFor(10)), 0);
});
