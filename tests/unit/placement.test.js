// Placement des bâtiments (décision du 30 octobre 2026, rapport économie) : capitale seulement, colonies seulement, Douves
// supprimées ; les bâtiments « capitale seulement » valent pour toutes les villes du joueur
require('./_env');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { buildingsData } = require('../../src/config/gamedata');
const fx = require('../../src/utils/buildingEffects');

// Marché et Comptoir de commerce : capitale seulement depuis le 31 octobre 2026 (migration 0032)
const MOVED_TO_CAPITAL = ['MARKET', 'TRADE_OFFICE'];
const CAPITAL = ['RALLY_POINT', 'ACADEMY', 'HEALING_TENT', 'WATCHTOWER', 'BARRACKS', 'STABLE', 'WORKSHOP', 'FORGE', 'EMBASSY', 'TREASURE_CHAMBER', 'HERO_MANSION', 'RESIDENCE',
  'ROMAN_THERMAE', 'GALLIC_BREWERY', 'GREEK_TEMPLE', 'EGYPTIAN_IRRIGATION', 'HUN_WAR_TENT', 'SULTAN_DESERT_OUTPOST', ...MOVED_TO_CAPITAL];
const COLONY = ['MILL', 'BAKERY', 'SAWMILL', 'STONEMASON', 'FOUNDRY', 'GREAT_WAREHOUSE', 'GREAT_SILO', 'GREAT_BARRACKS', 'GREAT_STABLE'];
const EVERYWHERE = ['MAIN_HALL', 'FARM', 'LUMBER', 'QUARRY', 'IRON_MINE', 'WAREHOUSE', 'SILO', 'HIDEOUT', 'WALL'];
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

test('migration 0030 : listes des données d\'alors (Marché partout, Comptoir en colonie), Douves et chantiers supprimés, colonne basePower', () => {
  const sql = fs.readFileSync(path.join(__dirname, '../../prisma/migrations/0030_placement_moat/migration.sql'), 'utf8');
  const lists = [...sql.matchAll(/IN \(([^)]*)\)/g)].map(m => [...m[1].matchAll(/'([A-Z_]+)'/g)].map(x => x[1]));
  const capitalLists = lists.filter(l => l.includes('RALLY_POINT')), colonyLists = lists.filter(l => l.includes('MILL'));
  assert.equal(capitalLists.length, 2);   // chantiers en file, puis bâtiments
  assert.equal(colonyLists.length, 2);
  // la migration 0032 a ensuite réservé le Marché et le Comptoir à la capitale
  for (const l of capitalLists) assert.deepEqual(sorted([...l, ...MOVED_TO_CAPITAL]), sorted(buildingsData.filter(b => fx.capitalOnly(b.key)).map(b => b.key)));
  for (const l of colonyLists) assert.deepEqual(sorted(l), sorted([...buildingsData.filter(b => fx.notInCapital(b.key)).map(b => b.key), 'TRADE_OFFICE']));
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

test('migration 0032 : Bâtiment principal 20, Mur de colonie 15, Marché et Comptoir des colonies retirés, anneau 18 / 12, marchands', () => {
  const sql = fs.readFileSync(path.join(__dirname, '../../prisma/migrations/0032_batiments/migration.sql'), 'utf8');
  const config = require('../../src/config');
  const mainHallMax = buildingsData.find(b => b.key === 'MAIN_HALL').maxLevel;
  assert.match(sql, new RegExp(`DELETE FROM "BuildQueueItem" WHERE "buildingKey" = 'MAIN_HALL' AND "targetLevel" > ${mainHallMax};`));
  assert.match(sql, new RegExp(`UPDATE "CityBuilding" SET level = ${mainHallMax} WHERE key = 'MAIN_HALL' AND level > ${mainHallMax};`));
  const wallMax = fx.maxLevelIn('WALL', false);
  assert.equal(wallMax, 15);
  assert.match(sql, new RegExp(`NOT c\\."isCapital" AND q\\."buildingKey" = 'WALL' AND q\\."targetLevel" > ${wallMax};`));
  assert.match(sql, new RegExp(`"wallMaxHp" = ROUND\\(c\\."wallMaxHp" \\* ${wallMax}\\.0 / w\\.level\\)`));
  assert.match(sql, new RegExp(`UPDATE "CityBuilding" b SET level = ${wallMax}\\s+FROM "City" c\\s+WHERE c\\.id = b\\."cityId" AND NOT c\\."isCapital" AND b\\.key = 'WALL' AND b\\.level > ${wallMax};`));
  // Marché et Comptoir des colonies (bâtiments et chantiers) : les bâtiments devenus « capitale seulement »
  const lists = [...sql.matchAll(/IN \(([^)]*)\)/g)].map(m => [...m[1].matchAll(/'([A-Z_]+)'/g)].map(x => x[1])).filter(l => l.length);
  assert.equal(lists.length, 2);
  for (const l of lists) assert.deepEqual(sorted(l), sorted(MOVED_TO_CAPITAL));
  for (const k of MOVED_TO_CAPITAL) assert.ok(fx.capitalOnly(k), k);
  // anneau : les limites de la configuration, le Mur et les champs ne bougent pas
  assert.match(sql, new RegExp(`CASE WHEN "isCapital" THEN ${config.city.ringSlots.capital} ELSE ${config.city.ringSlots.colony} END AS n`));
  assert.match(sql, new RegExp(`WHERE p\\.slot > lim\\.n AND p\\.slot < ${config.city.wallSlot}`));
  assert.match(sql, /UPDATE "BuildQueueItem" q SET slot = mv\.new FROM moves mv/, 'les chantiers suivent leur bâtiment');
  // marchands : offres avec armée annulées (marchandises rendues), colonnes des marchands en route
  assert.match(sql, /ALTER TABLE "MarketOffer" ADD COLUMN IF NOT EXISTS "merchants" INTEGER NOT NULL DEFAULT 0;/);
  assert.match(sql, /ALTER TABLE "MarketOffer" DROP COLUMN "armyId";/);
  assert.match(sql, /UPDATE "Army" SET status = 'IDLE', "missionType" = NULL WHERE status = 'MARKET';/);
  for (const col of ['"kind" TEXT NOT NULL DEFAULT \'ROUTE\'', '"merchants" INTEGER NOT NULL DEFAULT 0', '"deliveredAt" TIMESTAMP\\(3\\)', '"returnAt" TIMESTAMP\\(3\\)']) assert.match(sql, new RegExp(`ALTER TABLE "TradeConvoy" ADD COLUMN IF NOT EXISTS ${col};`), col);
  assert.match(sql, /ALTER TABLE "TradeConvoy" ALTER COLUMN "returnAt" SET NOT NULL;/);
  assert.match(sql, /CREATE INDEX IF NOT EXISTS "TradeConvoy_returnAt_idx" ON "TradeConvoy"\("returnAt"\);/);
  assert.doesNotMatch(sql, /TRUNCATE|DROP TABLE/);
});

