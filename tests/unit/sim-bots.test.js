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
  // une armée qui bat une tribu de 12 000 (1,6 × 12 000 : la puissance demandée face à une tribu)
  const army12k = 1.6 * 12000;
  assert.equal(pick([
    site('wood1', 'WOOD', 1, 8),
    site('food3', 'FOOD', 3, 14, 1000),
    site('iron3', 'IRON', 3, 6, 50000),      // camp hors de portée
    site('stone2', 'STONE', 2, 3),           // trop près de la capitale
    site('food3bis', 'FOOD', 3, 10)          // déjà raté
  ], army12k), 'food3', 'un gisement de céréales de niveau 3 un peu plus loin');
  // rapport de vérification du 31 octobre 2026 : un gisement de niveau 3 dix cases plus loin passe devant un niveau 1
  assert.equal(pick([site('wood1', 'WOOD', 1, 8), site('wood3', 'WOOD', 3, 18)]), 'wood3');
  // sans armée, seuls les sites sans tribu (simulation sim-e : le seuil de 12 000 faisait viser des camps jamais battus) ;
  // la même tribu ne pèse presque rien pour une grosse armée
  assert.equal(pick([site('wood1', 'WOOD', 1, 8), site('wood3', 'WOOD', 3, 18, 12000)]), 'wood1');
  assert.equal(pick([site('wood1', 'WOOD', 1, 8), site('wood3', 'WOOD', 3, 18, 12000)], 1.6 * 120000), 'wood3');
  // simulation sim-e (34 secondes colonies sur 38 au niveau 1) : un gisement de niveau 2 ou 3 reste visé jusqu'à 1,5 fois la
  // portée de l'armée (elle grandit pendant la marche et le nettoyage du camp), un niveau 1 non
  const army8k = 1.6 * 8000;
  assert.equal(pick([site('wood1t', 'WOOD', 1, 8, 10000), site('wood3', 'WOOD', 3, 18, 10000)], army8k), 'wood3');
  assert.equal(pick([site('wood1t', 'WOOD', 1, 8, 10000)], army8k), null);
  assert.equal(pick([site('wood3', 'WOOD', 3, 18, 13000)], army8k), null, 'au-delà de 1,5 fois la portée');
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
  cap.buildings.find(b => b.key === 'RALLY_POINT').level = 10;   // 3 armées : campagne, « Défense » (G10), caravane
  const garrison = { id: 'g', isGarrison: true, cityId: 'a', x: 0, y: 0, status: 'IDLE', units: unitsOf(400) };
  const calls = [];
  const bot = botWith(withBalance([cap], { production: 100, consumption: 0, net: 100 }), {
    name: 'Marchand', playerId: 'p1', me: { faction: 'ROME' }, armies: [garrison, armyAt('f1', 'Armée 1', 1), armyAt('d1', Armies.NAMES.defense, 2)], mem: { mil: { own: ['f1'] } },
    post: async (p, body) => { calls.push([p, body]); return { ok: true, data: p === '/api/army/create' ? { army: { id: 'car', name: body.name, slot: body.slot, cityId: 'a', x: 0, y: 0, status: 'IDLE', isGarrison: false } } : { newCount: body.count } }; }
  });
  await market.early(bot, { ...ctx(), step: 20 });
  // Place de rassemblement 10 : 3 armées ; l'armée de campagne et l'armée « Défense » de la capitale (G10 : seules les armées
  // défendent, décision du 2 novembre 2026) ont la leur, la caravane prend la dernière ; la Défense ne porte jamais au marché
  assert.deepEqual(calls[0], ['/api/army/create', { cityId: 'a', slot: 3, name: Armies.NAMES.caravan }]);
  // une charge d'environ 15 % du stockage (2 000 au moins) : 29 miliciens de 70
  assert.deepEqual(calls[1], ['/api/army/car/set-unit', { unitKey: 'ROM_INF_MILICIEN', count: 29 }]);
});

test('emplacements de la Place de rassemblement : partagés par ordre de priorité entre les rôles', () => {
  const cap = city({ id: 'a', isCapital: true, x: 0, y: 0, buildings: [{ key: 'RALLY_POINT', level: 10, slot: 2 }] });
  const col = city({ id: 'b', x: 30, y: 30 });
  const bot = botWith([cap, col], { armies: [{ id: 'f1', name: 'Armée 1', slot: 1, cityId: 'a', isGarrison: false }], mem: { mil: { own: ['f1'], guard: {} }, war: { wantOst: true } } });
  assert.equal(fx.maxArmies(cap.buildings), 3);
  // une colonie sans garde, l'armée « Défense » de la capitale (G10 : seules les armées défendent, décision du 2 novembre
  // 2026) et un Ost voulu : 3 places attendues sur les 2 libres ; la garde d'abord, la Défense ensuite, rien pour l'Ost ni la
  // caravane
  assert.equal(Armies.missing(bot, 'guard'), 1);
  assert.equal(Armies.missing(bot, 'defense'), 1);
  assert.equal(Armies.freeSlot(bot, 'caravan'), null);
  assert.equal(Armies.freeSlot(bot, 'guard'), 3);
  assert.equal(Armies.freeSlot(bot, 'defense'), 3);
  assert.equal(Armies.freeSlot(bot, 'ost'), null);
  // la garde formée (elle prend une place de la capitale le temps de la marche) : la Défense prend la dernière
  bot.armies.push({ id: 'g1', name: Armies.NAMES.guard, slot: 3, cityId: 'a', isGarrison: false });
  bot.mem.mil.guard.b = 'g1';
  assert.equal(Armies.freeSlot(bot, 'defense'), 2);
  assert.equal(Armies.freeSlot(bot, 'ost'), null);
  bot.armies.push({ id: 'd1', name: Armies.NAMES.defense, slot: 2, cityId: 'a', isGarrison: false });
  assert.equal(Armies.missing(bot, 'defense'), 0);
  assert.equal(Armies.freeSlot(bot, 'ost'), null);
  // la garde rattachée à sa colonie (E2) rend sa place : l'Ost la prend, toujours rien pour la caravane
  bot.armies.find(a => a.id === 'g1').cityId = 'b';
  assert.equal(Armies.freeSlot(bot, 'ost'), 3);
  assert.equal(Armies.freeSlot(bot, 'caravan'), null);
  // l'Ost formé : plus aucune place
  bot.armies.push({ id: 'o1', name: Armies.NAMES.ost, slot: 3, cityId: 'a', isGarrison: false });
  assert.equal(Armies.freeSlot(bot, 'hunt'), null);
  // une Place de rassemblement à un seul emplacement : il reste à l'armée de campagne, pas de Défense demandée
  const small = botWith([city({ id: 'c', isCapital: true, x: 0, y: 0, buildings: [{ key: 'RALLY_POINT', level: 1, slot: 2 }] })], { mem: { mil: { own: [] } } });
  assert.equal(fx.maxArmies(small.capital.buildings), 1);
  assert.equal(Armies.missing(small, 'defense'), 0);
});

test('garde d\'une colonie : formée dans la capitale, remplie depuis la garnison, postée, rattachée (E2), puis regarnie par échange (G9) quand elle s\'affaiblit', async () => {
  const cap = city({ id: 'a', isCapital: true, x: 0, y: 0, buildings: [{ key: 'RALLY_POINT', level: 5, slot: 2 }] });
  const col = city({ id: 'b', x: 30, y: 30, createdAt: '2027-01-01T00:00:00Z' });
  const garrison = { id: 'g', isGarrison: true, cityId: 'a', x: 0, y: 0, status: 'IDLE', units: unitsOf(400) };
  const calls = [];
  const m = { own: ['f1'], k: {} };
  let made = 0;
  const reply = (p, body) => {
    if (p === '/api/army/create') return { army: { id: `g${++made}`, name: body.name, slot: body.slot, cityId: 'a', x: 0, y: 0, status: 'IDLE', isGarrison: false } };
    if (p.endsWith('/attach-colony')) return { army: { id: p.split('/')[3], cityId: 'b', slot: 1, name: Armies.NAMES.guard }, colony: { id: 'b' } };   // la réponse de POST /api/army/:id/attach-colony
    if (p.endsWith('/detach-colony')) return { army: { id: p.split('/')[3], cityId: 'a', slot: 2, name: Armies.NAMES.guard }, arrivalAt: '2027-02-01T10:00:00Z', travelTime: 3600 };
    // la réponse de POST /api/army/:id/exchange (G9) : les troupes des deux armées après l'échange
    if (p.endsWith('/exchange')) return { message: 'Échange fait', from: { id: p.split('/')[3], name: Armies.NAMES.guard, units: [] }, to: { id: body.toArmyId, name: Armies.NAMES.guard, units: [{ unitKey: 'ROM_INF_MILICIEN', tier: 'base', count: 52 }] }, moved: { units: body.units, back: [] } };
    return { newCount: body.count };
  };
  const bot = botWith([cap, col], {
    armies: [garrison, { id: 'f1', name: 'Armée 1', slot: 1, cityId: 'a', x: 0, y: 0, status: 'IDLE', isGarrison: false, units: [] }], mem: { mil: m },
    post: async (p, body = {}) => { calls.push([p, body]); return { ok: true, data: reply(p, body) }; },
    del: async (p) => { calls.push([`DELETE ${p}`]); return { ok: true, data: {} }; }
  });
  await military.guards(bot, { ...ctx(), step: 30 }, { left: 6 }, m, cap);
  assert.deepEqual(calls.map(c => c[0]), ['/api/army/create', '/api/army/g1/set-unit', '/api/army/g1/move']);
  assert.deepEqual(calls[0][1], { cityId: 'a', slot: 2, name: Armies.NAMES.guard });
  assert.deepEqual(calls[1][1], { unitKey: 'ROM_INF_MILICIEN', count: 60 });   // 15 % des 400 soldats du joueur
  assert.deepEqual(calls[2][1], { x: 30, y: 30 });
  assert.equal(m.guard.b, 'g1');
  assert.equal(Armies.freePlaces(bot), 0, 'Place de rassemblement 5 : 2 emplacements, l\'armée de campagne et la garde en route');
  // arrivée au repos dans la colonie : elle s'y rattache et rend sa place à la capitale
  const g1 = bot.armies.find(a => a.id === 'g1');
  Object.assign(g1, { status: 'IDLE', x: 30, y: 30 });
  calls.length = 0;
  await military.guards(bot, { ...ctx(), step: 31 }, { left: 6 }, m, cap);
  assert.deepEqual(calls.map(c => c[0]), ['/api/army/g1/attach-colony']);
  assert.equal(g1.cityId, 'b');
  assert.equal(m.k.guardsAttached, 1);
  assert.equal(Armies.freePlaces(bot), 1, 'la place de la capitale est libre pour un autre rôle');
  assert.deepEqual(Armies.attachedArmies(bot).map(a => a.id), ['g1']);
  assert.equal(Armies.guardsMissing(bot), 0, 'la colonie garde sa garde');
  // rattachée et assez forte : rien à faire
  calls.length = 0;
  await military.guards(bot, { ...ctx(), step: 32 }, { left: 6 }, m, cap);
  assert.deepEqual(calls, []);
  // affaiblie (simulation sim-e : 8 061 renvois refusés, faute de place à la capitale) : une relève se forme dans la capitale
  // avec seulement ce qui manque à la garde (G9 : 52 voulus, 5 en poste, 47 à apporter) et part ; la garde reste en poste
  g1.units = unitsOf(5);
  calls.length = 0;
  await military.guards(bot, { ...ctx(), step: 40 }, { left: 6 }, m, cap);
  assert.deepEqual(calls.map(c => c[0]), ['/api/army/create', '/api/army/g2/set-unit', '/api/army/g2/move']);
  assert.deepEqual(calls[1][1], { unitKey: 'ROM_INF_MILICIEN', count: 47 });
  assert.deepEqual([m.guard.b, m.rel.b, m.gr.b, m.rs.b], ['g1', 'g2', 40, 47]);
  assert.deepEqual([m.k.guardTopUps, m.k.guardReliefs], [1, undefined]);
  // arrivée au repos dans la colonie : elle donne tous ses soldats à la garde (POST /api/army/:id/exchange) ; vidée hors de
  // chez elle, le serveur la pose aussitôt dans la capitale, où elle se dissout. La garde n'a pas quitté sa colonie
  const g2 = bot.armies.find(a => a.id === 'g2');
  Object.assign(g2, { status: 'IDLE', x: 30, y: 30 });
  calls.length = 0;
  await military.guards(bot, { ...ctx(), step: 41 }, { left: 6 }, m, cap);
  assert.deepEqual(calls.map(c => c[0]), ['/api/army/g2/exchange', 'DELETE /api/army/g2/disband']);
  assert.deepEqual(calls[0][1], { toArmyId: 'g1', units: [{ unitKey: 'ROM_INF_MILICIEN', count: 47 }] });
  assert.deepEqual([m.guard.b, m.rel.b, m.rs.b, m.gr.b], ['g1', undefined, undefined, undefined]);
  assert.deepEqual([g1.cityId, g1.status, g1.units.reduce((t, u) => t + u.count, 0)], ['b', 'IDLE', 52]);
  assert.ok(!bot.armies.some(a => a.id === 'g2'));
  assert.deepEqual([m.k.guardSwaps, m.k.guardSwapSoldiers, m.k.guardCourierDisbanded, m.k.guardRelieved], [1, 47, 1, undefined]);
  assert.equal(Armies.freePlaces(bot), 1, 'la place de la capitale est rendue');
  // regarnie à sa part : rien à faire au tour suivant
  calls.length = 0;
  await military.guards(bot, { ...ctx(), step: 42 }, { left: 6 }, m, cap);
  assert.deepEqual(calls, []);
});

