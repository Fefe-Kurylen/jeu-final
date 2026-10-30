// Camps (tribus, Immortels) au combat, stockage des villes, Irrigation : sans base de données (transactions simulées)
require('./_env');
// une base injoignable : aucune requête réelle ne peut partir d'ici
process.env.DATABASE_URL = 'postgresql://unit:unit@127.0.0.1:1/unit';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Prisma } = require('@prisma/client');
const { unitsData } = require('../../src/config/gamedata');
const { calculateArmyPower } = require('../../src/utils/calculations');
const { generateTribeDefenders, campUnits, campPower, campBonusPct } = require('../../src/utils/tribeDefenders');
const { resolveCombat } = require('../../src/services/combatService');
const { resolveTribeCombat, cityMarchPct } = require('../../src/services/armyService');

// Transaction simulée : enregistre les écritures, répond vide aux lectures
function fakeTx() {
  const writes = [];
  const model = (name) => ({
    findMany: async () => [], findUnique: async () => null, findFirst: async () => null,
    create: async ({ data }) => { writes.push([name, 'create', data]); return { id: `${name}-1`, ...data }; },
    update: async (q) => { writes.push([name, 'update', q]); return {}; },
    updateMany: async (q) => { writes.push([name, 'updateMany', q]); return { count: 1 }; },
    delete: async (q) => { writes.push([name, 'delete', q]); return {}; },
    deleteMany: async (q) => { writes.push([name, 'deleteMany', q]); return { count: 1 }; },
    upsert: async (q) => { writes.push([name, 'upsert', q]); return {}; }
  });
  const tx = new Proxy({ writes }, { get: (t, k) => (k in t ? t[k] : k === '$executeRawUnsafe' || k === '$executeRaw' ? async () => 0 : (t[k] = model(k))) });
  return tx;
}

const keyOf = (faction, cls, tier) => unitsData.find(u => u.faction === faction && u.class === cls && u.tier === tier).key;

test('camp : chaque unité porte son palier, clés anciennes converties', () => {
  const elite = keyOf('SULTAN', 'INFANTRY', 'elite'), inter = keyOf('ROME', 'ARCHER', 'intermediate');
  const units = campUnits({ [elite]: 5, [inter]: 3, warrior: 2, [keyOf('ROME', 'INFANTRY', 'base')]: 0 });
  assert.deepEqual(units.map(u => [u.unitKey, u.tier, u.count]), [[elite, 'elite', 5], [inter, 'intermediate', 3], ['GRE_INF_HOPLITE', 'intermediate', 2]]);
  assert.equal(campBonusPct('GOLD'), 40);
  assert.equal(campBonusPct('WOOD'), 0);
});

test('camp d\'or : puissance affichée × 1,4, la même que celle du combat', () => {
  const t = generateTribeDefenders(3, true, 1, 'GAUL');
  const plain = calculateArmyPower(campUnits(t.units), unitsData);
  assert.equal(t.power, Math.round(plain * 1.4));
  assert.equal(t.power, campPower(t.units, 'GOLD'));
  // le combat voit la même puissance que la carte : paliers et bonus d'or
  const r = resolveCombat([{ unitKey: keyOf('ROME', 'INFANTRY', 'base'), tier: 'base', count: 1 }], campUnits(t.units), 0, null, null, { defenseBonusPct: campBonusPct('GOLD') });
  assert.ok(Math.abs(r.defenderPower - t.power) <= 1, `${r.defenderPower} ~ ${t.power}`);
});

