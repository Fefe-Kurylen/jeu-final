// Alliance (décision du 26 octobre 2026) : plafond d'aides selon l'Ambassade, temps retiré par une aide, statuts de
// diplomatie (allié des deux côtés, ennemi d'un seul), catalogue de la boutique
require('./_env');
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://unit:unit@localhost:5432/unit';   // le client Prisma est créé, jamais interrogé
const test = require('node:test');
const assert = require('node:assert');
const fx = require('../../src/utils/buildingEffects');
const { pairStatus } = require('../../src/services/diplomacyService');
const { helpAmountMs } = require('../../src/services/allianceHelpService');
const { catalog } = require('../../src/services/allianceShopService');

test('aides reçues selon l\'Ambassade : 0 au niveau 1, 5 au niveau 5, 20 au niveau 20', () => {
  assert.strictEqual(fx.allianceHelpMax(0), 0);
  assert.strictEqual(fx.allianceHelpMax(1), 0);
  assert.strictEqual(fx.allianceHelpMax(3), 2);
  assert.strictEqual(fx.allianceHelpMax(5), 5);
  assert.strictEqual(fx.allianceHelpMax(10), 10);
  assert.strictEqual(fx.allianceHelpMax(20), 20);
  assert.strictEqual(fx.allianceHelpMax(25), 20);
});

test('une aide retire 1 % du restant, 1 minute au moins', () => {
  assert.strictEqual(helpAmountMs(2 * 3600 * 1000), 72 * 1000);
  assert.strictEqual(helpAmountMs(10 * 60 * 1000), 60 * 1000);
  assert.strictEqual(helpAmountMs(24 * 3600 * 1000), 864 * 1000);
});

test('diplomatie : allié seulement des deux côtés, ennemi d\'un seul', () => {
  assert.strictEqual(pairStatus('ALLY', 'ALLY'), 'ALLY');
  assert.strictEqual(pairStatus('ALLY', 'NEUTRAL'), 'NEUTRAL');
  assert.strictEqual(pairStatus('NEUTRAL', 'ENEMY'), 'ENEMY');
  assert.strictEqual(pairStatus('ALLY', 'ENEMY'), 'ENEMY');
  assert.strictEqual(pairStatus('NEUTRAL', 'NEUTRAL'), 'NEUTRAL');
});

test('boutique : clés uniques, prix positifs, objets de héros connus', () => {
  const keys = catalog.map(i => i.key);
  assert.strictEqual(new Set(keys).size, keys.length);
  for (const i of catalog) assert.ok(i.price > 0, i.key);
  const items = require('../../data/items.json').items;
  for (const i of catalog.filter(x => x.type === 'hero_item')) assert.ok(items.some(it => it.key === i.item && it.tier === 'COMMON'), i.item);
  for (const i of catalog.filter(x => x.type === 'banner')) assert.ok(i.image && i.image.startsWith('assets/images/painted/banners/'), i.key);
});
