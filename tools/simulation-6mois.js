/**
 * SIMULATION 6 MOIS - Imperium Antiquitas
 * Vérifie l'équilibrage des 39 bâtiments et la progression du joueur
 */

const fs = require('fs');
const path = require('path');

// ═══════════════════════════════════════════════════════════════════════════
// CHARGEMENT DES DONNÉES DU JEU
// ═══════════════════════════════════════════════════════════════════════════

const buildingsData = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../data/buildings.json'), 'utf-8')
).buildings;

console.log(`✅ ${buildingsData.length} bâtiments chargés`);

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const CONFIG = {
  TICK_SEC: 30,
  SIM_DAYS: 180, // 6 mois
  SIM_HOURS: 180 * 24, // 4320 heures

  // Production curves (L1 → L20)
  PROD_L1: 20,
  PROD_L20: 1193195, // Selon buildings.json

  // Storage capacity
  STORAGE_L1: 1200,
  STORAGE_L20: 160000,

  // Upkeep per hour per unit
  UPKEEP: { base: 5, intermediate: 10, elite: 15, siege: 15 },

  // Starting resources
  START_RES: { wood: 500, stone: 500, iron: 500, food: 500 },

  // Maximum build queue
  MAX_BUILD_QUEUE: 2,
  MAX_RECRUIT_QUEUE: 3,

  // Faction
  FACTION: 'ROME'
};

const TICK_HOURS = CONFIG.TICK_SEC / 3600;
const TICKS_PER_HOUR = 3600 / CONFIG.TICK_SEC;
const TOTAL_TICKS = CONFIG.SIM_HOURS * TICKS_PER_HOUR;

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function lerpExp(a, b, t) {
  if (a <= 0 || b <= 0) return a + (b - a) * t;
  return a * Math.pow(b / a, Math.max(0, Math.min(1, t)));
}

function getBuildingDef(key) {
  return buildingsData.find(b => b.key === key);
}

function getProdAtLevel(key, level) {
  const def = getBuildingDef(key);
  if (!def) return 0;

  const maxLevel = def.maxLevel || 20;
  const t = (level - 1) / (maxLevel - 1);

  // Get production from effects
  const effects = def.effects || {};

  if (effects.woodProdL1 && effects.woodProdL20) {
    return Math.round(lerpExp(effects.woodProdL1, effects.woodProdL20, t));
  }
  if (effects.stoneProdL1 && effects.stoneProdL20) {
    return Math.round(lerpExp(effects.stoneProdL1, effects.stoneProdL20, t));
  }
  if (effects.ironProdL1 && effects.ironProdL20) {
    return Math.round(lerpExp(effects.ironProdL1, effects.ironProdL20, t));
  }
  if (effects.foodProdL1 && effects.foodProdL20) {
    return Math.round(lerpExp(effects.foodProdL1, effects.foodProdL20, t));
  }

  return 0;
}

function getStorageAtLevel(key, level) {
  const def = getBuildingDef(key);
  if (!def) return 0;

  const effects = def.effects || {};
  const maxLevel = def.maxLevel || 20;
  const t = (level - 1) / (maxLevel - 1);

  if (effects.storageL1 && effects.storageL20) {
    return Math.round(lerpExp(effects.storageL1, effects.storageL20, t));
  }
  if (effects.foodStorageL1 && effects.foodStorageL20) {
    return Math.round(lerpExp(effects.foodStorageL1, effects.foodStorageL20, t));
  }

  return 0;
}

function getBuildCost(key, level) {
  const def = getBuildingDef(key);
  if (!def) return { wood: 999999, stone: 999999, iron: 999999, food: 999999 };

  const costL1 = def.costL1 || { wood: 100, stone: 100, iron: 100, food: 100 };
  const maxLevel = def.maxLevel || 20;
  const costMax = def[`costL${maxLevel}`] || def.costL20 || def.costL5 || costL1;

  const t = (level - 1) / (maxLevel - 1);

  return {
    wood: Math.round(lerpExp(costL1.wood || 0, costMax.wood || 0, t)),
    stone: Math.round(lerpExp(costL1.stone || 0, costMax.stone || 0, t)),
    iron: Math.round(lerpExp(costL1.iron || 0, costMax.iron || 0, t)),
    food: Math.round(lerpExp(costL1.food || 0, costMax.food || 0, t))
  };
}

