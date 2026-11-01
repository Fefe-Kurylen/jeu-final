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
const invasion = require('../../tools/sim/modules/60-invasion.cjs');
const Armies = require('../../tools/sim/armies.cjs');
const WS = require('../../src/services/wonderService');

// Joueurs automatiques de la simulation longue (rapport économie, recommandation 15, et décisions du 30 octobre 2026 :
// stock partagé, placement des bâtiments, soins payants, unités formées dans la capitale ; colonies : Mur sur l'enceinte,
// palier des recrues lu sur la Grande caserne de la colonie, site choisi selon le gisement, ville la plus pleine d'abord ;
// revue des bâtiments du 31 octobre 2026 : anneau de 18 / 12 emplacements, Bâtiment principal 20, Mur des colonies 15,
// Marché et Comptoir dans la capitale, or des unités d'élite ; rapport de vérification du 31 octobre 2026 : échanges portés
// par des armées, emplacements de la Place de rassemblement partagés, gardes des colonies, Mur d'abord en colonie, site
// choisi d'après le niveau du gisement, quêtes, Merveille ; simulation sim-d relue : la ressource qui bloque la Merveille
// d'abord et ses céréales achetées au marchand du serveur, escorte du colon gardée, armées fondues pour les rassemblements,
// donjons commencés et chef d'abord, céréales du marchand seulement quand le joueur en manque, Comptoir et Grandes caserne
// et écurie à 20)

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
    // l'élite d'abord (niveau 15), puis le niveau 20 une fois le reste bâti (formation de la capitale à +30 %, décision D13) ;
    // le Comptoir 20 (taxe des échanges à 5 % avec la Chambre au Trésor 20)
    for (const k of ['GREAT_BARRACKS', 'GREAT_STABLE']) {
      const col = economy.planFor(faction, false);
      assert.equal(topOf(col, k), buildingsData.find(b => b.key === k).maxLevel);
      assert.ok(col.findIndex(([x, l]) => x === k && l === buildingsData.find(b => b.key === k).effects.unlockEliteTier) < col.findIndex(([x, l]) => x === k && l === 20));
    }
    assert.equal(topOf(economy.planFor(faction, true), 'TRADE_OFFICE'), 20);
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

test('Merveille des joueurs automatiques : la ressource qui bloque part d\'abord, la capitale garde de quoi bâtir ; défense face à la vague suivante', () => {
  const cap = city({ id: 'a', isCapital: true, wood: 90000, stone: 90000, iron: 40000, food: 30000, maxStorage: 100000, maxFoodStorage: 100000 });
  const bot = botWith(withBalance([cap], { production: 1000, consumption: 0, net: 1000 }));
  const wc = { wonderLevel: 0, wonderWood: 0, wonderStone: 0, wonderIron: 0, wonderFood: 0 };
  // tout manque : la ressource dont la capitale a le moins en trop face au manque passe d'abord (le fer), puis le bois
  const load = wonder.deliveryLoad(bot, cap, 50000, wc);
  assert.deepEqual(load, { wood: 40000, stone: 0, iron: 10000, food: 0 });
  for (const r of ['wood', 'stone', 'iron', 'food']) assert.ok(cap[r] - load[r] >= 0.3 * 100000 - 10, `${r} : la capitale garde 30 %`);
  // les convois déjà en route comptent : le bois et le fer des 3 niveaux suivants arrivent, la pierre part
  const three = (r) => [1, 2, 3].reduce((t, l) => t + WS.levelCost(l)[r], 0);
  wc.inbound = { wood: three('wood'), stone: 0, iron: three('iron'), food: 0 };
  assert.deepEqual(wonder.deliveryLoad(bot, cap, 50000, wc), { wood: 0, stone: 50000, iron: 0, food: 0 });
  // la vague suivante : celle du niveau d'après, avec une marge
  assert.equal(wonder.waveNeed(10), WS.wavePower(11) * 1.25);
  assert.equal(wonder.waveNeed(0), WS.wavePower(1) * 1.25);
});

