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

function generateTribeDefenders(level, isGold = false, resourcePercent = 1.0) {
  const faction = FACTIONS_LIST[Math.floor(Math.random() * FACTIONS_LIST.length)];
  const factionUnits = FACTION_UNITS[faction];

  const units = {};
  let totalSoldiers;

  if (level === 1) {
    totalSoldiers = Math.max(10, Math.floor(100 * resourcePercent));
  } else if (level === 2) {
    totalSoldiers = Math.max(60, Math.floor(600 * resourcePercent));
  } else {
    totalSoldiers = Math.max(150, Math.floor(1500 * resourcePercent));
  }

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

  const basePower = isGold ? 140 : 100;
  const power = basePower * level * (totalSoldiers / 100);

  return { power, units, faction };
}

module.exports = {
  FACTIONS_LIST,
  FACTION_UNITS,
  generateTribeDefenders
};