function getBuildTime(key, level) {
  const def = getBuildingDef(key);
  if (!def) return 3600;

  const timeL1 = def.timeL1Sec || 60;
  const maxLevel = def.maxLevel || 20;
  const timeMax = def[`timeL${maxLevel}Sec`] || def.timeL20Sec || def.timeL5Sec || timeL1 * 100;

  const t = (level - 1) / (maxLevel - 1);
  return Math.round(lerpExp(timeL1, timeMax, t));
}

function checkPrereqs(key, cityBuildings) {
  const def = getBuildingDef(key);
  if (!def || !def.prereq) return true;

  for (const prereq of def.prereq) {
    const building = cityBuildings.find(b => b.key === prereq.key);
    if (!building || building.level < prereq.level) return false;
  }
  return true;
}

function fmt(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return Math.round(n).toString();
}

function fmtTime(sec) {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}j ${h}h`;
  if (h > 0) return `${h}h${m}m`;
  return `${m}m`;
}

// ═══════════════════════════════════════════════════════════════════════════
// GAME STATE
// ═══════════════════════════════════════════════════════════════════════════

const city = {
  name: 'Roma Prima',
  faction: CONFIG.FACTION,
  res: { ...CONFIG.START_RES },
  maxRes: { wood: 1200, stone: 1200, iron: 1200, food: 1200 },
  buildings: [
    { key: 'MAIN_HALL', level: 1, slot: 0 },
    { key: 'FARM', level: 1, slot: 1, prod: 'food' },
    { key: 'LUMBER', level: 1, slot: 2, prod: 'wood' },
    { key: 'QUARRY', level: 1, slot: 3, prod: 'stone' },
    { key: 'IRON_MINE', level: 1, slot: 4, prod: 'iron' },
    { key: 'WAREHOUSE', level: 1, slot: 5 },
    { key: 'SILO', level: 1, slot: 6 },
  ],
  army: { base: 0, intermediate: 0, elite: 0, siege: 0 },
  buildQueue: [],
  recruitQueue: [],
  gold: 0
};

const stats = {
  produced: { wood: 0, stone: 0, iron: 0, food: 0 },
  consumed: { wood: 0, stone: 0, iron: 0, food: 0 },
  recruited: { base: 0, intermediate: 0, elite: 0, siege: 0 },
  buildingsCompleted: 0,
  buildingsBuilt: {},
  peakArmy: 0,
  shortages: 0,
  goldProduced: 0,
  maxBuildingLevel: 1,
  unlockedBuildings: new Set(['MAIN_HALL', 'FARM', 'LUMBER', 'QUARRY', 'IRON_MINE', 'WAREHOUSE', 'SILO'])
};

let tick = 0;
let nextSlot = 7;

// ═══════════════════════════════════════════════════════════════════════════
// GAME FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function getBuilding(key) {
  return city.buildings.find(b => b.key === key);
}

function armySize() {
  const a = city.army;
  return a.base + a.intermediate + a.elite + a.siege;
}

function upkeepPerHour() {
  const a = city.army;
  const U = CONFIG.UPKEEP;
  return a.base * U.base + a.intermediate * U.intermediate +
         a.elite * U.elite + a.siege * U.siege;
}

function prodPerHour(type) {
  let total = 0;
  for (const b of city.buildings) {
    if (b.prod === type) {
      total += getProdAtLevel(b.key, b.level);
    }
  }

  // Apply production bonuses
  if (type === 'food') {
    const mill = getBuilding('MILL');
    const bakery = getBuilding('BAKERY');
    if (mill) total *= 1 + (mill.level * 4) / 100;
    if (bakery) total *= 1 + (bakery.level * 4) / 100;
  }
  if (type === 'wood') {
    const sawmill = getBuilding('SAWMILL');
    if (sawmill) total *= 1 + (sawmill.level * 5) / 100;
  }
  if (type === 'stone') {
    const stonemason = getBuilding('STONEMASON');
    if (stonemason) total *= 1 + (stonemason.level * 5) / 100;
  }
  if (type === 'iron') {
    const foundry = getBuilding('FOUNDRY');
    if (foundry) total *= 1 + (foundry.level * 5) / 100;
  }

  return total;
}

function foodBalance() {
  return prodPerHour('food') - upkeepPerHour();
}

function updateMaxStorage() {
  const warehouse = getBuilding('WAREHOUSE');
  const silo = getBuilding('SILO');
  const greatWarehouse = getBuilding('GREAT_WAREHOUSE');
  const greatSilo = getBuilding('GREAT_SILO');

  let baseStorage = 1200;
  if (warehouse) baseStorage = getStorageAtLevel('WAREHOUSE', warehouse.level);
  if (greatWarehouse) baseStorage += getStorageAtLevel('GREAT_WAREHOUSE', greatWarehouse.level);

  let foodStorage = 1200;
  if (silo) foodStorage = getStorageAtLevel('SILO', silo.level);
  if (greatSilo) foodStorage += getStorageAtLevel('GREAT_SILO', greatSilo.level);

  city.maxRes = {
    wood: baseStorage,
    stone: baseStorage,
    iron: baseStorage,
    food: foodStorage
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// TICK FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function tickProduction() {
  for (const type of ['wood', 'stone', 'iron', 'food']) {
    const gain = prodPerHour(type) * TICK_HOURS;
    const before = city.res[type];
    city.res[type] = Math.min(before + gain, city.maxRes[type]);
    stats.produced[type] += city.res[type] - before;
  }

  // Gold production from Treasure Chamber
  const treasury = getBuilding('TREASURE_CHAMBER');
  if (treasury) {
    const goldPerDay = 10 + (treasury.level - 1) * 10;
    const goldGain = (goldPerDay / 24) * TICK_HOURS;
    city.gold += goldGain;
    stats.goldProduced += goldGain;
  }
}

function tickUpkeep() {
  const cost = upkeepPerHour() * TICK_HOURS;
  city.res.food -= cost;
  stats.consumed.food += cost;
  if (city.res.food < 0) {
    stats.shortages++;
    city.res.food = 0;
  }
}

function tickConstruction() {
  const now = tick * CONFIG.TICK_SEC;

  for (const q of city.buildQueue.filter(x => x.endsAt <= now)) {
    let b = getBuilding(q.key);
    if (b) {
      b.level = q.targetLevel;
    } else {
      // New building
      city.buildings.push({ key: q.key, level: q.targetLevel, slot: nextSlot++ });
      stats.unlockedBuildings.add(q.key);
    }

    stats.buildingsCompleted++;
    stats.buildingsBuilt[q.key] = (stats.buildingsBuilt[q.key] || 0) + 1;

    if (q.targetLevel > stats.maxBuildingLevel) {
      stats.maxBuildingLevel = q.targetLevel;
    }

    updateMaxStorage();
  }
  city.buildQueue = city.buildQueue.filter(x => x.endsAt > now);
}

function tickRecruitment() {
  const now = tick * CONFIG.TICK_SEC;

  for (const q of city.recruitQueue.filter(x => x.endsAt <= now)) {
    city.army[q.tier] += q.count;
    stats.recruited[q.tier] += q.count;
  }
  city.recruitQueue = city.recruitQueue.filter(x => x.endsAt > now);

  const total = armySize();
  if (total > stats.peakArmy) stats.peakArmy = total;
}

// ═══════════════════════════════════════════════════════════════════════════
// AI DECISIONS
// ═══════════════════════════════════════════════════════════════════════════

function aiConstruction() {
  if (city.buildQueue.length >= CONFIG.MAX_BUILD_QUEUE) return;

  const now = tick * CONFIG.TICK_SEC;
  const r = city.res;
  const mainLevel = getBuilding('MAIN_HALL')?.level || 1;

  // Priority based on current needs
  const foodBal = foodBalance();

  // List of buildings to consider, by priority
  const priorities = [];

  // Always try to upgrade production if food balance is ok
  if (foodBal < 50) {
    priorities.push('FARM');
    priorities.push('MILL');
  }

  // Resource production
  priorities.push('IRON_MINE', 'LUMBER', 'QUARRY', 'FARM');

  // Storage
  priorities.push('WAREHOUSE', 'SILO');

  // Main hall for unlocking
  priorities.push('MAIN_HALL');

  // Military
  if (mainLevel >= 3) priorities.push('RALLY_POINT', 'BARRACKS');
  if (mainLevel >= 5) priorities.push('FORGE', 'STABLE');
  if (mainLevel >= 10) priorities.push('ACADEMY', 'WORKSHOP');

  // Advanced buildings
  if (mainLevel >= 10) {
    priorities.push('TREASURE_CHAMBER', 'EMBASSY', 'WATCHTOWER');
  }

  // Production bonus buildings
  const lumber = getBuilding('LUMBER');
  const quarry = getBuilding('QUARRY');
  const ironMine = getBuilding('IRON_MINE');
  const farm = getBuilding('FARM');

  if (lumber?.level >= 10) priorities.push('SAWMILL');
  if (quarry?.level >= 10) priorities.push('STONEMASON');
  if (ironMine?.level >= 10) priorities.push('FOUNDRY');
  if (farm?.level >= 5) priorities.push('MILL');
  if (farm?.level >= 10 && getBuilding('MILL')?.level >= 5) priorities.push('BAKERY');

  // Faction building
  if (mainLevel >= 10) {
    if (city.faction === 'ROME') priorities.push('ROMAN_THERMAE');
    if (city.faction === 'GAUL') priorities.push('GALLIC_BREWERY');
    if (city.faction === 'GREEK') priorities.push('GREEK_TEMPLE');
    if (city.faction === 'EGYPT') priorities.push('EGYPTIAN_IRRIGATION');
    if (city.faction === 'HUN') priorities.push('HUN_WAR_TENT');
    if (city.faction === 'SULTAN') priorities.push('SULTAN_DESERT_OUTPOST');
  }

  // Try to build/upgrade
  for (const key of priorities) {
    if (city.buildQueue.some(q => q.key === key)) continue;

    const def = getBuildingDef(key);
    if (!def) continue;

    // Check prereqs
    if (!checkPrereqs(key, city.buildings)) continue;

    const existing = getBuilding(key);
    const currentLevel = existing?.level || 0;
    const targetLevel = currentLevel + 1;

    if (targetLevel > (def.maxLevel || 20)) continue;

    // Check faction restriction
    if (def.faction && def.faction !== city.faction) continue;

    const cost = getBuildCost(key, targetLevel);

    if (r.wood >= cost.wood && r.stone >= cost.stone &&
        r.iron >= cost.iron && r.food >= cost.food) {

      const duration = getBuildTime(key, targetLevel);

      city.buildQueue.push({
        key,
        targetLevel,
        endsAt: now + duration
      });

      r.wood -= cost.wood;
      r.stone -= cost.stone;
      r.iron -= cost.iron;
      r.food -= cost.food;

      stats.consumed.wood += cost.wood;
      stats.consumed.stone += cost.stone;
      stats.consumed.iron += cost.iron;
      stats.consumed.food += cost.food;

      break;
    }
  }
}

function aiRecruitment() {
  if (city.recruitQueue.length >= CONFIG.MAX_RECRUIT_QUEUE) return;

  const now = tick * CONFIG.TICK_SEC;
  const r = city.res;
  const foodBal = foodBalance();

  // Only recruit if positive food balance
  if (foodBal < 50 || r.food < 1000) return;

  const barracks = getBuilding('BARRACKS');
  const stable = getBuilding('STABLE');

  if (!barracks || barracks.level < 1) return;

  // Decide tier based on barracks level
  let tier = 'base';
  let count = 10;

  if (barracks.level >= 15 && r.iron > 10000) { tier = 'elite'; count = 3; }
  else if (barracks.level >= 9 && r.iron > 5000) { tier = 'intermediate'; count = 5; }

  // Unit costs (simplified)
  const unitCosts = {
    base: { wood: 30, stone: 20, iron: 50, food: 20 },
    intermediate: { wood: 54, stone: 36, iron: 90, food: 36 },
    elite: { wood: 96, stone: 64, iron: 160, food: 64 }
  };

  const cost = unitCosts[tier];
  const totalCost = {
    wood: cost.wood * count,
    stone: cost.stone * count,
    iron: cost.iron * count,
    food: cost.food * count
  };

  if (r.wood >= totalCost.wood && r.stone >= totalCost.stone &&
      r.iron >= totalCost.iron && r.food >= totalCost.food) {

    const duration = { base: 60, intermediate: 120, elite: 180 }[tier] * count;

    city.recruitQueue.push({ tier, count, endsAt: now + duration });

    r.wood -= totalCost.wood;
    r.stone -= totalCost.stone;
    r.iron -= totalCost.iron;
    r.food -= totalCost.food;

    stats.consumed.wood += totalCost.wood;
    stats.consumed.stone += totalCost.stone;
    stats.consumed.iron += totalCost.iron;
    stats.consumed.food += totalCost.food;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SIMULATION
// ═══════════════════════════════════════════════════════════════════════════

function runTick() {
  tickProduction();
  tickUpkeep();
  tickConstruction();
  tickRecruitment();
  aiConstruction();
  aiRecruitment();
  tick++;
}

function printState(label) {
  const r = city.res;
  const a = city.army;

  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  ${label}`);
  console.log(`${'═'.repeat(70)}`);

  console.log(`\n  📦 RESSOURCES`);
  console.log(`     Bois:     ${fmt(r.wood).padStart(10)} / ${fmt(city.maxRes.wood).padStart(10)}  (+${fmt(prodPerHour('wood'))}/h)`);
  console.log(`     Pierre:   ${fmt(r.stone).padStart(10)} / ${fmt(city.maxRes.stone).padStart(10)}  (+${fmt(prodPerHour('stone'))}/h)`);
  console.log(`     Fer:      ${fmt(r.iron).padStart(10)} / ${fmt(city.maxRes.iron).padStart(10)}  (+${fmt(prodPerHour('iron'))}/h)`);
  console.log(`     Nourrit.: ${fmt(r.food).padStart(10)} / ${fmt(city.maxRes.food).padStart(10)}  (+${fmt(prodPerHour('food'))}/h)`);
  console.log(`     Balance nourriture: ${foodBalance() >= 0 ? '+' : ''}${fmt(foodBalance())}/h`);
  if (city.gold > 0) console.log(`     Or:       ${fmt(city.gold).padStart(10)}`);

  console.log(`\n  ⚔️ ARMÉE (${armySize()} unités)`);
  console.log(`     BASE: ${a.base}  INTER: ${a.intermediate}  ELITE: ${a.elite}  SIEGE: ${a.siege}`);
  console.log(`     Upkeep: ${fmt(upkeepPerHour())}/h`);

  console.log(`\n  🏛️ BÂTIMENTS (${city.buildings.length})`);
  const sorted = [...city.buildings].sort((a, b) => b.level - a.level);
  for (const b of sorted.slice(0, 10)) {
    const prod = b.prod ? ` → +${fmt(getProdAtLevel(b.key, b.level))}/h ${b.prod}` : '';
    console.log(`     ${b.key.padEnd(20)} Lv.${b.level.toString().padStart(2)}${prod}`);
  }
  if (sorted.length > 10) console.log(`     ... et ${sorted.length - 10} autres`);

  if (city.buildQueue.length > 0) {
    console.log(`\n  🔨 EN CONSTRUCTION (${city.buildQueue.length})`);
    for (const q of city.buildQueue) {
      const remaining = Math.max(0, q.endsAt - tick * CONFIG.TICK_SEC);
      console.log(`     ${q.key.padEnd(20)} → Lv.${q.targetLevel} (${fmtTime(remaining)})`);
    }
  }
}