test('Merveille des joueurs automatiques : les céréales qui bloquent s\'achètent au marchand du serveur et partent ; rien de ce que le chantier a pour 10 niveaux', () => {
  const cost = (from, to) => { const t = { wood: 0, stone: 0, iron: 0, food: 0 }; for (let l = from; l <= to; l++) for (const [r, v] of Object.entries(WS.levelCost(l))) t[r] += v; return t; };
  // le chantier de la simulation sim-d : bois, pierre et fer pour 39 niveaux, 38 140 céréales (39 375 pour le niveau 2)
  const big = cost(2, 40);
  const wc = { wonderLevel: 1, wonderWood: big.wood, wonderStone: big.stone, wonderIron: big.iron, wonderFood: 38140 };
  const cap = city({ id: 'a', isCapital: true, buildings: [{ key: 'MARKET', level: 20, slot: 1 }], wood: 120000, stone: 150000, iron: 90000, food: 6833, maxStorage: 160000, maxFoodStorage: 160000 });
  const bot = botWith(withBalance([cap], { production: 1000, consumption: 900, net: 100 }));
  // le grenier de la capitale paie ses troupes d'abord : rien à livrer sans achat
  assert.deepEqual(wonder.deliveryLoad(bot, cap, 100000, wc), { wood: 0, stone: 0, iron: 0, food: 0 });
  const lackFood = cost(2, 4).food - 38140;
  const tax = fx.npcMarketTaxPct(20);
  const buy = wonder.foodPurchase(bot, cap, 100000, wc);
  assert.deepEqual(buy, { cityId: 'a', giveResource: 'stone', receiveResource: 'food', giveAmount: Math.ceil(lackFood / (1 - tax / 100)) });
  // l'achat arrivé : il part en entier (hors de la réserve de la capitale), et rien d'autre
  const received = Math.floor(buy.giveAmount * (1 - tax / 100));
  cap.stone -= buy.giveAmount; cap.food += received;
  assert.deepEqual(wonder.deliveryLoad(bot, cap, 100000, wc, { food: received }), { wood: 0, stone: 0, iron: 0, food: Math.floor(lackFood / 10) * 10 });
  // une armée trop petite : l'achat ne dépasse pas ce qu'elle porte
  assert.equal(wonder.foodPurchase(bot, { ...cap, food: 6833 }, 20000, wc).giveAmount, Math.ceil(20000 / (1 - tax / 100)));
  // chantier neuf (tout manque) : les céréales achetées partent quand même en entier, avant le bois, la pierre et le fer
  // (sinon l'entretien du tick suivant mangerait l'achat)
  const fresh = { wonderLevel: 0, wonderWood: 0, wonderStone: 0, wonderIron: 0, wonderFood: 0 };
  const full = city({ id: 'a', isCapital: true, buildings: [{ key: 'MARKET', level: 20, slot: 1 }], wood: 160000, stone: 160000, iron: 160000, food: 0, maxStorage: 160000, maxFoodStorage: 160000 });
  const hungry = botWith(withBalance([full], { production: 900, consumption: 1000, net: -100 }));
  const buy2 = wonder.foodPurchase(hungry, full, 100000, fresh);
  assert.equal(buy2.receiveResource, 'food');
  const got = Math.floor(buy2.giveAmount * (1 - tax / 100));
  full[buy2.giveResource] -= buy2.giveAmount; full.food += got;
  const load2 = wonder.deliveryLoad(hungry, full, 100000, fresh, { food: got });
  assert.equal(load2.food, Math.floor(got / 10) * 10, JSON.stringify(load2));
  assert.ok(Object.values(load2).reduce((t, v) => t + v, 0) <= 100000);
  // rien en trop à donner (bois, pierre et fer à la réserve de 30 %) : pas d'achat
  const poor = city({ id: 'b', isCapital: true, buildings: [{ key: 'MARKET', level: 20, slot: 1 }], wood: 48000, stone: 48000, iron: 48000, food: 0, maxStorage: 160000, maxFoodStorage: 160000 });
  assert.equal(wonder.foodPurchase(botWith(withBalance([poor], { production: 900, consumption: 1000, net: -100 })), poor, 100000, fresh), null);
});

