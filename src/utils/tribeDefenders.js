// ========== TRIBE DEFENDERS ==========
// Single source of truth (was duplicated 3 times in old code)

const FACTIONS_LIST = ['ROME', 'GAUL', 'GREEK', 'EGYPT', 'HUN', 'SULTAN'];

const FACTION_UNITS = {
  ROME: {
    infantry: { base: 'ROM_INF_MILICIEN', intermediate: 'ROM_INF_TRIARII', elite: 'ROM_INF_LEGIONNAIRE' },
    archer: { base: 'ROM_ARC_MILICIEN', intermediate: 'ROM_ARC_VETERAN', elite: 'ROM_ARC_ELITE' },
    cavalry: { base: 'ROM_CAV_AUXILIAIRE', intermediate: 'ROM_CAV_EQUITES', elite: 'ROM_CAV_LOURDE' }
  },
  GAUL: {
    infantry: { base: 'GAU_INF_GUERRIER', intermediate: 'GAU_INF_TRIARII', elite: 'GAU_INF_CHAMPION' },
    archer: { base: 'GAU_ARC_CHASSEUR', intermediate: 'GAU_ARC_GAULOIS', elite: 'GAU_ARC_NOBLE' },
    cavalry: { base: 'GAU_CAV_CHASSEUR', intermediate: 'GAU_CAV_GAULOIS', elite: 'GAU_CAV_NOBLE' }
  },
  GREEK: {
    infantry: { base: 'GRE_INF_JEUNE', intermediate: 'GRE_INF_HOPLITE', elite: 'GRE_INF_SPARTIATE' },
    archer: { base: 'GRE_ARC_PAYSAN', intermediate: 'GRE_ARC_TOXOTE', elite: 'GRE_ARC_ELITE' },
    cavalry: { base: 'GRE_CAV_ECLAIREUR', intermediate: 'GRE_CAV_GREC', elite: 'GRE_CAV_ELITE' }
  },
  EGYPT: {
    infantry: { base: 'EGY_INF_ESCLAVE', intermediate: 'EGY_INF_NIL', elite: 'EGY_INF_TEMPLE' },
    archer: { base: 'EGY_ARC_NIL', intermediate: 'EGY_ARC_DESERT', elite: 'EGY_ARC_PHARAON' },
    cavalry: { base: 'EGY_CAV_DESERT', intermediate: 'EGY_CAV_PHARAON', elite: 'EGY_CAV_CHAR_LOURD' }
  },
  HUN: {
    infantry: { base: 'HUN_INF_NOMADE', intermediate: 'HUN_INF_GARDE', elite: 'HUN_INF_VETERAN' },
    archer: { base: 'HUN_ARC_NOMADE', intermediate: 'HUN_ARC_CAMP', elite: 'HUN_ARC_ELITE' },
    cavalry: { base: 'HUN_CAV_PILLARD', intermediate: 'HUN_CAV_INTER', elite: 'HUN_CAV_ELITE' }
  },
  SULTAN: {
    infantry: { base: 'SUL_INF_DESERT', intermediate: 'SUL_INF_CROISSANT', elite: 'SUL_INF_PALAIS' },
    archer: { base: 'SUL_ARC_DESERT', intermediate: 'SUL_ARC_TIREUR', elite: 'SUL_ARC_PERSE' },
    cavalry: { base: 'SUL_CAV_BEDOUIN', intermediate: 'SUL_CAV_DESERT', elite: 'SUL_CAV_MAMELOUK' }
  }
};

// Soldiers of a camp by level, scaled by the stock left on the node (never below a floor)
const SOLDIERS = { 1: [100, 10], 2: [600, 60], 3: [1500, 150] };
function expectedSoldiers(level, resourcePercent = 1.0) {
  const [full, floor] = SOLDIERS[level] || SOLDIERS[3];
  return Math.max(floor, Math.floor(full * Math.max(0, Math.min(1, resourcePercent))));
}
// Faction of a camp from its unit keys (ROM_… → ROME), null when unknown
const PREFIX = { ROM: 'ROME', GAU: 'GAUL', GRE: 'GREEK', EGY: 'EGYPT', HUN: 'HUN', SUL: 'SULTAN' };
function tribeFactionOf(units) {
  const key = Object.keys(units || {}).find(k => PREFIX[k.slice(0, 3)]);
  return key ? PREFIX[key.slice(0, 3)] : null;
}

// Difficulty of a camp by its distance to the centre of the map: easy near the edges where players start, hard at the
// centre where the game ends (config.map.camps). 1 = the nominal size of the level.
function campDifficultyAt(x, y) {
  const config = require('../config');
  const { difficultyEdge, difficultyCenter } = config.map.camps;
  const d = Math.min(1, Math.hypot(Number(x) || 0, Number(y) || 0) / (config.map.maxCoord || 186));
  return difficultyCenter + (difficultyEdge - difficultyCenter) * d;
}
// Soldiers a camp should have: level × stock left × difficulty of the place (before the ± variation between camps)
function targetSoldiers(level, resourcePercent = 1.0, difficulty = 1) {
  const [, floor] = SOLDIERS[level] || SOLDIERS[3];
  return Math.max(floor, Math.floor(expectedSoldiers(level, resourcePercent) * Math.max(0.1, difficulty)));
}