test('resolveTribeCombat : Immortels d\'élite et camp d\'or combattent avec la puissance affichée', async () => {
  // Immortels : unités d'élite du Sultanat (wonderService.immortalUnits)
  const immortals = { [keyOf('SULTAN', 'INFANTRY', 'elite')]: 40, [keyOf('SULTAN', 'ARCHER', 'elite')]: 30, [keyOf('SULTAN', 'CAVALRY', 'elite')]: 20 };
  const army = { id: 'a1', cityId: null, heroId: null, hero: null, owner: { name: 'Test', faction: 'GREEK' }, units: [{ id: 'u1', unitKey: keyOf('GREEK', 'INFANTRY', 'base'), tier: 'base', count: 10 }] };
  const node = { id: 'n1', x: 3, y: 4, resourceType: 'PLAN', hasDefenders: true, defenderUnits: immortals, defenderPower: campPower(immortals, 'PLAN') };
  const r = await resolveTribeCombat(army, node, 'p1', fakeTx());
  assert.equal(r.success, false);
  assert.ok(Math.abs(r.combatResult.defenderPower - node.defenderPower) <= 1, `élite au combat : ${r.combatResult.defenderPower} ~ ${node.defenderPower}`);

  // camp d'or : une armée qui battrait le camp sans le bonus d'or perd contre lui (+40 %)
  const camp = { [keyOf('HUN', 'INFANTRY', 'base')]: 100 };
  const campPlain = campPower(camp, 'WOOD');
  const atkKey = keyOf('HUN', 'INFANTRY', 'base');
  const n = Math.ceil(campPlain * 1.2 / calculateArmyPower([{ unitKey: atkKey, tier: 'base', count: 1 }], unitsData));
  const mk = () => ({ id: 'a2', cityId: null, heroId: null, hero: null, owner: { name: 'Test', faction: 'HUN' }, units: [{ id: 'u2', unitKey: atkKey, tier: 'base', count: n }] });
  const wood = await resolveTribeCombat(mk(), { id: 'n2', x: 0, y: 0, resourceType: 'WOOD', hasDefenders: true, defenderUnits: camp, defenderPower: campPlain }, 'p1', fakeTx());
  assert.equal(wood.success, true, 'bat le camp de bois');
  const tx = fakeTx();
  const gold = await resolveTribeCombat(mk(), { id: 'n3', x: 0, y: 0, resourceType: 'GOLD', hasDefenders: true, defenderUnits: camp, defenderPower: campPower(camp, 'GOLD') }, 'p1', tx);
  assert.equal(gold.success, false, 'repoussé par le camp d\'or');
  assert.ok(Math.abs(gold.combatResult.defenderPower - campPower(camp, 'GOLD')) <= 1);
  // le camp garde ses survivants, sa puissance affichée reste celle du combat
  const upd = tx.writes.find(([m, op]) => m === 'resourceNode' && op === 'update');
  assert.equal(upd[2].data.defenderPower, campPower(upd[2].data.defenderUnits, 'GOLD'));
});

test('Irrigation : vitesse de marche de la ville, lue une fois si les bâtiments ne sont pas chargés', async () => {
  assert.equal(await cityMarchPct(null, null), 0);
  assert.equal(await cityMarchPct(null, { id: 'c', buildings: [{ key: 'EGYPTIAN_IRRIGATION', level: 20 }] }), 10);
  let asked = null;
  const db = { cityBuilding: { findMany: async (q) => { asked = q; return [{ key: 'EGYPTIAN_IRRIGATION', level: 10 }]; } } };
  assert.equal(await cityMarchPct(db, { id: 'c2' }), 5);
  assert.equal(asked.where.cityId, 'c2');
  assert.equal(asked.where.key, 'EGYPTIAN_IRRIGATION');
});

test('stockage au démarrage : Grand dépôt et Grand silo comptent dans maxStorage / maxFoodStorage', async () => {
  const prisma = require('../../src/config/database');
  const { syncAllCityStorage } = require('../../src/game/processors/buildProcessor');
  let sql = null;
  const real = prisma.$executeRaw;
  prisma.$executeRaw = async (strings, ...values) => { sql = Prisma.sql(strings, ...values); return 0; };
  try { await syncAllCityStorage(); } finally { prisma.$executeRaw = real; }
  assert.ok(sql, 'requête construite, jamais envoyée');
  const vals = sql.values;
  for (const key of ['WAREHOUSE', 'GREAT_WAREHOUSE', 'SILO', 'GREAT_SILO']) assert.ok(vals.includes(key), key);
  // ligne (clé, niveau, capacité, sorte) du Grand dépôt niveau 20
  const i = vals.findIndex((v, k) => v === 'GREAT_WAREHOUSE' && vals[k + 1] === 20);
  assert.deepEqual(vals.slice(i, i + 4), ['GREAT_WAREHOUSE', 20, 480000, 'storage']);
  assert.match(sql.sql, /t\(key, level, cap, kind\)/);
});