test('fondateur de la Ville Merveille : il garde une escorte à la maison pendant la phase des sites, que le marché ne prend pas', () => {
  // un fondateur pas encore relu depuis une reprise de la simulation reste le fondateur (avant : remplacé par le premier relu)
  const ready = (id) => botWith([city({ id: `c${id}`, isCapital: true, x: 10, y: 10, buildings: [{ key: 'RESIDENCE', level: 20, slot: 4 }] }), city({ id: `k1${id}` }), city({ id: `k2${id}` })], { playerId: id, me: {}, group: 'A' });
  const other = ready('p2');
  const unloaded = botWith([], { playerId: 'p1', me: null, group: 'A' });
  const s = { allianceOf: new Map([['p1', 'al'], ['p2', 'al']]) };
  const as = { founder: 'p1' };
  const c = { bots: [unloaded, other], byGroup: () => [unloaded, other] };
  assert.equal(wonder.founderOf(c, s, 'A', as, 'al'), null);
  assert.equal(as.founder, 'p1');
  unloaded.me = {};   // relu, sans ville ni colon : remplacé
  assert.equal(wonder.founderOf(c, s, 'A', as, 'al'), other);
  // l'escorte : voulue tant qu'il a son colon et qu'un site reste à prendre ; la plus petite armée au repos, jamais le convoi
  const fcap = city({ id: 'a', isCapital: true, x: 0, y: 0, settlers: 1 });
  const founder = botWith([fcap], { playerId: 'p1', me: {}, armies: [armyAt('f1', 'Armée 1', 1, { units: unitsOf(100) }), armyAt('f2', 'Armée 3', 2, { units: unitsOf(300) }), armyAt('cv', Armies.NAMES.convoy, 3, { units: unitsOf(10) })], mem: { mil: { own: ['f1', 'f2'] } } });
  const sites = { sitesOpen: true, sites: [{ id: 'w1', cityId: null }] };
  assert.equal(wonder.escortWanted(sites, founder, null), true);
  assert.equal(wonder.escortWanted(sites, founder, { id: 'merveille' }), false);
  assert.equal(wonder.escortWanted({ sitesOpen: true, sites: [{ id: 'w1', cityId: 'x' }] }, founder, null), false);
  assert.equal(wonder.heldEscort(founder), null, 'sans le drapeau, rien de gardé');
  founder.mem.wonder = { holdEscort: true };
  assert.equal(wonder.heldEscort(founder).id, 'f1');
  const state = [{ id: 'f1', name: 'Armée 1', capacity: 7000, hero: false }, { id: 'f2', name: 'Armée 3', capacity: 21000, hero: false }];
  assert.deepEqual(market.tripArmies(founder, state, 10).map(a => a.id), ['f2']);
  // l'armée annoncée pour le prochain rassemblement de l'alliance reste aussi à la maison jusqu'à son pas
  founder.mem.wonder.keep = { f2: 12 };
  assert.deepEqual(market.tripArmies(founder, state, 11).map(a => a.id), []);
  assert.deepEqual(market.tripArmies(founder, state, 12).map(a => a.id), ['f2']);
  // une offre réserve la caravane jusqu'à 48 h : jamais quand elle est l'escorte gardée (souvent la plus petite armée)
  founder.armies.push(armyAt('car', Armies.NAMES.caravan, 4, { units: unitsOf(30) }));
  const st = { armies: [{ id: 'car', name: Armies.NAMES.caravan, capacity: 5000, hero: false }] };
  assert.equal(wonder.heldEscort(founder).id, 'car');
  assert.equal(market.pickArmy(founder, st, 1000, { offer: true }), null);
  founder.mem.wonder.holdEscort = false;
  assert.equal(market.pickArmy(founder, st, 1000, { offer: true }).id, 'car');
});