function printStats() {
  const p = stats.produced;
  const c = stats.consumed;

  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  📊 STATISTIQUES FINALES - 6 MOIS (${CONFIG.SIM_DAYS} jours)`);
  console.log(`${'═'.repeat(70)}`);

  console.log(`\n  💰 PRODUCTION TOTALE`);
  console.log(`     Bois:     ${fmt(p.wood).padStart(12)}`);
  console.log(`     Pierre:   ${fmt(p.stone).padStart(12)}`);
  console.log(`     Fer:      ${fmt(p.iron).padStart(12)}`);
  console.log(`     Nourrit.: ${fmt(p.food).padStart(12)}`);
  console.log(`     Or:       ${fmt(stats.goldProduced).padStart(12)}`);

  console.log(`\n  📉 CONSOMMATION TOTALE`);
  console.log(`     Bois:     ${fmt(c.wood).padStart(12)}`);
  console.log(`     Pierre:   ${fmt(c.stone).padStart(12)}`);
  console.log(`     Fer:      ${fmt(c.iron).padStart(12)}`);
  console.log(`     Nourrit.: ${fmt(c.food).padStart(12)}`);

  console.log(`\n  🏗️ CONSTRUCTION`);
  console.log(`     Bâtiments complétés: ${stats.buildingsCompleted}`);
  console.log(`     Niveau max atteint:  ${stats.maxBuildingLevel}`);
  console.log(`     Types débloqués:     ${stats.unlockedBuildings.size} / 39`);

  console.log(`\n  ⚔️ RECRUTEMENT`);
  console.log(`     Total recruté: ${stats.recruited.base + stats.recruited.intermediate + stats.recruited.elite + stats.recruited.siege}`);
  console.log(`       - Base:         ${stats.recruited.base}`);
  console.log(`       - Intermédiaire:${stats.recruited.intermediate}`);
  console.log(`       - Elite:        ${stats.recruited.elite}`);
  console.log(`       - Siège:        ${stats.recruited.siege}`);
  console.log(`     Pic d'armée:      ${stats.peakArmy}`);

  console.log(`\n  ⚠️ ALERTES`);
  console.log(`     Pénuries nourriture: ${stats.shortages}`);

  console.log(`\n  📋 BÂTIMENTS CONSTRUITS (top 10)`);
  const buildingStats = Object.entries(stats.buildingsBuilt)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  for (const [key, count] of buildingStats) {
    console.log(`     ${key.padEnd(25)} x${count} améliorations`);
  }

  console.log(`\n  🏛️ BÂTIMENTS DÉBLOQUÉS (${stats.unlockedBuildings.size})`);
  console.log(`     ${[...stats.unlockedBuildings].join(', ')}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// VÉRIFICATION DES BÂTIMENTS
// ═══════════════════════════════════════════════════════════════════════════

function verifyBuildings() {
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  🔍 VÉRIFICATION DES 39 BÂTIMENTS`);
  console.log(`${'═'.repeat(70)}`);

  let errors = 0;
  let warnings = 0;

  for (const b of buildingsData) {
    const issues = [];

    // Check required fields
    if (!b.key) issues.push('❌ Clé manquante');
    if (!b.name) issues.push('❌ Nom manquant');
    if (!b.maxLevel) issues.push('⚠️ maxLevel manquant');
    if (!b.costL1) issues.push('❌ costL1 manquant');
    if (!b.timeL1Sec) issues.push('⚠️ timeL1Sec manquant');

    // Check costs are positive
    if (b.costL1) {
      for (const [res, val] of Object.entries(b.costL1)) {
        if (val < 0) issues.push(`❌ costL1.${res} négatif`);
      }
    }

    // Check prereqs reference valid buildings
    if (b.prereq) {
      for (const p of b.prereq) {
        const prereqBuilding = buildingsData.find(x => x.key === p.key);
        if (!prereqBuilding) {
          issues.push(`❌ Prérequis invalide: ${p.key}`);
        }
      }
    }

    // Check faction buildings have faction field
    if (b.category === 'FACTION' && !b.faction) {
      issues.push('⚠️ Bâtiment de faction sans champ faction');
    }

    if (issues.length > 0) {
      console.log(`\n  ${b.key || 'INCONNU'}`);
      for (const issue of issues) {
        console.log(`     ${issue}`);
        if (issue.startsWith('❌')) errors++;
        if (issue.startsWith('⚠️')) warnings++;
      }
    }
  }

  console.log(`\n  RÉSULTAT: ${errors} erreurs, ${warnings} avertissements`);
  return errors === 0;
}

