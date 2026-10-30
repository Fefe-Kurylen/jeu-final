// Classements (décision du 27 octobre 2026) : points de combat = entretien des ennemis tués, partage entre joueurs d'un camp
require('./_env');
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://unit:unit@localhost:5432/unit';   // le client Prisma est créé, jamais interrogé
const test = require('node:test');
const assert = require('node:assert/strict');
const RK = require('../../src/services/rankingService');

test('points de combat : 5 par unité de base, 10 intermédiaire, 15 élite et siège (GDD)', () => {
  assert.equal(RK.pointsOf([{ key: 'ROM_INF_MILICIEN', killed: 10 }]), 50);
  assert.equal(RK.pointsOf([{ key: 'ROM_INF_TRIARII', killed: 10 }]), 100);
  assert.equal(RK.pointsOf([{ key: 'ROM_INF_LEGIONNAIRE', killed: 2 }, { key: 'ROM_SIEGE_CATAPULTE', killed: 1 }]), 45);
  // forme des résultats de combat détaillé : initial / remaining
  assert.equal(RK.pointsOf([{ key: 'ROM_INF_MILICIEN', initial: 30, remaining: 10 }]), 100);
  assert.equal(RK.pointsOf([]), 0);
});

test('partage entre les joueurs d\'un camp selon les soldats engagés', () => {
  const s = Object.fromEntries(RK.shares([{ playerId: 'a', units: 30 }, { playerId: 'b', units: 10 }, { playerId: 'a', units: 10 }]));
  assert.equal(s.a, 0.8);
  assert.equal(s.b, 0.2);
  assert.deepEqual(RK.shares([]), []);
  assert.deepEqual(Object.fromEntries(RK.shares([{ playerId: 'a', units: 0 }, { playerId: 'b', units: 0 }])), { a: 0.5, b: 0.5 });
});
