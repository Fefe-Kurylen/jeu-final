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
const quests = require('../../tools/sim/modules/06-quests.cjs');
const wonder = require('../../tools/sim/modules/70-wonder.cjs');
const Armies = require('../../tools/sim/armies.cjs');
const WS = require('../../src/services/wonderService');

// Joueurs automatiques de la simulation longue (rapport économie, recommandation 15, et décisions du 30 octobre 2026 :
// stock partagé, placement des bâtiments, soins payants, unités formées dans la capitale ; colonies : Mur sur l'enceinte,
// palier des recrues lu sur la Grande caserne de la colonie, site choisi selon le gisement, ville la plus pleine d'abord ;
// revue des bâtiments du 31 octobre 2026 : anneau de 18 / 12 emplacements, Bâtiment principal 20, Mur des colonies 15,
// Marché et Comptoir dans la capitale, or des unités d'élite ; rapport de vérification du 31 octobre 2026 : échanges portés
// par des armées, emplacements de la Place de rassemblement partagés, gardes des colonies, Mur d'abord en colonie, site
// choisi d'après le niveau du gisement, quêtes, Merveille)

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

test('site d\'une colonie : le niveau du gisement compte d\'abord, puis la marche et la tribu rapportée à l\'armée du joueur', () => {
  const cap = city({ id: 'a', isCapital: true, x: 0, y: 0, wood: 5000, stone: 1000, iron: 5000, food: 5000, maxStorage: 10000, maxFoodStorage: 10000 });
  const bot = botWith(withBalance([cap], { production: 1000, consumption: 900, net: 100 }));
  // l'armée mange presque tout : les céréales d'abord ; la pierre est la ressource la plus basse
  assert.deepEqual(military.siteWish(bot), { WOOD: 1, STONE: 1.5, IRON: 1, FOOD: 2 });
  // comme GET /api/map/free-sites (le bonus vient du serveur : 10 % par niveau du gisement)
  const site = (id, type, level, x, tribePower = 0) => ({ id, type, level, bonusPct: 10 * level, x, y: 0, tribePower, travelSec: x * 100, central: false });
  const m = { ratio: 1.6, bad: ['food3bis'] };
  const pick = (sites, field = 0) => military.pickColonySite(bot, m, cap, sites, field)?.id || null;
  assert.equal(pick([
    site('wood1', 'WOOD', 1, 8),
    site('food3', 'FOOD', 3, 14, 1000),
    site('iron3', 'IRON', 3, 6, 50000),      // camp hors de portée
    site('stone2', 'STONE', 2, 3),           // trop près de la capitale
    site('food3bis', 'FOOD', 3, 10)          // déjà raté
  ]), 'food3', 'un gisement de céréales de niveau 3 un peu plus loin');
  // rapport de vérification du 31 octobre 2026 : un gisement de niveau 3 dix cases plus loin passe devant un niveau 1
  assert.equal(pick([site('wood1', 'WOOD', 1, 8), site('wood3', 'WOOD', 3, 18)]), 'wood3');
  // une tribu au plus fort de ce que l'armée bat coûte cher ; la même tribu ne pèse presque rien pour une grosse armée
  assert.equal(pick([site('wood1', 'WOOD', 1, 8), site('wood3', 'WOOD', 3, 18, 12000)]), 'wood1');
  assert.equal(pick([site('wood1', 'WOOD', 1, 8), site('wood3', 'WOOD', 3, 18, 12000)], 1.6 * 120000), 'wood3');
  // une colonie a déjà un gisement de céréales : les céréales comptent moins
  bot.cities.push(city({ id: 'b', x: -60, y: -60, site: { type: 'FOOD', level: 2, bonusPct: 20 }, playerStock: cap.playerStock }));
  assert.equal(military.siteWish(bot).FOOD, 1.5);
  assert.equal(pick([]), null);
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

// Marché (décision du 31 octobre 2026, rapport de vérification) : plus de marchands ; une offre réserve la caravane (statut
// MARKET), un échange part avec une armée libre de la ville (GET /api/market/state : leur charge), jamais une armée d'un
// autre rôle (guerre, gardes)
const unitsOf = (n) => [{ unitKey: 'ROM_INF_MILICIEN', tier: 'base', count: n }];
const marketCity = () => city({ id: 'a', isCapital: true, x: 0, y: 0, buildings: [{ key: 'MAIN_HALL', level: 10, slot: 0 }, { key: 'MARKET', level: 3, slot: 1 }, { key: 'RALLY_POINT', level: 5, slot: 2 }], wood: 9000, stone: 5000, iron: 1000, food: 5000, maxStorage: 10000, maxFoodStorage: 10000 });
const armyAt = (id, name, slot, extra = {}) => ({ id, name, slot, cityId: 'a', x: 0, y: 0, status: 'IDLE', isGarrison: false, units: unitsOf(20), ...extra });
async function runMarket({ armies, state, offers = [] }) {
  const calls = [];
  const bot = botWith(withBalance([marketCity()], { production: 100, consumption: 0, net: 100 }), {
    name: 'Marchand', playerId: 'p1', me: { faction: 'ROME', alliance: null }, armies, mem: { mil: { own: ['f1'] } },
    get: async (p) => {
      calls.push(['GET', p]);
      if (p.startsWith('/api/market/state')) return { ok: true, data: { taxPct: 30, basePct: 30, offerHours: 48, armies: state } };
      return { ok: true, data: p === '/api/market' ? offers : [] };
    },
    post: async (p, body) => { calls.push(['POST', p, body]); return { ok: true, data: p === '/api/market/offer' ? { offer: { id: 'o1' }, armyId: body.armyId, taxPct: 30 } : { toBuyer: 280, toSeller: 280, armyId: body.armyId } }; },
    del: async (p) => { calls.push(['DELETE', p]); return { ok: true, data: {} }; }
  });
  const c = { ...ctx(), step: 20, clock: { now: () => Date.parse('2027-01-10T12:00:00Z'), day: () => 6 }, bots: [], event: () => {}, prisma: { allianceMember: { findUnique: async () => null } } };
  c.bots.push(bot);
  await market.act(bot, c);
  return { bot, calls, posted: calls.filter(x => x[0] === 'POST') };
}

test('marché des joueurs automatiques : l\'offre réserve la caravane, jamais plus que sa charge', async () => {
  const { bot, posted } = await runMarket({ armies: [armyAt('car', Armies.NAMES.caravan, 2)], state: [{ id: 'car', name: Armies.NAMES.caravan, capacity: 500, hero: false }] });
  assert.equal(posted.length, 1, JSON.stringify(posted));
  const [, p, body] = posted[0];
  assert.equal(p, '/api/market/offer');
  assert.deepEqual([body.sellResource, body.buyResource, body.cityId, body.armyId], ['wood', 'iron', 'a', 'car']);
  assert.ok(body.sellAmount > 0 && body.sellAmount <= 500, JSON.stringify(body));
  // l'armée attend en ville avec les marchandises : elle n'est plus libre
  assert.equal(bot.armies[0].status, 'MARKET');
  // caravane déjà réservée par une offre (statut MARKET, absente des armées libres) : pas de seconde offre
  const busy = await runMarket({ armies: [armyAt('car', Armies.NAMES.caravan, 2, { status: 'MARKET' })], state: [] });
  assert.equal(busy.posted.length, 0);
});

test('marché des joueurs automatiques : un échange part avec une armée libre qui porte la contrepartie, jamais l\'Ost', async () => {
  const offer = { id: 'x1', sellerId: 'p2', status: 'ACTIVE', sellResource: 'iron', sellAmount: 400, buyResource: 'wood', buyAmount: 400, city: { x: 5, y: 5 }, createdAt: '2027-01-10T00:00:00Z', expiresAt: '2027-01-12T00:00:00Z' };
  // la caravane attend avec une offre : l'armée de campagne au repos porte les 400 de bois (un aller-retour)
  const armies = [armyAt('car', Armies.NAMES.caravan, 3, { status: 'MARKET' }), armyAt('f1', 'Armée 1', 1), armyAt('ost', Armies.NAMES.ost, 2)];
  const ok = await runMarket({ armies, offers: [offer], state: [{ id: 'f1', name: 'Armée 1', capacity: 600, hero: false }, { id: 'ost', name: Armies.NAMES.ost, capacity: 5000, hero: false }] });
  assert.deepEqual(ok.posted, [['POST', '/api/market/offer/x1/accept', { cityId: 'a', armyId: 'f1' }]]);
  assert.equal(ok.bot.mem.mkt.k.accepted, 1);
  assert.equal(ok.bot.armies.find(a => a.id === 'f1').status, 'TRANSPORTING');
  // trop peu de charge : pas d'échange, même si l'Ost porterait tout
  const small = await runMarket({ armies, offers: [offer], state: [{ id: 'f1', name: 'Armée 1', capacity: 300, hero: false }, { id: 'ost', name: Armies.NAMES.ost, capacity: 5000, hero: false }] });
  assert.equal(small.posted.length, 0);
  assert.equal(small.bot.mem.mkt.k.acceptNoArmy, 1);
  // la plus petite armée qui suffit, sans le héros quand une autre suffit
  const pick = market.pickArmy({ mem: { mil: { own: ['f1', 'f2'] } } }, { armies: [{ id: 'f1', name: 'A', capacity: 900, hero: true }, { id: 'f2', name: 'B', capacity: 1200, hero: false }] }, 800);
  assert.equal(pick.id, 'f2');
});

test('marché des joueurs automatiques : la caravane se forme sur une place libre et prend des porteurs à la garnison', async () => {
  const cap = marketCity();
  const garrison = { id: 'g', isGarrison: true, cityId: 'a', x: 0, y: 0, status: 'IDLE', units: unitsOf(400) };
  const calls = [];
  const bot = botWith(withBalance([cap], { production: 100, consumption: 0, net: 100 }), {
    name: 'Marchand', playerId: 'p1', me: { faction: 'ROME' }, armies: [garrison, armyAt('f1', 'Armée 1', 1)], mem: { mil: { own: ['f1'] } },
    post: async (p, body) => { calls.push([p, body]); return { ok: true, data: p === '/api/army/create' ? { army: { id: 'car', name: body.name, slot: body.slot, cityId: 'a', x: 0, y: 0, status: 'IDLE', isGarrison: false } } : { newCount: body.count } }; }
  });
  await market.early(bot, { ...ctx(), step: 20 });
  // Place de rassemblement 5 : 2 armées ; l'armée de campagne a la sienne, la caravane prend l'autre
  assert.deepEqual(calls[0], ['/api/army/create', { cityId: 'a', slot: 2, name: Armies.NAMES.caravan }]);
  // une charge d'environ 15 % du stockage (2 000 au moins) : 29 miliciens de 70
  assert.deepEqual(calls[1], ['/api/army/car/set-unit', { unitKey: 'ROM_INF_MILICIEN', count: 29 }]);
});

test('emplacements de la Place de rassemblement : partagés par ordre de priorité entre les rôles', () => {
  const cap = city({ id: 'a', isCapital: true, x: 0, y: 0, buildings: [{ key: 'RALLY_POINT', level: 10, slot: 2 }] });
  const col = city({ id: 'b', x: 30, y: 30 });
  const bot = botWith([cap, col], { armies: [{ id: 'f1', name: 'Armée 1', slot: 1, cityId: 'a', isGarrison: false }], mem: { mil: { own: ['f1'], guard: {} }, war: { wantOst: true } } });
  assert.equal(fx.maxArmies(cap.buildings), 3);
  // une colonie sans garde et un Ost voulu : 2 places attendues sur les 2 libres, rien pour la caravane
  assert.equal(Armies.missing(bot, 'guard'), 1);
  assert.equal(Armies.freeSlot(bot, 'caravan'), null);
  assert.equal(Armies.freeSlot(bot, 'guard'), 3);
  assert.equal(Armies.freeSlot(bot, 'ost'), 3);
  // la garde formée : il reste la place de l'Ost, toujours rien pour la caravane
  bot.armies.push({ id: 'g1', name: Armies.NAMES.guard, slot: 3, cityId: 'a', isGarrison: false });
  bot.mem.mil.guard.b = 'g1';
  assert.equal(Armies.freeSlot(bot, 'ost'), 2);
  assert.equal(Armies.freeSlot(bot, 'caravan'), null);
  // l'Ost formé : plus aucune place
  bot.armies.push({ id: 'o1', name: Armies.NAMES.ost, slot: 2, cityId: 'a', isGarrison: false });
  assert.equal(Armies.freeSlot(bot, 'hunt'), null);
});

test('garde d\'une colonie : formée dans la capitale, remplie depuis la garnison, puis postée dans la colonie', async () => {
  const cap = city({ id: 'a', isCapital: true, x: 0, y: 0, buildings: [{ key: 'RALLY_POINT', level: 5, slot: 2 }] });
  const col = city({ id: 'b', x: 30, y: 30, createdAt: '2027-01-01T00:00:00Z' });
  const garrison = { id: 'g', isGarrison: true, cityId: 'a', x: 0, y: 0, status: 'IDLE', units: unitsOf(400) };
  const calls = [];
  const m = { own: ['f1'], k: {} };
  const bot = botWith([cap, col], {
    armies: [garrison, { id: 'f1', name: 'Armée 1', slot: 1, cityId: 'a', x: 0, y: 0, status: 'IDLE', isGarrison: false, units: [] }], mem: { mil: m },
    post: async (p, body) => { calls.push([p, body]); return { ok: true, data: p === '/api/army/create' ? { army: { id: 'g1', name: body.name, slot: body.slot, cityId: 'a', x: 0, y: 0, status: 'IDLE', isGarrison: false } } : { newCount: body.count } }; }
  });
  await military.guards(bot, { ...ctx(), step: 30 }, { left: 6 }, m, cap);
  assert.deepEqual(calls.map(c => c[0]), ['/api/army/create', '/api/army/g1/set-unit', '/api/army/g1/move']);
  assert.deepEqual(calls[0][1], { cityId: 'a', slot: 2, name: Armies.NAMES.guard });
  assert.deepEqual(calls[1][1], { unitKey: 'ROM_INF_MILICIEN', count: 60 });   // 15 % des 400 soldats du joueur
  assert.deepEqual(calls[2][1], { x: 30, y: 30 });
  assert.equal(m.guard.b, 'g1');
  // en poste dans la colonie : rien à faire
  bot.armies.find(a => a.id === 'g1').status = 'IDLE';
  Object.assign(bot.armies.find(a => a.id === 'g1'), { x: 30, y: 30 });
  calls.length = 0;
  await military.guards(bot, { ...ctx(), step: 31 }, { left: 6 }, m, cap);
  assert.deepEqual(calls, []);
});

test('économie des joueurs automatiques : le Mur d\'abord dans une colonie neuve ; la Ville Merveille ne bâtit que son Mur', () => {
  const hall = (l) => ({ key: 'MAIN_HALL', level: l, slot: 0 });
  const cap = city({ id: 'a', isCapital: true, buildings: [hall(10)], wood: 50000, stone: 50000, iron: 50000, food: 50000, maxStorage: 60000, maxFoodStorage: 60000 });
  const col = city({ id: 'b', buildings: [hall(1)], maxStorage: 3600, maxFoodStorage: 3600 });
  const bot = botWith(withBalance([cap, col], { production: 1000, consumption: 0, net: 1000 }));
  // le Mur demande le Bâtiment principal 3 : il monte d'abord, puis le Mur passe avant les champs et le reste
  assert.deepEqual(economy.nextBuild(bot, col, ctx()), { buildingKey: 'MAIN_HALL' });
  col.buildings = [hall(3)];
  assert.deepEqual(economy.nextBuild(bot, col, ctx()), { buildingKey: 'WALL', slot: config.city.wallSlot });
  const plan = economy.planFor('ROME', false, true);
  assert.deepEqual([...new Set(plan.map(([k]) => k))].sort(), ['MAIN_HALL', 'WALL']);
  assert.equal(Math.max(...plan.filter(([k]) => k === 'WALL').map(([, l]) => l)), fx.maxLevelIn('WALL', false));
  // Forge et Atelier jusqu'au niveau 20, la Cachette plus haut que 3 (rapport de vérification du 31 octobre 2026)
  const top = (p, k) => Math.max(0, ...p.filter(([x]) => x === k).map(([, l]) => l));
  const capital = economy.planFor('ROME', true);
  assert.equal(top(capital, 'FORGE'), 20); assert.equal(top(capital, 'WORKSHOP'), 20); assert.equal(top(capital, 'HIDEOUT'), 20);
  assert.equal(top(economy.planFor('ROME', false), 'HIDEOUT'), 20);
});

test('quêtes des joueurs automatiques : les récompenses prêtes, dans une ville qui a la place', () => {
  const view = { tutorial: { current: { key: 't1', kind: 'tutorial', claimable: true, reward: { wood: 100 } } }, tasks: [{ key: 'x:1', kind: 'task', claimable: false }], daily: { quests: [{ key: 'd1', kind: 'daily', claimable: true, reward: { food: 50 } }], bonus: { key: 'd_bonus', kind: 'daily', bonus: true, claimable: true } }, weekly: { quests: [], bonus: null }, achievements: [] };
  assert.deepEqual(quests.claimables(view).map(q => q.key), ['t1', 'd1', 'd_bonus']);
  const cap = city({ id: 'a', isCapital: true, wood: 1150, maxStorage: 1200 });
  const col = city({ id: 'b', wood: 0, maxStorage: 1200 });
  const bot = botWith([col, cap]);
  assert.equal(quests.cityFor(bot, { wood: 40 }).id, 'a', 'la capitale d\'abord');
  assert.equal(quests.cityFor(bot, { wood: 100 }).id, 'b', 'sinon une ville qui a la place');
  assert.equal(quests.cityFor(bot, { wood: 5000 }), null);
});

test('Merveille des joueurs automatiques : livraison selon le coût d\'un niveau, la capitale garde de quoi bâtir ; défense face à la vague suivante', () => {
  const cap = city({ id: 'a', isCapital: true, wood: 90000, stone: 90000, iron: 40000, food: 30000, maxStorage: 100000, maxFoodStorage: 100000 });
  const bot = botWith(withBalance([cap], { production: 1000, consumption: 0, net: 1000 }));
  const load = wonder.deliveryLoad(bot, cap, 50000, 0);
  const total = Object.values(load).reduce((t, v) => t + v, 0);
  assert.ok(total <= 50000 && total >= 49000, JSON.stringify(load));
  for (const r of ['wood', 'stone', 'iron', 'food']) assert.ok(cap[r] - load[r] >= 0.3 * 100000 - 10, `${r} : la capitale garde 30 %`);
  assert.equal(load.food, 0, 'pas de céréales au-dessus de la réserve');
  // la vague suivante : celle du niveau d'après, avec une marge
  assert.equal(wonder.waveNeed(10), WS.wavePower(11) * 1.25);
  assert.equal(wonder.waveNeed(0), WS.wavePower(1) * 1.25);
});

test('colon de la Ville Merveille : le module militaire ne le prend pas pour une colonie que la Résidence ne permet pas', async () => {
  const run = async (residence) => {
    const cap = city({ id: 'a', isCapital: true, x: 0, y: 0, settlers: 1, buildings: [{ key: 'MAIN_HALL', level: 15, slot: 0 }, { key: 'RESIDENCE', level: residence, slot: 3 }], wood: 500, stone: 500, iron: 500, food: 500, maxStorage: 1000, maxFoodStorage: 1000 });
    const col = city({ id: 'b', x: 30, y: 30 });
    const calls = [];
    const bot = botWith(withBalance([cap, col], { production: 100, consumption: 0, net: 100 }), {
      get: async (p) => { calls.push(['GET', p]); return { ok: true, data: [] }; },
      post: async (p, body) => { calls.push(['POST', p, body]); return { ok: false, status: 400, data: {} }; }
    });
    await military.early(bot, { ...ctx(), step: 40 });
    return calls;
  };
  // Résidence 15 : une colonie au plus, déjà fondée ; le colon formé ensuite attend la Ville Merveille (70-wonder.cjs)
  assert.ok(!(await run(15)).some(([, p]) => p.startsWith('/api/map/free-sites')));
  // Résidence 20 : une seconde colonie est permise, le colon sert à la fonder
  assert.ok((await run(20)).some(([, p]) => p.startsWith('/api/map/free-sites')));
});