test('effets « capitale seulement » : une colonie lit ceux de sa capitale, garde les siens pour le reste', () => {
  const colony = [{ key: 'MARKET', level: 4 }, { key: 'TRADE_OFFICE', level: 10 }, { key: 'FORGE', level: 3 }, { key: 'MILL', level: 2 }];   // d'avant les migrations
  const capital = [{ key: 'FORGE', level: 20 }, { key: 'SULTAN_DESERT_OUTPOST', level: 10 }, { key: 'EGYPTIAN_IRRIGATION', level: 8 }, { key: 'MARKET', level: 6 }];
  const b = fx.withCapital(colony, capital);
  assert.equal(fx.forgeDefensePct(b), 10);   // Forge 20 de la capitale
  assert.equal(fx.transportBonusPct(b), 6 * 5 + 10);   // Marché et Poste du désert de la capitale ; rien de la colonie
  assert.equal(fx.marchSpeedBonusPct(b), 4);
  assert.equal(fx.levelOf(b, 'MILL'), 2, 'le Moulin reste celui de la colonie');
  // include Prisma : seuls les bâtiments « capitale seulement » sont chargés
  assert.deepEqual(sorted(fx.CAPITAL_BUILDINGS.select.buildings.where.key.in), sorted(CAPITAL));
  assert.deepEqual(fx.capitalOf({ cities: [{ buildings: capital }] }), capital);
});