// Une relève qui échange (G9), arrivée au repos dans la colonie de sa garde (5 soldats sur 52 voulus, la relève en porte 47) ;
// `exchangeReply` : ce que le serveur répond à POST /api/army/:id/exchange
function reliefArrived(exchangeReply) {
  const cap = city({ id: 'a', isCapital: true, x: 0, y: 0, buildings: [{ key: 'RALLY_POINT', level: 5, slot: 2 }] });
  const col = city({ id: 'b', x: 30, y: 30 });
  const garrison = { id: 'g', isGarrison: true, cityId: 'a', x: 0, y: 0, status: 'IDLE', units: unitsOf(300) };
  const g1 = { id: 'g1', name: Armies.NAMES.guard, slot: 1, cityId: 'b', x: 30, y: 30, status: 'IDLE', isGarrison: false, units: unitsOf(5) };
  const g2 = { id: 'g2', name: Armies.NAMES.guard, slot: 2, cityId: 'a', x: 30, y: 30, status: 'IDLE', isGarrison: false, units: unitsOf(47) };
  const calls = [];
  const m = { own: ['f1'], k: {}, guard: { b: 'g1' }, rel: { b: 'g2' }, rs: { b: 47 }, gr: { b: 40 }, gs: {} };
  const bot = botWith([cap, col], {
    armies: [garrison, { id: 'f1', name: 'Armée 1', slot: 1, cityId: 'a', x: 0, y: 0, status: 'IDLE', isGarrison: false, units: [] }, g1, g2], mem: { mil: m },
    post: async (p, body = {}) => {
      calls.push([p, body]);
      if (p.endsWith('/exchange')) return exchangeReply(body);
      if (p === '/api/army/create') return { ok: true, data: { army: { id: 'g3', name: body.name, slot: body.slot, cityId: 'a', x: 0, y: 0, status: 'IDLE', isGarrison: false } } };
      if (p.endsWith('/attach-colony')) return { ok: true, data: { army: { id: p.split('/')[3], cityId: 'b', slot: 1, name: Armies.NAMES.guard }, colony: { id: 'b' } } };
      if (p.endsWith('/detach-colony')) return { ok: true, data: { army: { id: p.split('/')[3], cityId: 'a', slot: 2, name: Armies.NAMES.guard }, arrivalAt: '2027-02-01T10:00:00Z', travelTime: 3600 } };
      return { ok: true, data: { newCount: body.count } };
    },
    del: async (p) => { calls.push([`DELETE ${p}`]); return { ok: true, data: {} }; }
  });
  return { bot, m, calls, cap, g1, g2 };
}

test('garde regarnie par échange (G9) : un serveur sans la route, ou trois refus de suite, ramènent la relève d\'avant', async () => {
  // la route absente (« Route non trouvee ») : la relève se rattache à la place de l'ancienne garde, qui rentre ; plus aucun
  // échange tenté ensuite
  const A = reliefArrived(() => ({ ok: false, status: 404, data: { error: 'Route non trouvee' } }));
  await military.guards(A.bot, { ...ctx(), step: 41 }, { left: 6 }, A.m, A.cap);
  assert.deepEqual(A.calls.map(c => c[0]), ['/api/army/g2/exchange', '/api/army/g2/attach-colony', '/api/army/g1/detach-colony']);
  assert.deepEqual([A.m.noSwap, A.m.k.guardSwapMissing, A.m.k.guardSwapGaveUp, A.m.k.guardRelieved], [1, 1, 1, 1]);
  assert.deepEqual([A.m.guard.b, A.m.rel.b, A.m.rs.b, A.g2.cityId, A.g1.cityId, A.g1.status], ['g2', undefined, undefined, 'b', 'a', 'RETURNING']);
  // l'ancienne garde rentrée s'est dissoute ; la nouvelle s'affaiblit à son tour : la relève d'avant, remplie à toute la part
  // (46 : 15 % des 305 soldats), qui se rattachera à l'arrivée
  A.bot.armies = A.bot.armies.filter(a => a.id !== 'g1');
  A.g2.units = unitsOf(5);
  A.calls.length = 0;
  await military.guards(A.bot, { ...ctx(), step: 50 }, { left: 6 }, A.m, A.cap);
  assert.deepEqual(A.calls.map(c => c[0]), ['/api/army/create', '/api/army/g3/set-unit', '/api/army/g3/move']);
  assert.deepEqual(A.calls[1][1], { unitKey: 'ROM_INF_MILICIEN', count: 46 });
  assert.deepEqual([A.m.k.guardReliefs, A.m.k.guardTopUps, A.m.rs.b, A.m.rel.b], [1, undefined, undefined, 'g3']);
  // un refus du serveur (400) : réessayé au tour suivant ; au troisième refus, la relève se rattache comme avant
  const B = reliefArrived(() => ({ ok: false, status: 400, data: { error: 'Les deux armées doivent se trouver au même endroit (même ville ou même case)' } }));
  for (const step of [41, 42]) {
    B.calls.length = 0;
    await military.guards(B.bot, { ...ctx(), step }, { left: 6 }, B.m, B.cap);
    assert.deepEqual(B.calls.map(c => c[0]), ['/api/army/g2/exchange']);
  }
  assert.deepEqual([B.m.sf.b, B.m.k.guardSwapRefused, B.m.guard.b, B.m.rel.b, B.m.rs.b], [2, 2, 'g1', 'g2', 47]);
  B.calls.length = 0;
  await military.guards(B.bot, { ...ctx(), step: 43 }, { left: 6 }, B.m, B.cap);
  assert.deepEqual(B.calls.map(c => c[0]), ['/api/army/g2/exchange', '/api/army/g2/attach-colony', '/api/army/g1/detach-colony']);
  assert.deepEqual([B.m.k.guardSwapRefused, B.m.k.guardSwapGaveUp, B.m.guard.b, B.m.noSwap, B.g1.status], [3, 1, 'g2', undefined, 'RETURNING']);
});

test('armée « Défense » de la capitale (G10) : formée sur une place libre, remplie à 25 % des soldats du joueur, regarnie seulement quand il lui manque 15 %', async () => {
  const cap = city({ id: 'a', isCapital: true, x: 0, y: 0, buildings: [{ key: 'RALLY_POINT', level: 10, slot: 2 }] });
  const garrison = { id: 'g', isGarrison: true, cityId: 'a', x: 0, y: 0, status: 'IDLE', units: unitsOf(400) };
  const calls = [];
  const m = { own: ['f1'], k: {} };
  const bot = botWith([cap], {
    armies: [garrison, { id: 'f1', name: 'Armée 1', slot: 1, cityId: 'a', x: 0, y: 0, status: 'IDLE', isGarrison: false, units: unitsOf(200) }], mem: { mil: m },
    post: async (p, body = {}) => { calls.push([p, body]); return { ok: true, data: p === '/api/army/create' ? { army: { id: 'd1', name: body.name, slot: body.slot, cityId: 'a', x: 0, y: 0, status: 'IDLE', isGarrison: false } } : { newCount: body.count } }; }
  });
  assert.equal(Armies.missing(bot, 'defense'), 1);
  await military.defense(bot, { ...ctx(), step: 30 }, { left: 6 }, m, cap);
  // 600 soldats : 150 pris dans la réserve (la garnison, qui ne défend plus), sur la place la plus haute (les premières vont à
  // l'armée de campagne)
  assert.deepEqual(calls.map(c => c[0]), ['/api/army/create', '/api/army/d1/set-unit']);
  assert.deepEqual(calls[0][1], { cityId: 'a', slot: 3, name: Armies.NAMES.defense });
  assert.deepEqual(calls[1][1], { unitKey: 'ROM_INF_MILICIEN', count: 150 });
  assert.deepEqual([m.def, m.k.defenseCreated, m.k.defenseFills, m.k.defenseSoldiers], ['d1', 1, 1, 150]);
  assert.equal(Armies.missing(bot, 'defense'), 0);
  const d1 = bot.armies.find(a => a.id === 'd1');
  // à sa part : rien à faire
  calls.length = 0;
  await military.defense(bot, { ...ctx(), step: 31 }, { left: 6 }, m, cap);
  assert.deepEqual(calls, []);
  // usée par un combat (100 soldats, 138 voulus sur 550) : regarnie dans la réserve
  d1.units = unitsOf(100);
  await military.defense(bot, { ...ctx(), step: 32 }, { left: 6 }, m, cap);
  assert.deepEqual(calls, [['/api/army/d1/set-unit', { unitKey: 'ROM_INF_MILICIEN', count: 138 }]]);
  assert.deepEqual([m.k.defenseFills, m.k.defenseSoldiers], [2, 188]);
  // il lui manque moins de 15 % de sa part : pas d'appel pour rien
  d1.units = unitsOf(125);
  calls.length = 0;
  await military.defense(bot, { ...ctx(), step: 33 }, { left: 6 }, m, cap);
  assert.deepEqual(calls, []);
  // hors de chez elle (elle ne part jamais, mais une reprise peut la trouver en route) ou ville assiégée : rien
  d1.units = unitsOf(10);
  d1.status = 'MOVING';
  await military.defense(bot, { ...ctx(), step: 34 }, { left: 6 }, m, cap);
  d1.status = 'IDLE'; cap.isSieged = true;
  await military.defense(bot, { ...ctx(), step: 35 }, { left: 6 }, m, cap);
  assert.deepEqual(calls, []);
});