test('rassemblement contre les Immortels : toute l\'armée de la capitale part (autres armées fondues, 90 % de chaque troupe), jamais l\'escorte', () => {
  const pw = (k, n) => { const u = unitsData.find(x => x.key === k); return (u.stats.attack + u.stats.defense) * config.combat.tierCoefficients[u.tier] * n; };
  const row = (unitKey, count) => ({ unitKey, tier: unitsData.find(u => u.key === unitKey).tier, count });
  const cap = { id: 'a', x: 0, y: 0 };
  const garrison = { id: 'g', isGarrison: true, cityId: 'a', x: 0, y: 0, status: 'IDLE', units: [row('ROM_INF_MILICIEN', 1000), row('ROM_ARC_MILICIEN', 500), row('ROM_CAV_AUXILIAIRE', 40), row('ROM_SIEGE_CATAPULTE', 50)] };
  const mine = [garrison,
    armyAt('f1', 'Armée 1', 1, { units: [row('ROM_INF_TRIARII', 300)] }),
    armyAt('ost', Armies.NAMES.ost, 2, { units: [row('ROM_CAV_AUXILIAIRE', 200), row('ROM_SIEGE_CATAPULTE', 60)] }),
    armyAt('car', Armies.NAMES.caravan, 3, { units: unitsOf(30) }),
    armyAt('away', 'Armée 3', 4, { status: 'HARVESTING', units: unitsOf(500) })];
  const member = { playerId: 'p3', mem: { mil: { own: ['f1', 'away'] } } };
  const { full, part } = wonder.memberPart(member, cap, mine);
  assert.equal(part.army.id, 'f1');
  assert.deepEqual(part.others.map(a => a.id), ['ost'], 'l\'Ost se fond, pas la caravane ni l\'armée dehors');
  assert.deepEqual(Object.fromEntries(part.pool.map(u => [u.unitKey, u.count])), { ROM_INF_MILICIEN: 1000, ROM_ARC_MILICIEN: 500, ROM_CAV_AUXILIAIRE: 240 }, 'les engins restent');
  assert.equal(part.pot, pw('ROM_INF_TRIARII', 300) + pw('ROM_INF_MILICIEN', 900) + pw('ROM_ARC_MILICIEN', 450) + pw('ROM_CAV_AUXILIAIRE', 216));
  // le potentiel compte aussi l'armée partie récolter (pour annoncer le prochain rassemblement)
  assert.equal(full, pw('ROM_INF_TRIARII', 300) + pw('ROM_CAV_AUXILIAIRE', 200) + pw('ROM_INF_MILICIEN', 500) + pw('ROM_INF_MILICIEN', 900) + pw('ROM_ARC_MILICIEN', 450) + pw('ROM_CAV_AUXILIAIRE', 36));
  // le fondateur garde son escorte (la plus petite armée au repos) : elle ne part pas et ne se fond pas
  const founder = { playerId: 'p1', mem: { mil: { own: ['f1'] }, wonder: { holdEscort: true } } };
  const f = wonder.memberPart(founder, cap, [garrison, mine[1], mine[2]]).part;
  assert.equal(f.army.id, 'f1');
  assert.deepEqual(f.others, []);
});

test('invasions des joueurs automatiques : un donjon commencé et l\'étage du chef d\'abord ; un donjon neuf seulement s\'il peut être fini', () => {
  const node = (nodeId, level, floor, power, rest) => ({ nodeId, level, floor, power, rest, x: 0, y: 0 });
  const go = () => ({ solo: false, group: true, wear: false, march: 0 });
  const boss1 = node('boss1', 1, 3, 1.3e6, 0), fresh4 = node('fresh4', 4, 1, 2e6, 6e6);
  const pick = (nodes, o) => invasion.pickTarget(nodes, { margin: 1.15, plan: go, reachCap: 1e9, started: new Set(), ...o })?.n.nodeId || null;
  // simulation sim-d : l'ancien score préférait l'étage 1 neuf d'un niveau 4 au chef d'un niveau 1 ; le chef passe devant
  assert.equal(pick([fresh4, boss1]), 'boss1');
  assert.ok(invasion.targetScore(boss1, go(), false) > invasion.targetScore(fresh4, go(), false));
  // un donjon commencé à portée : pas de donjon neuf
  const started2 = node('started2', 2, 2, 6e5, 9e5);
  assert.equal(pick([fresh4, started2], { started: new Set(['started2']) }), 'started2');
  // rien de commencé à portée : un donjon neuf seulement si l'alliance peut le finir avant la fin de l'invasion
  assert.equal(pick([fresh4], { reachCap: 5e6 }), null);
  assert.equal(pick([fresh4], { reachCap: 1e7 }), 'fresh4');
  const blocked = (n) => (n.nodeId === 'started2' ? { solo: false, group: false, wear: false, march: 0 } : go());
  assert.equal(pick([fresh4, started2], { started: new Set(['started2']), plan: blocked }), 'fresh4');
  // un rassemblement d'usure compte moitié, sauf contre le chef
  const wear = { solo: false, group: false, wear: true, march: 0 };
  assert.equal(invasion.targetScore(boss1, wear, false), invasion.targetScore(boss1, go(), false));
  assert.equal(invasion.targetScore(started2, wear, true), invasion.targetScore(started2, go(), true) / 2);
});