// ---- client : fiches et armées lisent les bâtiments « capitale seulement » dans la capitale ----
const vm = require('vm');
let acorn = null;
try { acorn = require('acorn'); } catch (e) { /* acorn vient avec eslint (dépendance de dev) */ }
const FRONT = path.join(__dirname, '..', '..', 'frontend', 'js', 'app');
// les déclarations de premier niveau d'un fichier du client qui portent ces noms
function pick(file, names) {
  const code = fs.readFileSync(path.join(FRONT, file), 'utf8');
  const found = new Map();
  for (const node of acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'script' }).body) {
    const name = node.type === 'FunctionDeclaration' ? node.id.name : node.type === 'VariableDeclaration' ? node.declarations[0].id.name : null;
    if (names.includes(name)) found.set(name, code.slice(node.start, node.end));
  }
  assert.deepEqual([...found.keys()].sort(), [...names].sort());
  return [...found.values()].join('\n');
}
function clientContext(cities, currentCity) {
  const sheets = [];
  const ctx = {
    window: { buildingsData }, buildingsData, unitsData: [], player: { faction: 'ROME' }, cities, currentCity, sheets,
    openSheetModal: (title, html) => sheets.push(html), sheetBuildingGallery: () => '', infoBtnHtml: () => '', buildingIconHtml: () => '',
    unitIconHtml: () => '', resIconHtml: () => '', escapeHtml: (s) => String(s), formatNum: String, formatDuration: () => '', getBuildingName: (k) => k,
    getBuildingDescription: () => '', getBuildingEffect: () => '', getBuildCost: () => ({ wood: 0, stone: 0, iron: 0, food: 0 }), getBuildTime: () => 0,
    showToast: () => {}, showTab: () => {}
  };
  vm.createContext(ctx);
  vm.runInContext(pick('01-core.js', ['effectBuildings', 'buildingEffectOf', 'levelIn', 'buildingMaxLevelIn', 'buildingCapIn', 'hideoutAmountAt', 'factionBonusPct', 'lerpExp']), ctx);
  vm.runInContext(pick('06b-research.js', ['fmtTechPct']), ctx);
  vm.runInContext(pick('04-buildings-render.js', ['merchantsAt', 'allianceMaxMembersAt']), ctx);
  vm.runInContext(pick('10b-sheets.js', ['SHEET_FACTION_NAMES', 'SHEET_CATEGORY_NAMES', 'SHEET_RULES', 'sheetKey', 'sheetUnits', 'sheetBuildings', 'buildingFunctions', 'sheetFunctionsHtml', 'showBuildingInfoModal']), ctx);
  vm.runInContext(pick('07-army.js', ['maxArmiesAtRallyLevel', 'rallyPointLevel', 'rallyMaxArmiesAt', 'getMaxArmies']), ctx);
  return ctx;
}

test('client : une colonie lit la Place de rassemblement, la Forge et les prérequis réservés à la capitale dans la capitale', { skip: acorn ? false : 'acorn absent' }, () => {
  const capital = { id: 'c0', name: 'Roma', isCapital: true, buildings: [{ key: 'MAIN_HALL', slot: 0, level: 20 }, { key: 'BARRACKS', slot: 1, level: 20 }, { key: 'RALLY_POINT', slot: 2, level: 10 }, { key: 'FORGE', slot: 3, level: 12 }] };
  const colony = { id: 'c1', name: 'Colonie', isCapital: false, buildings: [{ key: 'MAIN_HALL', slot: 0, level: 12 }, { key: 'RALLY_POINT', slot: 2, level: 1 }] };   // Place d'avant la migration
  const ctx = clientContext([capital, colony], colony);
  assert.equal(ctx.getMaxArmies(), 3);   // Place de rassemblement 10 de la capitale, pas la 1 de la colonie
  // Grande caserne vue d'une colonie : le prérequis Caserne 20 est rempli par la capitale (comme routes/cities.js)
  ctx.showBuildingInfoModal('GREAT_BARRACKS');
  assert.match(ctx.sheets.at(-1), /sheet-chip met">\s*BARRACKS niv\. 20/);
  assert.match(ctx.sheets.at(-1), /les recrues rejoignent la capitale/);
  // Forge vue d'une colonie : la fiche suit celle de la capitale, sans raccourci vers la colonie
  ctx.showBuildingInfoModal('FORGE');
  assert.match(ctx.sheets.at(-1), /Dans votre capitale Roma : niveau 12/);
  assert.match(ctx.sheets.at(-1), /Capitale seulement/);
  assert.doesNotMatch(ctx.sheets.at(-1), /Voir dans la ville/);
  // vu de la capitale, un bâtiment des colonies ne se construit pas là
  ctx.currentCity = capital;
  ctx.showBuildingInfoModal('MILL');
  assert.match(ctx.sheets.at(-1), /Se construit dans une colonie, pas dans la capitale/);
  assert.match(ctx.sheets.at(-1), /Colonies seulement/);
});
