require('./_env');
const test = require('node:test');
const assert = require('node:assert/strict');
const fx = require('../../src/utils/buildingEffects');

const b = (key, level) => ({ key, level });

test('construction and training time reductions follow the data and are capped', () => {
  assert.equal(fx.buildTimeReductionPct([]), 0);
  assert.equal(fx.buildTimeReductionPct([b('MAIN_HALL', 10)]), 25);
  assert.equal(fx.buildTimeReductionPct([b('MAIN_HALL', 10), b('ACADEMY', 5), b('RESIDENCE', 4)]), 31);
  assert.equal(fx.buildTimeReductionPct([b('MAIN_HALL', 20), b('ACADEMY', 20)]), 60, 'capped at 60 %');
  assert.equal(fx.trainTimeReductionPct([b('BARRACKS', 10)], 'INFANTRY'), 5);
  assert.equal(fx.trainTimeReductionPct([b('BARRACKS', 10)], 'CAVALRY'), 0, 'the stable trains cavalry, not the barracks');
  assert.equal(fx.trainTimeReductionPct([b('WORKSHOP', 5)], 'SIEGE'), 20);
  // bonus en plus (Grandes casernes pour la capitale), dans le même plafond de 60 %
  assert.equal(fx.trainTimeReductionPct([b('BARRACKS', 10)], 'INFANTRY', 10), 15);
  assert.equal(fx.trainTimeReductionPct([b('BARRACKS', 20)], 'INFANTRY', 80), 60, 'capped at 60 %');
});

// ---- revue des bâtiments (décisions du 31 octobre 2026) ----
test('Grandes casernes et Grandes écuries : leurs niveaux s\'additionnent pour la formation dans la capitale (0,5 %/niveau)', () => {
  const cities = [{ buildings: [b('BARRACKS', 20)] }, { buildings: [b('GREAT_BARRACKS', 20), b('GREAT_STABLE', 10)] }, { buildings: [b('GREAT_BARRACKS', 20)] }];
  const per = fx.effectOf('GREAT_BARRACKS', 'capitalTrainTimeReductionPctPerLevel');
  assert.equal(per, 0.5);
  assert.equal(fx.capitalTrainBoostPct(cities, 'INFANTRY'), 40 * per);
  assert.equal(fx.capitalTrainBoostPct(cities, 'ARCHER'), 40 * per);
  assert.equal(fx.capitalTrainBoostPct(cities, 'CAVALRY'), 10 * fx.effectOf('GREAT_STABLE', 'capitalTrainTimeReductionPctPerLevel'));
  assert.equal(fx.capitalTrainBoostPct(cities, 'SIEGE'), 0, 'les engins : l\'Atelier seul');
  assert.equal(fx.capitalTrainBoostPct([], 'INFANTRY'), 0);
  // Caserne 20 (10 %) + 3 Grandes casernes 20 (30 %) = 40 %
  const three = [1, 2, 3].map(() => ({ buildings: [b('GREAT_BARRACKS', 20)] }));
  assert.equal(fx.trainTimeReductionPct([b('BARRACKS', 20)], 'INFANTRY', fx.capitalTrainBoostPct(three, 'INFANTRY')), 40);
});

test('Forge : attaque et défense de toutes les troupes (0,5 %/niveau chacune) ; la défense des villes garde la Brasserie', () => {
  assert.equal(fx.forgeAttackPct([b('FORGE', 10)]), 5);
  assert.equal(fx.forgeDefensePct([b('FORGE', 20)]), 10);
  assert.equal(fx.forgeAttackPct([]), 0);
  assert.equal(fx.effectOf('FORGE', 'globalDefenseBonusPctPerLevel'), 0, 'ancienne clé retirée');
  assert.equal(fx.defenseBonusPct([b('FORGE', 10), b('GALLIC_BREWERY', 5)]), 5, 'la Forge compte à part, dans tous les combats');
});

test('Cachette : une quantité fixe de chaque ressource selon le niveau (240 → 32 000, courbe du stockage), plus pour la Gaule', () => {
  const { lerpExp, getFactionBonus } = require('../../src/utils/calculations');
  const { factionsData } = require('../../src/config/gamedata');
  assert.equal(fx.hideoutAmount([], 'ROME'), 0);
  assert.equal(fx.hideoutAmount([b('HIDEOUT', 1)], 'ROME'), 240);
  assert.equal(fx.hideoutAmount([b('HIDEOUT', 20)], 'ROME'), 32000);
  assert.equal(fx.hideoutAmount([b('HIDEOUT', 10)], 'ROME'), Math.round(lerpExp(240, 32000, 9 / 19)));
  for (let l = 1; l < 20; l++) assert.ok(fx.hideoutAmount([b('HIDEOUT', l + 1)], 'HUN') > fx.hideoutAmount([b('HIDEOUT', l)], 'HUN'), `niveau ${l + 1}`);
  const gaul = 1 + getFactionBonus('GAUL', 'hideoutCapacity', factionsData) / 100;
  assert.ok(gaul > 1, 'la Gaule a un bonus de cachette');
  assert.equal(fx.hideoutAmount([b('HIDEOUT', 20)], 'GAUL'), Math.floor(32000 * gaul));
  // ce qu'un pillard peut prendre : ce qui dépasse, par ressource
  assert.deepEqual(fx.outsideHideout({ wood: 1000, stone: 100, iron: 240.7, food: 5000 }, 240), { wood: 760, stone: 0, iron: 0, food: 4760 });
});

