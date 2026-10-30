// Cycle du serveur et Merveille (décision du 28 octobre 2026) : calendrier du monde, coût et durée des niveaux, Immortels
require('./_env');
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://unit:unit@localhost:5432/unit';   // le client Prisma est créé, jamais interrogé
const test = require('node:test');
const assert = require('node:assert/strict');
const W = require('../../src/services/wonderService');
const HOF = require('../../src/services/hallOfFameService');
const { world } = require('../../src/config');

const DAY = 86400000;
const opened = new Date('2026-01-01T00:00:00Z');

test('calendrier : inscriptions 60 jours, sites au jour 120, plans au jour 150', () => {
  const p1 = W.phaseOf({ readyAt: opened, number: 3 }, new Date(opened.getTime() + 2 * 3600000), 10);
  assert.equal(p1.day, 1);
  assert.equal(p1.world, 3);
  assert.equal(p1.registration.open, true);
  assert.equal(p1.wonderSitesAt.getTime(), opened.getTime() + (world.wonderSitesDay - 1) * DAY);
  assert.equal(p1.wonderPlansAt.getTime(), opened.getTime() + (world.wonderPlansDay - 1) * DAY);
  const p60 = W.phaseOf({ readyAt: opened }, new Date(opened.getTime() + 59.5 * DAY), 10);
  assert.equal(p60.day, 60);
  assert.equal(p60.registration.open, true);
  const p61 = W.phaseOf({ readyAt: opened }, new Date(opened.getTime() + 60.5 * DAY), 10);
  assert.equal(p61.registration.open, false);
  // complet à 5 000 joueurs, fermé quand le monde est fini
  assert.equal(W.phaseOf({ readyAt: opened }, opened, world.maxPlayers).registration.open, false);
  const ended = W.phaseOf({ readyAt: opened, endedAt: opened, winnerName: '[ABC] Alpha' }, opened, 0);
  assert.equal(ended.ended, true);
  assert.equal(ended.registration.open, false);
  assert.equal(ended.winner, '[ABC] Alpha');
});

test('niveaux de la Merveille : coût et durée croissants, niveau 1 au tarif de base', () => {
  assert.deepEqual(W.levelCost(1), world.wonderCostBase);
  const c50 = W.levelCost(50), c100 = W.levelCost(100);
  for (const r of ['wood', 'stone', 'iron', 'food']) {
    assert.ok(c50[r] > world.wonderCostBase[r]);
    assert.ok(c100[r] > c50[r]);
    assert.equal(c100[r], Math.round(world.wonderCostBase[r] * Math.pow(world.wonderCostFactor, 99)));
  }
  assert.equal(W.levelSeconds(1), world.wonderTimeBaseSec);
  assert.ok(W.levelSeconds(100) > W.levelSeconds(50));
});

test('Immortels : armée d\'élite du Sultanat, plus forte pour les plans', () => {
  const units = W.immortalUnits(world.immortalSitePower);
  assert.deepEqual(Object.keys(units).sort(), ['SUL_ARC_PERSE', 'SUL_CAV_MAMELOUK', 'SUL_INF_PALAIS']);
  for (const n of Object.values(units)) assert.ok(n >= 1);
  const bigger = W.immortalUnits(world.immortalPlanPower);
  assert.ok(bigger.SUL_INF_PALAIS > units.SUL_INF_PALAIS);
});

test('nœuds spéciaux : sites de Merveille et plans à part des ressources', () => {
  assert.equal(W.isSpecial({ resourceType: 'WONDER' }), true);
  assert.equal(W.isSpecial({ resourceType: 'PLAN' }), true);
  assert.equal(W.isSpecial({ resourceType: 'WOOD' }), false);
});

test('titres du Panthéon', () => {
  assert.equal(HOF.TITLE.WONDER(2, 1), 'Bâtisseur de la Merveille (monde 2)');
  assert.equal(HOF.TITLE.ATTACK(2, 1), 'Premier attaquant (monde 2)');
  assert.equal(HOF.TITLE.DEFENSE(4, 3), '3e défenseur (monde 4)');
  assert.ok(HOF.GAME_TABLES.includes('City') && !HOF.GAME_TABLES.includes('Account') && !HOF.GAME_TABLES.includes('Player'));
});
