require('./_env');
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://unit:unit@localhost:5432/unit';   // le client Prisma est créé, jamais interrogé
const test = require('node:test');
const assert = require('node:assert/strict');
const config = require('../../src/config');
const { buildingsData, unitsData } = require('../../src/config/gamedata');
const fx = require('../../src/utils/buildingEffects');
const { buildCostFor, baseTrainSecondsFor, recruitGoldFor } = require('../../src/utils/calculations');
const Stock = require('../../tools/sim/stock.cjs');
const economy = require('../../tools/sim/modules/10-economy.cjs');
const military = require('../../tools/sim/modules/30-military.cjs');
const market = require('../../tools/sim/modules/40-market.cjs');

// Joueurs automatiques de la simulation longue (rapport économie, recommandation 15, et décisions du 30 octobre 2026 :
// stock partagé, placement des bâtiments, soins payants, unités formées dans la capitale ; colonies : Mur sur l'enceinte,
// palier des recrues lu sur la Grande caserne de la colonie, site choisi selon le gisement, ville la plus pleine d'abord ;
// revue des bâtiments du 31 octobre 2026 : anneau de 18 / 12 emplacements, Bâtiment principal 20, Mur des colonies 15,
// Marché et Comptoir dans la capitale, or des unités d'élite, marchands)

const keysOf = (plan) => [...new Set(plan.map(([k]) => k).filter(k => k !== 'FIELDS' && k !== 'MAIN_HALL'))];
const ctx = (stepHours = 6) => ({ OPT: { stepHours }, step: 10 });
const city = (o) => ({ wood: 0, stone: 0, iron: 0, food: 0, maxStorage: 1200, maxFoodStorage: 1200, buildings: [], buildQueue: [], recruitQueue: [], ...o });
function botWith(cities, extra = {}) {
  const bot = { faction: 'ROME', cities, armies: [], mem: {}, calls: [], ...extra };
  Object.defineProperty(bot, 'capital', { get() { return this.cities.find(c => c.isCapital) || null; } });
  return bot;
}
const withBalance = (cities, foodBalance) => { for (const c of cities) c.playerStock = { foodBalance }; return cities; };