// ═══════════════════════════════════════════════════════════════════════════
// RUN
// ═══════════════════════════════════════════════════════════════════════════

console.log(`\n${'═'.repeat(70)}`);
console.log(`  🎮 SIMULATION 6 MOIS - Imperium Antiquitas`);
console.log(`  📅 ${CONFIG.SIM_DAYS} jours | Tick: ${CONFIG.TICK_SEC}s | Total: ${TOTAL_TICKS} ticks`);
console.log(`  🏛️ Faction: ${CONFIG.FACTION}`);
console.log(`${'═'.repeat(70)}`);

// Verify buildings first
const valid = verifyBuildings();

if (!valid) {
  console.log('\n❌ Des erreurs ont été trouvées dans les bâtiments. Corrigez-les avant de continuer.');
  process.exit(1);
}

const startTime = Date.now();

printState('📍 ÉTAT INITIAL (Jour 0)');

// Checkpoints: 1 semaine, 1 mois, 3 mois, 6 mois
const checkpoints = [7, 30, 90, 180];
let cpIdx = 0;

for (let i = 0; i < TOTAL_TICKS; i++) {
  runTick();
  const day = (tick * CONFIG.TICK_SEC) / 86400;

  if (cpIdx < checkpoints.length && day >= checkpoints[cpIdx]) {
    printState(`📍 JOUR ${checkpoints[cpIdx]} (${checkpoints[cpIdx] < 30 ? checkpoints[cpIdx] + ' jours' : (checkpoints[cpIdx] / 30).toFixed(0) + ' mois'})`);
    cpIdx++;
  }

  // Progress indicator every 10%
  if (i % Math.floor(TOTAL_TICKS / 10) === 0) {
    process.stdout.write(`\r  Simulation: ${Math.round(i / TOTAL_TICKS * 100)}%`);
  }
}

console.log(`\r  Simulation: 100%`);

const elapsed = Date.now() - startTime;

printStats();

console.log(`\n${'═'.repeat(70)}`);
console.log(`  ⚡ PERFORMANCE`);
console.log(`     Temps réel:  ${elapsed}ms`);
console.log(`     Ticks/sec:   ${Math.round(TOTAL_TICKS / (elapsed / 1000))}`);
console.log(`     Ratio:       ${(CONFIG.SIM_DAYS * 86400 / (elapsed / 1000)).toFixed(0)}x temps réel`);
console.log(`${'═'.repeat(70)}\n`);
