require('./_env');
const test = require('node:test');
const assert = require('node:assert/strict');
const { generateTribeDefenders, expectedSoldiers, targetSoldiers, campDifficultyAt, tribeFactionOf } = require('../../src/utils/tribeDefenders');
const { resolveCombat } = require('../../src/services/combatService');
const config = require('../../src/config');
const { calculateArmyPower } = require('../../src/utils/calculations');
const { unitsData } = require('../../src/config/gamedata');

test('tribe power is the real power of its units (same scale as an army) and grows with the level', () => {
  let prev = 0;
  for (const level of [1, 2, 3]) {
    const t = generateTribeDefenders(level, false, 1);
    const units = Object.entries(t.units).map(([unitKey, count]) => ({ unitKey, count, tier: unitsData.find(u => u.key === unitKey)?.tier }));
    assert.ok(units.every(u => unitsData.some(d => d.key === u.unitKey)), 'every defender key is a real unit');
    assert.equal(t.power, Math.round(calculateArmyPower(units, unitsData)));
    assert.ok(t.power > prev);
    prev = t.power;
  }
});

test('a depleted node spawns a smaller tribe, never below the floor', () => {
  const full = generateTribeDefenders(2, false, 1), low = generateTribeDefenders(2, false, 0.05);
  const total = t => Object.values(t.units).reduce((a, b) => a + b, 0);
  assert.ok(total(low) < total(full));
  assert.ok(total(low) >= 55);
});

test('camp size follows the stock of the node, never below the floor; a camp keeps its people when reinforced', () => {
  assert.equal(expectedSoldiers(1, 1), 100);
  assert.equal(expectedSoldiers(1, 0), 10);
  assert.equal(expectedSoldiers(3, 0.5), 750);
  assert.equal(tribeFactionOf({ ROM_INF_MILICIEN: 3, ROM_ARC_MILICIEN: 2 }), 'ROME');
  assert.equal(tribeFactionOf({}), null);
  const t = generateTribeDefenders(2, false, 1, 'HUN');
  assert.equal(t.faction, 'HUN');
  assert.ok(Object.keys(t.units).every(k => k.startsWith('HUN_')));
  const n = Object.values(t.units).reduce((a, b) => a + b, 0);
  assert.ok(n >= 600 * 0.8 - 6 && n <= 600 * 1.2 + 1, `± ${config.map.camps.variationPct} % around 600: ${n}`);
});

test('camps are easy near the edges of the map and hard at the centre, ± 20 % between camps', () => {
  const { difficultyEdge, difficultyCenter } = config.map.camps;
  assert.equal(campDifficultyAt(0, 0), difficultyCenter);
  assert.ok(Math.abs(campDifficultyAt(config.map.maxCoord, 0) - difficultyEdge) < 1e-9);
  assert.ok(Math.abs(campDifficultyAt(-500, 500) - difficultyEdge) < 1e-9, 'beyond the edge: edge difficulty');
  const mid = campDifficultyAt(config.map.maxCoord / 2, 0);
  assert.ok(mid > difficultyEdge && mid < difficultyCenter);
  assert.equal(targetSoldiers(1, 1, campDifficultyAt(config.map.maxCoord, 0)), 50);
  assert.equal(targetSoldiers(3, 1, campDifficultyAt(0, 0)), 1950);
  assert.equal(targetSoldiers(1, 0, 0.5), 10, 'never below the floor');
  const sizes = Array.from({ length: 40 }, () => Object.values(generateTribeDefenders(1, false, 1, 'ROME', 1).units).reduce((a, b) => a + b, 0));
  assert.ok(Math.min(...sizes) >= 100 * 0.8 - 3 && Math.max(...sizes) <= 100 * 1.2 + 1, `sizes ${Math.min(...sizes)}-${Math.max(...sizes)}`);
  assert.ok(new Set(sizes).size > 3, 'camps differ from one another');
});

test('a camp costs the winner half of what a city raid costs (tribeLossMultiplier)', () => {
  const inf = unitsData.find(u => u.faction === 'ROME' && u.class === 'INFANTRY' && u.tier === 'base');
  const atk = [{ unitKey: inf.key, tier: 'base', count: 200 }], def = [{ unitKey: inf.key, tier: 'base', count: 100 }];
  const raid = resolveCombat(atk, def, 0, null, null, {});
  const camp = resolveCombat(atk, def, 0, null, null, { winnerLossMultiplier: config.combat.tribeLossMultiplier });
  assert.ok(raid.attackerWon && camp.attackerWon);
  assert.equal(config.combat.tribeLossMultiplier, 0.15);
  assert.ok(Math.abs(camp.attackerLossRate - raid.attackerLossRate * 0.5) < 1e-9);
  assert.equal(camp.defenderLossRate, config.combat.loserLossRate);
});
