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
});

test('defence, protected storage, gold, upkeep, production, transport', () => {
  assert.equal(fx.defenseBonusPct([b('FORGE', 10), b('GALLIC_BREWERY', 5)]), 10);
  const prot = fx.protectedStorage([b('GREAT_WAREHOUSE', 1), b('GREAT_SILO', 20)]);
  assert.equal(prot.wood, 3600); assert.equal(prot.food, 600000); assert.equal(prot.iron, prot.wood);
  assert.deepEqual(fx.protectedStorage([]), { wood: 0, stone: 0, iron: 0, food: 0 });
  assert.equal(fx.goldPerDay([b('TREASURE_CHAMBER', 1)]), 10);
  assert.equal(fx.goldPerDay([b('TREASURE_CHAMBER', 20)]), 200);
  assert.ok(fx.goldPerDay([b('TREASURE_CHAMBER', 10)]) > 10 && fx.goldPerDay([b('TREASURE_CHAMBER', 10)]) < 200);
  assert.equal(fx.upkeepReductionPct([b('HUN_WAR_TENT', 10)]), 5);
  assert.equal(fx.productionBonusPct([b('EGYPTIAN_IRRIGATION', 7)]), 7);
  assert.equal(fx.transportBonusPct([b('MARKET', 4), b('TRADE_OFFICE', 10)]), 30);
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
  assert.equal(fx.counterSpyChance(0), 0);
  assert.ok(Math.abs(fx.counterSpyChance(20) - 0.7) < 1e-9);
  assert.ok(Math.abs(fx.counterSpyChance(10) - 0.35) < 1e-9);
  assert.equal(fx.npcMarketTaxPct(1), 30);
  assert.equal(fx.npcMarketTaxPct(20), 11);
  assert.equal(fx.npcMarketTaxPct(100), 5, 'never below 5 %');
});
