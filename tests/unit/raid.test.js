// Raid : pertes arrondies vers le bas (comme applyLossRate), les mêmes dans l'armée, le rapport et les classements
require('./_env');
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://unit:unit@localhost:5432/unit';   // le client Prisma est créé, jamais interrogé
const test = require('node:test');
const assert = require('node:assert/strict');
const { raidLosses } = require('../../src/game/processors/armyProcessor');

test('raid : une ligne d\'une unité survit à 5 %, une ligne de 3 garde ses 3 unités à 30 %', () => {
  assert.deepEqual(raidLosses([{ unitKey: 'a', count: 1 }], 0.05), [{ key: 'a', killed: 0 }]);
  assert.deepEqual(raidLosses([{ unitKey: 'b', count: 3 }], 0.3), [{ key: 'b', killed: 0 }]);
  assert.deepEqual(raidLosses([{ unitKey: 'c', count: 10 }, { unitKey: 'd', count: 7 }], 0.3), [{ key: 'c', killed: 3 }, { key: 'd', killed: 2 }]);
});
test('raid : une ligne ne perd jamais plus que le taux', () => {
  for (let n = 1; n <= 200; n++) for (const rate of [0.05, 0.07, 0.3, 0.5, 1]) {
    const [{ killed }] = raidLosses([{ unitKey: 'x', count: n }], rate);
    assert.ok(killed <= n * rate && killed >= 0 && killed <= n);
  }
});
