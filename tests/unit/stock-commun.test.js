// Stock commun pour tout ce qu'une armée emporte (décision du 1er novembre 2026, simulation de 200 jours, E1) : offres,
// échanges acceptés, envois et livraisons à la Merveille prennent les marchandises dans toutes les villes du joueur (la ville
// de départ d'abord, puis la plus pleine), sous le verrou de toutes ses villes ; une offre rendue et une livraison qui arrive
// vont à la ville visée d'abord, puis aux autres selon la place. Pour un échange, les villes des deux joueurs sont
// verrouillées en une seule passe, dans l'ordre des id, et un interblocage relance la transaction.
// Aucune requête réelle : les transactions et le client Prisma sont factices.
require('./_env');
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://unit:unit@localhost:5432/unit';   // le client Prisma est créé, jamais interrogé
process.env.REQUIRE_VERIFIED_EMAIL = 'false';   // routes du marché : pas de lecture de l'adresse vérifiée (tradeAllowed)
const test = require('node:test');
const assert = require('node:assert/strict');
const config = require('../../src/config');
const prisma = require('../../src/config/database');
const { unitsData } = require('../../src/config/gamedata');
const db = require('../../src/utils/db');
const MS = require('../../src/services/marketService');
const Terrain = require('../../frontend/js/shared/terrain.js');

const SLAVE = unitsData.find(u => u.key === 'EGY_INF_ESCLAVE');
const army = (id, ownerId, cityId, x, count, extra = {}) => ({ id, name: `Armée ${id}`, ownerId, cityId, status: 'IDLE', isGarrison: false, x, y: 0, units: [{ unitKey: SLAVE.key, tier: SLAVE.tier, count }], hero: null, heroId: null, ...extra });
// une ville : `stock` pour chaque ressource (ou { wood, stone, iron, food }), plafonds `cap`
const town = (id, playerId, x, stock = 0, { cap = 100000, isCapital = false } = {}) => {
  const s = typeof stock === 'number' ? { wood: stock, stone: stock, iron: stock, food: stock } : { wood: 0, stone: 0, iron: 0, food: 0, ...stock };
  return { id, playerId, name: `Ville ${id}`, x, y: 0, isCapital, isWonder: false, buildings: [], ...s, maxStorage: cap, maxFoodStorage: cap };
};
const stockOf = (c) => db.RESOURCES.map(r => c[r]);

