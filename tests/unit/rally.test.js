// Rassemblement d'alliance (décision du 29 octobre 2026) : capacité selon la Place de rassemblement du lanceur
require('./_env');
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://unit:unit@localhost:5432/unit';   // le client Prisma est créé, jamais interrogé
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../../src/services/rallyService');

test('capacité : 3 armées au niveau 1 de la Place de rassemblement, 15 au niveau 20', () => {
  assert.equal(R.capacityFor(0), 3);
  assert.equal(R.capacityFor(1), 3);
  assert.equal(R.capacityFor(10), 8);
  assert.equal(R.capacityFor(20), 15);
  assert.equal(R.capacityFor(25), 15);
  for (let l = 1; l < 20; l++) assert.ok(R.capacityFor(l + 1) >= R.capacityFor(l));
});
test('attentes possibles : 5, 10, 30 ou 60 minutes', () => {
  assert.deepEqual(R.WAITS, [5, 10, 30, 60]);
});