test('garde rattachée que la mémoire ne suit plus (reprise) : reprise pour sa colonie ; trop faible, sa relève attend une place, que la caravane lui rend', async () => {
  const cap = city({ id: 'a', isCapital: true, x: 0, y: 0, buildings: [{ key: 'RALLY_POINT', level: 5, slot: 2 }, { key: 'MARKET', level: 1, slot: 3 }] });
  const col = city({ id: 'b', x: 30, y: 30 });
  const garrison = { id: 'g', isGarrison: true, cityId: 'a', x: 0, y: 0, status: 'IDLE', units: unitsOf(400) };
  const guard = { id: 'g7', name: Armies.NAMES.guard, slot: 1, cityId: 'b', x: 30, y: 30, status: 'IDLE', isGarrison: false, units: unitsOf(5) };
  const calls = [];
  const m = { own: ['f1'], k: {}, gs: { g7: 0 } };
  const bot = botWith([cap, col], {
    armies: [garrison, guard, armyAt('f1', 'Armée 1', 1), armyAt('car', Armies.NAMES.caravan, 2)], mem: { mil: m },
    post: async (p, body = {}) => { calls.push([p, body]); return { ok: true, data: p === '/api/army/create' ? { army: { id: 'g8', name: body.name, slot: body.slot, cityId: 'a', x: 0, y: 0, status: 'IDLE', isGarrison: false } } : { newCount: body.count } }; }
  });
  await military.guards(bot, { ...ctx(), step: 100 }, { left: 6 }, m, cap);
  assert.equal(m.guard.b, 'g7');
  assert.equal(m.k.guardAdopted, 1);
  // capitale pleine (armée de campagne et caravane) : la relève attend ; elle compte comme une garde qui manque, la caravane
  // doit rendre sa place (40-market.cjs, mustYield)
  assert.deepEqual(calls, []);
  assert.equal(m.k.guardNoSlot, 1);
  assert.equal(Armies.reliefsMissing(bot), 1);
  assert.equal(Armies.missing(bot, 'guard'), 1);
  assert.equal(Armies.mustYield(bot, 'caravan'), true);
  // la caravane partie : la relève se forme, se remplit et part ; l'ancienne garde reste en poste
  bot.armies = bot.armies.filter(a => a.id !== 'car');
  await military.guards(bot, { ...ctx(), step: 101 }, { left: 6 }, m, cap);
  assert.deepEqual(calls.map(c => c[0]), ['/api/army/create', '/api/army/g8/set-unit', '/api/army/g8/move']);
  assert.deepEqual([m.guard.b, m.rel.b], ['g7', 'g8']);
  assert.deepEqual([guard.cityId, guard.status], ['b', 'IDLE']);
  assert.equal(Armies.reliefsMissing(bot), 0);
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
  // la vague suivante : celle du niveau d'après, avec la marge apprise (1 au départ : simulation sim-e, 1,25 demandait 1,4 à
  // 1,7 fois ce que le vrai moteur demande)
  assert.equal(wonder.waveNeed(10), WS.wavePower(11));
  assert.equal(wonder.waveNeed(0), WS.wavePower(1));
  assert.equal(wonder.waveNeed(10, 1.2), WS.wavePower(11) * 1.2);
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
    armyAt('away', 'Armée 3', 4, { status: 'HARVESTING', units: unitsOf(500) }),
    armyAt('def', Armies.NAMES.defense, 5, { units: unitsOf(120) })];
  const member = { playerId: 'p3', mem: { mil: { own: ['f1', 'away'] } } };
  const { full, part } = wonder.memberPart(member, cap, mine);
  assert.equal(part.army.id, 'f1');
  assert.deepEqual(part.others.map(a => a.id), ['ost'], 'l\'Ost se fond, pas la caravane, l\'armée dehors ni l\'armée « Défense » de la capitale (G10)');
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
  const armies = [garrison, armyAt('f1', 'Armée 1', 1, { units: unitsOf(100) }), armyAt('ost', Armies.NAMES.ost, 2, { units: [cav(200), { unitKey: 'ROM_SIEGE_CATAPULTE', tier: 'siege', count: 60 }] }), armyAt('conv', Armies.NAMES.convoy, 3, { units: unitsOf(50) }), armyAt('def', Armies.NAMES.defense, 4, { units: unitsOf(80) })];
  const bot = botWith([cap], { armies, mem: { mil: { own: ['f1'] } } });
  // Place de rassemblement 5 : deux emplacements pris, pas d'armée de chasse ; l'Ost compte parmi les armées qui partent
  const usable = invasion.usableArmies(bot, {}, true);
  assert.deepEqual(usable.map(o => o.army.id).sort(), ['f1', 'ost']);
  const o = usable.find(x => x.army.id === 'f1');
  assert.deepEqual(o.merge.map(a => a.id), ['ost'], 'ni le convoi ni l\'armée « Défense » de la capitale (G10) ne se fondent');
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

// ---------- décisions du 1er novembre 2026 (simulation de 200 jours) : E1 à E6 ----------
const hero = require('../../tools/sim/modules/25-hero.cjs');
const pathfinding = require('../../src/utils/pathfinding');
const war = require('../../tools/sim/modules/50-war.cjs');

test('stock commun (E1) : ce qui peut partir se lit sur toutes les villes ; un départ prend la capitale d\'abord, une offre rendue y revient', () => {
  const cap = city({ id: 'a', isCapital: true, x: 0, y: 0, wood: 1000, food: 200, maxStorage: 10000, maxFoodStorage: 10000 });
  const col = city({ id: 'c', wood: 9500, food: 9000, maxStorage: 10000, maxFoodStorage: 10000 });
  const bot = botWith([cap, col]);
  const all = Stock.pool(bot, cap);
  assert.deepEqual([all.id, all.wood, all.food, all.maxStorage, all.maxFoodStorage], ['a', 10500, 9200, 20000, 20000]);
  // 3 000 de bois : 1 000 de la capitale, 2 000 de la colonie (compté à part)
  assert.equal(Stock.spend(bot, cap, { wood: 3000 }), 2000);
  assert.deepEqual([cap.wood, col.wood], [0, 7500]);
  // rendue : la capitale jusqu'à son plafond, puis la colonie ; rien de perdu tant qu'une ville a de la place
  assert.equal(Stock.credit(bot, cap, { wood: 12000 }), 0);
  assert.deepEqual([cap.wood, col.wood], [10000, 9500]);
  assert.equal(Stock.credit(bot, cap, { wood: 1000 }), 500, 'toutes les villes pleines : le reste est perdu');
});

test('marché (E1) : l\'offre se charge dans le stock commun (la colonie pleine de bois paie ce que la capitale n\'a pas)', async () => {
  const cap = marketCity();
  Object.assign(cap, { wood: 1000, stone: 1000, iron: 1000, food: 1000 });
  const col = city({ id: 'c', x: 20, y: 20, wood: 9500, stone: 1000, iron: 1000, food: 8000, maxStorage: 10000, maxFoodStorage: 10000 });
  const calls = [];
  const bot = botWith(withBalance([cap, col], { production: 100, consumption: 0, net: 100 }), {
    name: 'Marchand', playerId: 'p1', me: { faction: 'ROME', alliance: null }, armies: [armyAt('car', Armies.NAMES.caravan, 2)], mem: { mil: { own: [] } },
    get: async (p) => { calls.push(['GET', p]); return p.startsWith('/api/market/state') ? { ok: true, data: { taxPct: 30, armies: [{ id: 'car', name: Armies.NAMES.caravan, capacity: 5000, hero: false }] } } : { ok: true, data: [] }; },
    post: async (p, body) => { calls.push(['POST', p, body]); return { ok: true, data: { offer: { id: 'o1' }, armyId: body.armyId, taxPct: 30 } }; },
    del: async () => ({ ok: true, data: {} })
  });
  const c = { ...ctx(), step: 20, clock: { now: () => Date.parse('2027-01-10T12:00:00Z'), day: () => 6 }, bots: [bot], event: () => {}, prisma: {} };
  await market.act(bot, c);
  const offer = calls.find(x => x[0] === 'POST' && x[1] === '/api/market/offer');
  assert.ok(offer, `capitale seule à 10 % de bois : avant le stock commun, rien à offrir (${JSON.stringify(calls)})`);
  assert.equal(offer[2].sellResource, 'wood');
  assert.equal(offer[2].cityId, 'a', 'l\'armée part toujours de la capitale');
  const sold = offer[2].sellAmount;
  assert.equal(cap.wood, Math.max(0, 1000 - sold));
  assert.equal(col.wood, 9500 - Math.max(0, sold - 1000));
  assert.equal(bot.mem.mkt.k.loadFromOthers, Math.max(0, sold - 1000));
  // une offre qui convient se juge aussi sur le stock commun : fer manquant partout, bois en trop dans la colonie
  const all = Stock.pool(bot, cap);
  const deal = { sellResource: 'iron', sellAmount: 800, buyResource: 'wood', buyAmount: 500 };
  assert.ok(market.offerValue(all, deal, false, true, 0.7) > 0);
  assert.equal(market.offerValue(cap, deal, false, true, 0.7), null, 'la capitale seule n\'a plus le bois à donner');
});

test('marché : un échange accepté compte ce que l\'acheteur paie (paidVolume)', async () => {
  const offer = { id: 'x1', sellerId: 'p2', status: 'ACTIVE', sellResource: 'iron', sellAmount: 400, buyResource: 'wood', buyAmount: 380, city: { x: 5, y: 5 }, createdAt: '2027-01-10T00:00:00Z', expiresAt: '2027-01-12T00:00:00Z' };
  const armies = [armyAt('car', Armies.NAMES.caravan, 3, { status: 'MARKET' }), armyAt('f1', 'Armée 1', 1)];
  const ok = await runMarket({ armies, offers: [offer], state: [{ id: 'f1', name: 'Armée 1', capacity: 600, hero: false }] });
  assert.equal(ok.bot.mem.mkt.k.accepted, 1);
  assert.equal(ok.bot.mem.mkt.k.boughtVolume, 400);
  assert.equal(ok.bot.mem.mkt.k.paidVolume, 380);
});

test('Merveille (E1) : les céréales des colonies partent sans achat ; rien ne part pendant qu\'un assaut de Bastion se prépare', async () => {
  const cost = (from, to) => { const t = { wood: 0, stone: 0, iron: 0, food: 0 }; for (let l = from; l <= to; l++) for (const [r, v] of Object.entries(WS.levelCost(l))) t[r] += v; return t; };
  const big = cost(2, 40);
  const wcOf = () => ({ id: 'w', x: 50, y: 50, playerId: 'p9', wonderLevel: 1, wonderWood: big.wood, wonderStone: big.stone, wonderIron: big.iron, wonderFood: 38140 });
  const cap = city({ id: 'a', isCapital: true, x: 0, y: 0, buildings: [{ key: 'MARKET', level: 20, slot: 1 }], wood: 120000, stone: 150000, iron: 90000, food: 6833, maxStorage: 160000, maxFoodStorage: 160000 });
  const col = city({ id: 'c', x: 10, y: 10, wood: 600000, stone: 600000, iron: 600000, food: 600000, maxStorage: 640000, maxFoodStorage: 640000 });
  const calls = [];
  const bot = botWith(withBalance([cap, col], { production: 1000, consumption: 900, net: 100 }), {
    name: 'Livreur', playerId: 'p1', group: 'A', me: { faction: 'ROME' }, armies: [armyAt('f1', 'Armée 1', 1)], mem: { mil: { own: ['f1'] } },
    get: async (p) => { calls.push(['GET', p]); return { ok: true, data: { armies: [{ id: 'f1', name: 'Armée 1', capacity: 100000, hero: false }] } }; },
    post: async (p, body) => { calls.push(['POST', p, body]); return { ok: true, data: {} }; }
  });
  // le stock commun a de quoi : pas d'achat au marchand du serveur, les céréales qui manquent partent
  assert.equal(wonder.foodPurchase(bot, cap, 100000, wcOf()), null);
  const load = wonder.deliveryLoad(bot, cap, 100000, wcOf());
  assert.ok(load.food >= cost(2, 4).food - 38140 - 10, JSON.stringify(load));
  assert.deepEqual([load.wood, load.stone, load.iron], [0, 0, 0], 'bois, pierre et fer : déjà là pour 39 niveaux');
  // assaut de Bastion en préparation (mem.war.muster du premier membre suivi de l'alliance) : aucune armée ne part
  const keeper = { playerId: 'p0', mem: { war: { muster: 12 } } };
  const m = { k: {} };
  await wonder.deliverTurn(bot, { step: 10, byGroup: () => [keeper, bot] }, { left: 8 }, m, wcOf());
  assert.deepEqual(calls, []);
  assert.equal(m.k.deliverMuster, 1);
  // l'assaut passé : la livraison part de la capitale, les céréales viennent surtout de la colonie
  keeper.mem.war.muster = 9;
  await wonder.deliverTurn(bot, { step: 10, byGroup: () => [keeper, bot] }, { left: 8 }, m, wcOf());
  const send = calls.find(x => x[1] === '/api/trade/send');
  assert.ok(send, JSON.stringify(calls));
  assert.equal(send[2].fromCityId, 'a');
  assert.equal(cap.food, 0, 'la capitale d\'abord');
  assert.equal(m.k.deliveredFoodFromOthers, send[2].resources.food - 6833);
  assert.equal(m.k.delivered_food, send[2].resources.food);
});

test('Merveille : l\'achat de céréales se fait dans la ville qui a la ressource donnée et la place au grenier', () => {
  const fresh = { wonderLevel: 0, wonderWood: 0, wonderStone: 0, wonderIron: 0, wonderFood: 0 };
  const cap = city({ id: 'a', isCapital: true, buildings: [{ key: 'MARKET', level: 20, slot: 1 }], wood: 10000, stone: 10000, iron: 10000, food: 0, maxStorage: 160000, maxFoodStorage: 160000 });
  const col = city({ id: 'c', wood: 300000, stone: 600000, iron: 300000, food: 0, maxStorage: 640000, maxFoodStorage: 640000 });
  const bot = botWith(withBalance([cap, col], { production: 900, consumption: 1000, net: -100 }));
  const buy = wonder.foodPurchase(bot, cap, 100000, fresh);
  assert.equal(buy.cityId, 'c');
  assert.equal(buy.receiveResource, 'food');
  assert.ok(buy.giveAmount <= col[buy.giveResource]);
});

test('site de Merveille réservé (E6) : 6 h pour l\'alliance qui l\'a libéré, puis à qui le prend ; le fondateur attend ou part', async () => {
  const T = Date.parse('2027-05-20T12:00:00Z');
  const site = (o) => ({ hasDefenders: false, cityId: null, hasPlayerArmy: false, lastDefeat: new Date(T - 3600000).toISOString(), ...o });
  const theirs = site({ id: 'w1', x: 5, y: 5, reservedFor: 'alB', reservedUntil: T + 5 * 3600000 });
  const s = { now: T, sites: [theirs], allianceOf: new Map([['p1', 'alA']]), tagOf: new Map([['alA', 'AQL'], ['alB', 'LUP']]) };
  assert.equal(wonder.freeSite(s, { x: 0, y: 0 }, 'alA'), null, 'réservé à LUP pendant 6 h');
  assert.equal(wonder.freeSite(s, { x: 0, y: 0 }, 'alB').id, 'w1');
  assert.equal(wonder.freeSite({ ...s, now: T + 5 * 3600000 }, { x: 0, y: 0 }, 'alA').id, 'w1', 'ensuite, toute alliance');
  // le site libéré par son alliance passe avant un site plus proche libre pour tous
  const ours = site({ id: 'w2', x: 90, y: 90, reservedFor: 'alA', reservedUntil: T + 5 * 3600000 });
  const open = site({ id: 'w3', x: 2, y: 2 });
  assert.equal(wonder.freeSite({ ...s, sites: [theirs, open, ours] }, { x: 0, y: 0 }, 'alA').id, 'w2');
  // le fondateur : réservé à une autre alliance, il attend (sans appel) ; sur le site de son alliance, il part aussitôt
  const calls = [], events = [];
  const fcap = city({ id: 'a', isCapital: true, x: 0, y: 0, settlers: 1, wood: 50000, stone: 50000, iron: 50000, food: 50000, maxStorage: 60000, maxFoodStorage: 60000 });
  const founder = botWith([fcap], { name: 'Fondateur', playerId: 'p1', me: { alliance: { allianceId: 'alA' } }, armies: [armyAt('f1', 'Armée 1', 1, { units: unitsOf(100) })], mem: { mil: { own: ['f1'] } },
    post: async (p, body) => { calls.push([p, body]); return { ok: true, data: { arrivalAt: new Date(T + 7200000).toISOString() } }; } });
  const m = { k: {} };
  const c = { event: (k, d) => events.push([k, d]) };
  assert.equal(await wonder.foundTurn(founder, c, { left: 1 }, m, s), false);
  assert.deepEqual(calls, []);
  assert.equal(m.k.foundWaitReserve, 1);
  assert.equal(await wonder.foundTurn(founder, c, { left: 1 }, m, { ...s, sites: [theirs, ours] }), true);
  assert.deepEqual(calls[0], ['/api/army/f1/found-city', { resourceNodeId: 'w2' }]);
  assert.equal(m.k.foundReserved, 1);
  assert.deepEqual([events[0][0], events[0][1].reserved, events[0][1].freedBy, events[0][1].hoursAfterBattle], ['wonder_found_sent', true, 'AQL', 1]);
});

test('héros : pas d\'expédition pendant qu\'un assaut de Bastion se prépare (mem.war.muster)', async () => {
  const cap = city({ id: 'a', isCapital: true, x: 0, y: 0 });
  const calls = [];
  const army = armyAt('f1', 'Armée 1', 1, { heroId: 'h1', units: unitsOf(500), power: 1e6 });
  const bot = botWith([cap], { group: 'A', playerId: 'p1', armies: [army], me: { expeditions: [{ id: 'e1', status: 'AVAILABLE', expiresAt: '2027-01-11T00:00:00Z', enemyPower: 10, difficulty: 1 }] }, mem: {},
    post: async (p, body) => { calls.push([p, body]); return { ok: true, data: {} }; } });
  const keeper = { playerId: 'p0', mem: { war: { muster: 15 } } };
  const m = { k: {} };
  const c = { step: 10, OPT: { stepHours: 6 }, clock: { now: () => Date.parse('2027-01-10T00:00:00Z') }, byGroup: () => [keeper, bot] };
  await hero.expedition(bot, c, { left: 5 }, m, { id: 'h1' }, cap);
  assert.deepEqual(calls, []);
  assert.equal(m.k.expKeptForMuster, 1);
  keeper.mem.war.muster = 10;
  await hero.expedition(bot, c, { left: 5 }, m, { id: 'h1' }, cap);
  assert.deepEqual(calls.map(x => x[0]), ['/api/expeditions/e1/start']);
});

test('briser le camp d\'un Bastion (E4) : un groupe réglé sur tout le camp, dont les arrivées tombent dans la même minute', async () => {
  const realRoute = pathfinding.routeLength;
  pathfinding.routeLength = async (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);   // pas de carte ni de base dans ce test
  try {
    const row = (unitKey, count) => ({ unitKey, tier: unitsData.find(u => u.key === unitKey).tier, count });
    const camp = [row('ROM_INF_TRIARII', 900), row('ROM_CAV_AUXILIAIRE', 300)];   // trois armées réunies
    const player = (i) => ({ name: `P${i}`, faction: 'ROME', capital: { buildings: [] }, mem: {} });
    const cand = (i, n, t) => { const units = [row('ROM_INF_TRIARII', n)]; return { b: player(i), army: { id: `a${i}`, units, status: 'IDLE' }, sortie: false, t, p: n }; };
    const cands = [cand(1, 500, 3000), cand(2, 450, 3300), cand(3, 420, 2800), cand(4, 400, 3100), cand(5, 900, 3000 + 20 * 60)];
    // une armée seule ne bat pas le camp ; le groupe (au plus 3 + 2 armées) le bat, sans celle dont la marche sort de l'écart
    assert.equal(war.breakOdds(cands[0].b, cands[0].army.units, camp, 'ROME').won, false);
    const plan = war.breakPlan(cands, camp, 'ROME', 3);
    assert.equal(plan.mode, 'break');
    assert.ok(plan.group.length >= 2 && plan.group.length <= 5, String(plan.group.length));
    assert.ok(war.groupOdds(plan.group, camp, 'ROME').won);
    assert.ok(Math.max(...plan.group.map(o => o.t)) - Math.min(...plan.group.map(o => o.t)) <= 15 * 60);
    // trop faibles même ensemble : pas de groupe (ni sortie), ou une usure quand elles pèsent 80 % du camp
    assert.equal(war.breakPlan([cand(6, 40, 3000), cand(7, 30, 3000)], camp, 'ROME', 3), null);
    // départs : la marche la plus longue d'abord, les autres quand la leur finit au même instant (l'horloge avance d'autant)
    let now = Date.parse('2027-03-01T10:00:00Z');
    const clock = { now: () => now, set: (t) => { now = Math.max(now, t); } };
    const sent = [];
    for (const o of plan.group) o.b.api = async (method, p, body) => { now += 1000; sent.push({ id: body.armyId, at: now }); return { ok: true, data: { arrivalAt: new Date(now + o.t * 1000).toISOString() } }; };
    const v = { number: 1 };
    const out = await war.syncLaunch({ clock }, v, { id: 'bast' }, plan.group, { left: 20 }, plan.mode);
    assert.equal(out.sent, plan.group.length);
    assert.equal(sent[0].id, [...plan.group].sort((p, q) => q.t - p.t)[0].army.id, 'la plus lente part d\'abord');
    assert.ok(out.spreadS < config.bastion.breakGroupSeconds, `écart ${out.spreadS} s`);
    assert.equal(out.missed, 0);
    assert.equal(out.waitS, Math.max(...plan.group.map(o => o.t)) - Math.min(...plan.group.map(o => o.t)) - (plan.group.length - 1), 'le joueur attend le temps qu\'il faut avant chaque départ');
    assert.ok(plan.group.every(o => o.army.status === 'ATTACKING'));
  } finally { pathfinding.routeLength = realRoute; }
});

test('chaîne d\'assauts (E3) : le prochain assaut gagné doit tomber avant la fin de la pause de 24 h', () => {
  assert.equal(war.CHAIN_WINDOW_MS, config.bastion.regenPauseHours * 3600000);
  assert.equal(config.bastion.regenPauseHours, 24);
});

test('rassemblements contre le Bastion (lot M, E3) : essai avec la plus forte armée, chaîne sous la pause de 24 h, reprise, fin', async () => {
  const realRoute = pathfinding.routeLength;
  pathfinding.routeLength = async (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay) * 1.1;   // route simulée, sans carte
  try {
    const T = Date.parse('2027-05-01T08:00:00Z');
    const inf = (n) => ({ unitKey: 'ROM_INF_MILICIEN', tier: 'base', count: n });
    const siegeKey = unitsData.find(u => u.faction === 'ROME' && u.class === 'SIEGE').key;
    const E = (n) => ({ unitKey: siegeKey, tier: 'siege', count: n });
    const calls = [], events = [], bots = [], cities = [], armiesOf = new Map();
    for (let i = 0; i < 12; i++) {
      const pid = `p${i}`;
      const cap = { id: `c${i}`, name: `C${i}`, x: i * 3, y: 0, playerId: pid, isCapital: true, isSieged: false, buildings: [{ key: 'RALLY_POINT', level: 20 }], player: { name: `B${i}`, faction: 'ROME' } };
      cities.push(cap);
      const b = { name: `B${i}`, playerId: pid, group: 'A', faction: 'ROME', turn: 0, mem: {}, cities: [cap], armies: [] };
      Object.defineProperty(b, 'capital', { get() { return this.cities[0]; } });
      b.api = async (method, p, body) => {
        calls.push([b.name, method, p, body]);
        if (p === '/api/rallies') return { ok: true, data: { rally: { id: `r${calls.length}`, launchAt: new Date(T + body.waitMinutes * 60000).toISOString() }, maxArmies: 25 } };
        return { ok: true, data: {} };
      };
      bots.push(b);
      armiesOf.set(pid, [
        { id: `g${i}`, ownerId: pid, cityId: cap.id, isGarrison: true, status: 'IDLE', x: cap.x, y: cap.y, units: [E(65), inf(1000)] },
        { id: `o${i}`, ownerId: pid, cityId: cap.id, isGarrison: false, name: 'Ost', status: 'IDLE', x: cap.x, y: cap.y, units: [inf(300)] },
        { id: `a${i}`, ownerId: pid, cityId: cap.id, isGarrison: false, name: 'Armée 1', status: 'IDLE', x: cap.x, y: cap.y, units: [inf(1200)] }
      ]);
    }
    const c = { step: 100, OPT: { stepHours: 6, days: 200, subTicks: 6, press: true }, clock: { now: () => T }, rand: () => 0.99, bots, byGroup: g => bots.filter(b => b.group === g), event: (k, d) => events.push([k, d]), say: () => {} };
    const v = { number: 1, day: 100, now: T, allianceOf: new Map(bots.map(b => [b.playerId, 'AL'])), tagOf: new Map([['AL', 'AQL'], ['EN', 'LUP']]), allianceRel: (a, b) => (a === b ? 'SAME' : 'ENEMY'),
      bastions: [{ id: 'eb', allianceId: 'EN', x: 150, y: 0, status: 'ACTIVE', isSieged: false }], incoming: [], camps: [], cities, cityById: new Map(cities.map(x => [x.id, x])),
      citiesOf: new Map(cities.map(x => [x.playerId, [x]])), armiesOf, botOf: new Map(bots.map(b => [b.playerId, b])) };
    const idleAll = () => { for (const b of bots) for (const a of armiesOf.get(b.playerId)) if (!a.isGarrison) a.status = 'IDLE'; };
    // 1. essai : la plus forte armée (Armée 1, pas l'Ost) ; l'Ost s'y fond (simulation sim-e : un membre n'envoyait qu'une
    // armée), puis ses engins et 70 % des soldats de la garnison ; parti, la consigne s'arrête
    await war.bastionOps(c, v, { left: 400 }, 'A');
    const created = calls.find(x => x[2] === '/api/rallies');
    assert.match(created[3].armyId, /^a/);
    const leaderCalls = calls.filter(x => x[0] === created[0] && x[2].endsWith('/set-unit'));
    assert.deepEqual(leaderCalls.map(x => x[2].split('/')[3]), [created[3].armyId.replace('a', 'o'), created[3].armyId, created[3].armyId]);
    assert.deepEqual(leaderCalls.map(x => x[3]), [{ unitKey: 'ROM_INF_MILICIEN', count: 0 }, { unitKey: siegeKey, count: 65 }, { unitKey: 'ROM_INF_MILICIEN', count: 1200 + 700 + 300 }]);
    const r0 = events.find(e => e[0] === 'bastion_rally')[1];
    assert.equal(r0.chain, 0);
    assert.equal(r0.merged, 300 * r0.armies, 'l\'Ost de chaque membre parti');
    assert.equal(r0.fieldSoldiers, 12 * 1500);
    assert.equal(bots[0].mem.war.muster, 100, 'ceux qui restent repartent en mission au pas suivant');
    // 2. chaîne : un rassemblement par pas, un groupe plus petit ; l'assaut suivant tombe avant la fin de la pause (24 h)
    const keeper = bots[0];
    keeper.mem.war.chain = { b: 'eb', s: 100, n: 0, wins: 1, losses: 0, skip: 0, tw: T - 2 * 3600000, def: [inf(4000)] };
    c.OPT.fullRallies = true;
    idleAll(); calls.length = 0; events.length = 0; c.step = 101;
    await war.bastionOps(c, v, { left: 400 }, 'A');
    const r1 = events.find(e => e[0] === 'bastion_rally')[1];
    assert.deepEqual([r1.chain, r1.wait, r1.mode], [1, 30, 'vie'], 'l\'attente la plus courte qui laisse arriver les membres retenus (G2 : le mur se répare pendant l\'attente)');
    assert.equal(r1.wallNow, r1.wallHp, 'mur plein : le Bastion ne garde aucun dégât');
    assert.ok(r1.armies < 12, 'pas toute l\'alliance d\'un coup');
    assert.ok(r1.gapH !== null && r1.gapH < 24, String(r1.gapH));
    assert.ok(!keeper.mem.war.k.chainRestart);
    // 3. dernier assaut gagné il y a 20 h : l'assaut prévu tombe après la pause, la chaîne repart de lui (compté)
    keeper.mem.war.chain.tw = T - 20 * 3600000;
    idleAll(); events.length = 0;
    await war.bastionOps(c, v, { left: 400 }, 'A');
    const r2 = events.find(e => e[0] === 'bastion_rally')[1];
    assert.ok(r2.gapH > 24, String(r2.gapH));
    assert.equal(keeper.mem.war.k.chainRestart, 1);
    // 4. la pause est passée sans nouvel assaut gagné (les vies remontent) : la chaîne s'arrête
    keeper.mem.war.chain.tw = T - 25 * 3600000;
    events.length = 0; c.step = 102;
    await war.bastionOps(c, v, { left: 400 }, 'A');
    assert.equal(keeper.mem.war.chain, undefined);
    assert.ok(events.some(e => e[0] === 'bastion_chain_end' && e[1].why === 'pause passée'), JSON.stringify(events));
    // 4 bis. une chaîne sans groupe assez fort tient 4 pas (la pause de 24 h), plus 2
    keeper.mem.war.chain = { b: 'eb', s: 102, n: 1, wins: 1, losses: 0, skip: 3, tw: T - 2 * 3600000, def: [inf(4000)] };
    idleAll(); events.length = 0;
    await war.bastionOps(c, v, { left: 400 }, 'A');
    assert.ok(keeper.mem.war.chain, 'encore là après 3 pas sans groupe');
    keeper.mem.war.chain.skip = 4;
    await war.bastionOps(c, v, { left: 400 }, 'A');
    assert.ok(events.some(e => e[0] === 'bastion_chain_end' && e[1].why === 'à court d\'armées'));
    // 4 ter. hors chaîne, la consigne commence 3 pas avant le rassemblement suivant et couvre le tour de son pas
    keeper.mem.war.bo = 106; keeper.mem.war.muster = 0; keeper.mem.war.mb = 0; c.step = 102;
    await war.bastionOps(c, v, { left: 400 }, 'A');
    assert.equal(keeper.mem.war.muster, 0, '4 pas avant : pas encore');
    c.step = 103;
    await war.bastionOps(c, v, { left: 400 }, 'A');
    assert.equal(keeper.mem.war.muster, 107);
    // 4 quater. la garnison vue au dernier assaut est trop forte même pour toute l'alliance : pas de consigne pour rien (les
    // membres gardent leurs missions), le rassemblement attend 3 jours
    keeper.mem.war.bo = 106; keeper.mem.war.mb = 0; keeper.mem.war.muster = 0; keeper.mem.war.seen = { b: 'eb', def: [inf(500000)], at: T - 86400000 };
    idleAll(); calls.length = 0; events.length = 0; c.step = 104;
    await war.bastionOps(c, v, { left: 400 }, 'A');
    assert.ok(!calls.some(x => x[2] === '/api/rallies'), 'pas de rassemblement perdu d\'avance');
    assert.deepEqual([keeper.mem.war.k.bastionHopeless, keeper.mem.war.bo, keeper.mem.war.muster], [1, 104 + 12, 104]);
    assert.equal(events.find(e => e[0] === 'bastion_rally_held')?.[1].phase, 'muster');
    // toute l'alliance la battrait, mais personne ne répond (pas impair, notifications non lues) : le lanceur seul ne part pas
    c.OPT.fullRallies = false;
    keeper.mem.war.bo = 0; keeper.mem.war.seen = { b: 'eb', def: [inf(300)], at: T - 86400000 };
    idleAll(); calls.length = 0; events.length = 0; c.step = 105;
    await war.bastionOps(c, v, { left: 400 }, 'A');
    assert.ok(!calls.some(x => x[2] === '/api/rallies'));
    assert.deepEqual([keeper.mem.war.k.bastionTooStrong, keeper.mem.war.bo, keeper.mem.war.muster], [1, 105 + 12, 105]);
    assert.equal(events.find(e => e[0] === 'bastion_rally_held')?.[1].phase, 'launch');
    // les membres répondent : assez fort contre cette petite garnison, il part
    c.OPT.fullRallies = true;
    keeper.mem.war.bo = 0;
    idleAll(); calls.length = 0; events.length = 0; c.step = 106;
    await war.bastionOps(c, v, { left: 400 }, 'A');
    assert.ok(calls.some(x => x[2] === '/api/rallies'));
    // 6. chaîne d'usure (G2, décision du 2 novembre 2026) : un assaut repoussé a laissé le mur à 15 000 PV il y a 2 h (réparé en
    // ligne droite, plein 12 h après) ; le rassemblement part avec l'attente la plus courte, jugé contre le mur prévu à l'heure
    // de l'assaut, pas le mur plein
    const eb = v.bastions[0];
    Object.assign(eb, { wallHp: 15000, wallAt: new Date(T - 2 * 3600000).toISOString() });
    keeper.mem.war.chain = { b: 'eb', s: 106, n: 0, wins: 0, losses: 1, lossRun: 1, skip: 0, tw: 0, ww: T - 2 * 3600000, lw: 15000, def: [inf(4000)], mode: 'mur' };
    keeper.mem.war.bo = 0; keeper.mem.war.seen = { b: 'eb', def: [inf(300)], at: T - 86400000 };
    idleAll(); calls.length = 0; events.length = 0; c.step = 107;
    await war.bastionOps(c, v, { left: 400 }, 'A');
    const r6 = events.find(e => e[0] === 'bastion_rally')[1];
    assert.deepEqual([r6.mode, r6.wait, r6.chain, r6.wallHp], ['mur', 30, 1, 36000]);
    assert.ok(r6.wallNow > 15000 && r6.wallNow < 36000, `mur prévu ${r6.wallNow} : en cours de réparation`);
    assert.equal(keeper.mem.war.k.chainWornWall, 1);
    assert.ok(calls.some(x => x[2] === '/api/rallies'));
    // le mur de nouveau plein (13 h après le dernier dégât) sans pause de vies en cours : la chaîne s'arrête
    Object.assign(eb, { wallAt: new Date(T - 13 * 3600000).toISOString() });
    keeper.mem.war.chain = { b: 'eb', s: 106, n: 1, wins: 0, losses: 1, lossRun: 1, skip: 0, tw: 0, ww: T - 13 * 3600000, lw: 15000, def: [inf(4000)], mode: 'mur' };
    idleAll(); events.length = 0; c.step = 108;
    await war.bastionOps(c, v, { left: 400 }, 'A');
    assert.equal(keeper.mem.war.chain, undefined);
    assert.ok(events.some(e => e[0] === 'bastion_chain_end' && e[1].why === 'mur réparé' && e[1].mode === 'mur' && e[1].lowestWall === 15000), JSON.stringify(events));
    // deux assauts repoussés de suite : la chaîne s'arrête aussi, même devant un mur usé
    Object.assign(eb, { wallAt: new Date(T - 2 * 3600000).toISOString() });
    keeper.mem.war.chain = { b: 'eb', s: 106, n: 2, wins: 0, losses: 2, lossRun: 2, skip: 0, tw: 0, ww: T - 2 * 3600000, lw: 15000, def: [inf(4000)], mode: 'mur' };
    events.length = 0; c.step = 109;
    await war.bastionOps(c, v, { left: 400 }, 'A');
    assert.ok(events.some(e => e[0] === 'bastion_chain_end' && e[1].why === 'assauts repoussés'), JSON.stringify(events));
    delete eb.wallHp; delete eb.wallAt;
    // 5. grille des ticks : une heure dans un pas qui presse, le pas entier sinon
    assert.equal(war.slotOf(c, T + 3600000), 1);
    assert.equal(war.slotOf(c, T + 3600000 + 1000), 2);
    assert.equal(war.slotOf({ ...c, OPT: { ...c.OPT, subTicks: 1 } }, T + 6 * 3600000), 1);
  } finally { pathfinding.routeLength = realRoute; }
});

test('Bastion attaqué entre deux tours (subTick, simulation sim-e) : la garnison voit le camp installé au tick d\'une heure et sort contre lui', async () => {
  const T = Date.parse('2027-05-01T09:00:00Z');
  const row = (unitKey, count) => ({ unitKey, tier: unitsData.find(u => u.key === unitKey).tier, count });
  const calls = [], events = [];
  const mk = (i, turn) => {
    const b = { name: `D${i}`, playerId: `p${i}`, group: 'B', faction: 'ROME', turn, mem: {}, capital: { buildings: [] } };
    b.api = async (method, p, body) => { calls.push([b.name, p, body]); return { ok: true, data: { arrivalAt: new Date(T + 30000).toISOString() } }; };
    return b;
  };
  const bots = [mk(1, 1), mk(2, 0)];   // au pas 101 : le tour habituel de D1 (101 + 1 pair), pas celui de D2
  const stationed = (id, owner) => ({ id, ownerId: owner, status: 'STATIONED', targetBastionId: 'b1', isGarrison: false, units: [row('ROM_INF_TRIARII', 2000)] });
  const camp = { id: 'camp', ownerId: 'e1', targetBastionId: 'b1', arrivalAt: new Date(T + 3600000), units: [row('ROM_INF_MILICIEN', 300)] };
  const allianceOf = new Map([['p1', 'AL'], ['p2', 'AL'], ['e1', 'EN']]);
  const v = { number: 1, now: T, camps: [camp], bastions: [{ id: 'b1', allianceId: 'AL', x: 10, y: 10, status: 'ACTIVE' }], allianceOf, tagOf: new Map([['AL', 'LUP'], ['EN', 'AQL']]),
    allianceRel: (a, b) => (a === b ? 'SAME' : 'ENEMY'), canAttack: (p, q) => allianceOf.get(p) !== allianceOf.get(q), friend: (p, q) => allianceOf.get(p) === allianceOf.get(q),
    armiesOf: new Map([['p1', [stationed('s1', 'p1')]], ['p2', [stationed('s2', 'p2')]]]), cityById: new Map(), citiesOf: new Map(), botOf: new Map(bots.map(b => [b.playerId, b])) };
  let now = T;
  const c = { step: 101, bots, rand: () => 0.99, clock: { now: () => now, set: (t) => { now = Math.max(now, t); } }, OPT: { stepHours: 6 }, event: (k, d) => events.push([k, d]), say: () => {} };
  await war.alerts(c, v, { sub: true });
  // D1 voit l'alerte : sa garnison sort ; D2, hors de son tour, ne lit pas la notification (0,99 > 0,6)
  assert.deepEqual(calls.map(x => [x[0], x[1], x[2].armyId, x[2].mission]), [['D1', '/api/bastion/b1/send', 's1', 'BREAK']]);
  const sent = events.find(e => e[0] === 'bastion_break_sent')[1];
  assert.deepEqual([sent.subTick, sent.sortie, sent.armies], [true, true, 1]);
});

test('missions des joueurs automatiques (simulation sim-e) : le besoin se lit sur le stock commun ; un camp d\'or passe devant des céréales déjà à 80 %', () => {
  const cap = city({ id: 'a', isCapital: true, x: 0, y: 0, wood: 100000, stone: 100000, iron: 100000, food: 10000, maxStorage: 160000, maxFoodStorage: 160000 });
  const col = city({ id: 'b', x: 40, y: 40, wood: 600000, stone: 600000, iron: 600000, food: 630000, maxStorage: 640000, maxFoodStorage: 640000 });
  const bot = botWith([cap, col], { playerId: 'p1', me: {} });
  // la capitale presque vide (6 %) ne compte plus seule : 80 % des greniers réunis, les céréales ne valent pas la marche
  assert.equal(military.needWeight(bot, cap, 'FOOD'), 0);
  assert.equal(military.needWeight(bot, cap, 'GOLD'), 1.3);
  cap.food = 0; col.food = 300000;
  assert.ok(Math.abs(military.needWeight(bot, cap, 'FOOD') - (1.6 - 300000 / 800000)) < 1e-9);
  cap.food = 10000; col.food = 630000;
  const node = (id, resourceType, amount, defenderPower) => ({ id, resourceType, amount, x: 6, y: 0, hasDefenders: true, defenderPower, holders: [] });
  const army = { id: 'f1', units: [{ unitKey: 'ROM_INF_TRIARII', tier: 'intermediate', count: 2000 }] };
  const view = { nodes: [node('food2', 'FOOD', 7198, 20000), node('gold2', 'GOLD', 20, 20000)] };
  assert.equal(military.bestTarget(bot, { ratio: 1.6 }, army, cap, view, new Set()).node.id, 'gold2');
});

test('attaque d\'une tribu (simulation sim-e) : l\'issue se lit sur l\'armée ; une armée vidée par une fusion n\'est pas une défaite', () => {
  const city0 = { id: 'a', x: 0, y: 0 };
  const x = { u: 1000, r: { ROM_INF_TRIARII: 600, ROM_CAV_AUXILIAIRE: 400 } };
  const army = (status, a, b, extra = {}) => ({ status, x: 0, y: 0, cityId: 'a', units: [{ unitKey: 'ROM_INF_TRIARII', count: a }, { unitKey: 'ROM_CAV_AUXILIAIRE', count: b }].filter(u => u.count > 0), ...extra });
  assert.equal(military.tribeVerdict(army('HARVESTING', 590, 395, { x: 5 }), x, city0), 'win');
  assert.equal(military.tribeVerdict(army('RETURNING', 590, 395, { x: 5, carryFood: 300 }), x, city0), 'win');
  assert.equal(military.tribeVerdict(army('RETURNING', 420, 280, { x: 5 }), x, city0), 'loss', 'sans butin, 30 % de chaque troupe perdus');
  assert.equal(military.tribeVerdict(army('RETURNING', 600, 400, { x: 5 }), x, city0), null, 'ni butin ni pertes : pas de combat');
  assert.equal(military.tribeVerdict(army('IDLE', 590, 395), x, city0), 'win');
  assert.equal(military.tribeVerdict(army('IDLE', 420, 280), x, city0), 'loss');
  assert.equal(military.tribeVerdict(army('IDLE', 0, 0), x, city0), null, 'vidée par une fusion');
  assert.equal(military.tribeVerdict(army('IDLE', 600, 0), x, city0), 'loss', 'une troupe entière perdue : rounds complets du moteur de bataille (G3), plus le signe d\'une fusion');
  assert.equal(military.tribeVerdict(army('IDLE', 900, 400), x, city0), null, 'regarnie entre-temps');
  // review : une armée partie en rassemblement n'est pas jugée, le ratio ne monte pas
  const bot = botWith([city({ id: 'a', isCapital: true, x: 0, y: 0 })], { armies: [army('RALLY_WAIT', 600, 400)] });
  bot.armies[0].id = 'f1';
  const m = { ratio: 1.6, k: {}, m: { f1: { t: 'r', s: 1, ...x } }, h: {}, own: ['f1'] };
  military.review(bot, { step: 3 }, m);
  assert.deepEqual([m.m.f1, m.ratio, m.k.tribeLosses], [undefined, 1.6, undefined]);
});

test('recrutement (simulation sim-e) : plus de plafond par niveau de Bâtiment principal, la nourriture décide', async () => {
  const lv = (key, level, slot) => ({ key, level, slot });
  const cap = city({ id: 'a', isCapital: true, buildings: [lv('MAIN_HALL', 20, 0), lv('BARRACKS', 20, 1)], wood: 1e6, stone: 1e6, iron: 1e6, food: 1e6, maxStorage: 1.4e6, maxFoodStorage: 1.4e6 });
  const garrison = { id: 'g', isGarrison: true, cityId: 'a', units: [{ unitKey: 'ROM_INF_MILICIEN', tier: 'base', count: 5000 }] };   // au-delà des 1 240 de l'ancien plafond (40 + 60 × 20)
  const posted = [];
  const reply = (body) => { const u = unitsData.find(x => x.key === body.unitKey); return { ok: true, data: { cost: Stock.recruitCost(u, body.count), gold: 0, queueItem: { unitKey: u.key, count: body.count, buildingKey: 'BARRACKS', endsAt: new Date(0).toISOString() } } }; };
  const bot = botWith(withBalance([cap], { production: 100000, consumption: 25000, net: 75000 }), { me: { gold: 0 }, armies: [garrison], post: async (p, body) => { posted.push([p, body]); return reply(body); } });
  await military.recruit(bot, { ...ctx(), clock: { now: () => 0 }, rand: () => 0.99 }, { left: 3 }, { k: {} }, cap);
  assert.equal(posted.length, 1);
  assert.ok(posted[0][1].count >= 5);
  // plus de marge de nourriture (30 % de la production gardés) : rien
  const lean = botWith(withBalance([city({ ...cap, recruitQueue: [] })], { production: 100000, consumption: 72000, net: 28000 }), { me: { gold: 0 }, armies: [garrison], post: async (p, body) => { posted.push([p, body]); return reply(body); } });
  const m = { k: {} };
  await military.recruit(lean, { ...ctx(), clock: { now: () => 0 }, rand: () => 0.99 }, { left: 3 }, m, lean.cities[0]);
  assert.equal(posted.length, 1);
  assert.equal(m.k.foodCap, 1);
});

test('consigne de rassemblement (simulation sim-e) : les armées de la capitale ne partent pas en mission et celles qui récoltent rentrent', async () => {
  const cap = city({ id: 'a', isCapital: true, x: 0, y: 0 });
  const calls = [];
  const garrison = { id: 'g', isGarrison: true, cityId: 'a', x: 0, y: 0, status: 'IDLE', units: unitsOf(10) };
  const home = { id: 'f1', name: 'Armée 1', slot: 1, cityId: 'a', x: 0, y: 0, status: 'IDLE', isGarrison: false, units: unitsOf(500) };
  const away = { id: 'f2', name: 'Armée 2', slot: 2, cityId: 'a', x: 5, y: 5, status: 'HARVESTING', isGarrison: false, units: unitsOf(300) };
  const keeper = { playerId: 'p0', mem: { war: { muster: 12 } } };
  const bot = botWith([cap], { group: 'A', playerId: 'p1', me: {}, armies: [garrison, home, away], mem: { mil: { own: ['f1', 'f2'], h: { f2: 9 } } },
    get: async (p) => { calls.push(['GET', p]); return { ok: true, data: { resourceNodes: [], cities: [], bastions: [] } }; },
    post: async (p) => { calls.push(['POST', p]); return { ok: true, data: {} }; } });
  const c = { step: 10, OPT: { stepHours: 6 }, clock: { now: () => 0 }, rand: () => 0.99, byGroup: () => [keeper, bot] };
  await military.act(bot, c);
  assert.deepEqual(calls, [['POST', '/api/army/f2/return']]);
  assert.deepEqual([bot.mem.mil.k.musterRecalls, bot.mem.mil.k.missionMuster], [1, 1]);
});

test('garde vide rattachée (simulation sim-e) : dissoute sur place, une autre se forme ; une relève coupée faute d\'appels n\'est pas dissoute ; une ancienne garde attend une place libre', async () => {
  const row = (unitKey, count) => ({ unitKey, tier: unitsData.find(u => u.key === unitKey).tier, count });
  const setup = (guardUnits, garrisonUnits, extra = []) => {
    const cap = city({ id: 'a', isCapital: true, x: 0, y: 0, buildings: [{ key: 'RALLY_POINT', level: 5, slot: 2 }] });
    const col = city({ id: 'b', x: 30, y: 30 });
    const calls = [];
    let made = 0;
    const reply = (p, body) => {
      if (p === '/api/army/create') return { army: { id: `g${++made}`, name: body.name, slot: body.slot, cityId: 'a', x: 0, y: 0, status: 'IDLE', isGarrison: false } };
      if (p.endsWith('/detach-colony')) return { army: { id: p.split('/')[3], cityId: 'a', slot: 2, name: Armies.NAMES.guard }, arrivalAt: '2027-02-01T10:00:00Z', travelTime: 3600 };
      return { newCount: body.count };
    };
    const m = { own: ['f1'], k: {}, guard: { b: 'g7' } };
    const bot = botWith([cap, col], {
      armies: [{ id: 'g', isGarrison: true, cityId: 'a', x: 0, y: 0, status: 'IDLE', units: garrisonUnits }, armyAt('f1', 'Armée 1', 1, { units: [] }),
        { id: 'g7', name: Armies.NAMES.guard, slot: 1, cityId: 'b', x: 30, y: 30, status: 'IDLE', isGarrison: false, units: guardUnits }, ...extra],
      mem: { mil: m },
      post: async (p, body = {}) => { calls.push([p, body]); return { ok: true, data: reply(p, body) }; },
      del: async (p) => { calls.push([`DELETE ${p}`]); return { ok: true, data: {} }; }
    });
    return { bot, cap, m, calls };
  };
  // 1. vide (simulation sim-e : 2 397 renvois refusés, « Armée vide ») : dissoute dans sa colonie, une nouvelle part de la capitale
  {
    const { bot, cap, m, calls } = setup([], unitsOf(400));
    await military.guards(bot, { ...ctx(), step: 50 }, { left: 6 }, m, cap);
    assert.deepEqual(calls.map(c => c[0]), ['DELETE /api/army/g7/disband', '/api/army/create', '/api/army/g1/set-unit', '/api/army/g1/move']);
    assert.deepEqual([m.guard.b, m.k.guardDisbandedEmpty], ['g1', 1]);
    assert.ok(!bot.armies.some(a => a.id === 'g7'));
  }
  // 2. relève dont le remplissage s'arrête faute d'appels : elle garde sa place et se remplit au tour suivant
  {
    const { bot, cap, m, calls } = setup(unitsOf(5), [row('ROM_INF_MILICIEN', 100), row('ROM_INF_TRIARII', 100), row('ROM_CAV_AUXILIAIRE', 100)]);
    await military.guards(bot, { ...ctx(), step: 50 }, { left: 3 }, m, cap);
    assert.deepEqual(calls.map(c => c[0]), ['/api/army/create', '/api/army/g1/set-unit']);
    assert.deepEqual([m.rel.b, m.k.guardReliefDropped], ['g1', undefined]);
    calls.length = 0;
    await military.guards(bot, { ...ctx(), step: 51 }, { left: 6 }, m, cap);
    assert.equal(calls.at(-1)[0], '/api/army/g1/move');
    assert.ok(!calls.some(c => c[0].startsWith('DELETE')));
  }
  // 3. une ancienne garde restée rattachée à côté de la nouvelle : pas de renvoi refusé à chaque tour quand la capitale est pleine
  {
    const fresh = { id: 'g2', name: Armies.NAMES.guard, slot: 2, cityId: 'b', x: 30, y: 30, status: 'IDLE', isGarrison: false, units: unitsOf(60) };
    const { bot, cap, m, calls } = setup(unitsOf(30), unitsOf(400), [fresh, armyAt('car', Armies.NAMES.caravan, 2, { units: [] })]);
    m.guard.b = 'g2';
    await military.guards(bot, { ...ctx(), step: 50 }, { left: 6 }, m, cap);
    assert.deepEqual(calls, []);
    bot.armies = bot.armies.filter(a => a.id !== 'car');
    await military.guards(bot, { ...ctx(), step: 51 }, { left: 6 }, m, cap);
    assert.deepEqual(calls.map(c => c[0]), ['/api/army/g7/detach-colony']);
    assert.equal(m.k.guardDetached, 1);
  }
});

// ---------- simulation de 200 jours relue (sim-e), lot E : Merveille, rassemblements, donjons, envois, E6 ----------
const rowOf = (unitKey, count) => ({ unitKey, tier: unitsData.find(u => u.key === unitKey).tier, count });
const powerRows = (rows) => rows.reduce((t, u) => { const d = unitsData.find(x => x.key === u.unitKey); return t + (d.stats.attack + d.stats.defense) * config.combat.tierCoefficients[u.tier || d.tier] * u.count; }, 0);

test('défense de la Ville Merveille (sim-e) : la part de chaque membre, la garde remplie aussi dans les armées au repos, un renfort qui part puis rentre, la garde inutile dissoute', async () => {
  const T = Date.parse('2027-06-01T12:00:00Z');
  const wc = { id: 'w', x: 40, y: 40, playerId: 'p9', wonderLevel: 20, wonderBuildEndsAt: null, lastImmortalWave: new Date(T - 3600000).toISOString() };
  // la vague voulue : celle du niveau d'après ; un niveau en chantier : celle du niveau encore au-dessus
  const need = wonder.defenseNeed(wc, 1);
  assert.equal(need, WS.wavePower(21));
  assert.equal(wonder.defenseNeed({ ...wc, wonderBuildEndsAt: new Date(T).toISOString() }, 1.1), WS.wavePower(22) * 1.1);
  const cap = city({ id: 'a', isCapital: true, x: 0, y: 0, buildings: [{ key: 'RALLY_POINT', level: 10, slot: 2 }] });
  const garrison = { id: 'g', isGarrison: true, cityId: 'a', x: 0, y: 0, status: 'IDLE', units: [rowOf('ROM_INF_MILICIEN', 200)] };
  const field = armyAt('f1', 'Armée 1', 1, { units: [rowOf('ROM_INF_TRIARII', 9000), rowOf('ROM_ARC_MILICIEN', 4000)] });
  const calls = [];
  const m = { k: {} };
  const bot = botWith([cap], {
    playerId: 'p1', armies: [garrison, field], mem: { mil: { own: ['f1'] }, won: m },
    post: async (p, body = {}) => {
      calls.push([p, body]);
      if (p === '/api/army/create') return { ok: true, data: { army: { id: 'wg', name: body.name, slot: body.slot, cityId: 'a', x: 0, y: 0, status: 'IDLE', isGarrison: false } } };
      if (p.endsWith('/support')) return { ok: true, data: { arrivalAt: new Date(T + 3 * 3600000).toISOString() } };
      return { ok: true, data: { newCount: body.count } };
    },
    del: async (p) => { calls.push(['DELETE', p]); return { ok: true, data: {} }; }
  });
  const owner = { playerId: 'p9', capital: { id: 'z' } };
  const c = { step: 40, bots: [bot, owner] };
  const al = new Map([['p1', 'al'], ['p9', 'al']]);
  // 1. personne n'a rien posté : la garde se forme ; la garnison ne suffit pas, l'armée de campagne au repos lui rend des
  // soldats ; seul à poster, il couvre ce qui manque à l'alliance (jusqu'au double de sa part)
  let s = { now: T, allianceOf: al, defense: new Map([['w', wonder.defense(wc, [], T)]]) };
  await wonder.defendTurn(bot, c, { left: 14 }, m, s, wc, { dm: 1 });
  assert.deepEqual(calls.map(x => x[0]), ['/api/army/create', '/api/army/f1/set-unit', '/api/army/wg/set-unit', '/api/army/wg/set-unit', '/api/army/wg/support']);
  assert.equal(calls[0][1].name, Armies.NAMES.wonder);
  let D = s.defense.get('w');
  assert.ok(D.power >= need && D.power < need * 1.01, `${D.power} pour ${need}`);
  assert.equal(D.coming, D.power, 'en route, là avant la vague');
  assert.equal(garrison.units.find(u => u.unitKey === 'ROM_INF_MILICIEN').count, 20, 'la capitale garde 10 % de chaque troupe');
  assert.deepEqual([m.k.guardsCreated, m.k.guardsSent, m.guard], [1, 1, 'wg']);
  assert.ok(m.k.guardFromField > 0 && field.units[0].count < 9000);
  // 2. pas suivant : la garde postée a fondu (une vague), sa garnison est vide ; l'armée de campagne au repos part la renforcer
  const guard = bot.armies.find(a => a.id === 'wg');
  Object.assign(guard, { status: 'STATIONED', x: 40, y: 40, units: [rowOf('ROM_INF_TRIARII', 500)] });
  const dbRow = (a, extra = {}) => ({ id: a.id, ownerId: 'p1', x: a.x, y: a.y, targetX: 40, targetY: 40, targetCityId: 'w', status: a.status, arrivalAt: null, units: a.units, ...extra });
  calls.length = 0;
  s = { now: T + 6 * 3600000, allianceOf: al, defense: new Map([['w', wonder.defense({ ...wc, lastImmortalWave: new Date(T + 5 * 3600000).toISOString() }, [dbRow(guard)], T + 6 * 3600000)]]) };
  await wonder.defendTurn(bot, { ...c, step: 41 }, { left: 14 }, m, s, wc, { dm: 1 });
  assert.equal(calls[calls.length - 1][0], '/api/army/f1/support');
  assert.equal(m.ex.f1, 41, 'renfort de la garde, suivi pour rentrer');
  assert.equal(m.k.defendersSent, 1);
  // 3. la garde regarnie suffit : le renfort rentre (la garde reste)
  Object.assign(guard, { units: [rowOf('ROM_INF_TRIARII', 7000)] });
  Object.assign(field, { status: 'STATIONED', x: 40, y: 40 });
  calls.length = 0;
  s = { now: T + 12 * 3600000, allianceOf: al, defense: new Map([['w', wonder.defense({ ...wc, lastImmortalWave: new Date(T + 11 * 3600000).toISOString() }, [dbRow(guard), dbRow(field)], T + 12 * 3600000)]]) };
  await wonder.defendTurn(bot, { ...c, step: 42 }, { left: 14 }, m, s, wc, { dm: 1 });
  assert.deepEqual(calls.map(x => x[0]), ['/api/army/f1/return']);
  assert.equal(m.k.defenderRecalled, 1);
  assert.equal(m.ex.f1, undefined);
  // 4. la garde rentrée alors que d'autres membres tiennent la défense : dissoute, sa place de la capitale se libère
  Object.assign(guard, { status: 'IDLE', x: 0, y: 0 });
  calls.length = 0;
  const others = { id: 'o1', ownerId: 'p9', x: 40, y: 40, status: 'IDLE', units: [rowOf('ROM_INF_TRIARII', 8000)] };
  s = { now: T + 18 * 3600000, allianceOf: al, defense: new Map([['w', wonder.defense(wc, [others], T + 18 * 3600000)]]) };
  await wonder.defendTurn(bot, { ...c, step: 43 }, { left: 14 }, m, s, wc, { dm: 1 });
  assert.deepEqual(calls, [['DELETE', '/api/army/wg/disband']]);
  assert.equal(m.guard, undefined);
  assert.equal(m.k.guardDisbanded, 1);
  assert.ok(!bot.armies.some(a => a.id === 'wg'));
  assert.equal(m.wantGuard, false);
});

test('défense de la Ville Merveille (relecture) : la garde relève le renfort qui tient la part ; une garde usée rentre se regarnir, sans seconde garde', async () => {
  const T = Date.parse('2027-06-01T12:00:00Z');
  const wc = { id: 'w', x: 40, y: 40, playerId: 'p9', wonderLevel: 20, wonderBuildEndsAt: null, lastImmortalWave: new Date(T - 3600000).toISOString() };
  const need = wonder.defenseNeed(wc, 1);
  const share = need * 1.15 / 2;   // deux membres
  const cap = city({ id: 'a', isCapital: true, x: 0, y: 0, buildings: [{ key: 'RALLY_POINT', level: 10, slot: 2 }] });
  const garrison = { id: 'g', isGarrison: true, cityId: 'a', x: 0, y: 0, status: 'IDLE', units: [rowOf('ROM_INF_MILICIEN', 10000)] };
  const guard = armyAt('wg', Armies.NAMES.wonder, 3, { units: [rowOf('ROM_INF_TRIARII', 100)] });
  const field = armyAt('f1', 'Armée 1', 1, { status: 'STATIONED', x: 40, y: 40, targetCityId: 'w', units: [rowOf('ROM_INF_TRIARII', 4000)] });
  const calls = [];
  const m = { k: {}, guard: 'wg', ex: { f1: 39 } };
  const bot = botWith([cap], {
    playerId: 'p1', armies: [garrison, guard, field], mem: { mil: { own: ['f1'] }, won: m },
    post: async (p, body = {}) => { calls.push([p, body]); return { ok: true, data: p.endsWith('/support') ? { arrivalAt: new Date(T + 3 * 3600000).toISOString() } : { newCount: body.count } }; },
    del: async (p) => { calls.push(['DELETE', p]); return { ok: true, data: {} }; }
  });
  const c = { step: 40, bots: [bot, { playerId: 'p9', capital: { id: 'z' } }] };
  const al = new Map([['p1', 'al'], ['p9', 'al']]);
  const row = (a, ownerId = 'p1') => ({ id: a.id, ownerId, x: a.x, y: a.y, targetCityId: 'w', status: a.status, arrivalAt: null, units: a.units });
  const owner = { id: 'o1', ownerId: 'p9', x: 40, y: 40, status: 'IDLE', units: [rowOf('ROM_INF_TRIARII', 3500)] };
  // 1. le renfort tient la part du membre, sa garde est rentrée : elle n'est pas dissoute, elle se remplit de toute sa part
  // dans la garnison (sans vider d'armée de campagne) et part le relever
  let s = { now: T, allianceOf: al, defense: new Map([['w', wonder.defense(wc, [row(field), owner], T)]]) };
  await wonder.defendTurn(bot, c, { left: 14 }, m, s, wc, { dm: 1 });
  assert.deepEqual(calls.map(x => x[0]), ['/api/army/wg/set-unit', '/api/army/wg/support']);
  assert.deepEqual([m.k.guardRelief, m.k.guardDisbanded, m.guard], [1, undefined, 'wg']);
  assert.ok(powerRows(guard.units) >= share);
  assert.equal(m.ex.f1, 39, 'le renfort attend que la garde soit postée');
  // 2. la garde postée tient la part : le renfort rentre
  Object.assign(guard, { status: 'STATIONED', x: 40, y: 40, targetCityId: 'w', units: [rowOf('ROM_INF_MILICIEN', 7200), rowOf('ROM_INF_TRIARII', 100)] });
  calls.length = 0;
  s = { now: T + 6 * 3600000, allianceOf: al, defense: new Map([['w', wonder.defense(wc, [row(field), row(guard), owner], T + 6 * 3600000)]]) };
  await wonder.defendTurn(bot, { ...c, step: 41 }, { left: 14 }, m, s, wc, { dm: 1 });
  assert.deepEqual(calls.map(x => x[0]), ['/api/army/f1/return']);
  assert.equal(m.ex.f1, undefined);
  // 3. plus tard : la garde postée est usée (moins d'un cinquième de sa part), aucune armée de campagne à la maison, mais la
  // garnison peut la regarnir de toute sa part : elle rentre ; pas de seconde garde formée pendant sa marche. Une vieille garde
  // restée à la maison (version d'avant) est dissoute.
  Object.assign(field, { status: 'RAIDING', x: 9, y: 9 });
  Object.assign(guard, { units: [rowOf('ROM_INF_TRIARII', 100)] });
  garrison.units = [rowOf('ROM_INF_MILICIEN', 10000)];   // les recrues des jours d'avant
  bot.armies.push(armyAt('wg2', Armies.NAMES.wonder, 2, { units: [rowOf('ROM_INF_TRIARII', 10)] }));
  calls.length = 0;
  const weak = { ...owner, units: [rowOf('ROM_INF_TRIARII', 2000)] };
  s = { now: T + 30 * 3600000, allianceOf: al, defense: new Map([['w', wonder.defense(wc, [row(guard), weak], T + 30 * 3600000)]]) };
  await wonder.defendTurn(bot, { ...c, step: 45 }, { left: 14 }, m, s, wc, { dm: 1 });
  assert.deepEqual(calls.map(x => x[0]), ['DELETE', '/api/army/wg/return']);
  assert.equal(calls[0][1], '/api/army/wg2/disband');
  assert.deepEqual([m.k.guardRecalledWorn, m.k.guardDisbandedExtra, m.k.guardsCreated, m.guard], [1, 1, undefined, 'wg']);
  assert.equal(guard.status, 'RETURNING');
});

test('suivi de la Merveille (relecture) : une reprise ne recompte ni la Ville Merveille fondée ni les vagues déjà lues', async () => {
  const T = Date.parse('2027-06-01T12:00:00Z');
  const queries = [], events = [];
  const store = {};
  const b0 = { name: 'B0', playerId: 'p1', mem: {} };
  const c = {
    bots: [b0], event: (n) => events.push(n),
    prisma: { battleReport: { findMany: async (q) => { queries.push(q); return []; } } },
    // le curseur de la boucle (../resume.cjs) : la fenêtre depuis la dernière lecture, gardée avec l'état
    cursor: (name, now) => { const since = store[name] ?? now - 6 * 3600000; store[name] = Math.max(since, now); return { since: new Date(since), until: new Date(store[name]) }; }
  };
  const s = (now) => ({ number: 1, now, wonders: [{ id: 'w', playerId: 'p1', x: 40, y: 40, wonderLevel: 3 }], sites: [], allianceOf: new Map([['p1', 'al']]), tagOf: new Map([['al', 'AQL']]) });
  await wonder.track(c, s(T));
  assert.deepEqual(events, ['wonder_city_founded']);
  assert.equal(b0.mem.wonS.citiesFounded, 1);
  // reprise : la mémoire relue depuis l'état enregistré
  b0.mem = JSON.parse(JSON.stringify(b0.mem));
  await wonder.track(c, s(T + 6 * 3600000));
  assert.deepEqual(events, ['wonder_city_founded']);
  assert.equal(b0.mem.wonS.citiesFounded, 1);
  assert.equal(queries[1].where.createdAt.gt.getTime(), T, 'la lecture reprend où la précédente s\'est arrêtée');
  assert.equal(queries[1].where.createdAt.lte.getTime(), T + 6 * 3600000, 'rien au-delà de l\'heure du pas');
});

test('défense de la Ville Merveille (sim-e) : seules comptent les armées postées et celles qui arrivent avant la vague ; le niveau suivant attend la défense', async () => {
  const T = Date.parse('2027-06-01T12:00:00Z');
  const wc = { id: 'w', x: 40, y: 40, playerId: 'p9', wonderLevel: 20, lastImmortalWave: new Date(T - 2 * 3600000).toISOString() };
  const u = [rowOf('ROM_INF_TRIARII', 100)];
  const p = powerRows(u);
  const D = wonder.defense(wc, [
    { id: 'a', ownerId: 'p1', status: 'STATIONED', targetCityId: 'w', x: 40, y: 40, units: u },                                               // postée
    { id: 'b', ownerId: 'p9', status: 'IDLE', x: 40, y: 40, units: u },                                                                      // le propriétaire, dans sa ville
    { id: 'c', ownerId: 'p2', status: 'SUPPORTING', targetCityId: 'w', arrivalAt: new Date(T + 3600000).toISOString(), units: u },           // là avant la vague
    { id: 'd', ownerId: 'p2', status: 'SUPPORTING', targetCityId: 'w', arrivalAt: new Date(T + 23 * 3600000).toISOString(), units: u },      // trop tard (la vague frappe dans 22 h)
    { id: 'e', ownerId: 'p9', status: 'MOVING', targetX: 40, targetY: 40, arrivalAt: new Date(T + 3600000).toISOString(), units: u },       // le propriétaire, en route
    { id: 'f', ownerId: 'p3', status: 'STATIONED', targetCityId: 'autre', x: 40, y: 40, units: u }                                         // ailleurs
  ], T);
  assert.equal(config.world.immortalWaveHours, 24, 'décision du 2 novembre 2026 (G6) : une vague toutes les 24 h');
  assert.equal(D.nextWaveAt, T + (config.world.immortalWaveHours - 2) * 3600000);
  assert.deepEqual([D.armies, D.posted, D.coming, D.power], [4, 2 * p, 2 * p, 4 * p]);
  assert.deepEqual([D.byOwner.get('p2'), D.byOwner.get('p9')], [p, 2 * p]);
  assert.equal(D.list.length, 5);
  // le propriétaire ne lance le niveau 21 que si la défense tient sa vague (une vague perdue ôte le niveau et le chantier)
  const calls = [];
  const stock = Object.fromEntries(['wood', 'stone', 'iron', 'food'].map(r => [r, 1e9]));
  const owner = botWith([], { playerId: 'p9',
    get: async (q) => { calls.push(['GET', q]); return { ok: true, data: { next: { level: 21, cost: WS.levelCost(21), needsPlan: false }, stock } }; },
    post: async (q) => { calls.push(['POST', q]); return { ok: true, data: { seconds: 5000 } }; } });
  const site = { ...wc, wonderWood: 1e9, wonderStone: 1e9, wonderIron: 1e9, wonderFood: 1e9, wonderBuildEndsAt: null };
  const mb = { k: {} };
  const ctxB = { clock: { now: () => T } };
  await wonder.buildTurn(owner, ctxB, { left: 2 }, mb, site, 1, { power: WS.wavePower(21) - 1 });
  assert.deepEqual(calls, []);
  assert.equal(mb.k.buildWaitDefense, 1);
  await wonder.buildTurn(owner, ctxB, { left: 2 }, mb, site, 1, { power: WS.wavePower(21) });
  assert.deepEqual(calls.map(x => x[1]), ['/api/wonder/w', '/api/wonder/w/build']);
  // le niveau 1 part sans défense (la première vague frappe 24 h après lui)
  calls.length = 0;
  await wonder.buildTurn(owner, ctxB, { left: 2 }, mb, { ...site, wonderLevel: 0, wonderBuildEndsAt: null }, 1, { power: 0 });
  assert.equal(calls.length, 2);
});

test('rassemblements contre les Immortels (sim-e) : toutes les armées de campagne restent à la maison, les livraisons partent avec la caravane ; un plan usé passe avant un neuf', async () => {
  const cap = city({ id: 'a', isCapital: true, x: 0, y: 0, buildings: [{ key: 'MARKET', level: 20, slot: 1 }], wood: 150000, stone: 150000, iron: 150000, food: 150000, maxStorage: 160000, maxFoodStorage: 160000 });
  const calls = [];
  const bot = botWith(withBalance([cap], { production: 1000, consumption: 0, net: 1000 }), {
    name: 'Membre', playerId: 'p1', me: {}, group: 'A',
    armies: [armyAt('f1', 'Armée 1', 1, { units: unitsOf(500) }), armyAt('f2', 'Armée 2', 2, { status: 'HARVESTING', x: 9, y: 9, units: unitsOf(800) }), armyAt('col', 'Armée 3', 3), armyAt('car', Armies.NAMES.caravan, 4)],
    mem: { mil: { own: ['f1', 'f2', 'col'], col: { a: 'col' } } },
    get: async (p) => { calls.push(['GET', p]); return { ok: true, data: { armies: [{ id: 'f1', name: 'Armée 1', capacity: 90000, hero: false }, { id: 'f3', name: 'Armée 5', capacity: 80000, hero: false }, { id: 'car', name: Armies.NAMES.caravan, capacity: 30000, hero: false }] } }; },
    post: async (p, body) => { calls.push(['POST', p, body]); return { ok: true, data: {} }; }
  });
  const s = { allianceOf: new Map([['p1', 'al']]) };
  const as = { k: {} };
  wonder.announce({ bots: [bot] }, s, 'al', 12, as);
  // toutes ses armées de campagne de la capitale, même dehors (pas celle d'une fondation en cours)
  assert.deepEqual(bot.mem.wonder.keep, { f1: 12, f2: 12 });
  assert.deepEqual(bot.mem.mil.idle, { f1: 12, f2: 12 });
  assert.equal(as.k.announced, 1);
  // une livraison pendant l'annonce : la caravane seulement (f3, armée de campagne formée depuis, ne part pas non plus)
  bot.mem.mil.own.push('f3');
  const wc = { id: 'w', x: 50, y: 50, playerId: 'p9', wonderLevel: 1, wonderWood: 0, wonderStone: 0, wonderIron: 0, wonderFood: 0 };
  const m = { k: {} };
  await wonder.deliverTurn(bot, { step: 10, byGroup: () => [bot] }, { left: 8 }, m, wc);
  const send = calls.find(x => x[1] === '/api/trade/send');
  assert.equal(send?.[2].armyId, 'car', JSON.stringify(calls));
  assert.equal(m.k.deliverKeptForRally, 1);
  // des Immortels déjà usés (moins de 80 % de leur force) : l'alliance revient d'abord sur eux
  const W = config.world;
  assert.equal(wonder.worn({ resourceType: 'PLAN', defenderPower: 0.7 * W.immortalPlanPower }), true);
  assert.equal(wonder.worn({ resourceType: 'PLAN', defenderPower: W.immortalPlanPower }), false);
  assert.equal(wonder.worn({ resourceType: 'WONDER', defenderPower: 0.85 * W.immortalSitePower }), false);
  // la veille du rassemblement, l'armée la plus forte qui récolte est rappelée (memberPart la donne)
  const { away } = wonder.memberPart(bot, cap, bot.armies);
  assert.equal(away.id, 'f2');
});

test('invasions (sim-e) : la portée d\'un donjon neuf se compte sur toute l\'alliance ; un niveau au-dessus du plus haut commencé reste permis', () => {
  const node = (nodeId, level, floor, power, rest) => ({ nodeId, level, floor, power, rest, x: 0, y: 0 });
  const go = () => ({ solo: false, group: true, wear: false, march: 0 });
  // un niveau 3 commencé mais long à finir, un niveau 3 neuf, un niveau 4 neuf
  const started3 = node('s3', 3, 2, 5e6, 5e6), fresh3 = node('f3', 3, 1, 4e5, 1.2e6), fresh4 = node('f4', 4, 1, 1e6, 3e6);
  const pick = (nodes, o) => invasion.pickTarget(nodes, { margin: 1.1, plan: go, reachCap: 1e9, started: new Set(['s3']), ...o })?.n.nodeId || null;
  // un donjon commencé à portée : avant, aucun donjon neuf ; maintenant, un neuf d'un niveau au-dessus (s'il est à portée)
  assert.equal(pick([fresh4, fresh3, started3], {}), 's3', 'sans le niveau du plus haut commencé : comme avant');
  assert.equal(pick([fresh4, fresh3, started3], { maxStarted: 3 }), 'f4');
  assert.equal(pick([fresh3, started3], { maxStarted: 3 }), 's3', 'pas un neuf du même niveau');
  assert.equal(pick([fresh4, fresh3, started3], { maxStarted: 3, reachCap: 4e6 }), 's3', 'hors de portée');
  // ce que l'alliance amène : la meilleure armée prête de chaque membre, sinon 80 % de son armée de campagne dehors
  const mk = (id, ally, armies, own) => botWith([city({ id: `c${id}`, isCapital: true, x: 0, y: 0, buildings: [{ key: 'RALLY_POINT', level: 1, slot: 2 }] })], { playerId: id, me: { alliance: { allianceId: ally } }, armies, mem: { mil: { own } } });
  const home = mk('p1', 'al', [{ ...armyAt('h1', 'Armée 1', 1, { cityId: 'cp1', units: unitsOf(1000) }) }], ['h1']);
  const out = mk('p2', 'al', [{ ...armyAt('h2', 'Armée 1', 1, { cityId: 'cp2', status: 'HARVESTING', x: 5, y: 5, units: unitsOf(500) }) }], ['h2']);
  const enemy = mk('p3', 'zz', [{ ...armyAt('h3', 'Armée 1', 1, { cityId: 'cp3', units: unitsOf(9000) }) }], ['h3']);
  const pot = invasion.alliancePot({ bots: [home, out, enemy] }, 'al');
  assert.equal(pot, powerRows(unitsOf(1000)) + 0.8 * powerRows(unitsOf(500)));
  // une place libre : l'armée « prête » serait celle formée avec la seule garnison ; l'armée de campagne partie récolter compte
  // quand même (80 %, avec ce que la garnison lui donnera)
  const slot = botWith([city({ id: 'cp4', isCapital: true, x: 0, y: 0, buildings: [{ key: 'RALLY_POINT', level: 10, slot: 2 }] })], { playerId: 'p4', me: { alliance: { allianceId: 'al' } },
    armies: [{ id: 'g4', isGarrison: true, cityId: 'cp4', x: 0, y: 0, status: 'IDLE', units: unitsOf(100) }, { ...armyAt('h4', 'Armée 1', 1, { cityId: 'cp4', status: 'HARVESTING', x: 5, y: 5, units: unitsOf(1000) }) }], mem: { mil: { own: ['h4'] } } });
  assert.ok(invasion.usableArmies(slot, {}, true)[0]?.create, 'une armée à former sur la place libre');
  assert.equal(invasion.alliancePot({ bots: [slot] }, 'al'), 0.8 * (powerRows(unitsOf(1000)) + 0.9 * powerRows(unitsOf(100))));
});

test('envoi à un allié (sim-e) : deux alliés du même pas ne remplissent plus deux fois le même joueur', async () => {
  const T = Date.parse('2027-06-01T12:00:00Z');
  const rich = (id, name) => {
    const cap = city({ id, isCapital: true, x: 0, y: 0, buildings: [{ key: 'MARKET', level: 10, slot: 1 }], wood: 95000, stone: 95000, iron: 95000, food: 10000, maxStorage: 100000, maxFoodStorage: 100000 });
    const calls = [];
    const b = botWith(withBalance([cap], { production: 100, consumption: 200, net: -100 }), {
      name, playerId: name, me: { alliance: { allianceId: 'al' } }, armies: [armyAt('car', Armies.NAMES.caravan, 1, { cityId: id })], mem: { mil: { own: [] } }, calls,
      get: async () => ({ ok: true, data: { taxPct: 5, armies: [{ id: 'car', name: Armies.NAMES.caravan, capacity: 100000, hero: false }] } }),
      post: async (p, body) => { calls.push([p, body]); return { ok: true, data: { arrivalAt: new Date(T + 2 * 3600000).toISOString() } }; }
    });
    return b;
  };
  const poorCap = city({ id: 'z', isCapital: true, x: 10, y: 0, wood: 10000, stone: 90000, iron: 90000, food: 90000, maxStorage: 100000, maxFoodStorage: 100000 });
  const poor = botWith([poorCap], { name: 'Pauvre', playerId: 'pz', me: { alliance: { allianceId: 'al' } }, armies: [], mem: {} });
  const a = rich('a', 'A1'), b = rich('b', 'A2');
  const c = { step: 20, bots: [a, b, poor], clock: { now: () => T }, event: () => {} };
  const S = (bot) => ({ bot, ctx: c, B: { left: 6 }, m: { k: {}, nx: {} }, st: null });
  const sa = S(a);
  await market.aid(sa);
  assert.equal(a.calls.length, 1);
  const sent = a.calls[0][1].resources.wood;
  assert.equal(sent, 35000, 'il garde 60 % de son entrepôt');
  assert.deepEqual(market.aidInbound(poor, T).wood, sent, 'annoncé à l\'alliance jusqu\'à l\'arrivée');
  // le second allié du même pas voit l'envoi en route : plus rien ne manque
  const sb = S(b);
  await market.aid(sb);
  assert.equal(b.calls.length, 0);
  assert.equal(sb.m.k.aidAlreadyComing, 1);
  // arrivé : oublié
  assert.equal(market.aidInbound(poor, T + 3 * 3600000).wood, 0);
});

test('site de Merveille réservé (E6) sous concurrence : la petite alliance garde son escorte quand un site libéré par une autre attend la fin de sa réservation', () => {
  const T = Date.parse('2027-05-20T12:00:00Z');
  const fcap = city({ id: 'a', isCapital: true, x: 0, y: 0, settlers: 1 });
  const small = botWith([fcap], { playerId: 'c1', group: 'C', me: {} });
  const big = botWith([fcap], { playerId: 'a1', group: 'A', me: {} });
  const freed = { id: 'w1', x: 5, y: 5, hasDefenders: false, cityId: null, hasPlayerArmy: false, lastDefeat: new Date(T - 3600000).toISOString(), reservedFor: 'alA', reservedUntil: T + 5 * 3600000 };
  const guarded = { id: 'w2', x: 9, y: 9, hasDefenders: true, cityId: null, lastDefeat: null };
  assert.equal(wonder.escortWanted({ now: T, sitesOpen: true, sites: [guarded] }, small, null), false, 'rien de libéré : son armée reste libre');
  assert.equal(wonder.escortWanted({ now: T, sitesOpen: true, sites: [guarded, freed] }, small, null), true);
  assert.equal(wonder.escortWanted({ now: T, sitesOpen: true, sites: [guarded] }, big, null), true, 'une grande alliance libère ses sites elle-même');
  // la réservation finie, le site est à elle aussi
  assert.equal(wonder.freeSite({ now: T, sites: [freed] }, fcap, 'alC'), null);
  assert.equal(wonder.freeSite({ now: T + 5 * 3600000, sites: [freed] }, fcap, 'alC').id, 'w1');
});
