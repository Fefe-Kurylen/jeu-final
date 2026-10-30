// Bastion d'alliance (décision du 26 octobre 2026) : règles de config, vies qui remontent, mur bouclier, bonus sans Bastion
require('./_env');
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://unit:unit@localhost:5432/unit';   // le client Prisma est créé, jamais interrogé
const test = require('node:test');
const assert = require('node:assert/strict');
const config = require('../../src/config');
const bastion = require('../../src/services/bastionService');

test('règles décidées : 15 membres, coût, 3 jours, 7 jours de répit, 10 assauts, bonus', () => {
  const B = config.bastion;
  assert.equal(B.minMembers, 15);
  assert.deepEqual(B.cost, { wood: 500000, stone: 500000, iron: 500000, food: 250000 });
  assert.equal(B.buildDays, 3);
  assert.equal(B.cooldownDays, 7);
  assert.equal(B.assaults, 10);
  assert.deepEqual(B.bonuses, { productionPct: 10, armySpeedPct: 5, carryPct: 10, garrisonDefensePct: 10 });
});

test('mur bouclier : 10 fois un mur de niveau 20', () => {
  assert.equal(config.bastion.wallMultiplier, 10);
  assert.equal(bastion.wallMaxHp(), config.combat.wallHpPerLevel * 20 * 10);
});

test('vies : elles remontent de 0 à 10 en 72 h, jamais au-delà', () => {
  const at = new Date('2026-10-26T00:00:00Z');
  const b = { structure: 0.5, structureAt: at };
  assert.equal(bastion.structureNow(b, at.getTime()), 0.5);
  assert.ok(Math.abs(bastion.structureNow(b, at.getTime() + 36 * 3600000) - 1) < 1e-9);   // 36 h = la moitié de 72 h
  assert.equal(bastion.structureNow(b, at.getTime() + 100 * 3600000), 1);
  assert.ok(Math.abs(bastion.structureNow({ structure: 0, structureAt: at }, at.getTime() + 7.2 * 3600000) - 0.1) < 1e-9);   // une vie en 7,2 h
});

test('sans alliance ou sans Bastion debout : aucun bonus', () => {
  assert.equal(bastion.activeSync(null), false);
  assert.equal(bastion.speedPctSync(null), 0);
  assert.equal(bastion.carryMultSync(null), 1);
  assert.equal(bastion.carryMultSync('alliance-sans-bastion'), 1);
});

test('vies entières : une vie compte une fois remontée, le dernier assaut rase même avec un reste de remontée', () => {
  assert.equal(bastion.livesOf(1), 10);
  assert.equal(bastion.livesOf(0.9), 9);
  assert.equal(bastion.livesOf(0.95), 9);
  assert.equal(bastion.livesOf(0.1001), 1);
  assert.equal(bastion.livesOf(0.0999), 0);
});

test('assaut d\'un rassemblement : seul un rassemblement parti vers ce Bastion désigne le héros (un ancien rallyId est ignoré)', () => {
  assert.equal(bastion.campingRally({ status: 'DONE', targetBastionId: 'b1' }, 'b1'), true);
  assert.equal(bastion.campingRally({ status: 'DONE', targetBastionId: 'b2' }, 'b1'), false, 'un rassemblement vers un autre Bastion');
  assert.equal(bastion.campingRally({ status: 'DONE', targetBastionId: null }, 'b1'), false, 'un rassemblement contre un donjon');
  assert.equal(bastion.campingRally({ status: 'CANCELLED', targetBastionId: 'b1' }, 'b1'), false);
  assert.equal(bastion.campingRally({ status: 'GATHERING', targetBastionId: 'b1' }, 'b1'), false);
  assert.equal(bastion.campingRally(undefined, 'b1'), false, 'un rassemblement introuvable');
});