// Transaction factice : verrous notés dans l'ordre (« player:p1 » : lockPlayerCities, « players:p1,p2 » :
// lockCitiesOfPlayers, « offer:o1 » : lockOffer), stocks débités et crédités comme debitCity / creditCity, armées, offres
function stockDb({ cities = {}, armies = [], offers = [], capital = [{ key: 'MARKET', level: 1 }] } = {}) {
  const locks = [];
  const match = (row, where) => Object.entries(where).every(([k, v]) => row[k] === v);
  const citiesOf = (ids) => Object.values(cities).filter(c => ids.includes(c.playerId)).sort((a, b) => (a.id < b.id ? -1 : 1)).map(c => ({ ...c }));
  return {
    locks, cities, armies, offers,
    $queryRaw: async (strings, ...values) => {
      const text = strings.join('?');
      if (text.includes('"playerId" = ANY(')) { locks.push(`players:${values[0].join(',')}`); return citiesOf(values[0]); }
      if (text.includes('FROM "City" WHERE "playerId"')) { locks.push(`player:${values[0]}`); return citiesOf([values[0]]); }
      if (text.includes('FROM "MarketOffer"')) { locks.push(`offer:${values[0]}`); return []; }
      locks.push(`city:${values[0]}`);
      return [];
    },
    $executeRaw: async (strings, ...values) => {
      const c = cities[values[4]];
      if (!c) return 0;
      if (strings.join('?').includes('GREATEST')) { db.RESOURCES.forEach((r, i) => { c[r] = Math.max(c[r], Math.min(c[r] + values[i], r === 'food' ? c.maxFoodStorage : c.maxStorage)); }); return 1; }
      if (db.RESOURCES.some((r, i) => c[r] < values[i])) return 0;
      db.RESOURCES.forEach((r, i) => { c[r] -= values[i]; });
      return 1;
    },
    city: {
      findUnique: async ({ where }) => (cities[where.id] ? { ...cities[where.id], player: { faction: 'EGYPT' } } : null),
      findFirst: async ({ where }) => { const c = cities[where.id]; return c && c.playerId === where.playerId ? { ...c, player: { name: `Joueur ${c.playerId}`, faction: 'EGYPT' } } : null; },
      findMany: async () => [{ isCapital: true, buildings: capital }]
    },
    cityBuilding: { findMany: async () => [] },
    playerTechnology: { findMany: async () => [] },
    allianceMember: { findUnique: async () => null },
    army: {
      findMany: async ({ where }) => armies.filter(a => match(a, where)),
      findFirst: async ({ where }) => armies.find(a => match(a, where)) || null,
      updateMany: async ({ where, data }) => { const a = armies.find(x => match(x, where)); if (!a) return { count: 0 }; Object.assign(a, data); return { count: 1 }; },
      count: async () => 0
    },
    marketOffer: {
      count: async ({ where }) => offers.filter(o => match(o, where)).length,
      create: async ({ data }) => { const o = { id: `o${offers.length + 1}`, ...data }; offers.push(o); return o; },
      findUnique: async ({ where }) => offers.find(o => o.id === where.id) || null,
      updateMany: async ({ where, data }) => { const o = offers.find(x => match(x, where)); if (!o) return { count: 0 }; Object.assign(o, data); return { count: 1 }; },
      findMany: async ({ where }) => offers.filter(o => match(o, where))
    }
  };
}

// Le client Prisma global remplacé le temps d'un test (trajets sur une carte vide, sans alliance, notifications notées) ;
// aucune requête SQL brute ne part vers une vraie base (compteurs de quêtes compris)
async function withPrisma(overrides, fn) {
  const keys = ['city', 'resourceNode', 'allianceMember', 'notification', '$transaction', 'army', 'marketOffer', 'armyUnit', '$executeRaw', '$queryRaw'];
  const saved = Object.fromEntries(keys.map(k => [k, prisma[k]]));
  const notes = [];
  const noRawSql = async () => { throw new Error('requête SQL hors de la transaction factice'); };
  Object.assign(prisma, {
    city: { findMany: async () => [] }, resourceNode: { findMany: async () => [] }, allianceMember: { findUnique: async () => null },
    notification: { create: async ({ data }) => { notes.push(data); return { id: `n${notes.length}` }; } },
    $executeRaw: noRawSql, $queryRaw: noRawSql
  }, overrides);
  Terrain.setWorldSeed(0);
  try { return await fn(notes); } finally { Object.assign(prisma, saved); }
}
const NOW = new Date('2026-11-01T12:00:00Z');