test('plan des joueurs automatiques : seulement les drapeaux des données, plus de Douves', () => {
  for (const faction of ['ROME', 'GAUL', 'GREEK', 'EGYPT', 'HUN', 'SULTAN']) {
    const cap = keysOf(economy.planFor(faction, true)), col = keysOf(economy.planFor(faction, false));
    assert.ok(cap.every(k => buildingsData.some(b => b.key === k)) && col.every(k => buildingsData.some(b => b.key === k)), 'des bâtiments qui existent');
    assert.ok(!cap.includes('MOAT') && !col.includes('MOAT'));
    assert.deepEqual(cap.filter(fx.notInCapital), [], `${faction} : rien de réservé aux colonies dans la capitale`);
    assert.deepEqual(col.filter(fx.capitalOnly), [], `${faction} : rien de réservé à la capitale dans une colonie`);
    // la capitale garde Scierie & co aux colonies ; les colonies bâtissent les Grands dépôt et silo ; le Marché et le Comptoir
    // sont dans la capitale (décision du 31 octobre 2026)
    for (const k of ['GREAT_WAREHOUSE', 'GREAT_SILO', 'SAWMILL', 'STONEMASON', 'FOUNDRY', 'BAKERY', 'MILL']) assert.ok(col.includes(k), `${faction} : ${k} dans une colonie`);
    for (const k of ['MARKET', 'TRADE_OFFICE']) assert.ok(cap.includes(k) && !col.includes(k), `${faction} : ${k} dans la capitale seulement`);
    // le Mur sur l'enceinte ; l'anneau a autant d'emplacements que de bâtiments possibles : capitale 18, colonie 12
    const ring = (keys) => keys.filter(k => k !== 'WALL' && (!buildingsData.find(b => b.key === k).faction || buildingsData.find(b => b.key === k).faction === faction));
    assert.ok(cap.includes('WALL') && col.includes('WALL'), 'le Mur dans les deux plans');
    assert.equal(ring(cap).length, config.city.ringSlots.capital, `${faction} : bâtiments dans l'anneau de la capitale`);
    assert.equal(ring(col).length, config.city.ringSlots.colony, `${faction} : bâtiments dans l'anneau d'une colonie`);
    // niveaux visés : jamais au-dessus du maximum de la ville (Bâtiment principal 20 partout, Mur d'une colonie 15)
    for (const capital of [true, false]) assert.ok(economy.planFor(faction, capital).every(([k, l]) => k === 'FIELDS' || l <= fx.maxLevelIn(k, capital)), `${faction} : plan dans les maximums`);
    // la Grande écurie demande l'Écurie 20 de la capitale ; les Grandes caserne et écurie montent jusqu'à l'élite
    const topOf = (plan, k) => Math.max(0, ...plan.filter(([x]) => x === k).map(([, l]) => l));
    assert.equal(topOf(economy.planFor(faction, true), 'MAIN_HALL'), 20);
    assert.equal(topOf(economy.planFor(faction, false), 'MAIN_HALL'), 20);
    assert.equal(topOf(economy.planFor(faction, true), 'WALL'), 20);
    assert.equal(topOf(economy.planFor(faction, false), 'WALL'), buildingsData.find(b => b.key === 'WALL').effects.colonyMaxLevel);
    assert.equal(topOf(economy.planFor(faction, true), 'STABLE'), 20);
    for (const k of ['GREAT_BARRACKS', 'GREAT_STABLE']) assert.equal(topOf(economy.planFor(faction, false), k), buildingsData.find(b => b.key === k).effects.unlockEliteTier);
  }
  const rome = economy.planFor('ROME', true);
  const top = (k) => Math.max(...rome.filter(([x]) => x === k).map(([, l]) => l));
  assert.equal(top('TREASURE_CHAMBER'), 20);
  assert.ok(top('HEALING_TENT') >= 15);
  // les Thermes demandent la Tente de soins 5 : elle vient avant eux dans le plan
  assert.ok(rome.findIndex(([k, l]) => k === 'HEALING_TENT' && l >= 5) < rome.findIndex(([k]) => k === 'ROMAN_THERMAE'));
});

test('stock partagé des joueurs automatiques : payer, retirer et tenir dans les greniers comme le serveur', () => {
  const cap = city({ id: 'a', isCapital: true, wood: 100, stone: 900, iron: 50, food: 10, maxStorage: 1000, maxFoodStorage: 1000 });
  const col = city({ id: 'b', wood: 800, stone: 100, iron: 600, food: 900, maxStorage: 1000, maxFoodStorage: 1000 });
  const bot = botWith(withBalance([cap, col], { production: 100, consumption: 50, net: 50 }));
  assert.ok(Stock.canPay(bot, { wood: 850, iron: 600 }), 'la somme des villes paie');
  assert.ok(!Stock.canPay(bot, { wood: 901 }));
  assert.ok(!Stock.canPay(bot, { wood: 850 }, { reserve: { wood: 100 } }));
  assert.ok(!Stock.canPay(bot, { wood: 600 }, { margin: 1.6 }));
  Stock.spend(bot, cap, { wood: 300, stone: 200 });
  assert.equal(cap.wood, 0); assert.equal(col.wood, 600);          // la ville de l'action d'abord, puis l'autre
  assert.equal(cap.stone, 700); assert.equal(col.stone, 100);
  // ce qu'on peut avoir en main : les stockages réunis ; la nourriture moins l'entretien d'un pas de 6 h
  assert.equal(Stock.room(bot, 'wood', 6), 2000);
  assert.equal(Stock.room(bot, 'food', 6), 2000 - 300);
  assert.ok(Stock.fits(bot, { wood: 2000, food: 1700 }, 6));
  assert.ok(!Stock.fits(bot, { food: 1701 }, 6));
  assert.deepEqual(Stock.buildCost('FARM', 3), buildCostFor(buildingsData.find(b => b.key === 'FARM'), 3));
});

