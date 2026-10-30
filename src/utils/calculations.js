// ========== SHARED CALCULATIONS ==========
// Single source of truth for game formulas (used by backend AND can be shared with frontend)

const config = require('../config');

// Exponential interpolation between two values
function lerpExp(a, b, t) {
  if (a <= 0 || b <= 0) return a + (b - a) * t;
  return a * Math.pow(b / a, Math.max(0, Math.min(1, t)));
}

// Bâtiments de stockage : dépôts (bois, pierre, fer) et silos (nourriture). Le Grand dépôt et le Grand silo ajoutent
// chacun 3 fois un dépôt ou un silo de même niveau (décision du 30 octobre 2026, façon Travian) ; ils ne protègent rien.
const STORAGE_KEYS = { WAREHOUSE: 'storage', GREAT_WAREHOUSE: 'storage', SILO: 'foodStorage', GREAT_SILO: 'foodStorage' };
const BASE_STORAGE = 1000;   // capacité d'une ville sans dépôt ni silo

// Capacité de stockage donnée par un bâtiment de stockage à un niveau
// Même courbe exponentielle que la production, basée sur effects.storageL1/L20 (foodStorageL1/L20) de buildings.json
function getStorageAtLevel(buildingKey, level, buildingsData) {
  const def = buildingsData.find(b => b.key === buildingKey);
  const prefix = STORAGE_KEYS[buildingKey] || 'storage';
  const L1 = def?.effects?.[prefix + 'L1'] || 1200;
  const L20 = def?.effects?.[prefix + 'L20'] || 160000;
  if (level <= 0) return 0;
  if (level >= 20) return L20;
  return Math.round(lerpExp(L1, L20, (level - 1) / 19));
}

// maxStorage / maxFoodStorage d'une ville d'après ses bâtiments (somme des dépôts, somme des silos, jamais sous 1000)
function cityStorageCaps(buildings, buildingsData = require('../config/gamedata').buildingsData) {
  let storage = 0, foodStorage = 0;
  for (const b of buildings || []) {
    const kind = STORAGE_KEYS[b.key];
    if (!kind) continue;
    const cap = getStorageAtLevel(b.key, b.level, buildingsData);
    if (kind === 'foodStorage') foodStorage += cap; else storage += cap;
  }
  return { maxStorage: Math.max(BASE_STORAGE, storage), maxFoodStorage: Math.max(BASE_STORAGE, foodStorage) };
}

// Get resource production at a given building level
function getProductionAtLevel(buildingKey, level, buildingsData) {
  const def = buildingsData.find(b => b.key === buildingKey);
  if (!def || !def.effects) return level * 30;

  const prodKeys = {
    'FARM': 'foodProd',
    'LUMBER': 'woodProd',
    'QUARRY': 'stoneProd',
    'IRON_MINE': 'ironProd'
  };
  const prodKey = prodKeys[buildingKey];
  if (!prodKey) return 0;

  const L1 = def.effects[prodKey + 'L1'] || 10;
  const L10 = def.effects[prodKey + 'L10'];
  const L20 = def.effects[prodKey + 'L20'] || 4500;

  if (level <= 0) return 0;
  if (level <= 1) return L1;
  if (level >= 20) return L20;

  if (L10) {
    if (level <= 10) {
      const t = (level - 1) / 9;
      return Math.round(lerpExp(L1, L10, t));
    } else {
      const t = (level - 10) / 10;
      return Math.round(lerpExp(L10, L20, t));
    }
  } else {
    const t = (level - 1) / 19;
    return Math.round(lerpExp(L1, L20, t));
  }
}

// Faction bonus helper
function getFactionBonus(faction, bonusType, factionsData) {
  const factionData = factionsData[faction];
  if (!factionData || !factionData.bonuses) return 0;
  const bonus = factionData.bonuses.find(b => b.type === bonusType);
  return bonus ? bonus.value : 0;
}

// City tier based on wall level
// City tier (Village / Ville / Ville Fortifiée) from the Main Hall level: look of the walls, name, siege minimum
function getCityTier(mainHallLevel) {
  const tiers = config.cityTiers;
  for (let i = tiers.length - 1; i >= 0; i--) {
    if (mainHallLevel >= tiers[i].minMainHall) return tiers[i].tier;
  }
  return 1;
}
// Main Hall level of a city from its building rows (never below 1: every city has one)
function mainHallLevelOf(buildings) { return (buildings || []).reduce((m, b) => (b.key === 'MAIN_HALL' && b.level > m ? b.level : m), 1); }

function getCityTierName(tier) {
  const found = config.cityTiers.find(t => t.tier === tier);
  return found ? found.name : 'Village';
}

// Calculate travel time; `distance` is the length of the route actually walked (A* around mountains and
// water, see utils/pathfinding.js) — the straight line is only a fallback
// extraSpeedPct: the player's technologies (Cartographie), in percent
function calculateTravelTime(fromX, fromY, toX, toY, armySpeed = 50, faction = null, factionsData = null, distance = null, extraSpeedPct = 0) {
  if (typeof distance !== 'number' || !(distance >= 0)) distance = Math.sqrt(Math.pow(toX - fromX, 2) + Math.pow(toY - fromY, 2));
  let timePerTile = 30 * (50 / armySpeed);

  if (faction && factionsData) {
    const speedBonus = getFactionBonus(faction, 'armySpeed', factionsData);
    if (speedBonus > 0) {
      timePerTile = timePerTile / (1 + speedBonus / 100);
    }
  }

  if (extraSpeedPct > 0) timePerTile = timePerTile / (1 + extraSpeedPct / 100);

  return Math.max(1, Math.ceil(distance * timePerTile));
}

