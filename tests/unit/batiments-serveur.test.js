// Revue des bâtiments (décisions du 31 octobre 2026, lot serveur) : vision des armées autour des villes (Tour de guet),
// Forge dans les combats (attaque et défense, avec les technologies), pillage hors cachette (quantité fixe par ressource).
// Aucune requête réelle : les transactions sont factices.
require('./_env');
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://unit:unit@localhost:5432/unit';   // le client Prisma est créé, jamais interrogé
const test = require('node:test');
const assert = require('node:assert/strict');
const config = require('../../src/config');
const fx = require('../../src/utils/buildingEffects');
const V = require('../../src/services/visionService');
const { combatPct, combatMult } = require('../../src/services/armyService');
const { pillage } = require('../../src/services/conquestService');

// ---- 7. Tour de guet : la vision ne concerne que les armées ----
test('vision : position d\'une armée en marche (ligne droite selon l\'heure), arrêtée sur sa case', () => {
  const t0 = Date.parse('2026-10-31T12:00:00Z');
  const marching = { x: 0, y: 0, targetX: 100, targetY: 0, departedAt: new Date(t0), arrivalAt: new Date(t0 + 100000) };
  assert.deepEqual(V.armyPositionAt(marching, t0), { x: 0, y: 0 });
  assert.deepEqual(V.armyPositionAt(marching, t0 + 25000), { x: 25, y: 0 });
  assert.deepEqual(V.armyPositionAt(marching, t0 + 500000), { x: 100, y: 0 }, 'jamais au-delà de sa cible');
  assert.deepEqual(V.armyPositionAt({ x: 7, y: 8, targetX: null, targetY: null, arrivalAt: null }, t0), { x: 7, y: 8 }, 'camp, récolte : sur sa case');
});

test('vision : rayon de la Tour de guet de la capitale autour de CHACUNE des villes du joueur ; une requête', async () => {
  let asked = null;
  const db = { city: { findMany: async (q) => { asked = q; return [
    { x: 0, y: 0, isCapital: true, buildings: [{ key: 'WATCHTOWER', level: 2 }] },
    { x: 100, y: 100, isCapital: false, buildings: [{ key: 'WATCHTOWER', level: 20 }] }   // tour d'avant la migration 0030 : ne compte pas
  ]; } } };
  const vision = await V.visionOf(db, 'p1');
  assert.equal(asked.where.playerId, 'p1');
  assert.equal(vision.radius, fx.visionRadius(2));
  assert.equal(vision.radius, 5 + 6 * 2);
  assert.ok(V.sees(vision, { x: 10, y: 10 }), 'près de la capitale');
  assert.ok(V.sees(vision, { x: 110, y: 95 }), 'près de la colonie : même rayon');
  assert.ok(!V.sees(vision, { x: 50, y: 50 }), 'entre les deux : rien');
  const t0 = Date.now();
  const passing = { x: 40, y: 0, targetX: 0, targetY: 0, departedAt: new Date(t0 - 30000), arrivalAt: new Date(t0 + 10000) };   // à 10 cases de la capitale
  assert.ok(V.seesArmy(vision, passing, t0));
  assert.ok(!V.seesArmy(vision, { ...passing, departedAt: new Date(t0), arrivalAt: new Date(t0 + 40000) }, t0), 'encore à 40 cases');
  // sans tour : visionRangeL1 cases autour des villes (un camp devant la ville se voit) ; sans joueur : aucune requête
  const bare = await V.visionOf({ city: { findMany: async () => [{ x: 0, y: 0, isCapital: true, buildings: [] }] } }, 'p2');
  assert.equal(bare.radius, fx.effectOf('WATCHTOWER', 'visionRangeL1'));
  assert.deepEqual(await V.visionOf({ city: { findMany: async () => assert.fail('aucune requête') } }, null), { cities: [], radius: fx.visionRadius(0) });
});

// ---- 6. Forge : attaque ET défense dans tous les combats ----
test('combat : technologies et Forge de la capitale du joueur (une requête) ; la Forge seule quand on ne passe pas de technologies', async () => {
  let asked = null;
  const db = { city: { findMany: async (q) => { asked = q; return [{ isCapital: true, buildings: [{ key: 'FORGE', level: 20 }] }, { isCapital: false, buildings: [{ key: 'FORGE', level: 5 }] }]; } } };
  const T = require('../../src/utils/techEffects');
  const tech = T.TECHS.find(t => typeof t.effects?.attackBonusPct === 'number');
  const rows = tech ? [{ techKey: tech.key, level: 2 }] : [];
  const pct = await combatPct(db, 'p1', rows);
  assert.equal(asked.where.playerId, 'p1');
  assert.equal(pct.atk, T.techPct(rows, 'attackBonusPct') + 10, 'Forge 20 de la capitale : +10 % d\'attaque');
  assert.equal(pct.def, T.techPct(rows, 'defenseBonusPct') + 10, '… et +10 % de défense');
  assert.deepEqual(await combatPct(db, 'p1', null), { atk: 10, def: 10 });
  assert.deepEqual(await combatPct({ city: { findMany: async () => assert.fail('aucune requête') } }, null, null), { atk: 0, def: 0 });
  assert.deepEqual(combatMult({ atk: 10, def: 5 }), { atk: 1.1, def: 1.05 });
});