test('économie : une colonie bâtit avec le stock de la capitale ; un prix trop gros pour une ville seule ne bloque plus', () => {
  const hall = (l) => ({ key: 'MAIN_HALL', level: l, slot: 0 });
  const cap = city({ id: 'a', isCapital: true, buildings: [hall(10)], wood: 50000, stone: 50000, iron: 50000, food: 50000, maxStorage: 60000, maxFoodStorage: 60000 });
  const col = city({ id: 'b', buildings: [hall(1)], wood: 0, stone: 0, iron: 0, food: 0, maxStorage: 3600, maxFoodStorage: 3600 });
  const bot = botWith(withBalance([cap, col], { production: 1000, consumption: 0, net: 1000 }));
  assert.ok(economy.nextBuild(bot, col, ctx()), 'la colonie vide construit avec le stock de la capitale');
  // un niveau dont le prix dépasse le Dépôt d'une ville mais tient dans les deux : plus de marge de 95 %
  const big = city({ id: 'c', buildings: [hall(20), { key: 'WAREHOUSE', level: 20 }, { key: 'SILO', level: 20 }, { key: 'TREASURE_CHAMBER', level: 19, slot: 3 }], maxStorage: 160000, maxFoodStorage: 160000 });
  const helper = city({ id: 'd', maxStorage: 160000, maxFoodStorage: 160000 });
  const tc20 = buildCostFor(buildingsData.find(b => b.key === 'TREASURE_CHAMBER'), 20);
  assert.ok(tc20.wood > 160000 && tc20.wood <= 320000);
  for (const [c, part] of [[big, 0.5], [helper, 0.5]]) for (const r of Stock.RES) c[r] = Math.ceil(tc20[r] * part) + 10;
  const rich = botWith(withBalance([big, helper], { production: 1000, consumption: 0, net: 1000 }));
  big.isCapital = true;
  assert.ok(Stock.fits(rich, tc20, 6) && Stock.canPay(rich, tc20));
});

test('Résidence 20 et dernière colonie : le stockage de toutes les villes compte, pas le grenier de la capitale moins 6 h', async () => {
  const silo20 = { maxStorage: 160000, maxFoodStorage: 160000 };
  const res20 = buildCostFor(buildingsData.find(b => b.key === 'RESIDENCE'), 20);
  // la Résidence 20 donne le dernier colon (2 colonies depuis le 31 octobre 2026, lu dans les données)
  assert.ok(fx.settlerSlots(20) === config.city.maxSecondaryCities && fx.settlerSlots(19) === config.city.maxSecondaryCities - 1);
  const cap = city({ id: 'a', isCapital: true, ...silo20, buildings: [{ key: 'MAIN_HALL', level: 20, slot: 0 }, { key: 'RESIDENCE', level: 19, slot: 4 }, { key: 'SILO', level: 20, slot: 5 }, { key: 'WAREHOUSE', level: 20, slot: 6 }], wood: 60000, stone: 60000, iron: 60000, food: 90000 });
  const c1 = city({ id: 'b', ...silo20, wood: 30000, stone: 10000, iron: 10000, food: 60000 });
  // 6 000 céréales par heure : la capitale seule n'a jamais plus de 160 000 − 36 000 = 124 000 en main (< 130 668)
  const cities = withBalance([cap, c1], { production: 7000, consumption: 6000, net: 1000 });
  assert.ok(res20.food > 160000 - 6000 * 6);
  const posted = [];
  const bot = botWith(cities, { post: async (p, body) => { posted.push([p, body]); return { ok: true, data: { cost: res20, queueItem: { slot: 4 } } }; } });
  const m = { k: {} };
  await military.residence(bot, ctx(), { left: 3 }, m, cap);
  assert.deepEqual(posted, [['/api/cities/a/build', { buildingKey: 'RESIDENCE' }]]);
  assert.equal(m.k.residenceLevels, 1);
  // payée sur toutes les villes, la capitale d'abord
  assert.equal(cap.food, 0); assert.equal(c1.food, 60000 - (res20.food - 90000));
});