test('invasions des joueurs automatiques : l\'armée qui part prend l\'Ost et les autres armées au repos, jamais l\'escorte du colon', async () => {
  const cap = city({ id: 'a', isCapital: true, x: 0, y: 0, buildings: [{ key: 'RALLY_POINT', level: 5, slot: 2 }] });
  const garrison = { id: 'g', isGarrison: true, cityId: 'a', x: 0, y: 0, status: 'IDLE', units: unitsOf(400) };
  const cav = (n) => ({ unitKey: 'ROM_CAV_AUXILIAIRE', tier: 'base', count: n });
  const armies = [garrison, armyAt('f1', 'Armée 1', 1, { units: unitsOf(100) }), armyAt('ost', Armies.NAMES.ost, 2, { units: [cav(200), { unitKey: 'ROM_SIEGE_CATAPULTE', tier: 'siege', count: 60 }] }), armyAt('conv', Armies.NAMES.convoy, 3, { units: unitsOf(50) })];
  const bot = botWith([cap], { armies, mem: { mil: { own: ['f1'] } } });
  // Place de rassemblement 5 : deux emplacements pris, pas d'armée de chasse ; l'Ost compte parmi les armées qui partent
  const usable = invasion.usableArmies(bot, {}, true);
  assert.deepEqual(usable.map(o => o.army.id).sort(), ['f1', 'ost']);
  const o = usable.find(x => x.army.id === 'f1');
  assert.deepEqual(o.merge.map(a => a.id), ['ost'], 'le convoi ne se fond pas');
  // la garnison et les soldats de l'Ost (sans ses engins), la ville garde 10 %
  assert.deepEqual(o.rows.map(r => [r.unitKey, r.count]), [['ROM_INF_MILICIEN', 360], ['ROM_CAV_AUXILIAIRE', 170]]);
  // le fondateur de la Ville Merveille garde la plus petite armée au repos pour son colon
  bot.mem.wonder = { holdEscort: true };
  const held = invasion.usableArmies(bot, {}, true);
  assert.ok(!held.some(x => x.army.id === 'f1'), 'l\'escorte ne part pas');
  assert.deepEqual(held.find(x => x.army.id === 'ost').merge, [], 'ni ne se fond');
  // durée de marche : le temps que le serveur a donné pour la paire de villes, à la lenteur de l'armée
  invasion.learn({ id: 'a', x: 0, y: 0 }, { id: 'L', x: 10, y: 0 }, 20, 1200);
  assert.equal(await invasion.marchSecs({ city: { id: 'a', x: 0, y: 0 }, spt: 30 }, { id: 'L', x: 10, y: 0 }), 1800);
  assert.equal(await invasion.marchSecs({ city: { id: 'a', x: 0, y: 0 }, spt: 30 }, { id: 'a', x: 0, y: 0 }), 0);
  // l'armée annoncée pour le prochain rassemblement de la Merveille part quand même au donjon (seule l'escorte reste)
  bot.mem.wonder = { holdEscort: false, keep: { f1: 99, ost: 99 } };
  bot.ctx = { step: 10 };
  const kept = invasion.usableArmies(bot, {}, true);
  assert.deepEqual(kept.map(x => x.army.id).sort(), ['f1', 'ost']);
  assert.deepEqual(kept.find(x => x.army.id === 'f1').merge.map(a => a.id), ['ost']);
});