// Camp d'or : défenseurs plus forts de 40 %, au combat (bonus de défense de resolveCombat) comme dans la puissance affichée
const GOLD_CAMP_BONUS_PCT = 40;
const campBonusPct = (resourceType) => (resourceType === 'GOLD' ? GOLD_CAMP_BONUS_PCT : 0);

// Unités d'un camp (tribu ou Immortels) telles qu'elles combattent : clés anciennes converties, palier de chaque unité
const LEGACY_KEYS = { warrior: 'GRE_INF_HOPLITE', archer: 'GRE_ARC_TOXOTE', cavalry: 'GRE_CAV_GREC', elite: 'GRE_INF_SPARTIATE' };
function campUnits(defenderUnits) {
  const { unitsData } = require('../config/gamedata');
  return Object.entries(defenderUnits || {}).filter(([, count]) => count > 0).map(([key, count]) => {
    const unitKey = LEGACY_KEYS[key] || key;
    return { unitKey, count, tier: unitsData.find(u => u.key === unitKey)?.tier || 'base' };
  });
}

// Puissance d'un camp, sur l'échelle de la puissance d'une armée (GET /api/army/:id -> power) : la carte montre ce que le
// combat utilise
function campPower(defenderUnits, resourceType = null) {
  const { unitsData } = require('../config/gamedata');
  const { calculateArmyPower } = require('./calculations');
  return Math.round(calculateArmyPower(campUnits(defenderUnits), unitsData) * (1 + campBonusPct(resourceType) / 100));
}

// faction: keep the camp's people when it is reinforced; random otherwise. difficulty: campDifficultyAt(x, y) of the node.
// Each camp also varies by ± config.map.camps.variationPct (the « stars » of the GDD).
function generateTribeDefenders(level, isGold = false, resourcePercent = 1.0, faction = null, difficulty = 1) {
  if (!FACTION_UNITS[faction]) faction = FACTIONS_LIST[Math.floor(Math.random() * FACTIONS_LIST.length)];
  const factionUnits = FACTION_UNITS[faction];
  const v = (require('../config').map.camps.variationPct || 0) / 100;
  const variation = 1 - v + Math.random() * 2 * v;

  const units = {};
  const totalSoldiers = Math.max((SOLDIERS[level] || SOLDIERS[3])[1], Math.floor(targetSoldiers(level, resourcePercent, difficulty) * variation));

  const infRatio = 0.25 + Math.random() * 0.2;
  const arcRatio = 0.25 + Math.random() * 0.2;
  const cavRatio = 1 - infRatio - arcRatio;

  if (level === 1) {
    units[factionUnits.infantry.base] = Math.floor(totalSoldiers * infRatio);
    units[factionUnits.archer.base] = Math.floor(totalSoldiers * arcRatio);
    units[factionUnits.cavalry.base] = Math.floor(totalSoldiers * cavRatio);
  } else if (level === 2) {
    const baseCount = Math.floor(totalSoldiers * 0.6);
    const interCount = totalSoldiers - baseCount;

    units[factionUnits.infantry.base] = Math.floor(baseCount * infRatio);
    units[factionUnits.archer.base] = Math.floor(baseCount * arcRatio);
    units[factionUnits.cavalry.base] = Math.floor(baseCount * cavRatio);
    units[factionUnits.infantry.intermediate] = Math.floor(interCount * infRatio);
    units[factionUnits.archer.intermediate] = Math.floor(interCount * arcRatio);
    units[factionUnits.cavalry.intermediate] = Math.floor(interCount * cavRatio);
  } else {
    const baseCount = Math.floor(totalSoldiers * 0.4);
    const interCount = Math.floor(totalSoldiers * 0.35);
    const eliteCount = totalSoldiers - baseCount - interCount;

    units[factionUnits.infantry.base] = Math.floor(baseCount * infRatio);
    units[factionUnits.archer.base] = Math.floor(baseCount * arcRatio);
    units[factionUnits.cavalry.base] = Math.floor(baseCount * cavRatio);
    units[factionUnits.infantry.intermediate] = Math.floor(interCount * infRatio);
    units[factionUnits.archer.intermediate] = Math.floor(interCount * arcRatio);
    units[factionUnits.cavalry.intermediate] = Math.floor(interCount * cavRatio);
    units[factionUnits.infantry.elite] = Math.floor(eliteCount * infRatio);
    units[factionUnits.archer.elite] = Math.floor(eliteCount * arcRatio);
    units[factionUnits.cavalry.elite] = Math.floor(eliteCount * cavRatio);
  }

  return { power: campPower(units, isGold ? 'GOLD' : null), units, faction };
}

module.exports = {
  generateTribeDefenders,
  campUnits,
  campPower,
  campBonusPct,
  expectedSoldiers,
  targetSoldiers,
  campDifficultyAt,
  tribeFactionOf
};