test('Résidence : un Silo 20 de la capitale qui ne suffit pas fait monter celui d\'une colonie', async () => {
  const cap = city({ id: 'a', isCapital: true, maxStorage: 160000, maxFoodStorage: 160000, buildings: [{ key: 'MAIN_HALL', level: 20, slot: 0 }, { key: 'RESIDENCE', level: 19, slot: 4 }, { key: 'SILO', level: 20, slot: 5 }], wood: 90000, stone: 90000, iron: 90000, food: 90000 });
  const col = city({ id: 'b', maxStorage: 3600, maxFoodStorage: 1200, buildings: [{ key: 'MAIN_HALL', level: 8, slot: 0 }, { key: 'SILO', level: 1, slot: 2 }] });
  const posted = [];
  const bot = botWith(withBalance([cap, col], { production: 7000, consumption: 6000, net: 1000 }), { post: async (p, body) => { posted.push([p, body]); return { ok: true, data: {} }; } });
  await military.residence(bot, ctx(), { left: 3 }, { k: {} }, cap);
  assert.deepEqual(posted, [['/api/cities/b/build', { buildingKey: 'SILO' }]], 'le Silo de la colonie');
});

test('soins des joueurs automatiques : soin payant lancé dans la ville des blessés, sur le stock de toutes les villes', async () => {
  const cap = city({ id: 'a', isCapital: true, buildings: [{ key: 'HEALING_TENT', level: 5 }], wood: 100, stone: 100, iron: 100, food: 100, maxStorage: 9000, maxFoodStorage: 9000 });
  const col = city({ id: 'b', wood: 5000, stone: 5000, iron: 5000, food: 5000, maxStorage: 9000, maxFoodStorage: 9000 });
  const rows = [
    { cityId: 'b', unitKey: 'ROM_INF_BASE', count: 0, waiting: 120, healable: 100, healCost: { wood: 900, stone: 600, iron: 1650, food: 600 }, instantGold: 0 },
    { cityId: 'a', unitKey: 'ROM_ARC_BASE', count: 0, waiting: 50, healable: 50, healCost: { wood: 99999, stone: 1, iron: 1, food: 1 }, instantGold: 0 },
    { cityId: 'a', unitKey: 'ROM_CAV_BASE', count: 10, waiting: 0, healable: 0, healCost: null, instantGold: 10 }
  ];
  const calls = [];
  const bot = botWith(withBalance([cap, col], { production: 100, consumption: 10, net: 90 }), {
    me: { gold: 100 },
    get: async (p) => { calls.push(['GET', p]); return { ok: true, data: rows }; },
    post: async (p, body) => { calls.push(['POST', p, body]); return { ok: true, data: p.endsWith('/start') ? { started: body.count, cost: rows[0].healCost } : { healed: 10, goldSpent: 10 } }; }
  });
  const m = { k: {} };
  await military.heal(bot, ctx(), { left: 6 }, m, cap);
  assert.deepEqual(calls, [
    ['GET', '/api/cities/a/wounded'],
    ['POST', '/api/cities/b/wounded/start', { unitKey: 'ROM_INF_BASE', count: 100 }],   // la ville des blessés, `healable`
    ['POST', '/api/cities/a/wounded/heal', { unitKey: 'ROM_CAV_BASE' }]                 // soin à l'or des blessés au lit
  ]);
  assert.equal(m.k.healStarted, 100);
  assert.equal(m.k.healWaitRes, 1, 'un soin trop cher attend');
  assert.equal(cap.wood, 0); assert.equal(col.wood, 5000 - 800);   // la capitale d'abord (la tente y est), puis la colonie
  assert.equal(bot.me.gold, 90);
});

