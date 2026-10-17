// ========== BUILDING EFFECTS (data-driven) ==========
// Every effect a building sells in data/buildings.json that the server applies lives here, so the
// server and the client (frontend/js/app/04-buildings-render.js) read the same numbers.
const { buildingsData } = require('../config/gamedata');
const { lerpExp } = require('./calculations');

const defOf = (key) => buildingsData.find(b => b.key === key);
const effectOf = (key, name, fallback = 0) => { const v = defOf(key)?.effects?.[name]; return typeof v === 'number' ? v : fallback; };
const levelOf = (buildings, key) => (buildings || []).reduce((m, b) => (b.key === key && b.level > m ? b.level : m), 0);
const cap = (v, max) => Math.max(0, Math.min(max, v));

// Σ level × pct over the given buildings, capped (percent)
function sumPct(buildings, keys, effectName, maxPct) {
  let total = 0;
  for (const key of keys) total += levelOf(buildings, key) * effectOf(key, effectName);
  return cap(total, maxPct);
}

// Value of a (L1, L20) effect pair at a level, on the same exponential curve as storage
function curve(key, prefix, level) {
  if (level <= 0) return 0;
  const L1 = effectOf(key, prefix + 'L1'), L20 = effectOf(key, prefix + 'L20', L1);
  if (level >= 20) return L20;
  return Math.round(lerpExp(L1, L20, (level - 1) / 19));
}

const TRAIN_BUILDINGS = { INFANTRY: ['BARRACKS', 'GREAT_BARRACKS'], ARCHER: ['BARRACKS', 'GREAT_BARRACKS'], CAVALRY: ['STABLE', 'GREAT_STABLE'], SIEGE: ['WORKSHOP'] };

