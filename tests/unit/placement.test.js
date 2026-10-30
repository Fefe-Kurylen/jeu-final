// Placement des bâtiments (décision du 30 octobre 2026, rapport économie) : capitale seulement, colonies seulement, Douves
// supprimées ; les bâtiments « capitale seulement » valent pour toutes les villes du joueur
require('./_env');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { buildingsData } = require('../../src/config/gamedata');
const fx = require('../../src/utils/buildingEffects');

const CAPITAL = ['RALLY_POINT', 'ACADEMY', 'HEALING_TENT', 'WATCHTOWER', 'BARRACKS', 'STABLE', 'WORKSHOP', 'FORGE', 'EMBASSY', 'TREASURE_CHAMBER', 'HERO_MANSION', 'RESIDENCE',
  'ROMAN_THERMAE', 'GALLIC_BREWERY', 'GREEK_TEMPLE', 'EGYPTIAN_IRRIGATION', 'HUN_WAR_TENT', 'SULTAN_DESERT_OUTPOST'];
const COLONY = ['MILL', 'BAKERY', 'SAWMILL', 'STONEMASON', 'FOUNDRY', 'TRADE_OFFICE', 'GREAT_WAREHOUSE', 'GREAT_SILO', 'GREAT_BARRACKS', 'GREAT_STABLE'];
const EVERYWHERE = ['MAIN_HALL', 'FARM', 'LUMBER', 'QUARRY', 'IRON_MINE', 'MARKET', 'WAREHOUSE', 'SILO', 'HIDEOUT', 'WALL'];
const sorted = (a) => [...a].sort();

test('le tableau du propriétaire : capitale seulement, colonies seulement, partout ; plus de Douves', () => {
  assert.equal(buildingsData.find(b => b.key === 'MOAT'), undefined);
  assert.deepEqual(sorted(buildingsData.map(b => b.key)), sorted([...CAPITAL, ...COLONY, ...EVERYWHERE]));
  for (const k of CAPITAL) assert.ok(fx.capitalOnly(k) && !fx.notInCapital(k), k);
  for (const k of COLONY) assert.ok(fx.notInCapital(k) && !fx.capitalOnly(k), k);
  for (const k of EVERYWHERE) assert.ok(!fx.capitalOnly(k) && !fx.notInCapital(k), k);
  // aucun prérequis impossible : un bâtiment de la capitale n'attend jamais un bâtiment réservé aux colonies
  for (const b of buildingsData.filter(x => fx.capitalOnly(x.key))) for (const p of b.prereq || []) assert.ok(!fx.notInCapital(p.key), `${b.key} ← ${p.key}`);
});

test('migration 0030 : mêmes listes que les données, Douves et chantiers supprimés, colonne basePower', () => {
  const sql = fs.readFileSync(path.join(__dirname, '../../prisma/migrations/0030_placement_moat/migration.sql'), 'utf8');
  const lists = [...sql.matchAll(/IN \(([^)]*)\)/g)].map(m => [...m[1].matchAll(/'([A-Z_]+)'/g)].map(x => x[1]));
  const capitalLists = lists.filter(l => l.includes('RALLY_POINT')), colonyLists = lists.filter(l => l.includes('MILL'));
  assert.equal(capitalLists.length, 2);   // chantiers en file, puis bâtiments
  assert.equal(colonyLists.length, 2);
  for (const l of capitalLists) assert.deepEqual(sorted(l), sorted(buildingsData.filter(b => fx.capitalOnly(b.key)).map(b => b.key)));
  for (const l of colonyLists) assert.deepEqual(sorted(l), sorted(buildingsData.filter(b => fx.notInCapital(b.key)).map(b => b.key)));
  assert.match(sql, /DELETE FROM "BuildQueueItem" WHERE "buildingKey" = 'MOAT'/);
  assert.match(sql, /DELETE FROM "CityBuilding" WHERE key = 'MOAT'/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS "basePower" DOUBLE PRECISION;/);
  // plafonds recalculés comme cityStorageCaps : Dépôt et Silo de 1 200 (niveau 1) à 160 000 (niveau 20)
  for (const k of ['WAREHOUSE', 'SILO']) {
    const e = buildingsData.find(b => b.key === k).effects;
    assert.deepEqual([e[k === 'SILO' ? 'foodStorageL1' : 'storageL1'], e[k === 'SILO' ? 'foodStorageL20' : 'storageL20']], [1200, 160000], k);
  }
  assert.match(sql, /ROUND\(1200 \* POWER\(160000\.0 \/ 1200, \(b\.level - 1\) \/ 19\.0\)\)/);
});

test('effets « capitale seulement » : une colonie lit ceux de sa capitale, garde les siens pour le reste', () => {
  const colony = [{ key: 'MARKET', level: 4 }, { key: 'TRADE_OFFICE', level: 10 }, { key: 'FORGE', level: 3 }];   // Forge d'avant la migration
  const capital = [{ key: 'FORGE', level: 20 }, { key: 'SULTAN_DESERT_OUTPOST', level: 10 }, { key: 'EGYPTIAN_IRRIGATION', level: 8 }];
  const b = fx.withCapital(colony, capital);
  assert.equal(fx.defenseBonusPct(b), 10);   // Forge 20 de la capitale
  assert.equal(fx.transportBonusPct(b), 4 * 5 + 10 + 10);   // Marché et Comptoir de la colonie, Poste du désert de la capitale
  assert.equal(fx.marchSpeedBonusPct(b), 4);
  // include Prisma : seuls les bâtiments « capitale seulement » de la capitale sont chargés
  assert.deepEqual(sorted(fx.CAPITAL_BUILDINGS.select.buildings.where.key.in), sorted(CAPITAL));
  assert.deepEqual(fx.capitalOf({ cities: [{ buildings: capital }] }), capital);
});