test('Mur des joueurs automatiques : sur l\'enceinte, même quand l\'anneau est plein', () => {
  const at = (key, slot, level) => ({ key, slot, level });
  const fields = Object.entries(config.city.fieldSlots).flatMap(([k, slots]) => slots.map(sl => at(k, sl, 5)));
  // l'anneau plein : les 18 bâtiments possibles de la capitale sur ses 18 emplacements
  const ring = ['WAREHOUSE', 'SILO', 'RALLY_POINT', 'BARRACKS', 'ACADEMY', 'HERO_MANSION', 'HIDEOUT', 'EMBASSY', 'WATCHTOWER', 'HEALING_TENT', 'FORGE', 'MARKET', 'STABLE', 'RESIDENCE', 'WORKSHOP', 'TREASURE_CHAMBER', 'ROMAN_THERMAE', 'TRADE_OFFICE']
    .map((k, i) => at(k, i + 1, 5));
  const cap = city({ id: 'a', isCapital: true, x: 0, y: 0, buildings: [at('MAIN_HALL', 0, 5), ...fields, ...ring], wood: 90000, stone: 90000, iron: 90000, food: 90000, maxStorage: 100000, maxFoodStorage: 100000 });
  const bot = botWith(withBalance([cap], { production: 1000, consumption: 0, net: 1000 }));
  assert.equal(ring.length, config.city.ringSlots.capital, 'les emplacements de l\'anneau de la capitale sont pris');
  assert.deepEqual(economy.nextBuild(bot, cap, ctx()), { buildingKey: 'WALL', slot: config.city.wallSlot });
});

test('colonie des joueurs automatiques : 12 emplacements, Mur arrêté à 15, plus de Marché ni de Comptoir', () => {
  const at = (key, slot, level) => ({ key, slot, level });
  const fields = Object.entries(config.city.fieldSlots).flatMap(([k, slots]) => slots.map(sl => at(k, sl, 20)));
  const wallMax = fx.maxLevelIn('WALL', false);
  const capital = city({ id: 'a', isCapital: true, buildings: [at('MAIN_HALL', 0, 20), at('BARRACKS', 1, 20), at('STABLE', 2, 20), at('TREASURE_CHAMBER', 3, 20), at('MARKET', 4, 10)], maxStorage: 1e6, maxFoodStorage: 1e6 });
  // les 12 bâtiments possibles d'une colonie, au plus haut de son plan ; son Mur au maximum des colonies
  const ringKeys = ['WAREHOUSE', 'SILO', 'HIDEOUT', 'MILL', 'BAKERY', 'SAWMILL', 'STONEMASON', 'FOUNDRY', 'GREAT_WAREHOUSE', 'GREAT_SILO', 'GREAT_BARRACKS', 'GREAT_STABLE'];
  assert.equal(ringKeys.length, config.city.ringSlots.colony);
  const ring = ringKeys.map((k, i) => at(k, i + 1, buildingsData.find(b => b.key === k).maxLevel));
  const col = city({ id: 'b', isCapital: false, buildings: [at('MAIN_HALL', 0, 20), ...fields, ...ring, at('WALL', config.city.wallSlot, wallMax)], maxStorage: 1e6, maxFoodStorage: 1e6 });
  for (const c of [capital, col]) Object.assign(c, { wood: 5e5, stone: 5e5, iron: 5e5, food: 5e5 });
  const bot = botWith(withBalance([capital, col], { production: 1000, consumption: 0, net: 1000 }));
  // tout est au bout : plus rien à bâtir dans la colonie, ni un 16e niveau de Mur, ni un Marché
  assert.equal(economy.nextBuild(bot, col, ctx()), null);
  // le Mur à 14 : il monte encore d'un niveau, sur l'enceinte
  col.buildings.find(b => b.key === 'WALL').level = wallMax - 1;
  assert.deepEqual(economy.nextBuild(bot, col, ctx()), { buildingKey: 'WALL', slot: config.city.wallSlot });
});