test('invasions des joueurs automatiques : entre deux pas, une armée rentrée d\'un rassemblement enchaîne ; sim.cjs a l\'heure de son retour', async () => {
  const T = Date.parse('2027-01-09T02:00:00Z');
  const cap = city({ id: 'a', isCapital: true, x: 0, y: 0, buildings: [{ key: 'RALLY_POINT', level: 5, slot: 2 }] });
  const garrison = { id: 'g', isGarrison: true, cityId: 'a', x: 0, y: 0, status: 'IDLE', units: unitsOf(400) };
  const calls = [];
  const away = () => [garrison, armyAt('f1', 'Armée 1', 1, { status: 'RETURNING', x: 5, y: 5, units: unitsOf(300) })];
  let seen = away();   // ce que GET /api/army rend
  const bot = botWith([cap], {
    name: 'Chasseur', turn: 0, playerId: 'p1', me: { alliance: { allianceId: 'al' } }, mem: { mil: { own: ['f1'] }, inv: { k: {}, p: [], ra: { f1: 4 } } },
    armies: away(),
    api: async (method, p) => { calls.push(`${method} ${p}`); return p === '/api/army' ? { ok: true, status: 200, data: seen } : { ok: true, status: 200, data: { rallies: [] } }; }
  });
  let asked = null;
  const prisma = {
    invasion: { findFirst: async () => ({ id: 'inv', endsAt: new Date(T + 20 * 3600000) }) },
    horde: { findMany: async () => [] }, resourceNode: { findMany: async () => [] }, hordeDamage: { findMany: async () => [] },
    army: { aggregate: async (q) => { asked = q; return { _min: { arrivalAt: new Date(T + 1800000) } }; } }
  };
  const c = { step: 5, OPT: { start: T - 5 * 6 * 3600000, stepHours: 6 }, clock: { now: () => T }, bots: [bot], prisma, plays: () => true, rand: () => 0.5, event: () => {} };
  // un tick d'une heure : l'armée rentre encore, rien à rejouer ; sim.cjs demande la prochaine échéance, son retour
  await invasion.subTick(c);
  assert.deepEqual(calls, ['GET /api/army']);
  assert.equal(await invasion.nextDue(c, T + 6 * 3600000), T + 1800000);
  assert.deepEqual(asked.where.id, { in: ['f1'] });
  assert.equal(asked.where.status, 'RETURNING');
  // le tick de son retour : l'armée est rentrée, le joueur relit ses armées et rejoue (ici, rien à rejoindre ni à lancer)
  seen = [garrison, armyAt('f1', 'Armée 1', 1, { units: unitsOf(300) })];
  calls.length = 0;
  await invasion.subTick(c);
  assert.deepEqual(calls, ['GET /api/army', 'GET /api/rallies']);
  assert.equal(bot.mem.inv.k.chainTurns, 1);
  assert.deepEqual(bot.mem.inv.ra, {});
  assert.equal(await invasion.nextDue(c, T + 6 * 3600000), null, 'plus rien à attendre');
  // un joueur dont aucune armée n'est partie avec un rassemblement ne relit rien
  calls.length = 0;
  await invasion.subTick(c);
  assert.deepEqual(calls, []);
  assert.equal(bot.mem.invS.errors || 0, 0, bot.mem.invS.lastError);
});

test('marché des joueurs automatiques : le marchand du serveur ne vend des céréales que quand tous les greniers du joueur sont bas', async () => {
  const run = async (colonyFood) => {
    const cap = city({ id: 'a', isCapital: true, buildings: [{ key: 'MAIN_HALL', level: 20, slot: 0 }, { key: 'MARKET', level: 20, slot: 1 }], wood: 50000, stone: 99000, iron: 50000, food: 5000, maxStorage: 100000, maxFoodStorage: 100000 });
    const col = city({ id: 'b', food: colonyFood, maxStorage: 640000, maxFoodStorage: 640000 });
    const posted = [];
    const bot = botWith(withBalance([cap, col], { production: 1000, consumption: 900, net: 100 }), {
      name: 'Marchand', playerId: 'p1', me: { faction: 'ROME', alliance: null }, armies: [], mem: {},
      get: async (p) => ({ ok: true, data: p === '/api/market' ? [] : [] }),
      post: async (p, body) => { posted.push([p, body]); return { ok: true, data: { given: body.giveAmount, received: Math.floor(body.giveAmount * 0.89), taxPct: 11 } }; }
    });
    const c = { ...ctx(), step: 20, clock: { now: () => Date.parse('2027-01-10T12:00:00Z'), day: () => 6 }, bots: [bot], event: () => {}, prisma: { allianceMember: { findUnique: async () => null } } };
    await market.act(bot, c);
    return { posted, k: bot.mem.mkt.k };
  };
  // les greniers des colonies sont pleins (le grenier de la capitale est bas à cause de l'entretien) : du bois, pas de céréales
  const full = await run(614000);
  assert.deepEqual(full.posted.map(([p, b]) => [p, b.giveResource, b.receiveResource]), [['/api/market/npc-trade', 'stone', 'wood']]);
  assert.equal(full.k.npcFoodSkipped, 1);
  // tous les greniers bas : des céréales
  const empty = await run(10000);
  assert.deepEqual(empty.posted.map(([p, b]) => [p, b.giveResource, b.receiveResource]), [['/api/market/npc-trade', 'stone', 'food']]);
  assert.equal(empty.k.npcFoodTrades, 1);
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
