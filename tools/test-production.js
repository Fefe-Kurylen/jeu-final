/**
 * TEST PRODUCTION - Vérifie les nouvelles valeurs L1/L10/L20
 * et les bonus des bâtiments
 */

const fs = require('fs');
const path = require('path');

// Chargement des données
const buildingsData = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../data/buildings.json'), 'utf-8')
).buildings;

console.log('═══════════════════════════════════════════════════════════════');
console.log('  TEST PRODUCTION - Imperium Antiquitas');
console.log('═══════════════════════════════════════════════════════════════\n');

// ═══════════════════════════════════════════════════════════════════════════
// INTERPOLATION PIECEWISE (L1 → L10 → L20)
// ═══════════════════════════════════════════════════════════════════════════

function lerpExp(a, b, t) {
  if (a <= 0 || b <= 0) return a + (b - a) * t;
  return a * Math.pow(b / a, Math.max(0, Math.min(1, t)));
}

function getProdAtLevel(L1, L10, L20, level) {
  if (level <= 1) return L1;
  if (level >= 20) return L20;

  if (L10) {
    // Piecewise: L1→L10 puis L10→L20
    if (level <= 10) {
      const t = (level - 1) / 9; // 0 à 1 sur niveaux 1-10
      return Math.round(lerpExp(L1, L10, t));
    } else {
      const t = (level - 10) / 10; // 0 à 1 sur niveaux 10-20
      return Math.round(lerpExp(L10, L20, t));
    }
  } else {
    // Simple: L1→L20
    const t = (level - 1) / 19;
    return Math.round(lerpExp(L1, L20, t));
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST 1: BÂTIMENTS DE RESSOURCES
// ═══════════════════════════════════════════════════════════════════════════

console.log('1. PRODUCTION DES BÂTIMENTS DE RESSOURCES');
console.log('─────────────────────────────────────────────────────────────────\n');

const resourceBuildings = ['FARM', 'LUMBER', 'QUARRY', 'IRON_MINE'];
const resourceNames = {
  'FARM': { name: 'Ferme', resource: 'Céréales', key: 'foodProd' },
  'LUMBER': { name: 'Bûcheron', resource: 'Bois', key: 'woodProd' },
  'QUARRY': { name: 'Carrière', resource: 'Pierre', key: 'stoneProd' },
  'IRON_MINE': { name: 'Mine de fer', resource: 'Fer', key: 'ironProd' }
};

for (const buildingKey of resourceBuildings) {
  const def = buildingsData.find(b => b.key === buildingKey);
  const info = resourceNames[buildingKey];
  const effects = def.effects;

  const L1 = effects[info.key + 'L1'];
  const L10 = effects[info.key + 'L10'];
  const L20 = effects[info.key + 'L20'];

  console.log(`${info.name} (${info.resource}):`);
  console.log(`  Valeurs JSON: L1=${L1}, L10=${L10 || 'N/A'}, L20=${L20}`);
  console.log('  Production par niveau:');

  const levels = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
  const prods = levels.map(l => getProdAtLevel(L1, L10, L20, l));

  console.log('  Niv: ' + levels.map(l => l.toString().padStart(5)).join(' '));
  console.log('  /h:  ' + prods.map(p => p.toString().padStart(5)).join(' '));
  console.log('');
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST 2: BÂTIMENTS DE BONUS
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n2. BÂTIMENTS DE BONUS DE PRODUCTION');
console.log('─────────────────────────────────────────────────────────────────\n');

const bonusBuildings = ['MILL', 'BAKERY', 'SAWMILL', 'STONEMASON', 'FOUNDRY'];

for (const buildingKey of bonusBuildings) {
  const def = buildingsData.find(b => b.key === buildingKey);
  const effects = def.effects;

  // Find bonus keys
  const bonusKey = Object.keys(effects).find(k => k.includes('BonusPct'));
  if (bonusKey) {
    const baseKey = bonusKey.replace(/L\d+$/, '');
    const L1 = effects[baseKey + 'L1'];
    const maxLevel = def.maxLevel;
    const LMax = effects[baseKey + 'L' + maxLevel];

    console.log(`${def.name} (max niv.${maxLevel}):`);
    console.log(`  Bonus: +${L1}% (L1) → +${LMax}% (L${maxLevel})`);

    // Calculate bonus per level
    const bonuses = [];
    for (let l = 1; l <= maxLevel; l++) {
      const t = (l - 1) / (maxLevel - 1);
      const bonus = Math.round((L1 + (LMax - L1) * t) * 10) / 10;
      bonuses.push(`L${l}:+${bonus}%`);
    }
    console.log(`  ${bonuses.join(', ')}`);
    console.log('');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST 3: SIMULATION PRODUCTION TOTALE
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n3. SIMULATION PRODUCTION TOTALE (1 de chaque bâtiment)');
console.log('─────────────────────────────────────────────────────────────────\n');

function simulateProduction(farmLevel, lumberLevel, quarryLevel, ironLevel, bonusLevels) {
  const farmDef = buildingsData.find(b => b.key === 'FARM').effects;
  const lumberDef = buildingsData.find(b => b.key === 'LUMBER').effects;
  const quarryDef = buildingsData.find(b => b.key === 'QUARRY').effects;
  const ironDef = buildingsData.find(b => b.key === 'IRON_MINE').effects;

  let foodProd = getProdAtLevel(farmDef.foodProdL1, farmDef.foodProdL10, farmDef.foodProdL20, farmLevel);
  let woodProd = getProdAtLevel(lumberDef.woodProdL1, lumberDef.woodProdL10, lumberDef.woodProdL20, lumberLevel);
  let stoneProd = getProdAtLevel(quarryDef.stoneProdL1, quarryDef.stoneProdL10, quarryDef.stoneProdL20, quarryLevel);
  let ironProd = getProdAtLevel(ironDef.ironProdL1, ironDef.ironProdL10, ironDef.ironProdL20, ironLevel);

  // Apply bonuses
  if (bonusLevels.mill > 0) {
    const millDef = buildingsData.find(b => b.key === 'MILL').effects;
    const millBonus = millDef.foodProdBonusPctL1 + (millDef.foodProdBonusPctL5 - millDef.foodProdBonusPctL1) * (bonusLevels.mill - 1) / 4;
    foodProd = Math.round(foodProd * (1 + millBonus / 100));
  }
  if (bonusLevels.bakery > 0) {
    const bakeryDef = buildingsData.find(b => b.key === 'BAKERY').effects;
    const bakeryBonus = bakeryDef.foodProdBonusPctL1 + (bakeryDef.foodProdBonusPctL5 - bakeryDef.foodProdBonusPctL1) * (bonusLevels.bakery - 1) / 4;
    foodProd = Math.round(foodProd * (1 + bakeryBonus / 100));
  }
  if (bonusLevels.sawmill > 0) {
    const sawmillDef = buildingsData.find(b => b.key === 'SAWMILL').effects;
    const sawmillBonus = sawmillDef.woodProdBonusPctL1 + (sawmillDef.woodProdBonusPctL5 - sawmillDef.woodProdBonusPctL1) * (bonusLevels.sawmill - 1) / 4;
    woodProd = Math.round(woodProd * (1 + sawmillBonus / 100));
  }
  if (bonusLevels.stonemason > 0) {
    const stonemasonDef = buildingsData.find(b => b.key === 'STONEMASON').effects;
    const stonemasonBonus = stonemasonDef.stoneProdBonusPctL1 + (stonemasonDef.stoneProdBonusPctL5 - stonemasonDef.stoneProdBonusPctL1) * (bonusLevels.stonemason - 1) / 4;
    stoneProd = Math.round(stoneProd * (1 + stonemasonBonus / 100));
  }
  if (bonusLevels.foundry > 0) {
    const foundryDef = buildingsData.find(b => b.key === 'FOUNDRY').effects;
    const foundryBonus = foundryDef.ironProdBonusPctL1 + (foundryDef.ironProdBonusPctL5 - foundryDef.ironProdBonusPctL1) * (bonusLevels.foundry - 1) / 4;
    ironProd = Math.round(ironProd * (1 + foundryBonus / 100));
  }

  return { food: foodProd, wood: woodProd, stone: stoneProd, iron: ironProd };
}

// Test différents scénarios
const scenarios = [
  { name: 'Début de jeu (tout niv.1)', levels: [1,1,1,1], bonus: {mill:0, bakery:0, sawmill:0, stonemason:0, foundry:0} },
  { name: 'Mi-jeu (tout niv.10)', levels: [10,10,10,10], bonus: {mill:0, bakery:0, sawmill:0, stonemason:0, foundry:0} },
  { name: 'Mi-jeu + bonus max', levels: [10,10,10,10], bonus: {mill:5, bakery:5, sawmill:5, stonemason:5, foundry:5} },
  { name: 'Fin de jeu (tout niv.20)', levels: [20,20,20,20], bonus: {mill:0, bakery:0, sawmill:0, stonemason:0, foundry:0} },
  { name: 'Fin de jeu + bonus max', levels: [20,20,20,20], bonus: {mill:5, bakery:5, sawmill:5, stonemason:5, foundry:5} },
];

for (const scenario of scenarios) {
  const prod = simulateProduction(...scenario.levels, scenario.bonus);
  const total = prod.food + prod.wood + prod.stone + prod.iron;

  console.log(`${scenario.name}:`);
  console.log(`  Céréales: ${prod.food}/h | Bois: ${prod.wood}/h | Pierre: ${prod.stone}/h | Fer: ${prod.iron}/h`);
  console.log(`  TOTAL: ${total}/h (${total * 24}/jour)`);

  if (scenario.bonus.mill > 0) {
    console.log(`  Bonus appliqués: Moulin+Boulangerie +50% céréales, Scierie/Tailleur/Fonderie +25%`);
  }
  console.log('');
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST 4: VÉRIFICATION VALEURS ATTENDUES
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n4. VÉRIFICATION DES VALEURS ATTENDUES');
console.log('─────────────────────────────────────────────────────────────────\n');

let errors = 0;

// Check L1 = 10 for all resource buildings
for (const key of resourceBuildings) {
  const def = buildingsData.find(b => b.key === key);
  const info = resourceNames[key];
  const L1 = def.effects[info.key + 'L1'];

  if (L1 !== 10) {
    console.log(`❌ ${info.name}: L1 = ${L1} (attendu: 10)`);
    errors++;
  } else {
    console.log(`✅ ${info.name}: L1 = ${L1}`);
  }
}

// Check L10 = 350 for all resource buildings
for (const key of resourceBuildings) {
  const def = buildingsData.find(b => b.key === key);
  const info = resourceNames[key];
  const L10 = def.effects[info.key + 'L10'];

  if (L10 !== 350) {
    console.log(`❌ ${info.name}: L10 = ${L10} (attendu: 350)`);
    errors++;
  } else {
    console.log(`✅ ${info.name}: L10 = ${L10}`);
  }
}

// Check L20 = 4500 for all resource buildings
for (const key of resourceBuildings) {
  const def = buildingsData.find(b => b.key === key);
  const info = resourceNames[key];
  const L20 = def.effects[info.key + 'L20'];

  if (L20 !== 4500) {
    console.log(`❌ ${info.name}: L20 = ${L20} (attendu: 4500)`);
    errors++;
  } else {
    console.log(`✅ ${info.name}: L20 = ${L20}`);
  }
}

// Check bonus buildings: L1 = 5%, L5 = 25%
for (const key of bonusBuildings) {
  const def = buildingsData.find(b => b.key === key);
  const effects = def.effects;
  const bonusKey = Object.keys(effects).find(k => k.includes('BonusPctL1'));

  if (bonusKey) {
    const baseKey = bonusKey.replace('L1', '');
    const L1 = effects[baseKey + 'L1'];
    const L5 = effects[baseKey + 'L5'];

    if (L1 !== 5) {
      console.log(`❌ ${def.name}: bonus L1 = ${L1}% (attendu: 5%)`);
      errors++;
    } else {
      console.log(`✅ ${def.name}: bonus L1 = ${L1}%`);
    }

    if (L5 !== 25) {
      console.log(`❌ ${def.name}: bonus L5 = ${L5}% (attendu: 25%)`);
      errors++;
    } else {
      console.log(`✅ ${def.name}: bonus L5 = ${L5}%`);
    }
  }
}

console.log('\n═══════════════════════════════════════════════════════════════');
if (errors === 0) {
  console.log('  ✅ TOUTES LES VALEURS SONT CORRECTES');
} else {
  console.log(`  ❌ ${errors} ERREUR(S) DÉTECTÉE(S)`);
}
console.log('═══════════════════════════════════════════════════════════════\n');