test('recrutement des joueurs automatiques : le palier vient du bâtiment de la ville qui forme, comme le serveur', () => {
  const keys = (c) => military.unlockedUnits(c, 'ROME').map(u => u.key).sort();
  const romans = (pred) => unitsData.filter(u => u.faction === 'ROME' && pred(u)).map(u => u.key).sort();
  const lvl = (key, level) => ({ key, level, slot: 1 });
  const capital = (...b) => ({ isCapital: true, buildings: b });
  const colony = (...b) => ({ isCapital: false, buildings: b });
  const GB = buildingsData.find(b => b.key === 'GREAT_BARRACKS').effects;
  assert.deepEqual(keys(capital(lvl('BARRACKS', 20))), romans(u => u.class === 'INFANTRY' || u.class === 'ARCHER'));
  assert.deepEqual(keys(capital(lvl('WORKSHOP', config.recruit.siegeWorkshopLevel))), romans(u => u.class === 'SIEGE'));
  assert.deepEqual(keys(capital(lvl('WORKSHOP', config.recruit.siegeWorkshopLevel - 1))), []);
  // une colonie : SA Grande caserne seulement (la Caserne 20 de la capitale ne compte pas), jamais d'engins
  assert.deepEqual(keys(colony(lvl('BARRACKS', 20), lvl('WORKSHOP', 20))), []);
  assert.deepEqual(keys(colony(lvl('GREAT_BARRACKS', 1))), romans(u => (u.class === 'INFANTRY' || u.class === 'ARCHER') && u.tier === 'base'));
  assert.deepEqual(keys(colony(lvl('GREAT_BARRACKS', GB.unlockIntermediateTier))), romans(u => (u.class === 'INFANTRY' || u.class === 'ARCHER') && u.tier !== 'elite'));
  assert.deepEqual(keys(colony(lvl('GREAT_STABLE', GB.unlockEliteTier))), romans(u => u.class === 'CAVALRY'));
});

test('site d\'une colonie : le bonus de gisement qui sert le joueur, la marche et la tribu comptent', () => {
  const cap = city({ id: 'a', isCapital: true, x: 0, y: 0, wood: 5000, stone: 1000, iron: 5000, food: 5000, maxStorage: 10000, maxFoodStorage: 10000 });
  const bot = botWith(withBalance([cap], { production: 1000, consumption: 900, net: 100 }));
  // l'armée mange presque tout : les céréales d'abord ; la pierre est la ressource la plus basse
  assert.deepEqual(military.siteWish(bot), { WOOD: 1, STONE: 1.5, IRON: 1, FOOD: 2 });
  // comme GET /api/map/free-sites (le bonus vient du serveur : 15 % par niveau dans cet exemple)
  const site = (id, type, level, x, tribePower = 0) => ({ id, type, level, bonusPct: 15 * level, x, y: 0, tribePower, travelSec: x * 100, central: false });
  const sites = [
    site('wood1', 'WOOD', 1, 8),
    site('food3', 'FOOD', 3, 14, 1000),
    site('iron3', 'IRON', 3, 6, 50000),      // camp hors de portée
    site('stone2', 'STONE', 2, 3),           // trop près de la capitale
    site('food3bis', 'FOOD', 3, 10)          // déjà raté
  ];
  const m = { ratio: 1.6, bad: ['food3bis'] };
  assert.equal(military.pickColonySite(bot, m, cap, sites, 0)?.id, 'food3', 'un gisement de céréales de niveau 3 un peu plus loin');
  // une colonie a déjà un gisement de céréales : une autre spécialité passe devant
  bot.cities.push(city({ id: 'b', x: -60, y: -60, site: { type: 'FOOD', level: 2, bonusPct: 30 }, playerStock: cap.playerStock }));
  assert.equal(military.siteWish(bot).FOOD, 1.5);
  assert.equal(military.pickColonySite(bot, m, cap, sites, 0)?.id, 'wood1');
  assert.equal(military.pickColonySite(bot, m, cap, [], 0), null);
});