// Calculate army power ; defMult : multiplicateur de la part défense (bonus de faction « unitDefense »)
function calculateArmyPower(units, unitsData, defMult = 1) {
  const TIER_MULT = config.combat.tierCoefficients;
  return units.reduce((total, u) => {
    const unit = unitsData.find(x => x.key === u.unitKey);
    if (!unit || !unit.stats) return total;
    const mult = TIER_MULT[u.tier] || 1.0;
    const power = ((unit.stats.attack || 0) + (unit.stats.defense || 0) * defMult) * mult * u.count;
    return total + power;
  }, 0);
}

// Count siege engines in an army
function countSiegeEngines(armyUnits, unitsData) {
  let count = 0;
  for (const unit of armyUnits) {
    const unitDef = unitsData.find(u => u.key === unit.unitKey);
    if (unitDef && unitDef.class === 'SIEGE') {
      count += unit.count;
    }
  }
  return count;
}

// Get slowest unit speed in an army
function getArmyMinSpeed(units, unitsData) {
  let minSpeed = 100;
  for (const u of units) {
    const unit = unitsData.find(x => x.key === u.unitKey);
    if (unit && unit.stats && unit.stats.speed < minSpeed) minSpeed = unit.stats.speed;
  }
  return minSpeed;
}

// Hero bonus on a non-combat stat: points, equipment and talents (utils/heroEffects.js)
function heroStatMultiplier(hero, stat) {
  return require('./heroEffects').statMult(hero, stat);
}

// Travel time for a concrete army: slowest unit, owner's faction speed bonus, hero speed bonus
function getArmyTravelTime(units, fromX, fromY, toX, toY, faction, hero = null, distance = null, extraSpeedPct = 0) {
  const { unitsData, factionsData } = require('../config/gamedata');
  const speed = getArmyMinSpeed(units, unitsData) * heroStatMultiplier(hero, 'speed');
  return calculateTravelTime(fromX, fromY, toX, toY, speed, faction, factionsData, distance, extraSpeedPct);
}

// Point reached after `fraction` (0..1) of a route (list of [x, y] tiles)
function pointAlongPath(path, fraction) {
  if (!path || !path.length) return null;
  if (path.length === 1 || fraction <= 0) return { x: path[0][0], y: path[0][1] };
  if (fraction >= 1) { const l = path[path.length - 1]; return { x: l[0], y: l[1] }; }
  let total = 0;
  const seg = [];
  for (let i = 1; i < path.length; i++) { const d = Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]); seg.push(d); total += d; }
  let target = fraction * total;
  for (let i = 1; i < path.length; i++) {
    if (target <= seg[i - 1]) { const t = seg[i - 1] ? target / seg[i - 1] : 0; return { x: path[i - 1][0] + (path[i][0] - path[i - 1][0]) * t, y: path[i - 1][1] + (path[i][1] - path[i - 1][1]) * t }; }
    target -= seg[i - 1];
  }
  const l = path[path.length - 1]; return { x: l[0], y: l[1] };
}

// Carry capacity of an army: units, plus the hero's transport talents (Intendance) when a hero rides with it.
// The hero's logistics stat lowers the army's food upkeep instead (GDD, décision du 29 octobre 2026).
function getArmyCarryCapacity(units, unitsData, hero = null) {
  let total = 0;
  for (const unit of units) {
    const unitData = unitsData.find(u => u.key === unit.unitKey);
    const carryPerUnit = unitData?.stats?.carry || unitData?.stats?.transport || 50;
    total += unit.count * carryPerUnit;
  }
  return Math.floor(total * (1 + require('./heroEffects').talent(hero, 'carryPct') / 100));
}

// Coût et durée d'un niveau de bâtiment (décision du 30 octobre 2026) : les champs coûtent ×1,45 par niveau, le reste
// ×1,28 ; les champs et le Bâtiment principal prennent ×1,30 de temps par niveau, le reste ×1,2. Seul endroit du calcul.
function buildCostFor(buildingDef, level) {
  const B = config.build;
  const base = buildingDef?.costL1 || { wood: 100, stone: 100, iron: 80, food: 50 };
  const growth = (B.fieldCostKeys || []).includes(buildingDef?.key) ? B.fieldCostMultiplier : B.costMultiplierBase;
  const m = Math.pow(growth, Math.max(0, level - 1));
  return { wood: Math.floor((base.wood || 0) * m), stone: Math.floor((base.stone || 0) * m), iron: Math.floor((base.iron || 0) * m), food: Math.floor((base.food || 0) * m) };
}
function buildSecondsFor(buildingDef, level) {
  const B = config.build;
  const growth = (B.slowTimeKeys || []).includes(buildingDef?.key) ? B.slowTimeMultiplier : B.timeMultiplierBase;
  return Math.floor((buildingDef?.timeL1Sec || 60) * Math.pow(growth, Math.max(0, level - 1)));
}

module.exports = {
  buildCostFor, buildSecondsFor,
  mainHallLevelOf,
  lerpExp,
  getProductionAtLevel,
  getStorageAtLevel,
  STORAGE_KEYS,
  BASE_STORAGE,
  cityStorageCaps,
  getFactionBonus,
  getCityTier,
  getCityTierName,
  calculateTravelTime,
  calculateArmyPower,
  countSiegeEngines,
  getArmyTravelTime,
  getArmyCarryCapacity,
  pointAlongPath
};
