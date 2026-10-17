require('./_env');
const test = require('node:test');
const assert = require('node:assert/strict');
const { generateTribeDefenders } = require('../../src/utils/tribeDefenders');
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