test('envoi : un stock qui n\'est que dans les colonies part quand même ; la ville de départ d\'abord, puis la plus pleine', () => withPrisma({}, async () => {
  // capitale vide (simulation de 200 jours : 89 % du stockage dans les colonies, silo de la capitale toujours vide)
  const cities = { a1: town('a1', 'p1', 0, 0, { isCapital: true }), a2: town('a2', 'p1', 40, { wood: 5000, food: 9000 }), b1: town('b1', 'p2', 12) };
  const tx = stockDb({ cities, armies: [army('s1', 'p1', 'a1', 0, 1000)] });
  const out = await MS.sendResources(tx, { playerId: 'p1', faction: 'EGYPT', fromCity: cities.a1, toCity: cities.b1, resources: { wood: 2000, food: 3000 }, now: NOW });
  assert.equal(out.armyId, 's1', JSON.stringify(out));
  assert.deepEqual(stockOf(cities.a2), [3000, 0, 0, 6000], 'tout pris dans la colonie');
  assert.deepEqual(stockOf(cities.a1), [0, 0, 0, 0]);
  assert.deepEqual([tx.armies[0].status, tx.armies[0].carryWood, tx.armies[0].carryFood], ['TRANSPORTING', 2000, 3000]);
  assert.deepEqual(tx.locks, ['player:p1'], 'toutes les villes du joueur, une seule fois');
  // ordre : la ville de départ d'abord (500), puis la plus pleine par rapport à son plafond (a3 : 50 %), puis a4 (15 %)
  const order = { c1: town('c1', 'p3', 0, { wood: 500 }, { cap: 10000, isCapital: true }), c3: town('c3', 'p3', 20, { wood: 1000 }, { cap: 2000 }), c4: town('c4', 'p3', 30, { wood: 3000 }, { cap: 20000 }), b1: cities.b1 };
  const tx2 = stockDb({ cities: order, armies: [army('s3', 'p3', 'c1', 0, 1000)] });
  await MS.sendResources(tx2, { playerId: 'p3', faction: 'EGYPT', fromCity: order.c1, toCity: order.b1, resources: { wood: 2000 }, now: NOW });
  assert.deepEqual([order.c1.wood, order.c3.wood, order.c4.wood], [0, 0, 2500]);
  // plus que toutes ses villes réunies : refus avec ce qui manque, rien n'est pris, l'armée reste
  const poor = stockDb({ cities: { a1: town('a1', 'p1', 0, 0), a2: town('a2', 'p1', 40, { iron: 100 }), b1: town('b1', 'p2', 12) }, armies: [army('s1', 'p1', 'a1', 0, 1000)] });
  const refused = await MS.sendResources(poor, { playerId: 'p1', faction: 'EGYPT', fromCity: poor.cities.a1, toCity: poor.cities.b1, resources: { iron: 250 }, now: NOW });
  assert.deepEqual(refused, { error: 'Ressources insuffisantes : il manque 150 de fer (toutes vos villes comprises)', status: 400 });
  assert.deepEqual([poor.cities.a2.iron, poor.armies[0].status], [100, 'IDLE']);
}));

test('offre et échange : le stock des colonies se vend et paie la contrepartie (vendeur et acheteur)', () => withPrisma({}, async () => {
  const cities = {
    a1: town('a1', 'p1', 0, 0, { isCapital: true }), a2: town('a2', 'p1', 40, { food: 9000 }),
    b1: town('b1', 'p2', 12, 0, { isCapital: true }), b2: town('b2', 'p2', 60, { iron: 2000 })
  };
  const tx = stockDb({ cities, armies: [army('s1', 'p1', 'a1', 0, 1000), army('k1', 'p2', 'b1', 12, 1000), army('s2', 'p1', 'a1', 0, 2000)] });
  const made = await MS.createOffer(tx, { playerId: 'p1', faction: 'EGYPT', city: cities.a1, sellResource: 'food', sellAmount: 4000, buyResource: 'iron', buyAmount: 1500, now: NOW });
  assert.equal(made.armyId, 's1', JSON.stringify(made));
  assert.deepEqual([cities.a2.food, tx.armies[0].status, made.offer.cityId], [5000, 'MARKET', 'a1'], 'céréales de la colonie, l\'armée attend à la capitale');
  // l'acheteur paie avec le fer de sa colonie
  const deal = await MS.acceptOffer(tx, { offer: made.offer, buyerId: 'p2', buyerFaction: 'EGYPT', buyerCity: cities.b1, sellerCity: cities.a1, sellerFaction: 'EGYPT', now: NOW });
  assert.ok(!deal.error, JSON.stringify(deal));
  assert.deepEqual([cities.b2.iron, cities.b1.iron], [500, 0]);
  assert.equal(deal.toSeller, MS.afterTax(1500, config.market.p2pTaxPctBase), 'taxe de 30 % inchangée');
  // trop cher pour toutes ses villes : le message dit ce qui manque, l'armée reste libre
  const again = await MS.createOffer(tx, { playerId: 'p1', faction: 'EGYPT', city: cities.a1, sellResource: 'wood', sellAmount: 10, buyResource: 'iron', buyAmount: 10, now: NOW });
  assert.deepEqual(again, { error: 'Ressources insuffisantes : il manque 10 de bois (toutes vos villes comprises)', status: 400 });
  assert.equal(tx.armies[2].status, 'IDLE');
}));