const effects = {
  // Construction time: Main Hall 2.5 %/level, Academy 1 %, Residence 0.25 % (max 60 %)
  buildTimeReductionPct: (buildings) => sumPct(buildings, ['MAIN_HALL', 'ACADEMY', 'RESIDENCE'], 'buildTimeReductionPctPerLevel', 60),
  // Training time of a unit class: the buildings that train it (max 60 %)
  trainTimeReductionPct: (buildings, unitClass) => sumPct(buildings, TRAIN_BUILDINGS[unitClass] || ['BARRACKS'], 'trainTimeReductionPctPerLevel', 60),
  // City defence: Forge 0.5 %/level everywhere, Gallic Brewery 1 %/level (max 50 %)
  defenseBonusPct: (buildings) => cap(levelOf(buildings, 'FORGE') * effectOf('FORGE', 'globalDefenseBonusPctPerLevel') + levelOf(buildings, 'GALLIC_BREWERY') * effectOf('GALLIC_BREWERY', 'siegeDefenseBonusPctPerLevel'), 50),
  // Resources a raid can never take: Great Warehouse (wood/stone/iron) and Great Silo (food)
  protectedStorage: (buildings) => {
    const w = curve('GREAT_WAREHOUSE', 'protectedStorage', levelOf(buildings, 'GREAT_WAREHOUSE'));
    return { wood: w, stone: w, iron: w, food: curve('GREAT_SILO', 'protectedFoodStorage', levelOf(buildings, 'GREAT_SILO')) };
  },
  // Treasure Chamber: gold per day
  goldPerDay: (buildings) => curve('TREASURE_CHAMBER', 'goldProdPerDay', levelOf(buildings, 'TREASURE_CHAMBER')),
  goldPerDayAtLevel: (level) => curve('TREASURE_CHAMBER', 'goldProdPerDay', level),
  // Upkeep: Hun War Tent and Sultan Desert Outpost 0.5 %/level (max 50 %)
  upkeepReductionPct: (buildings) => sumPct(buildings, ['HUN_WAR_TENT', 'SULTAN_DESERT_OUTPOST'], 'upkeepReductionPctPerLevel', 50),
  // Global production: Egyptian Irrigation 1 %/level (max 50 %)
  productionBonusPct: (buildings) => sumPct(buildings, ['EGYPTIAN_IRRIGATION'], 'globalProductionBonusPctPerLevel', 50),
  // Carrying capacity of convoys: Market 5 %/level, Trade Office 1 %/level
  transportBonusPct: (buildings) => cap(levelOf(buildings, 'MARKET') * effectOf('MARKET', 'playerTransportBonusPctPerLevel') + levelOf(buildings, 'TRADE_OFFICE') * effectOf('TRADE_OFFICE', 'armyTransportCapacityBonusPctPerLevel'), 200),
  // Field armies allowed by the Rally Point: 1 at L1, 3 at L10, 5 at L20 (one more every 5 levels)
  maxArmies: (buildings) => {
    const level = levelOf(buildings, 'RALLY_POINT');
    if (level <= 0) return 0;
    const pts = defOf('RALLY_POINT')?.effects?.maxArmies || { l1: 1, l10: 3, l20: 5 };
    return Math.min(pts.l20 || 5, (pts.l1 || 1) + Math.floor(level / 5));
  },
  rallyLevelForArmies: (n) => (n <= 1 ? 1 : (n - 1) * 5),
  embassyLevel: (buildings) => levelOf(buildings, 'EMBASSY'),
  allianceCreateLevel: () => effectOf('EMBASSY', 'createAllianceLevel', 7),
  allianceJoinLevel: () => effectOf('EMBASSY', 'joinAllianceLevel', 5),
  watchtowerLevel: (buildings) => levelOf(buildings, 'WATCHTOWER'),
  // Watchtower: a spy is caught with 70 % at level 20, linear below; who/when details unlock by level
  counterSpyChance: (watchtowerLevel) => cap(watchtowerLevel, 20) / 20 * effectOf('WATCHTOWER', 'counterSpyChanceL20', 70) / 100,
  watchtowerShowsAttackerAt: () => effectOf('WATCHTOWER', 'alertArmyWhoWhenLevel', 10),
  watchtowerShowsDetailsAt: () => effectOf('WATCHTOWER', 'alertArmyDetailsLevel', 15),
  watchtowerNamesSpyAt: () => effectOf('WATCHTOWER', 'alertSpyWhoWhenLevel', 15),
  // Wounded: Roman Thermae heal faster and save more, Greek Temple / Hun War Tent turn deaths into wounded
  healTimeReductionPct: (buildings) => sumPct(buildings, ['ROMAN_THERMAE'], 'healTimeReductionPctPerLevel', 60),
  woundedBonusPct: (buildings) => cap(levelOf(buildings, 'ROMAN_THERMAE') * effectOf('ROMAN_THERMAE', 'woundedInsteadOfDeadBonusPctPerLevel') + levelOf(buildings, 'GREEK_TEMPLE') * effectOf('GREEK_TEMPLE', 'deathReductionPctPerLevel') + levelOf(buildings, 'HUN_WAR_TENT') * effectOf('HUN_WAR_TENT', 'deathReductionPctPerLevel'), 30),
  // NPC merchant: 30 % tax at level 1, −1 %/level, never below 5 %
  npcMarketTaxPct: (marketLevel) => Math.max(5, effectOf('MARKET', 'serverMarketTaxPctBase', 30) - Math.max(0, marketLevel - 1) * effectOf('MARKET', 'serverMarketTaxReductionPctPerLevel', 1)),
  // Wall: regenerates 1 % faster per level
  wallRegenBonusPctPerLevel: () => effectOf('WALL', 'wallRegenBonusPctPerLevel', 1),
  // SQL helpers: (key, pctPerLevel) pairs used by the set-based processors
  productionBonusKeys: () => [['EGYPTIAN_IRRIGATION', effectOf('EGYPTIAN_IRRIGATION', 'globalProductionBonusPctPerLevel')]],
  upkeepReductionKeys: () => [['HUN_WAR_TENT', effectOf('HUN_WAR_TENT', 'upkeepReductionPctPerLevel')], ['SULTAN_DESERT_OUTPOST', effectOf('SULTAN_DESERT_OUTPOST', 'upkeepReductionPctPerLevel')]],
  levelOf
};

module.exports = effects;
