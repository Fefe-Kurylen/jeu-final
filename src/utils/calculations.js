// ========== SHARED CALCULATIONS ==========
// Single source of truth for game formulas (used by backend AND can be shared with frontend)

const config = require('../config');

// Exponential interpolation between two values
function lerpExp(a, b, t) {
  if (a <= 0 || b <= 0) return a + (b - a) * t;
  return a * Math.pow(b / a, Math.max(0, Math.min(1, t)));
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
function getCityTier(wallLevel) {
  const tiers = config.cityTiers;
  for (let i = tiers.length - 1; i >= 0; i--) {
    if (wallLevel >= tiers[i].minWall) return tiers[i].tier;
  }
  return 1;
}

function getCityTierName(tier) {
  const found = config.cityTiers.find(t => t.tier === tier);
  return found ? found.name : 'Village';
}

function getMinSiegeEngines(cityTier) {
  const found = config.cityTiers.find(t => t.tier === cityTier);
  return found ? found.minSiege : 1;
}

// Calculate travel time
function calculateTravelTime(fromX, fromY, toX, toY, armySpeed = 50, faction = null, factionsData = null) {
  const distance = Math.sqrt(Math.pow(toX - fromX, 2) + Math.pow(toY - fromY, 2));
  let timePerTile = 30 * (50 / armySpeed);

  if (faction && factionsData) {
    const speedBonus = getFactionBonus(faction, 'armySpeed', factionsData);
    if (speedBonus > 0) {
      timePerTile = timePerTile / (1 + speedBonus / 100);
    }
  }

  return Math.max(1, Math.ceil(distance * timePerTile));
}

// Calculate army power
function calculateArmyPower(units, unitsData) {
  const TIER_MULT = config.combat.tierCoefficients;
  return units.reduce((total, u) => {
    const unit = unitsData.find(x => x.key === u.unitKey);
    if (!unit) return total;
    const mult = TIER_MULT[u.tier] || 1.0;
    const power = (unit.stats.attack + unit.stats.defense) * mult * u.count;
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
    if (unit && unit.stats.speed < minSpeed) minSpeed = unit.stats.speed;
  }
  return minSpeed;
}

// Calculate carry capacity of an army
function getArmyCarryCapacity(units, unitsData) {
  let total = 0;
  for (const unit of units) {
    const unitData = unitsData.find(u => u.key === unit.unitKey);
    const carryPerUnit = unitData?.stats?.carry || unitData?.stats?.transport || 50;
    total += unit.count * carryPerUnit;
  }
  return total;
}

module.exports = {
  lerpExp,
  getProductionAtLevel,
  getFactionBonus,
  getCityTier,
  getCityTierName,
  getMinSiegeEngines,
  calculateTravelTime,
  calculateArmyPower,
  countSiegeEngines,
  getArmyMinSpeed,
  getArmyCarryCapacity
};