test('offre rendue : une capitale pleine verse le surplus dans les colonies ; une colonie qui tombe ne reçoit rien ; ce qui ne tient nulle part est dit', () => withPrisma({}, async () => {
  const cities = { a1: town('a1', 'p1', 0, { wood: 9800 }, { cap: 10000, isCapital: true }), a2: town('a2', 'p1', 40, { wood: 100 }, { cap: 5000 }), a3: town('a3', 'p1', 80, { wood: 0 }, { cap: 3000 }) };
  const offer = { id: 'o1', sellerId: 'p1', cityId: 'a1', sellResource: 'wood', sellAmount: 3000, buyResource: 'iron', buyAmount: 1000, status: 'ACTIVE', armyId: 's1' };
  const tx = stockDb({ cities, offers: [offer], armies: [army('s1', 'p1', 'a1', 0, 1000, { status: 'MARKET', missionType: 'MARKET_OFFER' })] });
  assert.deepEqual(await MS.closeOffer(tx, offer, 'CANCELLED'), { lost: { wood: 0, stone: 0, iron: 0, food: 0 } });
  // la capitale jusqu'à son plafond (200), puis la colonie qui a le plus de place (a2 : 4 900)
  assert.deepEqual([cities.a1.wood, cities.a2.wood, cities.a3.wood], [10000, 2900, 0]);
  assert.deepEqual([offer.status, tx.armies[0].status, tx.armies[0].missionType], ['CANCELLED', 'IDLE', null]);
  assert.deepEqual(tx.locks, ['player:p1']);

  // colonie qui tombe (conquestService.razeCity) : ses offres reviennent à la capitale puis aux autres colonies, jamais à elle
  const fall = { c1: town('c1', 'p1', 0, { iron: 990 }, { cap: 1000, isCapital: true }), c2: town('c2', 'p1', 40, { iron: 0 }, { cap: 50000 }), c3: town('c3', 'p1', 80, { iron: 0 }, { cap: 900 }) };
  const offerOfColony = { id: 'o2', sellerId: 'p1', cityId: 'c2', sellResource: 'iron', sellAmount: 700, buyResource: 'wood', buyAmount: 700, status: 'ACTIVE', armyId: null };
  const tx2 = stockDb({ cities: fall, offers: [offerOfColony] });
  assert.equal(await MS.cancelOffersOfCity(tx2, 'c2', 'c1'), 1);
  assert.deepEqual([fall.c1.iron, fall.c2.iron, fall.c3.iron], [1000, 0, 690], 'capitale (10), puis c3 ; c2 tombe');
  assert.deepEqual([offerOfColony.status, offerOfColony.cityId], ['CANCELLED', 'c1']);

  // toutes les villes pleines : l'offre expirée le dit au vendeur (« … perdus »)
  const full = { d1: town('d1', 'p1', 0, { wood: 1000 }, { cap: 1000, isCapital: true }), d2: town('d2', 'p1', 40, { wood: 4900 }, { cap: 5000 }) };
  const expired = { id: 'o3', sellerId: 'p1', cityId: 'd1', sellResource: 'wood', sellAmount: 400, buyResource: 'iron', buyAmount: 100, status: 'ACTIVE', armyId: null, expiresAt: new Date(0) };
  const tx3 = stockDb({ cities: full, offers: [expired] });
  await withPrisma({ marketOffer: { findMany: async () => tx3.offers.filter(o => o.status === 'ACTIVE') }, $transaction: async (fn) => fn(tx3) }, async (notes) => {
    assert.equal(await MS.expireOffers(NOW), 1);
    await new Promise(r => setImmediate(r));
    assert.deepEqual(tx3.locks, ['offer:o3', 'player:p1'], 'l\'offre, puis les villes du vendeur');
    assert.deepEqual([full.d1.wood, full.d2.wood, expired.status], [1000, 5000, 'EXPIRED']);
    assert.equal(notes.length, 1);
    assert.match(notes[0].body, /l'armée est libre, les marchandises sont revenues dans vos villes ; plus de place dans vos villes : 300 de bois perdus\.$/);
  });
}));

test('verrous : lockCitiesOfPlayers prend les villes de plusieurs joueurs en une seule requête, dans l\'ordre des id', async () => {
  let sql = '', values = [], calls = 0;
  const rows = [
    { id: 'a', playerId: 'p2', wood: 1, stone: 2, iron: 3, food: 4, maxStorage: 10, maxFoodStorage: 20, isCapital: true },
    { id: 'b', playerId: 'p1', wood: '5', stone: 0, iron: 0, food: 0, maxStorage: 100, maxFoodStorage: 100, isCapital: false },
    { id: 'c', playerId: 'p2', wood: 0, stone: 0, iron: 0, food: 0, maxStorage: 30, maxFoodStorage: 30, isCapital: false }
  ];
  const tx = { $queryRaw: async (strings, ...v) => { calls++; sql = strings.join('?'); values = v; return rows; } };
  const out = await db.lockCitiesOfPlayers(tx, ['p2', 'p1', 'p2', null]);
  assert.match(sql, /FROM "City" WHERE "playerId" = ANY\(\?\) ORDER BY id FOR UPDATE/);
  assert.deepEqual(values, [['p2', 'p1']], 'chaque joueur une fois');
  assert.deepEqual(out.p2.map(c => c.id), ['a', 'c']);
  assert.deepEqual(out.p1, [{ id: 'b', isCapital: false, wood: 5, stone: 0, iron: 0, food: 0, maxStorage: 100, maxFoodStorage: 100 }], 'au format de lockPlayerCities');
  assert.deepEqual(await db.lockCitiesOfPlayers(tx, []), {});
  assert.equal(calls, 1, 'aucune requête sans joueur');
  assert.deepEqual(await db.lockCitiesOfPlayers({ $queryRaw: async () => [] }, ['p9']), { p9: [] }, 'un joueur sans ville : liste vide');
});

// ---- routes du marché : verrous et relance sur interblocage ----
const marketRouter = require('../../src/routes/market');
const routeOf = (router, method, routePath) => router.stack.find(l => l.route && l.route.path === routePath && l.route.methods[method]).route.stack.at(-1).handle;
const replyOf = () => {
  const r = { statusCode: 200, body: null };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
};
const deadlock = () => Object.assign(new Error('Transaction failed due to a write conflict or a deadlock'), { code: 'P2034' });

test('accepter : l\'offre, puis les villes des deux joueurs en une seule passe ; relancé après un interblocage ; place de toutes les villes de l\'acheteur', () => withPrisma({}, async () => {
  const cities = {
    a1: town('a1', 'p1', 0, 0, { isCapital: true }),
    b1: town('b1', 'p2', 12, { wood: 1000, iron: 0 }, { cap: 1000, isCapital: true }), b2: town('b2', 'p2', 60, { wood: 4700, iron: 900 }, { cap: 5000 })
  };
  const offer = { id: 'o1', sellerId: 'p1', cityId: 'a1', sellResource: 'wood', sellAmount: 1000, buyResource: 'iron', buyAmount: 800, status: 'ACTIVE', armyId: 's1' };
  const tx = stockDb({ cities, offers: [offer], armies: [army('s1', 'p1', 'a1', 0, 1000, { status: 'MARKET', missionType: 'MARKET_OFFER' }), army('k1', 'p2', 'b1', 12, 1000)] });
  let attempts = 0;
  const res = replyOf();
  await withPrisma({ $transaction: async (fn) => { attempts++; if (attempts === 1) throw deadlock(); return fn(tx); } }, async (notes) => {
    await routeOf(marketRouter, 'post', '/offer/:id/accept')({ params: { id: 'o1' }, body: { cityId: 'b1' }, user: { playerId: 'p2' } }, res);
    await new Promise(r => setImmediate(r));
    assert.equal(notes.length, 1, 'le vendeur est prévenu');
  });
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(attempts, 2, 'interblocage : la transaction est relancée');
  assert.deepEqual(tx.locks, ['offer:o1', 'players:p2,p1'], 'aucune ville verrouillée seule : toutes celles des deux joueurs, en une passe');
  assert.deepEqual([cities.b1.iron, cities.b2.iron], [0, 100], 'la contrepartie vient de la colonie de l\'acheteur');
  // 700 bois arrivent : capitale pleine, 300 de place dans la colonie
  assert.equal(res.body.toBuyer, 700);
  assert.match(res.body.warning, /^Attention : vos villes n'ont de place que pour 300 bois en ce moment/);
}));

test('offre, envoi, retrait : toutes les villes du joueur verrouillées (plus de verrou d\'une seule ville) ; relance sur interblocage', () => withPrisma({}, async () => {
  const cities = { a1: town('a1', 'p1', 0, 0, { isCapital: true }), a2: town('a2', 'p1', 40, { wood: 5000 }), b1: town('b1', 'p2', 12) };
  const tx = stockDb({ cities, armies: [army('s1', 'p1', 'a1', 0, 1000), army('s2', 'p1', 'a1', 0, 1000)] });
  let attempts = 0;
  const txn = async (fn) => { attempts++; if (attempts === 1) throw deadlock(); return fn(tx); };
  // offre : du bois qui n'est que dans la colonie
  await withPrisma({ $transaction: txn }, async () => {
    const res = replyOf();
    await routeOf(marketRouter, 'post', '/offer')({ body: { sellResource: 'wood', sellAmount: 1200, buyResource: 'iron', buyAmount: 1000, cityId: 'a1' }, user: { playerId: 'p1' } }, res);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(attempts, 2);
    assert.deepEqual(tx.locks, ['player:p1']);
    assert.equal(cities.a2.wood, 3800);
    // retrait : l'offre, puis les villes du vendeur ; tout revient (la capitale a de la place)
    tx.locks.length = 0;
    const del = replyOf();
    await routeOf(marketRouter, 'delete', '/offer/:id')({ params: { id: res.body.offer.id }, user: { playerId: 'p1' } }, del);
    assert.equal(del.statusCode, 200, JSON.stringify(del.body));
    assert.deepEqual(tx.locks, [`offer:${res.body.offer.id}`, 'player:p1']);
    assert.equal(del.body.message, 'Offre annulée : marchandises rendues, armée libre', 'tout a tenu : le message de toujours');
    assert.deepEqual([cities.a1.wood, cities.a2.wood], [1200, 3800], 'à la ville de l\'offre d\'abord');
  });
  // envoi : le stock de la colonie part avec une armée de la capitale (compteur de quête noté, jamais écrit en base)
  tx.locks.length = 0;
  const quests = require('../../src/services/questService');
  const bumpLater = quests.bumpLater, bumped = [];
  quests.bumpLater = (...args) => bumped.push(args);
  try {
    await withPrisma({ $transaction: async (fn) => fn(tx), army: { count: async () => 0 }, city: { findMany: async () => [], findFirst: async () => ({ ...cities.b1 }) } }, async () => {
      const res = replyOf();
      await marketRouter.tradeRouter.stack.find(l => l.route?.path === '/trade/send').route.stack.at(-1).handle({ body: { fromCityId: 'a1', targetX: 12, targetY: 0, resources: { wood: 3000 } }, user: { playerId: 'p1' } }, res);
      assert.equal(res.statusCode, 200, JSON.stringify(res.body));
      assert.deepEqual(tx.locks, ['player:p1']);
      assert.deepEqual([cities.a1.wood, cities.a2.wood], [0, 2000], 'la ville de départ d\'abord (1 200), puis la colonie (1 800)');
      assert.deepEqual(bumped, [['p1', 'trade_sent', 1]]);
    });
  } finally { quests.bumpLater = bumpLater; }
}));

// ---- arrivée d'une livraison (armyProcessor.handleTransport) ----
test('livraison : la ville d\'arrivée d\'abord, puis les autres villes du destinataire selon la place ; ce qui ne tient nulle part repart', async () => {
  const { processArmyMovements } = require('../../src/game/processors/armyProcessor');
  async function arrive(cities, carry) {
    const convoy = { id: 'k1', name: 'Convoi', ownerId: 'p1', cityId: null, status: 'TRANSPORTING', missionType: 'MARKET_DELIVERY', x: 0, y: 0, targetX: 12, targetY: 0, targetCityId: 'b1', arrivalAt: NOW, claimedAt: null, units: [], owner: { name: 'César', faction: 'ROME' }, carryWood: 0, carryStone: 0, carryIron: 0, carryFood: 0, ...carry };
    const tx = stockDb({ cities });
    const updates = [];
    tx.army.update = async ({ data }) => { updates.push(data); return data; };
    let attempts = 0;
    const notes = await withPrisma({
      army: { findMany: async ({ where }) => (where.claimedAt === null ? [convoy] : []), updateMany: async () => ({ count: 1 }), update: async ({ data }) => { updates.push(data); return data; } },
      city: { findUnique: async ({ where }) => (cities[where.id] ? { ...cities[where.id] } : null), findMany: async () => [] },
      $transaction: async (fn) => { attempts++; if (attempts === 1) throw deadlock(); return fn(tx); }
    }, async (n) => { await processArmyMovements(NOW); await new Promise(r => setImmediate(r)); return n; });
    return { tx, updates, notes, attempts };
  }
  // capitale du destinataire presque pleine : 200 de bois y entrent, le reste va à la colonie qui a le plus de place
  const cities = { b1: town('b1', 'p2', 12, { wood: 9800 }, { cap: 10000, isCapital: true }), b2: town('b2', 'p2', 60, { wood: 0 }, { cap: 1000 }), b3: town('b3', 'p2', 90, { wood: 0 }, { cap: 5000 }) };
  const one = await arrive(cities, { carryWood: 3000, carryIron: 50 });
  assert.equal(one.attempts, 2, 'interblocage : la livraison est relancée');
  assert.deepEqual(one.tx.locks, ['player:p2'], 'toutes les villes du destinataire');
  assert.deepEqual([cities.b1.wood, cities.b3.wood, cities.b2.wood, cities.b1.iron], [10000, 2800, 0, 50]);
  assert.deepEqual(one.updates[0], { carryWood: 0, carryStone: 0, carryIron: 0, carryFood: 0 }, 'tout est livré');
  assert.equal(one.updates.at(-1).status, 'IDLE', 'sans ville, l\'armée se pose (avec une ville, elle rentre)');
  assert.match(one.notes.find(n => n.playerId === 'p2').body, /Le convoi de César a livré 3000 bois, 50 fer à Ville b1 et vos autres villes \(Ville b1 était pleine\)\./);
  // toutes les villes pleines : le surplus repart avec l'armée, les deux joueurs sont prévenus
  const full = { b1: town('b1', 'p2', 12, { wood: 9900 }, { cap: 10000, isCapital: true }), b2: town('b2', 'p2', 60, { wood: 900 }, { cap: 1000 }) };
  const two = await arrive(full, { carryWood: 500 });
  assert.deepEqual([full.b1.wood, full.b2.wood], [10000, 1000]);
  assert.equal(two.updates[0].carryWood, 300);
  assert.equal(two.updates.at(-1).carryWood, 300, 'l\'armée rentre avec les 300 qui ne tenaient nulle part');
  assert.match(two.notes.find(n => n.playerId === 'p2').body, /\(toutes vos villes sont pleines : 300 bois repartent\)/);
  assert.match(two.notes.find(n => n.playerId === 'p1').body, /Ville b1 et les autres villes de son joueur n'avaient plus de place pour 300 bois : Convoi les ramène\./);
});
