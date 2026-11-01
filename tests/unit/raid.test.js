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

// Après un combat dans une ville : les défenseurs venus d'ailleurs restés sans soldats rentrent chez eux (sinon ils
// gardaient leur emplacement d'armée pour rien, comme les garnisons de Bastion vides de la simulation du 1er novembre 2026)
test('combat dans une ville : un renfort ou une armée venue d\'une autre ville, anéantis, rentrent aussitôt ; ceux de la ville et les survivants restent', async () => {
  const { sendWipedGuestsHome } = require('../../src/game/processors/armyProcessor');
  const prisma = require('../../src/config/database');
  const host = { id: 'c-host', name: 'Hôte', x: 10, y: 10 };
  const cities = [host, { id: 'c-ally', x: 40, y: 0 }, { id: 'c-other', x: -5, y: 20 }];
  const row = (id, cityId, status, extra = {}) => ({ id, name: id, ownerId: cityId === 'c-ally' ? 'p2' : 'p1', cityId, status, x: 10, y: 10, targetCityId: status === 'STATIONED' ? 'c-host' : null, ...extra });
  // 'back' : déjà reposée chez elle par un autre chemin (chute de la ville…) : ni renvoyée ni prévenue une seconde fois
  const armies = [row('own', 'c-host', 'IDLE'), row('ally', 'c-ally', 'STATIONED', { missionType: 'SUPPORT' }), row('guest', 'c-other', 'IDLE'), row('alive', 'c-ally', 'STATIONED'), row('back', 'c-other', 'IDLE', { ownerId: 'p3', x: -5, y: 20 })];
  const units = [{ armyId: 'alive', unitKey: 'ROM_INF_MILICIEN', count: 4 }];
  const notes = [];
  const fake = {
    army: { findUnique: async ({ where }) => { const a = armies.find(x => x.id === where.id); return a ? { ...a } : null; }, update: async ({ where, data }) => Object.assign(armies.find(x => x.id === where.id), data) },
    armyUnit: { findMany: async ({ where }) => units.filter(u => u.armyId === where.armyId), count: async ({ where }) => units.filter(u => u.armyId === where.armyId && u.count > where.count.gt).length },
    city: { findUnique: async ({ where }) => cities.find(c => c.id === where.id) || null },
    notification: { create: async ({ data }) => { notes.push(data); return { id: String(notes.length) }; } }
  };
  const saved = Object.fromEntries(Object.keys(fake).map(k => [k, prisma[k]]));
  Object.assign(prisma, fake);
  try {
    await sendWipedGuestsHome(host, [...armies.map(a => ({ ...a, x: host.x, y: host.y })), { id: 'gone', cityId: 'c-other' }]);   // toutes ont combattu dans la ville
    await new Promise(r => setImmediate(r));
    const at = (id) => { const a = armies.find(x => x.id === id); return [a.status, a.x, a.y, a.targetCityId ?? null]; };
    assert.deepEqual(at('ally'), ['IDLE', 40, 0, null], 'renfort allié anéanti : posé dans sa ville');
    assert.deepEqual(at('guest'), ['IDLE', -5, 20, null], 'armée venue d\'une autre ville du joueur : posée chez elle');
    assert.deepEqual(at('own'), ['IDLE', 10, 10, null], 'une armée de la ville y reste');
    assert.deepEqual(at('alive'), ['STATIONED', 10, 10, 'c-host'], 'un renfort qui a encore des soldats reste');
    assert.deepEqual(at('back'), ['IDLE', -5, 20, null], 'déjà rentrée : laissée telle quelle');
    assert.deepEqual(notes.map(n => n.playerId).sort(), ['p1', 'p2']);
    assert.ok(notes.every(n => n.body.includes('a perdu tous ses soldats à Hôte')), JSON.stringify(notes));
  } finally { Object.assign(prisma, saved); }
});
