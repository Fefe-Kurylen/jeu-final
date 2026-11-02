// Raids et défense des villes (décisions du 2 novembre 2026, deuxième simulation de 200 jours) : moteur de bataille (G3),
// butin jusqu'à 100 % de ce que portent les survivants (G4), seules les armées défendent une ville (G10)
require('./_env');
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://unit:unit@localhost:5432/unit';   // le client Prisma est créé, jamais interrogé
const test = require('node:test');
const assert = require('node:assert/strict');
const config = require('../../src/config');
const { defendingArmies } = require('../../src/game/processors/armyProcessor');
const { resolveCombat } = require('../../src/services/combatService');
const { splitLosses } = require('../../src/utils/armyUnits');

test('G4 : un raid emporte jusqu\'à 100 % de ce que portent les pillards survivants (30 % avant)', () => {
  assert.equal(config.combat.raidLootPctOfCarry, 1);
  assert.equal(config.hideout.raidStealRate, 0.5, 'la part hors cachette qu\'un raid peut prendre ne change pas');
});

test('G10 : seules les armées défendent une ville ; la réserve (garnison) ne combat pas, une armée partie non plus', () => {
  const city = { id: 'c1', x: 10, y: 20, armies: [
    { id: 'reserve', isGarrison: true, status: 'IDLE', x: 10, y: 20, units: [{ unitKey: 'ROM_INF_MILICIEN', count: 400 }] },
    { id: 'home', isGarrison: false, status: 'IDLE', x: 10, y: 20, units: [{ unitKey: 'ROM_INF_MILICIEN', count: 50 }] },
    { id: 'away', isGarrison: false, status: 'RAIDING', x: 40, y: 20, units: [{ unitKey: 'ROM_INF_MILICIEN', count: 90 }] },
    { id: 'ally', isGarrison: false, status: 'STATIONED', x: 10, y: 20, units: [{ unitKey: 'GAU_INF_GUERRIER', count: 30 }] },
    { id: 'guest', isGarrison: false, cityId: 'c2', status: 'IDLE', x: 10, y: 20, units: [{ unitKey: 'ROM_INF_MILICIEN', count: 20 }] }
  ] };
  assert.deepEqual(defendingArmies(city).map(a => a.id), ['home', 'ally', 'guest']);
  // une ville où ne se tient que la réserve n'est défendue par personne : le pillard passe sans perte, la réserve est intacte
  const onlyReserve = { ...city, armies: [city.armies[0]] };
  const defenders = defendingArmies(onlyReserve);
  assert.deepEqual(defenders, []);
  const r = resolveCombat([{ unitKey: 'GAU_CAV_GAULOIS', tier: 'intermediate', count: 100 }], defenders.flatMap(a => a.units), 10, null, null, { raid: true });
  assert.equal(r.attackerWon, true);
  assert.equal(r.attackerTotalKilled + r.defenderTotalKilled, 0);
  assert.equal(city.armies[0].units[0].count, 400);
});

test('raid au moteur : les morts de chaque type se partagent entre les armées qui défendent, au total exact', () => {
  const guards = [{ units: [{ unitKey: 'ROM_INF_MILICIEN', count: 3 }] }, { units: [{ unitKey: 'ROM_INF_MILICIEN', count: 3 }] }, { units: [{ unitKey: 'ROM_INF_MILICIEN', count: 4 }] }];
  const r = resolveCombat([{ unitKey: 'GAU_CAV_GAULOIS', tier: 'intermediate', count: 385 }], guards.flatMap(g => g.units), 5, null, null, { raid: true });
  assert.equal(r.defenderTotalKilled, 3, '30 % des 10 gardes');
  const split = splitLosses(guards, r.defenderFinalUnits);
  assert.equal(split.flat().reduce((t, l) => t + l.killed, 0), 3);
  assert.ok(split.every(l => l.reduce((t, x) => t + x.killed, 0) <= 2));
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