test('Marché et Comptoir réservés à la capitale ; marchands : un par niveau du Marché, charge + Comptoir et Poste du Désert', () => {
  assert.ok(fx.capitalOnly('MARKET') && fx.capitalOnly('TRADE_OFFICE') && !fx.notInCapital('TRADE_OFFICE'));
  assert.equal(fx.merchantCount([]), 0);
  assert.equal(fx.merchantCount([b('MARKET', 12)]), 12);
  assert.equal(fx.merchantCapacityBonusPct([b('TRADE_OFFICE', 10), b('SULTAN_DESERT_OUTPOST', 5)]), 15);
  assert.equal(fx.merchantCapacityBonusPct([b('MARKET', 20)]), 0, 'le Marché donne des marchands, pas de la charge');
});

test('Place de rassemblement : 5 armées + 1 par niveau dans un rassemblement ; Ambassade du chef : 3 membres par niveau, 60 au plus', () => {
  assert.equal(fx.rallyMaxArmies(0), 5);
  assert.equal(fx.rallyMaxArmies(1), 6);
  assert.equal(fx.rallyMaxArmies(20), 25);
  assert.equal(fx.allianceMaxMembers(0), 0);
  assert.equal(fx.allianceMaxMembers(7), 21, 'niveau où l\'on fonde une alliance');
  assert.equal(fx.allianceMaxMembers(20), 60);
  assert.equal(fx.allianceMaxMembers(25), require('../../src/config').alliance.maxMembers, 'jamais au-dessus du plafond général');
});

test('Tour de guet : rayon de vision 5 + 6 par niveau ; niveaux maximum (Bâtiment principal 20, Mur d\'une colonie 15)', () => {
  assert.equal(fx.visionRadius(0), 5);
  assert.equal(fx.visionRadius(1), 11);
  assert.equal(fx.visionRadius(20), 125);
  assert.equal(fx.maxLevelIn('MAIN_HALL', true), 20);
  assert.equal(fx.maxLevelIn('MAIN_HALL', false), 20);
  assert.equal(fx.maxLevelIn('WALL', true), 20);
  assert.equal(fx.maxLevelIn('WALL', false), 15);
  assert.equal(fx.maxLevelIn('MILL', false), 5);
});

test('bâtiments de bonus limités au niveau 5 : +2,5 % par niveau, +12,5 % au niveau 5', () => {
  for (const [key, res] of [['MILL', 'food'], ['BAKERY', 'food'], ['SAWMILL', 'wood'], ['STONEMASON', 'stone'], ['FOUNDRY', 'iron']]) {
    assert.equal(fx.effectOf(key, `${res}ProdBonusPctL1`), 2.5, key);
    assert.equal(fx.effectOf(key, `${res}ProdBonusPctL5`), 12.5, key);
  }
});

test('defence, gold, upkeep, production, transport', () => {
  assert.equal(fx.defenseBonusPct([b('GALLIC_BREWERY', 5)]), 5);
  assert.equal(fx.protectedStorage, undefined, 'le Grand dépôt et le Grand silo ne protègent plus rien (seule la cachette)');
  assert.equal(fx.goldPerDay([b('TREASURE_CHAMBER', 1)]), 10);
  assert.equal(fx.goldPerDay([b('TREASURE_CHAMBER', 20)]), 200);
  assert.ok(fx.goldPerDay([b('TREASURE_CHAMBER', 10)]) > 10 && fx.goldPerDay([b('TREASURE_CHAMBER', 10)]) < 200);
  assert.equal(fx.upkeepReductionPct([b('HUN_WAR_TENT', 10)]), 5);
  assert.equal(fx.productionBonusPct([b('EGYPTIAN_IRRIGATION', 7)]), 7);
  assert.equal(fx.transportBonusPct([b('MARKET', 4), b('TRADE_OFFICE', 10)]), 30);
  assert.equal(fx.transportBonusPct([b('SULTAN_DESERT_OUTPOST', 20)]), 20);
  assert.ok(fx.transportBonusKeys().some(([k, pct]) => k === 'SULTAN_DESERT_OUTPOST' && pct === 1));
  assert.equal(fx.marchSpeedBonusPct([b('EGYPTIAN_IRRIGATION', 20)]), 10);
  assert.equal(fx.marchSpeedBonusPct(undefined), 0);
});

test('rally point army slots: 1 at level 1, 3 at level 10, 5 at level 20', () => {
  assert.equal(fx.maxArmies([]), 0);
  assert.equal(fx.maxArmies([b('RALLY_POINT', 1)]), 1);
  assert.equal(fx.maxArmies([b('RALLY_POINT', 5)]), 2);
  assert.equal(fx.maxArmies([b('RALLY_POINT', 10)]), 3);
  assert.equal(fx.maxArmies([b('RALLY_POINT', 20)]), 5);
  assert.equal(fx.rallyLevelForArmies(2), 5);
});

test('embassy, watchtower and market rules', () => {
  assert.equal(fx.allianceCreateLevel(), 7);
  assert.equal(fx.allianceJoinLevel(), 5);
  assert.equal(fx.counterSpyChance, undefined, 'plus d\'interception (26 octobre 2026) : la Tour de guet prévient, les espions réussissent toujours');
  assert.equal(fx.watchtowerShowsAttackerAt(), 10);
  assert.equal(fx.npcMarketTaxPct(1), 30);
  assert.equal(fx.npcMarketTaxPct(20), 11);
  assert.equal(fx.npcMarketTaxPct(100), 5, 'never below 5 %');
});
