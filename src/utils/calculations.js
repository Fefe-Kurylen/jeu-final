// ========== SHARED CALCULATIONS ==========
// Single source of truth for game formulas (used by backend AND can be shared with frontend)

const config = require('../config');

// Exponential interpolation between two values
function lerpExp(a, b, t) {
  if (a <= 0 || b <= 0) return a + (b - a) * t;
  return a * Math.pow(b / a, Math.max(0, Math.min(1, t)));
}

// Capacité de stockage donnée par un WAREHOUSE (storage) ou SILO (foodStorage) à un niveau
// Même courbe exponentielle que la production, basée sur effects.storageL1/L20 de buildings.json
function getStorageAtLevel(buildingKey, level, buildingsData) {
  const def = buildingsData.find(b => b.key === buildingKey);
  const prefix = buildingKey === 'SILO' ? 'foodStorage' : 'storage';
  const L1 = def?.effects?.[prefix + 'L1'] || 1200;
  const L20 = def?.effects?.[prefix + 'L20'] || 160000;
  if (level <= 0) return 0;
  if (level >= 20) return L20;
  return Math.round(lerpExp(L1, L20, (level - 1) / 19));
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

function getMinSiegeEngines(cityTier) {
  const found = config.cityTiers.find(t => t.tier === cityTier);
  return found ? found.minSiege : 1;
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

// Calculate army power
function calculateArmyPower(units, unitsData) {
  const TIER_MULT = config.combat.tierCoefficients;
  return units.reduce((total, u) => {
    const unit = unitsData.find(x => x.key === u.unitKey);
    if (!unit || !unit.stats) return total;
    const mult = TIER_MULT[u.tier] || 1.0;
    const power = ((unit.stats.attack || 0) + (unit.stats.defense || 0)) * mult * u.count;
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

// Carry capacity of an army (hero logistics bonus when a hero rides with it)
function getArmyCarryCapacity(units, unitsData, hero = null) {
  let total = 0;
  for (const unit of units) {
    const unitData = unitsData.find(u => u.key === unit.unitKey);
    const carryPerUnit = unitData?.stats?.carry || unitData?.stats?.transport || 50;
    total += unit.count * carryPerUnit;
  }
  return Math.floor(total * heroStatMultiplier(hero, 'logistics'));
}

module.exports = {
  mainHallLevelOf,
  lerpExp,
  getProductionAtLevel,
  getStorageAtLevel,
  getFactionBonus,
  getCityTier,
  getCityTierName,
  getMinSiegeEngines,
  calculateTravelTime,
  calculateArmyPower,
  countSiegeEngines,
  getArmyMinSpeed,
  getArmyTravelTime,
  getArmyCarryCapacity,
  heroStatMultiplier,
  pointAlongPath
};