test('combat : un camp de plusieurs joueurs (renforts, rassemblement, garnison) — chacun garde sa Forge, moyenne selon les soldats', async () => {
  const forge = { p1: 20, p2: 0, p3: 10 };   // niveau de la Forge de la capitale de chaque joueur
  const asked = [];
  const db = { city: { findMany: async ({ where }) => { asked.push(where.playerId); return [{ isCapital: true, buildings: [{ key: 'FORGE', level: forge[where.playerId] }] }]; } } };
  const army = (ownerId, count) => ({ ownerId, units: [{ unitKey: 'X', count }] });
  // 300 soldats à Forge 20 (+10 %) et 100 renforts sans Forge : +7,5 % pour le camp ; les technologies : celles du meneur
  assert.deepEqual(await combatPct(db, 'p1', null, [army('p1', 100), army('p2', 100), army('p1', 200)]), { atk: 7.5, def: 7.5 });
  assert.deepEqual(asked, ['p1', 'p2'], 'une requête par joueur');
  // le joueur de la ville n'a aucun soldat dans la bataille : sa Forge ne compte pas, celle des renforts oui
  assert.deepEqual(await combatPct(db, 'p2', null, [army('p3', 50)]), { atk: 5, def: 5 });
  // armées sans soldats (héros seul) : aucune Forge
  assert.deepEqual(await combatPct(db, 'p1', null, [army('p1', 0)]), { atk: 0, def: 0 });
});

// ---- 2. Cachette : une quantité fixe de chaque ressource ----
test('pillage d\'un siège : pillagePct % de ce qui dépasse la cachette de la ville, dans la limite de ce que portent les armées', async () => {
  const taken = [];
  const tx = {
    allianceMember: { findMany: async () => [] },
    $queryRaw: async (strings, ...values) => { taken.push(values.slice(1, 5)); return [{ wood: values[1], stone: values[2], iron: values[3], food: values[4] }]; },
    army: { update: async () => ({}) }
  };
  const hidden = fx.hideoutAmount([{ key: 'HIDEOUT', level: 20 }], 'ROME');
  const city = { id: 'c1', buildings: [{ key: 'HIDEOUT', level: 20 }], player: { faction: 'ROME' }, wood: hidden + 10000, stone: hidden - 1, iron: 0, food: hidden + 400 };
  const armies = [{ id: 'a1', ownerId: 'p2', owner: { faction: 'ROME' }, hero: null }];
  const survivors = new Map([['a1', [{ unitKey: 'ROM_CAV_AUXILIAIRE', count: 10000 }]]]);   // de quoi tout porter
  const out = await pillage(tx, city, armies, survivors);
  const pct = config.combat.fall.pillagePct / 100;
  assert.deepEqual(taken[0], [Math.floor(10000 * pct), 0, 0, Math.floor(400 * pct)], 'rien sous la cachette, une part de ce qui dépasse');
  assert.equal(out.taken.wood, Math.floor(10000 * pct));
  // sans cachette : tout le stock est exposé
  taken.length = 0;
  await pillage(tx, { ...city, buildings: [] }, armies, survivors);
  assert.equal(taken[0][0], Math.floor((hidden + 10000) * pct));
});

test('rapport d\'espion : ressources hors cachette (quantité fixe, à la centaine) ; défenses : quantité cachée, Brasserie et Forge de la capitale', async () => {
  const prisma = require('../../src/config/database');
  const S = require('../../src/services/spyService');
  const hidden = fx.hideoutAmount([{ key: 'HIDEOUT', level: 10 }], 'GAUL');
  const city = { id: 'c1', name: 'Alésia', x: 3, y: 4, playerId: 'p2', wallMaxHp: 0, wallStructure: 1, isSieged: false,
    wood: hidden + 1234, stone: hidden - 10, iron: 0, food: hidden + 99, buildings: [{ key: 'HIDEOUT', level: 10 }],
    player: { id: 'p2', name: 'Vercingétorix', faction: 'GAUL', cities: [{ isCapital: true, buildings: [{ key: 'FORGE', level: 10 }, { key: 'GALLIC_BREWERY', level: 4 }] }] } };
  const reports = [];
  const spy = (mission) => ({ id: `s-${mission}`, playerId: 'p1', status: 'OUT', mission, targetCityId: 'c1', departedAt: new Date(Date.now() - 60000), arrivalAt: new Date(Date.now() - 1000), player: { id: 'p1', name: 'César' } });
  let arriving = [];
  const saved = { spy: prisma.spy, city: prisma.city, army: prisma.army, spyReport: prisma.spyReport, notification: prisma.notification };
  Object.assign(prisma, {
    spy: { findMany: async () => arriving, updateMany: async () => ({ count: 1 }), update: async () => ({}) },
    city: { findUnique: async () => city },
    army: { findMany: async () => [] },
    spyReport: { create: async ({ data }) => { reports.push(data); return { id: `r${reports.length}` }; } },
    notification: { create: async () => ({ id: 'n' }) }
  });
  try {
    arriving = [spy('RESOURCES')];
    await S.processSpies(new Date());
    assert.deepEqual(reports[0].resources, { wood: 1200, stone: 0, iron: 0, food: 0 }, 'seulement ce qui dépasse la cachette, à la centaine près');
    arriving = [spy('DEFENSES')];
    reports.length = 0;
    await S.processSpies(new Date());
    const d = reports[0].data.defenses;
    assert.equal(d.hideoutAmount, hidden, 'quantité cachée par ressource (bonus de la Gaule compris)');
    assert.equal(d.hideoutPct, undefined, 'plus de pourcentage');
    assert.equal(d.defenseBonusPct, Math.round(fx.defenseBonusPct([{ key: 'GALLIC_BREWERY', level: 4 }]) + fx.forgeDefensePct([{ key: 'FORGE', level: 10 }])), 'Brasserie et Forge de la capitale');
  } finally { Object.assign(prisma, saved); }
});