test('stock partagé des joueurs automatiques : après la ville de l\'action, la plus pleine par rapport à son plafond', () => {
  const a = city({ id: 'a', isCapital: true, wood: 100, maxStorage: 1000 });
  const b = city({ id: 'b', wood: 5000, maxStorage: 10000 });   // la plus riche, pleine à 50 %
  const c = city({ id: 'c', wood: 900, maxStorage: 1000 });     // pleine à 90 %
  const bot = botWith(withBalance([a, b, c], { production: 0, consumption: 0, net: 0 }));
  Stock.spend(bot, a, { wood: 600 });
  assert.deepEqual([a.wood, b.wood, c.wood], [0, 5000, 400]);
});

test('recrutement des joueurs automatiques : l\'élite paie de l\'or, gardé pour elle ; la capitale forme plus vite avec les Grandes casernes', async () => {
  const elite = unitsData.find(u => u.faction === 'ROME' && u.class === 'INFANTRY' && u.tier === 'elite');
  const lvl = (key, level, slot) => ({ key, level, slot });
  const setup = (gold, rich) => {
    const amount = rich ? 1e6 : 1e5;
    const cap = city({ id: 'a', isCapital: true, buildings: [lvl('MAIN_HALL', 20, 0), lvl('BARRACKS', 20, 1)], wood: amount, stone: amount, iron: amount, food: amount, maxStorage: 2 * amount, maxFoodStorage: 2 * amount });
    const col = city({ id: 'b', isCapital: false, buildings: [lvl('MAIN_HALL', 5, 0), lvl('GREAT_BARRACKS', 20, 1)] });
    const posted = [];
    const bot = botWith(withBalance([cap, col], { production: amount / 10, consumption: 0, net: amount / 10 }), {
      me: { gold },
      post: async (p, body) => { posted.push([p, body]); const u = unitsData.find(x => x.key === body.unitKey); return { ok: true, data: { cost: Stock.recruitCost(u, body.count), gold: recruitGoldFor(u, body.count), queueItem: { unitKey: u.key, count: body.count, buildingKey: 'BARRACKS', endsAt: new Date(0).toISOString() } } }; }
    });
    return { cap, bot, posted, m: { k: {} }, c: { ...ctx(), clock: { now: () => 0 }, rand: () => 0.99 } };
  };
  // pas assez d'or pour 5 unités d'élite : le palier intermédiaire passe, aucun or pris
  const poor = setup(recruitGoldFor(elite, 5) - 1, false);
  await military.recruit(poor.bot, poor.c, { left: 3 }, poor.m, poor.cap);
  const firstPoor = unitsData.find(u => u.key === poor.posted[0][1].unitKey);
  assert.equal(firstPoor.tier, 'intermediate');
  assert.equal(poor.m.k.eliteWaitGold, 1);
  assert.equal(poor.bot.me.gold, recruitGoldFor(elite, 5) - 1);
  // 50 or : 50 unités d'élite au plus (1 or chacune pour commencer), l'or du joueur baisse d'autant
  const some = setup(50, false);
  await military.recruit(some.bot, some.c, { left: 3 }, some.m, some.cap);
  assert.deepEqual(some.posted.map(([p, b]) => [p, b.unitKey]), [['/api/cities/a/recruit', elite.key]]);
  const n = some.posted[0][1].count;
  assert.ok(n >= 5 && recruitGoldFor(elite, n) <= 50, `${n} unités`);
  assert.equal(some.bot.me.gold, 50 - recruitGoldFor(elite, n));
  // réserve : une ville forme l'élite, le joueur garde l'or d'un lot avant les autres dépenses
  some.bot.me.gold = 500;
  assert.equal(military.spareGold(some.bot), 500 - recruitGoldFor(elite, 100));
  assert.equal(military.spareGold(botWith([city({ id: 'z', isCapital: true, buildings: [lvl('BARRACKS', 10, 1)] })], { me: { gold: 500 } })), 500, 'sans élite, rien à garder');
  // beaucoup d'or et de ressources : le lot finit dans les 18 h, au temps de la capitale accéléré par la Grande caserne
  const rich = setup(1e5, true);
  await military.recruit(rich.bot, rich.c, { left: 3 }, rich.m, rich.cap);
  const boost = fx.capitalTrainBoostPct(rich.bot.cities, 'INFANTRY');
  assert.ok(boost > 0);
  const perUnit = baseTrainSecondsFor(elite) * (1 - fx.trainTimeReductionPct(rich.cap.buildings, 'INFANTRY', boost) / 100);
  assert.equal(rich.posted[0][1].count, Math.floor(18 * 3600 / perUnit));
});

test('marché des joueurs automatiques : jamais plus que ce que portent les marchands libres, le Marché monte quand ils manquent', async () => {
  const cap = city({ id: 'a', isCapital: true, x: 0, y: 0, buildings: [{ key: 'MAIN_HALL', level: 10, slot: 0 }, { key: 'MARKET', level: 3, slot: 1 }], wood: 9000, stone: 5000, iron: 1000, food: 5000, maxStorage: 10000, maxFoodStorage: 10000 });
  const run = async (free) => {
    const calls = [];
    const bot = botWith(withBalance([{ ...cap, buildings: [...cap.buildings], buildQueue: [] }], { production: 100, consumption: 0, net: 100 }), {
      name: 'Marchand', playerId: 'p1', me: { faction: 'ROME', alliance: null },
      get: async (p) => { calls.push(['GET', p]); return p.startsWith('/api/market/state') ? { ok: true, data: { taxPct: 10, merchants: { total: 3, free, capacity: 500, speed: 80 } } } : { ok: true, data: [] }; },
      post: async (p, body) => { calls.push(['POST', p, body]); return { ok: true, data: p === '/api/market/offer' ? { offer: { id: 'o1' }, merchantsUsed: Math.ceil(body.sellAmount / 500), taxPct: 10 } : { cost: Stock.buildCost('MARKET', 4), queueItem: { slot: 1, targetLevel: 4 } } }; },
      del: async () => ({ ok: true, data: {} })
    });
    const c = { ...ctx(), step: 20, clock: { now: () => Date.parse('2027-01-10T12:00:00Z'), day: () => 6 }, bots: [], event: () => {} };
    c.bots.push(bot);
    await market.act(bot, c);
    return { bot, calls, c };
  };
  // un marchand libre (500) : une offre de 500 au plus, sans armée
  const one = await run(1);
  const offer = one.calls.find(([, p]) => p === '/api/market/offer');
  assert.ok(offer, JSON.stringify(one.calls));
  assert.ok(offer[2].sellAmount > 0 && offer[2].sellAmount <= 500 && !('armyId' in offer[2]), JSON.stringify(offer[2]));
  assert.deepEqual([offer[2].sellResource, offer[2].buyResource, offer[2].cityId], ['wood', 'iron', 'a']);
  // tous en route : pas d'offre, et le Marché de la capitale monte au début du tour suivant
  const none = await run(0);
  assert.ok(!none.calls.some(([, p]) => p === '/api/market/offer'));
  assert.equal(none.bot.mem.mkt.short, none.c.step);
  none.bot.cities[0].wood = none.bot.cities[0].stone = none.bot.cities[0].iron = none.bot.cities[0].food = 9500;
  await market.early(none.bot, { ...none.c, step: none.c.step + 1 });
  assert.deepEqual(none.calls.at(-1), ['POST', '/api/cities/a/build', { buildingKey: 'MARKET' }]);
  assert.equal(none.bot.mem.mkt.k.marketLevels, 1);
});
